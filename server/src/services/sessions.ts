import { EventEmitter } from 'node:events';
import { randomBytes, randomInt } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import {
  DEFAULT_FEATURES, PULSE_VALUES, QA_MAX_OPEN_PER_PERSON, SIM_NAMES, SIM_QUESTIONS, TEAM_PRESETS,
  availableActions, cleanText, computeTeamStandings, decideBranch, definitions, initialState, mergedKey, nameKey, pulseSummary, quizKind,
  redactResults, resolveFeatures, scoreQuiz, seededRng, showsActivity, simulatedAnswer, smallestTeam, sortQuestions, standingsFromRuns,
  suggestMerges, transition, validateQuestion, voteProblem,
  type AccessGrantInfo, type Action, type ActivityMeta, type AggSubmission, type AnyConfig, type AudienceQuestion, type BaseSnapshot, type Counts,
  type DelegateRole, type FeaturesPatch, type JoinLookup, type JoinResponse, type ModerationItem, type MySubmission, type OutlineItem,
  type ParticipantInfo, type ParticipantSnapshot, type PresenterSnapshot, type ProjectorSnapshot, type PublicActivity, type PulseEventLite,
  type PulseValue, type QuestionStatus, type QuizConfig, type Results, type ReviewItem, type RunResults, type RunScoring, type SelfPacedProgress,
  type SelfPacedView, type SessionFeatures, type SessionInfo, type SessionMode, type SessionState, type SessionSummary, type SlideType,
  type StaffRole, type Standing, type SubmissionStatus, type TeamInfo, type TeamStanding, type Theme,
} from '@classinteract/shared';
import { permissionsOf } from '@classinteract/shared';
import type { Auth } from '../auth';
import { hashToken, newToken } from '../auth';
import type { Config } from '../config';
import { AppError, notFound } from '../lib/errors';
import type { TextFilter } from '../lib/moderation';
import { randomName } from '../lib/names';

/**
 * control   the state changed (everyone needs a new snapshot)
 * data      a response arrived (presenter, projector and phones that see live results)
 * roster    someone joined or left
 * qa        a question was asked, voted on or moderated (presenters, phones, the projector when it shows Q&A)
 * pulse     an understanding signal changed (presenters; the projector only while it shows the pulse)
 */
export type ChangeScope = 'control' | 'data' | 'roster' | 'qa' | 'pulse';
export interface ChangeEvent {
  sessionId: string;
  scope: ChangeScope;
}

interface RtRun {
  id: string;
  number: number;
  scoring: RunScoring;
  answerRevealed: boolean;
  completed: boolean;
  startedAt: number;
  merges: Record<string, string>;
}
interface RtActivity {
  id: string;
  key: string;
  position: number;
  type: SlideType;
  config: any;
  seed: string;
  /** Oldest first; the last one is the current run. */
  runs: RtRun[];
}
interface RtParticipant {
  id: string;
  name: string;
  removed: boolean;
  joinedAt: number;
  teamId: string | null;
  learnerId: string | null;
  simulated: boolean;
}
interface RtQuestion {
  id: string;
  participantId: string | null;
  anonymous: boolean;
  authorName: string | null;
  text: string;
  status: QuestionStatus;
  pinned: boolean;
  answered: boolean;
  createdAt: number;
  voters: Set<string>;
}
interface RtTeam {
  id: string;
  name: string;
  color: string;
  position: number;
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
  features: SessionFeatures;
  rehearsal: boolean;
  activities: RtActivity[];
  participants: Map<string, RtParticipant>;
  tokens: Map<string, string>; // tokenHash -> participantId
  questions: Map<string, RtQuestion>;
  teams: RtTeam[];
  pulse: Map<string, PulseValue>;
  pulseEvents: PulseEventLite[];
  lastActivityAt: number;
  /** The control screen that made the last change: a different screen acting on an older version is refused. */
  lastActor: string | null;
  timer?: NodeJS.Timeout;
  simTimers: Set<NodeJS.Timeout>;
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
  /** The projector shows Q&A or the pulse right now. */
  projectorShowsQa: boolean;
  projectorShowsPulse: boolean;
}

export interface Actor {
  /** Distinguishes control screens (a socket id, "studio", "timer"). */
  id: string;
  role: StaffRole;
}

const GRACE_MS = 1500;
const MAX_NAME = 24;
const SYSTEM: Actor = { id: 'system', role: 'owner' };

const isUnique = (e: unknown): e is Prisma.PrismaClientKnownRequestError => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
const parseJson = <T>(s: string, fallback: T): T => {
  try { return JSON.parse(s) as T; } catch { return fallback; }
};
/** Actions where acting on an out-of-date screen could contradict another presenter. */
const VERSIONED: ReadonlySet<Action['type']> = new Set(['start', 'next', 'previous', 'goto', 'standby', 'open', 'close', 'complete', 'revealResults', 'hideResults', 'revealCorrect', 'hideCorrect', 'showLeaderboard', 'hideLeaderboard', 'end', 'runAgain']);

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
      include: {
        activities: { orderBy: { position: 'asc' }, include: { runs: { orderBy: { number: 'asc' } } } },
        participants: true,
        questions: { include: { votes: { select: { participantId: true } } } },
        teams: { orderBy: { position: 'asc' } },
        pulses: true,
      },
    });
    if (!s) throw notFound('Session not found');
    const events = await this.prisma.pulseEvent.findMany({ where: { sessionId }, orderBy: { at: 'asc' }, take: 5000 });
    const rt: Runtime = {
      id: s.id,
      pin: s.pin,
      title: s.title,
      theme: JSON.parse(s.theme),
      mode: s.mode as SessionMode,
      collectNames: s.collectNames,
      status: s.status === 'ended' ? 'ended' : 'live',
      state: { ...initialState(), ...JSON.parse(s.state) },
      features: resolveFeatures(parseJson(s.features, {})),
      rehearsal: s.rehearsal,
      activities: s.activities.map((a) => ({
        id: a.id, key: a.key, position: a.position, type: a.type as SlideType, config: JSON.parse(a.config), seed: a.seed,
        runs: a.runs.map((r) => ({ id: r.id, number: r.number, scoring: r.scoring as RunScoring, answerRevealed: r.answerRevealed, completed: r.completed, startedAt: r.startedAt.getTime(), merges: parseJson(r.merges, {}) })),
      })),
      participants: new Map(s.participants.map((p) => [p.id, { id: p.id, name: p.name, removed: p.removed, joinedAt: p.joinedAt.getTime(), teamId: p.teamId, learnerId: p.learnerId, simulated: p.simulated }])),
      tokens: new Map(s.participants.map((p) => [p.tokenHash, p.id])),
      questions: new Map(s.questions.map((q) => [q.id, {
        id: q.id, participantId: q.participantId, anonymous: q.anonymous, authorName: q.authorName, text: q.text, status: q.status as QuestionStatus,
        pinned: q.pinned, answered: q.answered, createdAt: q.createdAt.getTime(), voters: new Set(q.votes.map((v) => v.participantId)),
      }])),
      teams: s.teams.map((t) => ({ id: t.id, name: t.name, color: t.color, position: t.position })),
      pulse: new Map(s.pulses.map((p) => [p.participantId, p.value as PulseValue])),
      pulseEvents: events.map((e) => ({ at: e.at.getTime(), value: e.value as PulseValue | '', previous: e.previous as PulseValue | '' })),
      lastActivityAt: s.lastActivityAt.getTime(),
      lastActor: null,
      simTimers: new Set(),
      queue: Promise.resolve(),
      standings: null,
    };
    // Activities created before runs existed always have run #1 (the migration adds it); make sure, defensively.
    for (const a of rt.activities) if (a.runs.length === 0) a.runs.push(await this.createRun(rt.id, a.id, 1, 'counted'));
    this.scheduleTimer(rt);
    return rt;
  }

  private async createRun(sessionId: string, activityId: string, number: number, scoring: RunScoring): Promise<RtRun> {
    const r = await this.prisma.activityRun.create({ data: { sessionId, sessionActivityId: activityId, number, scoring } });
    return { id: r.id, number, scoring, answerRevealed: false, completed: false, startedAt: r.startedAt.getTime(), merges: {} };
  }

  private withLock<T>(rt: Runtime, fn: () => Promise<T>): Promise<T> {
    const run = rt.queue.then(fn, fn);
    rt.queue = run.catch(() => undefined);
    return run;
  }

  private current(a: RtActivity): RtRun {
    return a.runs[a.runs.length - 1];
  }

  private meta(rt: Runtime): ActivityMeta[] {
    return rt.activities.map((a) => {
      const b = definitions[a.type].behavior(a.config);
      const run = this.current(a);
      return { interactive: b.interactive, hasCorrectAnswer: b.hasCorrectAnswer, liveResults: b.liveResults, timeLimitSec: b.timeLimitSec, autoOpen: b.autoOpen, completed: run.completed, answerRevealed: run.answerRevealed };
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

  async createSession(presentationId: string, opts: { collectNames: boolean; mode: SessionMode; features?: FeaturesPatch; rehearsal?: boolean }): Promise<{ id: string; pin: string }> {
    const p = await this.prisma.presentation.findUnique({ where: { id: presentationId }, include: { activities: { orderBy: { position: 'asc' } } } });
    if (!p) throw notFound('Presentation not found');
    if (p.activities.length === 0) throw new AppError(422, 'EMPTY_PRESENTATION', 'Add at least one slide before starting a session.');
    if (opts.mode === 'selfpaced' && !p.activities.some((a) => definitions[a.type as SlideType]?.interactive)) {
      throw new AppError(422, 'EMPTY_PRESENTATION', 'A self-paced session needs at least one interactive activity.');
    }
    const features = mergeFeatures(DEFAULT_FEATURES, opts.features ?? {});
    features.rehearsal = !!opts.rehearsal;
    if (opts.rehearsal) features.continuity = false; // rehearsals never touch anyone's cross-session record

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
            rehearsal: !!opts.rehearsal,
            features: JSON.stringify(features),
            pin,
            livePin: pin,
            state: JSON.stringify(initialState()),
            activities: { create: p.activities.map((a) => ({ key: a.key, position: a.position, type: a.type, config: a.config, seed: randomBytes(12).toString('hex') })) },
          },
          include: { activities: true },
        });
        await this.prisma.activityRun.createMany({ data: s.activities.map((a) => ({ sessionId: s.id, sessionActivityId: a.id, number: 1, scoring: 'counted' })) });
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
    const s = await this.prisma.session.findUnique({ where: { livePin: pin }, select: { id: true, title: true, collectNames: true, features: true } });
    if (!s) {
      // distinguish "ended" from "never existed" for a kinder message
      const ended = await this.prisma.session.findFirst({ where: { pin, status: 'ended' }, orderBy: { endedAt: 'desc' }, select: { id: true, title: true, collectNames: true } });
      if (ended) return { sessionId: ended.id, title: ended.title, collectNames: ended.collectNames, status: 'ended', continuity: false };
      throw notFound('No live session with that code. Check the digits and try again.');
    }
    return { sessionId: s.id, title: s.title, collectNames: s.collectNames, status: 'live', continuity: resolveFeatures(parseJson(s.features, {})).continuity };
  }

  // ---------------------------------------------------------------------------------
  // Participants
  // ---------------------------------------------------------------------------------

  async join(req: { pin: string; name?: string; token?: string; learnerKey?: string; remember?: boolean; shareProgress?: boolean }): Promise<JoinResponse> {
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

      // Optional continuity: link to (or create) a pseudonymous learner identity. Never keyed on the display name.
      let learnerId: string | null = null;
      let learnerKey: string | undefined;
      if (rt.features.continuity && !rt.rehearsal) {
        if (req.learnerKey) {
          const l = await this.prisma.learner.findUnique({ where: { keyHash: hashToken(req.learnerKey) } });
          if (l) {
            learnerId = l.id;
            learnerKey = req.learnerKey;
            await this.prisma.learner.update({ where: { id: l.id }, data: { lastSeenAt: new Date(), ...(req.shareProgress !== undefined ? { shareProgress: req.shareProgress } : {}) } });
          }
        }
        if (!learnerId && req.remember) {
          learnerKey = newToken();
          const l = await this.prisma.learner.create({ data: { keyHash: hashToken(learnerKey), shareProgress: !!req.shareProgress } });
          learnerId = l.id;
        }
      }

      const teamId = rt.features.teams.enabled && rt.features.teams.assignment === 'auto' ? smallestTeam(this.teamRefs(rt))?.id ?? null : null;
      const token = newToken();
      for (let attempt = 0; attempt < 8; attempt++) {
        const candidate = !rt.collectNames && attempt > 2 ? `${name} ${randomInt(2, 99)}` : name;
        try {
          const p = await this.prisma.participant.create({ data: { sessionId: rt.id, name: candidate, nameKey: nameKey(candidate), tokenHash: hashToken(token), teamId, learnerId } });
          rt.participants.set(p.id, { id: p.id, name: p.name, removed: false, joinedAt: p.joinedAt.getTime(), teamId, learnerId, simulated: false });
          rt.tokens.set(p.tokenHash, p.id);
          this.emit(rt.id, 'roster');
          return { sessionId: rt.id, participantId: p.id, name: p.name, token, resumed: false, ...(learnerKey ? { learnerKey } : {}) };
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
      const theirQuestions = [...rt.questions.values()].filter((q) => q.participantId === participantId && q.status !== 'dismissed');
      await this.prisma.$transaction([
        this.prisma.participant.update({ where: { id: participantId }, data: { removed: true } }),
        this.prisma.submission.updateMany({ where: { participantId }, data: { status: 'hidden' } }),
        this.prisma.audienceQuestion.updateMany({ where: { id: { in: theirQuestions.map((q) => q.id) } }, data: { status: 'hidden' } }),
        this.prisma.questionVote.deleteMany({ where: { participantId } }),
      ]);
      p.removed = true;
      for (const q of theirQuestions) q.status = 'hidden';
      for (const q of rt.questions.values()) q.voters.delete(participantId);
      if (rt.pulse.has(participantId)) await this.setPulseLocked(rt, participantId, null);
      rt.standings = null;
      this.events.emit('kicked', { sessionId, participantId });
      this.emit(sessionId, 'control');
    });
  }

  // ---------------------------------------------------------------------------------
  // Presenter actions
  // ---------------------------------------------------------------------------------

  async act(sessionId: string, action: Action, opts: { actor?: Actor; expectVersion?: number; scoring?: RunScoring; ignoreBranch?: boolean } = {}): Promise<SessionState> {
    const rt = await this.runtime(sessionId);
    return this.withLock(rt, async () => {
      const actor = opts.actor ?? SYSTEM;
      if (opts.expectVersion !== undefined && VERSIONED.has(action.type) && opts.expectVersion !== rt.state.version && rt.lastActor && rt.lastActor !== actor.id) {
        throw new AppError(409, 'STALE', 'Another control screen just changed the session. Check what is on screen and try again.');
      }
      if (rt.mode === 'selfpaced' && ['start', 'next', 'previous', 'goto', 'open', 'runAgain'].includes(action.type)) {
        throw new AppError(409, 'SELF_PACED', 'This is a self-paced session: participants move through the activities themselves.');
      }
      let resolved: Action = action;
      if (action.type === 'next' && !opts.ignoreBranch) {
        const b = await this.branchFor(rt);
        if (b?.targetIndex !== null && b?.targetIndex !== undefined && b.targetIndex !== rt.state.activityIndex) resolved = { type: 'goto', index: b.targetIndex };
      }
      const state = await this.applyAction(rt, resolved, opts.scoring);
      if (actor.id !== SYSTEM.id) rt.lastActor = actor.id;
      return state;
    });
  }

  private async applyAction(rt: Runtime, action: Action, scoring: RunScoring = 'practice'): Promise<SessionState> {
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
      const a = rt.activities[r.completedIndex];
      ops.push(this.prisma.activityRun.update({ where: { id: this.current(a).id }, data: { completed: true } }));
      ops.push(this.prisma.sessionActivity.update({ where: { id: a.id }, data: { completed: true } }));
    }
    if (r.answerRevealed) {
      const a = rt.activities[r.answerRevealed.index];
      ops.push(this.prisma.activityRun.update({ where: { id: this.current(a).id }, data: { answerRevealed: r.answerRevealed.value } }));
      if (a.runs.length === 1) ops.push(this.prisma.sessionActivity.update({ where: { id: a.id }, data: { answerRevealed: r.answerRevealed.value } }));
    }
    let newRun: RtRun | null = null;
    if (r.newRun) {
      const a = rt.activities[rt.state.activityIndex];
      const id = `run${this.current(a).number + 1}_${randomBytes(6).toString('hex')}_${a.id}`.slice(0, 60);
      newRun = { id, number: this.current(a).number + 1, scoring, answerRevealed: false, completed: false, startedAt: now, merges: {} };
      ops.push(this.prisma.activityRun.create({ data: { id, sessionId: rt.id, sessionActivityId: a.id, number: newRun.number, scoring, startedAt: new Date(now) } }));
    }
    await this.prisma.$transaction(ops);

    if (r.completedIndex !== null) this.current(rt.activities[r.completedIndex]).completed = true;
    if (r.answerRevealed) {
      this.current(rt.activities[r.answerRevealed.index]).answerRevealed = r.answerRevealed.value;
      rt.standings = null;
    }
    if (newRun) {
      rt.activities[rt.state.activityIndex].runs.push(newRun);
      rt.standings = null;
    }
    rt.state = r.state;
    rt.lastActivityAt = now;
    if (ending) {
      rt.status = 'ended';
      this.stopSims(rt);
    }
    this.scheduleTimer(rt);
    this.emit(rt.id, 'control');
    if (rt.rehearsal && r.state.phase === 'open') this.scheduleSimAnswers(rt);
    return rt.state;
  }

  async setMode(sessionId: string, mode: SessionMode): Promise<void> {
    const rt = await this.runtime(sessionId);
    await this.withLock(rt, async () => {
      if (rt.status !== 'live') throw new AppError(409, 'SESSION_ENDED', 'This session has ended.');
      if (rt.mode === 'selfpaced' || mode === 'selfpaced') throw new AppError(409, 'SELF_PACED', 'A self-paced session cannot switch to live presenting (start a new session instead).');
      await this.prisma.session.update({ where: { id: rt.id }, data: { mode } });
      rt.mode = mode;
      this.emit(rt.id, 'control');
    });
  }

  async updateFeatures(sessionId: string, patch: FeaturesPatch): Promise<SessionFeatures> {
    const rt = await this.runtime(sessionId);
    return this.withLock(rt, async () => {
      if (rt.status !== 'live') throw new AppError(409, 'SESSION_ENDED', 'This session has ended.');
      const next = mergeFeatures(rt.features, patch);
      if (patch.teams?.enabled && rt.teams.length === 0) {
        rt.features = next;
        await this.setupTeamsLocked(rt, 4);
      }
      await this.prisma.session.update({ where: { id: rt.id }, data: { features: JSON.stringify(next) } });
      rt.features = next;
      if (patch.selfPaced?.deadlineAt !== undefined && rt.mode === 'selfpaced' && rt.state.phase === 'open') {
        rt.state = { ...rt.state, deadlineAt: next.selfPaced.deadlineAt, version: rt.state.version + 1 };
        await this.prisma.session.update({ where: { id: rt.id }, data: { state: JSON.stringify(rt.state) } });
        this.scheduleTimer(rt);
      }
      rt.standings = null;
      this.emit(rt.id, 'control');
      return next;
    });
  }

  /** Self-paced sessions: open for responses (with the configured deadline) or close. */
  async selfPaced(sessionId: string, op: 'open' | 'close'): Promise<void> {
    const rt = await this.runtime(sessionId);
    await this.withLock(rt, async () => {
      if (rt.mode !== 'selfpaced') throw new AppError(409, 'INVALID_PHASE', 'This session is presented live.');
      if (rt.status !== 'live') throw new AppError(409, 'SESSION_ENDED', 'This session has ended.');
      const now = Date.now();
      if (op === 'open') {
        if (rt.state.phase === 'open') throw new AppError(409, 'ALREADY_OPEN', 'Responses are already open.');
        const deadline = rt.features.selfPaced.deadlineAt;
        if (deadline && deadline <= now) throw new AppError(409, 'INVALID', 'The deadline has already passed. Set a later deadline first.');
        rt.state = { ...rt.state, phase: 'open', activityIndex: -1, openedAt: now, deadlineAt: deadline, resultsVisible: false, correctVisible: false, version: rt.state.version + 1 };
      } else {
        if (rt.state.phase !== 'open') throw new AppError(409, 'INVALID_PHASE', 'Responses are not open.');
        rt.state = { ...rt.state, phase: 'closed', openedAt: null, deadlineAt: null, version: rt.state.version + 1 };
      }
      await this.prisma.session.update({ where: { id: rt.id }, data: { state: JSON.stringify(rt.state), lastActivityAt: new Date(now) } });
      rt.standings = null;
      this.scheduleTimer(rt);
      this.emit(rt.id, 'control');
      if (op === 'open' && rt.rehearsal) this.scheduleSimAnswers(rt);
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
        if (rt.state.phase !== 'open' || rt.state.openedAt !== openedAt) return;
        if (rt.mode === 'selfpaced') {
          rt.state = { ...rt.state, phase: 'closed', openedAt: null, deadlineAt: null, version: rt.state.version + 1 };
          await this.prisma.session.update({ where: { id: rt.id }, data: { state: JSON.stringify(rt.state) } });
          rt.standings = null;
          this.emit(rt.id, 'control');
        } else {
          await this.applyAction(rt, { type: 'close' });
        }
      }).catch((e) => console.error('[timer] auto-close failed', e));
    }, delay + 20);
    rt.timer.unref?.();
  }

  // ---------------------------------------------------------------------------------
  // Branching
  // ---------------------------------------------------------------------------------

  /** The branch rule of the quiz on screen, applied to the class's correct rate on its current run. */
  private async branchFor(rt: Runtime): Promise<(ReturnType<typeof decideBranch> & { targetIndex: number | null }) | null> {
    if (!showsActivity(rt.state)) return null;
    const a = rt.activities[rt.state.activityIndex];
    const rule = a.type === 'quiz' ? (a.config as QuizConfig).branch : undefined;
    if (!rule) return null;
    const rows = await this.prisma.submission.findMany({ where: { runId: this.current(a).id, status: { not: 'hidden' } }, select: { correct: true } });
    const decision = decideBranch(rule, rows.length ? rows.filter((r) => r.correct).length / rows.length : null);
    const targetIndex = decision.targetId ? rt.activities.findIndex((x) => x.key === decision.targetId) : null;
    return { ...decision, targetIndex: targetIndex === -1 ? null : targetIndex };
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
      const selfPaced = rt.mode === 'selfpaced';
      if (selfPaced) {
        if (state.phase !== 'open') throw new AppError(409, 'NOT_ACCEPTING', 'Responses are closed.');
        if (state.deadlineAt && now > state.deadlineAt + GRACE_MS) throw new AppError(409, 'NOT_ACCEPTING', 'The deadline has passed.');
      } else {
        if (state.phase !== 'open' || state.activityIndex !== act.position) throw new AppError(409, 'NOT_ACCEPTING', 'Responses are closed.');
        if (state.deadlineAt && now > state.deadlineAt + GRACE_MS) throw new AppError(409, 'NOT_ACCEPTING', 'Time is up.');
      }

      const def = definitions[act.type] as any;
      const behavior = def.behavior(act.config);
      if (!behavior.interactive) throw new AppError(409, 'NOT_ACCEPTING', 'This slide does not take responses.');
      const v = def.validate(act.config, rawPayload);
      if (!v.ok) throw new AppError(400, 'INVALID', v.message);
      for (const text of def.extractText(act.config, v.payload) as string[]) {
        if (this.filter.isBlocked(text)) throw new AppError(422, 'MODERATED', 'Please keep responses respectful and try again.');
      }
      const run = this.current(act);
      const used = await this.prisma.submission.count({ where: { runId: run.id, participantId } });
      if (used >= behavior.maxSubmissions) {
        throw new AppError(409, behavior.maxSubmissions > 1 ? 'LIMIT_REACHED' : 'DUPLICATE', behavior.maxSubmissions > 1 ? `You have used all ${behavior.maxSubmissions} responses.` : 'You have already responded.');
      }

      // self-paced: no shared clock, so no speed bonus
      const elapsedMs = !selfPaced && state.openedAt ? Math.max(0, now - state.openedAt) : 0;
      const ev = def.evaluate(selfPaced ? { ...act.config, speedBonus: false } : act.config, v.payload, { elapsedMs, seed: act.seed }) as { correct: boolean | null; score: number; review?: boolean; detail?: string };
      try {
        const row = await this.prisma.submission.create({
          data: {
            sessionId: rt.id,
            sessionActivityId: act.id,
            runId: run.id,
            participantId,
            slot: used,
            payload: JSON.stringify(v.payload),
            key: v.key,
            status: v.status,
            correct: ev.correct,
            score: ev.score,
            responseMs: elapsedMs,
            review: ev.review ? 'pending' : null,
            detail: ev.detail ?? null,
          },
        });
        rt.lastActivityAt = now;
        if (selfPaced) rt.standings = null;
        this.emit(rt.id, 'data');
        const reveal = selfPaced && this.selfPacedReveal(rt);
        return {
          submission: {
            id: row.id, slot: row.slot, payload: v.payload, status: row.status === 'pending' ? 'pending' : 'visible',
            correct: reveal && behavior.hasCorrectAnswer ? row.correct : null, score: reveal && behavior.hasCorrectAnswer ? row.score : null, detail: reveal ? row.detail : null,
          },
        };
      } catch (e) {
        if (isUnique(e)) {
          // DB constraint caught a concurrent or repeated submission
          throw new AppError(409, 'DUPLICATE', v.key ? 'You already submitted that.' : 'You have already responded.');
        }
        throw e;
      }
    });
  }

  private selfPacedReveal(rt: Runtime): boolean {
    const policy = rt.features.selfPaced.reveal;
    if (policy === 'never') return false;
    if (policy === 'immediately') return true;
    return rt.state.phase === 'closed' || rt.state.phase === 'ended';
  }

  private onScreen(rt: Runtime): RtActivity | undefined {
    return showsActivity(rt.state) ? rt.activities[rt.state.activityIndex] : undefined;
  }

  async moderate(sessionId: string, cmd: { status: 'visible' | 'hidden'; ids?: string[]; key?: string }): Promise<number> {
    const rt = await this.runtime(sessionId);
    return this.withLock(rt, async () => {
      const act = this.onScreen(rt);
      if (!act) throw new AppError(409, 'NOT_STARTED', 'No activity is on screen.');
      if (!cmd.ids?.length && !cmd.key) throw new AppError(400, 'INVALID', 'Nothing to moderate.');
      const run = this.current(act);
      // hiding a merged group hides every term merged into it
      const keys = cmd.key ? [cmd.key, ...Object.entries(run.merges).filter(([, into]) => into === cmd.key).map(([k]) => k)] : [];
      const where: Prisma.SubmissionWhereInput = { sessionId: rt.id, runId: run.id, ...(cmd.ids?.length ? { id: { in: cmd.ids } } : { key: { in: keys } }) };
      const r = await this.prisma.submission.updateMany({ where, data: { status: cmd.status } });
      rt.standings = null;
      this.emit(rt.id, 'data');
      return r.count;
    });
  }

  /** Accept or reject every answer in the current run that shares this grouping key (typed, numeric, hotspot). */
  async review(sessionId: string, key: string, accept: boolean): Promise<number> {
    const rt = await this.runtime(sessionId);
    return this.withLock(rt, async () => {
      const act = this.onScreen(rt);
      if (!act || act.type !== 'quiz') throw new AppError(409, 'NOT_STARTED', 'No quiz is on screen.');
      const c = act.config as QuizConfig;
      const run = this.current(act);
      const rows = await this.prisma.submission.findMany({ where: { runId: run.id, review: { not: null }, ...(quizKind(c) === 'hotspot' ? { id: key } : { key }) } });
      if (!rows.length) throw new AppError(404, 'NOT_FOUND', 'Nothing to review for that answer.');
      await this.prisma.$transaction(rows.map((r) => this.prisma.submission.update({
        where: { id: r.id },
        data: { review: accept ? 'accepted' : 'rejected', correct: accept, score: accept ? scoreQuiz(c, true, r.responseMs ?? 0) : 0, detail: `${accept ? 'Accepted' : 'Not accepted'} by the presenter. ${r.detail ?? ''}`.trim() },
      })));
      rt.standings = null;
      this.emit(rt.id, 'control');
      return rows.length;
    });
  }

  /** Merge word-cloud terms (the originals are kept; only how they are counted changes). */
  async merge(sessionId: string, keys: string[], into: string | null, unmergeKey?: string): Promise<void> {
    const rt = await this.runtime(sessionId);
    await this.withLock(rt, async () => {
      const act = this.onScreen(rt);
      if (!act || act.type !== 'wordcloud') throw new AppError(409, 'NOT_STARTED', 'No word cloud is on screen.');
      const run = this.current(act);
      const merges = { ...run.merges };
      if (unmergeKey !== undefined) {
        delete merges[unmergeKey];
        for (const [k, v] of Object.entries(merges)) if (v === unmergeKey) delete merges[k];
      } else if (into) {
        for (const k of keys) if (k !== into) merges[k] = into;
        delete merges[into];
      }
      await this.prisma.activityRun.update({ where: { id: run.id }, data: { merges: JSON.stringify(merges) } });
      run.merges = merges;
      this.emit(rt.id, 'data');
    });
  }

  // ---------------------------------------------------------------------------------
  // Q&A
  // ---------------------------------------------------------------------------------

  async askQuestion(sessionId: string, participantId: string, rawText: string, anonymous: boolean): Promise<AudienceQuestion> {
    const rt = await this.runtime(sessionId);
    return this.withLock(rt, async () => {
      if (rt.status !== 'live') throw new AppError(410, 'SESSION_ENDED', 'This session has ended.');
      if (!rt.features.qa.enabled) throw new AppError(409, 'QA_OFF', 'Questions are turned off right now.');
      const p = rt.participants.get(participantId);
      if (!p || p.removed) throw new AppError(403, 'REMOVED', 'You are no longer part of this session.');
      const v = validateQuestion(rawText);
      if (!v.ok) throw new AppError(400, 'INVALID', v.message);
      if (this.filter.isBlocked(v.text)) throw new AppError(422, 'MODERATED', 'Please keep questions respectful and try again.');
      const mine = [...rt.questions.values()].filter((q) => q.participantId === participantId && !q.answered && q.status !== 'dismissed' && q.status !== 'hidden');
      if (mine.length >= QA_MAX_OPEN_PER_PERSON) throw new AppError(429, 'LIMIT_REACHED', `You have ${mine.length} questions waiting. Wait for some to be answered first.`);
      if (mine.some((q) => q.text.toLowerCase() === v.text.toLowerCase())) throw new AppError(409, 'DUPLICATE', 'You already asked that.');
      const anon = anonymous && rt.features.qa.allowAnonymous;
      const row = await this.prisma.audienceQuestion.create({
        data: { sessionId: rt.id, participantId, anonymous: anon, authorName: anon ? null : p.name, text: v.text, status: rt.features.qa.premoderate ? 'pending' : 'visible' },
      });
      const q: RtQuestion = { id: row.id, participantId, anonymous: anon, authorName: row.authorName, text: row.text, status: row.status as QuestionStatus, pinned: false, answered: false, createdAt: row.createdAt.getTime(), voters: new Set() };
      rt.questions.set(q.id, q);
      rt.lastActivityAt = Date.now();
      this.emit(rt.id, 'qa');
      return this.questionView(q, participantId);
    });
  }

  async vote(sessionId: string, participantId: string, questionId: string, on: boolean): Promise<{ votes: number }> {
    const rt = await this.runtime(sessionId);
    return this.withLock(rt, async () => {
      if (rt.status !== 'live') throw new AppError(410, 'SESSION_ENDED', 'This session has ended.');
      const p = rt.participants.get(participantId);
      if (!p || p.removed) throw new AppError(403, 'REMOVED', 'You are no longer part of this session.');
      const q = rt.questions.get(questionId);
      if (!q) throw new AppError(404, 'NOT_FOUND', 'That question is no longer here.');
      const problem = voteProblem({ status: q.status, authorId: q.participantId }, participantId);
      if (problem) throw new AppError(409, 'INVALID', problem);
      if (on && !q.voters.has(participantId)) {
        try {
          await this.prisma.questionVote.create({ data: { questionId, participantId } });
        } catch (e) {
          if (!isUnique(e)) throw e; // a double tap: the vote is already there
        }
        q.voters.add(participantId);
      } else if (!on && q.voters.has(participantId)) {
        await this.prisma.questionVote.deleteMany({ where: { questionId, participantId } });
        q.voters.delete(participantId);
      }
      this.emit(rt.id, 'qa');
      return { votes: q.voters.size };
    });
  }

  async moderateQuestion(sessionId: string, op: 'approve' | 'hide' | 'dismiss' | 'pin' | 'unpin' | 'answer' | 'unanswer' | 'delete' | 'highlight', questionId: string, actor: Actor = SYSTEM): Promise<void> {
    const rt = await this.runtime(sessionId);
    await this.withLock(rt, async () => {
      const q = rt.questions.get(questionId);
      if (!q) throw new AppError(404, 'NOT_FOUND', 'That question is no longer here.');
      if (op === 'highlight') {
        if (q.status !== 'visible') throw new AppError(409, 'INVALID', 'Approve the question before showing it on screen.');
        const same = rt.state.highlightQuestionId === q.id;
        await this.applyAction(rt, { type: 'highlightQuestion', questionId: same ? null : q.id });
        rt.lastActor = actor.id;
        return;
      }
      if (op === 'delete') {
        await this.prisma.audienceQuestion.delete({ where: { id: q.id } });
        rt.questions.delete(q.id);
      } else {
        const data: Prisma.AudienceQuestionUpdateInput =
          op === 'approve' ? { status: 'visible' }
          : op === 'hide' ? { status: 'hidden' }
          : op === 'dismiss' ? { status: 'dismissed' }
          : op === 'pin' ? { pinned: true }
          : op === 'unpin' ? { pinned: false }
          : op === 'answer' ? { answered: true, answeredAt: new Date() }
          : { answered: false, answeredAt: null };
        await this.prisma.audienceQuestion.update({ where: { id: q.id }, data });
        if (data.status) q.status = data.status as QuestionStatus;
        if (data.pinned !== undefined) q.pinned = data.pinned as boolean;
        if (data.answered !== undefined) q.answered = data.answered as boolean;
      }
      // a question that leaves the screen-worthy set stops being highlighted
      if (rt.state.highlightQuestionId === q.id && (op === 'delete' || op === 'hide' || op === 'dismiss')) await this.applyAction(rt, { type: 'highlightQuestion', questionId: null });
      this.emit(rt.id, 'qa');
    });
  }

  private questionView(q: RtQuestion, viewer: string | null): AudienceQuestion {
    return {
      id: q.id, text: q.text, authorName: q.anonymous ? null : q.authorName, status: q.status, pinned: q.pinned, answered: q.answered, votes: q.voters.size, createdAt: q.createdAt,
      ...(viewer ? { mine: q.participantId === viewer, voted: q.voters.has(viewer) } : {}),
    };
  }

  // ---------------------------------------------------------------------------------
  // Pulse
  // ---------------------------------------------------------------------------------

  async setPulse(sessionId: string, participantId: string, value: PulseValue | null): Promise<void> {
    const rt = await this.runtime(sessionId);
    await this.withLock(rt, async () => {
      if (rt.status !== 'live') throw new AppError(410, 'SESSION_ENDED', 'This session has ended.');
      if (!rt.features.pulse.enabled) throw new AppError(409, 'PULSE_OFF', 'The understanding check is turned off.');
      const p = rt.participants.get(participantId);
      if (!p || p.removed) throw new AppError(403, 'REMOVED', 'You are no longer part of this session.');
      await this.setPulseLocked(rt, participantId, value);
    });
  }

  private async setPulseLocked(rt: Runtime, participantId: string, value: PulseValue | null) {
    const previous = rt.pulse.get(participantId) ?? null;
    if (previous === value) return;
    const at = new Date();
    await this.prisma.$transaction([
      value
        ? this.prisma.pulseSignal.upsert({ where: { sessionId_participantId: { sessionId: rt.id, participantId } }, create: { sessionId: rt.id, participantId, value, updatedAt: at }, update: { value, updatedAt: at } })
        : this.prisma.pulseSignal.deleteMany({ where: { sessionId: rt.id, participantId } }),
      this.prisma.pulseEvent.create({ data: { sessionId: rt.id, value: value ?? '', previous: previous ?? '', at } }),
    ]);
    if (value) rt.pulse.set(participantId, value);
    else rt.pulse.delete(participantId);
    rt.pulseEvents.push({ at: at.getTime(), value: value ?? '', previous: previous ?? '' });
    if (rt.pulseEvents.length > 5000) rt.pulseEvents.splice(0, rt.pulseEvents.length - 5000);
    this.emit(rt.id, 'pulse');
  }

  // ---------------------------------------------------------------------------------
  // Teams
  // ---------------------------------------------------------------------------------

  private teamRefs(rt: Runtime) {
    const active = [...rt.participants.values()].filter((p) => !p.removed);
    return rt.teams.map((t) => ({ id: t.id, name: t.name, color: t.color, memberIds: active.filter((p) => p.teamId === t.id).map((p) => p.id) }));
  }

  async teams(sessionId: string, cmd: { op: 'setup'; count: number } | { op: 'assign'; participantId: string; teamId: string | null } | { op: 'shuffle' } | { op: 'rename'; teamId: string; name: string }): Promise<void> {
    const rt = await this.runtime(sessionId);
    await this.withLock(rt, async () => {
      if (rt.status !== 'live') throw new AppError(409, 'SESSION_ENDED', 'This session has ended.');
      if (cmd.op === 'setup') await this.setupTeamsLocked(rt, cmd.count);
      else if (cmd.op === 'shuffle') await this.assignAllLocked(rt);
      else if (cmd.op === 'rename') {
        const t = rt.teams.find((x) => x.id === cmd.teamId);
        if (!t) throw notFound('Team not found');
        const name = cleanText(cmd.name).slice(0, 40);
        if (!name) throw new AppError(400, 'INVALID', 'Enter a team name.');
        if (this.filter.isBlocked(name)) throw new AppError(422, 'MODERATED', 'Please choose a different name.');
        await this.prisma.team.update({ where: { id: t.id }, data: { name } });
        t.name = name;
      } else {
        const p = rt.participants.get(cmd.participantId);
        if (!p) throw notFound('Participant not found');
        if (cmd.teamId && !rt.teams.some((t) => t.id === cmd.teamId)) throw notFound('Team not found');
        await this.prisma.participant.update({ where: { id: p.id }, data: { teamId: cmd.teamId } });
        p.teamId = cmd.teamId;
      }
      this.emit(rt.id, 'control');
    });
  }

  private async setupTeamsLocked(rt: Runtime, count: number) {
    await this.prisma.$transaction([
      this.prisma.participant.updateMany({ where: { sessionId: rt.id }, data: { teamId: null } }),
      this.prisma.team.deleteMany({ where: { sessionId: rt.id } }),
    ]);
    rt.teams = [];
    for (let i = 0; i < count; i++) {
      const preset = TEAM_PRESETS[i % TEAM_PRESETS.length];
      const t = await this.prisma.team.create({ data: { sessionId: rt.id, name: preset.name, color: preset.color, position: i } });
      rt.teams.push({ id: t.id, name: t.name, color: t.color, position: i });
    }
    for (const p of rt.participants.values()) p.teamId = null;
    await this.assignAllLocked(rt);
    rt.features = { ...rt.features, teams: { ...rt.features.teams, enabled: true } };
    await this.prisma.session.update({ where: { id: rt.id }, data: { features: JSON.stringify(rt.features) } });
  }

  /** Balanced random assignment of everyone present. */
  private async assignAllLocked(rt: Runtime) {
    if (!rt.teams.length) throw new AppError(409, 'NO_TEAMS', 'Set up teams first.');
    const active = [...rt.participants.values()].filter((p) => !p.removed);
    for (let i = active.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [active[i], active[j]] = [active[j], active[i]];
    }
    const ops = active.map((p, i) => {
      p.teamId = rt.teams[i % rt.teams.length].id;
      return this.prisma.participant.update({ where: { id: p.id }, data: { teamId: p.teamId } });
    });
    if (ops.length) await this.prisma.$transaction(ops);
  }

  // ---------------------------------------------------------------------------------
  // Access links for co-presenters and moderators
  // ---------------------------------------------------------------------------------

  async createGrant(sessionId: string, role: DelegateRole, label: string): Promise<{ id: string; token: string }> {
    const rt = await this.runtime(sessionId);
    if (rt.status !== 'live') throw new AppError(409, 'SESSION_ENDED', 'This session has ended.');
    const token = newToken();
    const g = await this.prisma.accessGrant.create({ data: { sessionId, role, label: cleanText(label).slice(0, 60) || (role === 'moderator' ? 'Moderator' : 'Co-presenter'), tokenHash: hashToken(token) } });
    this.emit(sessionId, 'control');
    return { id: g.id, token };
  }

  async revokeGrant(sessionId: string, grantId: string): Promise<void> {
    const r = await this.prisma.accessGrant.updateMany({ where: { id: grantId, sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (r.count === 0) throw notFound('That access link does not exist or was already revoked.');
    this.events.emit('revoked', { sessionId, grantId });
    this.emit(sessionId, 'control');
  }

  async authDelegate(sessionId: string, token: string): Promise<{ grantId: string; role: DelegateRole; label: string } | null> {
    const g = await this.prisma.accessGrant.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!g || g.sessionId !== sessionId || g.revokedAt) return null;
    return { grantId: g.id, role: g.role as DelegateRole, label: g.label };
  }

  private async grantList(rt: Runtime, online: Map<string, number>): Promise<AccessGrantInfo[]> {
    const rows = await this.prisma.accessGrant.findMany({ where: { sessionId: rt.id }, orderBy: { createdAt: 'asc' } });
    return rows.map((g) => ({ id: g.id, role: g.role as DelegateRole, label: g.label, createdAt: g.createdAt.getTime(), revokedAt: g.revokedAt?.getTime() ?? null, online: online.get(g.id) ?? 0 }));
  }

  // ---------------------------------------------------------------------------------
  // Rehearsal: simulated participants
  // ---------------------------------------------------------------------------------

  async simulate(sessionId: string, count: number): Promise<void> {
    const rt = await this.runtime(sessionId);
    await this.withLock(rt, async () => {
      if (!rt.rehearsal) throw new AppError(403, 'FORBIDDEN', 'Simulated participants are only available in rehearsals.');
      if (rt.status !== 'live') throw new AppError(409, 'SESSION_ENDED', 'This rehearsal has ended.');
      const sims = [...rt.participants.values()].filter((p) => p.simulated && !p.removed);
      if (count < sims.length) {
        const drop = sims.slice(count);
        await this.prisma.participant.updateMany({ where: { id: { in: drop.map((p) => p.id) } }, data: { removed: true } });
        await this.prisma.submission.updateMany({ where: { participantId: { in: drop.map((p) => p.id) } }, data: { status: 'hidden' } });
        for (const p of drop) {
          p.removed = true;
          rt.pulse.delete(p.id);
        }
      }
      const rnd = seededRng(Date.now() & 0xffff);
      for (let i = sims.length; i < count; i++) {
        const token = newToken();
        let name = `${SIM_NAMES[i % SIM_NAMES.length]} (sim)`;
        if ([...rt.participants.values()].some((p) => p.name === name)) name = `${SIM_NAMES[i % SIM_NAMES.length]} ${i + 1} (sim)`;
        const teamId = rt.features.teams.enabled ? smallestTeam(this.teamRefs(rt))?.id ?? null : null;
        const p = await this.prisma.participant.create({ data: { sessionId: rt.id, name, nameKey: nameKey(name), tokenHash: hashToken(token), simulated: true, teamId } });
        rt.participants.set(p.id, { id: p.id, name, removed: false, joinedAt: p.joinedAt.getTime(), teamId, learnerId: null, simulated: true });
        rt.tokens.set(p.tokenHash, p.id);
        if (rt.features.pulse.enabled) await this.setPulseLocked(rt, p.id, PULSE_VALUES[rnd() < 0.6 ? 0 : rnd() < 0.7 ? 1 : 2]);
      }
      // a couple of sample questions with votes, so the Q&A panel has something to show
      const simIds = [...rt.participants.values()].filter((p) => p.simulated && !p.removed).map((p) => p.id);
      if (count > 0 && rt.features.qa.enabled && ![...rt.questions.values()].some((q) => q.participantId && simIds.includes(q.participantId))) {
        for (const [i, text] of SIM_QUESTIONS.slice(0, Math.min(3, simIds.length)).entries()) {
          const row = await this.prisma.audienceQuestion.create({ data: { sessionId: rt.id, participantId: simIds[i], anonymous: i % 2 === 1, authorName: i % 2 === 1 ? null : rt.participants.get(simIds[i])!.name, text, status: 'visible' } });
          const voters = simIds.filter((id, k) => id !== simIds[i] && k % (i + 2) === 0);
          if (voters.length) await this.prisma.questionVote.createMany({ data: voters.map((participantId) => ({ questionId: row.id, participantId })) });
          rt.questions.set(row.id, { id: row.id, participantId: simIds[i], anonymous: row.anonymous, authorName: row.authorName, text, status: 'visible', pinned: false, answered: false, createdAt: row.createdAt.getTime(), voters: new Set(voters) });
        }
      }
      rt.standings = null;
      this.emit(rt.id, 'control');
      this.emit(rt.id, 'qa');
      if (rt.state.phase === 'open') this.scheduleSimAnswers(rt);
    });
  }

  private stopSims(rt: Runtime) {
    for (const t of rt.simTimers) clearTimeout(t);
    rt.simTimers.clear();
  }

  /** Simulated participants answer the open activity at plausible, staggered moments, through the normal submit path. */
  private scheduleSimAnswers(rt: Runtime) {
    this.stopSims(rt);
    const sims = [...rt.participants.values()].filter((p) => p.simulated && !p.removed);
    if (!sims.length) return;
    const targets = rt.mode === 'selfpaced' ? rt.activities.filter((a) => definitions[a.type].interactive) : this.onScreen(rt) ? [this.onScreen(rt)!] : [];
    const window = rt.state.deadlineAt ? Math.max(1500, (rt.state.deadlineAt - Date.now()) * 0.7) : 6000;
    const rnd = seededRng((Date.now() ^ rt.state.version) & 0xffffff);
    for (const sim of sims) {
      const skill = 0.45 + 0.45 * rnd();
      targets.forEach((act, k) => {
        const runId = this.current(act).id;
        const delay = 500 + rnd() * window + k * 900;
        const t = setTimeout(() => {
          rt.simTimers.delete(t);
          if (this.current(act).id !== runId) return;
          const b = definitions[act.type].behavior(act.config as never);
          const times = act.type === 'wordcloud' ? Math.min(b.maxSubmissions, 1 + Math.floor(rnd() * 2)) : 1;
          for (let i = 0; i < times; i++) {
            const payload = simulatedAnswer(act.type, act.config as AnyConfig, act.seed, rnd, skill);
            if (payload) void this.submit(rt.id, sim.id, act.id, payload).catch(() => undefined);
          }
        }, delay);
        t.unref?.();
        rt.simTimers.add(t);
      });
    }
  }

  // ---------------------------------------------------------------------------------
  // Snapshots
  // ---------------------------------------------------------------------------------

  private async standingsFor(rt: Runtime): Promise<Standing[]> {
    if (rt.standings) return rt.standings;
    const scored = rt.activities.filter((a) => definitions[a.type].behavior(a.config as never).hasCorrectAnswer);
    let result: Standing[] = [];
    if (scored.length) {
      const rows = await this.prisma.submission.findMany({
        where: { sessionActivityId: { in: scored.map((a) => a.id) }, status: { not: 'hidden' } },
        select: { runId: true, participantId: true, score: true, correct: true, responseMs: true },
      });
      const runs = scored.flatMap((a) => a.runs.map((r) => ({ id: r.id, activityId: a.id, number: r.number, scoring: r.scoring, answerRevealed: r.answerRevealed })));
      const names = new Map([...rt.participants.values()].filter((p) => !p.removed).map((p) => [p.id, p.name]));
      const includeUnrevealed = rt.mode === 'selfpaced' && this.selfPacedReveal(rt);
      result = standingsFromRuns(runs, rows.map((r) => ({ ...r, responseMs: r.responseMs ?? 0 })), names, { includeUnrevealed });
    }
    rt.standings = result;
    return result;
  }

  private aggregateRun(act: RtActivity, run: RtRun, rows: { id: string; participantId: string; payload: string; status: string; key: string | null; createdAt: Date; correct: boolean | null; score: number }[]): Results {
    const agg: AggSubmission[] = rows.map((r) => ({
      id: r.id, participantId: r.participantId, payload: JSON.parse(r.payload), status: r.status as SubmissionStatus,
      key: r.key && act.type === 'wordcloud' ? mergedKey(r.key, run.merges) : r.key, createdAt: r.createdAt.getTime(), correct: r.correct, score: r.score,
    }));
    return (definitions[act.type] as any).aggregate(act.config, agg, { seed: act.seed });
  }

  async buildSnapshots(sessionId: string, online: ReadonlySet<string>, staffOnline: Map<string, number> = new Map()): Promise<Snapshots> {
    const rt = await this.runtime(sessionId);
    const { state } = rt;
    const now = Date.now();
    const active = [...rt.participants.values()].filter((p) => !p.removed);
    const selfPaced = rt.mode === 'selfpaced';

    const act = selfPaced ? null : this.onScreen(rt) ?? null;
    const behavior = act ? (definitions[act.type] as any).behavior(act.config) : null;
    const run = act ? this.current(act) : null;

    // current activity data (the current run only)
    let rows: Prisma.SubmissionGetPayload<object>[] = [];
    if (act && run && behavior.interactive) rows = await this.prisma.submission.findMany({ where: { runId: run.id }, orderBy: { createdAt: 'asc' } });
    const full: Results | null = act && run && behavior.interactive ? this.aggregateRun(act, run, rows) : null;
    const visibleRows = rows.filter((r) => r.status !== 'hidden');
    const counts: Counts = {
      participants: active.length,
      online: active.filter((p) => online.has(p.id) || p.simulated).length,
      responses: visibleRows.length,
      respondents: new Set(visibleRows.map((r) => r.participantId)).size,
    };

    const info: SessionInfo = {
      id: rt.id, title: rt.title, pin: rt.pin, mode: rt.mode, status: rt.status, theme: rt.theme, collectNames: rt.collectNames, activityCount: rt.activities.length, features: rt.features,
    };
    const publicActivity: PublicActivity | null = act
      ? {
          id: act.id, key: act.key, index: act.position, type: act.type, interactive: !!behavior.interactive,
          config: (definitions[act.type] as any).publicConfig(act.config, { revealCorrect: state.correctVisible, seed: act.seed }) as AnyConfig,
        }
      : null;
    const runInfo = act && run ? { id: run.id, number: run.number, count: act.runs.length, scoring: run.scoring } : null;

    const showLeaderboard = state.leaderboardVisible || state.phase === 'ended';
    const standings = await this.standingsFor(rt);
    const leaderboard = showLeaderboard && standings.length ? standings.slice(0, 10) : null;
    const teamsOn = rt.features.teams.enabled && rt.teams.length > 0;
    const teamRefs = this.teamRefs(rt);
    const teamStandings: TeamStanding[] = teamsOn ? computeTeamStandings(teamRefs, standings) : [];
    const teamBoard = teamsOn && showLeaderboard && (state.leaderboardMode === 'team' || state.phase === 'ended') ? teamStandings : null;
    const recentNames = state.phase === 'lobby' || state.phase === 'standby' ? active.slice().sort((a, b) => b.joinedAt - a.joinedAt).slice(0, 40).map((p) => p.name) : [];

    // Q&A
    const qaOn = rt.features.qa.enabled;
    const allQ = [...rt.questions.values()];
    const publicQuestions = qaOn ? sortQuestions(allQ.filter((q) => q.status === 'visible').map((q) => this.questionView(q, null)), 'popular') : null;
    const hq = state.highlightQuestionId ? rt.questions.get(state.highlightQuestionId) : undefined;
    const highlight = hq && hq.status === 'visible' ? this.questionView(hq, null) : null;

    // pulse
    const pulseOn = rt.features.pulse.enabled;
    const pulse = pulseOn ? pulseSummary([...rt.pulse.entries()].filter(([pid]) => rt.participants.get(pid) && !rt.participants.get(pid)!.removed).map(([, v]) => v), rt.pulseEvents, now) : null;

    const revealCorrect = state.correctVisible;
    const audienceResults = full && state.resultsVisible ? redactResults(full, { revealCorrect }) : null;
    const base = (resultsOk: boolean): BaseSnapshot => ({
      session: info, state, serverNow: now, activity: publicActivity, run: runInfo, counts, results: resultsOk ? audienceResults : null, leaderboard, teamBoard, recentNames,
      questions: null, highlight, pulse: null,
    });

    const projectorShowsQa = qaOn && state.overlay === 'qa';
    const projectorShowsPulse = pulseOn && state.overlay === 'pulse';
    const projector: ProjectorSnapshot = {
      role: 'projector', ...base(true),
      questions: projectorShowsQa ? publicQuestions!.filter((q) => !q.answered).slice(0, 8) : null,
      pulse: projectorShowsPulse ? pulse : null,
    };

    // presenter extras
    const groups = await this.prisma.submission.groupBy({ by: ['runId'], where: { sessionId: rt.id, status: { not: 'hidden' } }, _count: { _all: true } });
    const byRun = new Map(groups.map((g) => [g.runId, g._count._all]));
    const metas = this.meta(rt);
    const outline: OutlineItem[] = rt.activities.map((a, i) => ({
      index: i, key: a.key, type: a.type, title: (definitions[a.type] as any).titleOf(a.config), interactive: metas[i].interactive,
      completed: this.current(a).completed, answerRevealed: this.current(a).answerRevealed, responses: byRun.get(this.current(a).id) ?? 0,
    }));
    const textual = act && (act.type === 'wordcloud' || act.type === 'open' || (act.type === 'quiz' && ['text', 'numeric'].includes(quizKind(act.config))));
    const moderation: ModerationItem[] = textual
      ? rows.slice().reverse().slice(0, 300).map((r) => ({ id: r.id, participantName: rt.participants.get(r.participantId)?.name ?? '?', text: JSON.parse(r.payload).text as string, status: r.status as SubmissionStatus, key: r.key, createdAt: r.createdAt.getTime() }))
      : [];
    const perPerson = new Map<string, number>();
    for (const r of visibleRows) perPerson.set(r.participantId, (perPerson.get(r.participantId) ?? 0) + 1);

    // runs of the current activity, for comparisons
    let runs: RunResults[] = [];
    if (act && behavior.interactive && act.runs.length > 1) {
      const all = await this.prisma.submission.findMany({ where: { sessionActivityId: act.id }, orderBy: { createdAt: 'asc' } });
      runs = act.runs.map((r) => {
        const rr = all.filter((x) => x.runId === r.id);
        const vis = rr.filter((x) => x.status !== 'hidden');
        return {
          id: r.id, number: r.number, scoring: r.scoring, startedAt: r.startedAt, respondents: new Set(vis.map((x) => x.participantId)).size,
          results: this.aggregateRun(act, r, rr), correctRate: behavior.hasCorrectAnswer && vis.length ? vis.filter((x) => x.correct).length / vis.length : null,
        };
      });
    }

    // typed answers the grader was unsure about
    const reviewGroups = new Map<string, ReviewItem>();
    if (act?.type === 'quiz') {
      const hotspot = quizKind(act.config) === 'hotspot';
      for (const r of rows) {
        if (!r.review || r.status === 'hidden') continue;
        const k = hotspot ? r.id : r.key ?? r.id;
        const p = JSON.parse(r.payload);
        const g = reviewGroups.get(k) ?? { key: k, label: hotspot ? `Point at ${(p.x * 100).toFixed(0)}%, ${(p.y * 100).toFixed(0)}%` : String(p.text), count: 0, detail: (r.detail ?? '').replace(/^(Accepted|Not accepted) by the presenter\. /, ''), decision: null };
        g.count++;
        if (r.review === 'accepted' || r.review === 'rejected') g.decision = r.review;
        reviewGroups.set(k, g);
      }
    }
    let mergeSuggestions: ReturnType<typeof suggestMerges> = [];
    if (act?.type === 'wordcloud' && run) {
      // suggestions come from the unmerged terms, so accepted merges show up as merged and are not offered again
      const raw = this.aggregateRun(act, { ...run, merges: {} }, rows.filter((r) => r.status === 'visible'));
      if (raw.type === 'wordcloud') mergeSuggestions = suggestMerges(raw.terms, run.merges);
    }
    const branch = await this.branchFor(rt);
    const teams: TeamInfo[] = teamRefs.map((t) => ({ id: t.id, name: t.name, color: t.color, memberIds: t.memberIds }));
    let selfPacedProgress: SelfPacedProgress | null = null;
    let allSubs: { participantId: string; sessionActivityId: string; runId: string; payload: string; status: string; correct: boolean | null; score: number; id: string; slot: number; detail: string | null }[] = [];
    if (selfPaced) {
      allSubs = await this.prisma.submission.findMany({ where: { sessionId: rt.id }, select: { participantId: true, sessionActivityId: true, runId: true, payload: true, status: true, correct: true, score: true, id: true, slot: true, detail: true }, orderBy: { createdAt: 'asc' } });
      const interactive = rt.activities.filter((a) => definitions[a.type].interactive);
      selfPacedProgress = {
        interactiveCount: interactive.length,
        perActivity: interactive.map((a) => ({ activityId: a.id, answered: new Set(allSubs.filter((s) => s.sessionActivityId === a.id && s.status !== 'hidden').map((s) => s.participantId)).size })),
        perParticipant: active.map((p) => {
          const mine = allSubs.filter((s) => s.participantId === p.id && s.status !== 'hidden');
          return { participantId: p.id, answered: new Set(mine.map((s) => s.sessionActivityId)).size, score: mine.reduce((n, s) => n + s.score, 0) };
        }),
      };
    }

    const presenterBase = {
      ...base(true),
      results: full, // the presenter always sees live results
      questions: publicQuestions,
      pulse,
      fullConfig: act ? act.config : null,
      behavior,
      outline,
      moderation,
      available: rt.status === 'live' ? availableActions(state, metas, now) : [],
      standings: standings.slice(0, 50),
      teamStandings,
      teams,
      allQuestions: sortQuestions(allQ.map((q) => this.questionView(q, null)), 'recent'),
      runs,
      reviews: [...reviewGroups.values()],
      merges: run?.merges ?? {},
      mergeSuggestions,
      branch,
      selfPaced: selfPacedProgress,
      version: state.version,
    };
    const participantsInfo: ParticipantInfo[] = active
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => ({ id: p.id, name: p.name, online: online.has(p.id) || p.simulated, joinedAt: p.joinedAt, responses: selfPaced ? (selfPacedProgress?.perParticipant.find((x) => x.participantId === p.id)?.answered ?? 0) : perPerson.get(p.id) ?? 0, teamId: p.teamId, simulated: p.simulated }));
    const ownerGrants = await this.grantList(rt, staffOnline);
    const presenter: PresenterSnapshot = {
      role: 'presenter', ...presenterBase, participants: participantsInfo, grants: ownerGrants,
      staff: { role: 'owner', permissions: permissionsOf('owner'), label: 'Presenter' },
    };

    const standingById = new Map(standings.map((s) => [s.participantId, s]));
    const teamRank = new Map(teamStandings.map((t) => [t.teamId, t.rank]));
    const participantResultsOk = !!behavior?.shareResults;
    const spReveal = selfPaced && this.selfPacedReveal(rt);
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
          detail: state.correctVisible ? r.detail : null,
        }));
      const standing = standingById.get(participantId) ?? null;
      const team = p.teamId && teamsOn ? rt.teams.find((t) => t.id === p.teamId) : undefined;
      let sp: SelfPacedView | null = null;
      if (selfPaced) {
        const mySubs = allSubs.filter((s) => s.participantId === participantId);
        const next: Record<string, string> = {};
        const items = rt.activities.map((a) => {
          const subs = mySubs.filter((s) => s.sessionActivityId === a.id && s.runId === this.current(a).id);
          const answered = subs.length > 0;
          const rule = a.type === 'quiz' ? (a.config as QuizConfig).branch : undefined;
          if (rule && answered) {
            const d = decideBranch(rule, subs[0].correct ? 1 : 0);
            if (d.targetId) next[a.id] = d.targetId;
          }
          const showKey = spReveal && answered;
          return {
            activity: { id: a.id, key: a.key, index: a.position, type: a.type, interactive: definitions[a.type].interactive, config: (definitions[a.type] as any).publicConfig(a.config, { revealCorrect: showKey, seed: a.seed }) },
            submissions: subs.map((s) => ({ id: s.id, slot: s.slot, payload: JSON.parse(s.payload), status: (s.status === 'pending' ? 'pending' : 'visible') as SubmissionStatus, correct: showKey ? s.correct : null, score: showKey ? s.score : null, detail: showKey ? s.detail : null })),
          };
        });
        sp = { items, deadlineAt: rt.features.selfPaced.deadlineAt, open: state.phase === 'open', revealNow: spReveal, next };
      }
      const myQuestions = qaOn ? allQ.filter((q) => q.participantId === participantId && q.status === 'pending').map((q) => this.questionView(q, participantId)) : [];
      return {
        role: 'participant',
        ...base(participantResultsOk),
        questions: qaOn ? [...myQuestions, ...sortQuestions(allQ.filter((q) => q.status === 'visible').map((q) => this.questionView(q, participantId)), 'popular').slice(0, 100)] : null,
        me: {
          id: p.id, name: p.name, submissions: mine, totalScore: standing?.score ?? 0, standing: showLeaderboard || (selfPaced && spReveal) ? standing : null,
          team: team ? { id: team.id, name: team.name, color: team.color, rank: showLeaderboard ? teamRank.get(team.id) ?? null : null } : null,
          pulse: rt.pulse.get(p.id) ?? null,
          linked: !!p.learnerId,
        },
        selfPaced: sp,
      };
    };

    return { presenter, projector, forParticipant, participantsSeeLiveData: !!audienceResults && participantResultsOk, projectorShowsQa, projectorShowsPulse };
  }

  /** The presenter snapshot narrowed to what a co-presenter or moderator may see. */
  delegateView(snap: PresenterSnapshot, role: StaffRole, label: string): PresenterSnapshot {
    return { ...snap, grants: [], staff: { role, permissions: permissionsOf(role), label } };
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
      id: s.id, title: s.title, pin: s.livePin, mode: s.mode as SessionMode, rehearsal: s.rehearsal, status: s.status === 'ended' ? 'ended' : 'live', presentationId: s.presentationId,
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
    for (const p of this.cache.values()) void p.then((rt) => { if (rt.timer) clearTimeout(rt.timer); this.stopSims(rt); }).catch(() => undefined);
  }
}

export function mergeFeatures(base: SessionFeatures, patch: FeaturesPatch): SessionFeatures {
  return resolveFeatures({
    ...base,
    ...patch,
    qa: { ...base.qa, ...(patch.qa ?? {}) },
    pulse: { ...base.pulse, ...(patch.pulse ?? {}) },
    teams: { ...base.teams, ...(patch.teams ?? {}) },
    projector: { ...base.projector, ...(patch.projector ?? {}) },
    selfPaced: { ...base.selfPaced, ...(patch.selfPaced ?? {}) },
  });
}
