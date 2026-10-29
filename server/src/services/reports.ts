import type { PrismaClient } from '@prisma/client';
import {
  buildRecap, computeAnalytics, type SessionAnalytics, type SessionRecap,
  computeTeamStandings, definitions, mergedKey, resolveFeatures, sortQuestions, standingsFromRuns,
  type ActivityResultsView, type AggSubmission, type AudienceQuestion, type QuestionStatus, type RunResults, type RunScoring, type SessionMode,
  type SessionResultsView, type SlideType, type SubmissionStatus,
} from '@classinteract/shared';
import { notFound } from '../lib/errors';

/** Quote a CSV cell; neutralise spreadsheet formula injection (=, +, -, @ at the start). */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const csvRow = (cells: unknown[]) => cells.map(csvCell).join(',');

export const slugify = (title: string, max = 40) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, max) || 'session';

/** Results and exports are built straight from the database, so they work for live and ended sessions alike. */
export class ReportService {
  constructor(private prisma: PrismaClient) {}

  async load(sessionId: string) {
    const s = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        activities: { orderBy: { position: 'asc' }, include: { runs: { orderBy: { number: 'asc' } } } },
        participants: true,
        submissions: { orderBy: { createdAt: 'asc' } },
        teams: { orderBy: { position: 'asc' } },
        questions: { include: { _count: { select: { votes: true } } } },
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
      const def = definitions[type] as any;
      const hasAnswer = def.behavior(config).hasCorrectAnswer;
      const runs: RunResults[] = a.runs.map((r) => {
        const subs = s.submissions.filter((x) => x.runId === r.id);
        const merges = JSON.parse(r.merges || '{}') as Record<string, string>;
        const agg: AggSubmission[] = subs.map((x) => ({
          id: x.id, participantId: x.participantId, payload: JSON.parse(x.payload), status: x.status as SubmissionStatus,
          key: x.key && type === 'wordcloud' ? mergedKey(x.key, merges) : x.key, createdAt: x.createdAt.getTime(), correct: x.correct, score: x.score,
        }));
        const visible = subs.filter((x) => x.status !== 'hidden');
        return {
          id: r.id, number: r.number, scoring: r.scoring as RunScoring, startedAt: r.startedAt.getTime(),
          respondents: new Set(visible.map((x) => x.participantId)).size,
          results: def.aggregate(config, agg, { seed: a.seed }),
          correctRate: hasAnswer && visible.length ? visible.filter((x) => x.correct).length / visible.length : null,
        };
      });
      const latest = runs[runs.length - 1];
      const counted = s.submissions.filter((x) => x.runId === latest?.id && x.status !== 'hidden');
      return {
        index: a.position,
        key: a.key,
        type,
        title: def.titleOf(config),
        config,
        results: latest?.results ?? def.aggregate(config, [], { seed: a.seed }),
        responses: counted.length,
        respondents: new Set(counted.map((x) => x.participantId)).size,
        runs,
      };
    });
    const scored = s.activities.filter((a) => (definitions[a.type as SlideType] as any).behavior(JSON.parse(a.config)).hasCorrectAnswer);
    const features = resolveFeatures(JSON.parse(s.features || '{}'));
    const selfPacedReveal = s.mode === 'selfpaced';
    const standings = standingsFromRuns(
      scored.flatMap((a) => a.runs.map((r) => ({ id: r.id, activityId: a.id, number: r.number, scoring: r.scoring as RunScoring, answerRevealed: r.answerRevealed }))),
      s.submissions.filter((x) => x.status !== 'hidden').map((x) => ({ runId: x.runId, participantId: x.participantId, score: x.score, correct: x.correct, responseMs: x.responseMs ?? 0 })),
      new Map(s.participants.filter((p) => !p.removed).map((p) => [p.id, p.name])),
      { includeUnrevealed: selfPacedReveal },
    );
    const active = s.participants.filter((p) => !p.removed);
    const teamStandings = features.teams.enabled && s.teams.length
      ? computeTeamStandings(s.teams.map((t) => ({ id: t.id, name: t.name, color: t.color, memberIds: active.filter((p) => p.teamId === t.id).map((p) => p.id) })), standings)
      : [];
    const questions: AudienceQuestion[] = sortQuestions(
      s.questions.map((q) => ({ id: q.id, text: q.text, authorName: q.anonymous ? null : q.authorName, status: q.status as QuestionStatus, pinned: q.pinned, answered: q.answered, votes: q._count.votes, createdAt: q.createdAt.getTime() })),
      'popular',
    );
    return {
      session: {
        id: s.id, title: s.title, pin: s.livePin, mode: s.mode as SessionMode, rehearsal: s.rehearsal, status: s.status === 'ended' ? 'ended' : 'live', presentationId: s.presentationId,
        participantCount: s._count.participants, responseCount: s._count.submissions, createdAt: s.createdAt.toISOString(), endedAt: s.endedAt?.toISOString() ?? null,
      },
      theme: JSON.parse(s.theme),
      participants: active.length,
      activities,
      standings,
      teamStandings,
      questions,
    };
  }

  async analytics(sessionId: string): Promise<{ analytics: SessionAnalytics; recap: SessionRecap; rehearsal: boolean }> {
    const s = await this.load(sessionId);
    const analytics = computeAnalytics({
      participants: s.participants.map((p) => ({ id: p.id, joinedAt: p.joinedAt.getTime(), removed: p.removed, simulated: p.simulated })),
      activities: s.activities.map((a) => ({ id: a.id, key: a.key, index: a.position, type: a.type as SlideType, config: JSON.parse(a.config), runs: a.runs.map((r) => ({ id: r.id, number: r.number, scoring: r.scoring, startedAt: r.startedAt.getTime() })) })),
      submissions: s.submissions.map((x) => ({ id: x.id, runId: x.runId, activityId: x.sessionActivityId, participantId: x.participantId, payload: JSON.parse(x.payload), correct: x.correct, score: x.score, responseMs: s.mode === 'selfpaced' ? null : x.responseMs, status: x.status, createdAt: x.createdAt.getTime() })),
      questions: s.questions.map((q) => ({ id: q.id, text: q.text, authorName: q.anonymous ? null : q.authorName, status: q.status as QuestionStatus, pinned: q.pinned, answered: q.answered, votes: q._count.votes, createdAt: q.createdAt.getTime() })),
      endedAt: s.endedAt?.getTime() ?? null,
    });
    return { analytics, recap: buildRecap(analytics), rehearsal: s.rehearsal };
  }

  /** One row per response (surveys: one row per answered question). Repeated activities have one block per run. */
  async csv(sessionId: string): Promise<{ filename: string; csv: string }> {
    const s = await this.load(sessionId);
    const names = new Map(s.participants.map((p) => [p.id, p.name]));
    const teams = new Map(s.teams.map((t) => [t.id, t.name]));
    const teamOf = new Map(s.participants.map((p) => [p.id, p.teamId ? teams.get(p.teamId) ?? '' : '']));
    const acts = new Map(s.activities.map((a) => [a.id, a]));
    const runNo = new Map(s.activities.flatMap((a) => a.runs.map((r) => [r.id, r] as const)));
    // the original columns keep their positions (spreadsheets built on older exports still work); new ones follow
    const header = ['slide_number', 'slide_type', 'slide_title', 'question', 'participant', 'submitted_at', 'response', 'correct', 'score', 'response_time_s', 'moderation_status', 'run', 'run_scoring', 'team', 'review', 'grading_note'];
    const lines = [csvRow(header)];
    const ordered = [...s.submissions].sort((a, b) =>
      (acts.get(a.sessionActivityId)!.position - acts.get(b.sessionActivityId)!.position) || ((runNo.get(a.runId)?.number ?? 1) - (runNo.get(b.runId)?.number ?? 1)) || a.createdAt.getTime() - b.createdAt.getTime());
    for (const x of ordered) {
      const a = acts.get(x.sessionActivityId)!;
      const type = a.type as SlideType;
      const config = JSON.parse(a.config);
      const anonymous = type === 'poll' && config.anonymous === true;
      const participant = anonymous ? '(anonymous)' : names.get(x.participantId) ?? '';
      const lines_ = (definitions[type] as any).describeResponses(config, JSON.parse(x.payload), { seed: a.seed }) as { prompt: string; response: string }[];
      const title = (definitions[type] as any).titleOf(config);
      const run = runNo.get(x.runId);
      for (const l of lines_) {
        lines.push(csvRow([a.position + 1, type, title, l.prompt, participant, x.createdAt.toISOString(), l.response, x.correct === null ? '' : x.correct ? 'yes' : 'no', type === 'quiz' ? x.score : '', x.responseMs === null ? '' : (x.responseMs / 1000).toFixed(1), x.status, run?.number ?? 1, run?.scoring ?? 'counted', anonymous ? '' : teamOf.get(x.participantId) ?? '', x.review ?? '', x.detail ?? '']));
      }
    }
    if (s.questions.length) {
      // audience questions follow the responses, in their own block
      lines.push('');
      lines.push(csvRow(['audience_question', 'asked_by', 'asked_at', 'votes', 'status', 'pinned', 'answered']));
      for (const q of [...s.questions].sort((a, b) => b._count.votes - a._count.votes || a.createdAt.getTime() - b.createdAt.getTime())) {
        lines.push(csvRow([q.text, q.anonymous ? '(anonymous)' : q.authorName ?? '', q.createdAt.toISOString(), q._count.votes, q.status, q.pinned ? 'yes' : 'no', q.answered ? 'yes' : 'no']));
      }
    }
    return { filename: `${slugify(s.title)}-${s.pin}-${s.createdAt.toISOString().slice(0, 10)}.csv`, csv: '﻿' + lines.join('\r\n') + '\r\n' };
  }
}
