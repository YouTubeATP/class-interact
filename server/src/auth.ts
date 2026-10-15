import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Config } from './config';

const b64 = (buf: Buffer) => buf.toString('base64url');

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const newToken = () => b64(randomBytes(24));

export interface Auth {
  /** Capability for controlling one session. Derived, so the studio can always re-issue it; never guessable without the secret. */
  presenterToken(sessionId: string): string;
  /** Key that lets a screen show the projector view of one session. Participants never receive it. */
  projectorKey(sessionId: string): string;
  verifyPresenter(sessionId: string, token: string): boolean;
  verifyProjector(sessionId: string, key: string): boolean;
  issueStudioToken(): string;
  verifyStudioToken(token: string | undefined): boolean;
  checkPassword(password: string): boolean;
  readonly studioProtected: boolean;
}

function loadSecret(config: Config): Buffer {
  if (config.secret) return Buffer.from(config.secret);
  const file = resolve(config.dataDir, 'secret.key');
  if (existsSync(file)) return Buffer.from(readFileSync(file, 'utf8').trim());
  const generated = randomBytes(32).toString('hex');
  writeFileSync(file, generated, { mode: 0o600 });
  return Buffer.from(generated);
}

export function createAuth(config: Config): Auth {
  const secret = loadSecret(config);
  const mac = (label: string, data: string) => b64(createHmac('sha256', secret).update(`${label}:${data}`).digest()).slice(0, 32);
  const STUDIO_TTL = 7 * 24 * 3600 * 1000;

  return {
    studioProtected: !!config.studioPassword,
    presenterToken: (id) => mac('presenter', id),
    projectorKey: (id) => mac('projector', id),
    verifyPresenter: (id, t) => safeEqual(mac('presenter', id), t),
    verifyProjector: (id, k) => safeEqual(mac('projector', id), k),
    issueStudioToken() {
      const exp = String(Date.now() + STUDIO_TTL);
      return `${exp}.${mac('studio', exp)}`;
    },
    verifyStudioToken(token) {
      if (!config.studioPassword) return true;
      if (!token) return false;
      const [exp, sig] = token.split('.');
      if (!exp || !sig || Number(exp) < Date.now()) return false;
      return safeEqual(mac('studio', exp), sig);
    },
    checkPassword: (p) => !!config.studioPassword && safeEqual(hashToken(p), hashToken(config.studioPassword)),
  };
}
