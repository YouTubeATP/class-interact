import { describe, expect, it } from 'vitest';
import { definitions, exportPresentationJson, gradeQuiz, parsePresentationDoc, quizCorrectIds, quizKind, quizView, shuffledOrder, type QuizConfig } from '../src';

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
    expect(msg({ correctOptionId: 'a' })).toContain('"correctOptionId" is not used by kind "multiple"');
    expect(msg({ kind: 'single', correctOptionId: 'a', correctOptionIds: ['a'] })).toContain('"correctOptionIds" is not used by kind "single"');
    expect(msg({ kind: 'single', correctOptionIds: [] })).toContain('needs "correctOptionId"');
    expect(msg({ kind: 'checkbox' })).toContain('Expected one of: single, multiple, match, order');
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

// ---------------------------------------------------------------------------------------------------------
// match and order
// ---------------------------------------------------------------------------------------------------------

const pairs = [
  { id: 'p1', left: 'France', right: 'Paris' },
  { id: 'p2', left: 'Japan', right: 'Tokyo' },
  { id: 'p3', left: 'Egypt', right: 'Cairo' },
  { id: 'p4', left: 'Peru', right: 'Lima' },
];
const matchSlide = (over: Record<string, unknown> = {}) => ({ id: 'm', type: 'quiz', kind: 'match', question: 'Capitals', pairs, ...over });
const orderSlide = (over: Record<string, unknown> = {}) => ({ id: 'o', type: 'quiz', kind: 'order', question: 'Smallest to largest', items: ['Mouse', 'Cat', 'Dog', 'Horse'].map((text, i) => ({ id: `i${i}`, text })), ...over });
const parsed = (slide: Record<string, unknown>): QuizConfig => {
  const r = parsePresentationDoc(doc([slide]));
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  const { id: _i, type: _t, ...c } = r.doc.slides[0] as any;
  return c;
};
const errors = (slide: Record<string, unknown>) => {
  const r = parsePresentationDoc(doc([slide]));
  return r.ok ? 'OK' : r.errors.map((e) => `${e.path}: ${e.message}`).join('\n');
};

describe('match and order: schema', () => {
  it('accepts both kinds, fills in ids, and rejects fields that belong to other kinds', () => {
    expect(errors(matchSlide())).toBe('OK');
    expect(errors(orderSlide())).toBe('OK');
    const filled = parsePresentationDoc(doc([matchSlide({ pairs: [{ left: 'a', right: 'b' }, { left: 'c', right: 'd' }] })]));
    expect(filled.ok && (filled.doc.slides[0] as any).pairs.map((p: any) => p.id)).toEqual(['p1', 'p2']);
    expect(errors(matchSlide({ pairs: [pairs[0]] }))).toContain('needs 2–6 pairs');
    expect(errors(orderSlide({ items: [{ id: 'a', text: 'x' }] }))).toContain('needs 2–6 items');
    expect(errors(matchSlide({ options: opts }))).toContain('"options" is not used by kind "match"');
    expect(errors(matchSlide({ correctOptionId: 'a' }))).toContain('"correctOptionId" is not used by kind "match"');
    expect(errors(orderSlide({ pairs }))).toContain('"pairs" is not used by kind "order"');
    expect(errors({ id: 'q', type: 'quiz', question: 'Q', options: opts, correctOptionId: 'a', pairs })).toContain('"pairs" is not used by kind "single"');
    expect(errors(matchSlide({ pairs: [pairs[0], { id: 'p2', left: 'Spain', right: 'paris' }] }))).toContain('share the right item');
    expect(errors(matchSlide({ pairs: [{ id: 'a', left: 'x', right: 'y', extra: 1 }, pairs[1]] }))).toContain('Allowed fields: id, left, right');
    expect(errors(matchSlide({ view: { lefts: [], rights: [], items: [] } }))).toContain('"view" is generated');
  });
  it('exports only the fields of its kind and round-trips', () => {
    const r = parsePresentationDoc(doc([matchSlide(), orderSlide()]));
    if (!r.ok) throw new Error('parse');
    const json = JSON.parse(exportPresentationJson(r.doc));
    expect(Object.keys(json.slides[0]).filter((k) => ['options', 'items', 'pairs', 'correctOptionIds', 'view'].includes(k))).toEqual(['pairs']);
    expect(Object.keys(json.slides[1]).filter((k) => ['options', 'items', 'pairs', 'correctOptionIds', 'view'].includes(k))).toEqual(['items']);
    const again = parsePresentationDoc(json);
    expect(again.ok && JSON.parse(exportPresentationJson(again.doc))).toEqual(json);
  });
});

describe('seeded shuffle', () => {
  it('is repeatable, depends on the seed, and is never already solved', () => {
    expect(shuffledOrder(6, 'abc')).toEqual(shuffledOrder(6, 'abc'));
    const seen = new Set(Array.from({ length: 40 }, (_, i) => shuffledOrder(5, `seed-${i}`).join('')));
    expect(seen.size).toBeGreaterThan(10);
    for (let i = 0; i < 300; i++) {
      for (const n of [2, 3, 4, 6]) expect(shuffledOrder(n, `s${i}`).every((v, k) => v === k)).toBe(false);
      expect([...shuffledOrder(6, `p${i}`)].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    }
  });
});

describe('match: grading, secrecy and results', () => {
  const c = parsed(matchSlide());
  const q = definitions.quiz;
  const seed = 'secret-seed-1';
  const key = quizView(c, seed, true)!;
  const right = (...rows: number[]) => Object.fromEntries(rows.map((i) => [`L${i}`, key.answerMap![`L${i}`]]));
  const allRight = right(0, 1, 2, 3);

  it('shows lefts in written order and rights shuffled, under opaque ids', () => {
    const v = quizView(c, seed, false)!;
    expect(v.lefts.map((l) => l.text)).toEqual(['France', 'Japan', 'Egypt', 'Peru']);
    expect(v.rights.map((r) => r.id)).toEqual(['R0', 'R1', 'R2', 'R3']);
    expect([...v.rights.map((r) => r.text)].sort()).toEqual(['Cairo', 'Lima', 'Paris', 'Tokyo']);
    expect(v.rights.map((r) => r.text)).not.toEqual(['Paris', 'Tokyo', 'Cairo', 'Lima']);
    expect(v).not.toHaveProperty('answerMap');
  });
  it('validates a full one-to-one matching in tokens', () => {
    expect(q.validate(c, { matches: allRight })).toMatchObject({ ok: true });
    expect(q.validate(c, { matches: right(0, 1, 2) })).toMatchObject({ ok: false });
    expect(q.validate(c, { matches: { ...allRight, L3: allRight.L0 } })).toMatchObject({ ok: false }); // one answer used twice
    expect(q.validate(c, { matches: { ...allRight, L3: 'R9' } })).toMatchObject({ ok: false });
    expect(q.validate(c, { matches: { ...allRight, L9: 'R0' } })).toMatchObject({ ok: false });
    expect(q.validate(c, { optionId: 'a' })).toMatchObject({ ok: false });
  });
  it('grades by share of correct connections, in proportion for points', () => {
    expect(gradeQuiz(c, { matches: allRight }, seed)).toBe(1);
    const swapped = { ...allRight, L0: allRight.L1, L1: allRight.L0 };
    expect(gradeQuiz(c, { matches: swapped }, seed)).toBe(0.5);
    expect(q.evaluate(c, { matches: swapped }, { elapsedMs: 0, seed })).toEqual({ correct: false, score: 500 });
    expect(q.evaluate(c, { matches: allRight }, { elapsedMs: 0, seed })).toEqual({ correct: true, score: 1000 });
    expect(gradeQuiz({ ...c, partialCredit: false }, { matches: swapped }, seed)).toBe(0);
    // the wrong seed does not decode the tokens, so the answer key really depends on it
    const other = quizView(c, 'another-seed', true)!.answerMap!;
    expect(other).not.toEqual(key.answerMap);
  });
  it('keeps the pairing out of the audience config until revealed, then grades from the revealed view alone', () => {
    const hidden = q.publicConfig({ ...c, notes: 'secret' }, { revealCorrect: false, seed });
    expect(hidden.pairs).toEqual([]);
    expect(hidden.view).toBeDefined();
    expect(hidden.view).not.toHaveProperty('answerMap');
    const json = JSON.stringify(hidden);
    expect(json).not.toContain('secret');
    // no field links a left item to a right item
    expect(json).not.toMatch(/"left"|"right"/);
    const shown = q.publicConfig(c, { revealCorrect: true, seed });
    expect(shown.view!.answerMap).toEqual(key.answerMap);
    expect(shown.pairs).toEqual([]);
    expect(gradeQuiz(shown, { matches: allRight })).toBe(1); // a phone grades with no seed
    expect(gradeQuiz(shown, { matches: { ...allRight, L0: allRight.L1, L1: allRight.L0 } })).toBe(0.5);
  });
  it('tallies how many people got each pair right', () => {
    const sub = (payload: unknown, i: number) => ({ id: `s${i}`, participantId: `p${i}`, payload, status: 'visible' as const, key: null, createdAt: i, correct: null, score: 0 });
    const swapped = { ...allRight, L0: allRight.L1, L1: allRight.L0 };
    const r = q.aggregate(c, [sub({ matches: allRight }, 1), sub({ matches: swapped }, 2), sub({ matches: allRight }, 3)], { seed });
    expect(r).toMatchObject({ type: 'quiz', total: 3, counts: { L0: 2, L1: 2, L2: 3, L3: 3 } });
  });
  it('writes the answer in the CSV as readable pairs', () => {
    expect(q.describeResponses(c, { matches: allRight }, { seed })[0].response).toBe('France → Paris | Japan → Tokyo | Egypt → Cairo | Peru → Lima');
  });
});

describe('order: grading, secrecy and results', () => {
  const c = parsed(orderSlide());
  const q = definitions.quiz;
  const seed = 'order-seed';
  const key = quizView(c, seed, true)!;
  const swap = (a: string[], i: number, j: number) => { const x = [...a]; [x[i], x[j]] = [x[j], x[i]]; return x; };

  it('shuffles the items under opaque ids', () => {
    const v = quizView(c, seed, false)!;
    expect(v.items.map((i) => i.id)).toEqual(['I0', 'I1', 'I2', 'I3']);
    expect(v.items.map((i) => i.text)).not.toEqual(['Mouse', 'Cat', 'Dog', 'Horse']);
    expect(v).not.toHaveProperty('answerOrder');
  });
  it('validates a complete ordering', () => {
    expect(q.validate(c, { order: key.answerOrder })).toMatchObject({ ok: true });
    expect(q.validate(c, { order: ['I0', 'I1', 'I2'] })).toMatchObject({ ok: false });
    expect(q.validate(c, { order: ['I0', 'I0', 'I1', 'I2'] })).toMatchObject({ ok: false });
    expect(q.validate(c, { order: ['I0', 'I1', 'I2', 'X'] })).toMatchObject({ ok: false });
  });
  it('grades by positions that hold the right item', () => {
    expect(gradeQuiz(c, { order: key.answerOrder }, seed)).toBe(1);
    expect(gradeQuiz(c, { order: swap(key.answerOrder!, 0, 1) }, seed)).toBe(0.5);
    expect(gradeQuiz({ ...c, partialCredit: false }, { order: swap(key.answerOrder!, 0, 1) }, seed)).toBe(0);
    expect(q.evaluate(c, { order: swap(key.answerOrder!, 2, 3) }, { elapsedMs: 0, seed })).toEqual({ correct: false, score: 500 });
  });
  it('keeps the order out of the audience config until revealed', () => {
    const hidden = q.publicConfig(c, { revealCorrect: false, seed });
    expect(hidden.items).toEqual([]);
    expect(hidden.view).not.toHaveProperty('answerOrder');
    const shown = q.publicConfig(c, { revealCorrect: true, seed });
    const texts = shown.view!.answerOrder!.map((id) => shown.view!.items.find((i) => i.id === id)!.text);
    expect(texts).toEqual(['Mouse', 'Cat', 'Dog', 'Horse']);
    expect(gradeQuiz(shown, { order: shown.view!.answerOrder })).toBe(1);
  });
  it('tallies positions and writes the CSV answer in the order given', () => {
    const sub = (payload: unknown, i: number) => ({ id: `s${i}`, participantId: `p${i}`, payload, status: 'visible' as const, key: null, createdAt: i, correct: null, score: 0 });
    const r = q.aggregate(c, [sub({ order: key.answerOrder }, 1), sub({ order: swap(key.answerOrder!, 0, 1) }, 2)], { seed });
    expect(r).toMatchObject({ total: 2, counts: { P0: 1, P1: 1, P2: 2, P3: 2 } });
    expect(q.describeResponses(c, { order: key.answerOrder }, { seed })[0].response).toBe('Mouse > Cat > Dog > Horse');
  });
});
