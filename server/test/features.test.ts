import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ParticipantSnapshot, PresenterSnapshot, ProjectorSnapshot } from '@classinteract/shared';
import { Client, cloud, createTestContext, doc, participant, presenterClient, projectorClient, quiz, sleep, type TestContext } from './helpers';

let ctx: TestContext;
beforeAll(async () => { ctx = await createTestContext(); });
afterAll(async () => { await ctx.close(); });

const act = (c: Client, action: Record<string, unknown>, extra: Record<string, unknown> = {}) => c.emit('presenter', { cmd: 'action', action, ...extra });
const cmd = (c: Client, body: Record<string, unknown>) => c.emit('presenter', body);
const P = (c: Client) => c.last as PresenterSnapshot;
const answer = async (c: Client, payload: unknown) => {
  const snap = await c.until((x) => x.state.phase === 'open' && !!x.activity);
  return c.emit('submit', { activityId: snap.activity!.id, payload });
};

describe('repeating an activity', () => {
  it('keeps earlier responses, scores practice runs separately and compares runs', async () => {
    const s = await ctx.startSession(doc([quiz({ id: 'q1' })]));
    const p = await presenterClient(ctx, s);
    const ann = await participant(ctx, s, 'Ann');
    const bo = await participant(ctx, s, 'Bo');
    await act(p, { type: 'start' });
    expect(await answer(ann.client, { optionId: 'a' })).toMatchObject({ ok: true }); // wrong first time
    expect(await answer(bo.client, { optionId: 'b' })).toMatchObject({ ok: true });
    await act(p, { type: 'revealCorrect' });
    await p.until((x) => (x as PresenterSnapshot).standings.length === 2);
    expect(P(p).standings.map((x) => [x.name, x.score])).toEqual([['Bo', 1000], ['Ann', 0]]);

    // run again as practice: a fresh run, answers accepted again, earlier ones untouched
    expect(await cmd(p, { cmd: 'runAgain', scoring: 'practice' })).toMatchObject({ ok: true });
    const snap = await p.until((x) => (x as PresenterSnapshot).run?.number === 2 && x.state.phase === 'open');
    expect(snap.run).toMatchObject({ number: 2, count: 2, scoring: 'practice' });
    expect(snap.counts.responses).toBe(0);
    expect(await answer(ann.client, { optionId: 'b' })).toMatchObject({ ok: true });
    expect(await answer(bo.client, { optionId: 'b' })).toMatchObject({ ok: true });
    expect(await answer(bo.client, { optionId: 'b' })).toMatchObject({ ok: false, code: 'DUPLICATE' });
    await act(p, { type: 'revealCorrect' });
    const after = await p.until((x) => (x as PresenterSnapshot).runs.length === 2 && x.state.correctVisible);
    // practice points never reach the leaderboard
    expect((after as PresenterSnapshot).standings.map((x) => [x.name, x.score])).toEqual([['Bo', 1000], ['Ann', 0]]);
    expect((after as PresenterSnapshot).runs.map((r) => [r.number, r.correctRate])).toEqual([[1, 0.5], [2, 1]]);

    // a third run that replaces earlier points
    await cmd(p, { cmd: 'runAgain', scoring: 'replace' });
    await p.until((x) => (x as PresenterSnapshot).run?.number === 3 && x.state.phase === 'open');
    await answer(ann.client, { optionId: 'b' });
    await act(p, { type: 'revealCorrect' });
    const third = await p.until((x) => (x as PresenterSnapshot).standings.some((y) => y.name === 'Ann' && y.score === 1000));
    expect((third as PresenterSnapshot).standings.map((x) => x.score)).toEqual([1000, 1000]);

    const results = await ctx.api(`/api/studio/sessions/${s.id}/results`);
    expect(results.body.activities[0].runs.map((r: any) => r.respondents)).toEqual([2, 2, 1]);
    const analytics = await ctx.api(`/api/studio/sessions/${s.id}/analytics`);
    expect(analytics.body.analytics.comparisons[0]).toMatchObject({ before: 1, after: 3, beforeRate: 0.5, afterRate: 1, delta: 50 });
    const csv = await ctx.api(`/api/studio/sessions/${s.id}/export.csv`);
    expect(csv.text.split('\r\n').filter((l) => l.startsWith('1,quiz'))).toHaveLength(5);
    [p, ann.client, bo.client].forEach((c) => c.disconnect());
  });

  it('refuses to run an activity again while it is still open', async () => {
    const s = await ctx.startSession(doc([quiz()]));
    const p = await presenterClient(ctx, s);
    await act(p, { type: 'start' });
    await p.until((x) => x.state.phase === 'open');
    expect(await cmd(p, { cmd: 'runAgain', scoring: 'practice' })).toMatchObject({ ok: false, code: 'ALREADY_OPEN' });
    p.disconnect();
  });
});

describe('audience Q&A', () => {
  it('asks, upvotes once, moderates, highlights and survives the projector showing other things', async () => {
    const s = await ctx.startSession(doc([quiz()]));
    const p = await presenterClient(ctx, s);
    const proj = await projectorClient(ctx, s);
    const ann = await participant(ctx, s, 'Ann');
    const bo = await participant(ctx, s, 'Bo');
    const ask = await ann.client.emit<{ question: { id: string } }>('qa:ask', { text: 'What is a loop invariant?', anonymous: false });
    expect(ask).toMatchObject({ ok: true });
    const qid = (ask as any).question.id as string;
    expect(await ann.client.emit('qa:vote', { id: qid, on: true })).toMatchObject({ ok: false }); // own question
    expect(await bo.client.emit('qa:vote', { id: qid, on: true })).toMatchObject({ ok: true, votes: 1 });
    expect(await bo.client.emit('qa:vote', { id: qid, on: true })).toMatchObject({ ok: true, votes: 1 }); // no double vote
    const bsnap = (await bo.client.until((x) => (x as ParticipantSnapshot).questions?.[0]?.votes === 1)) as ParticipantSnapshot;
    expect(bsnap.questions![0]).toMatchObject({ voted: true, mine: false, authorName: 'Ann' });

    // anonymous questions carry no name, even for the presenter
    await bo.client.emit('qa:ask', { text: 'Can we see another example?', anonymous: true });
    const ps = (await p.until((x) => (x as PresenterSnapshot).allQuestions.length === 2)) as PresenterSnapshot;
    expect(ps.allQuestions.find((q) => q.text.startsWith('Can we'))!.authorName).toBeNull();

    // the projector only gets questions when Q&A is on screen
    expect((proj.last as ProjectorSnapshot).questions).toBeNull();
    await act(p, { type: 'start' }); // a quiz is now on screen
    await act(p, { type: 'showOverlay', overlay: 'qa' });
    const pq = (await proj.until((x) => !!(x as ProjectorSnapshot).questions)) as ProjectorSnapshot;
    expect(pq.state.phase).toBe('open'); // the quiz underneath is untouched
    expect(pq.questions![0].text).toBe('What is a loop invariant?');
    await cmd(p, { cmd: 'qa', op: 'highlight', id: qid });
    expect(((await proj.until((x) => !!x.highlight)) as ProjectorSnapshot).highlight!.id).toBe(qid);
    await cmd(p, { cmd: 'qa', op: 'answer', id: qid });
    await cmd(p, { cmd: 'qa', op: 'dismiss', id: ps.allQuestions.find((q) => q.text.startsWith('Can we'))!.id });
    const after = (await bo.client.until((x) => (x as ParticipantSnapshot).questions?.length === 1 && !!(x as ParticipantSnapshot).questions?.[0].answered)) as ParticipantSnapshot;
    expect(after.questions![0].answered).toBe(true);
    expect((await ctx.api(`/api/studio/sessions/${s.id}/export.csv`)).text).toContain('audience_question');
    [p, proj, ann.client, bo.client].forEach((c) => c.disconnect());
  });

  it('premoderation keeps a question private until approved', async () => {
    const s = await ctx.startSession(doc([quiz()]));
    const p = await presenterClient(ctx, s);
    await cmd(p, { cmd: 'features', patch: { qa: { premoderate: true } } });
    const ann = await participant(ctx, s, 'Ann');
    const bo = await participant(ctx, s, 'Bo');
    await ann.client.emit('qa:ask', { text: 'Pending question here', anonymous: false });
    const mine = (await ann.client.until((x) => !!(x as ParticipantSnapshot).questions?.length)) as ParticipantSnapshot;
    expect(mine.questions![0]).toMatchObject({ status: 'pending', mine: true });
    await sleep(200);
    expect((bo.client.last as ParticipantSnapshot).questions ?? []).toHaveLength(0);
    const id = mine.questions![0].id;
    await cmd(p, { cmd: 'qa', op: 'approve', id });
    await bo.client.until((x) => (x as ParticipantSnapshot).questions?.length === 1);
    [p, ann.client, bo.client].forEach((c) => c.disconnect());
  });
});

describe('understanding pulse', () => {
  it('aggregates anonymously and can change at any time', async () => {
    const s = await ctx.startSession(doc([quiz()]));
    const p = await presenterClient(ctx, s);
    const proj = await projectorClient(ctx, s);
    const a = await participant(ctx, s, 'Ann');
    const b = await participant(ctx, s, 'Bo');
    await a.client.emit('pulse', { value: 'got' });
    await b.client.emit('pulse', { value: 'lost' });
    await b.client.emit('pulse', { value: 'unsure' });
    const snap = (await p.until((x) => x.pulse?.total === 2 && x.pulse.unsure === 1)) as PresenterSnapshot;
    expect(snap.pulse).toMatchObject({ got: 1, unsure: 1, lost: 0 });
    expect(JSON.stringify(snap.pulse)).not.toContain('Ann');
    expect((proj.last as ProjectorSnapshot).pulse).toBeNull(); // private until projected
    await act(p, { type: 'showOverlay', overlay: 'pulse' });
    await proj.until((x) => x.pulse?.total === 2);
    expect(((await a.client.until((x) => (x as ParticipantSnapshot).me.pulse === 'got')) as ParticipantSnapshot).me.pulse).toBe('got');
    [p, proj, a.client, b.client].forEach((c) => c.disconnect());
  });
});

describe('co-presenters and moderators', () => {
  it('scopes permissions, keeps screens in sync, refuses stale commands and revokes without ending', async () => {
    const s = await ctx.startSession(doc([quiz({ id: 'q1' }), cloud()]));
    const owner = await presenterClient(ctx, s);
    const co = await ctx.api(`/api/studio/sessions/${s.id}/grants`, { body: { role: 'copresenter', label: 'TA phone' } });
    const mod = await ctx.api(`/api/studio/sessions/${s.id}/grants`, { body: { role: 'moderator', label: 'Moderator' } });
    expect(co.status).toBe(201);
    expect(co.body.path).toContain(`/remote/${s.id}#g=`);
    // the grant token is never stored or shown again
    expect(JSON.stringify((await owner.until((x) => (x as PresenterSnapshot).grants.length === 2)) as PresenterSnapshot)).not.toContain(co.body.token);
    const claim = await ctx.api('/api/delegate/claim', { body: { sessionId: s.id, token: co.body.token } });
    expect(claim.body).toMatchObject({ role: 'copresenter' });
    const coC = await new Client(ctx.url, { role: 'delegate', sessionId: s.id, token: co.body.token }).connect();
    const modC = await new Client(ctx.url, { role: 'delegate', sessionId: s.id, token: mod.body.token }).connect();
    expect(P(coC).staff).toMatchObject({ role: 'copresenter' });
    expect(P(coC).grants).toEqual([]);

    expect(await act(modC, { type: 'start' })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await act(coC, { type: 'end' })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await cmd(coC, { cmd: 'kick', participantId: 'x' })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await act(coC, { type: 'start' }, { expectVersion: P(coC).version })).toMatchObject({ ok: true });
    await owner.until((x) => x.state.phase === 'open');

    // the owner, still looking at the old version, presses Close: refused rather than contradicting the co-presenter
    const stale = await act(owner, { type: 'next' }, { expectVersion: 0 });
    expect(stale).toMatchObject({ ok: false, code: 'STALE' });

    // moderators may moderate questions
    const ann = await participant(ctx, s, 'Ann');
    const q = await ann.client.emit('qa:ask', { text: 'A question for moderation', anonymous: false });
    expect(await cmd(modC, { cmd: 'qa', op: 'hide', id: (q as any).question.id })).toMatchObject({ ok: true });

    // revoking disconnects that link at once; the session keeps going
    expect((await ctx.api(`/api/studio/sessions/${s.id}/grants/${co.body.id}`, { method: 'DELETE' })).status).toBe(204);
    await sleep(150);
    expect(coC.socket.connected).toBe(false);
    await expect(new Client(ctx.url, { role: 'delegate', sessionId: s.id, token: co.body.token }).connect()).rejects.toThrow(/UNAUTHORIZED/);
    expect((await owner.until(() => true)).state.phase).toBe('open');
    [owner, modC, ann.client].forEach((c) => c.disconnect());
  });
});

describe('breaks, overlays and the join QR', () => {
  it('shows a break and the join code over the activity without changing it', async () => {
    const s = await ctx.startSession(doc([quiz({ timeLimitSec: 60 })]));
    const p = await presenterClient(ctx, s);
    const proj = await projectorClient(ctx, s);
    const a = await participant(ctx, s, 'Ann');
    await act(p, { type: 'start' });
    const before = await proj.until((x) => x.state.phase === 'open');
    await act(p, { type: 'showOverlay', overlay: 'join' });
    const withQr = await proj.until((x) => x.state.overlay === 'join');
    expect(withQr.state).toMatchObject({ phase: 'open', activityIndex: 0, openedAt: before.state.openedAt });
    await act(p, { type: 'startBreak', kind: 'break', title: 'Coffee', message: 'Back soon', minutes: 5 });
    const br = (await a.client.until((x) => !!x.state.breakScreen)) as ParticipantSnapshot;
    expect(br.state.breakScreen).toMatchObject({ title: 'Coffee', kind: 'break' });
    expect(br.state.breakScreen!.endsAt! - br.state.breakScreen!.startedAt).toBe(300_000);
    expect(br.state.phase).toBe('open');
    await act(p, { type: 'endBreak' });
    await act(p, { type: 'hideOverlay' });
    await proj.until((x) => !x.state.breakScreen && !x.state.overlay);
    [p, proj, a.client].forEach((c) => c.disconnect());
  });
});

describe('typed, numeric and hotspot questions', () => {
  it('grades deterministically, flags near misses for review, and the teacher decides', async () => {
    const s = await ctx.startSession(doc([
      { id: 'tq', type: 'quiz', kind: 'text', question: 'Python keyword for a loop?', acceptedAnswers: ['for', 'while'] },
      { id: 'nq', type: 'quiz', kind: 'numeric', question: '0.1 + 0.2?', numeric: { value: 0.3, tolerance: 0.001 } },
      { id: 'hq', type: 'quiz', kind: 'hotspot', question: 'Find the resistor', image: { url: 'https://example.com/c.png', alt: 'circuit' }, regions: [{ id: 'r1', x: 0.2, y: 0.2, w: 0.2, h: 0.2 }] },
    ]));
    const p = await presenterClient(ctx, s);
    const a = await participant(ctx, s, 'Ann');
    const b = await participant(ctx, s, 'Bo');
    const c = await participant(ctx, s, 'Cy');
    await act(p, { type: 'start' });
    // answers are never in the audience view before the reveal
    const open = (await a.client.until((x) => x.state.phase === 'open')) as ParticipantSnapshot;
    expect(JSON.stringify(open.activity!.config)).not.toMatch(/while/);
    await answer(a.client, { text: '  FOR ' });
    await answer(b.client, { text: 'whlie' }); // a typo: flagged for review
    await answer(c.client, { text: 'loop' });
    const review = (await p.until((x) => (x as PresenterSnapshot).reviews.length === 1)) as PresenterSnapshot;
    expect(review.reviews[0]).toMatchObject({ label: 'whlie', count: 1, decision: null });
    expect(await cmd(p, { cmd: 'review', key: review.reviews[0].key, accept: true })).toMatchObject({ ok: true });
    await act(p, { type: 'revealCorrect' });
    const bo = (await b.client.until((x) => x.state.correctVisible)) as ParticipantSnapshot;
    expect(bo.me.submissions[0]).toMatchObject({ correct: true, score: 1000 });
    expect(bo.me.submissions[0].detail).toMatch(/Accepted by the presenter/);

    await act(p, { type: 'next' });
    expect(await answer(a.client, { text: '0.3' })).toMatchObject({ ok: true });
    expect(await answer(b.client, { text: 'three' })).toMatchObject({ ok: false, code: 'INVALID' });
    expect(await answer(b.client, { text: '3/10' })).toMatchObject({ ok: true });
    await act(p, { type: 'revealCorrect' });
    expect(((await b.client.until((x) => x.state.correctVisible)) as ParticipantSnapshot).me.submissions[0].correct).toBe(true);

    await act(p, { type: 'next' });
    const hs = (await a.client.until((x) => x.state.phase === 'open' && x.activity?.key === 'hq')) as ParticipantSnapshot;
    expect((hs.activity!.config as any).regions).toEqual([]);
    expect(await answer(a.client, { x: 0.3, y: 0.3 })).toMatchObject({ ok: true });
    expect(await answer(b.client, { x: 1.3, y: 0.3 })).toMatchObject({ ok: false });
    await act(p, { type: 'revealCorrect' });
    expect(((await a.client.until((x) => x.state.correctVisible)) as ParticipantSnapshot).me.submissions[0].correct).toBe(true);
    [p, a.client, b.client, c.client].forEach((x) => x.disconnect());
  });
});

describe('teams', () => {
  it('assigns automatically, ranks teams by average and keeps individual standings separate', async () => {
    const s = await ctx.startSession(doc([quiz()]), { collectNames: true });
    const p = await presenterClient(ctx, s);
    await cmd(p, { cmd: 'teams', team: { op: 'setup', count: 2 } });
    const people = [];
    for (const n of ['Ann', 'Bo', 'Cy', 'Di']) people.push(await participant(ctx, s, n));
    const snap = (await p.until((x) => (x as PresenterSnapshot).teams.every((t) => t.memberIds.length === 2))) as PresenterSnapshot;
    expect(snap.teams).toHaveLength(2);
    await act(p, { type: 'start' });
    for (const x of people) await answer(x.client, { optionId: x === people[0] ? 'b' : 'a' });
    await act(p, { type: 'revealCorrect' });
    await act(p, { type: 'setLeaderboardMode', mode: 'team' });
    await act(p, { type: 'showLeaderboard' });
    const board = (await people[0].client.until((x) => !!x.teamBoard)) as ParticipantSnapshot;
    expect(board.teamBoard!.map((t) => t.score).sort((a, b) => b - a)).toEqual([500, 0]);
    expect(board.me.team).not.toBeNull();
    expect(board.leaderboard![0]).toMatchObject({ name: 'Ann', score: 1000 });
    // a removed member no longer counts for their team
    await cmd(p, { cmd: 'kick', participantId: board.me.id });
    const after = (await p.until((x) => (x as PresenterSnapshot).teamStandings.every((t) => t.score === 0))) as PresenterSnapshot;
    expect(after.teamStandings.reduce((n, t) => n + t.members, 0)).toBe(3);
    p.disconnect();
    people.forEach((x) => x.client.disconnect());
  });
});

describe('branching', () => {
  it('Next follows the rule from the class result, and the presenter can override it', async () => {
    const s = await ctx.startSession(doc([
      quiz({ id: 'q1', branch: { threshold: 60, below: 'remedial', atOrAbove: 'next-topic' } }),
      { id: 'remedial', type: 'content', title: 'Let us look again' },
      { id: 'next-topic', type: 'content', title: 'Moving on' },
    ]));
    const p = await presenterClient(ctx, s);
    const a = await participant(ctx, s, 'Ann');
    const b = await participant(ctx, s, 'Bo');
    await act(p, { type: 'start' });
    await answer(a.client, { optionId: 'b' });
    await answer(b.client, { optionId: 'a' });
    await act(p, { type: 'close' });
    const snap = (await p.until((x) => (x as PresenterSnapshot).branch?.side === 'below')) as PresenterSnapshot;
    expect(snap.branch).toMatchObject({ targetId: 'remedial', targetIndex: 1 });
    // an override goes to the next slide in order regardless
    await cmd(p, { cmd: 'nextPlain' });
    await p.until((x) => x.state.activityIndex === 1);
    await act(p, { type: 'previous' });
    await act(p, { type: 'next' });
    expect((await p.until((x) => x.state.activityIndex === 1)).state.activityIndex).toBe(1);
    [p, a.client, b.client].forEach((c) => c.disconnect());
  });
});

describe('self-paced sessions', () => {
  it('lets people work through activities on their own, with a deadline and a reveal policy', async () => {
    const s = await ctx.startSession(doc([quiz({ id: 'q1', timeLimitSec: 10, speedBonus: true }), cloud()]), { mode: 'selfpaced' as never });
    const p = await presenterClient(ctx, s);
    const a = await participant(ctx, s, 'Ann');
    const first = (await a.client.until(() => true)) as ParticipantSnapshot;
    expect(first.selfPaced).toMatchObject({ open: false });
    expect(await act(p, { type: 'start' })).toMatchObject({ ok: false, code: 'SELF_PACED' });
    await cmd(p, { cmd: 'selfPaced', op: 'open' });
    const open = (await a.client.until((x) => !!(x as ParticipantSnapshot).selfPaced?.open)) as ParticipantSnapshot;
    const [q, wc] = open.selfPaced!.items;
    expect(await a.client.emit('submit', { activityId: wc.activity.id, payload: { text: 'fun' } })).toMatchObject({ ok: true });
    const ack = await a.client.emit('submit', { activityId: q.activity.id, payload: { optionId: 'b' } });
    expect(ack).toMatchObject({ ok: true, submission: { correct: null } }); // after-close by default
    const prog = (await p.until((x) => (x as PresenterSnapshot).selfPaced?.perParticipant[0]?.answered === 2)) as PresenterSnapshot;
    expect(prog.selfPaced!.interactiveCount).toBe(2);
    await cmd(p, { cmd: 'selfPaced', op: 'close' });
    const closed = (await a.client.until((x) => (x as ParticipantSnapshot).selfPaced?.revealNow === true)) as ParticipantSnapshot;
    // no speed bonus without a shared clock
    expect(closed.selfPaced!.items[0].submissions[0]).toMatchObject({ correct: true, score: 1000 });
    expect(await a.client.emit('submit', { activityId: q.activity.id, payload: { optionId: 'b' } })).toMatchObject({ ok: false, code: 'NOT_ACCEPTING' });
    [p, a.client].forEach((c) => c.disconnect());
  });
});

describe('rehearsal', () => {
  it('fills activities with simulated answers that never mix with real sessions', async () => {
    const imp = await ctx.api('/api/studio/presentations/import', { body: doc([quiz({ id: 'q1' }), cloud()]) });
    const r = await ctx.api(`/api/studio/presentations/${imp.body.id}/rehearse`, { body: { participants: 6 } });
    expect(r.status).toBe(201);
    const ctl = await ctx.api(`/api/studio/sessions/${r.body.id}/control`);
    const p = await new Client(ctx.url, { role: 'presenter', sessionId: r.body.id, token: ctl.body.presenterToken }).connect();
    expect((await p.until((x) => x.counts.participants === 6)).session.features.rehearsal).toBe(true);
    await act(p, { type: 'start' });
    await p.until((x) => x.counts.respondents === 6, 15_000);
    expect((P(p).participants.every((x) => x.simulated))).toBe(true);
    const list = await ctx.api('/api/studio/sessions');
    expect(list.body.find((x: any) => x.id === r.body.id).rehearsal).toBe(true);
    // simulation is only for rehearsals
    const real = await ctx.startSession(doc([quiz()]));
    const rp = await presenterClient(ctx, real);
    expect(await cmd(rp, { cmd: 'simulate', count: 3 })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    [p, rp].forEach((c) => c.disconnect());
  });
});

describe('optional continuity across sessions', () => {
  it('links people by a device key, never by name, and lets them forget it', async () => {
    const s1 = await ctx.startSession(doc([quiz()]), { collectNames: true });
    // off by default: no key offered
    expect((await ctx.api('/api/join', { body: { pin: s1.pin, name: 'Ann', remember: true } })).body.learnerKey).toBeUndefined();
    const imp = await ctx.api('/api/studio/presentations/import', { body: doc([quiz()]) });
    const mk = async () => {
      const r = await ctx.api(`/api/studio/presentations/${imp.body.id}/sessions`, { body: { collectNames: true, mode: 'standalone', features: { continuity: true } } });
      return r.body as { id: string; pin: string };
    };
    const a = await mk();
    const j1 = await ctx.api('/api/join', { body: { pin: a.pin, name: 'Ann', remember: true, shareProgress: true } });
    expect(j1.body.learnerKey).toBeTruthy();
    const b = await mk();
    // a different display name, same person
    await ctx.api('/api/join', { body: { pin: b.pin, name: 'Annie', learnerKey: j1.body.learnerKey } });
    // the same display name is a different person without the key
    await ctx.api('/api/join', { body: { pin: b.pin, name: 'Ann' } });
    const report = await ctx.api('/api/studio/learners');
    const me = report.body.learners.find((l: any) => l.sessions === 2);
    expect(me.history.map((h: any) => h.displayName)).toEqual(['Ann', 'Annie']);
    expect(report.body.sessions.find((x: any) => x.sessionId === b.id)).toMatchObject({ linked: 1, returning: 1 });
    expect((await ctx.api('/api/learner/forget', { body: { key: j1.body.learnerKey } })).body.ok).toBe(true);
    expect((await ctx.api('/api/studio/learners')).body.learners.some((l: any) => l.id === me.id)).toBe(false);
  });
});

describe('server restart mid-session with repeated runs', () => {
  it('reloads runs, questions and pulse from the database', async () => {
    const s = await ctx.startSession(doc([quiz()]));
    const p = await presenterClient(ctx, s);
    const a = await participant(ctx, s, 'Ann');
    await act(p, { type: 'start' });
    await answer(a.client, { optionId: 'b' });
    await act(p, { type: 'close' });
    await cmd(p, { cmd: 'runAgain', scoring: 'practice' });
    await a.client.emit('qa:ask', { text: 'Restart-proof question?', anonymous: false });
    await a.client.emit('pulse', { value: 'unsure' });
    await p.until((x) => (x as PresenterSnapshot).run?.number === 2 && x.pulse?.unsure === 1 && (x as PresenterSnapshot).allQuestions.length === 1);
    [p, a.client].forEach((c) => c.disconnect());
    // a second app on the same database = the server came back after a crash
    const { createApp } = await import('../src/app');
    const again = createApp({ prisma: ctx.prisma, config: ctx.config });
    await again.sessions.recover();
    const snaps = await again.sessions.buildSnapshots(s.id, new Set());
    expect(snaps.presenter.run).toMatchObject({ number: 2, count: 2 });
    expect(snaps.presenter.allQuestions[0].text).toBe('Restart-proof question?');
    expect(snaps.presenter.pulse).toMatchObject({ unsure: 1 });
    expect(snaps.presenter.state.phase).toBe('open');
    again.sessions.shutdown();
  });
});
