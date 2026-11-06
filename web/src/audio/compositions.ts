/**
 * The background music, written as compositions in sections, so a piece develops for one to three minutes before it
 * repeats instead of cycling a few bars. Each section has a chord progression, a melody, optionally a counter-melody,
 * and a texture (how much of the band plays). Each style (styles.ts) arranges the same music with its own
 * instruments, so a piece keeps its identity whatever the style.
 *
 * Notation, one string per section, bars separated by `|`:
 *   chords   `Fmaj7 | Am7 D7 | Gm7 |`  (two chords in a bar split it evenly)
 *   melody   `r:1 A4:.5 C5:.5 E5:1.5 r:.5 | …`  (note or rest, then its length in beats; every bar adds up to 4)
 *
 * The pieces use more than plain triads: seventh and ninth chords, secondary dominants, borrowed chords (the minor iv
 * in a major key), chromatic-mediant key changes, a lift of a whole step for the last chorus, ii–V chains, and
 * counter-melodies built from guide tones (the 3rds and 7ths that define each chord). Unit tests check that every bar
 * adds up, that sections line up with their chords, and that strong-beat melody notes agree with the harmony.
 */
import type { MusicId } from './engine';
import { noteToMidi } from './theory';

/** [start beat, MIDI note, length in beats, velocity 0–1] */
export type MelodyNote = [beat: number, midi: number, beats: number, vel?: number];

export type Energy = 'none' | 'light' | 'groove' | 'drive' | 'half';

export interface Texture {
  /** Drum feel for the section ('half' is a half-time feel: the backbeat on beat 3). */
  drums: Energy;
  /** Bass line (default on). */
  bass?: boolean;
  /** The style's chord accompaniment (default on). */
  comp?: boolean;
  /** A sustained pad under everything. */
  pad?: boolean;
  /** A drum fill in the last bar, leading into the next section. */
  fill?: boolean;
  /** A cymbal crash on the first beat of the section. */
  crash?: boolean;
  /** "HKUST" tapped in Morse code on a woodblock from the first bar (and again halfway through long sections). */
  morse?: boolean;
  /** Sea waves under the section, one every two bars. */
  surf?: boolean;
}

export interface Section {
  name: string;
  chords: string;
  melody?: string;
  counter?: string;
  texture: Texture;
  /** Transpose the melody, counter and chords by this many semitones (to restate a section in a new key). */
  transpose?: number;
}

export interface Composition {
  id: MusicId;
  title: string;
  bpm: number;
  sections: Section[];
}

// ---------------------------------------------------------------------------------------------------------------
// Notation
// ---------------------------------------------------------------------------------------------------------------

const bars = (s: string) => s.split('|').map((b) => b.trim()).filter(Boolean);

/** Chord symbols with their lengths in beats. */
export function parseChordBars(s: string, transpose = 0): [string, number][] {
  return bars(s).flatMap((bar) => {
    const chords = bar.split(/\s+/);
    return chords.map((c): [string, number] => [transpose ? transposeChord(c, transpose) : c, 4 / chords.length]);
  });
}

/** Melody notes, timed in beats from the start of the section. */
export function parseMelody(s: string, transpose = 0): MelodyNote[] {
  const out: MelodyNote[] = [];
  bars(s).forEach((bar, i) => {
    let t = i * 4;
    for (const tok of bar.split(/\s+/)) {
      const [name, len] = tok.split(':');
      const beats = Number(len);
      if (!(beats > 0)) throw new Error(`Bad length in "${tok}"`);
      if (name !== 'r') out.push([t, noteToMidi(name) + transpose, beats, Math.abs(t % 4) < 1e-9 ? 0.9 : 0.78]);
      t += beats;
    }
  });
  return out;
}

/** Length in beats of each bar of a melody string (for tests). */
export function barLengths(s: string): number[] {
  return bars(s).map((bar) => bar.split(/\s+/).reduce((n, tok) => n + Number(tok.split(':')[1]), 0));
}

const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const PC: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11 };
function transposeChord(sym: string, by: number): string {
  return sym.replace(/^([A-G][#b]?)/, (r) => NAMES[(PC[r] + by + 120) % 12]).replace(/\/([A-G][#b]?)$/, (_, r) => '/' + NAMES[(PC[r] + by + 120) % 12]);
}

// ---------------------------------------------------------------------------------------------------------------
// Doors open: the lobby. F major, about 2¼ minutes.
// Intro → theme → variation (secondary dominants) → B (borrowed minor iv) → theme with a guide-tone counter-melody →
// bridge a minor third up in A-flat (a chromatic mediant) that slides back via D-flat → final theme → outro.
// ---------------------------------------------------------------------------------------------------------------

const LOBBY_A_CHORDS = 'Fmaj7 | Am7 | Bbmaj7 | C7sus4 C7 | Fmaj7 | Dm7 | Gm7 | Bbmaj7 C7';
const LOBBY_A = 'r:1 A4:.5 C5:.5 E5:1.5 r:.5 | r:.5 D5:.5 C5:1 A4:1.5 r:.5 | r:1 Bb4:.5 C5:.5 D5:1 F5:1 | G5:1.5 F5:.5 E5:2 | r:1 A4:.5 C5:.5 E5:1 A5:1 | G5:1 F5:1 D5:2 | r:1 Bb4:.5 D5:.5 F5:1 E5:1 | D5:1 C5:1 Bb4:1 G4:1';

const lobby: Composition = {
  id: 'lobby',
  title: 'Doors open',
  bpm: 100,
  sections: [
    {
      name: 'intro', chords: 'Fmaj9 | Bbmaj9 | Fmaj9 | Gm7 C7sus4',
      counter: 'r:2 C6:1 A5:1 | r:2 D6:1 C6:1 | r:2 A5:1 G5:1 | r:2 G5:2',
      texture: { drums: 'none', pad: true, comp: false },
    },
    { name: 'theme', chords: LOBBY_A_CHORDS, melody: LOBBY_A, texture: { drums: 'light' } },
    {
      name: 'variation', chords: 'Fmaj7 | Am7 D7 | Gm7 | C7 | Am7 | D7 | Gm7 C7 | Fmaj7',
      melody: 'r:1 A4:.5 C5:.5 E5:1 F5:1 | E5:1.5 C5:.5 F#5:1 A5:1 | G5:1 F5:.5 D5:.5 Bb4:2 | r:.5 C5:.5 E5:.5 G5:.5 Bb5:1.5 A5:.5 | G5:1 E5:1 C5:2 | r:.5 D5:.5 F#5:.5 A5:.5 C6:2 | Bb5:1 A5:.5 G5:.5 E5:1 G5:1 | F5:3 r:1',
      texture: { drums: 'light', fill: true },
    },
    {
      name: 'b', chords: 'Bbmaj7 | Bbm6 | Am7 | Dm7 | Gm7 | Gm7/C | Am7 | Bbmaj7 C7',
      melody: 'D5:2 F5:1 A5:1 | G5:2 F5:1 Db5:1 | C5:3 E5:1 | F5:2 E5:1 D5:1 | Bb4:1 D5:1 F5:1 A5:1 | G5:2 F5:1 D5:1 | C5:1.5 E5:.5 G5:2 | F5:2 E5:2',
      texture: { drums: 'half', pad: true, crash: true },
    },
    {
      name: 'theme with counter-melody', chords: LOBBY_A_CHORDS, melody: LOBBY_A,
      counter: 'A4:4 | G4:4 | F4:4 | F4:2 E4:2 | E4:4 | F4:4 | F4:4 | D4:2 E4:2',
      texture: { drums: 'groove', fill: true, crash: true },
    },
    {
      name: 'bridge (A-flat)', chords: 'Eb7 | Abmaj7 | Fm7 | Dbmaj7 | Bbm7 | Eb7 | Dbmaj7 | C7sus4 C7',
      melody: 'G5:1 Bb5:1 Db6:2 | C6:3 G5:1 | Ab5:1.5 G5:.5 F5:1 C5:1 | F5:3 r:1 | Db5:1 F5:1 Ab5:1 Bb5:1 | G5:2 F5:1 Eb5:1 | F5:2 Ab5:1 C6:1 | Bb5:2 G5:1 E5:1',
      texture: { drums: 'light', pad: true, fill: true, crash: true },
    },
    {
      name: 'final theme', chords: 'Fmaj7 | Am7 | Bbmaj7 | Bbm6 | Am7 | Dm7 | Gm7 C7 | Fmaj7',
      melody: 'r:1 A4:.5 C5:.5 E5:1.5 r:.5 | r:.5 D5:.5 C5:1 A4:1.5 r:.5 | r:1 Bb4:.5 C5:.5 D5:1 F5:1 | G5:1.5 F5:.5 Db5:2 | r:1 A4:.5 C5:.5 E5:1 A5:1 | G5:1 F5:1 D5:2 | Bb4:1 D5:1 E5:1 G5:1 | F5:4',
      counter: 'A4:4 | G4:4 | F4:4 | F4:4 | E4:4 | F4:4 | F4:2 E4:2 | E4:4',
      texture: { drums: 'groove', crash: true },
    },
    {
      name: 'outro', chords: 'Fmaj9 | Dbmaj7 | Gm7 | C7sus4 C7',
      counter: 'r:2 A5:1 C6:1 | r:2 F5:1 Ab5:1 | r:2 Bb5:1 A5:1 | G5:2 E5:2',
      texture: { drums: 'none', pad: true, comp: false },
    },
  ],
};

// ---------------------------------------------------------------------------------------------------------------
// Thinking time: the timed quiz. A minor, about 1¾ minutes. Focused and steady, never busy enough to distract.
// Intro → theme → variation (half-diminished ii, a ii–V–I into C) → lift into the relative major → breakdown over the
// flat-II (B-flat) → theme with counter-melody.
// ---------------------------------------------------------------------------------------------------------------

const QUIZ_A_CHORDS = 'Am | Am/G | Fmaj7 | E7sus4 E7 | Am | Am/G | Dm7 | E7';
const QUIZ_A = 'E5:1 r:.5 C5:.5 B4:.5 C5:1.5 | A4:1 r:.5 B4:.5 C5:1 D5:1 | E5:1.5 F5:.5 E5:1 C5:1 | D5:2 B4:1 G#4:1 | A4:1 r:.5 C5:.5 E5:1 G5:1 | A5:1.5 G5:.5 E5:2 | F5:1 D5:1 C5:1 A4:1 | B4:1 G#4:1 E4:2';

const quiz: Composition = {
  id: 'quiz',
  title: 'Thinking time',
  bpm: 112,
  sections: [
    { name: 'intro', chords: 'Am | Am/G | Fmaj7 | E7sus4 E7', texture: { drums: 'light', pad: true } },
    { name: 'theme', chords: QUIZ_A_CHORDS, melody: QUIZ_A, texture: { drums: 'groove' } },
    {
      name: 'variation', chords: 'Am | Am/G | F#m7b5 | Fmaj7 | Dm7 | G7 | Cmaj7 | E7',
      melody: 'C5:1.5 E5:.5 A5:2 | G5:1 E5:1 C5:1 B4:1 | A5:1.5 F#5:.5 C5:2 | E5:2 F5:1 A5:1 | F5:1.5 E5:.5 D5:1 A4:1 | B4:1 D5:1 F5:1 G5:1 | E5:2 B4:1 C5:1 | D5:1 B4:1 G#4:2',
      counter: 'E4:4 | E4:4 | E4:4 | E4:4 | F4:4 | F4:4 | E4:4 | D4:2 E4:2',
      texture: { drums: 'groove', fill: true },
    },
    {
      name: 'relative major', chords: 'Fmaj7 | G | Em7 | Am7 | Dm7 | G7 | Cmaj7 | E7sus4 E7',
      melody: 'A5:2 C6:1 A5:1 | B5:1.5 A5:.5 G5:2 | G5:1 B5:1 E6:2 | C6:3 r:1 | A5:1 F5:1 D5:1 F5:1 | G5:1.5 F5:.5 D5:1 B4:1 | C5:1 E5:1 G5:1 B5:1 | A5:2 G#5:2',
      texture: { drums: 'groove', pad: true, crash: true, fill: true },
    },
    {
      name: 'breakdown', chords: 'Am | Fmaj7 | Am | Fmaj7 | Dm7 | Bbmaj7 | E7sus4 | E7',
      melody: 'E5:4 | r:2 C5:1 E5:1 | A5:4 | r:2 G5:1 E5:1 | F5:2 A5:2 | D5:2 F5:2 | E5:2 A4:2 | G#4:2 B4:1 D5:1',
      texture: { drums: 'half', comp: false, pad: true, fill: true },
    },
    {
      name: 'theme with counter-melody', chords: QUIZ_A_CHORDS, melody: QUIZ_A,
      counter: 'C4:4 | C4:4 | C4:4 | D4:4 | C4:4 | E4:4 | F4:4 | E4:4',
      texture: { drums: 'groove', crash: true, fill: true },
    },
  ],
};

// ---------------------------------------------------------------------------------------------------------------
// Ten seconds: the final countdown. Each two bars restate the figure a semitone higher (A minor, B-flat minor,
// B minor, C minor) over i–♭VI, so the tension keeps rising, and the last bar sits on the dominant. About 14 seconds:
// longer than the ten seconds it is used for, so it never audibly loops.
// ---------------------------------------------------------------------------------------------------------------

const rise = (low: string, high: string) => Array.from({ length: 4 }, () => `${low}:.5 ${high}:.5`).join(' ');
const countdown: Composition = {
  id: 'countdown',
  title: 'Ten seconds',
  bpm: 140,
  sections: [
    { name: 'A minor', chords: 'Am | F/A', melody: `${rise('E5', 'F5')} | ${rise('F5', 'G5')}`, texture: { drums: 'drive' } },
    { name: 'B-flat minor', chords: 'Bbm | Gb/Bb', melody: `${rise('F5', 'Gb5')} | ${rise('Gb5', 'Ab5')}`, texture: { drums: 'drive', crash: true } },
    { name: 'B minor', chords: 'Bm | G/B', melody: `${rise('F#5', 'G5')} | ${rise('G5', 'A5')}`, texture: { drums: 'drive', crash: true } },
    { name: 'C minor to the dominant', chords: 'Cm | G7', melody: `${rise('G5', 'Ab5')} | B5:.5 D6:.5 B5:.5 D6:.5 B5:2`, texture: { drums: 'drive', crash: true, fill: true } },
  ],
};

// ---------------------------------------------------------------------------------------------------------------
// The reveal: results and the leaderboard. C major, about 1½ minutes, celebratory.
// Fanfare → theme → second theme (into C7) → bridge with the borrowed minor iv (Fm6) turning to A7 → the theme again,
// a whole step up in D (the last-chorus lift) with a counter-melody → outro back towards C.
// ---------------------------------------------------------------------------------------------------------------

const REVEAL_A_CHORDS = 'C | G/B | Am7 | F G | C | Em7 A7 | Dm7 G7 | C';
const REVEAL_A = 'G5:.5 C6:.5 B5:.5 C6:1.5 r:.5 G5:.5 | B5:1 A5:.5 G5:1.5 D5:1 | E5:.5 G5:.5 C6:1 B5:1 A5:1 | A5:1 F5:1 G5:1 B5:1 | C6:1.5 G5:.5 E5:1 G5:1 | B5:1 G5:1 C#6:1 A5:1 | A5:1 F5:1 G5:1 B5:1 | C6:3 r:1';

const results: Composition = {
  id: 'results',
  title: 'The reveal',
  bpm: 118,
  sections: [
    { name: 'fanfare', chords: 'C | G7', melody: 'G4:.5 C5:.5 E5:.5 G5:2.5 | F5:1 D5:1 B4:1 G4:1', texture: { drums: 'groove', crash: true, fill: true } },
    { name: 'theme', chords: REVEAL_A_CHORDS, melody: REVEAL_A, texture: { drums: 'groove', crash: true } },
    {
      name: 'second theme', chords: 'F | G | Em7 | Am7 | Dm7 | G7 | Cmaj7 | C7',
      melody: 'A5:1.5 F5:.5 C6:2 | B5:1.5 G5:.5 D6:2 | B5:1 G5:1 E5:1 G5:1 | C6:2 E6:1 C6:1 | F5:1 A5:1 C6:1 A5:1 | B5:1.5 A5:.5 G5:1 F5:1 | E5:1 G5:1 B5:2 | Bb5:2 G5:1 E5:1',
      counter: 'A4:4 | B4:4 | B4:4 | C5:4 | C5:4 | B4:4 | B4:4 | Bb4:4',
      texture: { drums: 'groove', fill: true },
    },
    {
      name: 'bridge', chords: 'Fmaj7 | Fm6 | Em7 | A7 | Dm7 | G7 | Em7 | A7sus4 A7',
      melody: 'A5:2 G5:1 F5:1 | Ab5:2 F5:1 D5:1 | G5:3 B5:1 | A5:2 G5:1 E5:1 | F5:1.5 E5:.5 D5:1 A5:1 | B5:2 D6:1 B5:1 | G5:2 E5:1 B4:1 | D5:2 C#5:1 E5:1',
      texture: { drums: 'half', pad: true, crash: true, fill: true },
    },
    {
      name: 'theme, a step up', chords: REVEAL_A_CHORDS, melody: REVEAL_A, transpose: 2,
      counter: 'E4:4 | D4:4 | C4:4 | C4:2 B3:2 | C4:4 | D4:2 C#4:2 | C4:2 B3:2 | C4:4',
      texture: { drums: 'drive', crash: true, fill: true },
    },
    {
      name: 'outro', chords: 'D | Bm7 | Em7 | G7',
      melody: 'F#5:2 A5:2 | D6:3 r:1 | B5:2 G5:2 | F5:2 D5:1 B4:1',
      texture: { drums: 'groove', crash: true, fill: true },
    },
  ],
};

// ---------------------------------------------------------------------------------------------------------------
// Coffee: breaks. E-flat major, swung, about 2¾ minutes, laid back.
// Intro → head → variation (secondary dominant C7 to Fm) → B (borrowed A-flat minor 6) → head with guide-tone
// counter-melody → a solo chorus of eighth-note lines over a ii–V chain (with a minor ii–V into C minor) → head → outro.
// ---------------------------------------------------------------------------------------------------------------

const COFFEE_A_CHORDS = 'Ebmaj9 | Cm9 | Abmaj9 | Bb13 | Gm7 | Cm9 | Fm9 | Bb7sus4 Bb7';
const COFFEE_A = 'r:.5 G5:.5 Bb5:1 r:.5 F5:.5 G5:1 | r:.5 Eb5:.5 F5:1.5 r:.5 D5:1 | r:.5 C5:.5 Eb5:1 G5:1.5 F5:.5 | G5:2 D5:.5 F5:1.5 | r:.5 Bb5:.5 G5:1 F5:1 D5:1 | Eb5:2 r:.5 D5:.5 C5:1 | r:.5 Ab4:.5 C5:1 Eb5:1 G5:1 | F5:2 D5:1 Bb4:1';
const COFFEE_A2_CHORDS = 'Ebmaj9 | C7 | Fm9 | Bb13 | Gm7 | C7 | Fm9 Bb7 | Ebmaj9';
const COFFEE_A2 = 'Bb5:1.5 G5:.5 F5:1 Eb5:1 | E5:1.5 G5:.5 Bb5:2 | Ab5:1 G5:1 F5:1 C5:1 | D5:1.5 F5:.5 G5:2 | D5:1 F5:1 Bb5:1 G5:1 | E5:2 G5:1 Bb5:1 | Ab5:1 G5:1 F5:1 D5:1 | Eb5:3 r:1';

const breakTime: Composition = {
  id: 'break',
  title: 'Coffee',
  bpm: 80,
  sections: [
    { name: 'intro', chords: 'Ebmaj9 | Cm9 | Abmaj9 | Bb13', counter: 'r:2 G5:1 F5:1 | r:2 Eb5:1 D5:1 | r:2 C5:1 Bb4:1 | r:2 D5:2', texture: { drums: 'none', pad: true } },
    { name: 'head', chords: COFFEE_A_CHORDS, melody: COFFEE_A, texture: { drums: 'light' } },
    { name: 'variation', chords: COFFEE_A2_CHORDS, melody: COFFEE_A2, texture: { drums: 'light', fill: true } },
    {
      name: 'b', chords: 'Abmaj7 | Abm6 | Gm7 | C7 | Fm9 | Bb13 | Gm7 C7 | Fm9 Bb7',
      melody: 'C6:2 Bb5:1 G5:1 | Cb6:2 Ab5:1 F5:1 | Bb5:1.5 G5:.5 F5:1 D5:1 | E5:2 G5:1 Bb5:1 | Ab5:2 G5:1 Eb5:1 | F5:2 G5:2 | D5:2 E5:2 | C5:1 Eb5:1 D5:1 F5:1',
      texture: { drums: 'groove', pad: true, fill: true },
    },
    {
      name: 'head with counter-melody', chords: COFFEE_A_CHORDS, melody: COFFEE_A,
      counter: 'G4:4 | G4:4 | G4:4 | Ab4:4 | F4:4 | Eb4:4 | Eb4:4 | Eb4:2 D4:2',
      texture: { drums: 'light', fill: true },
    },
    {
      name: 'solo', chords: 'Fm9 | Bb13 | Ebmaj9 | Abmaj9 | Dm7b5 | G7 | Cm9 | Bb7sus4 Bb7',
      melody: 'C5:.5 Eb5:.5 G5:.5 Ab5:.5 G5:.5 F5:.5 Eb5:.5 C5:.5 | D5:.5 F5:.5 Ab5:.5 G5:.5 F5:.5 D5:.5 C5:.5 Bb4:.5 | G4:1 Bb4:.5 D5:.5 F5:1 Eb5:1 | C5:.5 Eb5:.5 G5:.5 Bb5:.5 C6:2 | F5:.5 Ab5:.5 C6:.5 Ab5:.5 F5:.5 D5:.5 F5:1 | B4:.5 D5:.5 F5:.5 Ab5:.5 G5:1 F5:1 | Eb5:2 D5:1 C5:1 | Eb5:1 F5:1 D5:1 Bb4:1',
      texture: { drums: 'groove', fill: true, crash: true },
    },
    { name: 'head', chords: COFFEE_A2_CHORDS, melody: COFFEE_A2, counter: 'G4:4 | G4:4 | Ab4:4 | Ab4:4 | F4:4 | E4:4 | Eb4:2 D4:2 | D4:4', texture: { drums: 'light' } },
    { name: 'outro', chords: 'Abmaj9 | Abm6 | Ebmaj9 | Bb7sus4', counter: 'r:2 C5:1 Eb5:1 | r:2 Eb5:1 F5:1 | G5:4 | F5:4', texture: { drums: 'none', pad: true } },
  ],
};

// ---------------------------------------------------------------------------------------------------------------
// Encore: the session has ended. A major, about 1½ minutes, warm and unhurried while people read their results.
// Intro → theme → B in the relative minor, with the borrowed minor iv (Dm6), the wistful "goodbye" chord →
// theme with counter-melody → a plagal coda, D – Dm6 – A, the minor iv softening the final cadence.
// ---------------------------------------------------------------------------------------------------------------

const ENCORE_THEME = { chords: 'A | C#m7 | Dmaj7 | E7 | F#m7 | Bm7 | Dmaj7 E7 | A', melody: 'E5:1 A5:1 C#6:1.5 B5:.5 | G#5:2 E5:1 C#5:1 | F#5:1.5 E5:.5 D5:1 C#5:1 | B4:2 D5:1 E5:1 | A5:1 C#6:1 E5:2 | D6:1.5 C#6:.5 B5:2 | A5:2 G#5:2 | A5:4' };
const encore: Composition = {
  id: 'ended',
  title: 'Encore',
  bpm: 84,
  sections: [
    { name: 'intro', chords: 'A | F#m7 | Dmaj7 | E7sus4 E7', texture: { drums: 'light', pad: true } },
    { name: 'theme', ...ENCORE_THEME, texture: { drums: 'light' } },
    {
      name: 'b', chords: 'F#m | Dmaj7 | Bm7 | E7 | Dmaj7 | Dm6 | C#m7 F#7 | Bm7 E7',
      melody: 'C#6:2 A5:1 F#5:1 | A5:2 C#6:2 | D6:1 B5:1 F#5:2 | G#5:3 r:1 | F#5:2 A5:2 | F5:2 B5:2 | E5:2 A#5:2 | D5:2 B4:1 G#4:1',
      texture: { drums: 'half', pad: true, fill: true },
    },
    { name: 'theme with counter-melody', ...ENCORE_THEME, counter: 'C#5:4 | B4:4 | A4:4 | G#4:4 | A4:4 | A4:4 | A4:2 G#4:2 | A4:4', texture: { drums: 'groove', crash: true, fill: true } },
    { name: 'plagal coda', chords: 'D | Dm6 | A | A', melody: 'F#5:4 | F5:4 | E5:4 | A4:4', texture: { drums: 'none', pad: true, comp: false } },
  ],
};

export const COMPOSITIONS: Record<MusicId, Composition> = { lobby, quiz, countdown, results, break: breakTime, ended: encore };

/** A section with its notation resolved, placed at `start` beats into the piece. */
export interface ResolvedSection {
  section: Section;
  start: number;
  beats: number;
  chords: [string, number][];
  melody: MelodyNote[];
  counter: MelodyNote[];
}

const resolvedCache = new Map<Composition, ResolvedSection[]>();
export function resolve(c: Composition): ResolvedSection[] {
  if (resolvedCache.has(c)) return resolvedCache.get(c)!;
  let start = 0;
  const out = c.sections.map((section) => {
    const t = section.transpose ?? 0;
    const chords = parseChordBars(section.chords, t);
    const beats = chords.reduce((n, [, b]) => n + b, 0);
    const r: ResolvedSection = { section, start, beats, chords, melody: section.melody ? parseMelody(section.melody, t) : [], counter: section.counter ? parseMelody(section.counter, t) : [] };
    start += beats;
    return r;
  });
  resolvedCache.set(c, out);
  return out;
}

export const loopBeats = (c: Composition) => resolve(c).reduce((n, s) => n + s.beats, 0);

/** The chord sounding at `beat` (within one loop). */
export function chordAt(c: Composition, beat: number): string {
  for (const s of resolve(c)) {
    if (beat >= s.start + s.beats) continue;
    let t = s.start;
    for (const [sym, beats] of s.chords) {
      if (beat < t + beats) return sym;
      t += beats;
    }
  }
  const last = resolve(c).at(-1)!;
  return last.chords.at(-1)![0];
}
