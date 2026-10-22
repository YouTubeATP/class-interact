import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ParticipantSnapshot, PresenterSnapshot } from '@classinteract/shared';
import { createApp } from '../src/app';
import { Client, createTestContext, doc, joinSession, presenterClient, quiz, sleep, type TestContext } from './helpers';

/**
 * "Will it hold up in a real lesson?" Scenarios a classroom actually produces: a whole room answering in the same
 * second, a double tap, a phone that locks and comes back, a laptop that restarts mid-quiz. None of these may corrupt a
 * session, lose or double-count an answer, or surface an internal error.
 */

let ctx: TestContext;
beforeAll(async () => { ctx = await createTestContext(); });
afterAll(async () => { await ctx.close(); });

const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
afterEach(() => { expect(errors, 'the server logged an unexpected error').not.toHaveBeenCalled(); errors.mockClear(); });

const act = (c: Client, action: Record<string, unknown>) => c.emit('presenter', { cmd: 'action', action });
const activityId = (c: Client) => (c.last as ParticipantSnapshot).activity!.id;
const count = (p: Client) => (p.last as PresenterSnapshot).counts.respondents;

async function room(c: TestContext, session: { id: string; pin: string }, n: number) {
  const joins = await Promise.all(Array.from({ length: n }, () => joinSession(c, session.pin)));
  joins.forEach((j) => expect(j.status).toBe(200));
  return Promise.all(joins.map((j) => new Client(c.url, { role: 'participant', sessionId: session.id, token: j.token }).connect()));
}

describe('a whole class at once', () => {
  it('30 phones join together, answer in the same instant, and every answer is counted exactly once', async () => {
    const s = await ctx.startSession(doc([quiz({ id: 'q1', timeLimitSec: 30, speedBonus: true })]), { collectNames: false });
    const phones = await room(ctx, s, 30);
    const p = await presenterClient(ctx, s);
    await p.until((x) => (x as PresenterSnapshot).counts.participants === 30);

    await act(p, { type: 'start' });
    await Promise.all(phones.map((c) => c.until((x) => x.state.phase === 'open')));

    const acks = await Promise.all(phones.map((c, i) => c.emit('submit', { activityId: activityId(c), payload: { optionId: i % 3 === 0 ? 'b' : 'a' } })));
    expect(acks.filter((a) => a.ok)).toHaveLength(30);
    await p.until((x) => (x as PresenterSnapshot).counts.respondents === 30);

    const rows = await ctx.prisma.submission.findMany({ where: { sessionId: s.id } });
    expect(rows).toHaveLength(30);
    expect(new Set(rows.map((r) => r.participantId)).size).toBe(30);

    // everyone converges on the same picture after close + reveal
    await act(p, { type: 'close' });
    await act(p, { type: 'revealCorrect' });
    const snaps = await Promise.all(phones.map((c) => c.until((x) => x.state.phase === 'revealed' || x.state.correctVisible === true)));
    expect(snaps).toHaveLength(30);
    expect(rows.filter((r) => r.correct).length).toBe(10);
    [p, ...phones].forEach((c) => c.disconnect());
  });

  it('a double tap (many identical submits at once) records one answer', async () => {
    const s = await ctx.startSession(doc([quiz({ id: 'q1' })]), { collectNames: false });
    const [phone] = await room(ctx, s, 1);
    const p = await presenterClient(ctx, s);
    await act(p, { type: 'start' });
    await phone.until((x) => x.state.phase === 'open');
    const acks = await Promise.all(Array.from({ length: 8 }, () => phone.emit('submit', { activityId: activityId(phone), payload: { optionId: 'b' } })));
    expect(acks.filter((a) => a.ok)).toHaveLength(1);
    for (const a of acks.filter((x) => !x.ok)) expect(a).toMatchObject({ ok: false, code: 'DUPLICATE' });
    expect(await ctx.prisma.submission.count({ where: { sessionId: s.id } })).toBe(1);
    [p, phone].forEach((c) => c.disconnect());
  });

  it('jabbing the presenter controls (two dashboards, repeated taps) never corrupts the session', async () => {
    const slides = Array.from({ length: 6 }, (_, i) => quiz({ id: `q${i}` }));
    const s = await ctx.startSession(doc(slides), { collectNames: false });
    const [phone] = await room(ctx, s, 1);
    // the same presenter on a laptop and on a phone at once
    const laptop = await presenterClient(ctx, s);
    const tablet = await presenterClient(ctx, s);
    await act(laptop, { type: 'start' });

    const burst = await Promise.all([
      ...Array.from({ length: 10 }, () => act(laptop, { type: 'next' })),
      ...Array.from({ length: 5 }, () => act(tablet, { type: 'close' })),
      ...Array.from({ length: 5 }, () => act(tablet, { type: 'next' })),
      ...Array.from({ length: 3 }, () => act(laptop, { type: 'previous' })),
    ]);
    // every command is either applied or politely refused: never an internal error
    for (const r of burst) if (!r.ok) expect((r as { code: string }).code).not.toBe('INTERNAL');

    await sleep(300);
    const snap = laptop.last as PresenterSnapshot;
    expect(snap.state.activityIndex).toBeGreaterThanOrEqual(0);
    expect(snap.state.activityIndex).toBeLessThan(slides.length);
    // all three screens agree
    expect((tablet.last as PresenterSnapshot).state).toEqual(snap.state);
    expect(phone.last!.state.activityIndex).toBe(snap.state.activityIndex);
    expect(phone.last!.state.phase).toBe(snap.state.phase);
    [laptop, tablet, phone].forEach((c) => c.disconnect());
  });

  it('the timer closing a quiz at the same moment the presenter closes it is harmless', async () => {
    const s = await ctx.startSession(doc([quiz({ id: 'q1', timeLimitSec: 5 })]), { collectNames: false });
    const [phone] = await room(ctx, s, 1);
    const p = await presenterClient(ctx, s);
    await act(p, { type: 'start' });
    await phone.until((x) => x.state.phase === 'open');
    await sleep(4940); // right on the deadline
    const racing = await Promise.all([act(p, { type: 'close' }), act(p, { type: 'close' }), act(p, { type: 'revealResults' })]);
    for (const r of racing) if (!r.ok) expect((r as { code: string }).code).not.toBe('INTERNAL');
    await p.until((x) => x.state.phase !== 'open');
    await sleep(200);
    // a late answer is refused cleanly
    expect(await phone.emit('submit', { activityId: activityId(phone), payload: { optionId: 'b' } })).toMatchObject({ ok: false });
    expect(await ctx.prisma.submission.count({ where: { sessionId: s.id } })).toBe(0);
    [p, phone].forEach((c) => c.disconnect());
  });
});

describe('phones come and go', () => {
  it('a phone that locks for a minute rejoins as the same person, keeps its answer, and cannot answer twice', async () => {
    const s = await ctx.startSession(doc([quiz({ id: 'q1', timeLimitSec: 60 })]), { collectNames: false });
    const j = await joinSession(ctx, s.pin);
    const connect = () => new Client(ctx.url, { role: 'participant', sessionId: s.id, token: j.token }).connect();
    const p = await presenterClient(ctx, s);
    let phone = await connect();
    await act(p, { type: 'start' });
    await phone.until((x) => x.state.phase === 'open');
    expect(await phone.emit('submit', { activityId: activityId(phone), payload: { optionId: 'a' } })).toMatchObject({ ok: true });

    phone.disconnect(); // screen locks
    await p.until((x) => (x as PresenterSnapshot).counts.online === 0);
    phone = await connect(); // unlocks: the page reconnects with the saved token
    const back = await phone.until((x) => x.state.phase === 'open') as ParticipantSnapshot;
    expect(back.me.submissions).toHaveLength(1);
    expect(await phone.emit('submit', { activityId: activityId(phone), payload: { optionId: 'b' } })).toMatchObject({ ok: false, code: 'DUPLICATE' });
    expect(count(p)).toBe(1);
    // joining again with the same token resumes the same participant, not a second one
    const again = await joinSession(ctx, s.pin, undefined, j.token);
    expect(again).toMatchObject({ participantId: j.participantId, resumed: true });
    expect(await ctx.prisma.participant.count({ where: { sessionId: s.id } })).toBe(1);
    [p, phone].forEach((c) => c.disconnect());
  });
});

describe('the laptop restarts in the middle of a lesson', () => {
  it('a restarted server picks the session up: same people, same answers, the deadline still applies', async () => {
    const s = await ctx.startSession(doc([quiz({ id: 'q1', timeLimitSec: 5 }), quiz({ id: 'q2' })]), { collectNames: false });
    const joins = await Promise.all(Array.from({ length: 5 }, () => joinSession(ctx, s.pin)));
    const first = await Promise.all(joins.map((j) => new Client(ctx.url, { role: 'participant', sessionId: s.id, token: j.token }).connect()));
    const p1 = await presenterClient(ctx, s);
    await act(p1, { type: 'start' });
    await Promise.all(first.map((c) => c.until((x) => x.state.phase === 'open')));
    // three answer before the "crash"
    for (const c of first.slice(0, 3)) expect(await c.emit('submit', { activityId: activityId(c), payload: { optionId: 'b' } })).toMatchObject({ ok: true });
    [p1, ...first].forEach((c) => c.disconnect());

    // the process dies and comes back on the same database
    await ctx.app.close();
    const app2 = createApp({ prisma: ctx.prisma, config: ctx.config });
    await app2.sessions.recover();
    // same address as before, like a real restart: phones keep using the link they already have
    await new Promise<void>((ok) => app2.server.listen(Number(new URL(ctx.url).port), '127.0.0.1', ok));
    ctx.app = app2; // the harness closes whatever is current
    const url2 = ctx.url;
    {
      // everyone reconnects with the tokens they already hold
      const back = await Promise.all(joins.map((j) => new Client(url2, { role: 'participant', sessionId: s.id, token: j.token }).connect()));
      const pres = await new Client(url2, { role: 'presenter', sessionId: s.id, token: s.presenterToken }).connect();
      await pres.until((x) => (x as PresenterSnapshot).counts.respondents === 3);
      expect((pres.last as PresenterSnapshot).counts.participants).toBe(5);
      // an earlier answerer is still locked in; a late answerer can still answer if time remains
      const early = back[0].last as ParticipantSnapshot;
      expect(early.me.submissions).toHaveLength(1);
      expect(await back[0].emit('submit', { activityId: activityId(back[0]), payload: { optionId: 'a' } })).toMatchObject({ ok: false, code: 'DUPLICATE' });
      // the quiz's deadline was not lost with the old process: it closes on its own
      await pres.until((x) => x.state.phase !== 'open', 9000);
      expect(await back[4].emit('submit', { activityId: activityId(back[4]), payload: { optionId: 'b' } })).toMatchObject({ ok: false });
      expect(await ctx.prisma.submission.count({ where: { sessionId: s.id } })).toBe(3);
      // and the lesson carries on
      expect(await pres.emit('presenter', { cmd: 'action', action: { type: 'next' } })).toMatchObject({ ok: true });
      [pres, ...back].forEach((c) => c.disconnect());
    }
  });
});

describe('bad input never takes the session down', () => {
  it('garbage over the wire is refused politely and the lesson carries on', async () => {
    const s = await ctx.startSession(doc([quiz({ id: 'q1' })]), { collectNames: false });
    const [phone] = await room(ctx, s, 1);
    const p = await presenterClient(ctx, s);
    await act(p, { type: 'start' });
    await phone.until((x) => x.state.phase === 'open');
    const junk: unknown[] = [null, undefined, 42, 'x', [], {}, { activityId: 5 }, { activityId: activityId(phone), payload: null }, { activityId: 'nope', payload: { optionId: 'a' } }, { activityId: activityId(phone), payload: { optionId: { $ne: 1 } } }, { activityId: activityId(phone), payload: { optionId: 'a'.repeat(50_000) } }];
    for (const j of junk) {
      const r = await phone.emit('submit', j);
      expect(r.ok).toBe(false);
      expect((r as { code: string }).code).not.toBe('INTERNAL');
    }
    for (const j of [null, 7, { cmd: 'drop tables' }, { cmd: 'action', action: { type: 'explode' } }]) {
      const r = await p.emit('presenter', j);
      expect(r.ok).toBe(false);
    }
    // still fully working
    expect(await phone.emit('submit', { activityId: activityId(phone), payload: { optionId: 'b' } })).toMatchObject({ ok: true });
    [p, phone].forEach((c) => c.disconnect());
  });

  it('an ordinary HTTP request with a broken body gets a clean error', async () => {
    const r = await fetch(`${ctx.url}/api/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json' });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe('INVALID');
    expect((await ctx.api('/api/join', { body: { pin: 'abc' } })).status).toBe(400);
    expect((await ctx.api('/api/join/12')).status).toBe(400);
    expect((await ctx.api('/api/join/000000')).status).toBe(404);
  });
});
