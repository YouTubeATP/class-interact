/**
 * How the HKUST music is written down and turned into an orchestral performance.
 *
 * The band styles give each section an energy level and let a style's patterns fill it in. The HKUST pieces are
 * scored instead, section by section, as an orchestrator would: who has the tune and who doubles it, how the harmony
 * is held (divided strings, tremolo, woodwinds, a brass chorale), what moves underneath (harp, pizzicato, a string
 * ostinato, march afterbeats), the bass, the timpani (tuned to two pitches per piece and only struck when their note
 * is in the chord), the percussion, the dynamic with any crescendo, and ritardandos that really slow the music down.
 * `orchestrate` reads the score and returns timed note events for one pass.
 */
import { chordTones, noteAtOrAbove, parseChord, voiceChord } from '../theory';
import { resolve, type Composition, type MelodyNote, type Passage } from '../compositions';
import { RANGE, type Instrument } from './instruments';

export type Dynamic = 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff';
// a narrower range than a concert hall's: quiet passages must still carry over a projector's speakers in a classroom
const LEVEL: Record<Dynamic, number> = { pp: 0.46, p: 0.55, mp: 0.65, mf: 0.76, f: 0.88, ff: 1 };

/** An instrument, optionally an octave or two away from the written line (`['flute', 1]` doubles it an octave up). */
export type Line = Instrument | [Instrument, number];

export interface Scoring {
  /** The dynamic at the start of the section, and (`to`) at its end: a crescendo or diminuendo across it. */
  dyn: Dynamic;
  to?: Dynamic;
  /** Who plays the melody; the first leads and the others double it a little softer. */
  tune?: Line[];
  /** Who plays the counter-melody. */
  counter?: Line[];
  /** How the harmony is held. */
  harmony?: 'strings' | 'tremolo' | 'winds' | 'chorale' | 'horns';
  /** What moves under the tune. */
  figure?: 'harp' | 'harpRoll' | 'pizz' | 'ostinato' | 'afterbeats' | 'celesta';
  /** The bass: bowed (with the cellos an octave up), plucked, a march (trombones and pizzicato), or a held pedal. */
  bass?: 'arco' | 'pizz' | 'march' | 'pedal';
  /**
   * Timpani: strokes on beats 1 and 3, on each chord change, a march pattern, a soft held roll, or a roll that
   * grows through the last bar into the next section.
   */
  timpani?: 'beats' | 'downbeats' | 'march' | 'pedal' | 'roll';
  /** Cymbals clashed at the start, a suspended-cymbal swell into the next section, bass drum, field drum, triangle. */
  percussion?: ('cymbals' | 'swell' | 'bassDrum' | 'fieldDrum' | 'triangle')[];
  /** "HKUST" in Morse code on a temple block (again halfway through long sections). */
  morse?: boolean;
  /** Waves under the section, one every two bars. */
  surf?: boolean;
  /** Slow down over the last two bars (to about two-thirds of the tempo) and hold the last chord. */
  rit?: boolean;
}

export interface ScoredSection extends Passage {
  scoring: Scoring;
}

export interface Score extends Composition<ScoredSection> {
  /** The two timpani's tuning for the piece, usually the tonic and the dominant, e.g. `['D3', 'A2']`. */
  timpani: [number, number];
  /** Level correction in dB, so every piece plays at about the same loudness whatever its dynamics (measured). */
  trim?: number;
}

export interface OrchEvent {
  beat: number;
  beats: number;
  inst: Instrument;
  midi: number;
  vel: number;
}

/** Woodblock onsets (in sixteenths) that spell H-K-U-S-T in Morse code, and whether each is a dash. */
export const MORSE_HKUST: [step: number, dash: boolean][] = (() => {
  const out: [number, boolean][] = [];
  let t = 0;
  for (const letter of ['....', '-.-', '..-', '...', '-']) {
    for (const ch of letter) {
      out.push([t, ch === '-']);
      t += ch === '-' ? 4 : 2; // the element plus one unit of space
    }
    t += 2; // the gap between letters (three units in all)
  }
  return out;
})();

const instOf = (l: Line): [Instrument, number] => (typeof l === 'string' ? [l, 0] : l);
const BRASS = new Set<Instrument>(['trumpet', 'horns', 'trombones']);
const STRUCK = new Set<Instrument>(['harp', 'bells', 'glock', 'celesta', 'pizz']);

/** The octave shift (in semitones) that puts a whole line inside the instrument's range, so it never jumps mid-phrase. */
export function fitLine(notes: number[], inst: Instrument): number {
  const range = RANGE[inst];
  if (!range || !notes.length) return 0;
  const lo = Math.min(...notes);
  const hi = Math.max(...notes);
  let shift = 0;
  while (hi + shift > range[1] && lo + shift - 12 >= range[0] - 5) shift -= 12;
  while (lo + shift < range[0] && hi + shift + 12 <= range[1] + 5) shift += 12;
  return shift;
}

/** A small, repeatable variation (0–1) so the players are not machine-identical. */
const jitter = (i: number) => {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

/** One pass of the score as orchestral events, with ritardandos applied. `beats` is the pass's length in beats. */
export function orchestrate(score: Score): { events: OrchEvent[]; beats: number } {
  const out: OrchEvent[] = [];
  const sections = resolve(score);
  const total = sections.reduce((n, s) => n + s.beats, 0);
  const add = (beat: number, beats: number, inst: Instrument, midi: number, vel: number) => {
    if (beat >= 0 && beat < total - 1e-6 && vel > 0) out.push({ beat, beats, inst, midi, vel: Math.min(1, vel) });
  };
  const [drumA, drumB] = score.timpani;
  let voicing: number[] | null = null;

  sections.forEach((r, si) => {
    const s = r.section.scoring;
    const dyn = (beat: number) => {
      const from = LEVEL[s.dyn];
      const to = LEVEL[s.to ?? s.dyn];
      return from + (to - from) * Math.min(1, Math.max(0, (beat - r.start) / r.beats));
    };
    const lastBar = r.start + r.beats - 4;

    // --- the tune and the counter-melody --------------------------------------------------------------------------
    const playLine = (notes: MelodyNote[], lines: Line[] | undefined, weight: number) => {
      (lines ?? []).forEach((line, li) => {
        const [inst, oct] = instOf(line);
        const shift = fitLine(notes.map((n) => n[1] + oct * 12), inst) + oct * 12;
        notes.forEach(([beat, midi, beats, vel = 0.8], k) => {
          const at = r.start + beat;
          const next = notes[k + 1];
          let len = beats;
          if (BRASS.has(inst)) len = beats * (beats >= 1 ? 0.94 : 0.86); // brass articulates
          else if (!STRUCK.has(inst) && next && next[0] - (beat + beats) < 0.3) len = next[0] - beat + 0.06; // strings and winds join the notes
          const accent = (at % 1 === 0 ? 1 : 0.92) * (li === 0 ? 1 : 0.72);
          add(at, len, inst, midi + shift, vel * weight * accent * dyn(at));
        });
      });
    };
    playLine(r.melody, s.tune, 1);
    playLine(r.counter, s.counter, 0.85);

    // --- harmony, figure, bass and timpani, chord by chord -------------------------------------------------------
    let t = r.start;
    const firstBass = parseChord(r.chords[0][0]);
    r.chords.forEach(([symbol, beats], ci) => {
      const chord = parseChord(symbol);
      const tones = chordTones(chord);
      voicing = voiceChord(chord, voicing, 55);
      const v = voicing;
      const d = dyn(t);
      const low = (min: number) => noteAtOrAbove(chord.bass, min);

      switch (s.harmony) {
        case 'strings': for (const n of v) add(t, beats, 'strings', n, 0.62 * d); break;
        case 'tremolo': for (const n of v) add(t, beats, 'tremolo', n, 0.6 * d); break;
        case 'winds':
          v.forEach((n, i) => add(t, beats, i === v.length - 1 && n >= 62 ? 'flute' : 'clarinet', n, (i === v.length - 1 ? 0.5 : 0.62) * d));
          break;
        case 'chorale': {
          const c = voiceChord(chord, null, 48);
          c.forEach((n, i) => add(t, beats * 0.97, i < 2 ? 'trombones' : 'horns', n, 0.58 * d));
          break;
        }
        case 'horns': for (const n of voiceChord(chord, null, 52)) add(t, beats * 0.97, 'horns', n, 0.5 * d); break;
      }

      switch (s.figure) {
        case 'harp': {
          // arpeggios rising through two octaves: in triplets at slow tempos, eighths otherwise
          const step = score.bpm < 92 ? 1 / 3 : 0.5;
          const notes = [low(43), ...v, ...v.map((n) => n + 12)].filter((n) => n <= 96);
          for (let b = 0, k = 0; b < beats - 1e-6; b += step, k++) {
            const up = Math.floor(k / notes.length) % 2 === 0;
            const idx = k % notes.length;
            add(t + b, 1.5, 'harp', notes[up ? idx : notes.length - 1 - idx], (k % (1 / step) === 0 ? 0.62 : 0.48) * d);
          }
          break;
        }
        case 'harpRoll':
          // a chord rolled from the bass up, once per chord
          [low(40), low(40) + 12, ...v, v[v.length - 1] + 12].forEach((n, i) => add(t + i * 0.07, beats, 'harp', n, 0.55 * d));
          break;
        case 'pizz':
          for (let b = 0; b < beats - 1e-6; b += 1) {
            if (b % 2 === 0) add(t + b, 0.5, 'pizz', low(43), 0.62 * d);
            else for (const n of v.slice(-2)) add(t + b, 0.5, 'pizz', n, 0.42 * d);
          }
          break;
        case 'ostinato': {
          // spiccato sixteenths in the cellos: root, fifth, octave, fifth, accented on each beat
          const root = low(43);
          const cell = [root, root + 7, root + 12, root + 7];
          for (let b = 0, k = 0; b < beats - 1e-6; b += 0.25, k++) add(t + b, 0.2, 'celli', cell[k % 4], (k % 4 === 0 ? 0.62 : 0.4) * d);
          break;
        }
        case 'afterbeats':
          // the march's "pah": horns on beats 2 and 4
          for (let b = 1; b < beats - 1e-6; b += 2) for (const n of voiceChord(chord, null, 55).slice(-3)) add(t + b, 0.45, 'horns', n, 0.42 * d);
          break;
        case 'celesta':
          for (let b = 0, k = 0; b < beats - 1e-6; b += 1, k++) add(t + b, 1, 'celesta', v[(k * 2) % v.length] + 12, 0.5 * d);
          break;
      }

      switch (s.bass) {
        case 'arco':
          add(t, beats, 'basses', low(31), 0.68 * d);
          add(t, beats, 'celli', low(43), 0.5 * d);
          break;
        case 'pizz':
          add(t, 0.9, 'pizz', low(33), 0.8 * d);
          if (beats >= 4) add(t + 2, 0.9, 'pizz', low(33) + 7, 0.6 * d);
          break;
        case 'march':
          add(t, 0.75, 'trombones', low(40), 0.5 * d);
          add(t, 0.75, 'pizz', low(31), 0.7 * d);
          if (beats >= 4) { add(t + 2, 0.75, 'trombones', low(40) + 7 > 52 ? low(40) - 5 : low(40) + 7, 0.42 * d); add(t + 2, 0.75, 'pizz', low(31) + 7, 0.55 * d); }
          break;
        case 'pedal':
          if (ci === 0) {
            add(t, r.beats, 'basses', noteAtOrAbove(firstBass.bass, 31), 0.55 * d);
            add(t, r.beats, 'celli', noteAtOrAbove(firstBass.bass, 43), 0.4 * d);
          }
          break;
      }

      // timpani: only struck when one of the two drums' notes is in the chord, root first
      const drum = [drumA, drumB].find((n) => n % 12 === chord.root) ?? [drumA, drumB].find((n) => tones.includes(n % 12));
      if (drum !== undefined) {
        switch (s.timpani) {
          case 'beats': for (let b = 0; b < beats - 1e-6; b += 2) add(t + b, 1, 'timpani', drum, (b === 0 ? 0.75 : 0.55) * d); break;
          case 'downbeats': add(t, 1, 'timpani', drum, 0.75 * d); break;
          case 'march':
            for (let b = 0; b < beats - 1e-6; b += 2) add(t + b, 1, 'timpani', drum, 0.65 * d);
            if (beats >= 4) add(t + 3.5, 0.5, 'timpani', drum, 0.35 * d);
            break;
        }
      }
      t += beats;
    });

    if (s.timpani === 'pedal') {
      const tonic = [drumA, drumB].find((n) => chordTones(firstBass).includes(n % 12)) ?? drumA;
      add(r.start, r.beats, 'timpaniTrem', tonic, 0.5 * dyn(r.start));
    }
    if (s.timpani === 'roll') {
      // roll on the drum that belongs to the next section's first chord, growing into its downbeat
      const nextChord = parseChord(sections[(si + 1) % sections.length].chords[0][0]);
      const target = [drumA, drumB].find((n) => chordTones(nextChord).includes(n % 12)) ?? drumA;
      add(lastBar, 4, 'timpaniRoll', target, LEVEL[s.to ?? s.dyn]);
    }

    // --- percussion, Morse, the sea ------------------------------------------------------------------------------
    for (const p of s.percussion ?? []) {
      switch (p) {
        case 'cymbals': add(r.start, 4, 'cymbals', 0, 0.85 * dyn(r.start)); add(r.start, 2, 'bassDrum', 0, 0.8 * dyn(r.start)); break;
        case 'swell': add(r.start + r.beats - 8, 8, 'swell', 0, LEVEL[s.to ?? s.dyn]); break;
        case 'bassDrum': for (let b = r.start; b < r.start + r.beats; b += 4) add(b, 2, 'bassDrum', 0, 0.5 * dyn(b)); break;
        case 'triangle': for (let b = r.start; b < r.start + r.beats; b += 8) add(b, 2, 'triangle', 0, 0.7 * dyn(b)); break;
        case 'fieldDrum':
          for (let b = r.start; b < r.start + r.beats; b += 4) {
            for (const [step, vel] of [[0, 0.6], [1.5, 0.32], [1.75, 0.38], [2, 0.52], [3, 0.48], [3.5, 0.3], [3.75, 0.34]] as const) add(b + step, 0.25, 'fieldDrum', 0, vel * dyn(b));
          }
          break;
      }
    }
    if (s.morse) {
      for (const at of r.beats >= 32 ? [0, r.beats / 2] : [0]) {
        for (const [step, dash] of MORSE_HKUST) add(r.start + at + step / 4, 0.25, dash ? 'blockHigh' : 'block', 0, dash ? 0.5 : 0.42);
      }
    }
    if (s.surf) for (let b = 0; b < r.beats; b += 8) add(r.start + b, 8, 'surf', 0, 1);
  });

  // small human variations in level, and strings and winds speaking a touch after the beat
  out.forEach((e, i) => {
    e.vel = Math.min(1, e.vel * (0.95 + 0.1 * jitter(i)));
    if (!STRUCK.has(e.inst) && !BRASS.has(e.inst) && e.inst !== 'timpani' && e.beats > 0.3) e.beat = Math.min(total - 1e-3, e.beat + 0.012 * jitter(i + 7));
  });

  // ritardandos: bend time so the marked sections slow down over their last two bars, then hold the last chord
  const rits = sections.filter((r) => r.section.scoring.rit).map((r) => [r.start + r.beats - 8, r.start + r.beats] as const);
  const warp = timeWarp(rits, total);
  for (const e of out) {
    const start = e.beat;
    const end = e.beat + e.beats;
    // the held last chord: notes still sounding as a ritardando ends ring on
    const held = rits.some(([, b]) => start < b && end > b - 0.5);
    e.beat = warp(start);
    e.beats = (warp(end) - e.beat) * (held ? 1.3 : 1);
  }
  return { events: out.sort((a, b) => a.beat - b.beat), beats: warp(total) };
}

/**
 * Maps score beats to performed beats: inside each [a, b) the tempo falls smoothly to about two-thirds, so the same
 * music takes longer. Outside, time runs at the written tempo.
 */
export function timeWarp(rits: readonly (readonly [number, number])[], total: number): (beat: number) => number {
  const step = 1 / 32;
  const n = Math.ceil(total / step) + 1;
  const table = new Float64Array(n + 1);
  const slow = (x: number) => {
    for (const [a, b] of rits) if (x >= a && x < b) return 1 - 0.34 * ((x - a) / (b - a)) ** 1.4;
    return 1;
  };
  for (let i = 1; i <= n; i++) table[i] = table[i - 1] + step / slow((i - 0.5) * step);
  return (beat: number) => {
    if (beat >= n * step) return table[n] + (beat - n * step);
    const i = Math.floor(beat / step);
    return table[i] + (table[i + 1] - table[i]) * ((beat - i * step) / step);
  };
}
