/**
 * Teaching analytics: pure computations over a session's raw data, so the server, the tests and (if ever needed)
 * the browser all agree. Every number here is measured; nothing is inferred by a model. Where a figure would be
 * misleading (too few answers, anonymous responses, no way to link people), it is left out rather than guessed.
 */
import { definitions, quizKind } from './activities';
import type { AudienceQuestion } from './qa';
import type { AnyConfig, PollConfig, QuizConfig, RatingConfig, SlideType } from './schema';

export interface AnalyticsInput {
  participants: { id: string; joinedAt: number; removed: boolean; simulated?: boolean }[];
  activities: { id: string; key: string; index: number; type: SlideType; config: AnyConfig; runs: { id: string; number: number; scoring: string; startedAt: number }[] }[];
  submissions: { id: string; runId: string; activityId: string; participantId: string; payload: any; correct: boolean | null; score: number; responseMs: number | null; status: string; createdAt: number }[];
  questions: AudienceQuestion[];
  endedAt: number | null;
}

export type Difficulty = 'easy' | 'moderate' | 'hard';

export interface QuestionStat {
  activityId: string;
  key: string;
  index: number;
  type: SlideType;
  title: string;
  runNumber: number;
  runCount: number;
  respondents: number;
  /** People present who could have answered. */
  eligible: number;
  nonresponseRate: number | null;
  /** Fully correct share (quizzes), 0–1. */
  correctRate: number | null;
  /** Share with some but not full credit (multiple / match / order with partial credit). */
  partialRate: number | null;
  avgMs: number | null;
  medianMs: number | null;
  difficulty: Difficulty | null;
  /** Options (choice questions) with counts and, for quizzes, which are correct. */
  distribution: { label: string; count: number; correct: boolean | null; misconception?: string }[];
  concepts: string[];
  /** Fewer than 3 answers: percentages are shown but not interpreted. */
  lowSample: boolean;
}

export interface RunComparison {
  activityId: string;
  index: number;
  title: string;
  type: SlideType;
  before: number;
  after: number;
  beforeRespondents: number;
  afterRespondents: number;
  beforeRate: number | null;
  afterRate: number | null;
  /** Percentage points, after minus before. */
  delta: number | null;
  distribution: { label: string; before: number; after: number; correct: boolean | null }[];
  ratingAverages: { before: number | null; after: number | null } | null;
  /** People who answered both runs (never shown for anonymous polls). */
  transitions: { stayedRight: number; improved: number; slipped: number; stayedWrong: number } | null;
}

export interface ConfidenceStat {
  activityId: string;
  title: string;
  linkedTitles: string[];
  pairs: number;
  /** Ratings exactly in the middle of the scale are not counted as high or low. */
  neutral: number;
  quadrants: { confidentCorrect: number; confidentWrong: number; unsureCorrect: number; unsureWrong: number };
  distribution: { value: number; count: number }[];
}

export interface ConceptStat {
  concept: string;
  questions: number;
  answers: number;
  correctRate: number;
}

export interface MisconceptionStat {
  misconception: string;
  count: number;
  /** Share of the question's respondents. */
  share: number;
  activityTitle: string;
  optionText: string;
}

export interface SessionAnalytics {
  participation: { participants: number; respondedAny: number; interactive: number; averageResponseRate: number | null };
  questions: QuestionStat[];
  scores: { bins: { from: number; to: number; count: number }[]; mean: number; median: number; max: number } | null;
  concepts: ConceptStat[];
  misconceptions: MisconceptionStat[];
  comparisons: RunComparison[];
  confidence: ConfidenceStat[];
  unansweredQuestions: AudienceQuestion[];
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function difficultyOf(rate: number | null, n: number): Difficulty | null {
  if (rate === null || n < 3) return null;
  return rate >= 0.8 ? 'easy' : rate >= 0.5 ? 'moderate' : 'hard';
}

function chosenIds(payload: any): string[] {
  return Array.isArray(payload?.optionIds) ? payload.optionIds : payload?.optionId ? [payload.optionId] : [];
}

function distributionFor(type: SlideType, config: AnyConfig, subs: AnalyticsInput['submissions']): QuestionStat['distribution'] {
  if (type === 'quiz') {
    const c = config as QuizConfig;
    const kind = quizKind(c);
    if (kind === 'single' || kind === 'multiple') {
      const correct = new Set(kind === 'single' ? [c.correctOptionId] : c.correctOptionIds);
      return c.options.map((o) => ({ label: o.text, count: subs.filter((s) => chosenIds(s.payload).includes(o.id)).length, correct: correct.has(o.id), ...(o.misconception ? { misconception: o.misconception } : {}) }));
    }
    if (kind === 'text' || kind === 'numeric') {
      const groups = new Map<string, { label: string; count: number; correct: number }>();
      for (const s of subs) {
        const label = String(s.payload?.text ?? '').trim();
        const k = label.toLowerCase();
        const g = groups.get(k) ?? { label, count: 0, correct: 0 };
        g.count++;
        if (s.correct) g.correct++;
        groups.set(k, g);
      }
      return [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 8).map((g) => ({ label: g.label, count: g.count, correct: g.correct * 2 >= g.count }));
    }
    return [];
  }
  if (type === 'poll') {
    const c = config as PollConfig;
    return c.options.map((o) => ({ label: o.text, count: subs.filter((s) => chosenIds(s.payload).includes(o.id)).length, correct: null }));
  }
  if (type === 'rating') {
    const c = config as RatingConfig;
    return Array.from({ length: c.max - c.min + 1 }, (_, i) => c.min + i).map((v) => ({ label: String(v), count: subs.filter((s) => s.payload?.value === v).length, correct: null }));
  }
  return [];
}

export function computeAnalytics(input: AnalyticsInput): SessionAnalytics {
  const people = input.participants.filter((p) => !p.removed);
  const visible = input.submissions.filter((s) => s.status !== 'hidden');
  const interactive = input.activities.filter((a) => definitions[a.type].interactive);
  const byRun = new Map<string, AnalyticsInput['submissions']>();
  for (const s of visible) byRun.set(s.runId, [...(byRun.get(s.runId) ?? []), s]);

  const eligibleFor = (runSubs: AnalyticsInput['submissions'], startedAt: number) => {
    // people who had joined by the time the last answer arrived (or a minute after the run started)
    const until = runSubs.length ? Math.max(...runSubs.map((s) => s.createdAt)) : startedAt + 60_000;
    return people.filter((p) => p.joinedAt <= until).length;
  };

  const questions: QuestionStat[] = [];
  for (const a of interactive) {
    const def = definitions[a.type] as any;
    const hasAnswer = def.behavior(a.config).hasCorrectAnswer;
    // the latest run that received answers (or the latest run)
    const run = [...a.runs].reverse().find((r) => (byRun.get(r.id) ?? []).length) ?? a.runs[a.runs.length - 1];
    if (!run) continue;
    const subs = byRun.get(run.id) ?? [];
    const firstPer = new Map<string, (typeof subs)[number]>();
    for (const s of subs) if (!firstPer.has(s.participantId)) firstPer.set(s.participantId, s);
    const answers = [...firstPer.values()];
    const respondents = answers.length;
    const eligible = Math.max(respondents, eligibleFor(subs, run.startedAt));
    const times = answers.map((s) => s.responseMs).filter((x): x is number => typeof x === 'number' && x > 0);
    const correctRate = hasAnswer && respondents ? answers.filter((s) => s.correct).length / respondents : null;
    const partialRate = hasAnswer && respondents ? answers.filter((s) => !s.correct && s.score > 0).length / respondents : null;
    questions.push({
      activityId: a.id, key: a.key, index: a.index, type: a.type, title: def.titleOf(a.config), runNumber: run.number, runCount: a.runs.length,
      respondents, eligible, nonresponseRate: eligible ? 1 - respondents / eligible : null,
      correctRate, partialRate: partialRate && partialRate > 0 ? partialRate : hasAnswer ? 0 : null,
      // response time only means something with a shared clock (live, timed or not); self-paced answers have none
      avgMs: times.length ? Math.round(mean(times)!) : null, medianMs: times.length ? Math.round(median(times)!) : null,
      difficulty: difficultyOf(correctRate, respondents),
      distribution: distributionFor(a.type, a.config, answers),
      concepts: a.type === 'quiz' ? ((a.config as QuizConfig).concepts ?? []) : [],
      lowSample: respondents < 3,
    });
  }

  // score distribution over people who answered at least one scored question
  const scoredActivityIds = new Set(input.activities.filter((a) => (definitions[a.type] as any).behavior(a.config).hasCorrectAnswer).map((a) => a.id));
  const totals = new Map<string, number>();
  for (const s of visible) if (scoredActivityIds.has(s.activityId)) totals.set(s.participantId, (totals.get(s.participantId) ?? 0) + s.score);
  let scores: SessionAnalytics['scores'] = null;
  if (totals.size) {
    const vals = [...totals.values()];
    const max = Math.max(...vals, 1);
    const width = Math.max(1, Math.ceil(max / 6 / 10) * 10);
    const bins = Array.from({ length: Math.ceil((max + 1) / width) }, (_, i) => ({ from: i * width, to: (i + 1) * width - 1, count: 0 }));
    for (const v of vals) bins[Math.min(bins.length - 1, Math.floor(v / width))].count++;
    scores = { bins, mean: Math.round(mean(vals)!), median: Math.round(median(vals)!), max };
  }

  // concepts (optional metadata on quizzes)
  const conceptMap = new Map<string, { questions: Set<string>; answers: number; correct: number }>();
  for (const q of questions) {
    if (q.correctRate === null) continue;
    for (const c of q.concepts) {
      const key = c.trim();
      const e = conceptMap.get(key.toLowerCase()) ?? { questions: new Set<string>(), answers: 0, correct: 0 };
      e.questions.add(q.activityId);
      e.answers += q.respondents;
      e.correct += Math.round(q.correctRate * q.respondents);
      conceptMap.set(key.toLowerCase(), e);
    }
  }
  const conceptLabel = new Map<string, string>();
  for (const q of questions) for (const c of q.concepts) if (!conceptLabel.has(c.trim().toLowerCase())) conceptLabel.set(c.trim().toLowerCase(), c.trim());
  const concepts: ConceptStat[] = [...conceptMap.entries()]
    .filter(([, e]) => e.answers > 0)
    .map(([k, e]) => ({ concept: conceptLabel.get(k) ?? k, questions: e.questions.size, answers: e.answers, correctRate: e.correct / e.answers }))
    .sort((a, b) => a.correctRate - b.correctRate || a.concept.localeCompare(b.concept));

  const misconceptions: MisconceptionStat[] = questions
    .flatMap((q) => q.distribution.filter((d) => d.misconception && d.count > 0).map((d) => ({ misconception: d.misconception!, count: d.count, share: q.respondents ? d.count / q.respondents : 0, activityTitle: q.title, optionText: d.label })))
    .sort((a, b) => b.share - a.share || b.count - a.count);

  // before / after: first and latest run of every activity that ran more than once
  const comparisons: RunComparison[] = [];
  for (const a of interactive) {
    if (a.runs.length < 2) continue;
    const def = definitions[a.type] as any;
    const hasAnswer = def.behavior(a.config).hasCorrectAnswer;
    const [r1, r2] = [a.runs[0], a.runs[a.runs.length - 1]];
    const s1 = byRun.get(r1.id) ?? [];
    const s2 = byRun.get(r2.id) ?? [];
    const rate = (xs: typeof s1) => (hasAnswer && xs.length ? xs.filter((s) => s.correct).length / xs.length : null);
    const d1 = distributionFor(a.type, a.config, s1);
    const d2 = distributionFor(a.type, a.config, s2);
    const labels = [...new Set([...d1.map((d) => d.label), ...d2.map((d) => d.label)])];
    const avg = (xs: typeof s1) => mean(xs.map((s) => s.payload?.value).filter((v): v is number => typeof v === 'number'));
    const anonymous = a.type === 'poll' && (a.config as PollConfig).anonymous;
    let transitions: RunComparison['transitions'] = null;
    if (hasAnswer && !anonymous) {
      const before = new Map(s1.map((s) => [s.participantId, !!s.correct]));
      const t = { stayedRight: 0, improved: 0, slipped: 0, stayedWrong: 0 };
      let both = 0;
      for (const s of s2) {
        if (!before.has(s.participantId)) continue;
        both++;
        const b = before.get(s.participantId)!;
        const now = !!s.correct;
        if (b && now) t.stayedRight++; else if (!b && now) t.improved++; else if (b && !now) t.slipped++; else t.stayedWrong++;
      }
      transitions = both ? t : null;
    }
    const br = rate(s1);
    const ar = rate(s2);
    comparisons.push({
      activityId: a.id, index: a.index, title: def.titleOf(a.config), type: a.type, before: r1.number, after: r2.number,
      beforeRespondents: new Set(s1.map((s) => s.participantId)).size, afterRespondents: new Set(s2.map((s) => s.participantId)).size,
      beforeRate: br, afterRate: ar, delta: br !== null && ar !== null ? Math.round((ar - br) * 100) : null,
      distribution: labels.map((label) => ({ label, before: d1.find((d) => d.label === label)?.count ?? 0, after: d2.find((d) => d.label === label)?.count ?? 0, correct: d1.find((d) => d.label === label)?.correct ?? d2.find((d) => d.label === label)?.correct ?? null })),
      ratingAverages: a.type === 'rating' ? { before: avg(s1), after: avg(s2) } : null,
      transitions,
    });
  }

  // confidence ratings paired with quizzes, person by person within this session
  const confidence: ConfidenceStat[] = [];
  for (const a of input.activities.filter((x) => x.type === 'rating' && (x.config as RatingConfig).confidenceFor?.length)) {
    const c = a.config as RatingConfig;
    const linked = input.activities.filter((x) => c.confidenceFor!.includes(x.key) && x.type === 'quiz');
    if (!linked.length) continue;
    const ratingRun = a.runs[a.runs.length - 1];
    const ratings = new Map((byRun.get(ratingRun?.id ?? '') ?? []).map((s) => [s.participantId, s.payload?.value as number]));
    const correctness = new Map<string, number[]>();
    for (const q of linked) {
      const run = q.runs[q.runs.length - 1];
      for (const s of byRun.get(run?.id ?? '') ?? []) correctness.set(s.participantId, [...(correctness.get(s.participantId) ?? []), s.correct ? 1 : 0]);
    }
    const mid = (c.min + c.max) / 2;
    const quadrants = { confidentCorrect: 0, confidentWrong: 0, unsureCorrect: 0, unsureWrong: 0 };
    let pairs = 0;
    let neutral = 0;
    for (const [pid, value] of ratings) {
      const cs = correctness.get(pid);
      if (!cs?.length || typeof value !== 'number') continue;
      pairs++;
      if (value === mid) { neutral++; continue; }
      const right = mean(cs)! >= 0.5;
      const sure = value > mid;
      if (sure && right) quadrants.confidentCorrect++; else if (sure) quadrants.confidentWrong++; else if (right) quadrants.unsureCorrect++; else quadrants.unsureWrong++;
    }
    confidence.push({
      activityId: a.id, title: (definitions.rating as any).titleOf(c), linkedTitles: linked.map((q) => (definitions.quiz as any).titleOf(q.config)), pairs, neutral, quadrants,
      distribution: Array.from({ length: c.max - c.min + 1 }, (_, i) => c.min + i).map((v) => ({ value: v, count: [...ratings.values()].filter((x) => x === v).length })),
    });
  }

  const respondedAny = new Set(visible.map((s) => s.participantId)).size;
  const rates = questions.filter((q) => q.eligible > 0).map((q) => q.respondents / q.eligible);
  return {
    participation: { participants: people.length, respondedAny, interactive: interactive.length, averageResponseRate: rates.length ? mean(rates) : null },
    questions,
    scores,
    concepts,
    misconceptions,
    comparisons,
    confidence,
    unansweredQuestions: input.questions.filter((q) => q.status === 'visible' && !q.answered).sort((a, b) => b.votes - a.votes || a.createdAt - b.createdAt).slice(0, 10),
  };
}

// ---------------------------------------------------------------------------------------
// Session recap: deterministic statements, each traceable to a number above
// ---------------------------------------------------------------------------------------

export interface RecapItem {
  text: string;
  /** Where the statement comes from (slide number), when it is about one slide. */
  slide?: number;
}

export interface SessionRecap {
  participation: RecapItem[];
  difficult: RecapItem[];
  misconceptions: RecapItem[];
  observations: RecapItem[];
  shifts: RecapItem[];
  unanswered: RecapItem[];
  followUps: RecapItem[];
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function buildRecap(a: SessionAnalytics): SessionRecap {
  const p = a.participation;
  const participation: RecapItem[] = [
    { text: `${p.participants} ${p.participants === 1 ? 'person' : 'people'} joined; ${p.respondedAny} answered at least one activity.` },
  ];
  if (p.averageResponseRate !== null) participation.push({ text: `On average ${pct(p.averageResponseRate)} of the people present answered each of the ${p.interactive} interactive activities.` });
  const quiet = a.questions.filter((q) => q.nonresponseRate !== null && q.nonresponseRate >= 0.4 && q.eligible >= 5);
  for (const q of quiet.slice(0, 3)) participation.push({ text: `“${q.title}”: ${pct(q.nonresponseRate!)} of those present did not answer.`, slide: q.index + 1 });

  const difficult = a.questions
    .filter((q) => q.difficulty === 'hard')
    .sort((x, y) => (x.correctRate ?? 0) - (y.correctRate ?? 0))
    .slice(0, 5)
    .map((q) => ({ text: `“${q.title}”: ${pct(q.correctRate!)} answered fully correctly (${q.respondents} answers).`, slide: q.index + 1 }));

  const misconceptions = a.misconceptions
    .filter((m) => m.share >= 0.2 && m.count >= 2)
    .slice(0, 5)
    .map((m) => ({ text: `${pct(m.share)} chose “${m.optionText}” in “${m.activityTitle}”, which points to: ${m.misconception}.` }));

  const observations: RecapItem[] = [];
  for (const q of a.questions) {
    if (q.respondents < 5 || q.type === 'quiz') continue;
    if (q.type === 'poll') {
      const top = [...q.distribution].sort((x, y) => y.count - x.count)[0];
      if (top && top.count / q.respondents >= 0.6) observations.push({ text: `In “${q.title}”, ${pct(top.count / q.respondents)} chose “${top.label}” (${q.respondents} answers).`, slide: q.index + 1 });
    }
    if (q.type === 'rating') {
      const n = q.distribution.reduce((s, d) => s + d.count, 0);
      const avg = n ? q.distribution.reduce((s, d) => s + Number(d.label) * d.count, 0) / n : null;
      if (avg !== null) observations.push({ text: `“${q.title}” averaged ${avg.toFixed(1)} (${n} answers).`, slide: q.index + 1 });
    }
  }
  for (const q of a.questions.filter((x) => x.difficulty === 'easy' && x.respondents >= 5).slice(0, 2)) {
    observations.push({ text: `“${q.title}” was well understood: ${pct(q.correctRate!)} correct.`, slide: q.index + 1 });
  }
  for (const c of a.confidence) {
    if (c.pairs >= 4 && c.quadrants.confidentWrong / c.pairs >= 0.25) observations.push({ text: `${c.quadrants.confidentWrong} of ${c.pairs} people felt confident but answered incorrectly on the linked questions (“${c.title}”).` });
  }

  const shifts = a.comparisons
    .filter((c) => c.delta !== null && Math.abs(c.delta) >= 10 && c.beforeRespondents >= 3 && c.afterRespondents >= 3)
    .map((c) => ({ text: `“${c.title}”: correct answers went from ${pct(c.beforeRate!)} (run ${c.before}) to ${pct(c.afterRate!)} (run ${c.after}), ${c.delta! > 0 ? 'up' : 'down'} ${Math.abs(c.delta!)} points.`, slide: c.index + 1 }));
  for (const c of a.comparisons) {
    if (c.ratingAverages?.before != null && c.ratingAverages.after != null && Math.abs(c.ratingAverages.after - c.ratingAverages.before) >= 0.5) {
      shifts.push({ text: `“${c.title}” average moved from ${c.ratingAverages.before.toFixed(1)} to ${c.ratingAverages.after.toFixed(1)}.`, slide: c.index + 1 });
    }
  }

  const unanswered = a.unansweredQuestions.slice(0, 5).map((q) => ({ text: `${q.text} (${q.votes} ${q.votes === 1 ? 'vote' : 'votes'})` }));

  const followUps: RecapItem[] = [];
  const weakest = a.concepts.find((c) => c.correctRate < 0.6 && c.answers >= 3);
  if (weakest) followUps.push({ text: `Revisit “${weakest.concept}”: ${pct(weakest.correctRate)} correct across ${weakest.questions} ${weakest.questions === 1 ? 'question' : 'questions'}.` });
  if (difficult[0]) followUps.push({ text: `Go over ${difficult[0].text.split(':')[0]} again with a worked example.`, slide: difficult[0].slide });
  if (misconceptions[0]) followUps.push({ text: `Address the misconception behind the most common wrong answer: ${a.misconceptions[0].misconception}.` });
  const cw = a.confidence.find((c) => c.quadrants.confidentWrong > 0);
  if (cw) followUps.push({ text: `Some students were confident but wrong: give a quick check that shows the gap, rather than repeating the explanation.` });
  if (unanswered.length) followUps.push({ text: `Answer the ${unanswered.length === 1 ? 'open audience question' : `${unanswered.length} most popular open audience questions`} at the start of next lesson.` });
  if (!followUps.length && a.questions.length) followUps.push({ text: 'No clear problem areas: consider moving on, or a short retrieval quiz next time to check it sticks.' });

  return { participation, difficult, misconceptions, observations, shifts, unanswered, followUps };
}
