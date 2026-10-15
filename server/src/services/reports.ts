import type { PrismaClient } from '@prisma/client';
import {
  computeStandings, definitions,
  type ActivityResultsView, type AggSubmission, type SessionMode, type SessionResultsView, type SlideType, type SubmissionStatus,
} from '@classinteract/shared';
import { notFound } from '../lib/errors';

/** Quote a CSV cell; neutralise spreadsheet formula injection (=, +, -, @ at the start). */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const csvRow = (cells: unknown[]) => cells.map(csvCell).join(',');

/** Results and exports are built straight from the database, so they work for live and ended sessions alike. */
export class ReportService {
  constructor(private prisma: PrismaClient) {}

  private async load(sessionId: string) {
    const s = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        activities: { orderBy: { position: 'asc' } },
        participants: true,
        submissions: { orderBy: { createdAt: 'asc' } },
        _count: { select: { participants: true, submissions: true } },
      },
    });
    if (!s) throw notFound('Session not found');
    return s;
  }

  async results(sessionId: string): Promise<SessionResultsView> {
    const s = await this.load(sessionId);
    const names = new Map(s.participants.map((p) => [p.id, p]));
    const activities: ActivityResultsView[] = s.activities.map((a) => {
      const type = a.type as SlideType;
      const config = JSON.parse(a.config);
      const subs = s.submissions.filter((x) => x.sessionActivityId === a.id);
      const agg: AggSubmission[] = subs.map((x) => ({
        id: x.id, participantId: x.participantId, payload: JSON.parse(x.payload), status: x.status as SubmissionStatus, key: x.key, createdAt: x.createdAt.getTime(), correct: x.correct, score: x.score,
      }));
      const counted = subs.filter((x) => x.status !== 'hidden');
      return {
        index: a.position,
        key: a.key,
        type,
        title: (definitions[type] as any).titleOf(config),
        config,
        results: (definitions[type] as any).aggregate(config, agg),
        responses: counted.length,
        respondents: new Set(counted.map((x) => x.participantId)).size,
      };
    });
    const scoredIds = new Set(
      s.activities.filter((a) => (definitions[a.type as SlideType] as any).behavior(JSON.parse(a.config)).hasCorrectAnswer).map((a) => a.id),
    );
    const standings = computeStandings(
      s.submissions
        .filter((x) => scoredIds.has(x.sessionActivityId) && x.status !== 'hidden' && !names.get(x.participantId)?.removed)
        .map((x) => ({ participantId: x.participantId, name: names.get(x.participantId)?.name ?? '?', score: x.score, correct: x.correct, responseMs: x.responseMs ?? 0 })),
    );
    return {
      session: {
        id: s.id, title: s.title, pin: s.livePin, mode: s.mode as SessionMode, status: s.status === 'ended' ? 'ended' : 'live', presentationId: s.presentationId,
        participantCount: s._count.participants, responseCount: s._count.submissions, createdAt: s.createdAt.toISOString(), endedAt: s.endedAt?.toISOString() ?? null,
      },
      theme: JSON.parse(s.theme),
      participants: s.participants.filter((p) => !p.removed).length,
      activities,
      standings,
    };
  }

  /** One row per response (surveys: one row per answered question). */
  async csv(sessionId: string): Promise<{ filename: string; csv: string }> {
    const s = await this.load(sessionId);
    const names = new Map(s.participants.map((p) => [p.id, p.name]));
    const acts = new Map(s.activities.map((a) => [a.id, a]));
    const header = ['slide_number', 'slide_type', 'slide_title', 'question', 'participant', 'submitted_at', 'response', 'correct', 'score', 'response_time_s', 'moderation_status'];
    const lines = [csvRow(header)];
    const ordered = [...s.submissions].sort((a, b) => (acts.get(a.sessionActivityId)!.position - acts.get(b.sessionActivityId)!.position) || a.createdAt.getTime() - b.createdAt.getTime());
    for (const x of ordered) {
      const a = acts.get(x.sessionActivityId)!;
      const type = a.type as SlideType;
      const config = JSON.parse(a.config);
      const anonymous = type === 'poll' && config.anonymous === true;
      const participant = anonymous ? '(anonymous)' : names.get(x.participantId) ?? '';
      const lines_ = (definitions[type] as any).describeResponses(config, JSON.parse(x.payload)) as { prompt: string; response: string }[];
      const title = (definitions[type] as any).titleOf(config);
      for (const l of lines_) {
        lines.push(csvRow([a.position + 1, type, title, l.prompt, participant, x.createdAt.toISOString(), l.response, x.correct === null ? '' : x.correct ? 'yes' : 'no', type === 'quiz' ? x.score : '', x.responseMs === null ? '' : (x.responseMs / 1000).toFixed(1), x.status]));
      }
    }
    const slug = s.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'session';
    return { filename: `${slug}-${s.pin}-${s.createdAt.toISOString().slice(0, 10)}.csv`, csv: '﻿' + lines.join('\r\n') + '\r\n' };
  }
}
