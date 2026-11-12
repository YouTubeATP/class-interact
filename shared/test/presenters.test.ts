import { describe, expect, it } from 'vitest';
import { cueFor, cueLooksLikeALine, isMine, normalizeName, parsePresentationDoc, rosterOf, sameName, turnsOf } from '../src';

const slides = (...names: (string | undefined)[]) => names.map((presenter) => ({ presenter }));

describe('presenter names', () => {
  it('match regardless of case, accents and spacing', () => {
    expect(normalizeName('  José   Ruiz ')).toBe('jose ruiz');
    expect(sameName('PRIYA', 'priya')).toBe(true);
    expect(sameName('', '')).toBe(false); // nobody is not somebody
    expect(rosterOf(slides('Priya', 'priya', undefined, ' Sam ', 'Priya'))).toEqual(['Priya', 'Sam']);
  });
});

describe('turns', () => {
  it('groups consecutive slides and skips unassigned ones', () => {
    expect(turnsOf(slides('A', 'a', undefined, 'B', 'A', ''))).toEqual([
      { presenter: 'A', from: 0, to: 1 },
      { presenter: 'B', from: 3, to: 3 },
      { presenter: 'A', from: 4, to: 4 },
    ]);
  });
});

describe('cues', () => {
  const turns = turnsOf(slides('A', 'A', 'B', undefined, 'A'));
  it('says get ready one slide before your turn, then start, then end', () => {
    expect(cueFor(0, 1, 'B', turns)).toBe('ready');
    expect(cueFor(1, 2, 'B', turns)).toBe('start');
    expect(cueFor(2, 3, 'B', turns)).toBe('end');
    expect(cueFor(2, 3, 'A', turns)).toBe('ready'); // slide 3 is unassigned, A is on at 4
    expect(cueFor(3, 4, 'A', turns)).toBe('start');
  });
  it('stays quiet within a turn, on the first snapshot, and when going back', () => {
    expect(cueFor(0, 1, 'A', turns)).toBeNull();
    expect(cueFor(1, 1, 'B', turns)).toBeNull();
    expect(cueFor(3, 2, 'A', turns)).toBeNull(); // backwards onto B's slide: not about to be on
    expect(cueFor(2, 1, 'B', turns)).toBe('end');
  });
  it('starts when the presentation opens on your slide', () => {
    expect(cueFor(-1, 0, 'A', turns)).toBe('start');
    expect(cueFor(-1, 0, 'nobody', turns)).toBeNull();
    expect(isMine(4, 'a', turns)).toBe(true);
  });
  it('flags cues that read like lines', () => {
    expect(cueLooksLikeALine('Erosion data')).toBe(false);
    expect(cueLooksLikeALine('Then I will explain to everyone how the erosion data was collected')).toBe(true);
  });
});

describe('schema', () => {
  const base = { schemaVersion: 1, title: 'T' };
  it('accepts a presenter and up to five short cues', () => {
    const r = parsePresentationDoc({ ...base, slides: [{ id: 'a', type: 'content', title: 'Hi', presenter: ' Priya ', cues: ['One', 'Two'] }] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.doc.slides[0]).toMatchObject({ presenter: 'Priya', cues: ['One', 'Two'] });
  });
  it('refuses too many or too long cues', () => {
    const many = parsePresentationDoc({ ...base, slides: [{ id: 'a', type: 'content', title: 'Hi', cues: ['1', '2', '3', '4', '5', '6'] }] });
    expect(many.ok).toBe(false);
    const long = parsePresentationDoc({ ...base, slides: [{ id: 'a', type: 'content', title: 'Hi', cues: ['x'.repeat(81)] }] });
    expect(long.ok).toBe(false);
  });
  it('leaves slides without presenters unchanged', () => {
    const r = parsePresentationDoc({ ...base, slides: [{ id: 'a', type: 'content', title: 'Hi' }] });
    expect(r.ok && 'presenter' in r.doc.slides[0]).toBe(false);
  });
});
