/** Wire types shared by server and clients: snapshots, socket commands, REST payloads. */
import { z } from 'zod';
import type { ActionType, SessionState } from './session';
import type { Behavior, Results, SubmissionStatus } from './activities';
import type { AnyConfig, SlideType, Theme } from './schema';
import type { Standing } from './standings';
import type { AudienceQuestion, QaSettings } from './qa';
import type { DelegateRole, Permission, StaffRole } from './permissions';
import type { RunScoring, TeamStanding } from './runs';
import type { BranchDecision } from './branching';
import { DEFAULT_QA } from './qa';
import { RUN_SCORING } from './runs';

export type SessionMode = 'standalone' | 'companion' | 'selfpaced';
export type Role = 'presenter' | 'projector' | 'participant';

// ---------------------------------------------------------------------------------------
// Session features (all optional; a plain session works without touching any of them)
// ---------------------------------------------------------------------------------------

export type SoundLevel = 'off' | 'subtle' | 'playful';
export type ProjectorAppearance = 'theme' | 'light' | 'dark';
export type PulseValue = 'got' | 'unsure' | 'lost';
export const PULSE_VALUES: PulseValue[] = ['got', 'unsure', 'lost'];

export interface ProjectorSettings {
  /** Follow the presentation's own appearance, or force light / dark. Never follows the projector computer's OS. */
  appearance: ProjectorAppearance;
  sound: SoundLevel;
  music: boolean;
  /** 0–1 */
  volume: number;
}

export interface SelfPacedSettings {
  /** Server time after which answers are no longer accepted; null for no deadline. */
  deadlineAt: number | null;
  /** When a person sees whether they were right: straight after answering, once the session closes, or never. */
  reveal: 'immediately' | 'after-close' | 'never';
}

export interface SessionFeatures {
  qa: QaSettings;
  pulse: { enabled: boolean };
  teams: { enabled: boolean; assignment: 'auto' | 'manual' };
  /** Offer participants an optional "remember me across sessions" code. */
  continuity: boolean;
  /** Whether participants' phones may play sounds at all in this session (each phone still has its own settings). */
  phoneSounds: boolean;
  projector: ProjectorSettings;
  selfPaced: SelfPacedSettings;
  /** A rehearsal with simulated participants: never counted in analytics or across sessions. */
  rehearsal: boolean;
}

export const DEFAULT_FEATURES: SessionFeatures = {
  qa: DEFAULT_QA,
  pulse: { enabled: true },
  teams: { enabled: false, assignment: 'auto' },
  continuity: false,
  phoneSounds: true,
  projector: { appearance: 'theme', sound: 'subtle', music: false, volume: 0.8 },
  selfPaced: { deadlineAt: null, reveal: 'after-close' },
  rehearsal: false,
};

/** Fills in missing (older or partial) feature settings. */
export function resolveFeatures(raw: unknown): SessionFeatures {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<SessionFeatures>;
  return {
    qa: { ...DEFAULT_FEATURES.qa, ...(r.qa ?? {}) },
    pulse: { ...DEFAULT_FEATURES.pulse, ...(r.pulse ?? {}) },
    teams: { ...DEFAULT_FEATURES.teams, ...(r.teams ?? {}) },
    continuity: r.continuity ?? DEFAULT_FEATURES.continuity,
    phoneSounds: r.phoneSounds ?? DEFAULT_FEATURES.phoneSounds,
    projector: { ...DEFAULT_FEATURES.projector, ...(r.projector ?? {}) },
    selfPaced: { ...DEFAULT_FEATURES.selfPaced, ...(r.selfPaced ?? {}) },
    rehearsal: r.rehearsal ?? false,
  };
}

const soundLevel = z.enum(['off', 'subtle', 'playful']);
export const featuresPatchSchema = z
  .object({
    qa: z.object({ enabled: z.boolean(), premoderate: z.boolean(), allowAnonymous: z.boolean() }).partial().strict(),
    pulse: z.object({ enabled: z.boolean() }).partial().strict(),
    teams: z.object({ enabled: z.boolean(), assignment: z.enum(['auto', 'manual']) }).partial().strict(),
    continuity: z.boolean(),
    phoneSounds: z.boolean(),
    projector: z.object({ appearance: z.enum(['theme', 'light', 'dark']), sound: soundLevel, music: z.boolean(), volume: z.number().min(0).max(1) }).partial().strict(),
    selfPaced: z.object({ deadlineAt: z.number().int().positive().nullable(), reveal: z.enum(['immediately', 'after-close', 'never']) }).partial().strict(),
  })
  .partial()
  .strict();
export type FeaturesPatch = z.infer<typeof featuresPatchSchema>;

export interface SessionInfo {
  id: string;
  title: string;
  pin: string;
  mode: SessionMode;
  status: 'live' | 'ended';
  theme: Theme;
  collectNames: boolean;
  activityCount: number;
  features: SessionFeatures;
}

export interface PublicActivity {
  id: string;
  key: string;
  index: number;
  type: SlideType;
  /** Audience-safe: no speaker notes, and no correct answer until it is revealed. */
  config: AnyConfig;
  interactive: boolean;
}

export interface Counts {
  participants: number;
  online: number;
  /** Submissions on the current activity. */
  responses: number;
  /** Distinct participants who responded to the current activity. */
  respondents: number;
}

export interface RunInfo {
  id: string;
  /** 1 for the first time an activity runs. */
  number: number;
  /** How many runs this activity has had so far. */
  count: number;
  scoring: RunScoring;
}

export interface PulseSummary {
  got: number;
  unsure: number;
  lost: number;
  /** People who have set a signal (participants who never touched it are not counted). */
  total: number;
  /** One point per minute over the last 20 minutes: counts at the end of each minute. */
  trend: { t: number; got: number; unsure: number; lost: number }[];
}

export interface BaseSnapshot {
  session: SessionInfo;
  state: SessionState;
  serverNow: number;
  activity: PublicActivity | null;
  /** The current run of the activity on screen. */
  run: RunInfo | null;
  counts: Counts;
  /** Present only when the presenter has made results visible to this audience. */
  results: Results | null;
  leaderboard: Standing[] | null;
  /** Team standings, when team mode is on and the team leaderboard is shown. */
  teamBoard: TeamStanding[] | null;
  /** Names of people who joined (lobby and standby screens only). */
  recentNames: string[];
  /** Approved audience questions (when Q&A is on). Participants also see their own pending ones. */
  questions: AudienceQuestion[] | null;
  /** The question the presenter highlighted on the projector. */
  highlight: AudienceQuestion | null;
  /** Understanding pulse: the presenter always; the projector only while it is shown on screen. */
  pulse: PulseSummary | null;
}

export interface MySubmission {
  id: string;
  slot: number;
  payload: any;
  status: SubmissionStatus;
  /** Only populated once the presenter reveals the answer. */
  correct: boolean | null;
  score: number | null;
  /** Why it was graded that way (typed, numeric and hotspot answers, once revealed). */
  detail?: string | null;
}

export interface SelfPacedItem {
  activity: PublicActivity;
  /** My responses to it. */
  submissions: MySubmission[];
}

export interface SelfPacedView {
  items: SelfPacedItem[];
  deadlineAt: number | null;
  open: boolean;
  /** Whether my answers' correctness may be shown now. */
  revealNow: boolean;
  /** Branches that apply to me: activity id → slide id to go to next. */
  next: Record<string, string>;
}

export interface ParticipantSnapshot extends BaseSnapshot {
  role: 'participant';
  me: {
    id: string;
    name: string;
    submissions: MySubmission[];
    totalScore: number;
    standing: Standing | null;
    team: { id: string; name: string; color: string; rank: number | null } | null;
    pulse: PulseValue | null;
    /** Linked to a "remember me" identity (continuity sessions only). */
    linked: boolean;
  };
  selfPaced: SelfPacedView | null;
}

export interface ProjectorSnapshot extends BaseSnapshot {
  role: 'projector';
}

export interface OutlineItem {
  index: number;
  key: string;
  type: SlideType;
  title: string;
  interactive: boolean;
  completed: boolean;
  answerRevealed: boolean;
  responses: number;
}

export interface ModerationItem {
  id: string;
  participantName: string;
  text: string;
  status: SubmissionStatus;
  key: string | null;
  createdAt: number;
}

export interface ParticipantInfo {
  id: string;
  name: string;
  online: boolean;
  joinedAt: number;
  responses: number;
  teamId: string | null;
  simulated: boolean;
}

/** A typed / numeric / hotspot answer the grader was unsure about, grouped by identical answers. */
export interface ReviewItem {
  key: string;
  label: string;
  count: number;
  detail: string;
  /** null while undecided. */
  decision: 'accepted' | 'rejected' | null;
}

export interface RunResults {
  id: string;
  number: number;
  scoring: RunScoring;
  respondents: number;
  results: Results;
  /** Share fully correct (quizzes), 0–1; null when not applicable. */
  correctRate: number | null;
  startedAt: number;
}

export interface TeamInfo {
  id: string;
  name: string;
  color: string;
  memberIds: string[];
}

export interface AccessGrantInfo {
  id: string;
  role: DelegateRole;
  label: string;
  createdAt: number;
  revokedAt: number | null;
  online: number;
}

export interface SelfPacedProgress {
  /** Per activity: people who answered. */
  perActivity: { activityId: string; answered: number }[];
  /** Per participant: activities answered and points. */
  perParticipant: { participantId: string; answered: number; score: number }[];
  interactiveCount: number;
}

export interface TermGroupSuggestion {
  into: string;
  keys: string[];
  labels: string[];
  reason: string;
}

export interface PresenterSnapshot extends BaseSnapshot {
  role: 'presenter';
  /** Who this control screen belongs to, and what it may do. */
  staff: { role: StaffRole; permissions: Permission[]; label: string };
  /** Full configuration of the current activity, including speaker notes and the correct answer. */
  fullConfig: AnyConfig | null;
  behavior: Behavior | null;
  outline: OutlineItem[];
  moderation: ModerationItem[];
  participants: ParticipantInfo[];
  available: ActionType[];
  /** Standings over revealed quiz questions, always visible to the presenter. */
  standings: Standing[];
  teamStandings: TeamStanding[];
  teams: TeamInfo[];
  /** Every question, with status and author (unless anonymous). */
  allQuestions: AudienceQuestion[];
  /** All runs of the current activity (for "compare runs"); empty for content slides. */
  runs: RunResults[];
  reviews: ReviewItem[];
  /** Word-cloud terms the presenter merged (term key → group key), and suggestions for more. */
  merges: Record<string, string>;
  mergeSuggestions: TermGroupSuggestion[];
  /** What Next will do when the current quiz has a branch rule. */
  branch: (BranchDecision & { targetIndex: number | null }) | null;
  grants: AccessGrantInfo[];
  selfPaced: SelfPacedProgress | null;
  /** Version of the state this snapshot was built from: send it with commands so stale clicks are refused. */
  version: number;
}

export type Snapshot = PresenterSnapshot | ProjectorSnapshot | ParticipantSnapshot;

// ---------------------------------------------------------------------------------------
// Socket messages
// ---------------------------------------------------------------------------------------

export type ErrorCode =
  | 'INVALID' | 'NOT_ACCEPTING' | 'DUPLICATE' | 'LIMIT_REACHED' | 'MODERATED' | 'RATE_LIMITED'
  | 'FORBIDDEN' | 'NOT_FOUND' | 'SESSION_ENDED' | 'NAME_TAKEN' | 'REMOVED' | 'FULL' | 'INTERNAL' | string;

export type Ack<T = unknown> = ({ ok: true } & T) | { ok: false; code: ErrorCode; message: string };

export const socketAuthSchema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('presenter'), sessionId: z.string().min(1).max(64), token: z.string().min(1).max(200) }),
  z.object({ role: z.literal('projector'), sessionId: z.string().min(1).max(64), key: z.string().min(1).max(200) }),
  z.object({ role: z.literal('participant'), sessionId: z.string().min(1).max(64), token: z.string().min(1).max(200) }),
  /** A teaching assistant's revocable access link. */
  z.object({ role: z.literal('delegate'), sessionId: z.string().min(1).max(64), token: z.string().min(1).max(200) }),
]);
export type SocketAuth = z.infer<typeof socketAuthSchema>;

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('next') }),
  z.object({ type: z.literal('previous') }),
  z.object({ type: z.literal('goto'), index: z.number().int().min(0).max(1000) }),
  z.object({ type: z.literal('standby') }),
  z.object({ type: z.literal('open') }),
  z.object({ type: z.literal('close') }),
  z.object({ type: z.literal('complete') }),
  z.object({ type: z.literal('revealResults') }),
  z.object({ type: z.literal('hideResults') }),
  z.object({ type: z.literal('revealCorrect') }),
  z.object({ type: z.literal('hideCorrect') }),
  z.object({ type: z.literal('showLeaderboard') }),
  z.object({ type: z.literal('hideLeaderboard') }),
  z.object({ type: z.literal('end') }),
  z.object({ type: z.literal('showOverlay'), overlay: z.enum(['join', 'qa', 'pulse']) }),
  z.object({ type: z.literal('hideOverlay') }),
  z.object({ type: z.literal('highlightQuestion'), questionId: z.string().max(64).nullable() }),
  z.object({ type: z.literal('startBreak'), kind: z.enum(['break', 'prepare', 'work']), title: z.string().trim().max(80), message: z.string().trim().max(400), minutes: z.number().min(0.25).max(180).nullable() }),
  z.object({ type: z.literal('endBreak') }),
  z.object({ type: z.literal('setLeaderboardMode'), mode: z.enum(['individual', 'team']) }),
]);

export const presenterCommandSchema = z.discriminatedUnion('cmd', [
  z.object({ cmd: z.literal('action'), action: actionSchema, expectVersion: z.number().int().optional() }),
  z.object({ cmd: z.literal('runAgain'), scoring: z.enum(RUN_SCORING).exclude(['counted']), expectVersion: z.number().int().optional() }),
  z.object({ cmd: z.literal('nextPlain'), expectVersion: z.number().int().optional() }),
  z.object({ cmd: z.literal('qa'), op: z.enum(['approve', 'hide', 'dismiss', 'pin', 'unpin', 'answer', 'unanswer', 'delete', 'highlight']), id: z.string().min(1).max(64) }),
  z.object({ cmd: z.literal('features'), patch: featuresPatchSchema }),
  z.object({
    cmd: z.literal('teams'),
    team: z.discriminatedUnion('op', [
      z.object({ op: z.literal('setup'), count: z.number().int().min(2).max(8) }),
      z.object({ op: z.literal('assign'), participantId: z.string().min(1).max(64), teamId: z.string().min(1).max(64).nullable() }),
      z.object({ op: z.literal('shuffle') }),
      z.object({ op: z.literal('rename'), teamId: z.string().min(1).max(64), name: z.string().min(1).max(40) }),
    ]),
  }),
  z.object({ cmd: z.literal('review'), key: z.string().max(220), accept: z.boolean() }),
  z.object({ cmd: z.literal('merge'), keys: z.array(z.string().max(200)).min(2).max(50), into: z.string().max(200) }),
  z.object({ cmd: z.literal('unmerge'), key: z.string().max(200) }),
  z.object({ cmd: z.literal('simulate'), count: z.number().int().min(0).max(60) }),
  z.object({ cmd: z.literal('selfPaced'), op: z.enum(['open', 'close']) }),
  z.object({
    cmd: z.literal('moderate'),
    status: z.enum(['visible', 'hidden']),
    ids: z.array(z.string().max(64)).max(500).optional(),
    key: z.string().max(200).optional(),
  }),
  z.object({ cmd: z.literal('kick'), participantId: z.string().min(1).max(64) }),
  z.object({ cmd: z.literal('setMode'), mode: z.enum(['standalone', 'companion']) }),
]);

export const askQuestionSchema = z.object({ text: z.string().max(400), anonymous: z.boolean().default(false) });
export const voteSchema = z.object({ id: z.string().min(1).max(64), on: z.boolean() });
export const pulseSchema = z.object({ value: z.enum(['got', 'unsure', 'lost']).nullable() });
export type PresenterCommand = z.infer<typeof presenterCommandSchema>;

export const submitRequestSchema = z.object({
  activityId: z.string().min(1).max(64),
  payload: z.unknown(),
});
export type SubmitRequest = z.infer<typeof submitRequestSchema>;

// ---------------------------------------------------------------------------------------
// REST payloads
// ---------------------------------------------------------------------------------------

export interface JoinLookup {
  sessionId: string;
  title: string;
  collectNames: boolean;
  status: 'live' | 'ended';
  /** The session offers an optional "remember me across sessions". */
  continuity: boolean;
}

export const joinRequestSchema = z.object({
  pin: z.string().regex(/^\d{6}$/, 'The code is 6 digits'),
  name: z.string().max(60).optional(),
  token: z.string().max(200).optional(),
  /** Optional "remember me" key from an earlier session (continuity sessions only). */
  learnerKey: z.string().max(80).optional(),
  /** The person ticked "remember me" on this device. */
  remember: z.boolean().optional(),
  /** ...and agreed that the teacher may see their own progress across sessions. */
  shareProgress: z.boolean().optional(),
});

export interface JoinResponse {
  sessionId: string;
  participantId: string;
  name: string;
  token: string;
  resumed: boolean;
  /** Set when the person asked to be remembered: keep it on the device for the next session. */
  learnerKey?: string;
}

export interface ClientConfig {
  publicUrl: string | null;
  lanUrls: string[];
  authRequired: boolean;
  /** The AI presentation assistant is available (the server has an API key for it). */
  aiEnabled: boolean;
  version: string;
}

export interface PresentationSummary {
  id: string;
  title: string;
  description: string;
  slideCount: number;
  interactiveCount: number;
  /** Distinct slide types in the deck, in a stable order — lets the library show what is inside. */
  types: SlideType[];
  theme: Theme;
  updatedAt: string;
  sessionCount: number;
}

export interface SessionSummary {
  id: string;
  title: string;
  pin: string | null;
  mode: SessionMode;
  rehearsal: boolean;
  status: 'live' | 'ended';
  presentationId: string | null;
  participantCount: number;
  responseCount: number;
  createdAt: string;
  endedAt: string | null;
}

export interface SessionControlInfo {
  sessionId: string;
  /** For the owner, the presenter token; for a delegate, their own access token. */
  presenterToken: string;
  role: StaffRole;
  projectorKey: string;
  /** Six digits that turn another computer into this session's projector; null once the session has ended. */
  projectorCode: string | null;
}

export interface ProjectorClaim {
  sessionId: string;
  projectorKey: string;
}

export interface ActivityResultsView {
  index: number;
  key: string;
  type: SlideType;
  title: string;
  config: AnyConfig;
  /** Latest run. */
  results: Results;
  responses: number;
  respondents: number;
  /** Every run, oldest first (one entry for an activity that ran once). */
  runs: RunResults[];
}

export interface SessionResultsView {
  session: SessionSummary;
  theme: Theme;
  participants: number;
  activities: ActivityResultsView[];
  standings: Standing[];
  teamStandings: TeamStanding[];
  questions: AudienceQuestion[];
}
