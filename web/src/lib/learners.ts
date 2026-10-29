/** Mirrors the server's cross-session report (server/src/services/learners.ts). */
export interface LearnerSessionRow {
  sessionId: string;
  title: string;
  createdAt: string;
  participants: number;
  linked: number;
  returning: number;
  linkedCorrectRate: number | null;
  linkedParticipation: number | null;
}
export interface LearnerRow {
  id: string;
  label: string;
  sessions: number;
  firstSeen: string;
  lastSeen: string;
  shareProgress: boolean;
  history: { sessionId: string; title: string; date: string; displayName: string; answered: number; correctRate: number | null; score: number }[] | null;
}
export interface LearnerReport {
  sessions: LearnerSessionRow[];
  learners: LearnerRow[];
  totals: { learners: number; sharing: number };
}

/** The participant's own "remember me" key, kept only on their device. */
export const LEARNER_KEY = 'ci:learner';
