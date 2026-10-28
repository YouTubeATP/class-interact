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
  type QuizKind,
  type RatingConfig,
  type OpenConfig,
  type SlideType,
  type SurveyConfig,
  type SurveyQuestion,
  type WordcloudConfig,
} from './schema';
import { cleanText, countWords, normalizeKey } from './text';
import { gradeHotspot, gradeNumeric, gradeText, normalizeTyped, parseNumber } from './grading';

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
/** Typed and numeric answers, grouped. `correct` is null until the answer is revealed to this audience. */
export interface AnswersTally {
  kind: 'answers';
  total: number;
  correctCount: number | null;
  answers: { key: string; label: string; count: number; correct: boolean | null }[];
}
/** Hotspot taps in normalised image coordinates. */
export interface PointsTally {
  kind: 'points';
  total: number;
  correctCount: number | null;
  points: { x: number; y: number; correct: boolean | null }[];
}

export type Results =
  | ({ type: 'quiz' } & (ChoiceTally | AnswersTally | PointsTally))
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

export interface Evaluation {
  correct: boolean | null;
  score: number;
  /** Nearly right: the teacher should confirm (typed, numeric and hotspot answers only). */
  review?: boolean;
  /** Plain-language reason for the grade. */
  detail?: string;
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
  /** `seed` is the activity's private shuffle seed (match / order questions grade in terms of shuffled tokens). */
  evaluate(config: ConfigByType[T], payload: any, ctx: { elapsedMs: number; seed?: string }): Evaluation;
  aggregate(config: ConfigByType[T], subs: AggSubmission[], ctx?: { seed?: string }): Results;
  /** Strips speaker notes and (until revealed) the correct answer. Safe to send to the audience. */
  publicConfig(config: ConfigByType[T], opts: { revealCorrect: boolean; seed?: string }): ConfigByType[T];
  describeResponses(config: ConfigByType[T], payload: any, ctx?: { seed?: string }): ResponseLine[];
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

/**
 * Quiz grading. Old stored configs have no `kind`, so everything reads it through these helpers.
 * `gradeQuiz` returns the share of the answer that is right, 0 to 1 (1 means fully correct).
 *   single    1 or 0
 *   multiple  ticks that are right minus ticks that are wrong, over the number of right answers (never below 0)
 *   match     share of left items connected to the right item
 *   order     share of positions holding the right item
 * With `partialCredit` off, multiple / match / order are all-or-nothing.
 */
type QuizLike = Pick<QuizConfig, 'options' | 'correctOptionId' | 'correctOptionIds' | 'partialCredit' | 'pairs' | 'items' | 'view'> &
  Partial<Pick<QuizConfig, 'acceptedAnswers' | 'caseSensitive' | 'whitespace' | 'numeric' | 'regions'>> & { kind?: QuizKind };

/** Full grade (with explanation) for typed, numeric and hotspot answers; null for the other kinds. */
export function gradeOpenQuiz(c: QuizLike, payload: any): ReturnType<typeof gradeText> | null {
  const kind = quizKind(c);
  if (kind === 'text') return gradeText({ acceptedAnswers: c.acceptedAnswers ?? [], caseSensitive: c.caseSensitive ?? false, whitespace: c.whitespace ?? 'normalize' }, String(payload?.text ?? ''));
  if (kind === 'numeric') {
    if (!c.numeric) return { correct: false, review: false, detail: 'No correct number set.' };
    const n = parseNumber(String(payload?.text ?? ''), c.numeric.unit);
    return n === null ? { correct: false, review: false, detail: 'Not a number.' } : gradeNumeric(c.numeric, n);
  }
  if (kind === 'hotspot') {
    if (typeof payload?.x !== 'number' || typeof payload?.y !== 'number') return { correct: false, review: false, detail: 'No point chosen.' };
    return gradeHotspot(c.regions ?? [], payload.x, payload.y);
  }
  return null;
}

/** Grouping key for a typed or numeric answer (also stored with the submission so a review applies to the whole group). */
export function typedAnswerKey(c: QuizLike, text: string): string {
  if (quizKind(c) === 'numeric') {
    const n = parseNumber(text, c.numeric?.unit);
    return n === null ? normalizeTyped(text, { whitespace: 'ignore' }) : String(n);
  }
  return normalizeTyped(text, { caseSensitive: c.caseSensitive ?? false, whitespace: c.whitespace ?? 'normalize' }).slice(0, 200);
}

export const quizKind = (c: { kind?: QuizKind }): QuizKind => c.kind ?? 'single';

/** The correct option ids that are visible in this config (hidden answers come through as empty). */
export function quizCorrectIds(c: Partial<QuizLike>): string[] {
  if (quizKind(c) === 'multiple') return (c.correctOptionIds ?? []).filter(Boolean);
  return c.correctOptionId ? [c.correctOptionId] : [];
}

// --- shuffling for match / order -----------------------------------------------------------------------
// The audience gets shuffled lists with opaque ids ("R2", "I0"). Which id is which item is fixed by a private,
// per-activity seed that only the server knows, so nothing sent to a phone or projector reveals the answer.

function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = (h ^ (h >>> 16)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A repeatable shuffle of 0..n-1 that is never the identity (so the question is never shown already solved). */
export function shuffledOrder(n: number, seed: string): number[] {
  const rnd = seededRandom(seed);
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (n > 1 && order.every((v, i) => v === i)) order.push(order.shift()!);
  return order;
}

type QuizView = NonNullable<QuizConfig['view']>;

/**
 * Audience view of a match / order question. Lefts keep their written order (`L0…`), rights and order items are
 * shuffled (`R0…`, `I0…`). With `answer`, it also carries the key in those same tokens.
 */
export function quizView(c: Pick<QuizLike, 'pairs' | 'items'> & { kind?: QuizKind }, seed: string, answer: boolean): QuizView | undefined {
  const kind = quizKind(c);
  if (kind === 'match') {
    const n = c.pairs.length;
    const perm = shuffledOrder(n, `${seed}:match`); // perm[j] = which pair's right item sits at R<j>
    return {
      lefts: c.pairs.map((p, i) => ({ id: `L${i}`, text: p.left })),
      rights: perm.map((orig, j) => ({ id: `R${j}`, text: c.pairs[orig].right })),
      items: [],
      ...(answer ? { answerMap: Object.fromEntries(c.pairs.map((_, i) => [`L${i}`, `R${perm.indexOf(i)}`])) } : {}),
    };
  }
  if (kind === 'order') {
    const n = c.items.length;
    const perm = shuffledOrder(n, `${seed}:order`); // perm[k] = which written item sits at I<k>
    return {
      lefts: [],
      rights: [],
      items: perm.map((orig, k) => ({ id: `I${k}`, text: c.items[orig].text })),
      ...(answer ? { answerOrder: c.items.map((_, p) => `I${perm.indexOf(p)}`) } : {}),
    };
  }
  return undefined;
}

/** The answer key in audience tokens, from the full config (server) or from a revealed audience view. */
function quizKey(c: QuizLike, seed: string): { answerMap?: Record<string, string>; answerOrder?: string[] } {
  if (c.view?.answerMap || c.view?.answerOrder) return c.view;
  return quizView(c, seed, true) ?? {};
}

export function gradeQuiz(c: QuizLike, payload: any, seed = ''): number {
  const kind = quizKind(c);
  const partial = c.partialCredit ?? true;
  if (kind === 'multiple') {
    const correct = new Set(quizCorrectIds(c));
    const chosen: string[] = Array.isArray(payload?.optionIds) ? payload.optionIds : [];
    const right = chosen.filter((id) => correct.has(id)).length;
    const wrong = chosen.length - right;
    if (correct.size === 0) return 0;
    if (!partial) return right === correct.size && wrong === 0 ? 1 : 0;
    return Math.max(0, right - wrong) / correct.size;
  }
  if (kind === 'match') {
    const key = quizKey(c, seed).answerMap;
    const given = isObj(payload?.matches) ? payload.matches : {};
    if (!key) return 0;
    const ids = Object.keys(key);
    if (ids.length === 0) return 0;
    const right = ids.filter((l) => given[l] === key[l]).length;
    return partial ? right / ids.length : right === ids.length ? 1 : 0;
  }
  if (kind === 'order') {
    const key = quizKey(c, seed).answerOrder;
    const given: unknown[] = Array.isArray(payload?.order) ? payload.order : [];
    if (!key || key.length === 0) return 0;
    const right = key.filter((id, p) => given[p] === id).length;
    return partial ? right / key.length : right === key.length ? 1 : 0;
  }
  const open = gradeOpenQuiz(c, payload);
  if (open) return open.correct ? 1 : 0;
  return payload?.optionId !== undefined && payload.optionId === c.correctOptionId ? 1 : 0;
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
    description: 'Timed question with scoring and a leaderboard: one answer or several.',
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
      const kind = quizKind(c);
      if (kind === 'match') {
        const n = c.pairs.length;
        if (!isObj(raw) || !isObj(raw.matches)) return bad('Match every item');
        const lefts = Array.from({ length: n }, (_, i) => `L${i}`);
        const rights = new Set(Array.from({ length: n }, (_, i) => `R${i}`));
        const given = raw.matches as Record<string, unknown>;
        if (lefts.some((l) => given[l] === undefined)) return bad('Match every item before you lock in');
        if (Object.keys(given).some((k) => !lefts.includes(k))) return bad('The question changed. Refresh and try again');
        const used = lefts.map((l) => given[l]);
        if (used.some((r) => typeof r !== 'string' || !rights.has(r)) || new Set(used).size !== n) return bad('Use each answer once');
        return ok({ matches: Object.fromEntries(lefts.map((l) => [l, given[l]])) });
      }
      if (kind === 'order') {
        const n = c.items.length;
        const tokens = new Set(Array.from({ length: n }, (_, i) => `I${i}`));
        if (!isObj(raw) || !Array.isArray(raw.order) || raw.order.length !== n || raw.order.some((x) => typeof x !== 'string' || !tokens.has(x)) || new Set(raw.order).size !== n) return bad('Put every item in order before you lock in');
        return ok({ order: raw.order });
      }
      if (kind === 'text' || kind === 'numeric') {
        if (!isObj(raw) || typeof raw.text !== 'string') return bad(kind === 'numeric' ? 'Enter a number' : 'Type your answer');
        const text = raw.text.normalize('NFKC').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
        if (!text) return bad(kind === 'numeric' ? 'Enter a number' : 'Type your answer');
        if (text.length > 200) return bad('Keep it under 200 characters');
        if (kind === 'numeric' && parseNumber(text, c.numeric?.unit) === null) return bad(`Enter a single number${c.numeric?.unit ? ` (in ${c.numeric.unit})` : ''}, like 3.5 or -2`);
        return ok({ text }, typedAnswerKey(c, text));
      }
      if (kind === 'hotspot') {
        const inUnit = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
        if (!isObj(raw) || !inUnit(raw.x) || !inUnit(raw.y)) return bad('Tap a point on the image');
        const r4 = (v: number) => Math.round(v * 10000) / 10000;
        return ok({ x: r4(raw.x), y: r4(raw.y) });
      }
      const valid = new Set(c.options.map((o) => o.id));
      if (kind === 'multiple') {
        if (!isObj(raw) || !Array.isArray(raw.optionIds) || raw.optionIds.some((x) => typeof x !== 'string')) return bad('Tick at least one answer');
        const ids = [...new Set(raw.optionIds as string[])];
        if (ids.length === 0) return bad('Tick at least one answer');
        if (ids.some((id) => !valid.has(id))) return bad('That option no longer exists');
        return ok({ optionIds: ids });
      }
      if (!isObj(raw) || typeof raw.optionId !== 'string') return bad('Pick an answer');
      if (!valid.has(raw.optionId)) return bad('That option no longer exists');
      return ok({ optionId: raw.optionId });
    },
    extractText: () => [],
    evaluate(c, payload, { elapsedMs, seed }) {
      const open = gradeOpenQuiz(c, payload);
      if (open) return { correct: open.correct, score: open.correct ? scoreQuiz(c, true, elapsedMs) : 0, review: open.review, detail: open.detail };
      const fraction = gradeQuiz(c, payload, seed);
      const full = scoreQuiz(c, true, elapsedMs);
      return { correct: fraction === 1, score: Math.round(full * fraction) };
    },
    aggregate(c, subs, ctx) {
      const kind = quizKind(c);
      const visible = subs.filter((s) => s.status !== 'hidden');
      if (kind === 'text' || kind === 'numeric') {
        const groups = new Map<string, { count: number; correct: number; spellings: Map<string, number> }>();
        for (const s of visible) {
          if (typeof s.payload?.text !== 'string') continue;
          const key = s.key ?? typedAnswerKey(c, s.payload.text);
          const g = groups.get(key) ?? { count: 0, correct: 0, spellings: new Map() };
          g.count++;
          if (s.correct) g.correct++;
          g.spellings.set(s.payload.text, (g.spellings.get(s.payload.text) ?? 0) + 1);
          groups.set(key, g);
        }
        const answers = [...groups.entries()]
          .map(([key, g]) => ({ key, label: [...g.spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0], count: g.count, correct: g.correct * 2 >= g.count }))
          .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
        const total = answers.reduce((n, a) => n + a.count, 0);
        return { type: 'quiz', kind: 'answers', total, correctCount: visible.filter((s) => s.correct).length, answers: answers.slice(0, 60) };
      }
      if (kind === 'hotspot') {
        const pts = visible.filter((s) => typeof s.payload?.x === 'number' && typeof s.payload?.y === 'number');
        return { type: 'quiz', kind: 'points', total: pts.length, correctCount: pts.filter((s) => s.correct).length, points: pts.slice(0, 600).map((s) => ({ x: s.payload.x, y: s.payload.y, correct: s.correct })) };
      }
      if (kind === 'match' || kind === 'order') {
        // counts[L<i>] / counts[P<p>]: how many people got that pair / position right
        const key = quizKey(c, ctx?.seed ?? '');
        const counts: Record<string, number> = {};
        let total = 0;
        if (kind === 'match') {
          const map = key.answerMap ?? {};
          for (const l of Object.keys(map)) counts[l] = 0;
          for (const s of visible) {
            if (!isObj(s.payload?.matches)) continue;
            total++;
            for (const l of Object.keys(map)) if (s.payload.matches[l] === map[l]) counts[l]++;
          }
        } else {
          const order = key.answerOrder ?? [];
          order.forEach((_, p) => (counts[`P${p}`] = 0));
          for (const s of visible) {
            if (!Array.isArray(s.payload?.order)) continue;
            total++;
            order.forEach((id, p) => { if (s.payload.order[p] === id) counts[`P${p}`]++; });
          }
        }
        return { type: 'quiz', kind: 'choice', total, counts };
      }
      const counts: Record<string, number> = Object.fromEntries(c.options.map((o) => [o.id, 0]));
      let total = 0;
      for (const s of visible) {
        const chosen: unknown[] = Array.isArray(s.payload?.optionIds) ? s.payload.optionIds : [s.payload?.optionId];
        let any = false;
        for (const id of chosen) if (typeof id === 'string' && id in counts) { counts[id]++; any = true; }
        if (any) total++;
      }
      return { type: 'quiz', kind: 'choice', total, counts };
    },
    publicConfig(c, { revealCorrect, seed = '' }) {
      const kind = quizKind(c);
      const out = {
        ...strip(c),
        correctOptionId: revealCorrect ? c.correctOptionId : '',
        correctOptionIds: revealCorrect ? c.correctOptionIds : [],
        explanation: revealCorrect ? c.explanation : '',
        // misconceptions say which options are wrong, and the rest is teaching metadata: never for the audience
        options: c.options.map(({ misconception: _m, ...o }) => o),
        concepts: undefined,
        branch: undefined,
        acceptedAnswers: revealCorrect ? c.acceptedAnswers : [],
        numeric: revealCorrect ? c.numeric : undefined,
        regions: revealCorrect ? c.regions : [],
        ...(kind === 'numeric' && !revealCorrect ? { view: { lefts: [], rights: [], items: [], unit: c.numeric?.unit ?? '' } } : {}),
      };
      if (kind === 'match' || kind === 'order') {
        // the authored pairs / order are the answer, so the audience only ever gets the shuffled tokens
        return { ...out, pairs: [], items: [], view: quizView(c, seed, revealCorrect) };
      }
      return out;
    },
    describeResponses(c, p, ctx) {
      const kind = quizKind(c);
      if (kind === 'match' || kind === 'order') {
        const v = quizView(c, ctx?.seed ?? '', false)!;
        const text = (list: { id: string; text: string }[], id: string) => list.find((x) => x.id === id)?.text ?? id;
        const response = kind === 'match'
          ? v.lefts.map((l) => `${l.text} → ${text(v.rights, p.matches?.[l.id])}`).join(' | ')
          : (p.order as string[]).map((id) => text(v.items, id)).join(' > ');
        return [{ prompt: c.question, response }];
      }
      if (kind === 'text' || kind === 'numeric') return [{ prompt: c.question, response: String(p.text ?? '') }];
      if (kind === 'hotspot') return [{ prompt: c.question, response: `(${(p.x * 100).toFixed(1)}%, ${(p.y * 100).toFixed(1)}%)` }];
      const chosen: string[] = Array.isArray(p.optionIds) ? p.optionIds : [p.optionId];
      return [{ prompt: c.question, response: chosen.map((id) => c.options.find((o) => o.id === id)?.text ?? String(id)).join(' | ') }];
    },
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
export function redactResults(results: Results, opts: { revealCorrect?: boolean } = {}): Results {
  if (results.type === 'quiz' && results.kind === 'answers' && !opts.revealCorrect) {
    return { ...results, correctCount: null, answers: results.answers.map((a) => ({ ...a, correct: null })) };
  }
  if (results.type === 'quiz' && results.kind === 'points' && !opts.revealCorrect) {
    return { ...results, correctCount: null, points: results.points.map((p) => ({ ...p, correct: null })) };
  }
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
    quiz: () => ({ ...base, ...live, question: 'Which option is correct?', kind: 'single', options: opts('Option A', 'Option B', 'Option C', 'Option D'), correctOptionId: 'a', correctOptionIds: [], pairs: [], items: [], partialCredit: true, acceptedAnswers: [], caseSensitive: false, whitespace: 'normalize', regions: [], explanation: '', scored: true, points: 1000, speedBonus: false, showResultsToParticipants: true }),
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
