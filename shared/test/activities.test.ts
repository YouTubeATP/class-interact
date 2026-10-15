import { describe, expect, it } from 'vitest';
import {
  computeStandings, defaultConfig, definitions, normalizeKey, redactResults, scoreQuiz, tallyTerms,
  type AggSubmission, type QuizConfig, type WordcloudConfig,
} from '../src';

const sub = (over: Partial<AggSubmission> & { payload: any }): AggSubmission => ({
  id: Math.random().toString(36).slice(2), participantId: 'p', status: 'visible', key: null, createdAt: 0, correct: null, score: 0, ...over,
});

describe('quiz scoring', () => {
  const cfg = { scored: true, points: 1000, speedBonus: false, timeLimitSec: null } as Pick<QuizConfig, 'scored' | 'points' | 'speedBonus' | 'timeLimitSec'>;
  it('awards base points only when correct', () => {
    expect(scoreQuiz(cfg, true, 5000)).toBe(1000);
    expect(scoreQuiz(cfg, false, 100)).toBe(0);
  });
  it('is zero when unscored', () => expect(scoreQuiz({ ...cfg, scored: false }, true, 1)).toBe(0));
  it('speed bonus decays linearly to half points at the deadline', () => {
    const c = { ...cfg, speedBonus: true, timeLimitSec: 20 };
    expect(scoreQuiz(c, true, 0)).toBe(1000);
    expect(scoreQuiz(c, true, 10_000)).toBe(750);
    expect(scoreQuiz(c, true, 20_000)).toBe(500);
    expect(scoreQuiz(c, true, 99_000)).toBe(500);
  });
  it('evaluates via the definition', () => {
    const c = { ...defaultConfig('quiz'), points: 800 };
    expect(definitions.quiz.evaluate(c, { optionId: 'a' }, { elapsedMs: 0 })).toEqual({ correct: true, score: 800 });
    expect(definitions.quiz.evaluate(c, { optionId: 'b' }, { elapsedMs: 0 })).toEqual({ correct: false, score: 0 });
  });
  it('hides the correct answer and notes from public config until revealed', () => {
    const c = { ...defaultConfig('quiz'), notes: 'secret', explanation: 'because' };
    const hidden = definitions.quiz.publicConfig(c, { revealCorrect: false });
    expect(JSON.stringify(hidden)).not.toContain('secret');
    expect(hidden.correctOptionId).toBe('');
    expect(hidden.explanation).toBe('');
    const shown = definitions.quiz.publicConfig(c, { revealCorrect: true });
    expect(shown.correctOptionId).toBe('a');
    expect(shown.notes).toBe('');
  });
  it('aggregates the answer distribution', () => {
    const c = defaultConfig('quiz');
    const r = definitions.quiz.aggregate(c, [sub({ payload: { optionId: 'a' } }), sub({ payload: { optionId: 'a' } }), sub({ payload: { optionId: 'c' } })]);
    expect(r).toMatchObject({ total: 3, counts: { a: 2, b: 0, c: 1, d: 0 } });
  });
});

describe('standings', () => {
  it('sums scores, ranks and shares ties', () => {
    const s = computeStandings([
      { participantId: 'a', name: 'Ann', score: 900, correct: true, responseMs: 1000 },
      { participantId: 'b', name: 'Bo', score: 900, correct: true, responseMs: 1000 },
      { participantId: 'c', name: 'Cy', score: 1500, correct: true, responseMs: 5000 },
      { participantId: 'a', name: 'Ann', score: 0, correct: false, responseMs: 100 },
      { participantId: 'd', name: 'Di', score: 100, correct: true, responseMs: 100 },
    ]);
    expect(s.map((x) => [x.name, x.rank])).toEqual([['Cy', 1], ['Ann', 2], ['Bo', 2], ['Di', 4]]);
  });
  it('breaks equal scores by faster cumulative time', () => {
    const s = computeStandings([
      { participantId: 'a', name: 'Ann', score: 500, correct: true, responseMs: 9000 },
      { participantId: 'b', name: 'Bo', score: 500, correct: true, responseMs: 2000 },
    ]);
    expect(s.map((x) => x.name)).toEqual(['Bo', 'Ann']);
    expect(s.map((x) => x.rank)).toEqual([1, 2]);
  });
});

describe('word cloud', () => {
  const cfg = defaultConfig('wordcloud') as WordcloudConfig;
  const v = (text: unknown) => definitions.wordcloud.validate(cfg, { text });

  it('normalises case, punctuation and whitespace into one group', () => {
    expect(normalizeKey('  Savoury! ')).toBe('savoury');
    expect(normalizeKey('SAVOURY')).toBe('savoury');
    expect(normalizeKey('slightly   sweet…')).toBe('slightly sweet');
    expect(normalizeKey("don’t")).toBe("don't");
    expect(normalizeKey('???')).toBe('');
  });
  it('keeps multiword responses as one term and counts duplicates', () => {
    const entries = ['Savoury', 'savoury!', ' SAVOURY ', 'slightly sweet', 'Slightly  Sweet', 'salty'];
    const subs = entries.map((t) => {
      const r = v(t);
      if (!r.ok) throw new Error(r.message);
      return sub({ payload: r.payload, key: r.key });
    });
    const res = tallyTerms(subs);
    expect(res.total).toBe(6);
    expect(res.terms.map((t) => [t.label, t.count])).toEqual([['savoury', 3], ['slightly sweet', 2], ['salty', 1]]);
  });
  it('excludes pending and hidden responses', () => {
    const subs = [sub({ payload: { text: 'a' }, key: 'a' }), sub({ payload: { text: 'b' }, key: 'b', status: 'hidden' }), sub({ payload: { text: 'c' }, key: 'c', status: 'pending' })];
    expect(tallyTerms(subs).terms.map((t) => t.key)).toEqual(['a']);
  });
  it('validates length, word count, and emptiness', () => {
    expect(v('   ').ok).toBe(false);
    expect(v('!!!').ok).toBe(false);
    expect(v('x'.repeat(41)).ok).toBe(false);
    expect(v('one two three four five six').ok).toBe(false);
    expect(v('no difference').ok).toBe(true);
    expect(v(42).ok).toBe(false);
  });
  it('marks responses pending under premoderation', () => {
    const r = definitions.wordcloud.validate({ ...cfg, moderation: 'premoderate' }, { text: 'hi' });
    expect(r.ok && r.status).toBe('pending');
  });
});

describe('poll, rating, open', () => {
  it('poll: single vs multiple selection rules', () => {
    const single = defaultConfig('poll');
    expect(definitions.poll.validate(single, { optionIds: ['a'] }).ok).toBe(true);
    expect(definitions.poll.validate(single, { optionIds: ['a', 'b'] }).ok).toBe(false);
    expect(definitions.poll.validate(single, { optionIds: ['zzz'] }).ok).toBe(false);
    expect(definitions.poll.validate(single, { optionIds: [] }).ok).toBe(false);
    const multi = { ...single, multiple: true, maxSelections: 2 };
    expect(definitions.poll.validate(multi, { optionIds: ['a', 'b'] }).ok).toBe(true);
    expect(definitions.poll.validate(multi, { optionIds: ['a', 'b', 'c'] }).ok).toBe(false);
    const r = definitions.poll.validate(multi, { optionIds: ['a', 'a'] });
    expect(r.ok && r.payload).toEqual({ optionIds: ['a'] });
  });
  it('poll: counts a multi-select voter once in total', () => {
    const c = { ...defaultConfig('poll'), multiple: true };
    const r = definitions.poll.aggregate(c, [sub({ payload: { optionIds: ['a', 'b'] } }), sub({ payload: { optionIds: ['a'] } })]);
    expect(r).toMatchObject({ total: 2, counts: { a: 2, b: 1, c: 0 } });
  });
  it('rating: range validation, average and distribution', () => {
    const c = defaultConfig('rating');
    expect(definitions.rating.validate(c, { value: 6 }).ok).toBe(false);
    expect(definitions.rating.validate(c, { value: 0 }).ok).toBe(false);
    expect(definitions.rating.validate(c, { value: 2.5 }).ok).toBe(false);
    expect(definitions.rating.validate(c, { value: 5 }).ok).toBe(true);
    const r = definitions.rating.aggregate(c, [4, 5, 5].map((value) => sub({ payload: { value } })));
    expect(r).toMatchObject({ total: 3, average: 4.67 });
    expect(r.type === 'rating' && r.distribution.map((d) => d.count)).toEqual([0, 0, 0, 1, 2]);
  });
  it('open: enforces length by mode and supports premoderation', () => {
    const short = defaultConfig('open');
    expect(definitions.open.validate(short, { text: 'x'.repeat(141) }).ok).toBe(false);
    expect(definitions.open.validate({ ...short, mode: 'paragraph' }, { text: 'x'.repeat(141) }).ok).toBe(true);
    const r = definitions.open.validate({ ...short, moderation: 'premoderate' }, { text: 'hello' });
    expect(r.ok && r.status).toBe('pending');
  });
});

describe('survey', () => {
  const cfg = defaultConfig('survey');
  it('requires required questions and validates each answer with the matching activity logic', () => {
    expect(definitions.survey.validate(cfg, { answers: {} }).ok).toBe(false);
    expect(definitions.survey.validate(cfg, { answers: { q1: { value: 9 } } }).ok).toBe(false);
    const ok = definitions.survey.validate(cfg, { answers: { q1: { value: 4 } } });
    expect(ok.ok && ok.payload).toEqual({ answers: { q1: { value: 4 } } });
    expect(definitions.survey.validate(cfg, { answers: { q1: { value: 4 }, nope: { value: 1 } } }).ok).toBe(false);
  });
  it('aggregates per question and keeps free text presenter-only', () => {
    const subs = [
      sub({ payload: { answers: { q1: { value: 5 }, q2: { text: 'great' } } } }),
      sub({ payload: { answers: { q1: { value: 3 } } } }),
    ];
    const r = definitions.survey.aggregate(cfg, subs);
    expect(r.type === 'survey' && r.total).toBe(2);
    expect(r.type === 'survey' && r.questions.q1).toMatchObject({ kind: 'rating', total: 2, average: 4 });
    expect(r.type === 'survey' && (r.questions.q2 as any).items).toHaveLength(1);
    const pub = redactResults(r);
    expect(pub.type === 'survey' && (pub.questions.q2 as any).items).toHaveLength(0);
    expect(pub.type === 'survey' && (pub.questions.q2 as any).total).toBe(1);
  });
  it('describes responses per question for export', () => {
    const lines = definitions.survey.describeResponses(cfg, { answers: { q1: { value: 4 }, q2: { text: 'ok' } } });
    expect(lines).toEqual([{ prompt: 'How was today’s session?', response: '4' }, { prompt: 'Anything else you would like to share?', response: 'ok' }]);
  });
});
