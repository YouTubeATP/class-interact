import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION, createEmptyDoc, defaultConfig, exportPresentationJson, parsePresentationDoc, parsePresentationJson,
  resolveContentLayout, checkImageUrl, SLIDE_TYPES, issueToString,
} from '../src';

const minimal = (slides: unknown[]) => ({ schemaVersion: 1, title: 'Demo', slides });

describe('presentation document', () => {
  it('applies defaults and assigns ids when optional fields are omitted', () => {
    const r = parsePresentationDoc(minimal([
      { type: 'content', title: 'Hello' },
      { type: 'quiz', question: 'Q?', options: [{ text: 'A' }, { text: 'B' }], correctOptionId: 'o2' },
    ]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.theme).toEqual({ palette: 'azure', background: 'soft' });
    expect(r.doc.slides.map((s) => s.id)).toEqual(['slide-1', 'slide-2']);
    const quiz = r.doc.slides[1];
    expect(quiz.type === 'quiz' && quiz.options.map((o) => o.id)).toEqual(['o1', 'o2']);
    expect(quiz.type === 'quiz' && quiz.points).toBe(1000);
  });

  it('round-trips every slide type: export → import → export is identical', () => {
    const slides = SLIDE_TYPES.map((type, i) => ({ id: `s${i}`, type, ...defaultConfig(type) }));
    const first = parsePresentationDoc({ ...minimal(slides), theme: { palette: 'mint' } });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const json1 = exportPresentationJson(first.doc);
    const second = parsePresentationJson(json1);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.doc).toEqual(first.doc);
    expect(exportPresentationJson(second.doc)).toBe(json1);
  });

  it('keeps images, notes, timers and scoring through a round trip', () => {
    const r = parsePresentationDoc(minimal([
      {
        id: 'q', type: 'quiz', question: 'Q?', notes: 'Say hi', timeLimitSec: 20, speedBonus: true, points: 500,
        options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctOptionId: 'b',
        image: { url: 'https://example.com/a.png', alt: 'An example', fit: 'contain' },
      },
    ]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const again = parsePresentationJson(exportPresentationJson(r.doc));
    expect(again.ok && again.doc.slides[0]).toMatchObject({ notes: 'Say hi', timeLimitSec: 20, speedBonus: true, points: 500, image: { fit: 'contain', alt: 'An example' } });
  });

  it('reports actionable errors with paths and suggestions', () => {
    const r = parsePresentationDoc(minimal([
      { id: 'q', type: 'quiz', question: 'Q?', options: [{ id: 'a', text: 'A' }], correctOptionId: 'z', timelimit: 10 },
    ]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const text = r.errors.map(issueToString).join('\n');
    expect(text).toContain('slides[0].options');
    expect(text).toContain('2–6 options');
    expect(text).toContain('Did you mean "timeLimitSec"?');
  });

  it('explains a wrong correctOptionId and unknown slide types', () => {
    const a = parsePresentationDoc(minimal([{ id: 'q', type: 'quiz', question: 'Q', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctOptionId: 'zzz' }]));
    expect(!a.ok && a.errors[0].message).toContain('Valid ids: a, b');
    const b = parsePresentationDoc(minimal([{ id: 'x', type: 'quizz', question: 'Q' }]));
    expect(!b.ok && b.errors[0].message).toMatch(/Unknown slide type/);
  });

  it('rejects duplicate slide ids and invalid JSON', () => {
    const r = parsePresentationDoc(minimal([{ id: 'a', type: 'content', title: 'x' }, { id: 'a', type: 'content', title: 'y' }]));
    expect(!r.ok && r.errors[0].message).toContain('Duplicate slide id');
    const j = parsePresentationJson('{ nope');
    expect(!j.ok && j.errors[0].message).toContain('Not valid JSON');
  });

  it('versions: missing → assumed with a warning; newer → rejected with a clear message', () => {
    const missing = parsePresentationDoc({ title: 'T', slides: [] });
    expect(missing.ok && missing.warnings[0]).toContain('schemaVersion');
    const newer = parsePresentationDoc({ schemaVersion: SCHEMA_VERSION + 1, title: 'T', slides: [] });
    expect(!newer.ok && newer.errors[0].message).toContain('Update ClassInteract');
  });

  it('validates cross-field quiz rules', () => {
    const base = { id: 'q', type: 'quiz', question: 'Q', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctOptionId: 'a' };
    expect(parsePresentationDoc(minimal([{ ...base, speedBonus: true }])).ok).toBe(false);
    expect(parsePresentationDoc(minimal([{ ...base, speedBonus: true, timeLimitSec: 20 }])).ok).toBe(true);
    expect(parsePresentationDoc(minimal([{ ...base, options: [{ id: 'a', text: 'A' }, { id: 'a', text: 'B' }] }])).ok).toBe(false);
    expect(parsePresentationDoc(minimal([{ ...base, options: Array.from({ length: 7 }, (_, i) => ({ id: `o${i}`, text: 'x' })), correctOptionId: 'o1' }])).ok).toBe(false);
  });

  it('validates poll, rating, survey and layout rules', () => {
    const poll = { id: 'p', type: 'poll', question: 'Q', options: [{ text: 'A' }, { text: 'B' }] };
    expect(parsePresentationDoc(minimal([{ ...poll, maxSelections: 2 }])).ok).toBe(false); // not multiple
    expect(parsePresentationDoc(minimal([{ ...poll, multiple: true, maxSelections: 5 }])).ok).toBe(false);
    expect(parsePresentationDoc(minimal([{ id: 'r', type: 'rating', question: 'Q', min: 1, max: 1 }])).ok).toBe(false);
    expect(parsePresentationDoc(minimal([{ id: 's', type: 'survey', title: 'S', questions: [] }])).ok).toBe(false);
    expect(parsePresentationDoc(minimal([{ id: 'c', type: 'content', layout: 'full-image', title: 'x' }])).ok).toBe(false);
  });

  it('rejects unsafe image URLs but allows https and uploaded paths', () => {
    expect(checkImageUrl('https://example.com/x.png')).toBeNull();
    expect(checkImageUrl('/uploads/x.png')).toBeNull();
    expect(checkImageUrl('javascript:alert(1)')).not.toBeNull();
    expect(checkImageUrl('data:image/png;base64,AAAA')).not.toBeNull();
    expect(checkImageUrl('//evil.com/x.png')).not.toBeNull();
    expect(checkImageUrl('https://user:pw@example.com/x.png')).not.toBeNull();
    const r = parsePresentationDoc(minimal([{ id: 'c', type: 'content', title: 'x', image: { url: 'javascript:alert(1)' } }]));
    expect(!r.ok && r.errors[0].path).toBe('slides[0].image.url');
  });

  it('resolves sensible default layouts', () => {
    const img = { url: '/x.png', alt: '', fit: 'cover' as const };
    expect(resolveContentLayout({ title: 'T', body: '', steps: [] })).toBe('title');
    expect(resolveContentLayout({ title: 'T', body: 'text', steps: [] })).toBe('text');
    expect(resolveContentLayout({ title: 'T', body: 'text', steps: [], image: img })).toBe('image-text');
    expect(resolveContentLayout({ title: '', body: '', steps: [], image: img })).toBe('full-image');
    expect(resolveContentLayout({ title: 'T', body: '', steps: ['a'] })).toBe('instructions');
    expect(resolveContentLayout({ title: 'T', body: '', steps: [], layout: 'text' })).toBe('text');
  });

  it('empty document is valid', () => {
    expect(parsePresentationDoc(createEmptyDoc('x')).ok).toBe(true);
  });
});
