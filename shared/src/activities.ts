/**
 * The activity engine. One definition per slide type, all behind the same interface:
 * configuration defaults, submission validation, scoring, result aggregation,
 * public (audience-safe) configuration, and human-readable export.
 *
 * Rendering (projector / participant / presenter UI) is registered separately in the web app,
 * keyed by the same `type`. Nothing in here knows about databases or sockets.
 */
import {
  INTERACTIVE_TYPES,
  type AnyConfig,
  type ConfigByType,
  type PollConfig,
  type QuizConfig,
  type RatingConfig,
  type OpenConfig,
  type SlideType,
  type SurveyConfig,
  type SurveyQuestion,
  type WordcloudConfig,
} from './schema';
import { cleanText, countWords, normalizeKey } from './text';

export type SubmissionStatus = 'visible' | 'pending' | 'hidden';

export interface AggSubmission {
  id: string;
  participantId: string;
  payload: any;
  status: SubmissionStatus;
  key: string | null;
  createdAt: number;
  correct: boolean | null;
  score: number;
}

// ---------------------------------------------------------------------------------------
// Result shapes
// ---------------------------------------------------------------------------------------

export interface ChoiceTally {
  kind: 'choice';
  total: number; // respondents
  counts: Record<string, number>; // optionId -> votes
}
export interface RatingTally {
  kind: 'rating';
  total: number;
  average: number | null;
  distribution: { value: number; count: number }[];
}
export interface TextTally {
  kind: 'text';
  total: number;
  items: { id: string; text: string; at: number }[];
}
export interface TermsTally {
  kind: 'terms';
  total: number;
  terms: { key: string; label: string; count: number }[];
}

export type Results =
  | ({ type: 'quiz' } & ChoiceTally)
  | ({ type: 'poll' } & ChoiceTally)
  | ({ type: 'wordcloud' } & TermsTally)
  | ({ type: 'open' } & TextTally)
  | ({ type: 'rating' } & RatingTally)
  | { type: 'survey'; total: number; questions: Record<string, ChoiceTally | RatingTally | TextTally> }
  | { type: 'content' };

export interface Behavior {
  interactive: boolean;
  hasCorrectAnswer: boolean;
  liveResults: boolean;
  shareResults: boolean;
  timeLimitSec: number | null;
  autoOpen: boolean;
  maxSubmissions: number;
}

export type ValidationResult =
  | { ok: true; payload: any; key: string | null; status: SubmissionStatus }
  | { ok: false; message: string };

export interface ResponseLine {
  prompt: string;
  response: string;
}

export interface ActivityDefinition<T extends SlideType = SlideType> {
  type: T;
  label: string;
  description: string;
  interactive: boolean;
  behavior(config: ConfigByType[T]): Behavior;
  validate(config: ConfigByType[T], raw: unknown): ValidationResult;
  /** Free text inside a payload — the server runs its text-moderation filter over these. */
  extractText(config: ConfigByType[T], payload: any): string[];
  evaluate(config: ConfigByType[T], payload: any, ctx: { elapsedMs: number }): { correct: boolean | null; score: number };
  aggregate(config: ConfigByType[T], subs: AggSubmission[]): Results;
  /** Strips speaker notes and (until revealed) the correct answer. Safe to send to the audience. */
  publicConfig(config: ConfigByType[T], opts: { revealCorrect: boolean }): ConfigByType[T];
  describeResponses(config: ConfigByType[T], payload: any): ResponseLine[];
  titleOf(config: ConfigByType[T]): string;
}

// ---------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------

const ok = (payload: any, key: string | null = null, status: SubmissionStatus = 'visible'): ValidationResult => ({ ok: true, payload, key, status });
const bad = (message: string): ValidationResult => ({ ok: false, message });
const isObj = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function openMaxLength(c: { mode: 'short' | 'paragraph'; maxLength?: number }): number {
  return c.maxLength ?? (c.mode === 'paragraph' ? 600 : 140);
}

function validateChoice(c: { options: { id: string }[]; multiple: boolean; maxSelections: number | null }, raw: unknown): ValidationResult {
  if (!isObj(raw) || !Array.isArray(raw.optionIds)) return bad('Pick an option');
  const ids = raw.optionIds as unknown[];
  if (ids.some((x) => typeof x !== 'string')) return bad('Invalid choice');
  const unique = [...new Set(ids as string[])];
  if (unique.length === 0) return bad('Pick an option');
  const valid = new Set(c.options.map((o) => o.id));
  if (unique.some((id) => !valid.has(id))) return bad('That option no longer exists');
  if (!c.multiple && unique.length !== 1) return bad('Pick exactly one option');
  const limit = c.maxSelections ?? c.options.length;
  if (c.multiple && unique.length > limit) return bad(`Pick at most ${limit} option${limit === 1 ? '' : 's'}`);
  return ok({ optionIds: unique });
}

function validateRating(c: { min: number; max: number }, raw: unknown): ValidationResult {
  if (!isObj(raw) || typeof raw.value !== 'number' || !Number.isInteger(raw.value)) return bad('Choose a rating');
  if (raw.value < c.min || raw.value > c.max) return bad(`Rating must be between ${c.min} and ${c.max}`);
  return ok({ value: raw.value });
}

function validateText(c: { mode: 'short' | 'paragraph'; maxLength?: number }, raw: unknown, moderation: 'off' | 'premoderate' = 'off'): ValidationResult {
  if (!isObj(raw) || typeof raw.text !== 'string') return bad('Type a response');
  const text = c.mode === 'paragraph' ? raw.text.normalize('NFKC').replace(/\r\n/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() : cleanText(raw.text);
  if (!text) return bad('Type a response');
  const max = openMaxLength(c);
  if (text.length > max) return bad(`Keep it under ${max} characters`);
  return ok({ text }, null, moderation === 'premoderate' ? 'pending' : 'visible');
}

function tallyChoice(options: { id: string }[], subs: AggSubmission[]): ChoiceTally {
  const counts: Record<string, number> = Object.fromEntries(options.map((o) => [o.id, 0]));
  let total = 0;
  for (const s of subs) {
    if (s.status !== 'visible') continue;
    const ids: string[] = s.payload?.optionIds ?? [];
    let any = false;
    for (const id of ids) if (id in counts) { counts[id]++; any = true; }
    if (any) total++;
  }
  return { kind: 'choice', total, counts };
}

function tallyRating(c: { min: number; max: number }, subs: AggSubmission[]): RatingTally {
  const dist = new Map<number, number>();
  for (let v = c.min; v <= c.max; v++) dist.set(v, 0);
  let sum = 0;
  let total = 0;
  for (const s of subs) {
    if (s.status !== 'visible') continue;
    const v = s.payload?.value;
    if (typeof v !== 'number' || !dist.has(v)) continue;
    dist.set(v, dist.get(v)! + 1);
    sum += v;
    total++;
  }
  return {
    kind: 'rating',
    total,
    average: total ? Math.round((sum / total) * 100) / 100 : null,
    distribution: [...dist.entries()].map(([value, count]) => ({ value, count })),
  };
}

function tallyText(subs: AggSubmission[]): TextTally {
  const items = subs
    .filter((s) => s.status === 'visible' && typeof s.payload?.text === 'string')
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((s) => ({ id: s.id, text: s.payload.text as string, at: s.createdAt }));
  return { kind: 'text', total: items.length, items };
}

/** Word-cloud aggregation: group by normalised key, label = most common spelling. */
export function tallyTerms(subs: AggSubmission[]): TermsTally {
  const groups = new Map<string, { count: number; spellings: Map<string, number> }>();
  let total = 0;
  for (const s of subs) {
    if (s.status !== 'visible') continue;
    const text: unknown = s.payload?.text;
    if (typeof text !== 'string') continue;
    const key = s.key ?? normalizeKey(text);
    if (!key) continue;
    total++;
    const g = groups.get(key) ?? { count: 0, spellings: new Map() };
    g.count++;
    const spelling = cleanText(text).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '') || cleanText(text);
    g.spellings.set(spelling, (g.spellings.get(spelling) ?? 0) + 1);
    groups.set(key, g);
  }
  const terms = [...groups.entries()].map(([key, g]) => {
    // most common spelling; prefer the lowercase one on ties so "Umami"/"umami" reads calmly
    const label = [...g.spellings.entries()].sort(
      (a, b) => b[1] - a[1] || Number(b[0] === b[0].toLowerCase()) - Number(a[0] === a[0].toLowerCase()) || a[0].localeCompare(b[0]),
    )[0][0];
    return { key, label, count: g.count };
  });
  terms.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return { kind: 'terms', total, terms };
}

/** Quiz scoring: base points when correct; optional speed bonus decays linearly to 50% at the deadline. */
export function scoreQuiz(c: Pick<QuizConfig, 'scored' | 'points' | 'speedBonus' | 'timeLimitSec'>, correct: boolean, elapsedMs: number): number {
  if (!c.scored || !correct) return 0;
  if (c.speedBonus && c.timeLimitSec) {
    const fraction = Math.min(1, Math.max(0, elapsedMs / (c.timeLimitSec * 1000)));
    return Math.round(c.points * (1 - 0.5 * fraction));
  }
  return c.points;
}

const strip = <T extends AnyConfig>(c: T): T => ({ ...c, notes: '' });

// ---------------------------------------------------------------------------------------
// Survey (composes poll / rating / open logic per question)
// ---------------------------------------------------------------------------------------

function surveySubSubmissions(q: SurveyQuestion, subs: AggSubmission[]): AggSubmission[] {
  return subs.flatMap((s) => {
    const a = s.payload?.answers?.[q.id];
    return a === undefined ? [] : [{ ...s, payload: a }];
  });
}

function surveyQuestionPrompt(q: SurveyQuestion, answer: any): string {
  if (!answer) return '';
  if (q.kind === 'choice') {
    const byId = new Map(q.options.map((o) => [o.id, o.text]));
    return (answer.optionIds as string[]).map((id) => byId.get(id) ?? id).join(' | ');
  }
  if (q.kind === 'rating') return String(answer.value);
  return String(answer.text);
}

// ---------------------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------------------

const none: Behavior = { interactive: false, hasCorrectAnswer: false, liveResults: false, shareResults: false, timeLimitSec: null, autoOpen: false, maxSubmissions: 0 };

export const definitions: { [T in SlideType]: ActivityDefinition<T> } = {
  content: {
    type: 'content',
    label: 'Content slide',
    description: 'Title, text, steps or an image. Nothing to submit.',
    interactive: false,
    behavior: () => none,
    validate: () => bad('This slide does not accept responses'),
    extractText: () => [],
    evaluate: () => ({ correct: null, score: 0 }),
    aggregate: () => ({ type: 'content' }),
    publicConfig: (c) => strip(c),
    describeResponses: () => [],
    titleOf: (c) => c.title || c.body.split('\n')[0]?.slice(0, 80) || c.steps[0] || 'Image slide',
  },

  quiz: {
    type: 'quiz',
    label: 'Quiz',
    description: 'Timed multiple-choice question with scoring and a leaderboard.',
    interactive: true,
    behavior: (c) => ({
      interactive: true,
      hasCorrectAnswer: true,
      liveResults: false,
      shareResults: c.showResultsToParticipants,
      timeLimitSec: c.timeLimitSec,
      autoOpen: c.autoOpen,
      maxSubmissions: 1,
    }),
    validate(c, raw) {
      if (!isObj(raw) || typeof raw.optionId !== 'string') return bad('Pick an answer');
      if (!c.options.some((o) => o.id === raw.optionId)) return bad('That option no longer exists');
      return ok({ optionId: raw.optionId });
    },
    extractText: () => [],
    evaluate(c, payload, { elapsedMs }) {
      const correct = payload.optionId === c.correctOptionId;
      return { correct, score: scoreQuiz(c, correct, elapsedMs) };
    },
    aggregate(c, subs) {
      const counts: Record<string, number> = Object.fromEntries(c.options.map((o) => [o.id, 0]));
      let total = 0;
      for (const s of subs) {
        if (s.status === 'hidden') continue;
        const id = s.payload?.optionId;
        if (id in counts) { counts[id]++; total++; }
      }
      return { type: 'quiz', kind: 'choice', total, counts };
    },
    publicConfig: (c, { revealCorrect }) => ({ ...strip(c), correctOptionId: revealCorrect ? c.correctOptionId : '', explanation: revealCorrect ? c.explanation : '' }),
    describeResponses: (c, p) => [{ prompt: c.question, response: c.options.find((o) => o.id === p.optionId)?.text ?? String(p.optionId) }],
    titleOf: (c) => c.question,
  },

  poll: {
    type: 'poll',
    label: 'Poll',
    description: 'Single or multiple choice with live bar results.',
    interactive: true,
    behavior: (c) => ({
      interactive: true,
      hasCorrectAnswer: false,
      liveResults: c.liveResults,
      shareResults: c.showResultsToParticipants,
      timeLimitSec: c.timeLimitSec,
      autoOpen: c.autoOpen,
      maxSubmissions: 1,
    }),
    validate: (c, raw) => validateChoice(c, raw),
    extractText: () => [],
    evaluate: () => ({ correct: null, score: 0 }),
    aggregate: (c, subs) => ({ type: 'poll', ...tallyChoice(c.options, subs) }),
    publicConfig: (c) => strip(c),
    describeResponses: (c, p) => [{ prompt: c.question, response: (p.optionIds as string[]).map((id) => c.options.find((o) => o.id === id)?.text ?? id).join(' | ') }],
    titleOf: (c) => c.question,
  },

  wordcloud: {
    type: 'wordcloud',
    label: 'Word cloud',
    description: 'Short free-text answers grouped by frequency.',
    interactive: true,
    behavior: (c) => ({
      interactive: true,
      hasCorrectAnswer: false,
      liveResults: c.liveResults,
      shareResults: c.showResultsToParticipants,
      timeLimitSec: c.timeLimitSec,
      autoOpen: c.autoOpen,
      maxSubmissions: c.maxSubmissions,
    }),
    validate(c, raw) {
      if (!isObj(raw) || typeof raw.text !== 'string') return bad('Type a word or a few words');
      const text = cleanText(raw.text);
      if (!text) return bad('Type a word or a few words');
      if (text.length > c.maxLength) return bad(`Keep it under ${c.maxLength} characters`);
      if (countWords(text) > c.maxWords) return bad(`Use at most ${c.maxWords} word${c.maxWords === 1 ? '' : 's'}`);
      const key = normalizeKey(text);
      if (!key) return bad('Use letters or numbers');
      return ok({ text }, key, c.moderation === 'premoderate' ? 'pending' : 'visible');
    },
    extractText: (_c, p) => [p.text],
    evaluate: () => ({ correct: null, score: 0 }),
    aggregate: (_c, subs) => ({ type: 'wordcloud', ...tallyTerms(subs) }),
    publicConfig: (c) => strip(c),
    describeResponses: (c, p) => [{ prompt: c.question, response: p.text }],
    titleOf: (c) => c.question,
  },

  open: {
    type: 'open',
    label: 'Open-ended',
    description: 'Short or paragraph responses shown as cards.',
    interactive: true,
    behavior: (c) => ({
      interactive: true,
      hasCorrectAnswer: false,
      liveResults: c.liveResults,
      shareResults: c.showResultsToParticipants,
      timeLimitSec: c.timeLimitSec,
      autoOpen: c.autoOpen,
      maxSubmissions: c.maxSubmissions,
    }),
    validate: (c, raw) => validateText(c, raw, c.moderation),
    extractText: (_c, p) => [p.text],
    evaluate: () => ({ correct: null, score: 0 }),
    aggregate: (_c, subs) => ({ type: 'open', ...tallyText(subs) }),
    publicConfig: (c) => strip(c),
    describeResponses: (c, p) => [{ prompt: c.question, response: p.text }],
    titleOf: (c) => c.question,
  },

  rating: {
    type: 'rating',
    label: 'Rating scale',
    description: 'Numeric scale with labelled ends, distribution and average.',
    interactive: true,
    behavior: (c) => ({
      interactive: true,
      hasCorrectAnswer: false,
      liveResults: c.liveResults,
      shareResults: c.showResultsToParticipants,
      timeLimitSec: c.timeLimitSec,
      autoOpen: c.autoOpen,
      maxSubmissions: 1,
    }),
    validate: (c, raw) => validateRating(c, raw),
    extractText: () => [],
    evaluate: () => ({ correct: null, score: 0 }),
    aggregate: (c, subs) => ({ type: 'rating', ...tallyRating(c, subs) }),
    publicConfig: (c) => strip(c),
    describeResponses: (c, p) => [{ prompt: c.question, response: String(p.value) }],
    titleOf: (c) => c.question,
  },

  survey: {
    type: 'survey',
    label: 'Survey',
    description: 'Several questions answered together as one activity.',
    interactive: true,
    behavior: (c) => ({
      interactive: true,
      hasCorrectAnswer: false,
      liveResults: c.liveResults,
      shareResults: c.showResultsToParticipants,
      timeLimitSec: c.timeLimitSec,
      autoOpen: c.autoOpen,
      maxSubmissions: 1,
    }),
    validate(c, raw) {
      if (!isObj(raw) || !isObj(raw.answers)) return bad('Answer the questions to submit');
      const known = new Set(c.questions.map((q) => q.id));
      if (Object.keys(raw.answers).some((k) => !known.has(k))) return bad('The survey changed — refresh and try again');
      const answers: Record<string, any> = {};
      for (const q of c.questions) {
        const a = raw.answers[q.id];
        const missing = a === undefined || a === null || (isObj(a) && ((Array.isArray(a.optionIds) && a.optionIds.length === 0) || (typeof a.text === 'string' && !a.text.trim())));
        if (missing) {
          if (q.required) return bad(`Please answer: “${q.question}”`);
          continue;
        }
        const r = q.kind === 'choice' ? validateChoice(q, a) : q.kind === 'rating' ? validateRating(q, a) : validateText(q, a);
        if (!r.ok) return bad(`${q.question} — ${r.message}`);
        answers[q.id] = r.payload;
      }
      if (Object.keys(answers).length === 0) return bad('Answer at least one question');
      return ok({ answers });
    },
    extractText: (c, p) => c.questions.flatMap((q) => (q.kind === 'text' && p.answers?.[q.id]?.text ? [p.answers[q.id].text as string] : [])),
    evaluate: () => ({ correct: null, score: 0 }),
    aggregate(c, subs) {
      const questions: Record<string, ChoiceTally | RatingTally | TextTally> = {};
      for (const q of c.questions) {
        const sub = surveySubSubmissions(q, subs);
        questions[q.id] = q.kind === 'choice' ? tallyChoice(q.options, sub) : q.kind === 'rating' ? tallyRating(q, sub) : tallyText(sub);
      }
      return { type: 'survey', total: subs.filter((s) => s.status === 'visible').length, questions };
    },
    publicConfig: (c) => strip(c),
    describeResponses: (c, p) => c.questions.flatMap((q) => (p.answers?.[q.id] ? [{ prompt: q.question, response: surveyQuestionPrompt(q, p.answers[q.id]) }] : [])),
    titleOf: (c) => c.title,
  },
};

export function getDefinition<T extends SlideType>(type: T): ActivityDefinition<T> {
  const d = definitions[type];
  if (!d) throw new Error(`Unknown activity type: ${type}`);
  return d as ActivityDefinition<T>;
}

/** Audience-safe results: survey free text stays presenter-only (there is no per-answer moderation for surveys). */
export function redactResults(results: Results): Results {
  if (results.type !== 'survey') return results;
  const questions: Record<string, ChoiceTally | RatingTally | TextTally> = {};
  for (const [id, q] of Object.entries(results.questions)) questions[id] = q.kind === 'text' ? { ...q, items: [] } : q;
  return { ...results, questions };
}

export function isInteractiveType(t: SlideType): boolean {
  return (INTERACTIVE_TYPES as readonly string[]).includes(t);
}

// ---------------------------------------------------------------------------------------
// Starter slides used by the editor's "Add" menu
// ---------------------------------------------------------------------------------------

export function nextId(existing: Iterable<string>, prefix: string): string {
  const used = new Set(existing);
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

export function defaultConfig<T extends SlideType>(type: T): ConfigByType[T] {
  const base = { notes: '' };
  const live = { timeLimitSec: null, autoOpen: true };
  const opts = (...t: string[]) => t.map((text, i) => ({ id: String.fromCharCode(97 + i), text }));
  const configs: { [K in SlideType]: () => ConfigByType[K] } = {
    content: () => ({ ...base, title: 'New slide', body: '', steps: [] }),
    quiz: () => ({ ...base, ...live, question: 'Which option is correct?', options: opts('Option A', 'Option B', 'Option C', 'Option D'), correctOptionId: 'a', explanation: '', scored: true, points: 1000, speedBonus: false, showResultsToParticipants: true }),
    poll: () => ({ ...base, ...live, question: 'What do you think?', options: opts('Option A', 'Option B', 'Option C'), multiple: false, maxSelections: null, anonymous: false, liveResults: true, showResultsToParticipants: true }),
    wordcloud: () => ({ ...base, ...live, question: 'In one word or a few words…', maxLength: 40, maxWords: 5, maxSubmissions: 3, moderation: 'off', liveResults: true, showResultsToParticipants: true }),
    open: () => ({ ...base, ...live, question: 'What are your thoughts?', mode: 'short', maxSubmissions: 1, moderation: 'off', liveResults: true, showResultsToParticipants: false }),
    rating: () => ({ ...base, ...live, question: 'How confident do you feel?', min: 1, max: 5, minLabel: 'Not at all', maxLabel: 'Very', liveResults: true, showResultsToParticipants: true }),
    survey: () => ({
      ...base,
      ...live,
      title: 'Quick survey',
      description: '',
      questions: [
        { id: 'q1', kind: 'rating', question: 'How was today’s session?', min: 1, max: 5, minLabel: 'Poor', maxLabel: 'Great', required: true },
        { id: 'q2', kind: 'text', question: 'Anything else you would like to share?', mode: 'short', required: false },
      ],
      liveResults: true,
      showResultsToParticipants: false,
    }),
  };
  return configs[type]() as ConfigByType[T];
}

export type { PollConfig, QuizConfig, RatingConfig, OpenConfig, WordcloudConfig, SurveyConfig };
