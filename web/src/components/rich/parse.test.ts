import { describe, expect, it } from 'vitest';
import { hasMarkup, isSoloStructure, parseBlocks, parseInline, parseScheme, plainInline } from './parse';

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

describe('chemistry', () => {
  it('reads inline structures and leaves broken tokens as text', () => {
    expect(parseInline('Product: {{smiles:CC(O)C1=CC=CC=C1}}?')).toEqual([{ t: 'text', v: 'Product: ' }, { t: 'mol', smiles: 'CC(O)C1=CC=CC=C1' }, { t: 'text', v: '?' }]);
    expect(parseInline('{{mol:CCO}}')).toEqual([{ t: 'mol', smiles: 'CCO' }]);
    expect(parseInline('{{smiles:C C}}')[0]).toMatchObject({ t: 'text' }); // SMILES never contain spaces
    expect(parseInline('{{smiles:CCO')).toEqual([{ t: 'text', v: '{{smiles:CCO' }]);
    expect(hasMarkup('{{smiles:O}}')).toBe(true);
    expect(isSoloStructure(' {{smiles:CCO}} ')).toBe(true);
    expect(isSoloStructure('{{smiles:CCO}} and {{smiles:O}}')).toBe(false);
  });

  it('keeps mhchem inside maths', () => {
    expect(parseInline('$\\ce{2H2 + O2 -> 2H2O}$')).toEqual([{ t: 'math', tex: '\\ce{2H2 + O2 -> 2H2O}' }]);
    expect(plainInline('Add $\\ce{NaBH4}$ to {{smiles:CC(=O)C}}')).toBe('Add NaBH4 to (structure)');
  });

  it('parses a route: molecules with captions, arrows with conditions above and below, plus signs and unknowns', () => {
    expect(parseScheme(['C1=CC=CC=C1 "benzene"', '-> $\\ce{CH3COCl}$, $\\ce{AlCl3}$ | acylation', 'CC(=O)C1=CC=CC=C1 acetophenone', '+', '? X', '→ heat'])).toEqual([
      { t: 'mol', smiles: 'C1=CC=CC=C1', caption: 'benzene' },
      { t: 'arrow', above: '$\\ce{CH3COCl}$, $\\ce{AlCl3}$', below: 'acylation' },
      { t: 'mol', smiles: 'CC(=O)C1=CC=CC=C1', caption: 'acetophenone' },
      { t: 'plus' },
      { t: 'mol', smiles: '?', caption: 'X' },
      { t: 'arrow', above: 'heat', below: '' },
    ]);
    const [b] = parseBlocks('```route\nCCO\n-> conc. H2SO4\nC=C\n```');
    expect(b).toMatchObject({ t: 'scheme', arrows: true, items: [{ t: 'mol' }, { t: 'arrow' }, { t: 'mol' }] });
    expect(parseBlocks('```smiles\nCCO ethanol\nCC(=O)O\n```')[0]).toMatchObject({ t: 'scheme', arrows: false });
    // other languages are still code
    expect(parseBlocks('```python\nx = 1\n```')[0]).toMatchObject({ t: 'code' });
  });
});
