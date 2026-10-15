/** Wire types shared by server and clients: snapshots, socket commands, REST payloads. */
import { z } from 'zod';
import type { ActionType, SessionState } from './session';
import type { Behavior, Results, SubmissionStatus } from './activities';
import type { AnyConfig, SlideType, Theme } from './schema';
import type { Standing } from './standings';

export type SessionMode = 'standalone' | 'companion';
export type Role = 'presenter' | 'projector' | 'participant';

export interface SessionInfo {
  id: string;
  title: string;
  pin: string;
  mode: SessionMode;
  status: 'live' | 'ended';
  theme: Theme;
  collectNames: boolean;
  activityCount: number;
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

export interface BaseSnapshot {
  session: SessionInfo;
  state: SessionState;
  serverNow: number;
  activity: PublicActivity | null;
  counts: Counts;
  /** Present only when the presenter has made results visible to this audience. */
  results: Results | null;
  leaderboard: Standing[] | null;
  /** Names of people who joined (lobby and standby screens only). */
  recentNames: string[];
}

export interface MySubmission {
  id: string;
  slot: number;
  payload: any;
  status: SubmissionStatus;
  /** Only populated once the presenter reveals the answer. */
  correct: boolean | null;
  score: number | null;
}

export interface ParticipantSnapshot extends BaseSnapshot {
  role: 'participant';
  me: {
    id: string;
    name: string;
    submissions: MySubmission[];
    totalScore: number;
    standing: Standing | null;
  };
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
}

export interface PresenterSnapshot extends BaseSnapshot {
  role: 'presenter';
  /** Full configuration of the current activity, including speaker notes and the correct answer. */
  fullConfig: AnyConfig | null;
  behavior: Behavior | null;
  outline: OutlineItem[];
  moderation: ModerationItem[];
  participants: ParticipantInfo[];
  available: ActionType[];
  /** Standings over revealed quiz questions, always visible to the presenter. */
  standings: Standing[];
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
]);

export const presenterCommandSchema = z.discriminatedUnion('cmd', [
  z.object({ cmd: z.literal('action'), action: actionSchema }),
  z.object({
    cmd: z.literal('moderate'),
    status: z.enum(['visible', 'hidden']),
    ids: z.array(z.string().max(64)).max(500).optional(),
    key: z.string().max(200).optional(),
  }),
  z.object({ cmd: z.literal('kick'), participantId: z.string().min(1).max(64) }),
  z.object({ cmd: z.literal('setMode'), mode: z.enum(['standalone', 'companion']) }),
]);
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
}

export const joinRequestSchema = z.object({
  pin: z.string().regex(/^\d{6}$/, 'The code is 6 digits'),
  name: z.string().max(60).optional(),
  token: z.string().max(200).optional(),
});

export interface JoinResponse {
  sessionId: string;
  participantId: string;
  name: string;
  token: string;
  resumed: boolean;
}

export interface ClientConfig {
  publicUrl: string | null;
  lanUrls: string[];
  authRequired: boolean;
  version: string;
}

export interface PresentationSummary {
  id: string;
  title: string;
  description: string;
  slideCount: number;
  interactiveCount: number;
  theme: Theme;
  updatedAt: string;
  sessionCount: number;
}

export interface SessionSummary {
  id: string;
  title: string;
  pin: string | null;
  mode: SessionMode;
  status: 'live' | 'ended';
  presentationId: string | null;
  participantCount: number;
  responseCount: number;
  createdAt: string;
  endedAt: string | null;
}

export interface SessionControlInfo {
  sessionId: string;
  presenterToken: string;
  projectorKey: string;
}

export interface ActivityResultsView {
  index: number;
  key: string;
  type: SlideType;
  title: string;
  config: AnyConfig;
  results: Results;
  responses: number;
  respondents: number;
}

export interface SessionResultsView {
  session: SessionSummary;
  theme: Theme;
  participants: number;
  activities: ActivityResultsView[];
  standings: Standing[];
}
