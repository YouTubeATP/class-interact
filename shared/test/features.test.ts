import { describe, expect, it } from 'vitest';
import {
  buildRecap, can, computeAnalytics, computeTeamStandings, contrastRatio, countedSubmissions, CSV_TEMPLATE, decideBranch, definitions, editDistance,
  gradeHotspot, gradeNumeric, gradeText, importCsv, importJsonSlides, IMPORT_MAX_ROWS, inRegion, mergedKey, normalizeTyped, parseCsv, parseMediaUrl,
  parseNumber, parsePresentationDoc, permissionsOf, pulseSummary, redactResults, smallestTeam, sortQuestions, standingsFromRuns, suggestMerges,
  TEMPLATES, validateQuestion, voteProblem, type AnalyticsInput, type QuizConfig, type RunRef,
} from '../src';

const doc = (slides: unknown[]) => ({ schemaVersion: 1, title: 'T', slides });
const slideConfig = (slide: Record<string, unknown>): any => {
  const r = parsePresentationDoc(doc([slide]));
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  const { id: _i, type: _t, ...c } = r.doc.slides[0] as any;
  return c;
};
const quiz = (over: Record<string, unknown>): QuizConfig => slideConfig({ id: 'q', type: 'quiz', question: 'Q', options: [], ...over });

describe('typed answers', () => {
  const rules = { acceptedAnswers: ['while', 'for loop'], caseSensitive: false, whitespace: 'normalize' as const };

  it('normalises case and spacing by the rules', () => {
    expect(normalizeTyped('  For   Loop ', { whitespace: 'normalize' })).toBe('for loop');
    expect(normalizeTyped('For Loop', { whitespace: 'ignore', caseSensitive: true })).toBe('ForLoop');
    expect(normalizeTyped(' a  b ', { whitespace: 'exact', caseSensitive: true })).toBe(' a  b ');
  });

  it('accepts listed answers and explains the grade', () => {
    expect(gradeText(rules, 'WHILE')).toMatchObject({ correct: true, review: false });
    expect(gradeText(rules, 'for   loop').detail).toContain('for loop');
  });

  it('flags near misses for review instead of guessing', () => {
    expect(editDistance('whlie', 'while')).toBe(1); // a swap is one edit
    expect(gradeText(rules, 'whlie')).toMatchObject({ correct: false, review: true });
    expect(gradeText(rules, 'if')).toMatchObject({ correct: false, review: false });
    // short words get no typo allowance
    expect(gradeText({ ...rules, acceptedAnswers: ['cat'] }, 'cut')).toMatchObject({ correct: false, review: false });
  });

  it('sends case-only differences to review when matching is case-sensitive', () => {
    expect(gradeText({ ...rules, acceptedAnswers: ['NaCl'], caseSensitive: true }, 'nacl')).toMatchObject({ correct: false, review: true });
    expect(gradeText({ ...rules, acceptedAnswers: ['NaCl'], caseSensitive: true }, 'NaCl').correct).toBe(true);
  });

  it('scores through the quiz definition, with points only when correct', () => {
    const c = quiz({ kind: 'text', acceptedAnswers: ['photosynthesis'] });
    const q = definitions.quiz;
    expect(q.evaluate(c, { text: 'Photosynthesis' }, { elapsedMs: 0 })).toMatchObject({ correct: true, score: 1000 });
    expect(q.evaluate(c, { text: 'photosynthesys' }, { elapsedMs: 0 })).toMatchObject({ correct: false, score: 0, review: true });
  });
});

describe('numeric answers', () => {
  it('reads the ways people type numbers', () => {
    expect(parseNumber('3.5')).toBe(3.5);
    expect(parseNumber('−2')).toBe(-2);
    expect(parseNumber('1,000')).toBe(1000);
    expect(parseNumber('1e-3')).toBe(0.001);
    expect(parseNumber('3/4')).toBe(0.75);
    expect(parseNumber('12 cm', 'cm')).toBe(12);
    expect(parseNumber('3,5')).toBeNull(); // never a decimal comma: ambiguous
    expect(parseNumber('1/0')).toBeNull();
    expect(parseNumber('twelve')).toBeNull();
  });

  it('applies absolute and relative tolerance, and reviews answers just outside', () => {
    expect(gradeNumeric({ value: 9.81, tolerance: 0.05 }, 9.8)).toMatchObject({ correct: true });
    expect(gradeNumeric({ value: 9.81, tolerance: 0.05 }, 9.9)).toMatchObject({ correct: false, review: true });
    expect(gradeNumeric({ value: 9.81, tolerance: 0.05 }, 11)).toMatchObject({ correct: false, review: false });
    expect(gradeNumeric({ value: 200, tolerancePercent: 5 }, 209)).toMatchObject({ correct: true });
    expect(gradeNumeric({ value: 0.3 }, 0.1 + 0.2)).toMatchObject({ correct: true }); // float noise is not a wrong answer
  });

  it('keeps the answer and unit private until reveal', () => {
    const c = quiz({ kind: 'numeric', numeric: { value: 42, tolerance: 1, unit: 'kg' } });
    const hidden = definitions.quiz.publicConfig(c, { revealCorrect: false }) as any;
    expect(hidden.numeric).toBeUndefined();
    expect(hidden.view.unit).toBe('kg');
    expect((definitions.quiz.publicConfig(c, { revealCorrect: true }) as any).numeric.value).toBe(42);
  });
});

describe('image hotspots', () => {
  const regions = [{ id: 'r', shape: 'ellipse' as const, x: 0.4, y: 0.4, w: 0.2, h: 0.2, label: 'Nucleus' }];
  it('tests rectangles and ellipses in normalised coordinates', () => {
    expect(inRegion({ shape: 'rect', x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, 0.3, 0.3)).toBe(true);
    expect(inRegion(regions[0], 0.5, 0.5)).toBe(true);
    expect(inRegion(regions[0], 0.41, 0.41)).toBe(false); // inside the box, outside the ellipse
  });
  it('grades taps, reviewing near-misses', () => {
    expect(gradeHotspot(regions, 0.5, 0.45)).toMatchObject({ correct: true });
    expect(gradeHotspot(regions, 0.5, 0.62)).toMatchObject({ correct: false, review: true });
    expect(gradeHotspot(regions, 0.1, 0.1)).toMatchObject({ correct: false, review: false });
  });
  it('hides regions and correctness until reveal', () => {
    const c = quiz({ kind: 'hotspot', image: { url: '/uploads/a.png', alt: 'Cell' }, regions });
    expect((definitions.quiz.publicConfig(c, { revealCorrect: false }) as any).regions).toEqual([]);
    const results = definitions.quiz.aggregate(c, [{ participantId: 'p', payload: { x: 0.5, y: 0.5 }, correct: true, status: 'visible' } as any], {} as any);
    const redacted = redactResults(results, { revealCorrect: false }) as any;
    expect(redacted.correctCount).toBeNull();
    expect(redacted.points[0].correct).toBeNull();
  });
});

describe('misconceptions and concepts stay private', () => {
  it('never reach the audience', () => {
    const c = quiz({ kind: 'single', options: [{ id: 'a', text: 'A', misconception: 'Off by one' }, { id: 'b', text: 'B' }], correctOptionId: 'b', concepts: ['Loops'] });
    for (const revealCorrect of [false, true]) {
      const pub = definitions.quiz.publicConfig(c, { revealCorrect }) as any;
      expect(JSON.stringify(pub)).not.toContain('Off by one');
      expect(pub.concepts).toBeUndefined();
    }
  });
});

describe('repeated runs and scoring', () => {
  const run = (id: string, number: number, scoring: RunRef['scoring'], answerRevealed = true): RunRef => ({ id, activityId: 'a', number, scoring, answerRevealed });
  const sub = (runId: string, participantId: string, score: number) => ({ runId, participantId, score, correct: score > 0, responseMs: 1000 });
  const subs = [sub('r1', 'p1', 500), sub('r1', 'p2', 0), sub('r2', 'p1', 900), sub('r2', 'p2', 800)];
  const total = (runs: RunRef[]) => Object.fromEntries(['p1', 'p2'].map((p) => [p, countedSubmissions(runs, subs).filter((s) => s.participantId === p).reduce((n, s) => n + s.score, 0)]));

  it('never counts a repeat twice unless chosen', () => {
    expect(total([run('r1', 1, 'counted'), run('r2', 2, 'practice')])).toEqual({ p1: 500, p2: 0 });
    expect(total([run('r1', 1, 'counted'), run('r2', 2, 'replace')])).toEqual({ p1: 900, p2: 800 });
    expect(total([run('r1', 1, 'counted'), run('r2', 2, 'add')])).toEqual({ p1: 1400, p2: 800 });
  });

  it('replace keeps earlier points for people who skipped the repeat', () => {
    const only = [sub('r1', 'p1', 500), sub('r1', 'p2', 300), sub('r2', 'p1', 100)];
    const counted = countedSubmissions([run('r1', 1, 'counted'), run('r2', 2, 'replace')], only);
    expect(counted.find((s) => s.participantId === 'p2')?.score).toBe(300);
    expect(counted.filter((s) => s.participantId === 'p1').map((s) => s.score)).toEqual([100]);
  });

  it('only counts revealed runs on the public leaderboard', () => {
    const runs = [run('r1', 1, 'counted', false)];
    expect(standingsFromRuns(runs, subs, new Map([['p1', 'Ada'], ['p2', 'Alan']]))).toEqual([]);
    expect(standingsFromRuns(runs, subs, new Map([['p1', 'Ada'], ['p2', 'Alan']]), { includeUnrevealed: true })[0]).toMatchObject({ name: 'Ada', score: 500 });
  });
});

describe('teams', () => {
  const teams = [{ id: 't1', name: 'Red', color: '#f00', memberIds: ['a', 'b'] }, { id: 't2', name: 'Blue', color: '#00f', memberIds: ['c'] }];
  it('ranks by average so team size is no advantage', () => {
    const s = computeTeamStandings(teams, [{ participantId: 'a', score: 600 }, { participantId: 'b', score: 0 }, { participantId: 'c', score: 500 }] as any);
    expect(s.map((t) => [t.name, t.score, t.total, t.rank])).toEqual([['Blue', 500, 500, 1], ['Red', 300, 600, 2]]);
  });
  it('auto-assigns newcomers to the smallest team', () => {
    expect(smallestTeam(teams)?.id).toBe('t2');
    expect(smallestTeam([])).toBeNull();
  });
});

describe('audience Q&A', () => {
  it('validates length', () => {
    expect(validateQuestion('  ')).toMatchObject({ ok: false });
    expect(validateQuestion('x'.repeat(400))).toMatchObject({ ok: false });
    expect(validateQuestion('  Why does   this work? ')).toEqual({ ok: true, text: 'Why does this work?' });
  });
  it('allows one vote per person, never on your own or a hidden question', () => {
    expect(voteProblem({ status: 'visible', authorId: 'p1' }, 'p2')).toBeNull();
    expect(voteProblem({ status: 'visible', authorId: 'p1' }, 'p1')).toMatch(/own/);
    expect(voteProblem({ status: 'pending', authorId: 'p1' }, 'p2')).toMatch(/not open/);
  });
  it('sorts pinned, then unanswered by votes', () => {
    const q = (id: string, votes: number, extra: Partial<{ pinned: boolean; answered: boolean }> = {}) => ({ id, votes, pinned: false, answered: false, createdAt: votes, ...extra });
    const list = [q('a', 1), q('b', 9, { answered: true }), q('c', 5), q('d', 0, { pinned: true })];
    expect(sortQuestions(list, 'popular').map((x) => x.id)).toEqual(['d', 'c', 'a', 'b']);
    expect(sortQuestions(list, 'recent').map((x) => x.id)).toEqual(['d', 'b', 'c', 'a']);
  });
});

describe('roles', () => {
  it('limits co-presenters and moderators', () => {
    expect(permissionsOf('owner')).toContain('access');
    expect(can('copresenter', 'navigate')).toBe(true);
    expect(can('copresenter', 'end')).toBe(false);
    expect(can('copresenter', 'access')).toBe(false);
    expect(can('moderator', 'navigate')).toBe(false);
    expect(can('moderator', 'screen')).toBe(false);
    expect(can('moderator', 'qa')).toBe(true);
  });
});

describe('branching', () => {
  const rule = { threshold: 60, below: 'review', atOrAbove: 'next' };
  it('picks a side by the correct rate, and does nothing without answers', () => {
    expect(decideBranch(rule, 0.5)).toMatchObject({ targetId: 'review', side: 'below' });
    expect(decideBranch(rule, 0.6)).toMatchObject({ targetId: 'next', side: 'atOrAbove' });
    expect(decideBranch(rule, null).targetId).toBeNull();
    expect(decideBranch(undefined, 0.1).targetId).toBeNull();
  });
  it('rejects rules that point at missing slides', () => {
    const r = parsePresentationDoc(doc([{ id: 'q', type: 'quiz', question: 'Q', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctOptionId: 'a', branch: { threshold: 50, below: 'nope' } }]));
    expect(r.ok).toBe(false);
  });
});

describe('understanding pulse', () => {
  it('counts now and replays a per-minute trend', () => {
    const t0 = 10 * 60_000;
    const s = pulseSummary(['got', 'lost'], [
      { at: t0 + 1000, value: 'got', previous: '' },
      { at: t0 + 2000, value: 'unsure', previous: '' },
      { at: t0 + 65_000, value: 'lost', previous: 'unsure' },
    ], t0 + 90_000, 3);
    expect(s).toMatchObject({ got: 1, unsure: 0, lost: 1, total: 2 });
    expect(s.trend).toHaveLength(3);
    expect(s.trend[1]).toMatchObject({ got: 1, unsure: 1, lost: 0 });
    expect(s.trend[2]).toMatchObject({ got: 1, unsure: 0, lost: 1 });
  });
});

describe('answer grouping', () => {
  it('suggests accent, plural and typo merges with a reason, never applying them', () => {
    const terms = [{ key: 'café', label: 'Café', count: 3 }, { key: 'cafe', label: 'cafe', count: 1 }, { key: 'cell', label: 'cell', count: 2 }, { key: 'cells', label: 'cells', count: 4 }, { key: 'mitochondria', label: 'mitochondria', count: 2 }, { key: 'mitocondria', label: 'mitocondria', count: 1 }, { key: 'dog', label: 'dog', count: 1 }];
    const s = suggestMerges(terms);
    expect(s.map((x) => [x.into, [...x.keys].sort()])).toEqual([['café', ['cafe', 'café']], ['cells', ['cell', 'cells']], ['mitochondria', ['mitochondria', 'mitocondria']]]);
    expect(s.every((x) => x.reason.length > 0)).toBe(true);
    // a rejected suggestion does not come back
    expect(suggestMerges(terms, {}, new Set(['cell|cells'])).some((x) => x.keys.includes('cell'))).toBe(false);
  });
  it('follows merge chains without looping', () => {
    expect(mergedKey('a', { a: 'b', b: 'c' })).toBe('c');
    expect(mergedKey('a', { a: 'b', b: 'a' })).toMatch(/^[ab]$/);
  });
});

describe('bulk import', () => {
  it('parses quoted CSV, semicolons and tabs', () => {
    expect(parseCsv('a,b\n"x, y","he said ""hi"""\n')).toEqual([['a', 'b'], ['x, y', 'he said "hi"']]);
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('imports the template and reports bad rows instead of dropping them', () => {
    const ok = importCsv(CSV_TEMPLATE);
    expect(ok.issues).toEqual([]);
    expect(ok.slides.map((s) => s.type)).toEqual(['quiz', 'quiz', 'quiz', 'quiz', 'poll', 'wordcloud']);
    expect((ok.slides[3] as any).numeric).toMatchObject({ value: 0.3, tolerance: 0.005 });
    const bad = importCsv('question,options,correct\nPick one,A|B,Z\n,,\n');
    expect(bad.slides).toHaveLength(0);
    expect(bad.issues[0].row).toBe(2);
    expect(importCsv('foo,bar\n1,2').issues[0].message).toMatch(/question/);
  });
  it('enforces row limits', () => {
    const many = 'question,options\n' + Array.from({ length: IMPORT_MAX_ROWS + 5 }, (_, i) => `Q${i},A|B`).join('\n');
    const r = importCsv(many);
    expect(r.slides).toHaveLength(IMPORT_MAX_ROWS);
    expect(r.issues.some((i) => /first 300/.test(i.message))).toBe(true);
  });
  it('validates JSON slides one by one and avoids id clashes', () => {
    const r = importJsonSlides(JSON.stringify([{ id: 'x', type: 'poll', question: 'Q', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] }, { type: 'nope' }]), ['x']);
    expect(r.slides).toHaveLength(1);
    expect(r.slides[0].id).not.toBe('x');
    expect(r.issues[0].row).toBe(2);
    expect(importJsonSlides('{').issues[0].message).toMatch(/Not valid JSON/);
  });
});

describe('media and branding', () => {
  it('only allows safe embeds', () => {
    expect(parseMediaUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toMatchObject({ provider: 'youtube', id: 'dQw4w9WgXcQ' });
    expect(parseMediaUrl('https://vimeo.com/76979871')).toMatchObject({ provider: 'vimeo' });
    expect(parseMediaUrl('javascript:alert(1)')).toBeNull();
    expect(parseMediaUrl('http://example.com/a.mp4')).toBeNull();
  });
  it('rejects custom accents that are unreadable on white', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0);
    const r = parsePresentationDoc({ ...doc([{ id: 'c', type: 'content', title: 'Hi' }]), theme: { palette: 'iris', accent: '#ffee00' } });
    expect(r.ok).toBe(false);
  });
});

describe('analytics and recap', () => {
  const q = quiz({ kind: 'single', options: [{ id: 'a', text: 'Right' }, { id: 'b', text: 'Wrong', misconception: 'Confuses x and y' }], correctOptionId: 'a', concepts: ['Loops'] });
  const rating = slideConfig({ id: 'r', type: 'rating', question: 'How sure?', min: 1, max: 5, confidenceFor: [] });
  const people = ['p1', 'p2', 'p3', 'p4', 'p5'];
  let n = 0;
  const s = (runId: string, activityId: string, participantId: string, payload: any, correct: boolean | null) => ({ id: `s${n++}`, runId, activityId, participantId, payload, correct, score: correct ? 1000 : 0, responseMs: 2000 + n * 100, status: 'visible', createdAt: 1000 + n });
  const input: AnalyticsInput = {
    participants: people.map((id) => ({ id, joinedAt: 0, removed: false })),
    activities: [
      { id: 'A', key: 'q', index: 0, type: 'quiz', config: q, runs: [{ id: 'A1', number: 1, scoring: 'counted', startedAt: 0 }, { id: 'A2', number: 2, scoring: 'practice', startedAt: 5000 }] },
      { id: 'R', key: 'r', index: 1, type: 'rating', config: { ...rating, confidenceFor: ['q'] }, runs: [{ id: 'R1', number: 1, scoring: 'counted', startedAt: 0 }] },
    ],
    submissions: [
      // run 1: 1 of 4 right, three chose the misconception
      s('A1', 'A', 'p1', { optionId: 'a' }, true), s('A1', 'A', 'p2', { optionId: 'b' }, false), s('A1', 'A', 'p3', { optionId: 'b' }, false), s('A1', 'A', 'p4', { optionId: 'b' }, false),
      // run 2 after teaching: 4 of 4 right
      ...['p1', 'p2', 'p3', 'p4'].map((p) => s('A2', 'A', p, { optionId: 'a' }, true)),
      // confidence: p1 sure, p2 sure, p3 unsure, p4 neutral
      s('R1', 'R', 'p1', { value: 5 }, null), s('R1', 'R', 'p2', { value: 4 }, null), s('R1', 'R', 'p3', { value: 1 }, null), s('R1', 'R', 'p4', { value: 3 }, null),
    ],
    questions: [{ id: 'x', text: 'What about while?', votes: 3, status: 'visible', answered: false, pinned: false, createdAt: 1, anonymous: true, authorName: null } as any],
    endedAt: null,
  };
  const a = computeAnalytics(input);

  it('measures participation, nonresponse and timing', () => {
    expect(a.participation).toMatchObject({ participants: 5, respondedAny: 4, interactive: 2 });
    const stat = a.questions.find((x) => x.activityId === 'A')!;
    expect(stat).toMatchObject({ runNumber: 2, respondents: 4, eligible: 5, correctRate: 1, difficulty: 'easy' });
    expect(stat.nonresponseRate).toBeCloseTo(0.2);
    expect(stat.medianMs).toBeGreaterThan(0);
  });

  it('compares runs person by person', () => {
    const c = a.comparisons[0];
    expect(c).toMatchObject({ before: 1, after: 2, beforeRate: 0.25, afterRate: 1, delta: 75 });
    expect(c.transitions).toEqual({ stayedRight: 1, improved: 3, slipped: 0, stayedWrong: 0 });
  });

  it('places confidence against correctness, leaving the midpoint neutral', () => {
    // the latest quiz run is the one paired: everyone was right then
    expect(a.confidence[0]).toMatchObject({ pairs: 4, neutral: 1, quadrants: { confidentCorrect: 2, confidentWrong: 0, unsureCorrect: 1, unsureWrong: 0 } });
  });

  it('lists unanswered audience questions and writes a traceable recap', () => {
    expect(a.unansweredQuestions.map((x) => x.id)).toEqual(['x']);
    const recap = buildRecap(a);
    expect(recap.participation[0].text).toBe('5 people joined; 4 answered at least one activity.');
    expect(JSON.stringify(recap)).toContain('What about while?');
    // the same input always gives the same recap
    expect(buildRecap(computeAnalytics(input))).toEqual(recap);
  });
});

describe('templates', () => {
  it('are all valid presentations, including the chemistry deck', () => {
    for (const t of TEMPLATES) {
      const r = parsePresentationDoc(t.doc);
      expect(r.ok, `${t.id}: ${r.ok ? '' : JSON.stringify(r.errors)}`).toBe(true);
    }
    const chem = TEMPLATES.find((t) => t.id === 'synthetic-routes')!;
    expect(JSON.stringify(chem.doc)).toContain('```route');
  });
});
