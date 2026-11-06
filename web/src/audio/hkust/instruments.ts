/**
 * The HKUST orchestra: its own synthesised instruments, shared with no other style. Strings are sections of several
 * players (slightly out of tune and out of time with each other, each with a bow noise and a delayed vibrato), brass
 * gets brighter as it gets louder, and the percussion is pitched where the real instruments are (timpani tuned by
 * their drum modes, tubular bells and glockenspiel by their inharmonic partials).
 *
 * Each instrument plays one note into `out` at audio time `t` for `dur` seconds at velocity `vel` (0–1) and schedules
 * its own stop, like the band voices, so it works live and in an OfflineAudioContext.
 */
import { envelope, lowpass, noise, osc, Q, release, type Ctx } from '../instruments';
import { midiToFreq } from '../theory';

export type Play = (ctx: Ctx, out: AudioNode, t: number, midi: number, dur: number, vel: number) => void;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function filter(ctx: Ctx, type: BiquadFilterType, f: number, q = 0.7, gain = 0) {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  b.gain.value = gain;
  return b;
}

/** A vibrato that starts after `delay` and grows, connected to every oscillator given. */
function vibrato(ctx: Ctx, t: number, end: number, f: number, rate: number, depth: number, delay: number, targets: OscillatorNode[]) {
  const lfo = osc(ctx, 'sine', rate, t, end);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.setValueAtTime(0, t + delay);
  g.gain.linearRampToValueAtTime(f * depth, t + delay + 0.35);
  lfo.connect(g);
  for (const o of targets) g.connect(o.frequency);
  release(lfo, g);
}

/**
 * Automate a filter once per 128-sample block instead of every sample: inaudible on a filter sweep, and far cheaper
 * (an automated filter at audio rate has its coefficients recomputed for every sample).
 */
function blockRate(p: AudioParam) {
  try { p.automationRate = 'k-rate'; } catch { /* older browsers: stays at audio rate */ }
}

/** A short burst of filtered noise (bow, breath, mallet, pluck). */
function burst(ctx: Ctx, out: AudioNode, t: number, level: number, type: BiquadFilterType, f: number, decay: number, q = 0.8, attack = 0.002) {
  const amp = envelope(ctx, t, level, attack, decay, 0.001, 0, 0.02);
  const flt = filter(ctx, type, Math.min(f, 16000), q);
  noise(ctx, t, amp.end - t).connect(flt);
  flt.connect(amp.g);
  amp.g.connect(out);
}

/** Decaying sine partials: [frequency ratio, amplitude, decay in seconds]. */
function partials(ctx: Ctx, out: AudioNode, t: number, f: number, level: number, list: [number, number, number][], glide = 0) {
  for (const [ratio, amp, decay] of list) {
    const fr = f * ratio;
    if (fr > 16000) continue;
    const env = envelope(ctx, t, level * amp, 0.002, decay, 0.001, 0, 0.05);
    const o = osc(ctx, 'sine', fr * (1 + glide), t, env.end);
    if (glide) o.frequency.exponentialRampToValueAtTime(fr, t + 0.09);
    o.connect(env.g);
    env.g.connect(out);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Strings
// ---------------------------------------------------------------------------------------------------------------

interface Section { players: number; spread: number; bright: number; cap: number; level: number; tremolo?: boolean; solo?: boolean }

/**
 * A bowed string section: `players` sawtooth "players", detuned and staggered. Lines that are heard on their own
 * (`solo`: the tune, the bass) also get a bow noise and a vibrato on long notes; harmony parts leave them out, which
 * keeps the whole orchestra light enough to play live. The body resonance is added once per section, at its seat.
 */
function bowed(ctx: Ctx, out: AudioNode, t: number, midi: number, dur: number, vel: number, s: Section) {
  const f = midiToFreq(midi);
  // short notes are bowed crisply (spiccato), long ones swell in
  const attack = dur < 0.25 ? 0.014 : clamp(0.05 + dur * 0.08, 0.06, 0.32);
  const amp = envelope(ctx, t, vel * s.level, attack, 0.3, 0.9, dur, dur < 0.25 ? 0.08 : clamp(0.3 + dur * 0.08, 0.3, 0.7));
  // louder is brighter, as on a real instrument
  const flt = lowpass(ctx, Math.min(s.cap, f * s.bright * (0.55 + 0.6 * vel)), 0.5);
  const oscs: OscillatorNode[] = [];
  for (let i = 0; i < s.players; i++) {
    const spread = s.players > 1 ? (i / (s.players - 1)) * 2 - 1 : 0;
    const o = osc(ctx, 'sawtooth', f, t + i * 0.006, amp.end, spread * s.spread);
    o.connect(flt);
    oscs.push(o);
  }
  if (s.solo && dur > 0.45) vibrato(ctx, t, amp.end, f, 5.3, 0.0045, 0.2, oscs);
  if (s.tremolo) {
    // bowed tremolo: the bow moves fast, so the level flutters
    const trem = ctx.createGain();
    trem.gain.value = 0.62;
    const lfo = osc(ctx, 'triangle', 12.5, t, amp.end);
    const depth = ctx.createGain();
    depth.gain.value = 0.38;
    lfo.connect(depth);
    depth.connect(trem.gain);
    release(lfo, depth);
    flt.connect(trem);
    trem.connect(amp.g);
  } else flt.connect(amp.g);
  amp.g.connect(out);
  if (s.solo) burst(ctx, out, t, vel * s.level * 0.5, 'bandpass', f * 2.5, dur < 0.25 ? 0.03 : 0.07, 1.2, 0.01);
}

export const violins: Play = (c, o, t, m, d, v) => bowed(c, o, t, m, d, v, { players: 3, spread: 13, bright: 7, cap: 7000, level: 0.19, solo: true });
/** Violas and cellos together: the warm middle of the strings, and the cellos an octave above the basses. */
export const celli: Play = (c, o, t, m, d, v) => bowed(c, o, t, m, d, v, { players: d < 0.3 ? 2 : 3, spread: 10, bright: 5, cap: 3600, level: 0.24, solo: d > 0.3 });
export const basses: Play = (c, o, t, m, d, v) => bowed(c, o, t, m, d, v, { players: 2, spread: 8, bright: 7, cap: 2000, level: 0.34, solo: true });
/** Divided strings holding the harmony. */
export const strings: Play = (c, o, t, m, d, v) => bowed(c, o, t, m, d, v, { players: 2, spread: 12, bright: 5, cap: 5200, level: 0.16 });
export const tremolo: Play = (c, o, t, m, d, v) => bowed(c, o, t, m, d, v, { players: 2, spread: 12, bright: 6, cap: 6000, level: 0.18, tremolo: true });

/**
 * Pizzicato section: two players plucking not quite together into one filter, a quick decay (longer when low), and a
 * woody thump. The body resonance is added once, at the section's seat. (No filter sweep: automating a filter makes
 * the browser recompute it every sample, which is too heavy for a part that plays on every beat.)
 */
export const pizz: Play = (ctx, out, t, midi, _dur, vel) => {
  const f = midiToFreq(midi);
  const decay = clamp(0.95 - (midi - 36) * 0.014, 0.16, 0.85);
  const amp = envelope(ctx, t, vel * 0.32, 0.003, decay, 0.001, 0, 0.03);
  const flt = lowpass(ctx, Math.min(6000, f * (2 + 2 * vel)), 0.9);
  osc(ctx, 'triangle', f, t, amp.end, -6).connect(flt);
  osc(ctx, 'sawtooth', f, t + 0.013, amp.end, 6).connect(flt);
  flt.connect(amp.g);
  amp.g.connect(out);
  burst(ctx, out, t, vel * 0.06, 'lowpass', 1100, 0.025);
};

/** Concert harp: a plucked string that rings for seconds, its overtones fading first. */
export const harp: Play = (ctx, out, t, midi, _dur, vel) => {
  const f = midiToFreq(midi);
  const ring = clamp(3.2 - (midi - 48) * 0.045, 0.9, 3.4);
  partials(ctx, out, t, f, vel * 0.26, [[1, 1, ring], [2, 0.33, ring * 0.45], [3, 0.13, ring * 0.25]]);
  burst(ctx, out, t, vel * 0.035, 'highpass', 2600, 0.012);
};

// ---------------------------------------------------------------------------------------------------------------
// Woodwinds
// ---------------------------------------------------------------------------------------------------------------

/** Flute: nearly pure tone, breath noise, a chiff on the attack and a gentle vibrato. */
export const flute: Play = (ctx, out, t, midi, dur, vel) => {
  const f = midiToFreq(midi);
  const amp = envelope(ctx, t, vel * 0.25, 0.06, 0.1, 0.85, dur, 0.12);
  const tone = ctx.createGain();
  tone.gain.value = 1;
  const oscs = [osc(ctx, 'sine', f, t, amp.end)];
  oscs[0].connect(tone);
  for (const [ratio, level] of [[2, 0.2], [3, 0.06]]) {
    const g = ctx.createGain();
    g.gain.value = level;
    const o = osc(ctx, 'sine', f * ratio, t, amp.end);
    o.connect(g);
    g.connect(tone);
    oscs.push(o);
  }
  if (dur > 0.4) vibrato(ctx, t, amp.end, f, 5.1, 0.004, 0.18, oscs);
  tone.connect(amp.g);
  // breath under the tone
  const breath = filter(ctx, 'bandpass', Math.min(f * 1.6, 9000), 0.9);
  const bg = ctx.createGain();
  bg.gain.value = 0.11;
  noise(ctx, t, amp.end - t).connect(breath);
  breath.connect(bg);
  bg.connect(amp.g);
  amp.g.connect(out);
  burst(ctx, out, t, vel * 0.05, 'bandpass', Math.min(f * 4, 12000), 0.04, 1.5);
};

/** Clarinet: hollow (odd harmonics), soft-edged, without vibrato as clarinettists play. */
export const clarinet: Play = (ctx, out, t, midi, dur, vel) => {
  const f = midiToFreq(midi);
  const amp = envelope(ctx, t, vel * 0.17, 0.05, 0.12, 0.88, dur, 0.1);
  const flt = lowpass(ctx, Math.min(3200, f * (3 + 2 * vel)), 0.6);
  osc(ctx, 'square', f, t, amp.end).connect(flt);
  const fund = ctx.createGain();
  fund.gain.value = 0.5;
  osc(ctx, 'sine', f, t, amp.end).connect(fund);
  fund.connect(amp.g);
  flt.connect(amp.g);
  amp.g.connect(out);
  burst(ctx, out, t, vel * 0.025, 'bandpass', Math.min(f * 3, 9000), 0.04, 1);
};

// ---------------------------------------------------------------------------------------------------------------
// Brass: the filter opens with the attack and further with the dynamic
// ---------------------------------------------------------------------------------------------------------------

function brassNote(ctx: Ctx, out: AudioNode, t: number, midi: number, dur: number, vel: number, o: { level: number; attack: number; low: number; high: number; cap: number; vib: boolean }) {
  const f = midiToFreq(midi);
  const amp = envelope(ctx, t, vel * o.level, o.attack, 0.12, 0.82, dur, 0.14);
  const target = Math.min(o.cap, f * (o.low + o.high * vel));
  const flt = lowpass(ctx, target, 0.8);
  blockRate(flt.frequency);
  flt.frequency.setValueAtTime(f * 1.1, t);
  flt.frequency.exponentialRampToValueAtTime(target * 1.25, t + o.attack + 0.02);
  flt.frequency.exponentialRampToValueAtTime(target, t + o.attack + 0.25);
  const a = osc(ctx, 'sawtooth', f, t, amp.end, -4);
  const b = osc(ctx, 'sawtooth', f, t, amp.end, 4);
  a.connect(flt);
  b.connect(flt);
  if (o.vib && dur > 0.5) vibrato(ctx, t, amp.end, f, 5.4, 0.0035, 0.3, [a, b]);
  flt.connect(amp.g);
  amp.g.connect(out);
}

export const trumpet: Play = (c, o, t, m, d, v) => brassNote(c, o, t, m, d, v, { level: 0.24, attack: 0.025, low: 3, high: 7, cap: 9500, vib: true });
export const horns: Play = (c, o, t, m, d, v) => brassNote(c, o, t, m, d, v, { level: 0.3, attack: 0.07, low: 1.6, high: 2.6, cap: 2600, vib: false });
export const trombones: Play = (c, o, t, m, d, v) => brassNote(c, o, t, m, d, v, { level: 0.26, attack: 0.05, low: 2, high: 3.4, cap: 2400, vib: false });

// ---------------------------------------------------------------------------------------------------------------
// Pitched percussion
// ---------------------------------------------------------------------------------------------------------------

/** Timpani, tuned: the drum's modes (about 1 : 1.5 : 1.74 : 2 : 2.25 : 2.5), a slight pitch drop as the head settles. */
const TIMPANI_MODES: [number, number, number][] = [[1, 1, 1.9], [1.504, 0.55, 1.1], [1.742, 0.25, 0.75], [2, 0.38, 0.85], [2.245, 0.14, 0.55], [2.494, 0.1, 0.45]];
export const timpani: Play = (ctx, out, t, midi, _dur, vel) => {
  partials(ctx, out, t, midiToFreq(midi), vel * 0.42, TIMPANI_MODES, 0.012);
  burst(ctx, out, t, vel * 0.22, 'lowpass', 700, 0.05);
};
/**
 * A timpani roll: one sustained voice rather than dozens of strokes (which would be too heavy to play live). The drum's
 * modes are held and fluttered by fast, slightly uneven sticking, over a soft bed of mallet noise.
 */
function roll(ctx: Ctx, out: AudioNode, t: number, midi: number, dur: number, from: number, to: number) {
  const f = midiToFreq(midi);
  const end = t + dur + 0.9;
  const level = ctx.createGain();
  level.gain.setValueAtTime(Math.max(from, Q), t);
  level.gain.exponentialRampToValueAtTime(Math.max(to, Q), t + dur);
  level.gain.exponentialRampToValueAtTime(Q, end);
  // the sticking: each stroke is a bump in level, about 13 a second
  const flutter = ctx.createGain();
  flutter.gain.value = 0.6;
  const sticks = osc(ctx, 'sawtooth', 13.3, t, end);
  const depth = ctx.createGain();
  depth.gain.value = 0.4;
  sticks.connect(depth);
  depth.connect(flutter.gain);
  release(sticks, depth);
  for (const [ratio, amp] of TIMPANI_MODES.slice(0, 4)) {
    const g = ctx.createGain();
    g.gain.value = amp * 0.42;
    osc(ctx, 'sine', f * ratio, t, end).connect(g);
    g.connect(flutter);
  }
  const bed = lowpass(ctx, 600, 0.5);
  const bedLevel = ctx.createGain();
  bedLevel.gain.value = 0.25;
  noise(ctx, t, end - t).connect(bed);
  bed.connect(bedLevel);
  bedLevel.connect(flutter);
  flutter.connect(level);
  level.connect(out);
}
/** A timpani roll that grows from soft to `vel` over `dur`, into the next downbeat. */
export const timpaniRoll: Play = (ctx, out, t, midi, dur, vel) => roll(ctx, out, t, midi, dur, vel * 0.08, vel * 0.5);
/** A soft, steady timpani roll, held. */
export const timpaniTrem: Play = (ctx, out, t, midi, dur, vel) => roll(ctx, out, t, midi, dur, vel * 0.16, vel * 0.16);

/** Tubular bells: the university bell. Inharmonic partials with a long ring and a slow beat between two of them. */
export const bells: Play = (ctx, out, t, midi, _dur, vel) => {
  const f = midiToFreq(midi);
  partials(ctx, out, t, f, vel * 0.2, [[1, 1, 4.5], [1.003, 0.35, 4], [2.01, 0.5, 3], [2.76, 0.38, 2.2], [4.07, 0.22, 1.4], [5.43, 0.12, 0.9]]);
  burst(ctx, out, t, vel * 0.08, 'bandpass', 3200, 0.012, 1.5);
};

/** Glockenspiel: steel bars, partials at 1 : 2.71 : 5.15. */
export const glock: Play = (ctx, out, t, midi, _dur, vel) => {
  partials(ctx, out, t, midiToFreq(midi), vel * 0.18, [[1, 1, 1.3], [2.71, 0.3, 0.4], [5.15, 0.12, 0.15]]);
  burst(ctx, out, t, vel * 0.04, 'highpass', 6000, 0.008);
};

/** Celesta: soft hammered bars, a fundamental and an octave. */
export const celesta: Play = (ctx, out, t, midi, _dur, vel) => {
  partials(ctx, out, t, midiToFreq(midi), vel * 0.2, [[1, 1, 1], [2, 0.3, 0.45], [4, 0.06, 0.15]]);
  burst(ctx, out, t, vel * 0.03, 'lowpass', 2200, 0.01);
};

// ---------------------------------------------------------------------------------------------------------------
// Unpitched percussion (the note is ignored)
// ---------------------------------------------------------------------------------------------------------------

/** Clashed cymbals: a noise wash with a metallic shimmer of inharmonic square waves. */
export const cymbals: Play = (ctx, out, t, _m, _d, vel) => {
  burst(ctx, out, t, vel * 0.16, 'highpass', 3200, 2.4, 0.5);
  burst(ctx, out, t, vel * 0.08, 'bandpass', 6200, 1.4, 0.6);
  const amp = envelope(ctx, t, vel * 0.025, 0.002, 1.2, 0.001, 0, 0.05);
  const hp = filter(ctx, 'highpass', 6500, 0.7);
  for (const r of [1, 1.342, 1.581, 1.931, 2.214, 2.632]) osc(ctx, 'square', 410 * r, t, amp.end).connect(hp);
  hp.connect(amp.g);
  amp.g.connect(out);
};
/** Suspended cymbal rolled with soft mallets: swells over `dur` and rings on. */
export const swell: Play = (ctx, out, t, _m, dur, vel) => {
  const g = ctx.createGain();
  g.gain.setValueAtTime(Q, t);
  g.gain.exponentialRampToValueAtTime(vel * 0.14, t + dur);
  g.gain.exponentialRampToValueAtTime(Q, t + dur + 1.6);
  const bp = filter(ctx, 'bandpass', 5200, 0.5);
  noise(ctx, t, dur + 1.7).connect(bp);
  bp.connect(g);
  g.connect(out);
};
/** Bass drum (gran cassa): a deep, soft boom, with a harmonic small speakers can play. */
export const bassDrum: Play = (ctx, out, t, _m, _d, vel) => {
  partials(ctx, out, t, 58, vel * 0.55, [[1, 1, 1.1], [2.1, 0.35, 0.4]], 0.08);
  burst(ctx, out, t, vel * 0.12, 'lowpass', 220, 0.15);
};
/** Field drum for the march: snares and a woody shell. */
export const fieldDrum: Play = (ctx, out, t, _m, _d, vel) => {
  burst(ctx, out, t, vel * 0.3, 'bandpass', 2100, 0.17, 0.7);
  burst(ctx, out, t, vel * 0.12, 'highpass', 5200, 0.09);
  partials(ctx, out, t, 205, vel * 0.2, [[1, 1, 0.07]]);
};
export const triangle: Play = (ctx, out, t, _m, _d, vel) => partials(ctx, out, t, 2300, vel * 0.05, [[1, 1, 1.6], [1.53, 0.7, 1.3], [2.26, 0.5, 1], [3.43, 0.3, 0.7]]);
/** Temple block: the Morse code, and the countdown's ticks. In the 1–3 kHz range that cuts through a room. */
export const block: Play = (ctx, out, t, _m, _d, vel) => {
  partials(ctx, out, t, 1180, vel * 2, [[1, 1, 0.11], [2.43, 0.35, 0.04]]);
  burst(ctx, out, t, vel * 0.45, 'bandpass', 1180, 0.03, 6);
};
export const blockHigh: Play = (ctx, out, t, _m, _d, vel) => {
  partials(ctx, out, t, 1560, vel * 2.4, [[1, 1, 0.16], [2.43, 0.4, 0.05]]);
  burst(ctx, out, t, vel * 0.55, 'bandpass', 1560, 0.035, 6);
};
/** A wave at Clear Water Bay rolling in and drawing back over about four seconds. */
export const surf: Play = (ctx, out, t, _m, _d, vel) => {
  const g = ctx.createGain();
  g.gain.setValueAtTime(Q, t);
  g.gain.exponentialRampToValueAtTime(vel * 0.16, t + 1.6);
  g.gain.exponentialRampToValueAtTime(Q, t + 4.2);
  const flt = filter(ctx, 'lowpass', 500, 0.4);
  blockRate(flt.frequency);
  flt.frequency.setValueAtTime(500, t);
  flt.frequency.exponentialRampToValueAtTime(2600, t + 1.6);
  flt.frequency.exponentialRampToValueAtTime(400, t + 4.2);
  noise(ctx, t, 4.3).connect(flt);
  flt.connect(g);
  g.connect(out);
};

export const ORCHESTRA = {
  violins, celli, basses, strings, tremolo, pizz, harp,
  flute, clarinet,
  trumpet, horns, trombones,
  timpani, timpaniRoll, timpaniTrem, bells, glock, celesta,
  cymbals, swell, bassDrum, fieldDrum, triangle, block, blockHigh, surf,
} satisfies Record<string, Play>;

export type Instrument = keyof typeof ORCHESTRA;

/** Comfortable written ranges (MIDI), used to choose the octave a line is played in. */
export const RANGE: Partial<Record<Instrument, [number, number]>> = {
  violins: [55, 98], celli: [36, 76], basses: [28, 55], strings: [48, 93], tremolo: [48, 93], pizz: [28, 91], harp: [24, 103],
  flute: [60, 96], clarinet: [50, 89], trumpet: [55, 84], horns: [41, 77], trombones: [40, 72],
  timpani: [38, 57], bells: [60, 79], glock: [79, 108], celesta: [60, 108],
};
