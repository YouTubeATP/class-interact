import { describe, expect, it } from 'vitest';
import { definitions, exportPresentationJson, gradeQuiz, parsePresentationDoc, quizCorrectIds, quizKind, type QuizConfig } from '../src';

const opts = ['a', 'b', 'c', 'd'].map((id) => ({ id, text: id.toUpperCase() }));
const multi = (over: Record<string, unknown> = {}) => ({ id: 'q', type: 'quiz', question: 'Which are prime?', kind: 'multiple', options: opts, correctOptionIds: ['a', 'c'], ...over });
const doc = (slides: unknown[]) => ({ schemaVersion: 1, title: 'T', slides });
const config = (over: Record<string, unknown> = {}): QuizConfig => {
  const r = parsePresentationDoc(doc([multi(over)]));
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  const { id: _i, type: _t, ...c } = r.doc.slides[0] as any;
  return c;
};

describe('multiple-answer quiz: schema', () => {
  it('accepts a valid question and defaults old single-answer quizzes', () => {
    expect(parsePresentationDoc(doc([multi()])).ok).toBe(true);
    const old = parsePresentationDoc(doc([{ id: 'q', type: 'quiz', question: 'Q', options: opts, correctOptionId: 'b' }]));
    expect(old.ok && (old.doc.slides[0] as any).kind).toBe('single');
  });

  it('explains every way the answer key can be wrong', () => {
    const msg = (over: Record<string, unknown>) => {
      const r = parsePresentationDoc(doc([multi(over)]));
      return r.ok ? 'OK' : r.errors.map((e) => `${e.path}: ${e.message}`).join('\n');
    };
    expect(msg({ correctOptionIds: [] })).toContain('Mark at least one correct answer');
    expect(msg({ correctOptionIds: ['a', 'zzz'] })).toContain('"zzz" does not match any option. Valid ids: a, b, c, d');
    expect(msg({ correctOptionIds: ['a', 'a'] })).toContain('listed twice');
    expect(msg({ correctOptionId: 'a' })).toContain('"correctOptionId" is for kind "single"');
    expect(msg({ kind: 'single', correctOptionId: 'a', correctOptionIds: ['a'] })).toContain('"correctOptionIds" is for kind "multiple"');
    expect(msg({ kind: 'single', correctOptionIds: [] })).toContain('needs "correctOptionId"');
    expect(msg({ kind: 'checkbox' })).toContain('Expected one of: single, multiple');
  });

  it('exports without fields that do not apply, and round-trips', () => {
    const single = parsePresentationDoc(doc([{ id: 's', type: 'quiz', question: 'Q', options: opts, correctOptionId: 'a' }, multi({ id: 'm' })]));
    if (!single.ok) throw new Error('parse');
    const json = JSON.parse(exportPresentationJson(single.doc));
    expect(json.slides[0]).not.toHaveProperty('correctOptionIds');
    expect(json.slides[0]).not.toHaveProperty('partialCredit');
    expect(json.slides[1]).toMatchObject({ kind: 'multiple', correctOptionIds: ['a', 'c'], partialCredit: true });
    expect(json.slides[1]).not.toHaveProperty('correctOptionId');
    const again = parsePresentationDoc(json);
    expect(again.ok && JSON.parse(exportPresentationJson(again.doc))).toEqual(json);
  });
});

describe('multiple-answer quiz: grading', () => {
  const c = config();
  it('gives full credit only for exactly the right set', () => {
    expect(gradeQuiz(c, { optionIds: ['a', 'c'] })).toBe(1);
    expect(gradeQuiz(c, { optionIds: ['c', 'a'] })).toBe(1);
  });
  it('gives partial credit: right ticks minus wrong ticks, never below zero', () => {
    expect(gradeQuiz(c, { optionIds: ['a'] })).toBe(0.5);
    expect(gradeQuiz(c, { optionIds: ['a', 'c', 'b'] })).toBe(0.5);
    expect(gradeQuiz(c, { optionIds: ['a', 'b'] })).toBe(0);
    expect(gradeQuiz(c, { optionIds: ['b', 'd'] })).toBe(0);
  });
  it('is all-or-nothing when partial credit is off', () => {
    const strict = config({ partialCredit: false });
    expect(gradeQuiz(strict, { optionIds: ['a', 'c'] })).toBe(1);
    expect(gradeQuiz(strict, { optionIds: ['a'] })).toBe(0);
    expect(gradeQuiz(strict, { optionIds: ['a', 'b', 'c'] })).toBe(0);
  });
  it('scores points in proportion, with the speed bonus applied to the full amount', () => {
    const q = definitions.quiz;
    expect(q.evaluate(c, { optionIds: ['a', 'c'] }, { elapsedMs: 0 })).toEqual({ correct: true, score: 1000 });
    expect(q.evaluate(c, { optionIds: ['a'] }, { elapsedMs: 0 })).toEqual({ correct: false, score: 500 });
    expect(q.evaluate(c, { optionIds: ['b'] }, { elapsedMs: 0 })).toEqual({ correct: false, score: 0 });
    const fast = config({ speedBonus: true, timeLimitSec: 20 });
    expect(q.evaluate(fast, { optionIds: ['a', 'c'] }, { elapsedMs: 20_000 })).toEqual({ correct: true, score: 500 });
    expect(q.evaluate(config({ scored: false }), { optionIds: ['a'] }, { elapsedMs: 0 })).toEqual({ correct: false, score: 0 });
  });
  it('still grades a stored single-answer config that predates "kind"', () => {
    const legacy = { options: opts, correctOptionId: 'b', correctOptionIds: undefined, partialCredit: undefined } as unknown as QuizConfig;
    expect(quizKind(legacy)).toBe('single');
    expect(gradeQuiz(legacy, { optionId: 'b' })).toBe(1);
    expect(gradeQuiz(legacy, { optionId: 'a' })).toBe(0);
    expect(quizCorrectIds(legacy)).toEqual(['b']);
  });
});

describe('multiple-answer quiz: submissions, results and secrecy', () => {
  const c = config();
  const q = definitions.quiz;
  it('validates the ticked set', () => {
    expect(q.validate(c, { optionIds: ['a', 'a', 'c'] })).toMatchObject({ ok: true, payload: { optionIds: ['a', 'c'] } });
    expect(q.validate(c, { optionIds: [] })).toMatchObject({ ok: false });
    expect(q.validate(c, { optionIds: ['zzz'] })).toMatchObject({ ok: false });
    expect(q.validate(c, { optionId: 'a' })).toMatchObject({ ok: false });
    expect(q.validate({ ...c, kind: 'single' }, { optionIds: ['a'] })).toMatchObject({ ok: false });
  });
  it('counts every ticked option, and each person once in the total', () => {
    const sub = (payload: unknown, i: number) => ({ id: `s${i}`, participantId: `p${i}`, payload, status: 'visible' as const, key: null, createdAt: i, correct: null, score: 0 });
    const r = q.aggregate(c, [sub({ optionIds: ['a', 'c'] }, 1), sub({ optionIds: ['a'] }, 2), sub({ optionIds: ['d'] }, 3)]);
    expect(r).toMatchObject({ type: 'quiz', total: 3, counts: { a: 2, b: 0, c: 1, d: 1 } });
  });
  it('keeps the whole answer key out of the audience view until revealed', () => {
    const hidden = q.publicConfig({ ...c, notes: 'secret', explanation: 'because' }, { revealCorrect: false });
    expect(JSON.stringify(hidden)).not.toContain('secret');
    expect(hidden.correctOptionIds).toEqual([]);
    expect(hidden.explanation).toBe('');
    const shown = q.publicConfig(c, { revealCorrect: true });
    expect(shown.correctOptionIds).toEqual(['a', 'c']);
  });
  it('describes the answer in the CSV as the option texts', () => {
    expect(q.describeResponses(c, { optionIds: ['a', 'c'] })).toEqual([{ prompt: 'Which are prime?', response: 'A | C' }]);
  });
});
