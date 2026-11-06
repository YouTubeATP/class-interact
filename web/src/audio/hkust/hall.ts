/**
 * Where the HKUST orchestra plays: each instrument has its seat (its place left to right, as an orchestra sits on
 * stage) and is heard partly direct and partly through a concert hall.
 *
 * The hall is a synthesised impulse response: a few early reflections, then a 2.2-second tail of noise that decays and
 * gets darker as it does (high frequencies die first, as they do in a real room). Classroom AV rooms are reverberant
 * already, so the hall is kept moderate and its low end is cut, which keeps speech-room speakers from booming.
 */
import type { Ctx } from '../instruments';
import type { Instrument } from './instruments';

/** [pan −1…1, share sent to the hall, level]. American seating: violins left, cellos and basses right. */
const SEATS: Record<Instrument, [pan: number, hall: number, level: number]> = {
  violins: [-0.4, 0.3, 1], strings: [-0.1, 0.32, 1], tremolo: [-0.1, 0.3, 1], celli: [0.3, 0.28, 1], basses: [0.45, 0.22, 1],
  pizz: [0.1, 0.26, 1], harp: [-0.55, 0.32, 1],
  flute: [-0.12, 0.3, 1], clarinet: [0.12, 0.3, 1],
  horns: [-0.28, 0.38, 1], trumpet: [0.18, 0.3, 1], trombones: [0.38, 0.32, 1],
  timpani: [0, 0.34, 1], timpaniRoll: [0, 0.34, 1], timpaniTrem: [0, 0.34, 1],
  bells: [-0.22, 0.4, 1], glock: [0.25, 0.3, 1], celesta: [-0.3, 0.3, 1],
  cymbals: [0.15, 0.3, 1], swell: [0.15, 0.32, 1], bassDrum: [0.05, 0.3, 1], fieldDrum: [0.1, 0.24, 1], triangle: [0.25, 0.32, 1],
  block: [0, 0.14, 1], blockHigh: [0, 0.14, 1], surf: [0, 0.1, 1],
};

const BOWED = new Set<Instrument>(['violins', 'celli', 'basses', 'strings', 'tremolo', 'pizz']);

const impulses = new WeakMap<Ctx, AudioBuffer>();

/** The hall's impulse response for this context (made once, deterministic so renders repeat exactly). */
function impulse(ctx: Ctx): AudioBuffer {
  const cached = impulses.get(ctx);
  if (cached) return cached;
  const rate = ctx.sampleRate;
  const length = Math.round(rate * 2.4);
  const buf = ctx.createBuffer(2, length, rate);
  const rt60 = 2.2;
  const predelay = Math.round(rate * 0.018);
  const early: [number, number][] = [[0.011, 0.5], [0.019, 0.38], [0.027, 0.33], [0.041, 0.26], [0.053, 0.2], [0.067, 0.16]];
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let seed = 777 + ch * 1013;
    let lp = 0;
    for (let i = predelay; i < length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const white = (seed / 0x7fffffff) * 2 - 1;
      const time = (i - predelay) / rate;
      // a one-pole low-pass that closes as the tail decays: the hall's air absorbs the highs first
      const a = 0.85 - 0.75 * Math.min(1, time / rt60);
      lp += a * (white - lp);
      d[i] = lp * Math.exp((-6.9 * time) / rt60) * 0.5;
    }
    for (const [at, amp] of early) {
      const i = predelay + Math.round(rate * (at + ch * 0.0023));
      if (i < length) d[i] += (ch ? -amp : amp) * 0.9;
    }
  }
  impulses.set(ctx, buf);
  return buf;
}

export interface Stage {
  /** Where to play an instrument: its seat, which feeds both the direct sound and the hall. */
  seat(inst: Instrument): AudioNode;
  /** The stage's output level (for fades). */
  out: GainNode;
}

/** A stage with a hall, playing into `dest`. Seats are made the first time an instrument plays. */
export function stage(ctx: Ctx, dest: AudioNode, hallLevel = 0.42): Stage {
  const out = ctx.createGain();
  out.connect(dest);
  const hall = ctx.createConvolver();
  hall.normalize = true;
  hall.buffer = impulse(ctx);
  const hallCut = ctx.createBiquadFilter();
  hallCut.type = 'highpass';
  hallCut.frequency.value = 240;
  const hallOut = ctx.createGain();
  hallOut.gain.value = hallLevel;
  hall.connect(hallCut);
  hallCut.connect(hallOut);
  hallOut.connect(out);
  const seats = new Map<Instrument, AudioNode>();
  return {
    out,
    seat(inst) {
      let node = seats.get(inst);
      if (!node) {
        const [pan, send, level] = SEATS[inst];
        const input = ctx.createGain();
        input.gain.value = level;
        const panner = ctx.createStereoPanner();
        panner.pan.value = pan;
        if (BOWED.has(inst)) {
          // the wooden body of the string instruments, once per section rather than once per note
          const body = ctx.createBiquadFilter();
          body.type = 'peaking';
          body.frequency.value = inst === 'pizz' ? 380 : 1200;
          body.Q.value = inst === 'pizz' ? 1.2 : 0.9;
          body.gain.value = inst === 'pizz' ? 4 : 2.5;
          input.connect(body);
          body.connect(panner);
        } else input.connect(panner);
        panner.connect(out);
        const s = ctx.createGain();
        s.gain.value = send;
        input.connect(s);
        s.connect(hall);
        seats.set(inst, input);
        node = input;
      }
      return node;
    },
  };
}
