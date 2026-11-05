/**
 * The one place ClassInteract makes sound. Every effect and every music loop is synthesised here with the Web Audio
 * API: nothing is downloaded, nothing is licensed from anyone, and the join page stays light.
 *
 * Components never play audio directly: they report what happened (`play('correct')`) or what screen is up
 * (`setMusic('quiz')`), and the engine applies the device's settings (off / subtle / playful, mute, volumes, style),
 * stops duplicates, ducks the music under important effects and copes with browsers that block autoplay.
 *
 * What is played lives elsewhere: the compositions (compositions.ts), how each style arranges and voices them
 * (styles.ts, instruments.ts) and the sound-effect phrases (sfx.ts).
 */
import type { SoundStyle } from '@classinteract/shared';
import { soundSettingsFor, type AudioScope, type SoundSettings } from './settings';
import { SFX } from './sfx';
import { arrangement, STYLES, type MusicEvent, type Style } from './styles';

export type SoundId =
  | 'sessionStart' | 'activityStart' | 'transition' | 'standbyIn' | 'standbyOut' | 'sessionEnd'
  | 'select' | 'submit' | 'reveal' | 'correct' | 'incorrect' | 'partial' | 'tick' | 'tickFinal' | 'timeUp'
  | 'results' | 'points' | 'leaderboard' | 'rankUp' | 'podium'
  | 'poll' | 'word' | 'survey' | 'question' | 'upvote' | 'breakStart' | 'breakEnd' | 'joined' | 'allAnswered';

export type MusicId = 'lobby' | 'quiz' | 'countdown' | 'results' | 'break';

/** essential: plays at "subtle" and "playful"; flourish: "playful" only. */
const IMPORTANCE: Record<SoundId, 'essential' | 'flourish'> = {
  sessionStart: 'essential', activityStart: 'flourish', transition: 'flourish', standbyIn: 'flourish', standbyOut: 'flourish', sessionEnd: 'essential',
  select: 'flourish', submit: 'essential', reveal: 'essential', correct: 'essential', incorrect: 'essential', partial: 'essential', tick: 'flourish', tickFinal: 'essential', timeUp: 'essential',
  results: 'flourish', points: 'flourish', leaderboard: 'essential', rankUp: 'flourish', podium: 'flourish',
  poll: 'essential', word: 'essential', survey: 'essential', question: 'essential', upvote: 'flourish', breakStart: 'essential', breakEnd: 'essential', joined: 'flourish', allAnswered: 'essential',
};

/** Important effects briefly lower the music so they are heard. */
const DUCKS: Partial<Record<SoundId, boolean>> = { reveal: true, correct: true, incorrect: true, timeUp: true, leaderboard: true, podium: true, sessionStart: true, sessionEnd: true };

export interface AudioLogEntry { id: string; at: number; kind: 'sfx' | 'music'; blocked: boolean }

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private duck: GainNode | null = null;
  private scope: AudioScope = 'participant';
  private override: Partial<SoundSettings> | null = null;
  private lastPlayed = new Map<SoundId, number>();
  private music: { id: MusicId; style: SoundStyle; stop: () => void } | null = null;
  private wantedMusic: MusicId | null = null;
  private listeners = new Set<() => void>();
  /** Recent sounds, for the settings preview and automated tests (`window.__ciAudio`). */
  readonly log: AudioLogEntry[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      const unlock = () => void this.unlock();
      window.addEventListener('pointerdown', unlock, { passive: true });
      window.addEventListener('keydown', unlock);
      (window as unknown as { __ciAudio: unknown }).__ciAudio = {
        log: this.log, state: () => this.state(), settings: () => this.settings(), music: () => this.currentMusic(),
        /** Offline render with simple measurements (and optionally a 16-bit WAV as base64), for tests and examples. */
        render: async (what: { music: MusicId } | { sfx: SoundId }, style: SoundStyle, seconds: number, wav = false) => {
          const d = await renderOffline(what, style, seconds);
          let peak = 0;
          let sum = 0;
          for (const v of d) { peak = Math.max(peak, Math.abs(v)); sum += v * v; }
          return { peak, rms: Math.sqrt(sum / d.length), finite: d.every(Number.isFinite), wav: wav ? toWavBase64(d, 44100) : undefined };
        },
      };
    }
  }

  /** Which device's settings apply (the page sets it), and server-side overrides for the projector. */
  configure(scope: AudioScope, override: Partial<SoundSettings> | null = null) {
    this.scope = scope;
    this.override = override;
    this.applyVolumes();
    if (this.settings().level === 'off' || this.settings().muted || this.settings().music === 0) this.stopMusic();
    else if (this.wantedMusic && (!this.music || this.music.style !== this.style())) this.setMusic(this.wantedMusic);
    this.emit();
  }

  settings(): SoundSettings {
    return { ...soundSettingsFor(this.scope), ...(this.override ?? {}) };
  }

  /** 'running' | 'blocked' (the browser is waiting for a click) | 'unavailable' | 'off'. */
  state(): 'running' | 'blocked' | 'unavailable' | 'off' {
    const s = this.settings();
    if (s.level === 'off' || s.muted) return 'off';
    if (typeof window === 'undefined' || !(window.AudioContext || (window as any).webkitAudioContext)) return 'unavailable';
    if (!this.ctx || this.ctx.state !== 'running') return 'blocked';
    return 'running';
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    for (const fn of this.listeners) fn();
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = typeof window !== 'undefined' ? window.AudioContext || (window as any).webkitAudioContext : null;
    if (!Ctor) return null;
    try {
      this.ctx = new Ctor({ latencyHint: 'interactive' });
    } catch {
      return null;
    }
    const ctx = this.ctx!;
    this.master = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.duck = ctx.createGain();
    const comp = ctx.createDynamicsCompressor(); // keeps everything at a calm, even loudness
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.duck);
    this.duck.connect(this.master);
    this.master.connect(comp);
    comp.connect(ctx.destination);
    ctx.onstatechange = () => this.emit();
    this.applyVolumes();
    return ctx;
  }

  /** Browsers only start audio after a click or key press: called on every user gesture, cheap after the first. */
  async unlock(): Promise<boolean> {
    if (this.settings().level === 'off') return false;
    const ctx = this.ensure();
    if (!ctx) return false;
    if (ctx.state !== 'running') {
      try { await ctx.resume(); } catch { /* still blocked */ }
    }
    if (ctx.state === 'running' && this.wantedMusic && !this.music) this.setMusic(this.wantedMusic);
    this.emit();
    return ctx.state === 'running';
  }

  private applyVolumes() {
    if (!this.ctx || !this.master || !this.sfxBus || !this.musicBus) return;
    const s = this.settings();
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted || s.level === 'off' ? 0 : s.master, t, 0.03);
    this.sfxBus.gain.setTargetAtTime(s.sfx, t, 0.03);
    this.musicBus.gain.setTargetAtTime(s.music, t, 0.08);
  }

  refresh() {
    this.applyVolumes();
    const s = this.settings();
    if (s.level === 'off' || s.muted || s.music === 0 || !s.musicEnabled) this.stopMusic();
    else if (this.wantedMusic && (!this.music || this.music.style !== this.style())) this.setMusic(this.wantedMusic);
    this.emit();
  }

  /** Whether a sound would play with the current settings. */
  allows(id: SoundId): boolean {
    const s = this.settings();
    if (s.muted || s.level === 'off') return false;
    if (IMPORTANCE[id] === 'flourish' && s.level !== 'playful') return false;
    const calmer = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (calmer && IMPORTANCE[id] === 'flourish' && !s.forcePlayful) return false;
    return true;
  }

  play(id: SoundId, opts: { force?: boolean } = {}) {
    if (!opts.force && !this.allows(id)) return;
    const now = performance.now();
    // the same sound within a short window is one event (rapid changes, duplicated snapshots)
    const gap = id === 'tick' || id === 'tickFinal' ? 400 : id === 'joined' || id === 'upvote' ? 600 : 250;
    if (now - (this.lastPlayed.get(id) ?? -Infinity) < gap) return;
    this.lastPlayed.set(id, now);
    const ctx = this.ensure();
    const blocked = !ctx || ctx.state !== 'running';
    this.log.push({ id, at: Date.now(), kind: 'sfx', blocked });
    if (this.log.length > 200) this.log.splice(0, this.log.length - 200);
    if (blocked || !ctx || !this.sfxBus) return;
    playSfx(ctx, this.sfxBus, ctx.currentTime + 0.01, id, this.style());
    const t0 = ctx.currentTime + 0.01;
    if (DUCKS[id] && this.duck) {
      const d = this.duck.gain;
      d.cancelScheduledValues(t0);
      d.setTargetAtTime(0.35, t0, 0.03);
      d.setTargetAtTime(1, t0 + 0.6, 0.25);
    }
  }

  /** Background music for the current screen (null = silence). Crossfades; never restarts the same track. */
  setMusic(id: MusicId | null) {
    this.wantedMusic = id;
    const s = this.settings();
    const allowed = !!id && s.level === 'playful' && !s.muted && s.music > 0 && s.musicEnabled;
    if (!allowed) return this.stopMusic();
    if (this.music?.id === id && this.music.style === this.style()) return;
    const ctx = this.ensure();
    if (!ctx || ctx.state !== 'running' || !this.musicBus) {
      this.log.push({ id: id!, at: Date.now(), kind: 'music', blocked: true });
      return;
    }
    this.stopMusic();
    this.log.push({ id: id!, at: Date.now(), kind: 'music', blocked: false });
    this.music = { id: id!, style: this.style(), stop: this.startTrack(ctx, id!, this.style()) };
    this.emit();
  }

  private stopMusic() {
    if (this.music) {
      this.music.stop();
      this.music = null;
      this.emit();
    }
  }

  currentMusic(): MusicId | null {
    return this.music?.id ?? null;
  }

  /** The style in force on this device (or, on the projector, the presenter's choice). */
  style(): SoundStyle {
    const st = this.settings().style;
    return st in STYLES ? st : 'bright';
  }

  /** Plays a few bars of a piece in a style, for the settings page. Stops any preview already playing. */
  async previewMusic(id: MusicId, style: SoundStyle, seconds = 12): Promise<void> {
    this.preview?.();
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    if (ctx.state !== 'running') await ctx.resume().catch(() => undefined);
    if (ctx.state !== 'running') return;
    const stop = this.startTrack(ctx, id, style, this.master);
    const timer = setTimeout(() => this.preview?.(), seconds * 1000);
    this.preview = () => { clearTimeout(timer); stop(); this.preview = null; this.emit(); };
    this.emit();
  }
  stopPreview() { this.preview?.(); }
  previewing() { return !!this.preview; }
  private preview: (() => void) | null = null;

  private startTrack(ctx: AudioContext, id: MusicId, style: SoundStyle, dest: AudioNode = this.musicBus!): () => void {
    const out = musicChain(ctx, dest, style);
    out.gain.setValueAtTime(0.0001, ctx.currentTime);
    out.gain.exponentialRampToValueAtTime(MUSIC_LEVEL * STYLES[style].level, ctx.currentTime + 1.2); // fade in
    const { events, beats, bpm } = arrangement(id, style);
    const spb = 60 / bpm;
    const start = ctx.currentTime + 0.1;
    let cursor = 0; // in beats from `start`
    // look-ahead scheduler: a timer wakes every 100 ms and schedules the next 400 ms precisely on the audio clock
    const tick = () => {
      const until = (ctx.currentTime + 0.4 - start) / spb;
      if (until <= cursor) return;
      scheduleEvents(ctx, out, events, beats, cursor, until, start, spb, STYLES[style]);
      cursor = until;
    };
    tick();
    const timer = setInterval(tick, 100);
    return () => {
      clearInterval(timer);
      const t = ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(Math.max(out.gain.value, 0.0001), t);
      out.gain.setTargetAtTime(0.0001, t, 0.25); // fade out
      setTimeout(() => out.disconnect(), 1500);
    };
  }
}

const MUSIC_LEVEL = 0.32;

function toWavBase64(samples: Float32Array, rate: number): string {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** The music's own gain and tone (a gentle low-pass that sets how warm the style sounds). */
function musicChain(ctx: BaseAudioContext, dest: AudioNode, style: SoundStyle): GainNode {
  const out = ctx.createGain();
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = STYLES[style].tone;
  tone.Q.value = 0.5;
  out.connect(tone);
  tone.connect(dest);
  return out;
}

/** Schedules the events of a looping arrangement that fall in [fromBeat, toBeat) (beats counted from `start`). */
function scheduleEvents(ctx: BaseAudioContext, out: AudioNode, events: MusicEvent[], loop: number, fromBeat: number, toBeat: number, start: number, spb: number, style: Style) {
  for (let base = Math.floor(fromBeat / loop) * loop; base < toBeat; base += loop) {
    for (const e of events) {
      const at = base + e.beat;
      if (at < fromBeat || at >= toBeat) continue;
      const t = start + at * spb;
      const vel = e.vel * style.mix[e.part];
      if (e.part === 'drum') style.kit[e.drum!](ctx, out, t, vel);
      else style.voices[e.part](ctx, out, t, e.midi, e.beats * spb, vel);
    }
  }
}

/** Plays one sound effect into `dest` at `t0` with the style's instruments. */
function playSfx(ctx: BaseAudioContext, dest: AudioNode, t0: number, id: SoundId, styleId: SoundStyle) {
  const style = STYLES[styleId];
  const def = SFX[id];
  const g = def.gain * style.sfx.gain;
  for (const [midi, at, len, level = 1] of def.notes ?? []) style.sfx.lead(ctx, dest, t0 + at, midi, len, g * level);
  for (const [notes, at, len, level = 1] of def.chords ?? []) for (const n of notes) style.sfx.chord(ctx, dest, t0 + at, n, len, (g * level) / Math.sqrt(notes.length));
  for (const [drum, at, vel] of def.perc ?? []) style.kit[drum](ctx, dest, t0 + at, vel * g * 1.6);
}

/**
 * Renders a piece of music or a sound effect without playing it (an OfflineAudioContext), for automated checks and
 * for exporting examples. Returns mono samples at 44.1 kHz.
 */
export async function renderOffline(what: { music: MusicId } | { sfx: SoundId }, style: SoundStyle, seconds: number): Promise<Float32Array> {
  const rate = 44100;
  const ctx = new OfflineAudioContext(1, Math.ceil(rate * seconds), rate);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  comp.connect(ctx.destination);
  if ('music' in what) {
    const out = musicChain(ctx, comp, style);
    out.gain.value = MUSIC_LEVEL * STYLES[style].level;
    const { events, beats, bpm } = arrangement(what.music, style);
    const spb = 60 / bpm;
    scheduleEvents(ctx, out, events, beats, 0, seconds / spb, 0.05, spb, STYLES[style]);
  } else playSfx(ctx, comp, 0.02, what.sfx, style);
  const buf = await ctx.startRendering();
  return buf.getChannelData(0);
}

export const audio = new AudioEngine();
