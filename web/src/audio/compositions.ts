/**
 * The background music, written as real compositions: a chord progression (chord symbols with their length in beats)
 * and a melody (MIDI note numbers, timed in beats). Each style (styles.ts) arranges the same composition with its own
 * instruments, bass line, accompaniment and drums, so a piece keeps its identity whatever the style.
 *
 * Every piece loops seamlessly: the last bar leads back into the first. Melodies stay mostly on chord tones on strong
 * beats (a unit test checks this) and sit in a comfortable register above the accompaniment.
 */
import type { MusicId } from './engine';

/** [start beat, MIDI note, length in beats, velocity 0–1] */
export type MelodyNote = [beat: number, midi: number, beats: number, vel?: number];

export interface Composition {
  id: MusicId;
  title: string;
  bpm: number;
  /** [chord symbol, beats]; the total is the loop length (a whole number of 4/4 bars). */
  chords: [string, number][];
  melody: MelodyNote[];
  /** How much rhythm section the piece wants; styles turn this into actual drum patterns. */
  energy: 'none' | 'light' | 'groove' | 'drive';
}

/** Lobby: welcoming and unhurried, while people join. F major, 16 bars in two halves (A and a lifted B). */
const lobby: Composition = {
  id: 'lobby',
  title: 'Doors open',
  bpm: 100,
  energy: 'light',
  chords: [
    ['Fmaj7', 4], ['Am7', 4], ['Bbmaj7', 4], ['C7sus4', 2], ['C7', 2],
    ['Fmaj7', 4], ['Dm7', 4], ['Gm7', 4], ['Bbmaj7', 2], ['C7', 2],
    ['Dm7', 4], ['Am7', 4], ['Bbmaj7', 4], ['F/A', 4],
    ['Gm7', 4], ['Am7', 4], ['Bbmaj7', 4], ['C7sus4', 2], ['C7', 2],
  ],
  melody: [
    [1, 69, 0.5], [1.5, 72, 0.5], [2, 76, 1.5],
    [4.5, 74, 0.5], [5, 72, 1], [6, 69, 1.5],
    [9, 70, 0.5], [9.5, 72, 0.5], [10, 74, 1], [11, 77, 1],
    [12, 79, 1.5], [13.5, 77, 0.5], [14, 76, 2],
    [17, 69, 0.5], [17.5, 72, 0.5], [18, 76, 1], [19, 81, 1],
    [20, 79, 1], [21, 77, 1], [22, 74, 2],
    [25, 70, 0.5], [25.5, 74, 0.5], [26, 77, 1], [27, 76, 1],
    [28, 74, 1], [29, 72, 1], [30, 70, 1], [31, 67, 1],
    [33, 69, 0.5], [33.5, 74, 0.5], [34, 77, 1.5],
    [36, 76, 1], [37, 72, 1], [38, 69, 2],
    [41, 74, 0.5], [41.5, 77, 0.5], [42, 81, 1.5],
    [44, 79, 1], [45, 77, 1], [46, 72, 2],
    [49, 70, 0.5], [49.5, 74, 0.5], [50, 77, 1], [51, 79, 1],
    [52, 81, 1.5], [53.5, 79, 0.5], [54, 76, 2],
    [57, 74, 1], [58, 77, 1], [59, 74, 1],
    [60, 72, 2], [62, 70, 1], [63, 67, 1],
  ],
};

/** Timed quiz: a steady, focused pulse that doesn't compete with thinking. A minor, 8 bars. */
const quiz: Composition = {
  id: 'quiz',
  title: 'Thinking time',
  bpm: 112,
  energy: 'groove',
  chords: [['Am', 4], ['Am/G', 4], ['Fmaj7', 4], ['E7sus4', 2], ['E7', 2], ['Am', 4], ['Am/G', 4], ['Dm7', 4], ['E7', 4]],
  melody: [
    [0, 76, 1], [1.5, 72, 0.5], [2, 71, 0.5], [2.5, 72, 1.5],
    [4, 69, 1], [5.5, 71, 0.5], [6, 72, 1], [7, 74, 1],
    [8, 76, 1.5], [9.5, 77, 0.5], [10, 76, 1], [11, 72, 1],
    [12, 74, 2], [14, 71, 1], [15, 68, 1],
    [16, 69, 1], [17.5, 72, 0.5], [18, 76, 1], [19, 79, 1],
    [20, 81, 1.5], [21.5, 79, 0.5], [22, 76, 2],
    [24, 77, 1], [25, 74, 1], [26, 72, 1], [27, 69, 1],
    [28, 71, 1], [29, 68, 1], [30, 64, 2],
  ],
};

/** The last ten seconds: faster, with a figure that climbs bar by bar towards the dominant. A minor, 4 bars. */
const countdown: Composition = {
  id: 'countdown',
  title: 'Ten seconds',
  bpm: 140,
  energy: 'drive',
  chords: [['Am', 4], ['F', 4], ['Dm', 4], ['E7', 4]],
  melody: [
    ...[0, 1, 2, 3].flatMap((b): MelodyNote[] => [[b, 76, 0.5, 0.9], [b + 0.5, 77, 0.5, 0.6]]),
    ...[4, 5, 6, 7].flatMap((b): MelodyNote[] => [[b, 77, 0.5, 0.9], [b + 0.5, 79, 0.5, 0.6]]),
    ...[8, 9, 10, 11].flatMap((b): MelodyNote[] => [[b, 77, 0.5, 0.9], [b + 0.5, 81, 0.5, 0.65]]),
    [12, 80, 0.5, 1], [12.5, 83, 0.5, 0.7], [13, 80, 0.5, 1], [13.5, 83, 0.5, 0.7], [14, 80, 2, 1],
  ],
};

/** Results and leaderboard: bright and celebratory, ending on a held tonic. C major, 8 bars. */
const results: Composition = {
  id: 'results',
  title: 'The reveal',
  bpm: 118,
  energy: 'groove',
  chords: [['C', 4], ['G/B', 4], ['Am7', 4], ['F', 2], ['G', 2], ['C', 4], ['Em7', 2], ['A7', 2], ['Dm7', 2], ['G7', 2], ['C', 4]],
  melody: [
    [0, 79, 0.5], [0.5, 84, 0.5], [1, 83, 0.5], [1.5, 84, 1.5], [3.5, 79, 0.5],
    [4, 83, 1], [5, 81, 0.5], [5.5, 79, 1.5], [7, 74, 1],
    [8, 76, 0.5], [8.5, 79, 0.5], [9, 84, 1], [10, 83, 1], [11, 81, 1],
    [12, 81, 1], [13, 77, 1], [14, 79, 1], [15, 83, 1],
    [16, 84, 1.5], [17.5, 79, 0.5], [18, 76, 1], [19, 79, 1],
    [20, 83, 1], [21, 79, 1], [22, 85, 1], [23, 81, 1],
    [24, 81, 1], [25, 77, 1], [26, 79, 1], [27, 83, 1],
    [28, 84, 3],
  ],
};

/** Break: a laid-back, jazzy loop with ninth chords. E-flat major, 8 bars, swung. */
const breakTime: Composition = {
  id: 'break',
  title: 'Coffee',
  bpm: 80,
  energy: 'light',
  chords: [['Ebmaj9', 4], ['Cm9', 4], ['Abmaj9', 4], ['Bb13', 4], ['Gm7', 4], ['Cm9', 4], ['Fm9', 4], ['Bb7sus4', 2], ['Bb7', 2]],
  melody: [
    [0.5, 79, 0.5], [1, 82, 1], [2.5, 77, 0.5], [3, 79, 1],
    [4.5, 75, 0.5], [5, 77, 1.5], [7, 74, 1],
    [8.5, 72, 0.5], [9, 75, 1], [10, 79, 1.5], [11.5, 77, 0.5],
    [12, 79, 2], [14, 74, 0.5], [14.5, 77, 1.5],
    [16.5, 82, 0.5], [17, 79, 1], [18, 77, 1], [19, 74, 1],
    [20, 75, 2], [22.5, 74, 0.5], [23, 72, 1],
    [24.5, 68, 0.5], [25, 72, 1], [26, 75, 1], [27, 79, 1],
    [28, 77, 2], [30, 74, 1], [31, 70, 1],
  ],
};

export const COMPOSITIONS: Record<MusicId, Composition> = { lobby, quiz, countdown, results, break: breakTime };

export const loopBeats = (c: Composition) => c.chords.reduce((n, [, beats]) => n + beats, 0);

/** The chord sounding at `beat` (within one loop). */
export function chordAt(c: Composition, beat: number): string {
  let t = 0;
  for (const [sym, beats] of c.chords) {
    if (beat < t + beats) return sym;
    t += beats;
  }
  return c.chords[c.chords.length - 1][0];
}
