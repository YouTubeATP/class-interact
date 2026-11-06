/**
 * Sound effects as short musical phrases rather than beeps. Each is written once (MIDI notes, chords and percussion,
 * timed in seconds) and played with the current style's instruments, so a "correct" sounds like the same idea in
 * every style. They share a tonal centre around C and F, so effects heard back to back belong together.
 *
 * Rules of thumb behind them: good news rises and lands on the tonic (correct, points, podium); something to notice
 * rises and stays open (question, poll, results); disappointment is gentle and short, never a harsh buzzer
 * (incorrect is a soft falling minor second); time is marked with bells and a woodblock, not alarms.
 */
import type { SoundId } from './engine';
import type { DrumId } from './instruments';

export interface SfxDef {
  /** [MIDI note, start (s), length (s), level] played with the style's lead voice. */
  notes?: [number, number, number, number?][];
  /** [MIDI notes, start, length, level] played together with the style's chord voice. */
  chords?: [number[], number, number, number?][];
  /** [drum, start, velocity] from the style's kit. */
  perc?: [DrumId, number, number][];
  gain: number;
}

const C = [60, 64, 67, 72];
const F = [65, 69, 72, 77];
const G = [67, 71, 74, 79];
const Bb = [62, 65, 70, 74];

export const SFX: Record<SoundId, SfxDef> = {
  // session
  sessionStart: { notes: [[65, 0, 0.3], [69, 0.09, 0.3], [72, 0.18, 0.3], [76, 0.27, 0.35], [79, 0.36, 0.9]], chords: [[[53, 60, 64, 69], 0.36, 1.1, 0.5]], gain: 0.5 },
  sessionEnd: { chords: [[Bb, 0, 0.45, 0.7], [[64, 67, 70, 72], 0.38, 0.45, 0.7], [F, 0.76, 1.4, 0.9]], notes: [[81, 0.76, 1.2, 0.6]], gain: 0.42 },
  activityStart: { notes: [[72, 0, 0.12], [79, 0.08, 0.12], [84, 0.16, 0.4]], gain: 0.42 },
  transition: { notes: [[79, 0, 0.1, 0.6], [84, 0.07, 0.2, 0.5]], gain: 0.26 },
  standbyIn: { notes: [[79, 0, 0.2], [74, 0.15, 0.2], [72, 0.3, 0.5]], gain: 0.3 },
  standbyOut: { notes: [[72, 0, 0.15], [74, 0.12, 0.15], [79, 0.24, 0.4]], gain: 0.3 },

  // answering
  select: { notes: [[84, 0, 0.05]], gain: 0.16 },
  submit: { notes: [[79, 0, 0.08], [84, 0.07, 0.2]], gain: 0.32 },
  poll: { notes: [[76, 0, 0.08], [81, 0.07, 0.18]], gain: 0.3 },
  word: { notes: [[81, 0, 0.06], [88, 0.06, 0.16]], gain: 0.27 },
  survey: { notes: [[72, 0, 0.1], [76, 0.09, 0.1], [81, 0.18, 0.28]], gain: 0.3 },
  allAnswered: { notes: [[72, 0, 0.08], [79, 0.07, 0.08], [84, 0.14, 0.08], [88, 0.21, 0.3]], gain: 0.26 },

  // time
  tick: { perc: [['block', 0, 0.6]], gain: 0.5 },
  tickFinal: { perc: [['blockHigh', 0, 0.9]], gain: 0.6 },
  timeUp: { notes: [[88, 0, 0.14], [88, 0.17, 0.7]], chords: [[[48, 55, 60], 0.17, 0.9, 0.6]], gain: 0.42 },

  // the reveal
  reveal: { perc: [['roll', 0, 0.5]], chords: [[G, 0.36, 0.6]], notes: [[83, 0.36, 0.6]], gain: 0.4 },
  correct: { notes: [[72, 0, 0.09], [76, 0.07, 0.09], [79, 0.14, 0.09], [84, 0.21, 0.5]], chords: [[C, 0.21, 0.6, 0.45]], gain: 0.46 },
  partial: { notes: [[72, 0, 0.1], [76, 0.09, 0.1], [74, 0.2, 0.45]], gain: 0.38 },
  incorrect: { notes: [[64, 0, 0.18, 0.9], [63, 0.17, 0.45, 0.75]], gain: 0.32 },
  results: { notes: [[79, 0, 0.1], [83, 0.08, 0.1], [86, 0.16, 0.3]], gain: 0.3 },
  points: { notes: [[83, 0, 0.07], [88, 0.07, 0.3]], gain: 0.3 },

  // standings
  leaderboard: {
    notes: [[72, 0, 0.1], [72, 0.12, 0.07], [72, 0.2, 0.07], [77, 0.3, 0.6]],
    chords: [[F, 0.3, 0.7, 0.6]], perc: [['crash', 0.3, 0.5]], gain: 0.42,
  },
  rankUp: { notes: [[79, 0, 0.07], [84, 0.06, 0.07], [88, 0.12, 0.2]], gain: 0.28 },
  podium: {
    notes: [[67, 0, 0.14], [72, 0.15, 0.14], [76, 0.3, 0.14], [79, 0.45, 0.28], [76, 0.75, 0.12], [79, 0.87, 1]],
    chords: [[C, 0.87, 1.2, 0.7]], perc: [['roll', 0.45, 0.35], ['crash', 0.87, 0.6]], gain: 0.45,
  },

  // around the session
  question: { notes: [[74, 0, 0.08], [79, 0.08, 0.22]], gain: 0.26 },
  upvote: { notes: [[84, 0, 0.05], [91, 0.04, 0.08]], gain: 0.17 },
  breakStart: { notes: [[79, 0, 0.3], [74, 0.25, 0.3], [67, 0.5, 0.8]], chords: [[[55, 60, 64, 67], 0.5, 1, 0.4]], gain: 0.3 },
  breakEnd: { notes: [[67, 0, 0.15], [74, 0.14, 0.15], [79, 0.28, 0.5]], chords: [[G, 0.28, 0.6, 0.4]], gain: 0.34 },
  joined: { notes: [[93, 0, 0.05, 0.8]], gain: 0.11 },
};

/**
 * The HKUST set's sound effects: a complete set of its own, each derived from its motifs (see compositions-hkust.ts):
 * the anthem's CALL (F♯ G A … A E F♯, D C♯ D E F♯), its CLIMB (D G … B, A F♯ E D B C♯ D) and the HKUST cryptogram
 * (B D G E♭ F), in D major, played on its orchestral instruments.
 */
const D = [62, 66, 69, 74];
const A = [57, 61, 64, 69];
export const HKUST_SFX: Record<SoundId, SfxDef> = {
  // session: the CALL at its own rhythm, then the full orchestra on D
  sessionStart: { notes: [[78, 0, 0.12], [79, 0.12, 0.22], [69, 0.34, 0.12], [69, 0.46, 0.12], [69, 0.58, 0.2], [76, 0.78, 0.2], [76, 0.98, 0.12], [78, 1.1, 0.7]], chords: [[D, 1.1, 1.2, 0.55]], perc: [['kick', 1.1, 0.7], ['crash', 1.1, 0.45]], gain: 0.5 },
  // the cryptogram, then A7 to D: the session signs off with its name
  sessionEnd: { notes: [[71, 0, 0.2], [74, 0.18, 0.2], [79, 0.36, 0.32], [75, 0.66, 0.26], [77, 0.9, 0.3]], chords: [[[57, 61, 64, 67], 1.2, 0.45, 0.7], [[50, 62, 66, 69], 1.62, 1.4, 0.85]], perc: [['kick', 1.62, 0.6]], gain: 0.42 },
  // the CALL's turn, D C♯ D E: "here we go"
  activityStart: { notes: [[74, 0, 0.08], [73, 0.08, 0.08], [74, 0.16, 0.12], [76, 0.28, 0.12], [78, 0.4, 0.35]], gain: 0.42 },
  transition: { notes: [[81, 0, 0.1, 0.6], [86, 0.07, 0.2, 0.5]], gain: 0.26 },
  // the CALL's first fall, F♯ to A, for "step away"; its rise, A E F♯, for "we're back"
  standbyIn: { notes: [[78, 0, 0.2], [69, 0.18, 0.55]], gain: 0.3 },
  standbyOut: { notes: [[69, 0, 0.15], [76, 0.14, 0.15], [78, 0.28, 0.45]], gain: 0.3 },

  // answering
  select: { notes: [[86, 0, 0.05]], gain: 0.16 },
  submit: { notes: [[74, 0, 0.07], [78, 0.07, 0.2]], gain: 0.32 },
  poll: { notes: [[78, 0, 0.08], [81, 0.07, 0.18]], gain: 0.3 },
  word: { notes: [[81, 0, 0.06], [86, 0.06, 0.16]], gain: 0.27 },
  survey: { notes: [[74, 0, 0.1], [78, 0.09, 0.1], [81, 0.18, 0.28]], gain: 0.3 },
  allAnswered: { notes: [[74, 0, 0.08], [78, 0.07, 0.08], [81, 0.14, 0.08], [86, 0.21, 0.3]], chords: [[D, 0.21, 0.5, 0.35]], gain: 0.28 },

  // time: a woodblock, the final seconds a step higher, and the bells
  tick: { perc: [['block', 0, 0.6]], gain: 0.5 },
  tickFinal: { perc: [['blockHigh', 0, 0.9]], gain: 0.6 },
  timeUp: { notes: [[86, 0, 0.14], [86, 0.17, 0.7]], chords: [[[50, 57, 62], 0.17, 0.9, 0.6]], perc: [['kick', 0.17, 0.8]], gain: 0.42 },

  // the reveal: a timpani roll onto the dominant, the answer hanging on A
  reveal: { perc: [['roll', 0, 0.5]], chords: [[A, 0.36, 0.6]], notes: [[76, 0.36, 0.6]], gain: 0.4 },
  // the CLIMB's cadence, B C♯ D, landing on the tonic with a glockenspiel sparkle
  correct: { notes: [[71, 0, 0.1], [73, 0.1, 0.1], [74, 0.2, 0.55], [86, 0.2, 0.4, 0.35]], chords: [[D, 0.2, 0.65, 0.5]], gain: 0.46 },
  partial: { notes: [[71, 0, 0.1], [73, 0.1, 0.1], [76, 0.2, 0.5]], gain: 0.4 },
  // the cryptogram's E♭ (the S) sinking to D: the Neapolitan resolving, softly
  incorrect: { notes: [[75, 0, 0.2, 0.9], [74, 0.18, 0.5, 0.75]], gain: 0.32 },
  // the CLIMB's leap, G to B, falling to A
  results: { notes: [[79, 0, 0.1], [83, 0.08, 0.1], [81, 0.16, 0.3]], gain: 0.3 },
  points: { notes: [[83, 0, 0.07], [86, 0.07, 0.3]], gain: 0.3 },

  // standings
  leaderboard: { notes: [[78, 0, 0.18], [69, 0.17, 0.25], [76, 0.4, 0.6]], chords: [[A, 0.4, 0.8, 0.6]], perc: [['roll', 0, 0.35], ['crash', 0.4, 0.5]], gain: 0.44 },
  rankUp: { notes: [[74, 0, 0.07], [79, 0.06, 0.07], [83, 0.12, 0.2]], gain: 0.28 },
  // the whole CLIMB, quickly, ending with the orchestra on D
  podium: {
    notes: [[74, 0, 0.1], [74, 0.1, 0.08], [79, 0.18, 0.08], [78, 0.26, 0.08], [79, 0.34, 0.1], [79, 0.44, 0.1], [83, 0.54, 0.1], [81, 0.64, 0.08], [78, 0.72, 0.1], [76, 0.82, 0.08], [74, 0.9, 0.1], [71, 1.0, 0.1], [73, 1.1, 0.08], [74, 1.18, 1.1]],
    chords: [[[50, 57, 62, 66, 69, 74], 1.18, 1.4, 0.8]], perc: [['roll', 0.6, 0.35], ['crash', 1.18, 0.7], ['kick', 1.18, 0.9]], gain: 0.46,
  },

  // around the session
  // the CALL's turn rising, C♯ D E: a question
  question: { notes: [[73, 0, 0.08], [74, 0.08, 0.08], [76, 0.16, 0.24]], gain: 0.26 },
  upvote: { notes: [[86, 0, 0.05], [93, 0.04, 0.08]], gain: 0.17 },
  // G, E♭, D: the cryptogram's Neapolitan sigh into a rest
  breakStart: { notes: [[79, 0, 0.3], [75, 0.25, 0.3], [74, 0.5, 0.8]], chords: [[D, 0.5, 1, 0.4]], gain: 0.3 },
  breakEnd: { notes: [[69, 0, 0.15], [76, 0.14, 0.15], [78, 0.28, 0.5]], chords: [[D, 0.28, 0.6, 0.4]], gain: 0.34 },
  joined: { notes: [[93, 0, 0.05, 0.8]], gain: 0.11 },
};
