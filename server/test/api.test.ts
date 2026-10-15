import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exportPresentationJson, parsePresentationDoc, type PresentationDoc } from '@classinteract/shared';
import { csvCell } from '../src/services/reports';
import { seedDemo, DEMO_PRESENTATIONS } from '../src/seed';
import { createTestContext, doc, quiz, cloud, type TestContext } from './helpers';

let ctx: TestContext;
beforeAll(async () => { ctx = await createTestContext(); });
afterAll(async () => { await ctx.close(); });

const sample = () =>
  doc(
    [
      { id: 'title', type: 'content', layout: 'title', title: 'Hello', body: 'World', image: { url: 'https://example.com/a.png', alt: 'Alt', fit: 'contain' } },
      quiz({ id: 'q', timeLimitSec: 20, speedBonus: true, points: 750 }),
      cloud({ id: 'wc', moderation: 'premoderate', maxWords: 3 }),
      { id: 'poll', type: 'poll', question: 'P?', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], multiple: true, maxSelections: 2, anonymous: true },
      { id: 'open', type: 'open', question: 'O?', mode: 'paragraph', maxLength: 800 },
      { id: 'rate', type: 'rating', question: 'R?', min: 0, max: 10, minLabel: 'Low', maxLabel: 'High' },
      { id: 'sv', type: 'survey', title: 'S', questions: [{ id: 'q1', kind: 'text', question: 'T?' }] },
    ],
    { theme: { palette: 'peach', background: 'plain' }, description: 'desc' },
  );

describe('presentation JSON import / export', () => {
  it('round-trips through the database: import → export → import → export is identical', async () => {
    const a = await ctx.api('/api/studio/presentations/import', { body: sample() });
    expect(a.status).toBe(201);
    const exp1 = await ctx.api(`/api/studio/presentations/${a.body.id}/export`);
    expect(exp1.status).toBe(200);
    expect(exp1.text).toContain('"schemaVersion": 1');
    const b = await ctx.api('/api/studio/presentations/import', { body: JSON.parse(exp1.text) });
    const exp2 = await ctx.api(`/api/studio/presentations/${b.body.id}/export`);
    expect(JSON.parse(exp2.text)).toEqual(JSON.parse(exp1.text));
    // and it equals the in-memory canonical form
    const canonical = parsePresentationDoc(sample());
    expect(canonical.ok && JSON.parse(exportPresentationJson(canonical.doc))).toEqual(JSON.parse(exp1.text));
    // semantics survive: images, timers, scoring, moderation
    const slides = JSON.parse(exp1.text).slides;
    expect(slides[0].image).toEqual({ url: 'https://example.com/a.png', alt: 'Alt', fit: 'contain' });
    expect(slides[1]).toMatchObject({ timeLimitSec: 20, speedBonus: true, points: 750, notes: 'PRIVATE-NOTES' });
    expect(slides[2]).toMatchObject({ moderation: 'premoderate', maxWords: 3 });
  });

  it('rejects invalid documents with a 422 listing every problem', async () => {
    const r = await ctx.api('/api/studio/presentations/import', { body: doc([{ id: 'q', type: 'quiz', question: 'Q', options: [{ id: 'a', text: 'A' }], correctOptionId: 'z', timelimit: 5 }, { type: 'nonsense' }]) });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('INVALID_PRESENTATION');
    const messages = r.body.error.details.issues.map((i: any) => `${i.path}: ${i.message}`).join('\n');
    expect(messages).toContain('slides[0].options');
    expect(messages).toContain('Did you mean "timeLimitSec"');
    expect(messages).toContain('Unknown slide type');
    expect(r.body.error.details.issues.every((i: any) => typeof i.slide === 'number')).toBe(true);
    // nothing half-imported
    const list = await ctx.api('/api/studio/presentations');
    expect(list.body.some((p: any) => p.title === 'Test deck' && p.slideCount === 0)).toBe(false);
  });

  it('rejects malformed JSON bodies and unsafe image URLs', async () => {
    const res = await fetch(ctx.url + '/api/studio/presentations/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{ nope' });
    expect(res.status).toBe(400);
    const bad = await ctx.api('/api/studio/presentations/import', { body: doc([{ id: 'c', type: 'content', title: 'x', image: { url: 'javascript:alert(1)' } }]) });
    expect(bad.status).toBe(422);
    expect(bad.body.error.details.issues[0].path).toBe('slides[0].image.url');
  });

  it('saves editor changes through the same model: reorder, edit, add, remove', async () => {
    const created = await ctx.api('/api/studio/presentations/import', { body: sample() });
    const id = created.body.id;
    const got = (await ctx.api(`/api/studio/presentations/${id}`)).body.doc as PresentationDoc;
    const reordered = { ...got, title: 'Renamed', slides: [...got.slides].reverse().filter((s) => s.id !== 'open') };
    reordered.slides.push({ id: 'new', type: 'content', title: 'Added', body: '', steps: [], notes: '' });
    const put = await ctx.api(`/api/studio/presentations/${id}`, { method: 'PUT', body: reordered });
    expect(put.status).toBe(200);
    const after = (await ctx.api(`/api/studio/presentations/${id}`)).body.doc as PresentationDoc;
    expect(after.title).toBe('Renamed');
    expect(after.slides.map((s) => s.id)).toEqual(['sv', 'rate', 'poll', 'wc', 'q', 'title', 'new']);
    // an invalid save changes nothing
    const bad = await ctx.api(`/api/studio/presentations/${id}`, { method: 'PUT', body: { ...after, slides: [{ id: 'x', type: 'quiz', question: '' }] } });
    expect(bad.status).toBe(422);
    expect((await ctx.api(`/api/studio/presentations/${id}`)).body.doc.slides).toHaveLength(7);
  });

  it('duplicates and deletes presentations; running sessions keep their own copy of the slides', async () => {
    const created = await ctx.api('/api/studio/presentations/import', { body: sample() });
    const dup = await ctx.api(`/api/studio/presentations/${created.body.id}/duplicate`, { method: 'POST', body: {} });
    expect(dup.status).toBe(201);
    const copy = (await ctx.api(`/api/studio/presentations/${dup.body.id}`)).body.doc;
    expect(copy.title).toBe('Test deck (copy)');
    expect(copy.slides).toHaveLength(7);

    const s = await ctx.startSession(sample());
    // editing the presentation does not change the running session's slides
    await ctx.api(`/api/studio/presentations/${s.presentationId}`, { method: 'PUT', body: doc([{ id: 'only', type: 'content', title: 'Changed' }]) });
    expect(await ctx.prisma.sessionActivity.count({ where: { sessionId: s.id } })).toBe(7);
    expect((await ctx.api(`/api/studio/presentations/${dup.body.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await ctx.api(`/api/studio/presentations/${dup.body.id}`)).status).toBe(404);
  });

  it('refuses to start a session for an empty presentation, and exposes the JSON Schema', async () => {
    const empty = await ctx.api('/api/studio/presentations', { body: { title: 'Empty' } });
    const r = await ctx.api(`/api/studio/presentations/${empty.body.id}/sessions`, { body: {} });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('EMPTY_PRESENTATION');
    const schema = await ctx.api('/api/schema/presentation.json');
    expect(schema.body.properties.slides).toBeDefined();
  });
});

describe('seeded demo presentations (imported through the JSON pipeline)', () => {
  it('imports the MSG lesson with every required element, and is idempotent', async () => {
    const first = await seedDemo(ctx.prisma);
    expect(first.created).toContain('MSG: The Secret Ingredient?');
    expect((await seedDemo(ctx.prisma)).created).toEqual([]);
    const list = (await ctx.api('/api/studio/presentations')).body as { id: string; title: string }[];
    const msg = list.find((p) => p.title === 'MSG: The Secret Ingredient?')!;
    const { doc: d } = (await ctx.api(`/api/studio/presentations/${msg.id}`)).body as { doc: PresentationDoc };
    const types = new Set(d.slides.map((s) => s.type));
    for (const t of ['content', 'quiz', 'poll', 'wordcloud', 'open', 'rating', 'survey']) expect(types.has(t as any)).toBe(true);
    const ids = d.slides.map((s) => s.id);
    for (const required of ['predict', 'warm-up', 'before-you-taste', 'crackers-impressions', 'jerky-impressions', 'science', 'evidence', 'check-glutamate', 'reflection']) expect(ids).toContain(required);
    // observers are always an option, and preference is not treated as proof
    const text = JSON.stringify(d.slides).toLowerCase();
    expect(text).toContain('observe');
    expect(text).toContain('never have to taste');
    expect(text).toContain('does not prove');
    expect(text).not.toMatch(/msg (always|universally) (improves|makes)/);
    // it round-trips like any other presentation
    const again = parsePresentationDoc(JSON.parse(exportPresentationJson(d)));
    expect(again.ok && again.doc).toEqual(d);
    // and the workshop kit is a Companion-ready presentation with no content slides
    expect(DEMO_PRESENTATIONS[1].slides.every((s) => s.type !== 'content')).toBe(true);
  });
});

describe('studio protection', () => {
  it('requires sign-in for the studio only when a password is configured, and never for joining', async () => {
    const locked = await createTestContext({ studioPassword: 's3cret' });
    try {
      expect((await locked.api('/api/studio/presentations')).status).toBe(401);
      expect((await locked.api('/api/auth/login', { body: { password: 'wrong' } })).status).toBe(401);
      const login = await locked.api('/api/auth/login', { body: { password: 's3cret' } });
      expect(login.status).toBe(200);
      const token = login.body.token as string;
      expect((await locked.api('/api/studio/presentations', { token })).status).toBe(200);
      expect((await locked.api('/api/studio/presentations', { token: token.replace(/.$/, 'x') })).status).toBe(401);
      expect((await locked.api('/api/config')).body.authRequired).toBe(true);
      expect((await locked.api('/api/join/123456')).status).toBe(404); // public route reachable without a token
      expect((await locked.api('/api/studio/sessions/abc/control')).status).toBe(401);
    } finally {
      await locked.close();
    }
  });
});

describe('uploads', () => {
  const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082', 'hex');

  it('stores valid images and rejects anything else', async () => {
    const ok = await fetch(ctx.url + '/api/studio/uploads', { method: 'POST', headers: { 'content-type': 'image/png' }, body: PNG });
    expect(ok.status).toBe(201);
    const { url } = (await ok.json()) as { url: string };
    expect(url).toMatch(/^\/uploads\/[0-9a-f]{24}\.png$/);
    const served = await fetch(ctx.url + url);
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('image/png');
    expect(served.headers.get('x-content-type-options')).toBe('nosniff');

    const html = await fetch(ctx.url + '/api/studio/uploads', { method: 'POST', headers: { 'content-type': 'image/png' }, body: '<script>alert(1)</script>' });
    expect(html.status).toBe(400); // wrong magic bytes
    const svg = await fetch(ctx.url + '/api/studio/uploads', { method: 'POST', headers: { 'content-type': 'image/svg+xml' }, body: '<svg/>' });
    expect(svg.status).toBe(400);
  });
});

describe('CSV safety', () => {
  it('quotes cells and neutralises spreadsheet formulas', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell(null)).toBe('');
    expect(csvCell(0)).toBe('0');
  });
});
