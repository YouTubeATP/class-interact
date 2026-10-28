import type { Server, Socket } from 'socket.io';
import {
  askQuestionSchema, can, presenterCommandSchema, pulseSchema, socketAuthSchema, submitRequestSchema, voteSchema,
  type Ack, type Permission, type PresenterCommand, type Role, type StaffRole,
} from '@classinteract/shared';
import type { Auth } from '../auth';
import { AppError } from '../lib/errors';
import { TokenBuckets } from '../lib/rateLimit';
import type { ChangeEvent, ChangeScope, SessionService } from '../services/sessions';

interface Conn {
  socket: Socket;
  role: Role;
  sessionId: string;
  participantId?: string;
  /** Control screens: the owner (Studio) or a teaching assistant's access link. */
  staffRole?: StaffRole;
  grantId?: string;
  label?: string;
}

const DEBOUNCE_MS = 120;

function toAck(e: unknown): { ok: false; code: string; message: string } {
  if (e instanceof AppError) return { ok: false, code: e.code, message: e.message };
  console.error('[gateway] unexpected error', e);
  return { ok: false, code: 'INTERNAL', message: 'Something went wrong. Try again.' };
}

/** The permission a staff command needs. Checked on the server for every command, whatever the screen shows. */
export function permissionFor(c: PresenterCommand): Permission {
  switch (c.cmd) {
    case 'action': {
      const t = c.action.type;
      if (t === 'end') return 'end';
      if (t === 'showOverlay' || t === 'hideOverlay' || t === 'highlightQuestion' || t === 'startBreak' || t === 'endBreak' || t === 'setLeaderboardMode') return 'screen';
      return 'navigate';
    }
    case 'runAgain':
    case 'nextPlain':
    case 'selfPaced':
      return 'navigate';
    case 'qa':
      return c.op === 'highlight' ? 'screen' : 'qa';
    case 'features':
      return Object.keys(c.patch).every((k) => k === 'projector') ? 'screen' : 'settings';
    case 'teams':
    case 'kick':
      return 'participants';
    case 'moderate':
    case 'review':
    case 'merge':
    case 'unmerge':
      return 'moderate';
    case 'simulate':
      return 'settings';
    case 'setMode':
      return 'mode';
  }
}

export function attachGateway(io: Server, service: SessionService, auth: Auth, opts: { rateLimit: boolean }) {
  const conns = new Map<string, Set<Conn>>();
  const submitBuckets = new TokenBuckets(12, 2);
  const qaBuckets = new TokenBuckets(4, 0.1);
  const voteBuckets = new TokenBuckets(20, 2);
  const commandBuckets = new TokenBuckets(40, 15);

  const connsOf = (sessionId: string) => conns.get(sessionId) ?? new Set<Conn>();
  const onlineParticipants = (sessionId: string): Set<string> =>
    new Set([...connsOf(sessionId)].flatMap((c) => (c.participantId ? [c.participantId] : [])));
  const onlineGrants = (sessionId: string): Map<string, number> => {
    const m = new Map<string, number>();
    for (const c of connsOf(sessionId)) if (c.grantId) m.set(c.grantId, (m.get(c.grantId) ?? 0) + 1);
    return m;
  };

  // --- authentication: every role proves itself during the handshake -------------------
  io.use(async (socket, next) => {
    const parsed = socketAuthSchema.safeParse(socket.handshake.auth);
    if (!parsed.success) return next(new Error('UNAUTHORIZED'));
    const a = parsed.data;
    try {
      if (!(await service.sessionExists(a.sessionId))) return next(new Error('NOT_FOUND'));
      if (a.role === 'presenter') {
        if (!auth.verifyPresenter(a.sessionId, a.token)) return next(new Error('UNAUTHORIZED'));
        socket.data = { role: 'presenter', sessionId: a.sessionId, staffRole: 'owner', label: 'Presenter' };
      } else if (a.role === 'delegate') {
        const g = await service.authDelegate(a.sessionId, a.token);
        if (!g) return next(new Error('UNAUTHORIZED'));
        socket.data = { role: 'presenter', sessionId: a.sessionId, staffRole: g.role, grantId: g.grantId, label: g.label };
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
      const snaps = await service.buildSnapshots(sessionId, onlineParticipants(sessionId), onlineGrants(sessionId));
      const has = (s: ChangeScope) => scopes.has(s);
      // Phones watching the lobby / standby screen show who is here, so roster changes must reach them too.
      const waiting = snaps.projector.state.phase === 'lobby' || snaps.projector.state.phase === 'standby';
      const participantsNeedUpdate = has('control') || has('qa') || (has('roster') && waiting) || (has('data') && snaps.participantsSeeLiveData);
      const projectorNeedsUpdate = has('control') || has('data') || has('roster') || (has('qa') && (snaps.projectorShowsQa || !!snaps.projector.highlight)) || (has('pulse') && snaps.projectorShowsPulse);
      for (const c of targets) {
        if (c.role === 'presenter') c.socket.emit('snapshot', c.staffRole === 'owner' ? snaps.presenter : service.delegateView(snaps.presenter, c.staffRole!, c.label ?? ''));
        else if (c.role === 'projector') { if (projectorNeedsUpdate) c.socket.emit('snapshot', snaps.projector); }
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

  const onKicked = ({ sessionId, participantId }: { sessionId: string; participantId: string }) => {
    for (const c of connsOf(sessionId)) {
      if (c.participantId === participantId) {
        c.socket.emit('removed');
        c.socket.disconnect(true);
      }
    }
  };
  service.events.on('kicked', onKicked);

  // a revoked access link stops working at once, on every device that used it
  const onRevoked = ({ sessionId, grantId }: { sessionId: string; grantId: string }) => {
    for (const c of connsOf(sessionId)) {
      if (c.grantId === grantId) {
        c.socket.emit('revoked');
        c.socket.disconnect(true);
      }
    }
  };
  service.events.on('revoked', onRevoked);

  async function sendSnapshot(c: Conn) {
    const snaps = await service.buildSnapshots(c.sessionId, onlineParticipants(c.sessionId), onlineGrants(c.sessionId));
    const snap = c.role === 'presenter'
      ? (c.staffRole === 'owner' ? snaps.presenter : service.delegateView(snaps.presenter, c.staffRole!, c.label ?? ''))
      : c.role === 'projector' ? snaps.projector : snaps.forParticipant(c.participantId!);
    if (snap) c.socket.emit('snapshot', snap);
  }

  // --- connections -------------------------------------------------------------------
  io.on('connection', (socket) => {
    const { role, sessionId, participantId, staffRole, grantId, label } = socket.data as Conn;
    const conn: Conn = { socket, role, sessionId, participantId, staffRole, grantId, label };
    if (!conns.has(sessionId)) conns.set(sessionId, new Set());
    conns.get(sessionId)!.add(conn);

    // A (re)connecting client always starts from a complete, current snapshot.
    void sendSnapshot(conn).catch((e) => console.error('[gateway] initial snapshot failed', e));
    if (role === 'participant') schedule({ sessionId, scope: 'roster' });
    if (grantId) schedule({ sessionId, scope: 'control' }); // the owner's list shows who is connected

    const participantOnly = (reply: (a: any) => void, bucket: TokenBuckets): string | null => {
      if (conn.role !== 'participant' || !conn.participantId) { reply({ ok: false, code: 'FORBIDDEN', message: 'Only participants can do that.' }); return null; }
      if (opts.rateLimit && !bucket.take(conn.participantId)) { reply({ ok: false, code: 'RATE_LIMITED', message: 'Slow down a little and try again.' }); return null; }
      return conn.participantId;
    };

    socket.on('submit', async (req: unknown, ack?: (a: Ack) => void) => {
      const reply = typeof ack === 'function' ? ack : () => undefined;
      const pid = participantOnly(reply, submitBuckets);
      if (!pid) return;
      const parsed = submitRequestSchema.safeParse(req);
      if (!parsed.success) return reply({ ok: false, code: 'INVALID', message: 'That response could not be read.' });
      try {
        const r = await service.submit(sessionId, pid, parsed.data.activityId, parsed.data.payload);
        reply({ ok: true, ...r });
      } catch (e) {
        reply(toAck(e));
      }
    });

    socket.on('rename', async (req: unknown, ack?: (a: Ack<{ name: string }>) => void) => {
      const reply = typeof ack === 'function' ? ack : () => undefined;
      const pid = participantOnly(reply, submitBuckets);
      if (!pid) return;
      const name = (req as { name?: unknown } | null)?.name;
      if (typeof name !== 'string' || name.length > 80) return reply({ ok: false, code: 'INVALID', message: 'Enter a name.' });
      try {
        reply({ ok: true, name: await service.rename(sessionId, pid, name) });
      } catch (e) {
        reply(toAck(e));
      }
    });

    socket.on('qa:ask', async (req: unknown, ack?: (a: Ack<{ question: unknown }>) => void) => {
      const reply = typeof ack === 'function' ? ack : () => undefined;
      const pid = participantOnly(reply, qaBuckets);
      if (!pid) return;
      const parsed = askQuestionSchema.safeParse(req);
      if (!parsed.success) return reply({ ok: false, code: 'INVALID', message: 'Type your question.' });
      try {
        reply({ ok: true, question: await service.askQuestion(sessionId, pid, parsed.data.text, parsed.data.anonymous) });
      } catch (e) {
        reply(toAck(e));
      }
    });

    socket.on('qa:vote', async (req: unknown, ack?: (a: Ack) => void) => {
      const reply = typeof ack === 'function' ? ack : () => undefined;
      const pid = participantOnly(reply, voteBuckets);
      if (!pid) return;
      const parsed = voteSchema.safeParse(req);
      if (!parsed.success) return reply({ ok: false, code: 'INVALID', message: 'That vote could not be read.' });
      try {
        reply({ ok: true, ...(await service.vote(sessionId, pid, parsed.data.id, parsed.data.on)) });
      } catch (e) {
        reply(toAck(e));
      }
    });

    socket.on('pulse', async (req: unknown, ack?: (a: Ack) => void) => {
      const reply = typeof ack === 'function' ? ack : () => undefined;
      const pid = participantOnly(reply, voteBuckets);
      if (!pid) return;
      const parsed = pulseSchema.safeParse(req);
      if (!parsed.success) return reply({ ok: false, code: 'INVALID', message: 'That could not be read.' });
      try {
        await service.setPulse(sessionId, pid, parsed.data.value);
        reply({ ok: true });
      } catch (e) {
        reply(toAck(e));
      }
    });

    socket.on('presenter', async (cmd: unknown, ack?: (a: Ack) => void) => {
      const reply = typeof ack === 'function' ? ack : () => undefined;
      if (conn.role !== 'presenter' || !conn.staffRole) return reply({ ok: false, code: 'FORBIDDEN', message: 'Only the presenter can do that.' });
      if (opts.rateLimit && !commandBuckets.take(sessionId)) return reply({ ok: false, code: 'RATE_LIMITED', message: 'Too many commands. Wait a moment.' });
      const parsed = presenterCommandSchema.safeParse(cmd);
      if (!parsed.success) return reply({ ok: false, code: 'INVALID', message: 'Unknown command.' });
      const c = parsed.data;
      if (!can(conn.staffRole, permissionFor(c))) return reply({ ok: false, code: 'FORBIDDEN', message: 'Your access link does not allow that.' });
      const actor = { id: socket.id, role: conn.staffRole };
      try {
        if (c.cmd === 'action') await service.act(sessionId, c.action, { actor, expectVersion: c.expectVersion });
        else if (c.cmd === 'runAgain') await service.act(sessionId, { type: 'runAgain' }, { actor, expectVersion: c.expectVersion, scoring: c.scoring });
        else if (c.cmd === 'nextPlain') await service.act(sessionId, { type: 'next' }, { actor, expectVersion: c.expectVersion, ignoreBranch: true });
        else if (c.cmd === 'moderate') await service.moderate(sessionId, c);
        else if (c.cmd === 'kick') await service.kick(sessionId, c.participantId);
        else if (c.cmd === 'setMode') await service.setMode(sessionId, c.mode);
        else if (c.cmd === 'qa') await service.moderateQuestion(sessionId, c.op, c.id, actor);
        else if (c.cmd === 'features') await service.updateFeatures(sessionId, c.patch);
        else if (c.cmd === 'teams') await service.teams(sessionId, c.team);
        else if (c.cmd === 'review') await service.review(sessionId, c.key, c.accept);
        else if (c.cmd === 'merge') await service.merge(sessionId, c.keys, c.into);
        else if (c.cmd === 'unmerge') await service.merge(sessionId, [], null, c.key);
        else if (c.cmd === 'simulate') await service.simulate(sessionId, c.count);
        else if (c.cmd === 'selfPaced') await service.selfPaced(sessionId, c.op);
        reply({ ok: true });
      } catch (e) {
        reply(toAck(e));
      }
    });

    socket.on('disconnect', () => {
      conns.get(sessionId)?.delete(conn);
      if (conns.get(sessionId)?.size === 0) conns.delete(sessionId);
      if (role === 'participant') schedule({ sessionId, scope: 'roster' });
      if (grantId) schedule({ sessionId, scope: 'control' });
    });
  });

  return {
    connectionCount: (sessionId: string) => connsOf(sessionId).size,
    close() {
      for (const p of pending.values()) if (p.timer) clearTimeout(p.timer);
      service.events.off('change', schedule);
      service.events.off('kicked', onKicked);
      service.events.off('revoked', onRevoked);
    },
  };
}
