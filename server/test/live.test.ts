import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ParticipantSnapshot, PresenterSnapshot, ProjectorSnapshot } from '@classinteract/shared';
import { Client, cloud, createTestContext, doc, joinSession, participant, presenterClient, projectorClient, quiz, sleep, type TestContext } from './helpers';

let ctx: TestContext;
beforeAll(async () => { ctx = await createTestContext(); });
afterAll(async () => { await ctx.close(); });

const act = (c: Client, action: Record<string, unknown>) => c.emit('presenter', { cmd: 'action', action });

describe('authorization', () => {
  it('rejects presenter/projector handshakes without the right secret; a PIN grants nothing', async () => {
    const s = await ctx.startSession(doc([quiz()]));
    const bad = (auth: Record<string, string>) => new Client(ctx.url, auth).connect();
    await expect(bad({ role: 'presenter', sessionId: s.id, token: 'nope' })).rejects.toThrow(/UNAUTHORIZED/);
    await expect(bad({ role: 'presenter', sessionId: s.id, token: s.pin })).rejects.toThrow(/UNAUTHORIZED/);
    await expect(bad({ role: 'projector', sessionId: s.id, key: 'nope' })).rejects.toThrow(/UNAUTHORIZED/);
    await expect(bad({ role: 'presenter', sessionId: 'missing', token: s.presenterToken })).rejects.toThrow(/NOT_FOUND/);
    await expect(bad({ role: 'participant', sessionId: s.id, token: 'forged' })).rejects.toThrow(/UNAUTHORIZED/);
    // a presenter token for one session does not work on another
    const other = await ctx.startSession(doc([quiz()]));
    await expect(bad({ role: 'presenter', sessionId: other.id, token: s.presenterToken })).rejects.toThrow(/UNAUTHORIZED/);
  });

  it('participants and projectors cannot send presenter commands', async () => {
    const s = await ctx.startSession(doc([quiz()]));
    const { client } = await participant(ctx, s, 'Mallory');
    const projector = await projectorClient(ctx, s);
    for (const c of [client, projector]) {
      const r = await act(c, { type: 'start' });
      expect(r).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    }
    const p = await presenterClient(ctx, s);
    expect((await p.until(() => true)).state.phase).toBe('lobby');
    [client, projector, p].forEach((c) => c.disconnect());
  });

  it("participants cannot see presenter data or other participants' answers", async () => {
    const s = await ctx.startSession(doc([quiz({ id: 'q1' })]));
    const a = await participant(ctx, s, 'Ann');
    const b = await participant(ctx, s, 'Bo');
    const p = await presenterClient(ctx, s);
    await act(p, { type: 'start' });
    await a.client.until((x) => x.state.phase === 'open');
    const activityId = (a.client.last as ParticipantSnapshot).activity!.id;
    expect(await a.client.emit('submit', { activityId, payload: { optionId: 'a' } })).toMatchObject({ ok: true });
    await sleep(250);
    const bSnap = b.client.last as ParticipantSnapshot;
    expect(bSnap.me.submissions).toHaveLength(0);
    expect(JSON.stringify(bSnap)).not.toContain('PRIVATE-NOTES');
    expect(bSnap).not.toHaveProperty('participants');
    expect(bSnap).not.toHaveProperty('moderation');
    [a.client, b.client, p].forEach((c) => c.disconnect());
  });
});

describe('quiz flow with multiple synchronised clients', () => {
  it('runs open → submit → reveal with consistent views and no answer leaks', async () => {
    const s = await ctx.startSession(doc([quiz({ id: 'q1', timeLimitSec: 30, speedBonus: true }), cloud()]));
    const p = await presenterClient(ctx, s);
    const proj = await projectorClient(ctx, s);
    const ann = await participant(ctx, s, 'Ann');
    const bo = await participant(ctx, s, 'Bo');
    const cy = await participant(ctx, s, 'Cy');

    // lobby: everyone sees the same roster count
    await proj.until((x) => x.counts.participants === 3);
    expect((await proj.until((x) => x.state.phase === 'lobby')).recentNames).toEqual(expect.arrayContaining(['Ann', 'Bo', 'Cy']));

    expect(await act(p, { type: 'start' })).toMatchObject({ ok: true });
    for (const c of [proj, ann.client, bo.client, cy.client]) await c.until((x) => x.state.phase === 'open');
    const q = (proj.last as ProjectorSnapshot).activity!;
    // the projector and participants never receive the correct answer or private notes before reveal
    expect(q.config).toMatchObject({ correctOptionId: '', explanation: '', notes: '' });
    expect(JSON.stringify(proj.last)).not.toMatch(/PRIVATE-NOTES|EXPLAIN-B/);
    expect(JSON.stringify(ann.client.last)).not.toMatch(/PRIVATE-NOTES|EXPLAIN-B/);
    // ...while the presenter has everything
    expect((await p.until((x) => x.state.phase === 'open') as PresenterSnapshot).fullConfig).toMatchObject({ correctOptionId: 'b', notes: 'PRIVATE-NOTES' });
    // quiz distribution stays hidden from the audience while open
    expect((proj.last as ProjectorSnapshot).results).toBeNull();

    expect(await ann.client.emit('submit', { activityId: q.id, payload: { optionId: 'b' } })).toMatchObject({ ok: true });
    expect(await bo.client.emit('submit', { activityId: q.id, payload: { optionId: 'a' } })).toMatchObject({ ok: true });
    // duplicate submission is rejected, and the first answer stands
    expect(await ann.client.emit('submit', { activityId: q.id, payload: { optionId: 'a' } })).toMatchObject({ ok: false, code: 'DUPLICATE' });

    const live = (await p.until((x) => x.counts.respondents === 2)) as PresenterSnapshot;
    expect(live.results).toMatchObject({ type: 'quiz', total: 2, counts: { a: 1, b: 1, c: 0 } });
    await proj.until((x) => x.counts.responses === 2);

    // reveal the answer: results + correct answer + feedback flow to every audience
    expect(await act(p, { type: 'revealCorrect' })).toMatchObject({ ok: true });
    const pr = (await proj.until((x) => x.state.correctVisible)) as ProjectorSnapshot;
    expect(pr.state.phase).toBe('revealed');
    expect(pr.activity!.config).toMatchObject({ correctOptionId: 'b', explanation: 'EXPLAIN-B' });
    expect(pr.results).toMatchObject({ total: 2, counts: { b: 1 } });
    const annSnap = (await ann.client.until((x) => x.state.correctVisible)) as ParticipantSnapshot;
    const boSnap = (await bo.client.until((x) => x.state.correctVisible)) as ParticipantSnapshot;
    expect(annSnap.me.submissions[0]).toMatchObject({ correct: true });
    expect(annSnap.me.submissions[0].score).toBeGreaterThan(500);
    expect(boSnap.me.submissions[0]).toMatchObject({ correct: false, score: 0 });
    const cySnap = (await cy.client.until((x) => x.state.correctVisible)) as ParticipantSnapshot;
    expect(cySnap.me.submissions).toHaveLength(0); // did not answer

    // late answers after the reveal are refused
    expect(await cy.client.emit('submit', { activityId: q.id, payload: { optionId: 'b' } })).toMatchObject({ ok: false, code: 'NOT_ACCEPTING' });

    // leaderboard
    await act(p, { type: 'showLeaderboard' });
    const lb = (await proj.until((x) => !!x.leaderboard)) as ProjectorSnapshot;
    expect(lb.leaderboard![0]).toMatchObject({ name: 'Ann', rank: 1 });
    const annLb = (await ann.client.until((x) => !!x.leaderboard)) as ParticipantSnapshot;
    expect(annLb.me.standing).toMatchObject({ rank: 1 });

    [p, proj, ann.client, bo.client, cy.client].forEach((c) => c.disconnect());
  });

  it('only accepts submissions while the activity is open and for the current activity', async () => {
    const s = await ctx.startSession(doc([quiz({ id: 'q1', autoOpen: false }), quiz({ id: 'q2', autoOpen: false })]));
    const p = await presenterClient(ctx, s);
    const a = await participant(ctx, s, 'Ann');
    await act(p, { type: 'start' });
    await a.client.until((x) => x.state.phase === 'ready');
    const first = (a.client.last as ParticipantSnapshot).activity!.id;
    expect(await a.client.emit('submit', { activityId: first, payload: { optionId: 'a' } })).toMatchObject({ ok: false, code: 'NOT_ACCEPTING' });
    await act(p, { type: 'open' });
    await a.client.until((x) => x.state.phase === 'open');
    expect(await a.client.emit('submit', { activityId: 'bogus', payload: { optionId: 'a' } })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await a.client.emit('submit', { activityId: first, payload: { optionId: 'zzz' } })).toMatchObject({ ok: false, code: 'INVALID' });
    expect(await a.client.emit('submit', { activityId: first, payload: { optionId: 'a' } })).toMatchObject({ ok: true });
    await act(p, { type: 'close' });
    await a.client.until((x) => x.state.phase === 'closed');
    // reopen then try a second answer
    await act(p, { type: 'open' });
    expect(await a.client.emit('submit', { activityId: first, payload: { optionId: 'b' } })).toMatchObject({ ok: false, code: 'DUPLICATE' });
    // an activity that is not on screen is refused
    const second = (await ctx.prisma.sessionActivity.findFirst({ where: { sessionId: s.id, key: 'q2' } }))!.id;
    expect(await a.client.emit('submit', { activityId: second, payload: { optionId: 'a' } })).toMatchObject({ ok: false, code: 'NOT_ACCEPTING' });
    [p, a.client].forEach((c) => c.disconnect());
  });

  it('the database constraint makes concurrent duplicate submissions impossible', async () => {
    const s = await ctx.startSession(doc([quiz()]));
    const p = await presenterClient(ctx, s);
    const a = await participant(ctx, s, 'Ann');
    await act(p, { type: 'start' });
    const snap = (await a.client.until((x) => x.state.phase === 'open')) as ParticipantSnapshot;
    const results = await Promise.all(Array.from({ length: 6 }, () => a.client.emit('submit', { activityId: snap.activity!.id, payload: { optionId: 'a' } })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await ctx.prisma.submission.count({ where: { sessionId: s.id } })).toBe(1);
    [p, a.client].forEach((c) => c.disconnect());
  });

  it('auto-closes responses when the countdown ends', async () => {
    const s = await ctx.startSession(doc([quiz({ timeLimitSec: 5 })]));
    const p = await presenterClient(ctx, s);
    const a = await participant(ctx, s, 'Ann');
    await act(p, { type: 'start' });
    const open = (await a.client.until((x) => x.state.phase === 'open')) as ParticipantSnapshot;
    expect(open.state.deadlineAt! - open.serverNow).toBeGreaterThan(3500);
    const closed = await a.client.until((x) => x.state.phase === 'closed', 8000);
    expect(closed.state.deadlineAt).toBeNull();
    expect(await a.client.emit('submit', { activityId: open.activity!.id, payload: { optionId: 'a' } })).toMatchObject({ ok: false, code: 'NOT_ACCEPTING' });
    [p, a.client].forEach((c) => c.disconnect());
  }, 15000);
});

describe('waiting room', () => {
  it('keeps the headcount on phones current while they wait (lobby and standby)', async () => {
    const s = await ctx.startSession(doc([cloud()]), { mode: 'companion' });
    const p = await presenterClient(ctx, s);
    const a = await participant(ctx, s, 'Ann');
    await a.client.until((x) => x.counts.participants === 1);
    const b = await participant(ctx, s, 'Bo');
    // Ann never did anything, yet her screen learns that Bo arrived
    expect((await a.client.until((x) => x.counts.participants === 2)).counts.participants).toBe(2);
    await act(p, { type: 'goto', index: 0 });
    await act(p, { type: 'standby' });
    await a.client.until((x) => x.state.phase === 'standby');
    const c = await participant(ctx, s, 'Cy');
    expect((await a.client.until((x) => x.counts.participants === 3)).counts.participants).toBe(3);
    // ...and when someone leaves, they are not counted as gone from the roster, only offline
    b.client.disconnect();
    await p.until((x) => x.counts.online === 2);
    [p, a.client, c.client].forEach((x) => x.disconnect());
  });
});

describe('reconnection', () => {
  it('a refreshed participant keeps their identity, answer and current view', async () => {
    const s = await ctx.startSession(doc([quiz()]));
    const p = await presenterClient(ctx, s);
    const first = await participant(ctx, s, 'Ann');
    await act(p, { type: 'start' });
    const snap = (await first.client.until((x) => x.state.phase === 'open')) as ParticipantSnapshot;
    await first.client.emit('submit', { activityId: snap.activity!.id, payload: { optionId: 'a' } });

    first.client.disconnect(); // "refresh"
    await p.until((x) => x.counts.online === 0);

    // the browser rejoins with its stored token: same participant, no duplicate
    const again = await joinSession(ctx, s.pin, 'Ann', first.join.token);
    expect(again).toMatchObject({ status: 200, resumed: true, participantId: first.join.participantId });
    const back = await new Client(ctx.url, { role: 'participant', sessionId: s.id, token: first.join.token }).connect();
    const restored = (await back.until((x) => x.state.phase === 'open')) as ParticipantSnapshot;
    expect(restored.me.id).toBe(first.join.participantId);
    expect(restored.me.submissions).toHaveLength(1); // the UI shows "answered" instead of offering a second submit
    expect(await back.emit('submit', { activityId: restored.activity!.id, payload: { optionId: 'b' } })).toMatchObject({ ok: false, code: 'DUPLICATE' });
    expect(await ctx.prisma.participant.count({ where: { sessionId: s.id } })).toBe(1);
    await p.until((x) => x.counts.online === 1);

    // a stranger cannot take the name, and a missed update is repaired by the next connection's snapshot
    expect(await joinSession(ctx, s.pin, 'ann')).toMatchObject({ status: 409, code: 'NAME_TAKEN' });
    back.disconnect();
    await act(p, { type: 'close' });
    const late = await new Client(ctx.url, { role: 'participant', sessionId: s.id, token: first.join.token }).connect();
    expect((await late.until((x) => x.state.phase === 'closed')).state.phase).toBe('closed');
    [p, late].forEach((c) => c.disconnect());
  });

  it('a reconnecting projector and presenter get the full current snapshot', async () => {
    const s = await ctx.startSession(doc([cloud({ liveResults: true })]));
    const p = await presenterClient(ctx, s);
    const a = await participant(ctx, s, 'Ann');
    await act(p, { type: 'start' });
    const snap = (await a.client.until((x) => x.state.phase === 'open')) as ParticipantSnapshot;
    await a.client.emit('submit', { activityId: snap.activity!.id, payload: { text: 'Savoury' } });
    const proj = await projectorClient(ctx, s); // connects late
    const view = (await proj.until((x) => x.state.phase === 'open' && !!x.results)) as ProjectorSnapshot;
    expect(view.results).toMatchObject({ type: 'wordcloud', terms: [{ label: 'Savoury', count: 1 }] });
    [p, a.client, proj].forEach((c) => c.disconnect());
  });
});

describe('word cloud', () => {
  it('groups duplicates, enforces limits, and respects moderation', async () => {
    const s = await ctx.startSession(doc([cloud({ maxSubmissions: 2, moderation: 'off' })]));
    const p = await presenterClient(ctx, s);
    const proj = await projectorClient(ctx, s);
    const a = await participant(ctx, s, 'Ann');
    const b = await participant(ctx, s, 'Bo');
    await act(p, { type: 'start' });
    const id = ((await a.client.until((x) => x.state.phase === 'open')) as ParticipantSnapshot).activity!.id;

    expect(await a.client.emit('submit', { activityId: id, payload: { text: 'Savoury' } })).toMatchObject({ ok: true });
    expect(await a.client.emit('submit', { activityId: id, payload: { text: ' savoury! ' } })).toMatchObject({ ok: false, code: 'DUPLICATE' }); // same term, same person
    expect(await b.client.emit('submit', { activityId: id, payload: { text: 'SAVOURY' } })).toMatchObject({ ok: true });
    expect(await b.client.emit('submit', { activityId: id, payload: { text: 'slightly sweet' } })).toMatchObject({ ok: true });
    expect(await b.client.emit('submit', { activityId: id, payload: { text: 'third one' } })).toMatchObject({ ok: false, code: 'LIMIT_REACHED' });
    expect(await a.client.emit('submit', { activityId: id, payload: { text: '   ' } })).toMatchObject({ ok: false, code: 'INVALID' });

    const view = (await proj.until((x) => (x.results as any)?.total === 3)) as ProjectorSnapshot;
    expect((view.results as any).terms.map((t: any) => [t.key, t.count])).toEqual([['savoury', 2], ['slightly sweet', 1]]);

    // presenter hides a term; every audience updates
    expect(await p.emit('presenter', { cmd: 'moderate', status: 'hidden', key: 'savoury' })).toMatchObject({ ok: true });
    const after = (await proj.until((x) => (x.results as any)?.total === 1)) as ProjectorSnapshot;
    expect((after.results as any).terms.map((t: any) => t.key)).toEqual(['slightly sweet']);
    [p, proj, a.client, b.client].forEach((c) => c.disconnect());
  });

  it('holds premoderated responses back from the projector until approved', async () => {
    const s = await ctx.startSession(doc([{ id: 'o', type: 'open', question: 'Thoughts?', moderation: 'premoderate' }]));
    const p = await presenterClient(ctx, s);
    const proj = await projectorClient(ctx, s);
    const a = await participant(ctx, s, 'Ann');
    await act(p, { type: 'start' });
    const snap = (await a.client.until((x) => x.state.phase === 'open')) as ParticipantSnapshot;
    const r = (await a.client.emit('submit', { activityId: snap.activity!.id, payload: { text: 'Hello class' } })) as any;
    expect(r.submission.status).toBe('pending');

    const queue = (await p.until((x) => (x as PresenterSnapshot).moderation.length === 1)) as PresenterSnapshot;
    expect(queue.moderation[0]).toMatchObject({ text: 'Hello class', status: 'pending', participantName: 'Ann' });
    expect((proj.last as ProjectorSnapshot).results ? ((proj.last as any).results.items as unknown[]).length : 0).toBe(0);

    await p.emit('presenter', { cmd: 'moderate', status: 'visible', ids: [queue.moderation[0].id] });
    const shown = (await proj.until((x) => ((x.results as any)?.items?.length ?? 0) === 1)) as ProjectorSnapshot;
    expect((shown.results as any).items[0].text).toBe('Hello class');
    [p, proj, a.client].forEach((c) => c.disconnect());
  });

  it('blocks profane responses and names', async () => {
    const s = await ctx.startSession(doc([cloud()]));
    const p = await presenterClient(ctx, s);
    const a = await participant(ctx, s, 'Ann');
    await act(p, { type: 'start' });
    const id = ((await a.client.until((x) => x.state.phase === 'open')) as ParticipantSnapshot).activity!.id;
    expect(await a.client.emit('submit', { activityId: id, payload: { text: 'what the ' + 'f' + 'uck' } })).toMatchObject({ ok: false, code: 'MODERATED' });
    expect(await joinSession(ctx, s.pin, 'sh' + 'it' + 'head')).toMatchObject({ status: 400, code: 'MODERATED' });
    [p, a.client].forEach((c) => c.disconnect());
  });
});

describe('Companion Mode', () => {
  it('launches activities directly, in any order, with standby between them and results retained', async () => {
    const s = await ctx.startSession(doc([{ id: 'intro', type: 'content', title: 'Slide' }, quiz({ id: 'q1' }), cloud({ id: 'wc' }), { id: 'rate', type: 'rating', question: 'Rate?' }]), { mode: 'companion' });
    const p = await presenterClient(ctx, s);
    const proj = await projectorClient(ctx, s);
    const a = await participant(ctx, s, 'Ann');
    expect((p.last as PresenterSnapshot).session.mode).toBe('companion');

    // launch the third activity straight from the lobby
    expect(await act(p, { type: 'goto', index: 2 })).toMatchObject({ ok: true });
    const open = (await a.client.until((x) => x.state.phase === 'open')) as ParticipantSnapshot;
    expect(open.activity!.type).toBe('wordcloud');
    expect(await a.client.emit('submit', { activityId: open.activity!.id, payload: { text: 'umami' } })).toMatchObject({ ok: true });

    // presenter goes to the external slide deck: participants and projector see standby, same connection
    expect(await act(p, { type: 'standby' })).toMatchObject({ ok: true });
    const standbyA = (await a.client.until((x) => x.state.phase === 'standby')) as ParticipantSnapshot;
    const standbyP = (await proj.until((x) => x.state.phase === 'standby')) as ProjectorSnapshot;
    expect(standbyA.activity).toBeNull();
    expect(standbyP.activity).toBeNull();
    expect(standbyP.session.pin).toBe(s.pin);
    expect(await a.client.emit('submit', { activityId: open.activity!.id, payload: { text: 'late' } })).toMatchObject({ ok: false, code: 'NOT_ACCEPTING' });

    // later: launch a different activity, then return to the earlier one — results are still there, no reopening
    await act(p, { type: 'goto', index: 1 });
    await a.client.until((x) => x.state.phase === 'open' && x.activity?.type === 'quiz');
    await act(p, { type: 'goto', index: 2 });
    const back = (await proj.until((x) => x.state.phase === 'completed' && x.activity?.type === 'wordcloud')) as ProjectorSnapshot;
    expect(back.results).toMatchObject({ type: 'wordcloud', total: 1, terms: [{ key: 'umami', count: 1 }] });
    expect(back.state.openedAt).toBeNull();

    // the participant never rejoined: same token, same connection throughout
    expect(await ctx.prisma.participant.count({ where: { sessionId: s.id } })).toBe(1);
    [p, proj, a.client].forEach((c) => c.disconnect());
  });

  it('keeps the session alive on standby and standalone controls still work from it', async () => {
    const s = await ctx.startSession(doc([cloud({ id: 'one' }), cloud({ id: 'two' })]), { mode: 'companion' });
    const p = await presenterClient(ctx, s);
    await act(p, { type: 'goto', index: 0 });
    await act(p, { type: 'standby' });
    await act(p, { type: 'next' });
    expect((await p.until((x) => x.state.activityIndex === 1)).state.phase).toBe('open');
    expect(await p.emit('presenter', { cmd: 'setMode', mode: 'standalone' })).toMatchObject({ ok: true });
    expect((await p.until((x) => x.session.mode === 'standalone')).session.mode).toBe('standalone');
    p.disconnect();
  });
});

describe('presenter controls & errors', () => {
  it('rejects illegal transitions with clear errors', async () => {
    const s = await ctx.startSession(doc([{ id: 'slide', type: 'content', title: 'Hi' }, quiz()]));
    const p = await presenterClient(ctx, s);
    expect(await act(p, { type: 'open' })).toMatchObject({ ok: false, code: 'NOT_STARTED' });
    await act(p, { type: 'start' });
    expect(await act(p, { type: 'open' })).toMatchObject({ ok: false, code: 'NOT_INTERACTIVE' });
    expect(await act(p, { type: 'goto', index: 9 })).toMatchObject({ ok: false, code: 'INVALID_INDEX' });
    expect(await p.emit('presenter', { cmd: 'action', action: { type: 'selfDestruct' } })).toMatchObject({ ok: false, code: 'INVALID' });
    await act(p, { type: 'next' });
    expect(await act(p, { type: 'next' })).toMatchObject({ ok: false, code: 'AT_LAST' });
    p.disconnect();
  });

  it('can remove a participant, who is disconnected and cannot return', async () => {
    const s = await ctx.startSession(doc([cloud()]));
    const p = await presenterClient(ctx, s);
    const a = await participant(ctx, s, 'Ann');
    await p.until((x) => x.counts.participants === 1);
    expect(await p.emit('presenter', { cmd: 'kick', participantId: a.join.participantId })).toMatchObject({ ok: true });
    await sleep(200);
    expect(a.client.removed).toBe(true);
    expect(await joinSession(ctx, s.pin, 'Ann', a.join.token)).toMatchObject({ status: 403, code: 'REMOVED' });
    await p.until((x) => x.counts.participants === 0);
    p.disconnect();
  });

  it('generates names when names are disabled, and enforces unique names when enabled', async () => {
    const anon = await ctx.startSession(doc([cloud()]), { collectNames: false });
    const j1 = await joinSession(ctx, anon.pin);
    const j2 = await joinSession(ctx, anon.pin);
    expect(j1.name).toBeTruthy();
    expect(j1.name).not.toBe(j2.name);
    const named = await ctx.startSession(doc([cloud()]));
    expect((await joinSession(ctx, named.pin, '')).status).toBe(400);
    expect((await joinSession(ctx, named.pin, 'x'.repeat(40))).status).toBe(400);
    expect((await joinSession(ctx, named.pin, 'Ann')).status).toBe(200);
    expect((await joinSession(ctx, named.pin, 'ANN ')).status).toBe(409);
  });
});

describe('ending a session', () => {
  it('ends the session, keeps results and CSV available, and refuses further activity', async () => {
    const s = await ctx.startSession(doc([quiz({ id: 'q1' }), { id: 'poll', type: 'poll', question: 'Anon?', anonymous: true, options: [{ text: 'Yes' }, { text: 'No' }] }]));
    const p = await presenterClient(ctx, s);
    const proj = await projectorClient(ctx, s);
    const a = await participant(ctx, s, 'Ann');
    const b = await participant(ctx, s, 'Bo');
    await act(p, { type: 'start' });
    let snap = (await a.client.until((x) => x.state.phase === 'open')) as ParticipantSnapshot;
    await a.client.emit('submit', { activityId: snap.activity!.id, payload: { optionId: 'b' } });
    await b.client.emit('submit', { activityId: snap.activity!.id, payload: { optionId: 'c' } });
    await act(p, { type: 'revealCorrect' });
    await act(p, { type: 'next' });
    snap = (await a.client.until((x) => x.activity?.type === 'poll' && x.state.phase === 'open')) as ParticipantSnapshot;
    await a.client.emit('submit', { activityId: snap.activity!.id, payload: { optionIds: ['o1'] } });

    expect(await act(p, { type: 'end' })).toMatchObject({ ok: true });
    const ended = (await proj.until((x) => x.state.phase === 'ended')) as ProjectorSnapshot;
    expect(ended.session.status).toBe('ended');
    expect(ended.leaderboard?.[0]).toMatchObject({ name: 'Ann' }); // final standings
    expect(await a.client.emit('submit', { activityId: snap.activity!.id, payload: { optionIds: ['o2'] } })).toMatchObject({ ok: false });
    expect(await act(p, { type: 'next' })).toMatchObject({ ok: false, code: 'SESSION_ENDED' });
    expect((await ctx.api(`/api/join/${s.pin}`)).body).toMatchObject({ status: 'ended' });
    expect((await ctx.api('/api/join', { body: { pin: s.pin, name: 'Late' } })).status).toBe(404);

    const res = await ctx.api(`/api/studio/sessions/${s.id}/results`);
    expect(res.status).toBe(200);
    expect(res.body.session.status).toBe('ended');
    expect(res.body.activities).toHaveLength(2);
    expect(res.body.activities[0].results).toMatchObject({ type: 'quiz', total: 2, counts: { b: 1, c: 1 } });
    expect(res.body.activities[1].results).toMatchObject({ type: 'poll', total: 1 });
    expect(res.body.standings[0]).toMatchObject({ name: 'Ann', rank: 1 });

    const csv = await ctx.api(`/api/studio/sessions/${s.id}/export.csv`);
    expect(csv.status).toBe(200);
    const lines = csv.text.replace(/^﻿/, '').trim().split('\r\n');
    expect(lines[0]).toBe('slide_number,slide_type,slide_title,question,participant,submitted_at,response,correct,score,response_time_s,moderation_status');
    expect(lines).toHaveLength(4);
    expect(lines.some((l) => l.includes('Ann') && l.includes(',B,yes,'))).toBe(true);
    expect(lines.some((l) => l.includes('(anonymous)') && l.includes(',Yes,'))).toBe(true); // anonymous poll hides the name
    expect(csv.text).not.toMatch(/,Ann,.*Anon\?/);

    // a fresh connection after the end still gets the final snapshot; deleting the presentation keeps results
    await ctx.api(`/api/studio/presentations/${s.presentationId}`, { method: 'DELETE' });
    expect((await ctx.api(`/api/studio/sessions/${s.id}/results`)).body.activities).toHaveLength(2);
    [p, proj, a.client, b.client].forEach((c) => c.disconnect());
  });

  it('refuses to delete a live session but deletes an ended one', async () => {
    const s = await ctx.startSession(doc([cloud()]));
    expect((await ctx.api(`/api/studio/sessions/${s.id}`, { method: 'DELETE' })).status).toBe(409);
    const p = await presenterClient(ctx, s);
    await act(p, { type: 'start' });
    await act(p, { type: 'end' });
    expect((await ctx.api(`/api/studio/sessions/${s.id}`, { method: 'DELETE' })).status).toBe(204);
    p.disconnect();
  });
});

describe('survey activity', () => {
  it('collects a multi-question survey as one submission and aggregates per question', async () => {
    const survey = {
      id: 'sv', type: 'survey', title: 'Feedback',
      questions: [
        { id: 'r', kind: 'rating', question: 'Rate', min: 1, max: 5, required: true },
        { id: 'c', kind: 'choice', question: 'Pick', options: [{ id: 'x', text: 'X' }, { id: 'y', text: 'Y' }], required: true },
        { id: 't', kind: 'text', question: 'Say', mode: 'short' },
      ],
    };
    const s = await ctx.startSession(doc([survey]), { mode: 'companion' });
    const p = await presenterClient(ctx, s);
    const proj = await projectorClient(ctx, s);
    const a = await participant(ctx, s, 'Ann');
    const b = await participant(ctx, s, 'Bo');
    await act(p, { type: 'goto', index: 0 });
    const id = ((await a.client.until((x) => x.state.phase === 'open')) as ParticipantSnapshot).activity!.id;
    expect(await a.client.emit('submit', { activityId: id, payload: { answers: { r: { value: 4 } } } })).toMatchObject({ ok: false, code: 'INVALID' }); // missing required choice
    expect(await a.client.emit('submit', { activityId: id, payload: { answers: { r: { value: 4 }, c: { optionIds: ['x'] }, t: { text: 'nice' } } } })).toMatchObject({ ok: true });
    expect(await b.client.emit('submit', { activityId: id, payload: { answers: { r: { value: 2 }, c: { optionIds: ['y'] } } } })).toMatchObject({ ok: true });
    expect(await b.client.emit('submit', { activityId: id, payload: { answers: { r: { value: 2 }, c: { optionIds: ['y'] } } } })).toMatchObject({ ok: false, code: 'DUPLICATE' });

    const pres = (await p.until((x) => x.counts.respondents === 2)) as PresenterSnapshot;
    expect((pres.results as any).questions.r).toMatchObject({ total: 2, average: 3 });
    expect((pres.results as any).questions.t.items).toHaveLength(1); // presenter sees free text
    await act(p, { type: 'revealResults' });
    const pub = (await proj.until((x) => !!x.results)) as ProjectorSnapshot;
    expect((pub.results as any).questions.c.counts).toEqual({ x: 1, y: 1 });
    expect((pub.results as any).questions.t.items).toHaveLength(0); // never projected
    [p, proj, a.client, b.client].forEach((c) => c.disconnect());
  });
});
