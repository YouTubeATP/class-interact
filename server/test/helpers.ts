import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { io as connect, type Socket } from 'socket.io-client';
import type { Ack, JoinResponse, PresentationDoc, Snapshot } from '@classinteract/shared';
import { createApp } from '../src/app';
import { loadConfig, type Config } from '../src/config';
import { TEMPLATE_DB } from './globalSetup';

export interface TestContext {
  url: string;
  prisma: PrismaClient;
  app: ReturnType<typeof createApp>;
  config: Config;
  api(path: string, init?: { method?: string; body?: unknown; token?: string; raw?: boolean }): Promise<{ status: number; body: any; text: string }>;
  /** Create a presentation from raw JSON through the real import endpoint and start a session. */
  startSession(doc: unknown, opts?: { collectNames?: boolean; mode?: 'standalone' | 'companion' }): Promise<Session>;
  close(): Promise<void>;
}

export interface Session {
  id: string;
  pin: string;
  presentationId: string;
  presenterToken: string;
  projectorKey: string;
}

export async function createTestContext(overrides: Partial<Config> = {}): Promise<TestContext> {
  const dir = mkdtempSync(join(tmpdir(), 'ci-test-'));
  const dbPath = join(dir, 'test.db');
  copyFileSync(TEMPLATE_DB, dbPath);
  const prisma = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } }, log: [] });
  const config = loadConfig({}, { dataDir: dir, uploadDir: join(dir, 'uploads'), rateLimit: false, secret: 'test-secret', webDist: join(dir, 'none'), ...overrides });
  const app = createApp({ prisma, config });
  await new Promise<void>((ok) => app.server.listen(0, '127.0.0.1', ok));
  const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;

  const api: TestContext['api'] = async (path, init = {}) => {
    const res = await fetch(url + path, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      headers: { ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}), ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const text = await res.text();
    let body: any = null;
    try { body = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, body, text };
  };

  const ctx: TestContext = {
    url, prisma, app, config, api,
    async startSession(doc, opts = {}) {
      const imp = await api('/api/studio/presentations/import', { body: doc });
      if (imp.status !== 201) throw new Error(`import failed: ${imp.text}`);
      const s = await api(`/api/studio/presentations/${imp.body.id}/sessions`, { body: { collectNames: opts.collectNames ?? true, mode: opts.mode ?? 'standalone' } });
      if (s.status !== 201) throw new Error(`session failed: ${s.text}`);
      const c = await api(`/api/studio/sessions/${s.body.id}/control`);
      return { id: s.body.id, pin: s.body.pin, presentationId: imp.body.id, presenterToken: c.body.presenterToken, projectorKey: c.body.projectorKey };
    },
    async close() {
      await app.close();
      await prisma.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    },
  };
  return ctx;
}

// ---------------------------------------------------------------------------------------
// Socket test clients
// ---------------------------------------------------------------------------------------

export class Client {
  socket!: Socket;
  last: Snapshot | null = null;
  history: Snapshot[] = [];
  removed = false;

  constructor(
    private url: string,
    private auth: Record<string, string>,
  ) {}

  async connect(): Promise<this> {
    this.socket = connect(this.url, { auth: this.auth, transports: ['websocket'], reconnection: false, forceNew: true });
    this.socket.on('snapshot', (s: Snapshot) => {
      this.last = s;
      this.history.push(s);
    });
    this.socket.on('removed', () => { this.removed = true; });
    await new Promise<void>((ok, fail) => {
      this.socket.once('connect', () => ok());
      this.socket.once('connect_error', (e) => fail(new Error(`connect_error: ${e.message}`)));
    });
    await this.until(() => true);
    return this;
  }

  /** Resolve when the latest snapshot satisfies `pred` (checks existing state first). */
  until(pred: (s: Snapshot) => boolean, timeoutMs = 4000): Promise<Snapshot> {
    return new Promise((resolve, reject) => {
      const t0 = Date.now();
      const tick = () => {
        if (this.last && pred(this.last)) return resolve(this.last);
        if (Date.now() - t0 > timeoutMs) return reject(new Error(`timed out waiting for snapshot; last = ${JSON.stringify(this.last?.state)}`));
        setTimeout(tick, 15);
      };
      tick();
    });
  }

  emit<T = unknown>(event: string, payload: unknown): Promise<Ack<T extends object ? T : object>> {
    return new Promise((resolve) => this.socket.emit(event, payload, resolve));
  }

  disconnect() {
    this.socket?.disconnect();
  }
}

export const presenterClient = (ctx: TestContext, s: Session) => new Client(ctx.url, { role: 'presenter', sessionId: s.id, token: s.presenterToken }).connect();
export const projectorClient = (ctx: TestContext, s: Session) => new Client(ctx.url, { role: 'projector', sessionId: s.id, key: s.projectorKey }).connect();

export async function joinSession(ctx: TestContext, pin: string, name?: string, token?: string): Promise<JoinResponse & { status: number; code?: string }> {
  const r = await ctx.api('/api/join', { body: { pin, name, token } });
  return { ...r.body, status: r.status, code: r.body?.error?.code };
}

export async function participant(ctx: TestContext, s: Session, name: string) {
  const j = await joinSession(ctx, s.pin, name);
  if (j.status !== 200) throw new Error(`join failed: ${JSON.stringify(j)}`);
  const client = await new Client(ctx.url, { role: 'participant', sessionId: s.id, token: j.token }).connect();
  return { client, join: j };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function doc(slides: unknown[], extra: Record<string, unknown> = {}) {
  return { schemaVersion: 1, title: 'Test deck', slides, ...extra };
}

export const quiz = (over: Record<string, unknown> = {}) => ({
  id: 'quiz', type: 'quiz', question: 'Pick B', notes: 'PRIVATE-NOTES',
  options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }], correctOptionId: 'b', explanation: 'EXPLAIN-B', ...over,
});
export const cloud = (over: Record<string, unknown> = {}) => ({ id: 'cloud', type: 'wordcloud', question: 'Words?', maxSubmissions: 2, ...over });
