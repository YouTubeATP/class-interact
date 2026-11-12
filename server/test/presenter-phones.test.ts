import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PresenterSnapshot, SpeakerSnapshot } from '@classinteract/shared';
import { Client, createTestContext, doc, participant, presenterClient, projectorClient, quiz, sleep, type TestContext } from './helpers';

let ctx: TestContext;
beforeAll(async () => { ctx = await createTestContext(); });
afterAll(async () => { await ctx.close(); });

const act = (c: Client, action: Record<string, unknown>, extra: Record<string, unknown> = {}) => c.emit('presenter', { cmd: 'action', action, ...extra });
const S = (c: Client) => c.last as unknown as SpeakerSnapshot;
const P = (c: Client) => c.last as PresenterSnapshot;
const slide = (id: string, presenter?: string, cues?: string[]) => ({ id, type: 'content', title: `Slide ${id}`, notes: `NOTES-${id}`, ...(presenter ? { presenter } : {}), ...(cues ? { cues } : {}) });

const deck = () => doc([
  slide('s1', 'Priya', ['Welcome', 'Why soil matters']),
  slide('s2', 'Priya', ['Erosion data']),
  slide('s3', ' sam ', ['Field trip photos']),
  quiz({ id: 'q4', presenter: 'Sam', cues: ['Wait 10 seconds'] }),
  slide('s5'),
]);

const speaker = (s: { id: string }, token: string, name: string) => new Client(ctx.url, { role: 'delegate', sessionId: s.id, token, name }).connect();

describe('presenter phones', () => {
  it('shares one re-showable QR link, matches names and only reveals your own cues', async () => {
    const s = await ctx.startSession(deck());
    const owner = await presenterClient(ctx, s);
    const link = await ctx.api(`/api/studio/sessions/${s.id}/speaker-link`);
    expect(link.status).toBe(200);
    expect(link.body.roster).toEqual(['Priya', 'sam']);
    expect(link.body.path).toMatch(new RegExp(`^/speak/${s.id}#g=`));
    // shown again, it is the same link: nothing has to be stored to redisplay the QR
    expect((await ctx.api(`/api/studio/sessions/${s.id}/speaker-link`)).body.path).toBe(link.body.path);
    const token = decodeURIComponent(link.body.path.split('#g=')[1]);

    const claim = await ctx.api('/api/delegate/claim', { body: { sessionId: s.id, token } });
    expect(claim.body).toMatchObject({ role: 'speaker', projectorKey: '', roster: ['Priya', 'sam'] });

    // a phone must say who it is
    await expect(new Client(ctx.url, { role: 'delegate', sessionId: s.id, token }).connect()).rejects.toThrow(/NAME_REQUIRED/);

    const priya = await speaker(s, token, 'priya');
    const sam = await speaker(s, token, 'SAM');
    const guest = await speaker(s, token, 'Alex');
    expect(S(priya)).toMatchObject({ role: 'speaker', activityIndex: -1, me: { name: 'priya', matched: true } });
    expect(S(guest).me.matched).toBe(false);
    expect(S(priya).turns).toEqual([{ presenter: 'Priya', from: 0, to: 1 }, { presenter: 'sam', from: 2, to: 3 }]);

    // before the start, the run of show is there for rehearsal, with only your own cues filled in
    expect(S(priya).outline?.map((o) => o.cues)).toEqual([['Welcome', 'Why soil matters'], ['Erosion data'], [], [], []]);
    expect(S(sam).outline?.[3].cues).toEqual(['Wait 10 seconds']);

    // the owner sees who is connected and whether their name matched
    const listed = await owner.until((x) => (x as PresenterSnapshot).speakers.length === 3);
    expect((listed as PresenterSnapshot).speakers.map((x) => [x.name, x.matched]).sort()).toEqual([['Alex', false], ['SAM', true], ['priya', true]]);
    expect((listed as PresenterSnapshot).grants).toEqual([]); // not mixed in with the access links

    // live: current cues for the person presenting only, next slide's title only, no run of show
    expect(await act(owner, { type: 'start' })).toMatchObject({ ok: true });
    await priya.until((x) => (x as unknown as SpeakerSnapshot).activityIndex === 0);
    expect(S(priya).current).toEqual({ title: 'Slide s1', presenter: 'Priya', cues: ['Welcome', 'Why soil matters'] });
    expect(S(priya).next).toEqual({ title: 'Slide s2', presenter: 'Priya' });
    expect(S(priya).outline).toBeNull();
    await sam.until((x) => (x as unknown as SpeakerSnapshot).activityIndex === 0);
    expect(S(sam).current?.cues).toEqual([]);

    // nothing private ever reaches a phone: no speaker notes, answers or explanations
    await act(owner, { type: 'goto', index: 3 });
    await sam.until((x) => (x as unknown as SpeakerSnapshot).activityIndex === 3);
    for (const c of [priya, sam, guest]) {
      const all = JSON.stringify(c.history);
      expect(all).not.toMatch(/NOTES-|PRIVATE-NOTES|EXPLAIN-B|correctOptionId/);
    }
    expect(S(sam).current?.cues).toEqual(['Wait 10 seconds']);
    [owner, priya, sam, guest].forEach((c) => c.disconnect());
  });

  it('lets phones move one slide at a time and nothing else', async () => {
    const s = await ctx.startSession(deck());
    const owner = await presenterClient(ctx, s);
    const token = decodeURIComponent((await ctx.api(`/api/studio/sessions/${s.id}/speaker-link`)).body.path.split('#g=')[1]);
    const priya = await speaker(s, token, 'Priya');

    expect(await act(priya, { type: 'start' })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    await act(owner, { type: 'start' });
    await priya.until((x) => (x as unknown as SpeakerSnapshot).activityIndex === 0);

    expect(await act(priya, { type: 'next' }, { expectVersion: S(priya).version })).toMatchObject({ ok: true });
    await priya.until((x) => (x as unknown as SpeakerSnapshot).activityIndex === 1);
    expect(await act(priya, { type: 'previous' }, { expectVersion: S(priya).version })).toMatchObject({ ok: true });
    await priya.until((x) => (x as unknown as SpeakerSnapshot).activityIndex === 0);

    for (const action of [{ type: 'goto', index: 3 }, { type: 'end' }, { type: 'showOverlay', overlay: 'join' }, { type: 'standby' }]) {
      expect(await act(priya, action)).toMatchObject({ ok: false, code: expect.stringMatching(/FORBIDDEN|INVALID/) });
    }
    for (const body of [{ cmd: 'runAgain' }, { cmd: 'nextPlain' }, { cmd: 'kick', participantId: 'x' }, { cmd: 'features', patch: { projector: {} } }]) {
      expect(await priya.emit('presenter', body)).toMatchObject({ ok: false });
    }

    // two phones pressing Next on the same version: only the first one moves the room
    const sam = await speaker(s, token, 'Sam');
    const v = S(sam).version;
    const [a, b] = await Promise.all([act(priya, { type: 'next' }, { expectVersion: v }), act(sam, { type: 'next' }, { expectVersion: v })]);
    expect([a, b].filter((r) => r.ok)).toHaveLength(1);
    expect([a, b].find((r) => !r.ok)).toMatchObject({ code: 'STALE' });
    [owner, priya, sam].forEach((c) => c.disconnect());
  });

  it('removes one phone, and resetting the QR disconnects them all', async () => {
    const s = await ctx.startSession(deck());
    const owner = await presenterClient(ctx, s);
    const first = (await ctx.api(`/api/studio/sessions/${s.id}/speaker-link`)).body;
    const token = decodeURIComponent(first.path.split('#g=')[1]);
    const priya = await speaker(s, token, 'Priya');
    const sam = await speaker(s, token, 'Sam');

    const listed = (await owner.until((x) => (x as PresenterSnapshot).speakers.length === 2)) as PresenterSnapshot;
    const samId = listed.speakers.find((x) => x.name === 'Sam')!.id;
    // only screens that manage access may remove a phone
    expect(await priya.emit('presenter', { cmd: 'kickSpeaker', id: samId })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await owner.emit('presenter', { cmd: 'kickSpeaker', id: samId })).toMatchObject({ ok: true });
    await sleep(100);
    expect(sam.removed).toBe(true);
    await owner.until((x) => (x as PresenterSnapshot).speakers.length === 1);

    const reset = await ctx.api(`/api/studio/sessions/${s.id}/speaker-link/reset`, { method: 'POST' });
    expect(reset.body.path).not.toBe(first.path);
    await sleep(150);
    expect(priya.socket.connected).toBe(false);
    await expect(speaker(s, token, 'Priya')).rejects.toThrow(/UNAUTHORIZED/);
    const fresh = await speaker(s, decodeURIComponent(reset.body.path.split('#g=')[1]), 'Priya');
    expect(S(fresh).me.matched).toBe(true);
    [owner, fresh].forEach((c) => c.disconnect());
  });

  it('keeps presenter names and cues away from the audience and the projector', async () => {
    const s = await ctx.startSession(deck());
    const owner = await presenterClient(ctx, s);
    const proj = await projectorClient(ctx, s);
    const ann = await participant(ctx, s, 'Ann');
    await act(owner, { type: 'start' });
    await act(owner, { type: 'goto', index: 3 });
    await proj.until((x) => x.state.activityIndex === 3);
    await ann.client.until((x) => x.state.activityIndex === 3);
    for (const c of [proj, ann.client]) expect(JSON.stringify(c.history)).not.toMatch(/Why soil matters|Wait 10 seconds|"presenter":"(Priya|Sam)"|"cues"/);
    // the owner's own screen still has them
    expect((P(owner).fullConfig as any).cues).toEqual(['Wait 10 seconds']);
    [owner, proj, ann.client].forEach((c) => c.disconnect());
  });

  it('opens from a six-digit presenter code, like the projector code', async () => {
    const s = await ctx.startSession(deck());
    const link = (await ctx.api(`/api/studio/sessions/${s.id}/speaker-link`)).body;
    expect(link.code).toMatch(/^\d{6}$/);
    const control = (await ctx.api(`/api/studio/sessions/${s.id}/control`)).body;
    expect(new Set([link.code, s.pin, control.projectorCode]).size).toBe(3); // one join box takes all three, so no clashes
    expect((await ctx.api(`/api/studio/sessions/${s.id}/speaker-link`)).body.code).toBe(link.code); // stable

    // typed with spaces, it gives the same link the QR holds
    const claim = await ctx.api('/api/speaker/claim', { body: { code: `${link.code.slice(0, 3)} ${link.code.slice(3)}` } });
    expect(claim.body).toEqual({ sessionId: s.id, path: link.path });
    // the join PIN and the projector code are not presenter codes
    expect((await ctx.api('/api/speaker/claim', { body: { code: s.pin } })).status).toBe(404);
    expect((await ctx.api('/api/speaker/claim', { body: { code: control.projectorCode } })).status).toBe(404);
    expect((await ctx.api('/api/speaker/claim', { body: { code: '12' } })).status).toBe(400);

    // resetting replaces the code too
    const reset = (await ctx.api(`/api/studio/sessions/${s.id}/speaker-link/reset`, { method: 'POST' })).body;
    expect(reset.code).not.toBe(link.code);
    expect((await ctx.api('/api/speaker/claim', { body: { code: link.code } })).status).toBe(404);
    expect((await ctx.api('/api/speaker/claim', { body: { code: reset.code } })).body.path).toBe(reset.path);

    // and it stops working once the session ends
    const owner = await presenterClient(ctx, s);
    await act(owner, { type: 'end' });
    await owner.until((x) => x.session.status === 'ended');
    expect((await ctx.api('/api/speaker/claim', { body: { code: reset.code } })).status).toBe(404);
    owner.disconnect();
  });
});
