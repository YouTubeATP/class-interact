/**
 * Sound styles: the same compositions and sound-effect motifs, arranged and voiced differently. A style chooses the
 * instruments, how the chords are played (comping), the bass line, the drum kit and the feel (swing, brightness).
 *
 * `arrange` is pure: it turns a composition into a list of timed note events for one loop, which the engine plays
 * (live, or into an OfflineAudioContext for previews and tests).
 */
import type { SoundStyle } from '@classinteract/shared';
import { COMPOSITIONS, loopBeats, resolve, type Composition, type Energy } from './compositions';
import type { MusicId } from './engine';
import * as I from './instruments';
import { bassNote, parseChord, voiceChord } from './theory';

export type Part = 'lead' | 'counter' | 'comp' | 'pad' | 'bass' | 'drum';

export interface MusicEvent {
  beat: number;
  beats: number;
  part: Part;
  midi: number;
  vel: number;
  drum?: I.DrumId;
}

type Comping = 'mallets' | 'epiano' | 'chipArp' | 'pad' | 'brass';
type BassLine = 'walk' | 'lazy' | 'octaves' | 'whole' | 'pump';

export interface Style {
  id: SoundStyle;
  label: string;
  hint: string;
  voices: Record<Exclude<Part, 'drum'>, I.Voice>;
  kit: I.Kit;
  /** Whether the music has drums at all (Calm only keeps a soft pulse where the music drives). */
  drums: boolean;
  comping: Comping;
  bassLine: BassLine;
  /** 0.5 = straight; about 0.6 swings the off-beat eighths. */
  swing: number;
  /** Low-pass on the music: lower is warmer and further away. */
  tone: number;
  /** Relative level of each part. */
  mix: Record<Part, number>;
  /** Sound effects: the melodic line and any chords. */
  sfx: { lead: I.Voice; chord: I.Voice; gain: number };
  /** Lo-fi vinyl dust under the music. */
  crackle?: boolean;
  /** Overall music level, so every style plays at about the same loudness (measured by rendering each piece). */
  level: number;
}

export const STYLES: Record<SoundStyle, Style> = {
  bright: {
    id: 'bright', label: 'Bright', hint: 'Warm mallets and a light band. Friendly for any room.',
    voices: { lead: I.mallet, counter: I.bell, comp: I.pluck, pad: I.pad, bass: I.pluckBass }, kit: I.bright, drums: true,
    comping: 'mallets', bassLine: 'walk', swing: 0.5, tone: 7000,
    mix: { lead: 0.55, counter: 0.3, comp: 0.3, pad: 0.35, bass: 0.5, drum: 0.55 },
    level: 1.0, sfx: { lead: I.mallet, chord: I.mallet, gain: 0.55 },
  },
  chill: {
    id: 'chill', label: 'Chill', hint: 'Lo-fi electric piano, swung beats and vinyl dust.',
    voices: { lead: I.epiano, counter: I.pad, comp: I.epiano, pad: I.pad, bass: I.subBass }, kit: I.dusty, drums: true,
    comping: 'epiano', bassLine: 'lazy', swing: 0.62, tone: 3200, crackle: true,
    mix: { lead: 0.5, counter: 0.5, comp: 0.32, pad: 0.2, bass: 0.55, drum: 0.6 },
    level: 0.66, sfx: { lead: I.epiano, chord: I.epiano, gain: 0.42 },
  },
  arcade: {
    id: 'arcade', label: 'Arcade', hint: '8-bit chiptune: pulse waves and fast arpeggios.',
    voices: { lead: I.pulse, counter: I.pulse, comp: I.pulse, pad: I.pulse, bass: I.chipBass }, kit: I.chip, drums: true,
    comping: 'chipArp', bassLine: 'octaves', swing: 0.5, tone: 9000,
    mix: { lead: 0.5, counter: 0.28, comp: 0.2, pad: 0, bass: 0.5, drum: 0.5 },
    level: 1.26, sfx: { lead: I.pulse, chord: I.pulse, gain: 1.2 },
  },
  calm: {
    id: 'calm', label: 'Calm', hint: 'Soft bells and pads, no drums. For focused or quiet rooms.',
    voices: { lead: I.bell, counter: I.epiano, comp: I.pad, pad: I.pad, bass: I.subBass }, kit: I.bright, drums: false,
    comping: 'pad', bassLine: 'whole', swing: 0.5, tone: 4200,
    mix: { lead: 0.45, counter: 0.35, comp: 0.4, pad: 0.4, bass: 0.35, drum: 0.3 },
    level: 1.22, sfx: { lead: I.bell, chord: I.bell, gain: 0.58 },
  },
  gameshow: {
    id: 'gameshow', label: 'Game show', hint: 'Big brass stabs and punchy drums. Maximum energy.',
    voices: { lead: I.brass, counter: I.pad, comp: I.brass, pad: I.pad, bass: I.synthBass }, kit: I.punchy, drums: true,
    comping: 'brass', bassLine: 'pump', swing: 0.5, tone: 9000,
    mix: { lead: 0.5, counter: 0.45, comp: 0.3, pad: 0.22, bass: 0.5, drum: 0.65 },
    level: 0.76, sfx: { lead: I.brass, chord: I.brass, gain: 0.92 },
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Drum patterns: 16 sixteenth-note steps per bar
// ---------------------------------------------------------------------------------------------------------------

type Hits = [step: number, vel: number][];
type Pattern = Partial<Record<I.DrumId, Hits>>;
const PATTERNS: Record<Energy, Pattern> = {
  none: {},
  light: {
    kick: [[0, 0.8], [8, 0.6]],
    snare: [[12, 0.45]],
    hat: [[2, 0.4], [6, 0.35], [10, 0.4], [14, 0.35]],
  },
  half: {
    kick: [[0, 0.85], [10, 0.5]],
    snare: [[8, 0.7]],
    hat: [0, 2, 4, 6, 8, 10, 12, 14].map((s): [number, number] => [s, s % 4 ? 0.25 : 0.38]),
  },
  groove: {
    kick: [[0, 0.95], [7, 0.55], [8, 0.8]],
    snare: [[4, 0.8], [12, 0.85]],
    hat: [0, 2, 4, 6, 8, 10, 12, 14].map((s): [number, number] => [s, s % 4 === 2 ? 0.55 : 0.4]),
  },
  drive: {
    kick: [[0, 1], [4, 0.85], [8, 1], [12, 0.85]],
    snare: [[4, 0.8], [12, 0.9]],
    clap: [[12, 0.6]],
    hat: Array.from({ length: 16 }, (_, s): [number, number] => [s, s % 2 ? 0.28 : 0.45]),
    openHat: [[14, 0.4]],
  },
};
/** The second half of a bar that leads into the next section: snare sixteenths that build, with kicks under them. */
const FILL: Pattern = {
  snare: [[8, 0.45], [10, 0.5], [12, 0.6], [13, 0.62], [14, 0.72], [15, 0.85]],
  kick: [[0, 0.9], [8, 0.7], [12, 0.6]],
  hat: [[0, 0.4], [2, 0.35], [4, 0.4], [6, 0.35]],
};
const SECTION_LEVEL: Record<Energy, number> = { none: 0.8, light: 0.88, half: 0.9, groove: 1, drive: 1.05 };

// ---------------------------------------------------------------------------------------------------------------
// The arranger
// ---------------------------------------------------------------------------------------------------------------

/** One full pass of `composition` arranged for `style`, as events sorted by time (in beats). */
export function arrange(composition: Composition, style: Style): MusicEvent[] {
  const out: MusicEvent[] = [];
  const total = loopBeats(composition);
  const push = (e: MusicEvent) => { if (e.beat < total - 1e-6 && e.vel > 0) out.push(e); };
  let voicing: number[] | null = null;

  for (const sec of resolve(composition)) {
    const tex = sec.section.texture;
    const level = SECTION_LEVEL[tex.drums];
    const quiet = tex.drums === 'none';

    for (const [beat, midi, beats, vel = 0.8] of sec.melody) push({ beat: sec.start + beat, beats, part: 'lead', midi, vel: vel * level });
    for (const [beat, midi, beats, vel = 0.8] of sec.counter) push({ beat: sec.start + beat, beats, part: 'counter', midi, vel: vel * 0.75 * level });

    // harmony and bass, chord by chord
    const spans = sec.chords.map(([symbol, beats]) => ({ chord: parseChord(symbol), beats }));
    let t = sec.start;
    spans.forEach(({ chord, beats }, i) => {
      voicing = voiceChord(chord, voicing, style.comping === 'chipArp' ? 60 : 53);
      const v = voicing;
      const next = (spans[i + 1] ?? spans[0]).chord;
      const root = bassNote(chord);
      const nextRoot = bassNote(next);
      const approach = nextRoot === root ? root + 7 : nextRoot - 1;
      const long = beats >= 4;

      if (tex.pad || quiet) for (const n of v) push({ beat: t, beats, part: 'pad', midi: n, vel: 0.32 * level });
      if (tex.comp !== false) comp(style, v, t, beats, long, level, push);
      else if (!tex.pad && !quiet) for (const n of v) push({ beat: t, beats, part: 'pad', midi: n, vel: 0.3 * level });

      if (tex.bass !== false) {
        const line = quiet || tex.drums === 'half' ? (style.bassLine === 'octaves' || style.bassLine === 'pump' ? 'lazy' : 'whole') : style.bassLine;
        bass(line, root, approach, t, beats, long, level, push);
      }
      t += beats;
    });

    // drums
    const energy: Energy = style.drums ? tex.drums : tex.drums === 'drive' ? 'light' : 'none';
    const pattern: Pattern = style.drums ? PATTERNS[energy] : energy === 'light' ? { hat: [[0, 0.3], [4, 0.25], [8, 0.3], [12, 0.25]] } : {};
    const barsInSection = sec.beats / 4;
    for (let bar = 0; bar < barsInSection; bar++) {
      const at = sec.start + bar * 4;
      const fillBar = style.drums && tex.fill && bar === barsInSection - 1;
      for (const [drum, hits] of Object.entries(pattern) as [I.DrumId, Hits][]) {
        for (const [step, vel] of hits) if (!(fillBar && step >= 8)) push({ beat: at + step / 4, beats: 0.25, part: 'drum', midi: 0, drum, vel: vel * level });
      }
      if (fillBar) for (const [drum, hits] of Object.entries(FILL) as [I.DrumId, Hits][]) for (const [step, vel] of hits) if (step >= 8) push({ beat: at + step / 4, beats: 0.25, part: 'drum', midi: 0, drum, vel });
      if (style.crackle) push({ beat: at, beats: 4, part: 'drum', midi: 0, drum: 'crackle', vel: 1 });
    }
    if (tex.crash && style.drums) push({ beat: sec.start, beats: 2, part: 'drum', midi: 0, drum: 'crash', vel: 0.6 });
  }

  // swing the off-beat eighths
  if (style.swing !== 0.5) for (const e of out) if (Math.abs((e.beat % 1) - 0.5) < 1e-6) e.beat += style.swing - 0.5;
  return out.sort((a, b) => a.beat - b.beat);
}

type Push = (e: MusicEvent) => void;

function comp(style: Style, v: number[], t: number, beats: number, long: boolean, level: number, push: Push) {
  switch (style.comping) {
    case 'mallets':
      for (let b = 0.5, k = 0; b < beats; b += 1, k++) push({ beat: t + b, beats: 0.5, part: 'comp', midi: v[k % v.length] + 12, vel: 0.3 * level });
      break;
    case 'epiano':
      for (const n of v) push({ beat: t, beats: long ? 1.5 : 1.25, part: 'comp', midi: n, vel: 0.7 * level });
      if (long) for (const n of v) push({ beat: t + 2.5, beats: 1, part: 'comp', midi: n, vel: 0.45 * level });
      break;
    case 'chipArp': {
      const seq = [...v, v[0] + 12, ...v.slice(1).reverse()];
      for (let b = 0, k = 0; b < beats; b += 0.25, k++) push({ beat: t + b, beats: 0.2, part: 'comp', midi: seq[k % seq.length], vel: (k % 4 === 0 ? 0.55 : 0.4) * level });
      break;
    }
    case 'pad':
      for (const n of v) push({ beat: t, beats, part: 'comp', midi: n, vel: 0.6 * level });
      push({ beat: t, beats, part: 'pad', midi: v[v.length - 1] + 12, vel: 0.25 * level });
      break;
    case 'brass':
      for (const [b, len, vel] of (long ? [[0, 0.45, 0.85], [1.5, 0.4, 0.6], [3, 0.6, 0.75]] : [[0, 0.45, 0.85], [1.5, 0.4, 0.6]]) as [number, number, number][]) {
        for (const n of v) push({ beat: t + b, beats: len, part: 'comp', midi: n + 12, vel: vel * level });
      }
      break;
  }
}

function bass(line: BassLine, root: number, approach: number, t: number, beats: number, long: boolean, level: number, push: Push) {
  const note = (b: number, len: number, midi: number, vel: number) => push({ beat: t + b, beats: len, part: 'bass', midi, vel: vel * level });
  switch (line) {
    case 'walk':
      (long ? [root, root + 7, root + 12, approach] : [root, approach]).forEach((m, k) => note(k, 0.9, m, k === 0 ? 0.9 : 0.7));
      break;
    case 'lazy':
      note(0, long ? 1.75 : 1.5, root, 0.9);
      if (long) { note(2.5, 0.75, root + 7, 0.6); note(3.5, 0.5, approach, 0.55); }
      break;
    case 'octaves':
      for (let b = 0, k = 0; b < beats; b += 0.5, k++) note(b, 0.4, root + (k % 2 ? 12 : 0), 0.75);
      break;
    case 'whole':
      note(0, beats - 0.1, root, 0.7);
      break;
    case 'pump':
      for (let b = 0, k = 0; b < beats; b += 0.5, k++) note(b, 0.4, root + (b % 2 === 1.5 ? 12 : 0), k % 2 ? 0.55 : 0.85);
      break;
  }
}

const cache = new Map<string, MusicEvent[]>();
export function arrangement(id: MusicId, style: SoundStyle): { events: MusicEvent[]; beats: number; bpm: number } {
  const c = COMPOSITIONS[id];
  const key = `${id}:${style}`;
  if (!cache.has(key)) cache.set(key, arrange(c, STYLES[style]));
  return { events: cache.get(key)!, beats: loopBeats(c), bpm: c.bpm * (style === 'calm' ? 0.92 : 1) };
}
