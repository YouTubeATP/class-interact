import type { PrismaClient } from '@prisma/client';
import { hashToken } from '../auth';
import { notFound } from '../lib/errors';

export interface LearnerSessionRow {
  sessionId: string;
  title: string;
  createdAt: string;
  participants: number;
  /** People who joined with a "remember me" identity. */
  linked: number;
  /** ...of whom had been in an earlier session. */
  returning: number;
  /** Share of correct answers among linked people (scored questions only). */
  linkedCorrectRate: number | null;
  /** Average share of interactive activities a linked person answered. */
  linkedParticipation: number | null;
}

export interface LearnerRow {
  id: string;
  label: string;
  sessions: number;
  firstSeen: string;
  lastSeen: string;
  shareProgress: boolean;
  /** Only for people who agreed to share their own progress. */
  history: { sessionId: string; title: string; date: string; displayName: string; answered: number; correctRate: number | null; score: number }[] | null;
}

export interface LearnerReport {
  sessions: LearnerSessionRow[];
  learners: LearnerRow[];
  totals: { learners: number; sharing: number };
}

/**
 * Optional continuity across sessions. People are recognised by a random key on their own device, never by name.
 * The class-level view uses everyone who opted in; per-person history only appears for people who also agreed to
 * share their progress. Rehearsals never count.
 */
export class LearnerService {
  constructor(private prisma: PrismaClient) {}

  async report(): Promise<LearnerReport> {
    const learners = await this.prisma.learner.findMany({ orderBy: { createdAt: 'asc' } });
    const parts = await this.prisma.participant.findMany({
      where: { learnerId: { not: null }, removed: false, session: { rehearsal: false } },
      include: { session: { select: { id: true, title: true, createdAt: true, _count: { select: { participants: true } }, activities: { select: { type: true } } } }, submissions: { where: { status: { not: 'hidden' } }, select: { correct: true, score: true, sessionActivityId: true } } },
      orderBy: { joinedAt: 'asc' },
    });
    const bySession = new Map<string, typeof parts>();
    for (const p of parts) bySession.set(p.sessionId, [...(bySession.get(p.sessionId) ?? []), p]);
    const seenBefore = new Map<string, number>(); // learner -> first session time
    for (const p of parts) if (!seenBefore.has(p.learnerId!)) seenBefore.set(p.learnerId!, p.session.createdAt.getTime());

    const interactiveCount = (types: { type: string }[]) => types.filter((t) => t.type !== 'content').length;
    const sessions: LearnerSessionRow[] = [...bySession.values()]
      .map((ps) => {
        const s = ps[0].session;
        const graded = ps.flatMap((p) => p.submissions.filter((x) => x.correct !== null));
        const n = interactiveCount(s.activities);
        return {
          sessionId: s.id, title: s.title, createdAt: s.createdAt.toISOString(), participants: s._count.participants, linked: ps.length,
          returning: ps.filter((p) => seenBefore.get(p.learnerId!)! < s.createdAt.getTime()).length,
          linkedCorrectRate: graded.length ? graded.filter((x) => x.correct).length / graded.length : null,
          linkedParticipation: n ? ps.reduce((sum, p) => sum + new Set(p.submissions.map((x) => x.sessionActivityId)).size / n, 0) / ps.length : null,
        };
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    const rows: LearnerRow[] = learners.map((l) => {
      const mine = parts.filter((p) => p.learnerId === l.id);
      return {
        id: l.id, label: l.label, sessions: new Set(mine.map((p) => p.sessionId)).size, firstSeen: l.createdAt.toISOString(), lastSeen: l.lastSeenAt.toISOString(), shareProgress: l.shareProgress,
        history: l.shareProgress
          ? mine.map((p) => {
              const graded = p.submissions.filter((x) => x.correct !== null);
              return { sessionId: p.sessionId, title: p.session.title, date: p.session.createdAt.toISOString(), displayName: p.name, answered: new Set(p.submissions.map((x) => x.sessionActivityId)).size, correctRate: graded.length ? graded.filter((x) => x.correct).length / graded.length : null, score: p.submissions.reduce((n, x) => n + x.score, 0) };
            })
          : null,
      };
    });
    return { sessions, learners: rows, totals: { learners: learners.length, sharing: learners.filter((l) => l.shareProgress).length } };
  }

  async setLabel(id: string, label: string) {
    const r = await this.prisma.learner.updateMany({ where: { id }, data: { label: label.trim().slice(0, 60) } });
    if (!r.count) throw notFound('Learner not found');
  }

  /** Deletes the identity. Past sessions keep their (display-name-only) participant records, now unlinked. */
  async remove(id: string) {
    const r = await this.prisma.learner.deleteMany({ where: { id } });
    if (!r.count) throw notFound('Learner not found');
  }

  /** A participant deletes their own "remember me" identity with the key on their device. */
  async forget(key: string): Promise<boolean> {
    const r = await this.prisma.learner.deleteMany({ where: { keyHash: hashToken(key) } });
    return r.count > 0;
  }

  async setSharing(key: string, share: boolean): Promise<boolean> {
    const r = await this.prisma.learner.updateMany({ where: { keyHash: hashToken(key) }, data: { shareProgress: share } });
    return r.count > 0;
  }
}
