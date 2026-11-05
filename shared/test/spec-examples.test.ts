import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePresentationDoc } from '../src';

/**
 * docs/lesson-json-spec.md is what people and agents follow to write lessons, so its examples must import. Every
 * ```json block that is a whole document is parsed as is; a block that is a single slide is parsed inside a minimal
 * document. Fragments that are not complete JSON (a lone field) and the error-response example are skipped.
 */
const spec = readFileSync(new URL('../../docs/lesson-json-spec.md', import.meta.url), 'utf8');
const blocks = [...spec.matchAll(/^(`{3,4})json\n([\s\S]*?)\n\1$/gm)].map((m) => m[2]);

describe('lesson JSON specification examples', () => {
  it('has examples to check', () => {
    expect(blocks.length).toBeGreaterThan(8);
  });

  let documents = 0;
  for (const [i, src] of blocks.entries()) {
    let value: unknown;
    try { value = JSON.parse(src); } catch { continue; }
    if (typeof value !== 'object' || value === null || 'error' in value) continue;
    const doc = 'slides' in value ? value : { schemaVersion: 1, title: 'Spec example', slides: [value] };
    if ('slides' in value) documents++;
    it(`example ${i + 1} imports`, () => {
      const r = parsePresentationDoc(doc);
      expect(r.ok, r.ok ? '' : JSON.stringify(r.errors, null, 1)).toBe(true);
    });
  }
  it('checks the complete documents', () => expect(documents).toBeGreaterThanOrEqual(3));
});
