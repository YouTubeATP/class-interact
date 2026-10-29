import { describe, expect, it } from 'vitest';
import { hasMarkup, parseBlocks, parseInline, plainInline } from './parse';

describe('rich text parser', () => {
  it('parses inline marks and leaves prices alone', () => {
    expect(parseInline('**bold** and *it* and `x = 1` and $x^2$')).toEqual([
      { t: 'b', c: [{ t: 'text', v: 'bold' }] }, { t: 'text', v: ' and ' }, { t: 'i', c: [{ t: 'text', v: 'it' }] }, { t: 'text', v: ' and ' },
      { t: 'code', v: 'x = 1' }, { t: 'text', v: ' and ' }, { t: 'math', tex: 'x^2' },
    ]);
    expect(parseInline('$5 and $10')).toEqual([{ t: 'text', v: '$5 and $10' }]);
    expect(parseInline('a \\*b\\*')).toEqual([{ t: 'text', v: 'a *b*' }]);
  });

  it('keeps fenced code exactly, including indentation and blank lines', () => {
    const src = 'Look:\n```python\ndef f(x):\n\n    return x * 2\n```';
    expect(parseBlocks(src)).toEqual([{ t: 'p', c: [{ t: 'text', v: 'Look:' }] }, { t: 'code', lang: 'python', text: 'def f(x):\n\n    return x * 2' }]);
  });

  it('parses tables with alignment and pipes inside code', () => {
    const [t] = parseBlocks('| op | means |\n|:--|--:|\n| `a|b` | or |');
    expect(t).toMatchObject({ t: 'table', align: ['left', 'right'] });
    expect((t as any).rows[0][0]).toEqual([{ t: 'code', v: 'a|b' }]);
  });

  it('parses lists and display math', () => {
    expect(parseBlocks('3. c\n4. d')).toEqual([{ t: 'ol', items: [[{ t: 'text', v: 'c' }], [{ t: 'text', v: 'd' }]], start: 3 }]);
    expect(parseBlocks('$$\\frac{a}{b}$$')).toEqual([{ t: 'math', tex: '\\frac{a}{b}' }]);
  });

  it('never produces markup from what people type', () => {
    const out = JSON.stringify(parseBlocks('<img src=x onerror=alert(1)> **<b>hi</b>**'));
    expect(out).toContain('<img src=x onerror=alert(1)>'); // kept as text: React escapes it
    expect(parseBlocks('<script>')).toEqual([{ t: 'p', c: [{ t: 'text', v: '<script>' }] }]);
  });

  it('detects markup and strips it for plain contexts', () => {
    expect(hasMarkup('Just a sentence.')).toBe(false);
    expect(hasMarkup('Use `len`')).toBe(true);
    expect(plainInline('What does `len(x)` return for **this** list?')).toBe('What does len(x) return for this list?');
  });
});
