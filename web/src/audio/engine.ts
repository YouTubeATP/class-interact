/**
 * The one place ClassInteract makes sound. Every effect and every music loop is synthesised here with the Web Audio
 * API: nothing is downloaded, nothing is licensed from anyone, and the join page stays light.
 *
 * Components never play audio directly: they report what happened (`play('correct')`) or what screen is up
 * (`setMusic('quiz')`), and the engine applies the device's settings (off / subtle / playful, mute, volumes, style),
 * stops duplicates, ducks the music under important effects and copes with browsers that block autoplay.
 *
 * What is played lives elsewhere: the five band styles' compositions (compositions.ts), how each arranges and voices
 * them (styles.ts, instruments.ts) and their sound-effect phrases (sfx.ts); and the HKUST set, which is entirely its
 * own (hkust/: orchestral pieces, orchestrator, instruments, concert hall and effects).
 */
import type { SoundStyle } from '@classinteract/shared';
import { DEFAULT_SOUND, soundSettingsFor, type AudioScope, type SoundSettings } from './settings';
import { masterChain } from './mastering';
import { SFX } from './sfx';
import { arrangement, isBand, STYLES, type MusicEvent, type Style } from './styles';
import { hkustStage, hkustTrack, HKUST_SET, playCue, playOrch } from './hkust';

export type SoundId =
  | 'sessionStart' | 'activityStart' | 'transition' | 'standbyIn' | 'standbyOut' | 'sessionEnd'
  | 'select' | 'submit' | 'reveal' | 'correct' | 'incorrect' | 'partial' | 'tick' | 'tickFinal' | 'timeUp'
  | 'results' | 'points' | 'leaderboard' | 'rankUp' | 'podium'
  | 'poll' | 'word' | 'survey' | 'question' | 'upvote' | 'breakStart' | 'breakEnd' | 'joined' | 'allAnswered';

export type MusicId = 'lobby' | 'quiz' | 'countdown' | 'results' | 'break' | 'ended';

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
  private mix: AudioNode | null = null;
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
        /** Length of one full pass of a piece, in seconds. */
        duration: (id: MusicId, style: SoundStyle) => { const a = trackLength(id, style); return (a.beats * 60) / a.bpm; },
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
    // effects and music meet in the mastering chain (shaped for classroom AV systems); the volume comes after it,
    // so the sound has the same character at any volume
    this.mix = masterChain(ctx, this.master);
    this.sfxBus.connect(this.mix);
    this.musicBus.connect(this.duck);
    this.duck.connect(this.mix);
    this.master.connect(ctx.destination);
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
    if (!ctx || !this.mix) return;
    if (ctx.state !== 'running') await ctx.resume().catch(() => undefined);
    if (ctx.state !== 'running') return;
    const stop = this.startTrack(ctx, id, style, this.mix);
    const timer = setTimeout(() => this.preview?.(), seconds * 1000);
    this.preview = () => { clearTimeout(timer); stop(); this.preview = null; this.emit(); };
    this.emit();
  }
  stopPreview() { this.preview?.(); }
  previewing() { return !!this.preview; }
  private preview: (() => void) | null = null;

  private startTrack(ctx: AudioContext, id: MusicId, style: SoundStyle, dest: AudioNode = this.musicBus!): () => void {
    const track = openTrack(ctx, dest, id, style);
    const out = track.out;
    out.gain.setValueAtTime(0.0001, ctx.currentTime);
    out.gain.exponentialRampToValueAtTime(MUSIC_LEVEL * levelOf(style), ctx.currentTime + 1.2); // fade in
    const spb = 60 / track.bpm;
    const start = ctx.currentTime + 0.1;
    let cursor = 0; // in beats from `start`
    // look-ahead scheduler: a timer wakes every 100 ms and schedules the next 400 ms precisely on the audio clock
    const tick = () => {
      const until = (ctx.currentTime + 0.4 - start) / spb;
      if (until <= cursor) return;
      track.schedule(cursor, until, start);
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

/** Music level into the mastering chain: about −16 LUFS at default settings, so effects stand clear above it. */
const MUSIC_LEVEL = 0.17;

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

const levelOf = (style: SoundStyle) => (isBand(style) ? STYLES[style].level : HKUST_SET.level);

function trackLength(id: MusicId, style: SoundStyle): { beats: number; bpm: number } {
  return isBand(style) ? arrangement(id, style) : hkustTrack(id);
}

interface OpenTrack {
  /** The track's output level (for fades). */
  out: GainNode;
  bpm: number;
  /** Schedules what falls in [fromBeat, toBeat), beats counted from `start`, looping the piece. */
  schedule(fromBeat: number, toBeat: number, start: number): void;
}

/** Sets up a piece to play into `dest`: the band styles through their arrangement, HKUST on its stage in its hall. */
function openTrack(ctx: BaseAudioContext, dest: AudioNode, id: MusicId, style: SoundStyle): OpenTrack {
  if (isBand(style)) {
    const { events, beats, bpm } = arrangement(id, style);
    const out = musicChain(ctx, dest, STYLES[style]);
    const spb = 60 / bpm;
    return { out, bpm, schedule: (from, to, start) => loop(events, beats, from, to, (e, at) => playBand(ctx, out, e, start + at * spb, spb, STYLES[style])) };
  }
  const { events, beats, bpm } = hkustTrack(id);
  const s = hkustStage(ctx, dest, id);
  const spb = 60 / bpm;
  return { out: s.out, bpm, schedule: (from, to, start) => loop(events, beats, from, to, (e, at) => playOrch(ctx, s, e, start + at * spb, spb)) };
}

/** Calls `play` for each event of a looping piece (`loop` beats long) that falls in [fromBeat, toBeat). */
function loop<E extends { beat: number }>(events: E[], length: number, fromBeat: number, toBeat: number, play: (e: E, at: number) => void) {
  for (let base = Math.floor(fromBeat / length) * length; base < toBeat; base += length) {
    for (const e of events) {
      const at = base + e.beat;
      if (at >= fromBeat && at < toBeat) play(e, at);
    }
  }
}

/** A band style's gain and tone (a gentle low-pass that sets how warm the style sounds). */
function musicChain(ctx: BaseAudioContext, dest: AudioNode, style: Style): GainNode {
  const out = ctx.createGain();
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = style.tone;
  tone.Q.value = 0.5;
  out.connect(tone);
  tone.connect(dest);
  return out;
}

function playBand(ctx: BaseAudioContext, out: AudioNode, e: MusicEvent, t: number, spb: number, style: Style) {
  const vel = e.vel * style.mix[e.part];
  if (e.part === 'drum') style.kit[e.drum!](ctx, out, t, vel);
  else style.voices[e.part](ctx, out, t, e.midi, e.beats * spb, vel);
}

/** Plays one sound effect into `dest` at `t0`: a band style's phrase on its instruments, or an HKUST cue. */
function playSfx(ctx: BaseAudioContext, dest: AudioNode, t0: number, id: SoundId, styleId: SoundStyle) {
  if (!isBand(styleId)) return playCue(ctx, dest, t0, id);
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
  // the projector's signal path at its default settings and full volume: bus levels, then the mastering chain
  const defaults = DEFAULT_SOUND.projector;
  const mix = masterChain(ctx, ctx.destination);
  const bus = ctx.createGain();
  bus.gain.value = 'music' in what ? defaults.music : defaults.sfx;
  bus.connect(mix);
  if ('music' in what) {
    const track = openTrack(ctx, bus, what.music, style);
    track.out.gain.value = MUSIC_LEVEL * levelOf(style);
    // schedule a second at a time, a little ahead, as live playback does: creating every note of a long piece up
    // front would leave thousands of waiting nodes in the graph and make long renders far slower than real time
    const spb = 60 / track.bpm;
    let cursor = 0;
    const ahead = (sec: number) => {
      const until = Math.min(seconds, sec + 1.5) / spb;
      if (until > cursor) track.schedule(cursor, until, 0.05);
      cursor = until;
    };
    ahead(0);
    for (let sec = 1; sec < seconds - 0.5; sec += 1) {
      const at = (Math.round((sec * rate) / 128) * 128) / rate;
      void ctx.suspend(at).then(() => { ahead(at); void ctx.resume(); });
    }
  } else playSfx(ctx, bus, 0.02, what.sfx, style);
  const buf = await ctx.startRendering();
  return buf.getChannelData(0);
}

export const audio = new AudioEngine();
