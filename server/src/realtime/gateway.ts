import type { Server, Socket } from 'socket.io';
import { presenterCommandSchema, socketAuthSchema, submitRequestSchema, type Ack, type Role } from '@classinteract/shared';
import type { Auth } from '../auth';
import { AppError } from '../lib/errors';
import { TokenBuckets } from '../lib/rateLimit';
import type { ChangeEvent, ChangeScope, SessionService } from '../services/sessions';

interface Conn {
  socket: Socket;
  role: Role;
  sessionId: string;
  participantId?: string;
}

const DEBOUNCE_MS = 120;

function toAck(e: unknown): { ok: false; code: string; message: string } {
  if (e instanceof AppError) return { ok: false, code: e.code, message: e.message };
  console.error('[gateway] unexpected error', e);
  return { ok: false, code: 'INTERNAL', message: 'Something went wrong. Try again.' };
}

export function attachGateway(io: Server, service: SessionService, auth: Auth, opts: { rateLimit: boolean }) {
  const conns = new Map<string, Set<Conn>>();
  const submitBuckets = new TokenBuckets(12, 2);
  const commandBuckets = new TokenBuckets(40, 15);

  const connsOf = (sessionId: string) => conns.get(sessionId) ?? new Set<Conn>();
  const onlineParticipants = (sessionId: string): Set<string> =>
    new Set([...connsOf(sessionId)].flatMap((c) => (c.participantId ? [c.participantId] : [])));

  // --- authentication: every role proves itself during the handshake -------------------
  io.use(async (socket, next) => {
    const parsed = socketAuthSchema.safeParse(socket.handshake.auth);
    if (!parsed.success) return next(new Error('UNAUTHORIZED'));
    const a = parsed.data;
    try {
      if (!(await service.sessionExists(a.sessionId))) return next(new Error('NOT_FOUND'));
      if (a.role === 'presenter') {
        if (!auth.verifyPresenter(a.sessionId, a.token)) return next(new Error('UNAUTHORIZED'));
        socket.data = { role: 'presenter', sessionId: a.sessionId };
      } else if (a.role === 'projector') {
        if (!auth.verifyProjector(a.sessionId, a.key)) return next(new Error('UNAUTHORIZED'));
        socket.data = { role: 'projector', sessionId: a.sessionId };
      } else {
        const p = await service.authParticipant(a.sessionId, a.token);
        if (!p) return next(new Error('UNAUTHORIZED'));
        socket.data = { role: 'participant', sessionId: a.sessionId, participantId: p.participantId };
      }
      next();
    } catch {
      next(new Error('INTERNAL'));
    }
  });

  // --- broadcasting ------------------------------------------------------------------
  const pending = new Map<string, { scopes: Set<ChangeScope>; timer?: NodeJS.Timeout; running: boolean; dirty: boolean }>();

  async function flush(sessionId: string) {
    const p = pending.get(sessionId);
    if (!p) return;
    if (p.running) {
      p.dirty = true;
      return;
    }
    const scopes = p.scopes;
    p.scopes = new Set();
    p.timer = undefined;
    const targets = connsOf(sessionId);
    if (targets.size === 0) {
      pending.delete(sessionId);
      return;
    }
    p.running = true;
    try {
      const snaps = await service.buildSnapshots(sessionId, onlineParticipants(sessionId));
      // Phones watching the lobby / standby screen show who is here, so roster changes must reach them too.
      const waiting = snaps.projector.state.phase === 'lobby' || snaps.projector.state.phase === 'standby';
      const participantsNeedUpdate = scopes.has('control') || (scopes.has('roster') && waiting) || (scopes.has('data') && snaps.participantsSeeLiveData);
      for (const c of targets) {
        if (c.role === 'presenter') c.socket.emit('snapshot', snaps.presenter);
        else if (c.role === 'projector') c.socket.emit('snapshot', snaps.projector);
        else if (participantsNeedUpdate && c.participantId) {
          const snap = snaps.forParticipant(c.participantId);
          if (snap) c.socket.emit('snapshot', snap);
        }
      }
    } catch (e) {
      console.error('[gateway] broadcast failed', e);
    } finally {
      p.running = false;
      if (p.dirty || p.scopes.size) {
        p.dirty = false;
        void flush(sessionId);
      } else {
        pending.delete(sessionId);
      }
    }
  }

  function schedule(ev: ChangeEvent) {
    const p = pending.get(ev.sessionId) ?? { scopes: new Set<ChangeScope>(), running: false, dirty: false };
    pending.set(ev.sessionId, p);
    p.scopes.add(ev.scope);
    if (ev.scope === 'control') {
      if (p.timer) clearTimeout(p.timer);
      p.timer = undefined;
      setImmediate(() => void flush(ev.sessionId));
    } else if (!p.timer) {
      p.timer = setTimeout(() => void flush(ev.sessionId), DEBOUNCE_MS);
    }
  }
  service.events.on('change', schedule);

  service.events.on('kicked', ({ sessionId, participantId }: { sessionId: string; participantId: string }) => {
    for (const c of connsOf(sessionId)) {
      if (c.participantId === participantId) {
        c.socket.emit('removed');
        c.socket.disconnect(true);
      }
    }
  });

  async function sendSnapshot(c: Conn) {
    const snaps = await service.buildSnapshots(c.sessionId, onlineParticipants(c.sessionId));
    const snap = c.role === 'presenter' ? snaps.presenter : c.role === 'projector' ? snaps.projector : snaps.forParticipant(c.participantId!);
    if (snap) c.socket.emit('snapshot', snap);
  }

  // --- connections -------------------------------------------------------------------
  io.on('connection', (socket) => {
    const { role, sessionId, participantId } = socket.data as Conn;
    const conn: Conn = { socket, role, sessionId, participantId };
    if (!conns.has(sessionId)) conns.set(sessionId, new Set());
    conns.get(sessionId)!.add(conn);

    // A (re)connecting client always starts from a complete, current snapshot.
    void sendSnapshot(conn).catch((e) => console.error('[gateway] initial snapshot failed', e));
    if (role === 'participant') schedule({ sessionId, scope: 'roster' });

    socket.on('submit', async (req: unknown, ack?: (a: Ack) => void) => {
      const reply = typeof ack === 'function' ? ack : () => undefined;
      if (conn.role !== 'participant' || !conn.participantId) return reply({ ok: false, code: 'FORBIDDEN', message: 'Only participants can respond.' });
      if (opts.rateLimit && !submitBuckets.take(conn.participantId)) return reply({ ok: false, code: 'RATE_LIMITED', message: 'Slow down a little and try again.' });
      const parsed = submitRequestSchema.safeParse(req);
      if (!parsed.success) return reply({ ok: false, code: 'INVALID', message: 'That response could not be read.' });
      try {
        const r = await service.submit(sessionId, conn.participantId, parsed.data.activityId, parsed.data.payload);
        reply({ ok: true, ...r });
      } catch (e) {
        reply(toAck(e));
      }
    });

    socket.on('rename', async (req: unknown, ack?: (a: Ack<{ name: string }>) => void) => {
      const reply = typeof ack === 'function' ? ack : () => undefined;
      if (conn.role !== 'participant' || !conn.participantId) return reply({ ok: false, code: 'FORBIDDEN', message: 'Only participants can do that.' });
      if (opts.rateLimit && !submitBuckets.take(conn.participantId)) return reply({ ok: false, code: 'RATE_LIMITED', message: 'Slow down a little and try again.' });
      const name = (req as { name?: unknown } | null)?.name;
      if (typeof name !== 'string' || name.length > 80) return reply({ ok: false, code: 'INVALID', message: 'Enter a name.' });
      try {
        reply({ ok: true, name: await service.rename(sessionId, conn.participantId, name) });
      } catch (e) {
        reply(toAck(e));
      }
    });

    socket.on('presenter', async (cmd: unknown, ack?: (a: Ack) => void) => {
      const reply = typeof ack === 'function' ? ack : () => undefined;
      if (conn.role !== 'presenter') return reply({ ok: false, code: 'FORBIDDEN', message: 'Only the presenter can do that.' });
      if (opts.rateLimit && !commandBuckets.take(sessionId)) return reply({ ok: false, code: 'RATE_LIMITED', message: 'Too many commands. Wait a moment.' });
      const parsed = presenterCommandSchema.safeParse(cmd);
      if (!parsed.success) return reply({ ok: false, code: 'INVALID', message: 'Unknown command.' });
      const c = parsed.data;
      try {
        if (c.cmd === 'action') await service.act(sessionId, c.action);
        else if (c.cmd === 'moderate') await service.moderate(sessionId, c);
        else if (c.cmd === 'kick') await service.kick(sessionId, c.participantId);
        else await service.setMode(sessionId, c.mode);
        reply({ ok: true });
      } catch (e) {
        reply(toAck(e));
      }
    });

    socket.on('disconnect', () => {
      conns.get(sessionId)?.delete(conn);
      if (conns.get(sessionId)?.size === 0) conns.delete(sessionId);
      if (role === 'participant') schedule({ sessionId, scope: 'roster' });
    });
  });

  return {
    connectionCount: (sessionId: string) => connsOf(sessionId).size,
    close() {
      for (const p of pending.values()) if (p.timer) clearTimeout(p.timer);
      service.events.off('change', schedule);
    },
  };
}
