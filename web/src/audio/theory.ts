/**
 * Just enough music theory to write the compositions as chord symbols and melodies, and to voice them well:
 * chord symbols are parsed into pitch classes, and each chord is voiced close to the one before it (voice leading),
 * so accompaniment moves by small steps instead of jumping around.
 */

const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Chord qualities as intervals above the root (the order is the stacking order used for voicing). */
const QUALITY: Record<string, number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  m7b5: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
  '7sus4': [0, 5, 7, 10],
  add9: [0, 4, 7, 14],
  '9': [0, 4, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  m9: [0, 3, 7, 10, 14],
  '13': [0, 4, 10, 14, 21],
  'maj7#11': [0, 4, 7, 11, 18],
};

export interface Chord {
  symbol: string;
  /** Pitch class of the root, 0 = C. */
  root: number;
  /** Pitch class of the bass note (differs from the root for slash chords such as `F/A`). */
  bass: number;
  /** Intervals above the root, in stacking order. */
  intervals: number[];
}

function pitchClass(name: string): number {
  const m = /^([A-G])([#b]?)$/.exec(name);
  if (!m) throw new Error(`Not a note name: "${name}"`);
  return (LETTER[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
}

/** Parses a chord symbol such as `Cmaj7`, `F#m7b5`, `Bb13`, `C7sus4` or `F/A`. Throws on anything it does not know. */
export function parseChord(symbol: string): Chord {
  const m = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/.exec(symbol.trim());
  if (!m) throw new Error(`Not a chord symbol: "${symbol}"`);
  const intervals = QUALITY[m[2]];
  if (!intervals) throw new Error(`Unknown chord quality "${m[2]}" in "${symbol}"`);
  const root = pitchClass(m[1]);
  return { symbol, root, bass: m[3] ? pitchClass(m[3]) : root, intervals };
}

/** Pitch classes in the chord (0–11, no duplicates). */
export function chordTones(c: Chord): number[] {
  return [...new Set(c.intervals.map((i) => (c.root + i) % 12))];
}

/** The lowest MIDI note with pitch class `pc` at or above `min`. */
export function noteAtOrAbove(pc: number, min: number): number {
  return min + ((pc - min) % 12 + 12) % 12;
}

/**
 * Voices `chord` within roughly [low, low + 16] as close as possible to `previous` (total movement of the voices).
 * Upper extensions are kept, the root may be left out of four-plus-note chords (the bass plays it), and no two voices
 * are closer than a whole tone at the bottom, which keeps the voicing from sounding muddy.
 */
export function voiceChord(chord: Chord, previous: number[] | null, low = 52, voices = 4): number[] {
  let pcs = chordTones(chord);
  if (pcs.length > voices) pcs = pcs.filter((pc) => pc !== chord.root).slice(0, voices);
  const candidates: number[][] = [];
  for (let rot = 0; rot < pcs.length; rot++) {
    const order = [...pcs.slice(rot), ...pcs.slice(0, rot)];
    for (const start of [low, low + 2, low + 4]) {
      const notes: number[] = [];
      let floor = start;
      for (const pc of order) {
        const n = noteAtOrAbove(pc, floor);
        notes.push(n);
        floor = n + 1;
      }
      if (notes[1] - notes[0] >= 2 && notes[notes.length - 1] - notes[0] <= 16) candidates.push(notes);
    }
  }
  if (!candidates.length) return pcs.map((pc) => noteAtOrAbove(pc, low));
  if (!previous) return candidates.sort((a, b) => Math.abs(centre(a) - (low + 7)) - Math.abs(centre(b) - (low + 7)))[0];
  return candidates.sort((a, b) => movement(a, previous) - movement(b, previous))[0];
}

const centre = (v: number[]) => v.reduce((s, n) => s + n, 0) / v.length;

/** Total distance the voices travel (each new note to the nearest old one). */
function movement(next: number[], prev: number[]): number {
  return next.reduce((sum, n) => sum + Math.min(...prev.map((p) => Math.abs(p - n))), 0) + Math.abs(centre(next) - centre(prev));
}

/** The bass note for a chord, in the octave starting at `low` (default E1 to D#2: a clear, warm bass register). */
export function bassNote(chord: Chord, low = 33): number {
  return noteAtOrAbove(chord.bass, low);
}

export const midiToFreq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
