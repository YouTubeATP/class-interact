/**
 * Synthesised instruments. Each voice plays one note into `out` at audio time `t` for `dur` seconds with velocity
 * `vel` (0–1), and schedules its own stop, so it works the same in a live AudioContext and an OfflineAudioContext.
 * Nothing is sampled or downloaded.
 */
import { midiToFreq } from './theory';

export type Ctx = BaseAudioContext;
export type Voice = (ctx: Ctx, out: AudioNode, t: number, midi: number, dur: number, vel: number) => void;
export type DrumId = 'kick' | 'snare' | 'hat' | 'openHat' | 'clap' | 'crash' | 'block' | 'blockHigh' | 'roll' | 'crackle';
export type Drum = (ctx: Ctx, out: AudioNode, t: number, vel: number) => void;

export const Q = 0.0001;

export function osc(ctx: Ctx, type: OscillatorType, f: number, t: number, end: number, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (detune) o.detune.setValueAtTime(detune, t);
  o.start(t);
  o.stop(end + 0.05);
  return o;
}

/** A gain envelope: attack to `peak`, decay to `sustain × peak` over `decay`, hold until `t + hold`, release. */
export function envelope(ctx: Ctx, t: number, peak: number, a: number, decay: number, sustain: number, hold: number, release: number) {
  const g = ctx.createGain();
  const p = Math.max(peak, Q * 2);
  const s = Math.max(p * sustain, Q);
  g.gain.setValueAtTime(Q, t);
  g.gain.exponentialRampToValueAtTime(p, t + a);
  g.gain.exponentialRampToValueAtTime(s, t + a + decay);
  const holdEnd = Math.max(t + a + decay, t + hold);
  g.gain.setValueAtTime(s, holdEnd);
  g.gain.exponentialRampToValueAtTime(Q, holdEnd + release);
  return { g, end: holdEnd + release };
}

export function lowpass(ctx: Ctx, f: number, q = 0.7) {
  const flt = ctx.createBiquadFilter();
  flt.type = 'lowpass';
  flt.frequency.value = f;
  flt.Q.value = q;
  return flt;
}

const noiseBuffers = new WeakMap<Ctx, AudioBuffer>();
export function noise(ctx: Ctx, t: number, len: number) {
  let buf = noiseBuffers.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff; // deterministic, so renders are repeatable
      d[i] = (seed / 0x7fffffff) * 2 - 1;
    }
    noiseBuffers.set(ctx, buf);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.start(t, Math.random() * 0.5);
  src.stop(t + len + 0.05);
  return src;
}

// ---------------------------------------------------------------------------------------------------------------
// Melodic voices
// ---------------------------------------------------------------------------------------------------------------

/** Marimba-like mallet: a warm fundamental and a quickly fading fourth partial. Percussive, so length barely matters. */
export const mallet: Voice = (ctx, out, t, midi, dur, vel) => {
  const f = midiToFreq(midi);
  const len = Math.min(1.4, 0.35 + dur * 0.7);
  const body = envelope(ctx, t, vel * 0.9, 0.003, len, 0.001, 0, 0.05);
  osc(ctx, 'sine', f, t, body.end).connect(body.g);
  body.g.connect(out);
  const click = envelope(ctx, t, vel * 0.22, 0.002, 0.09, 0.001, 0, 0.02);
  osc(ctx, 'sine', f * 4, t, click.end).connect(click.g);
  click.g.connect(out);
};

/** FM bell: a clear, glassy tone with a long ring. */
export const bell: Voice = (ctx, out, t, midi, dur, vel) => {
  const f = midiToFreq(midi);
  const ring = Math.min(2.6, 1.1 + dur);
  const amp = envelope(ctx, t, vel * 0.7, 0.004, ring, 0.001, 0, 0.05);
  const car = osc(ctx, 'sine', f, t, amp.end);
  const mod = osc(ctx, 'sine', f * 3.5, t, amp.end);
  const idx = ctx.createGain();
  idx.gain.setValueAtTime(f * 1.8 * vel + 1, t);
  idx.gain.exponentialRampToValueAtTime(f * 0.15 + 1, t + 0.9);
  mod.connect(idx);
  idx.connect(car.frequency);
  car.connect(amp.g);
  amp.g.connect(out);
};

/** FM electric piano: soft bell-like attack that settles into a round tone. */
export const epiano: Voice = (ctx, out, t, midi, dur, vel) => {
  const f = midiToFreq(midi);
  const amp = envelope(ctx, t, vel * 0.75, 0.006, 0.9, 0.35, dur, 0.35);
  const car = osc(ctx, 'sine', f, t, amp.end);
  const mod = osc(ctx, 'sine', f, t, amp.end);
  const idx = ctx.createGain();
  idx.gain.setValueAtTime(f * 1.1 * vel + 1, t);
  idx.gain.exponentialRampToValueAtTime(f * 0.12 + 1, t + 0.3);
  mod.connect(idx);
  idx.connect(car.frequency);
  const tine = envelope(ctx, t, vel * 0.08, 0.002, 0.15, 0.001, 0, 0.02);
  osc(ctx, 'sine', f * 7, t, tine.end).connect(tine.g);
  tine.g.connect(out);
  car.connect(amp.g);
  amp.g.connect(out);
};

/** Plucked synth: a bright attack that closes down quickly, like a muted guitar or harp. */
export const pluck: Voice = (ctx, out, t, midi, dur, vel) => {
  const f = midiToFreq(midi);
  const amp = envelope(ctx, t, vel * 0.45, 0.004, Math.min(0.7, 0.25 + dur * 0.4), 0.001, 0, 0.04);
  const flt = lowpass(ctx, Math.min(9000, f * 8), 2);
  flt.frequency.setValueAtTime(Math.min(9000, f * 8), t);
  flt.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.4), t + 0.3);
  osc(ctx, 'sawtooth', f, t, amp.end).connect(flt);
  flt.connect(amp.g);
  amp.g.connect(out);
};

/** Chiptune pulse lead: a square wave with a crisp gate, like an 8-bit console. */
export const pulse: Voice = (ctx, out, t, midi, dur, vel) => {
  const f = midiToFreq(midi);
  const amp = envelope(ctx, t, vel * 0.32, 0.003, 0.06, 0.7, dur * 0.85, 0.04);
  const flt = lowpass(ctx, 6500);
  const o = osc(ctx, 'square', f, t, amp.end);
  // a touch of delayed vibrato on long notes
  if (dur > 0.35) {
    const lfo = osc(ctx, 'sine', 6, t, amp.end);
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(dur, 0.6));
    lfo.connect(depth);
    depth.connect(o.frequency);
  }
  o.connect(flt);
  flt.connect(amp.g);
  amp.g.connect(out);
};

/** Synth brass: two detuned saws through a filter that opens on the attack. Punchy for fanfares and stabs. */
export const brass: Voice = (ctx, out, t, midi, dur, vel) => {
  const f = midiToFreq(midi);
  const amp = envelope(ctx, t, vel * 0.32, 0.025, 0.12, 0.75, dur, 0.14);
  const flt = lowpass(ctx, f * 2, 1.2);
  flt.frequency.setValueAtTime(f * 1.5, t);
  flt.frequency.exponentialRampToValueAtTime(Math.min(9000, f * 7), t + 0.05);
  flt.frequency.exponentialRampToValueAtTime(Math.min(7000, f * 4), t + 0.25);
  osc(ctx, 'sawtooth', f, t, amp.end, -8).connect(flt);
  osc(ctx, 'sawtooth', f, t, amp.end, 8).connect(flt);
  flt.connect(amp.g);
  amp.g.connect(out);
};

/** Warm pad: detuned triangles with a slow swell. */
export const pad: Voice = (ctx, out, t, midi, dur, vel) => {
  const f = midiToFreq(midi);
  const amp = envelope(ctx, t, vel * 0.22, Math.min(0.45, dur * 0.3), 0.2, 0.85, dur, 0.6);
  const flt = lowpass(ctx, 1800);
  osc(ctx, 'triangle', f, t, amp.end, -7).connect(flt);
  osc(ctx, 'triangle', f, t, amp.end, 7).connect(flt);
  const air = ctx.createGain();
  air.gain.value = 0.25;
  osc(ctx, 'sawtooth', f, t, amp.end).connect(air);
  air.connect(flt);
  flt.connect(amp.g);
  amp.g.connect(out);
};

// ---------------------------------------------------------------------------------------------------------------
// Bass voices
// ---------------------------------------------------------------------------------------------------------------

/** Round bass with enough upper harmonics to be heard on small speakers that cannot play its fundamental. */
export const subBass: Voice = (ctx, out, t, midi, dur, vel) => {
  const f = midiToFreq(midi);
  const amp = envelope(ctx, t, vel * 0.65, 0.008, 0.25, 0.6, dur * 0.92, 0.08);
  osc(ctx, 'sine', f, t, amp.end).connect(amp.g);
  for (const [mult, level] of [[2, 0.55], [3, 0.22], [4, 0.1]] as const) {
    const h = ctx.createGain();
    h.gain.value = level;
    osc(ctx, mult === 2 ? 'triangle' : 'sine', f * mult, t, amp.end).connect(h);
    h.connect(amp.g);
  }
  amp.g.connect(out);
};

/** Plucked bass, like a fingered electric bass. */
export const pluckBass: Voice = (ctx, out, t, midi, dur, vel) => {
  const f = midiToFreq(midi);
  const amp = envelope(ctx, t, vel * 0.6, 0.005, 0.3, 0.45, dur * 0.9, 0.08);
  const flt = lowpass(ctx, f * 4, 1.5);
  flt.frequency.setValueAtTime(f * 6, t);
  flt.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.22);
  osc(ctx, 'sawtooth', f, t, amp.end).connect(flt);
  osc(ctx, 'sine', f, t, amp.end).connect(amp.g);
  flt.connect(amp.g);
  amp.g.connect(out);
};

/** 8-bit bass: a triangle wave with a hard gate, as on old consoles. */
export const chipBass: Voice = (ctx, out, t, midi, dur, vel) => {
  const amp = envelope(ctx, t, vel * 0.75, 0.002, 0.02, 0.9, dur * 0.8, 0.02);
  osc(ctx, 'triangle', midiToFreq(midi), t, amp.end).connect(amp.g);
  amp.g.connect(out);
};

/** Fat synth bass for big, bright arrangements. */
export const synthBass: Voice = (ctx, out, t, midi, dur, vel) => {
  const f = midiToFreq(midi);
  const amp = envelope(ctx, t, vel * 0.42, 0.006, 0.18, 0.7, dur * 0.85, 0.06);
  const flt = lowpass(ctx, 900, 3);
  flt.frequency.setValueAtTime(1600, t);
  flt.frequency.exponentialRampToValueAtTime(500, t + 0.18);
  osc(ctx, 'square', f, t, amp.end).connect(flt);
  osc(ctx, 'sawtooth', f, t, amp.end, 6).connect(flt);
  osc(ctx, 'sine', f, t, amp.end).connect(amp.g);
  flt.connect(amp.g);
  amp.g.connect(out);
};

// ---------------------------------------------------------------------------------------------------------------
// Drums, in kits
// ---------------------------------------------------------------------------------------------------------------

function kick(ctx: Ctx, out: AudioNode, t: number, vel: number, from: number, to: number, decay: number, type: OscillatorType = 'sine') {
  const amp = envelope(ctx, t, vel * 0.9, 0.002, decay, 0.001, 0, 0.02);
  const o = osc(ctx, type, from, t, amp.end);
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(to, t + decay * 0.4);
  if (type !== 'sine') {
    const flt = lowpass(ctx, 1200);
    o.connect(flt);
    flt.connect(amp.g);
  } else o.connect(amp.g);
  amp.g.connect(out);
}

function noiseHit(ctx: Ctx, out: AudioNode, t: number, vel: number, type: BiquadFilterType, f: number, decay: number, q = 0.8) {
  const amp = envelope(ctx, t, vel, 0.001, decay, 0.001, 0, 0.02);
  const flt = ctx.createBiquadFilter();
  flt.type = type;
  flt.frequency.value = f;
  flt.Q.value = q;
  noise(ctx, t, amp.end - t).connect(flt);
  flt.connect(amp.g);
  amp.g.connect(out);
}

function tone(ctx: Ctx, out: AudioNode, t: number, vel: number, f: number, decay: number, type: OscillatorType = 'sine') {
  const amp = envelope(ctx, t, vel, 0.001, decay, 0.001, 0, 0.01);
  osc(ctx, type, f, t, amp.end).connect(amp.g);
  amp.g.connect(out);
}

export type Kit = Record<DrumId, Drum>;

const shared = {
  // the countdown ticks: woodblock-like, in the 1.5–5 kHz range where they cut through a room
  block: (ctx: Ctx, out: AudioNode, t: number, vel: number) => { tone(ctx, out, t, vel * 1.3, 1650, 0.06); tone(ctx, out, t, vel * 0.5, 4100, 0.025); },
  blockHigh: (ctx: Ctx, out: AudioNode, t: number, vel: number) => { tone(ctx, out, t, vel * 1.6, 2150, 0.07); tone(ctx, out, t, vel * 0.6, 5300, 0.03); },
  roll: (ctx: Ctx, out: AudioNode, t: number, vel: number) => {
    // a short snare roll that swells into the downbeat
    for (let i = 0; i < 12; i++) noiseHit(ctx, out, t + i * 0.03, vel * (0.15 + 0.5 * (i / 11)), 'bandpass', 2400, 0.05, 0.9);
  },
  crackle: (ctx: Ctx, out: AudioNode, t: number, vel: number) => {
    // vinyl dust: a few faint clicks spread over a beat
    for (let i = 0; i < 3; i++) noiseHit(ctx, out, t + Math.random() * 0.5, vel * (0.04 + Math.random() * 0.05), 'highpass', 3000, 0.004, 0.5);
  },
};

/** Clean acoustic-ish kit. */
export const bright: Kit = {
  // kicks end around 60 Hz with a click on top, so they still thump on speakers without real low end
  kick: (c, o, t, v) => { kick(c, o, t, v, 160, 60, 0.3); tone(c, o, t, v * 0.12, 3000, 0.006); },
  snare: (c, o, t, v) => { noiseHit(c, o, t, v * 0.45, 'bandpass', 1900, 0.16); tone(c, o, t, v * 0.25, 190, 0.08, 'triangle'); },
  hat: (c, o, t, v) => noiseHit(c, o, t, v * 0.25, 'highpass', 7500, 0.035),
  openHat: (c, o, t, v) => noiseHit(c, o, t, v * 0.22, 'highpass', 7000, 0.22),
  clap: (c, o, t, v) => { for (const d of [0, 0.011, 0.023]) noiseHit(c, o, t + d, v * 0.35, 'bandpass', 1300, 0.08, 1.2); },
  crash: (c, o, t, v) => noiseHit(c, o, t, v * 0.18, 'highpass', 5200, 1.1, 0.5),
  ...shared,
};

/** Dusty lo-fi kit: soft, low-passed, a bit behind the beat. */
export const dusty: Kit = {
  ...bright,
  kick: (c, o, t, v) => { kick(c, o, t, v * 0.85, 130, 56, 0.36); tone(c, o, t, v * 0.08, 2200, 0.008); },
  snare: (c, o, t, v) => { noiseHit(c, o, t, v * 0.3, 'bandpass', 1300, 0.2, 0.6); tone(c, o, t, v * 0.18, 170, 0.1, 'triangle'); },
  hat: (c, o, t, v) => noiseHit(c, o, t, v * 0.14, 'bandpass', 6000, 0.03, 0.7),
  openHat: (c, o, t, v) => noiseHit(c, o, t, v * 0.12, 'bandpass', 6000, 0.16, 0.7),
};

/** 8-bit kit: pitched-noise percussion. */
export const chip: Kit = {
  ...bright,
  kick: (c, o, t, v) => kick(c, o, t, v * 0.7, 240, 65, 0.12, 'square'),
  snare: (c, o, t, v) => noiseHit(c, o, t, v * 0.4, 'lowpass', 5200, 0.1),
  hat: (c, o, t, v) => noiseHit(c, o, t, v * 0.18, 'highpass', 9000, 0.02),
  openHat: (c, o, t, v) => noiseHit(c, o, t, v * 0.16, 'highpass', 8500, 0.09),
  clap: (c, o, t, v) => noiseHit(c, o, t, v * 0.32, 'bandpass', 2600, 0.06),
  crash: (c, o, t, v) => noiseHit(c, o, t, v * 0.16, 'highpass', 6000, 0.5),
};

/** Big, punchy kit for the game-show style. */
export const punchy: Kit = {
  ...bright,
  kick: (c, o, t, v) => { kick(c, o, t, v * 1.05, 180, 60, 0.3); tone(c, o, t, v * 0.15, 2600, 0.008); },
  snare: (c, o, t, v) => { noiseHit(c, o, t, v * 0.55, 'bandpass', 2100, 0.17); tone(c, o, t, v * 0.3, 210, 0.07, 'triangle'); },
};
