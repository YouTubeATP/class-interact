import { describe, expect, it } from 'vitest';
import { AI_TOOLS, AI_TOOL_NAMES, applyAiTool, createEmptyDoc, describeDeck, exportPresentationJson, parsePresentationJson, type PresentationDoc } from '../src';

const empty = () => createEmptyDoc('Deck');
const run = (doc: PresentationDoc, name: string, args: unknown) => applyAiTool(doc, name, args);
const quizConfig = { question: 'Capital of France?', options: [{ id: 'a', text: 'Paris' }, { id: 'b', text: 'Rome' }], correctOptionId: 'a' };

describe('AI tool definitions', () => {
  it('are plain JSON Schema objects with unique names', () => {
    expect(new Set(AI_TOOL_NAMES).size).toBe(AI_TOOLS.length);
    for (const t of AI_TOOLS) {
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.parameters).toMatchObject({ type: 'object' });
      expect(() => JSON.stringify(t)).not.toThrow();
    }
  });
});

describe('building a deck', () => {
  it('adds several slides at once, with generated ids, and returns where they went', () => {
    const r = run(empty(), 'add_slides', {
      slides: [
        { type: 'content', config: { title: 'Welcome' } },
        { type: 'quiz', config: quizConfig },
        { type: 'quiz', config: { kind: 'match', question: 'Match', pairs: [{ id: 'p1', left: 'France', right: 'Paris' }, { id: 'p2', left: 'Italy', right: 'Rome' }] } },
        { type: 'quiz', config: { kind: 'order', question: 'Order', items: [{ id: 'i1', text: 'One' }, { id: 'i2', text: 'Two' }] } },
        { type: 'quiz', config: { kind: 'multiple', question: 'Fruit?', options: [{ id: 'a', text: 'Apple' }, { id: 'b', text: 'Brick' }, { id: 'c', text: 'Cherry' }], correctOptionIds: ['a', 'c'] } },
        { type: 'poll', config: { question: 'Like it?', options: [{ id: 'y', text: 'Yes' }, { id: 'n', text: 'No' }] } },
        { type: 'wordcloud', config: { question: 'One word?' } },
      ],
    });
    expect(r.changed).toBe(true);
    expect(r.result).toMatchObject({ ok: true, slide_count: 7 });
    expect((r.result as any).added.map((a: any) => a.slide_id)).toEqual(['s1', 's2', 's3', 's4', 's5', 's6', 's7']);
    expect(r.doc.slides.map((s) => s.type)).toEqual(['content', 'quiz', 'quiz', 'quiz', 'quiz', 'poll', 'wordcloud']);
    // what the tools produce is a document the app can export and re-import unchanged
    const json = exportPresentationJson(r.doc);
    const again = parsePresentationJson(json);
    expect(again.ok && exportPresentationJson(again.doc)).toBe(json);
  });

  it('does not touch the original document', () => {
    const doc = empty();
    run(doc, 'add_slides', { slides: [{ type: 'content', config: { title: 'x' } }] });
    expect(doc.slides).toHaveLength(0);
  });

  it('inserts at a position and keeps ids unique across calls', () => {
    let doc = run(empty(), 'add_slides', { slides: [{ type: 'content', config: { title: 'A' } }, { type: 'content', config: { title: 'C' } }] }).doc;
    doc = run(doc, 'add_slides', { slides: [{ type: 'content', config: { title: 'B' } }], position: 1 }).doc;
    expect(doc.slides.map((s: any) => s.title)).toEqual(['A', 'B', 'C']);
    expect(new Set(doc.slides.map((s) => s.id)).size).toBe(3);
  });

  it('rejects an invalid batch as a whole and explains it in the model\'s terms', () => {
    const doc = run(empty(), 'add_slides', { slides: [{ type: 'content', config: { title: 'ok' } }] }).doc;
    const r = run(doc, 'add_slides', { slides: [{ type: 'content', config: { title: 'fine' } }, { type: 'quiz', config: { question: 'Q', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctOptionId: 'zzz', timelimit: 5 } }] });
    expect(r.changed).toBe(false);
    expect(r.doc).toBe(doc);
    expect(r.result).toMatchObject({ ok: false });
    const text = (r.result as any).issues.join('\n');
    expect(text).toContain('slides[1] (batch)');
    expect(text).toContain('Did you mean "timeLimitSec"?');
    expect((r.result as any).error).toContain('Nothing was changed');
  });

  it('refuses unknown slide types and ignores a stray "type" inside config', () => {
    expect(run(empty(), 'add_slides', { slides: [{ type: 'video', config: {} }] }).result).toMatchObject({ ok: false });
    const r = run(empty(), 'add_slides', { slides: [{ type: 'content', config: { type: 'quiz', title: 'T' } }] });
    expect(r.doc.slides[0].type).toBe('content');
  });
});

describe('editing a deck', () => {
  const deck = () => run(empty(), 'add_slides', { slides: [{ type: 'content', config: { title: 'Intro' } }, { type: 'quiz', config: quizConfig }, { type: 'content', config: { title: 'End' } }] }).doc;

  it('updates only the given fields, and null removes one', () => {
    const r = run(deck(), 'update_slide', { slide_id: 's2', changes: { question: 'Capital of Italy?', correctOptionId: 'b', explanation: 'Rome.' } });
    expect(r.result).toMatchObject({ ok: true, slide_id: 's2', updated: ['question', 'correctOptionId', 'explanation'] });
    const q: any = r.doc.slides[1];
    expect(q).toMatchObject({ question: 'Capital of Italy?', correctOptionId: 'b', explanation: 'Rome.', options: [{ id: 'a' }, { id: 'b' }] });
    const cleared: any = run(r.doc, 'update_slide', { slide_id: 's2', changes: { explanation: null } }).doc.slides[1];
    expect(cleared.explanation).toBe('');
  });

  it('can switch a quiz to another kind in one call, clearing the old answer key', () => {
    const r = run(deck(), 'update_slide', { slide_id: 's2', changes: { kind: 'order', options: null, correctOptionId: null, items: [{ id: 'i1', text: 'First' }, { id: 'i2', text: 'Second' }] } });
    expect(r.result).toMatchObject({ ok: true });
    expect(r.doc.slides[1]).toMatchObject({ kind: 'order' });
    // a half-finished switch is refused with the reason
    const bad = run(deck(), 'update_slide', { slide_id: 's2', changes: { kind: 'multiple' } });
    expect(bad.changed).toBe(false);
    expect((bad.result as any).issues.join('\n')).toMatch(/correctOptionIds|correctOptionId/);
  });

  it('reports problems relative to the slide being edited', () => {
    const r = run(deck(), 'update_slide', { slide_id: 's2', changes: { correctOptionId: 'nope' } });
    expect(r.changed).toBe(false);
    expect((r.result as any).issues[0]).toMatch(/^correctOptionId: .*does not match any option/);
  });

  it('will not change a slide\'s type or id', () => {
    expect(run(deck(), 'update_slide', { slide_id: 's1', changes: { type: 'quiz' } }).result).toMatchObject({ ok: false });
    const r = run(deck(), 'update_slide', { slide_id: 's1', changes: { id: 'hacked', title: 'New' } });
    expect(r.doc.slides[0].id).toBe('s1');
  });

  it('deletes and moves slides, and names the valid ids when one is wrong', () => {
    const moved = run(deck(), 'move_slide', { slide_id: 's3', to_index: 0 });
    expect(moved.doc.slides.map((s) => s.id)).toEqual(['s3', 's1', 's2']);
    expect(run(moved.doc, 'move_slide', { slide_id: 's3', to_index: 99 }).doc.slides.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
    const gone = run(deck(), 'delete_slide', { slide_id: 's2' });
    expect(gone.doc.slides.map((s) => s.id)).toEqual(['s1', 's3']);
    const missing = run(deck(), 'delete_slide', { slide_id: 'zzz' });
    expect(missing.changed).toBe(false);
    expect((missing.result as any).error).toContain('Existing ids: s1, s2, s3');
  });

  it('changes the title and theme, and rejects unknown fields', () => {
    const r = run(deck(), 'set_presentation_info', { title: 'Geography', palette: 'mint' });
    expect(r.doc).toMatchObject({ title: 'Geography', theme: { palette: 'mint' } });
    expect(run(deck(), 'set_presentation_info', { colour: 'red' }).result).toMatchObject({ ok: false });
    expect(run(deck(), 'set_presentation_info', { palette: 'neon' }).changed).toBe(false);
  });
});

describe('reading and robustness', () => {
  it('summarises the deck, and returns one slide in full without fields that do not apply', () => {
    const doc = run(empty(), 'add_slides', { slides: [{ type: 'content', config: { title: 'Hi' } }, { type: 'quiz', config: quizConfig }] }).doc;
    const overview: any = run(doc, 'get_presentation', {}).result;
    expect(overview).toMatchObject({ ok: true, title: 'Deck', slide_count: 2 });
    expect(overview.slides[1]).toMatchObject({ index: 1, id: 's2', type: 'quiz', kind: 'single', title: 'Capital of France?' });
    const one: any = run(doc, 'get_presentation', { slide_id: 's2' }).result;
    expect(one.slide).toMatchObject({ id: 's2', correctOptionId: 'a' });
    expect(one.slide).not.toHaveProperty('pairs');
    expect(describeDeck(doc).slide_count).toBe(2);
  });

  it('never throws, whatever the model sends', () => {
    const doc = empty();
    for (const [name, args] of [['add_slides', null], ['add_slides', 'x'], ['add_slides', { slides: 5 }], ['update_slide', {}], ['update_slide', { slide_id: 3 }], ['move_slide', { slide_id: 's1' }], ['nope', {}], ['get_presentation', 7]] as const) {
      const r = run(doc, name, args);
      expect(r.changed).toBe(false);
    }
  });

  it('enforces the 150 slide limit through the normal validator', () => {
    const many = { slides: Array.from({ length: 20 }, () => ({ type: 'content', config: { title: 'x' } })) };
    let doc = empty();
    for (let i = 0; i < 7; i++) doc = run(doc, 'add_slides', many).doc;
    expect(doc.slides).toHaveLength(140);
    const r = run(doc, 'add_slides', many);
    expect(r.changed).toBe(false);
    expect((r.result as any).issues.join('\n')).toContain('at most 150');
  });
});
