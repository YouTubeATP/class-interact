import { EventEmitter } from 'node:events';
import { randomInt } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import {
  availableActions, cleanText, computeStandings, definitions, initialState, nameKey, redactResults, showsActivity, transition,
  type Action, type ActivityMeta, type AggSubmission, type AnyConfig, type BaseSnapshot, type Counts, type MySubmission,
  type ModerationItem, type OutlineItem, type ParticipantInfo, type ParticipantSnapshot, type PresenterSnapshot, type ProjectorSnapshot,
  type PublicActivity, type Results, type SessionInfo, type SessionMode, type SessionState, type SessionSummary, type SlideType,
  type Standing, type SubmissionStatus, type Theme, type JoinLookup, type JoinResponse,
} from '@classinteract/shared';
import type { Auth } from '../auth';
import { hashToken, newToken } from '../auth';
import type { Config } from '../config';
import { AppError, notFound } from '../lib/errors';
import type { TextFilter } from '../lib/moderation';
import { randomName } from '../lib/names';

export type ChangeScope = 'control' | 'data' | 'roster';
export interface ChangeEvent {
  sessionId: string;
  scope: ChangeScope;
}

interface RtActivity {
  id: string;
  key: string;
  position: number;
  type: SlideType;
  config: any;
  completed: boolean;
  answerRevealed: boolean;
}
interface RtParticipant {
  id: string;
  name: string;
  removed: boolean;
  joinedAt: number;
}
interface Runtime {
  id: string;
  pin: string;
  title: string;
  theme: Theme;
  mode: SessionMode;
  collectNames: boolean;
  status: 'live' | 'ended';
  state: SessionState;
  activities: RtActivity[];
  participants: Map<string, RtParticipant>;
  tokens: Map<string, string>; // tokenHash -> participantId
  lastActivityAt: number;
  timer?: NodeJS.Timeout;
  queue: Promise<unknown>;
  standings: Standing[] | null;
}

export interface Snapshots {
  presenter: PresenterSnapshot;
  projector: ProjectorSnapshot;
  /** Per-participant snapshot (null if the participant is not in this session). */
  forParticipant(participantId: string): ParticipantSnapshot | null;
  /** True when a new submission changes what participants see (live results are shared with them). */
  participantsSeeLiveData: boolean;
}

const GRACE_MS = 1500;
const MAX_NAME = 24;

const isUnique = (e: unknown): e is Prisma.PrismaClientKnownRequestError => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

export class SessionService {
  readonly events = new EventEmitter();
  private cache = new Map<string, Promise<Runtime>>();

  constructor(
    private prisma: PrismaClient,
    private config: Config,
    private auth: Auth,
    private filter: TextFilter,
  ) {
    this.events.setMaxListeners(50);
  }

  private emit(sessionId: string, scope: ChangeScope) {
    this.events.emit('change', { sessionId, scope } satisfies ChangeEvent);
  }

  // ---------------------------------------------------------------------------------
  // Runtime cache
  // ---------------------------------------------------------------------------------

  runtime(sessionId: string): Promise<Runtime> {
    let p = this.cache.get(sessionId);
    if (!p) {
      p = this.load(sessionId);
      this.cache.set(sessionId, p);
      p.catch(() => this.cache.delete(sessionId));
    }
    return p;
  }

  private async load(sessionId: string): Promise<Runtime> {
    const s = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { activities: { orderBy: { position: 'asc' } }, participants: true },
    });
    if (!s) throw notFound('Session not found');
    const rt: Runtime = {
      id: s.id,
      pin: s.pin,
      title: s.title,
      theme: JSON.parse(s.theme),
      mode: s.mode as SessionMode,
      collectNames: s.collectNames,
      status: s.status === 'ended' ? 'ended' : 'live',
      state: JSON.parse(s.state),
      activities: s.activities.map((a) => ({
        id: a.id, key: a.key, position: a.position, type: a.type as SlideType, config: JSON.parse(a.config), completed: a.completed, answerRevealed: a.answerRevealed,
      })),
      participants: new Map(s.participants.map((p) => [p.id, { id: p.id, name: p.name, removed: p.removed, joinedAt: p.joinedAt.getTime() }])),
      tokens: new Map(s.participants.map((p) => [p.tokenHash, p.id])),
      lastActivityAt: s.lastActivityAt.getTime(),
      queue: Promise.resolve(),
      standings: null,
    };
    this.scheduleTimer(rt);
    return rt;
  }

  private withLock<T>(rt: Runtime, fn: () => Promise<T>): Promise<T> {
    const run = rt.queue.then(fn, fn);
    rt.queue = run.catch(() => undefined);
    return run;
  }

  private meta(rt: Runtime): ActivityMeta[] {
    return rt.activities.map((a) => {
      const b = definitions[a.type].behavior(a.config);
      return { interactive: b.interactive, hasCorrectAnswer: b.hasCorrectAnswer, liveResults: b.liveResults, timeLimitSec: b.timeLimitSec, autoOpen: b.autoOpen, completed: a.completed, answerRevealed: a.answerRevealed };
    });
  }

  /** Re-arm countdown timers for sessions that were mid-activity when the server restarted. */
  async recover(): Promise<void> {
    const live = await this.prisma.session.findMany({ where: { status: 'live' }, select: { id: true } });
    for (const s of live) await this.runtime(s.id);
  }

  // ---------------------------------------------------------------------------------
  // Creating / looking up sessions
  // ---------------------------------------------------------------------------------

  async createSession(presentationId: string, opts: { collectNames: boolean; mode: SessionMode }): Promise<{ id: string; pin: string }> {
    const p = await this.prisma.presentation.findUnique({ where: { id: presentationId }, include: { activities: { orderBy: { position: 'asc' } } } });
    if (!p) throw notFound('Presentation not found');
    if (p.activities.length === 0) throw new AppError(422, 'EMPTY_PRESENTATION', 'Add at least one slide before starting a session.');

    for (let attempt = 0; attempt < 30; attempt++) {
      const pin = String(randomInt(100000, 1000000));
      // one box on the join page accepts both kinds of code, so they may never collide
      if (await this.prisma.session.findUnique({ where: { liveProjectorCode: pin }, select: { id: true } })) continue;
      try {
        const s = await this.prisma.session.create({
          data: {
            presentationId: p.id,
            title: p.title,
            theme: p.theme,
            mode: opts.mode,
            collectNames: opts.collectNames,
            pin,
            livePin: pin,
            state: JSON.stringify(initialState()),
            activities: { create: p.activities.map((a) => ({ key: a.key, position: a.position, type: a.type, config: a.config })) },
          },
        });
        await this.projectorCodeFor(s.id);
        return { id: s.id, pin };
      } catch (e) {
        if (isUnique(e)) continue; // PIN collision with another live session
        throw e;
      }
    }
    throw new AppError(503, 'NO_PIN', 'Could not allocate a session code. Try again.');
  }

  /**
   * The six digits that turn another computer into this session's projector (typed on the same page people join from).
   * Allocated on first use, so sessions that predate the feature get one too; null once the session has ended.
   */
  async projectorCodeFor(sessionId: string): Promise<string | null> {
    const s = await this.prisma.session.findUnique({ where: { id: sessionId }, select: { status: true, liveProjectorCode: true } });
    if (!s || s.status !== 'live') return null;
    if (s.liveProjectorCode) return s.liveProjectorCode;
    for (let attempt = 0; attempt < 30; attempt++) {
      const code = String(randomInt(100000, 1000000));
      if (await this.prisma.session.findUnique({ where: { livePin: code }, select: { id: true } })) continue;
      try {
        await this.prisma.session.update({ where: { id: sessionId }, data: { liveProjectorCode: code } });
        return code;
      } catch (e) {
        if (isUnique(e)) continue;
        throw e;
      }
    }
    throw new AppError(503, 'NO_CODE', 'Could not allocate a projector code. Try again.');
  }

  /** Resolve a projector code to its live session, or null. */
  async sessionForProjectorCode(code: string): Promise<string | null> {
    const s = await this.prisma.session.findUnique({ where: { liveProjectorCode: code }, select: { id: true } });
    return s?.id ?? null;
  }

  async lookupPin(pin: string): Promise<JoinLookup> {
    const s = await this.prisma.session.findUnique({ where: { livePin: pin }, select: { id: true, title: true, collectNames: true } });
    if (!s) {
      // distinguish "ended" from "never existed" for a kinder message
      const ended = await this.prisma.session.findFirst({ where: { pin, status: 'ended' }, orderBy: { endedAt: 'desc' }, select: { id: true, title: true, collectNames: true } });
      if (ended) return { sessionId: ended.id, title: ended.title, collectNames: ended.collectNames, status: 'ended' };
      throw notFound('No live session with that code. Check the digits and try again.');
    }
    return { sessionId: s.id, title: s.title, collectNames: s.collectNames, status: 'live' };
  }

  // ---------------------------------------------------------------------------------
  // Participants
  // ---------------------------------------------------------------------------------

  async join(req: { pin: string; name?: string; token?: string }): Promise<JoinResponse> {
    const s = await this.prisma.session.findUnique({ where: { livePin: req.pin }, select: { id: true } });
    if (!s) throw notFound('No live session with that code. Check the digits and try again.');
    const rt = await this.runtime(s.id);

    return this.withLock(rt, async () => {
      if (rt.status !== 'live') throw new AppError(410, 'SESSION_ENDED', 'This session has ended.');

      // Resume: a valid token for this session restores the same identity (refresh, reconnect, new tab).
      if (req.token) {
        const pid = rt.tokens.get(hashToken(req.token));
        const p = pid ? rt.participants.get(pid) : undefined;
        if (p) {
          if (p.removed) throw new AppError(403, 'REMOVED', 'The presenter removed you from this session.');
          return { sessionId: rt.id, participantId: p.id, name: p.name, token: req.token, resumed: true };
        }
      }

      const active = [...rt.participants.values()].filter((p) => !p.removed).length;
      if (active >= this.config.maxParticipants) throw new AppError(429, 'FULL', 'This session is full.');

      let name: string;
      if (rt.collectNames) {
        name = cleanText(req.name ?? '');
        if (!name) throw new AppError(400, 'INVALID', 'Enter a name to join.');
        if (name.length > MAX_NAME) throw new AppError(400, 'INVALID', `Keep your name under ${MAX_NAME} characters.`);
        if (this.filter.isBlocked(name)) throw new AppError(400, 'MODERATED', 'Please choose a different name.');
      } else {
        name = randomName();
      }

      const token = newToken();
      for (let attempt = 0; attempt < 8; attempt++) {
        const candidate = !rt.collectNames && attempt > 2 ? `${name} ${randomInt(2, 99)}` : name;
        try {
          const p = await this.prisma.participant.create({ data: { sessionId: rt.id, name: candidate, nameKey: nameKey(candidate), tokenHash: hashToken(token) } });
          rt.participants.set(p.id, { id: p.id, name: p.name, removed: false, joinedAt: p.joinedAt.getTime() });
          rt.tokens.set(p.tokenHash, p.id);
          this.emit(rt.id, 'roster');
          return { sessionId: rt.id, participantId: p.id, name: p.name, token, resumed: false };
        } catch (e) {
          if (!isUnique(e)) throw e;
          if (rt.collectNames) throw new AppError(409, 'NAME_TAKEN', 'That name is already taken. Try another.');
        }
      }
      throw new AppError(503, 'INTERNAL', 'Could not join. Try again.');
    });
  }

  /** A participant changes their own display name (same rules as joining). Returns the accepted name. */
  async rename(sessionId: string, participantId: string, rawName: string): Promise<string> {
    const rt = await this.runtime(sessionId);
    return this.withLock(rt, async () => {
      if (rt.status !== 'live') throw new AppError(410, 'SESSION_ENDED', 'This session has ended.');
      const p = rt.participants.get(participantId);
      if (!p || p.removed) throw new AppError(403, 'REMOVED', 'You are no longer part of this session.');
      const name = cleanText(rawName);
      if (!name) throw new AppError(400, 'INVALID', 'Enter a name.');
      if (name.length > MAX_NAME) throw new AppError(400, 'INVALID', `Keep your name under ${MAX_NAME} characters.`);
      if (this.filter.isBlocked(name)) throw new AppError(422, 'MODERATED', 'Please choose a different name.');
      if (name === p.name) return name;
      try {
        await this.prisma.participant.update({ where: { id: participantId }, data: { name, nameKey: nameKey(name) } });
      } catch (e) {
        if (isUnique(e)) throw new AppError(409, 'NAME_TAKEN', 'That name is already taken. Try another.');
        throw e;
      }
      p.name = name;
      rt.standings = null;
      this.emit(rt.id, 'control'); // everyone (presenter roster, leaderboards, this phone) sees the new name
      return name;
    });
  }

  async authParticipant(sessionId: string, token: string): Promise<{ participantId: string } | null> {
    const rt = await this.runtime(sessionId).catch(() => null);
    if (!rt) return null;
    const pid = rt.tokens.get(hashToken(token));
    const p = pid ? rt.participants.get(pid) : undefined;
    if (!p || p.removed) return null;
    return { participantId: p.id };
  }

  async sessionExists(sessionId: string): Promise<boolean> {
    return !!(await this.runtime(sessionId).catch(() => null));
  }

  async kick(sessionId: string, participantId: string): Promise<void> {
    const rt = await this.runtime(sessionId);
    await this.withLock(rt, async () => {
      const p = rt.participants.get(participantId);
      if (!p) throw notFound('Participant not found');
      await this.prisma.$transaction([
        this.prisma.participant.update({ where: { id: participantId }, data: { removed: true } }),
        this.prisma.submission.updateMany({ where: { participantId }, data: { status: 'hidden' } }),
      ]);
      p.removed = true;
      rt.standings = null;
      this.events.emit('kicked', { sessionId, participantId });
      this.emit(sessionId, 'control');
    });
  }

  // ---------------------------------------------------------------------------------
  // Presenter actions
  // ---------------------------------------------------------------------------------

  async act(sessionId: string, action: Action): Promise<SessionState> {
    const rt = await this.runtime(sessionId);
    return this.withLock(rt, () => this.applyAction(rt, action));
  }

  private async applyAction(rt: Runtime, action: Action): Promise<SessionState> {
    const now = Date.now();
    const r = transition(rt.state, action, this.meta(rt), now);
    if (!r.ok) throw new AppError(409, r.code, r.message);

    const ending = r.state.phase === 'ended';
    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.session.update({
        where: { id: rt.id },
        data: {
          state: JSON.stringify(r.state),
          lastActivityAt: new Date(now),
          ...(ending ? { status: 'ended', endedAt: new Date(now), livePin: null, liveProjectorCode: null } : {}),
        },
      }),
    ];
    if (r.completedIndex !== null) {
      ops.push(this.prisma.sessionActivity.update({ where: { id: rt.activities[r.completedIndex].id }, data: { completed: true } }));
    }
    if (r.answerRevealed) {
      ops.push(this.prisma.sessionActivity.update({ where: { id: rt.activities[r.answerRevealed.index].id }, data: { answerRevealed: r.answerRevealed.value } }));
    }
    await this.prisma.$transaction(ops);

    if (r.completedIndex !== null) rt.activities[r.completedIndex].completed = true;
    if (r.answerRevealed) {
      rt.activities[r.answerRevealed.index].answerRevealed = r.answerRevealed.value;
      rt.standings = null;
    }
    rt.state = r.state;
    rt.lastActivityAt = now;
    if (ending) rt.status = 'ended';
    this.scheduleTimer(rt);
    this.emit(rt.id, 'control');
    return rt.state;
  }

  async setMode(sessionId: string, mode: SessionMode): Promise<void> {
    const rt = await this.runtime(sessionId);
    await this.withLock(rt, async () => {
      if (rt.status !== 'live') throw new AppError(409, 'SESSION_ENDED', 'This session has ended.');
      await this.prisma.session.update({ where: { id: rt.id }, data: { mode } });
      rt.mode = mode;
      this.emit(rt.id, 'control');
    });
  }

  private scheduleTimer(rt: Runtime) {
    if (rt.timer) clearTimeout(rt.timer);
    rt.timer = undefined;
    const { phase, deadlineAt, openedAt } = rt.state;
    if (phase !== 'open' || !deadlineAt) return;
    const delay = Math.max(0, deadlineAt - Date.now());
    rt.timer = setTimeout(() => {
      void this.withLock(rt, async () => {
        // only close if it is still the same opening of the same activity
        if (rt.state.phase === 'open' && rt.state.openedAt === openedAt) await this.applyAction(rt, { type: 'close' });
      }).catch((e) => console.error('[timer] auto-close failed', e));
    }, delay + 20);
    rt.timer.unref?.();
  }

  // ---------------------------------------------------------------------------------
  // Submissions
  // ---------------------------------------------------------------------------------

  async submit(sessionId: string, participantId: string, activityId: string, rawPayload: unknown): Promise<{ submission: MySubmission }> {
    const rt = await this.runtime(sessionId);
    return this.withLock(rt, async () => {
      if (rt.status !== 'live') throw new AppError(410, 'SESSION_ENDED', 'This session has ended.');
      const participant = rt.participants.get(participantId);
      if (!participant || participant.removed) throw new AppError(403, 'REMOVED', 'You are no longer part of this session.');

      const act = rt.activities.find((a) => a.id === activityId);
      if (!act) throw new AppError(404, 'NOT_FOUND', 'That activity does not exist.');
      const { state } = rt;
      const now = Date.now();
      if (state.phase !== 'open' || state.activityIndex !== act.position) throw new AppError(409, 'NOT_ACCEPTING', 'Responses are closed.');
      if (state.deadlineAt && now > state.deadlineAt + GRACE_MS) throw new AppError(409, 'NOT_ACCEPTING', 'Time is up.');

      const def = definitions[act.type] as any;
      const behavior = def.behavior(act.config);
      const v = def.validate(act.config, rawPayload);
      if (!v.ok) throw new AppError(400, 'INVALID', v.message);
      for (const text of def.extractText(act.config, v.payload) as string[]) {
        if (this.filter.isBlocked(text)) throw new AppError(422, 'MODERATED', 'Please keep responses respectful and try again.');
      }

      const used = await this.prisma.submission.count({ where: { sessionActivityId: act.id, participantId } });
      if (used >= behavior.maxSubmissions) {
        throw new AppError(409, behavior.maxSubmissions > 1 ? 'LIMIT_REACHED' : 'DUPLICATE', behavior.maxSubmissions > 1 ? `You have used all ${behavior.maxSubmissions} responses.` : 'You have already responded.');
      }

      const elapsedMs = state.openedAt ? Math.max(0, now - state.openedAt) : 0;
      const ev = def.evaluate(act.config, v.payload, { elapsedMs }) as { correct: boolean | null; score: number };
      try {
        const row = await this.prisma.submission.create({
          data: {
            sessionId: rt.id,
            sessionActivityId: act.id,
            participantId,
            slot: used,
            payload: JSON.stringify(v.payload),
            key: v.key,
            status: v.status,
            correct: ev.correct,
            score: ev.score,
            responseMs: elapsedMs,
          },
        });
        rt.lastActivityAt = now;
        this.emit(rt.id, 'data');
        return { submission: { id: row.id, slot: row.slot, payload: v.payload, status: row.status === 'pending' ? 'pending' : 'visible', correct: null, score: null } };
      } catch (e) {
        if (isUnique(e)) {
          // DB constraint caught a concurrent or repeated submission
          throw new AppError(409, 'DUPLICATE', v.key ? 'You already submitted that.' : 'You have already responded.');
        }
        throw e;
      }
    });
  }

  async moderate(sessionId: string, cmd: { status: 'visible' | 'hidden'; ids?: string[]; key?: string }): Promise<number> {
    const rt = await this.runtime(sessionId);
    return this.withLock(rt, async () => {
      const act = showsActivity(rt.state) ? rt.activities[rt.state.activityIndex] : undefined;
      if (!act) throw new AppError(409, 'NOT_STARTED', 'No activity is on screen.');
      if (!cmd.ids?.length && !cmd.key) throw new AppError(400, 'INVALID', 'Nothing to moderate.');
      const where: Prisma.SubmissionWhereInput = { sessionId: rt.id, sessionActivityId: act.id, ...(cmd.ids?.length ? { id: { in: cmd.ids } } : { key: cmd.key }) };
      const r = await this.prisma.submission.updateMany({ where, data: { status: cmd.status } });
      this.emit(rt.id, 'data');
      return r.count;
    });
  }

  // ---------------------------------------------------------------------------------
  // Snapshots
  // ---------------------------------------------------------------------------------

  private async standingsFor(rt: Runtime, scope: 'revealed' | 'all'): Promise<Standing[]> {
    if (scope === 'revealed' && rt.standings) return rt.standings;
    const ids = rt.activities.filter((a) => definitions[a.type].behavior(a.config as never).hasCorrectAnswer && (scope === 'all' || a.answerRevealed)).map((a) => a.id);
    let result: Standing[] = [];
    if (ids.length) {
      const rows = await this.prisma.submission.findMany({
        where: { sessionActivityId: { in: ids }, status: { not: 'hidden' } },
        select: { participantId: true, score: true, correct: true, responseMs: true },
      });
      result = computeStandings(
        rows.flatMap((r) => {
          const p = rt.participants.get(r.participantId);
          return p && !p.removed ? [{ participantId: r.participantId, name: p.name, score: r.score, correct: r.correct, responseMs: r.responseMs ?? 0 }] : [];
        }),
      );
    }
    if (scope === 'revealed') rt.standings = result;
    return result;
  }

  async buildSnapshots(sessionId: string, online: ReadonlySet<string>): Promise<Snapshots> {
    const rt = await this.runtime(sessionId);
    const { state } = rt;
    const now = Date.now();
    const active = [...rt.participants.values()].filter((p) => !p.removed);

    const act = showsActivity(state) ? rt.activities[state.activityIndex] : null;
    const behavior = act ? (definitions[act.type] as any).behavior(act.config) : null;

    // current activity data
    let rows: Prisma.SubmissionGetPayload<object>[] = [];
    if (act && behavior.interactive) {
      rows = await this.prisma.submission.findMany({ where: { sessionActivityId: act.id }, orderBy: { createdAt: 'asc' } });
    }
    const aggInput: AggSubmission[] = rows.map((r) => ({
      id: r.id, participantId: r.participantId, payload: JSON.parse(r.payload), status: r.status as SubmissionStatus, key: r.key, createdAt: r.createdAt.getTime(), correct: r.correct, score: r.score,
    }));
    const full: Results | null = act && behavior.interactive ? (definitions[act.type] as any).aggregate(act.config, aggInput) : null;
    const visibleRows = rows.filter((r) => r.status !== 'hidden');
    const counts: Counts = {
      participants: active.length,
      online: active.filter((p) => online.has(p.id)).length,
      responses: visibleRows.length,
      respondents: new Set(visibleRows.map((r) => r.participantId)).size,
    };

    const info: SessionInfo = {
      id: rt.id, title: rt.title, pin: rt.pin, mode: rt.mode, status: rt.status, theme: rt.theme, collectNames: rt.collectNames, activityCount: rt.activities.length,
    };
    const publicActivity: PublicActivity | null = act
      ? {
          id: act.id, key: act.key, index: act.position, type: act.type, interactive: !!behavior.interactive,
          config: (definitions[act.type] as any).publicConfig(act.config, { revealCorrect: state.correctVisible }) as AnyConfig,
        }
      : null;

    const showLeaderboard = state.leaderboardVisible || state.phase === 'ended';
    const standings = await this.standingsFor(rt, 'revealed');
    const leaderboard = showLeaderboard && standings.length ? standings.slice(0, 10) : null;
    const recentNames = state.phase === 'lobby' || state.phase === 'standby' ? active.sort((a, b) => b.joinedAt - a.joinedAt).slice(0, 40).map((p) => p.name) : [];

    const audienceResults = full && state.resultsVisible ? redactResults(full) : null;
    const base = (resultsOk: boolean): BaseSnapshot => ({
      session: info, state, serverNow: now, activity: publicActivity, counts, results: resultsOk ? audienceResults : null, leaderboard, recentNames,
    });

    const projector: ProjectorSnapshot = { role: 'projector', ...base(true) };

    // presenter extras
    const groups = await this.prisma.submission.groupBy({ by: ['sessionActivityId'], where: { sessionId: rt.id, status: { not: 'hidden' } }, _count: { _all: true } });
    const byAct = new Map(groups.map((g) => [g.sessionActivityId, g._count._all]));
    const metas = this.meta(rt);
    const outline: OutlineItem[] = rt.activities.map((a, i) => ({
      index: i, key: a.key, type: a.type, title: (definitions[a.type] as any).titleOf(a.config), interactive: metas[i].interactive,
      completed: a.completed, answerRevealed: a.answerRevealed, responses: byAct.get(a.id) ?? 0,
    }));
    const moderation: ModerationItem[] =
      act && (act.type === 'wordcloud' || act.type === 'open')
        ? rows
            .slice()
            .reverse()
            .slice(0, 300)
            .map((r) => ({ id: r.id, participantName: rt.participants.get(r.participantId)?.name ?? '?', text: JSON.parse(r.payload).text as string, status: r.status as SubmissionStatus, key: r.key, createdAt: r.createdAt.getTime() }))
        : [];
    const perPerson = new Map<string, number>();
    for (const r of visibleRows) perPerson.set(r.participantId, (perPerson.get(r.participantId) ?? 0) + 1);
    const participants: ParticipantInfo[] = active
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => ({ id: p.id, name: p.name, online: online.has(p.id), joinedAt: p.joinedAt, responses: perPerson.get(p.id) ?? 0 }));

    const presenter: PresenterSnapshot = {
      role: 'presenter',
      ...base(true),
      results: full, // the presenter always sees live results
      fullConfig: act ? act.config : null,
      behavior,
      outline,
      moderation,
      participants,
      available: rt.status === 'live' ? availableActions(state, metas, now) : [],
      standings: standings.slice(0, 50),
    };

    const standingById = new Map(standings.map((s) => [s.participantId, s]));
    const participantResultsOk = !!behavior?.shareResults;
    const forParticipant = (participantId: string): ParticipantSnapshot | null => {
      const p = rt.participants.get(participantId);
      if (!p || p.removed) return null;
      const mine: MySubmission[] = rows
        .filter((r) => r.participantId === participantId)
        .map((r) => ({
          id: r.id,
          slot: r.slot,
          payload: JSON.parse(r.payload),
          status: r.status === 'pending' ? 'pending' : 'visible',
          correct: state.correctVisible && behavior?.hasCorrectAnswer ? r.correct : null,
          score: state.correctVisible && behavior?.hasCorrectAnswer ? r.score : null,
        }));
      const standing = standingById.get(participantId) ?? null;
      return {
        role: 'participant',
        ...base(participantResultsOk),
        me: { id: p.id, name: p.name, submissions: mine, totalScore: standing?.score ?? 0, standing: showLeaderboard ? standing : null },
      };
    };

    return { presenter, projector, forParticipant, participantsSeeLiveData: !!audienceResults && participantResultsOk };
  }

  // ---------------------------------------------------------------------------------
  // Listing, deletion, housekeeping
  // ---------------------------------------------------------------------------------

  async listSessions(): Promise<SessionSummary[]> {
    const rows = await this.prisma.session.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { _count: { select: { participants: true, submissions: true } } },
    });
    return rows.map((s) => ({
      id: s.id, title: s.title, pin: s.livePin, mode: s.mode as SessionMode, status: s.status === 'ended' ? 'ended' : 'live', presentationId: s.presentationId,
      participantCount: s._count.participants, responseCount: s._count.submissions, createdAt: s.createdAt.toISOString(), endedAt: s.endedAt?.toISOString() ?? null,
    }));
  }

  async deleteSession(id: string): Promise<void> {
    const s = await this.prisma.session.findUnique({ where: { id }, select: { status: true } });
    if (!s) throw notFound('Session not found');
    if (s.status === 'live') throw new AppError(409, 'SESSION_LIVE', 'End the session before deleting its results.');
    await this.prisma.session.delete({ where: { id } });
    this.cache.delete(id);
  }

  /** End live sessions nobody has touched for `sessionIdleHours`. */
  async endIdleSessions(now = Date.now()): Promise<number> {
    const cutoff = now - this.config.sessionIdleHours * 3600_000;
    const live = await this.prisma.session.findMany({ where: { status: 'live' }, select: { id: true, lastActivityAt: true } });
    let ended = 0;
    for (const s of live) {
      const rt = this.cache.has(s.id) ? await this.runtime(s.id) : null;
      const last = Math.max(s.lastActivityAt.getTime(), rt?.lastActivityAt ?? 0);
      if (last < cutoff) {
        const r = await this.runtime(s.id);
        await this.withLock(r, () => this.applyAction(r, { type: 'end' })).catch(() => undefined);
        ended++;
      }
    }
    return ended;
  }

  shutdown() {
    for (const p of this.cache.values()) void p.then((rt) => rt.timer && clearTimeout(rt.timer)).catch(() => undefined);
  }
}
