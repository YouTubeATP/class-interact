/**
 * Audience Q&A: a session-wide channel, independent of whatever activity is on screen. Participants ask and upvote;
 * the presenter (or a moderator) approves, pins, highlights, marks answered, hides or deletes. Pure rules only.
 */
import { cleanText } from './text';

export type QuestionStatus = 'pending' | 'visible' | 'hidden' | 'dismissed';
export type QuestionOrder = 'popular' | 'recent';

export const QA_MAX_LENGTH = 280;
/** Questions one person may have waiting (not yet answered) at once: enough to ask freely, too few to flood. */
export const QA_MAX_OPEN_PER_PERSON = 5;

export interface QaSettings {
  enabled: boolean;
  /** Questions wait for approval before anyone else sees them. */
  premoderate: boolean;
  /** Participants may ask without their name being shown (the presenter still cannot see it either). */
  allowAnonymous: boolean;
}

export const DEFAULT_QA: QaSettings = { enabled: true, premoderate: false, allowAnonymous: true };

export interface AudienceQuestion {
  id: string;
  text: string;
  /** null when asked anonymously. */
  authorName: string | null;
  status: QuestionStatus;
  pinned: boolean;
  answered: boolean;
  votes: number;
  createdAt: number;
  /** Participant view only: this is my question / I upvoted it. */
  mine?: boolean;
  voted?: boolean;
}

export function validateQuestion(raw: unknown): { ok: true; text: string } | { ok: false; message: string } {
  if (typeof raw !== 'string') return { ok: false, message: 'Type your question.' };
  const text = cleanText(raw);
  if (text.length < 3) return { ok: false, message: 'Type your question.' };
  if (text.length > QA_MAX_LENGTH) return { ok: false, message: `Keep it under ${QA_MAX_LENGTH} characters.` };
  return { ok: true, text };
}

/** Pinned first; then, for "popular", unanswered before answered and most votes first; "recent" is newest first. */
export function sortQuestions<T extends Pick<AudienceQuestion, 'pinned' | 'answered' | 'votes' | 'createdAt'>>(list: T[], order: QuestionOrder): T[] {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (order === 'recent') return b.createdAt - a.createdAt;
    if (a.answered !== b.answered) return a.answered ? 1 : -1;
    return b.votes - a.votes || a.createdAt - b.createdAt;
  });
}

/** Whether a participant may (un)vote on a question. Votes are one per person, never on your own question. */
export function voteProblem(q: { status: QuestionStatus; authorId: string | null }, participantId: string): string | null {
  if (q.status !== 'visible') return 'This question is not open for votes.';
  if (q.authorId === participantId) return 'You cannot upvote your own question.';
  return null;
}
