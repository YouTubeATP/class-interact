/**
 * The HKUST sound effects: short orchestral cues, each written for particular instruments and drawn from the set's
 * motifs (pieces.ts): the anthem's CALL (F♯ G A · A A E E F♯, D C♯ D E), its CLIMB (D G … B, A F♯ E D B C♯ D) and the
 * HKUST cryptogram (B D G E♭ F) rung on tubular bells. They play on the same stage, in the same hall, as the music.
 */
import type { Ctx } from '../instruments';
import type { SoundId } from '../engine';
import { stage, type Stage } from './hall';
import { ORCHESTRA, type Instrument } from './instruments';

/** [instrument, MIDI note (ignored by unpitched percussion), start in seconds, length in seconds, velocity 0–1] */
export type Cue = [inst: Instrument, midi: number, at: number, len: number, vel?: number];
export interface CueSet { cues: Cue[]; gain: number }

const chord = (inst: Instrument, notes: number[], at: number, len: number, vel = 0.7): Cue[] => notes.map((n) => [inst, n, at, len, vel]);
const line = (inst: Instrument, notes: [midi: number, at: number, len: number][], vel = 0.8): Cue[] => notes.map(([n, at, len]) => [inst, n, at, len, vel]);
/** A harp chord rolled upwards. */
const roll = (notes: number[], at: number, vel = 0.7): Cue[] => notes.map((n, i) => ['harp', n, at + i * 0.035, 1.5, vel]);

const D = [62, 66, 69, 74];
const A7 = [57, 61, 64, 67];
const A = [57, 61, 64, 69];
const D3 = 50;
const A2 = 45;

export const HKUST_CUES: Record<SoundId, CueSet> = {
  // the session: the CALL on trumpet at the anthem's rhythm, the timpani rolling on A into the orchestra on D
  sessionStart: {
    cues: [
      ...line('trumpet', [[78, 0, 0.12], [79, 0.12, 0.22], [69, 0.34, 0.12], [69, 0.46, 0.12], [69, 0.58, 0.2], [76, 0.78, 0.2], [76, 0.98, 0.12], [78, 1.1, 0.9]], 0.85),
      ['timpaniRoll', A2, 0.55, 0.55, 0.7], ['timpani', D3, 1.1, 1, 0.85], ['cymbals', 0, 1.1, 2, 0.6], ['bells', 74, 1.1, 2, 0.6],
      ...chord('strings', [50, 57, 62, 66, 69], 1.1, 1.3, 0.8), ...chord('horns', [57, 62, 66], 1.1, 1.2, 0.6),
    ],
    gain: 0.5,
  },
  // the cryptogram rung on the bell, then A7 to D: the session signs off with its name
  sessionEnd: {
    cues: [
      ...line('bells', [[71, 0, 2], [74, 0.24, 2], [79, 0.48, 2], [75, 0.8, 2], [77, 1.04, 2]], 0.75),
      ...chord('strings', A7, 1.34, 0.5, 0.6), ...chord('strings', [50, 57, 62, 66, 69], 1.8, 1.8, 0.75),
      ...chord('horns', [57, 62, 66], 1.8, 1.6, 0.5), ...roll([38, 50, 57, 62, 66, 69, 74], 1.8, 0.6), ['timpani', D3, 1.8, 1, 0.7],
    ],
    gain: 0.31,
  },
  // the CALL's turn, D C♯ D E F♯, on the flute over a rolled harp chord: "here we go"
  activityStart: { cues: [...line('flute', [[74, 0, 0.08], [73, 0.08, 0.08], [74, 0.16, 0.12], [76, 0.28, 0.12], [78, 0.4, 0.4]], 0.8), ...roll([50, 57, 62, 66], 0.38, 0.5)], gain: 0.51 },
  // a harp glissando up the D major scale
  transition: { cues: [62, 64, 66, 67, 69, 71, 73, 74, 76, 78].map((n, i): Cue => ['harp', n, i * 0.028, 0.9, 0.45 + i * 0.03]), gain: 0.22 },
  // the CALL's first fall, F♯ to A, on violins for "step away"; its rise, A E F♯, on horns for "we're back"
  standbyIn: { cues: [...line('violins', [[78, 0, 0.22], [69, 0.2, 0.7]], 0.6), ['harp', 38, 0.2, 1.5, 0.5]], gain: 0.46 },
  standbyOut: { cues: [...line('horns', [[57, 0, 0.16], [64, 0.15, 0.16], [66, 0.3, 0.5]], 0.75), ...roll([50, 57, 62, 66], 0.3, 0.45)], gain: 0.43 },

  // answering
  select: { cues: [['pizz', 86, 0, 0.2, 0.9]], gain: 0.6 },
  submit: { cues: [['pizz', 74, 0, 0.2, 1], ['pizz', 78, 0.07, 0.3, 1], ['harp', 74, 0, 1, 0.8], ['harp', 78, 0.07, 1.2, 0.9]], gain: 0.6 },
  poll: { cues: line('harp', [[78, 0, 1], [81, 0.07, 1.2]], 0.75), gain: 0.49 },
  word: { cues: [...line('celesta', [[81, 0, 0.6], [86, 0.06, 0.8]], 0.95), ['harp', 86, 0.06, 1, 0.5]], gain: 0.6 },
  survey: { cues: line('flute', [[74, 0, 0.1], [78, 0.09, 0.1], [81, 0.18, 0.3]], 0.75), gain: 0.39 },
  allAnswered: { cues: [...line('harp', [[74, 0, 1], [78, 0.07, 1], [81, 0.14, 1], [86, 0.21, 1.5]], 0.7), ...chord('strings', D, 0.21, 0.6, 0.45)], gain: 0.44 },

  // time: the temple block, a higher one for the final seconds, and the bell
  tick: { cues: [['block', 0, 0, 0.1, 0.75]], gain: 0.6 },
  tickFinal: { cues: [['blockHigh', 0, 0, 0.1, 0.9]], gain: 0.6 },
  timeUp: { cues: [['bells', 74, 0, 2, 0.6], ['bells', 74, 0.18, 2.5, 0.9], ['timpani', D3, 0.18, 1, 0.9], ...chord('tremolo', [50, 57, 62], 0.18, 0.9, 0.7)], gain: 0.52 },

  // the reveal: a timpani roll on the dominant, the strings trembling on A
  reveal: { cues: [['timpaniRoll', A2, 0, 0.42, 0.7], ...chord('tremolo', A, 0.42, 0.7, 0.65), ['violins', 76, 0.42, 0.7, 0.6]], gain: 0.42 },
  // the CLIMB's cadence, B C♯ D, on the harp, landing on D with a glockenspiel and the strings
  correct: { cues: [...line('harp', [[71, 0, 1], [73, 0.1, 1], [74, 0.2, 1.5]], 0.85), ['glock', 86, 0.2, 0.8, 0.7], ...chord('strings', D, 0.2, 0.65, 0.55)], gain: 0.53 },
  partial: { cues: line('harp', [[71, 0, 1], [73, 0.1, 1], [76, 0.2, 1.4]], 0.9), gain: 0.6 },
  // the cryptogram's E♭ (the S) sinking to D in the clarinet's low register: the Neapolitan resolving, softly
  incorrect: { cues: [...line('clarinet', [[63, 0, 0.22], [62, 0.2, 0.55]], 0.7), ['pizz', D3, 0.2, 0.5, 0.6]], gain: 0.27 },
  // the CLIMB's leap, G to B, falling to A, on the flute
  results: { cues: line('flute', [[79, 0, 0.1], [83, 0.08, 0.1], [81, 0.16, 0.32]], 0.75), gain: 0.39 },
  points: { cues: [...line('glock', [[83, 0, 0.5], [86, 0.07, 0.8]], 0.9), ...line('harp', [[71, 0, 1], [74, 0.07, 1.2]], 0.8)], gain: 0.6 },

  // standings
  leaderboard: {
    cues: [['timpaniRoll', A2, 0, 0.4, 0.6], ...line('trumpet', [[78, 0, 0.18], [69, 0.17, 0.25], [76, 0.4, 0.6]], 0.85), ['cymbals', 0, 0.4, 2, 0.55], ...chord('strings', A, 0.4, 0.8, 0.65)],
    gain: 0.45,
  },
  rankUp: { cues: line('harp', [[74, 0, 1], [79, 0.06, 1], [83, 0.12, 1.2]], 1), gain: 0.56 },
  // the whole CLIMB on trumpet, quickly, ending with the full orchestra on D
  podium: {
    cues: [
      ...line('trumpet', [[74, 0, 0.1], [74, 0.1, 0.08], [79, 0.18, 0.08], [78, 0.26, 0.08], [79, 0.34, 0.1], [79, 0.44, 0.1], [83, 0.54, 0.1], [81, 0.64, 0.08], [78, 0.72, 0.1], [76, 0.82, 0.08], [74, 0.9, 0.1], [71, 1.0, 0.1], [73, 1.1, 0.08], [74, 1.18, 1.1]], 0.85),
      ['timpaniRoll', A2, 0.6, 0.58, 0.7], ['timpani', D3, 1.18, 1, 0.9], ['cymbals', 0, 1.18, 2, 0.75], ['bassDrum', 0, 1.18, 1, 0.8], ['bells', 74, 1.18, 2, 0.6],
      ...chord('strings', [50, 57, 62, 66, 69, 74], 1.18, 1.4, 0.8), ...chord('trombones', [50, 57], 1.18, 1.2, 0.6), ...chord('horns', [62, 66, 69], 1.18, 1.2, 0.6),
    ],
    gain: 0.42,
  },

  // around the session
  // the CALL's turn rising, C♯ D E, on the flute: a question
  question: { cues: line('flute', [[73, 0, 0.08], [74, 0.08, 0.08], [76, 0.16, 0.3]], 0.7), gain: 0.29 },
  upvote: { cues: line('celesta', [[86, 0, 0.4], [93, 0.04, 0.6]], 0.6), gain: 0.49 },
  // G, E♭, D: the cryptogram's Neapolitan sigh, over a rolled harp chord and soft strings
  breakStart: { cues: [...line('flute', [[79, 0, 0.3], [75, 0.25, 0.3], [74, 0.5, 0.8]], 0.65), ...roll([50, 57, 62, 66, 69], 0.5, 0.5), ...chord('strings', D, 0.5, 1, 0.4)], gain: 0.36 },
  breakEnd: { cues: [...line('horns', [[57, 0, 0.15], [64, 0.14, 0.15], [66, 0.28, 0.5]], 0.75), ...chord('strings', D, 0.28, 0.6, 0.5)], gain: 0.4 },
  joined: { cues: [['celesta', 93, 0, 0.5, 0.6]], gain: 0.29 },
};

const stages = new WeakMap<AudioNode, Stage>();

/** Plays one HKUST cue into `dest` at `t0`, on a stage (with the hall) made once per destination. */
export function playCue(ctx: Ctx, dest: AudioNode, t0: number, id: SoundId) {
  let s = stages.get(dest);
  if (!s) {
    s = stage(ctx, dest, 0.36);
    stages.set(dest, s);
  }
  const { cues, gain } = HKUST_CUES[id];
  for (const [inst, midi, at, len, vel = 0.8] of cues) ORCHESTRA[inst](ctx, s.seat(inst), t0 + at, midi, len, vel * gain);
}
