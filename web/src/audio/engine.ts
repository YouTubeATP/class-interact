/**
 * The one place ClassInteract makes sound. Every effect and every music loop is synthesised here with the Web Audio
 * API: nothing is downloaded, nothing is licensed from anyone, and the join page stays light.
 *
 * Components never play audio directly: they report what happened (`play('correct')`) or what screen is up
 * (`setMusic('quiz')`), and the engine applies the device's settings (off / subtle / playful, mute, volumes, pack),
 * stops duplicates, ducks the music under important effects and copes with browsers that block autoplay.
 */
import { soundSettingsFor, type AudioScope, type SoundSettings } from './settings';

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

type Wave = OscillatorType;
interface Pack { wave: Wave; accent: Wave; filter: number; detune: number; gain: number }
export const PACKS: Record<SoundSettings['pack'], Pack & { label: string }> = {
  classic: { label: 'Classic', wave: 'triangle', accent: 'sine', filter: 6000, detune: 0, gain: 1 },
  arcade: { label: 'Arcade', wave: 'square', accent: 'square', filter: 3800, detune: 4, gain: 0.55 },
  soft: { label: 'Soft', wave: 'sine', accent: 'sine', filter: 2200, detune: 0, gain: 0.85 },
};

/** A note: semitones from A4, start offset and length in seconds, relative level. */
type Note = [semi: number, at: number, len: number, level?: number];
const SOUNDS: Record<SoundId, { notes: Note[]; gain: number; accent?: boolean; noise?: number }> = {
  sessionStart: { notes: [[3, 0, 0.14], [7, 0.12, 0.14], [10, 0.24, 0.14], [15, 0.36, 0.42]], gain: 0.5, accent: true },
  activityStart: { notes: [[7, 0, 0.1], [12, 0.09, 0.22]], gain: 0.42 },
  transition: { notes: [[10, 0, 0.08, 0.7], [15, 0.06, 0.12, 0.5]], gain: 0.25 },
  standbyIn: { notes: [[12, 0, 0.18], [7, 0.14, 0.3]], gain: 0.3, accent: true },
  standbyOut: { notes: [[7, 0, 0.14], [12, 0.12, 0.26]], gain: 0.3, accent: true },
  sessionEnd: { notes: [[15, 0, 0.18], [10, 0.16, 0.18], [7, 0.32, 0.18], [3, 0.48, 0.6]], gain: 0.45, accent: true },
  select: { notes: [[19, 0, 0.05]], gain: 0.18, accent: true },
  submit: { notes: [[12, 0, 0.07], [19, 0.06, 0.12]], gain: 0.32, accent: true },
  reveal: { notes: [[0, 0, 0.12], [7, 0.1, 0.12], [12, 0.2, 0.3]], gain: 0.42 },
  correct: { notes: [[12, 0, 0.1], [16, 0.09, 0.1], [19, 0.18, 0.32]], gain: 0.45, accent: true },
  partial: { notes: [[12, 0, 0.12], [14, 0.12, 0.28]], gain: 0.38, accent: true },
  incorrect: { notes: [[3, 0, 0.16, 0.9], [-2, 0.15, 0.32, 0.8]], gain: 0.34 },
  tick: { notes: [[24, 0, 0.03]], gain: 0.12, accent: true },
  tickFinal: { notes: [[26, 0, 0.05]], gain: 0.22, accent: true },
  timeUp: { notes: [[7, 0, 0.12], [3, 0.11, 0.12], [-5, 0.22, 0.42]], gain: 0.42, noise: 0.08 },
  results: { notes: [[7, 0, 0.1], [11, 0.08, 0.1], [14, 0.16, 0.26]], gain: 0.32, accent: true },
  points: { notes: [[19, 0, 0.06], [24, 0.05, 0.06], [28, 0.1, 0.16]], gain: 0.3, accent: true },
  leaderboard: { notes: [[0, 0, 0.14], [4, 0.13, 0.14], [7, 0.26, 0.14], [12, 0.39, 0.5]], gain: 0.42 },
  rankUp: { notes: [[12, 0, 0.07], [17, 0.06, 0.16]], gain: 0.28, accent: true },
  podium: { notes: [[0, 0, 0.16], [4, 0.15, 0.16], [7, 0.3, 0.16], [12, 0.45, 0.16], [16, 0.6, 0.16], [19, 0.75, 0.7]], gain: 0.44, accent: true },
  poll: { notes: [[9, 0, 0.07], [14, 0.06, 0.14]], gain: 0.3, accent: true },
  word: { notes: [[14, 0, 0.06], [21, 0.05, 0.12]], gain: 0.28, accent: true },
  survey: { notes: [[7, 0, 0.1], [12, 0.09, 0.1], [16, 0.18, 0.24]], gain: 0.32, accent: true },
  question: { notes: [[16, 0, 0.08], [12, 0.07, 0.16]], gain: 0.26, accent: true },
  upvote: { notes: [[19, 0, 0.05], [24, 0.04, 0.08]], gain: 0.18, accent: true },
  breakStart: { notes: [[12, 0, 0.3], [7, 0.25, 0.5]], gain: 0.3, accent: true },
  breakEnd: { notes: [[7, 0, 0.2], [12, 0.18, 0.2], [16, 0.36, 0.4]], gain: 0.36, accent: true },
  joined: { notes: [[21, 0, 0.05, 0.8]], gain: 0.12, accent: true },
  allAnswered: { notes: [[12, 0, 0.08], [16, 0.07, 0.08], [19, 0.14, 0.2]], gain: 0.26, accent: true },
};

/** Music: a small step sequencer. Chords are semitones from A3; a bar is 8 eighth-note steps. */
interface Track { bpm: number; chords: number[][]; arp: (number | null)[]; bass: boolean; level: number; pad: boolean }
const TRACKS: Record<MusicId, Track> = {
  lobby: { bpm: 92, chords: [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]], arp: [0, null, 1, 2, null, 1, 2, null], bass: true, level: 0.16, pad: true },
  quiz: { bpm: 128, chords: [[0, 3, 7], [0, 3, 7], [-2, 2, 5], [-4, 0, 3]], arp: [0, 1, 2, 1, 0, 1, 2, 1], bass: true, level: 0.14, pad: false },
  countdown: { bpm: 150, chords: [[0, 3, 7], [1, 4, 8]], arp: [0, 2, 0, 2, 1, 2, 1, 2], bass: true, level: 0.15, pad: false },
  results: { bpm: 110, chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]], arp: [0, 1, 2, null, 2, 1, 0, null], bass: true, level: 0.15, pad: true },
  break: { bpm: 72, chords: [[0, 4, 7, 11], [5, 9, 12, 16], [-3, 0, 4, 7], [7, 11, 14, 17]], arp: [0, null, null, 2, null, null, 1, null], bass: false, level: 0.12, pad: true },
};

const freq = (semi: number, base = 440) => base * 2 ** (semi / 12);

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
  private music: { id: MusicId; stop: () => void } | null = null;
  private wantedMusic: MusicId | null = null;
  private listeners = new Set<() => void>();
  /** Recent sounds, for the settings preview and automated tests (`window.__ciAudio`). */
  readonly log: AudioLogEntry[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      const unlock = () => void this.unlock();
      window.addEventListener('pointerdown', unlock, { passive: true });
      window.addEventListener('keydown', unlock);
      (window as unknown as { __ciAudio: unknown }).__ciAudio = { log: this.log, state: () => this.state(), settings: () => this.settings() };
    }
  }

  /** Which device's settings apply (the page sets it), and server-side overrides for the projector. */
  configure(scope: AudioScope, override: Partial<SoundSettings> | null = null) {
    this.scope = scope;
    this.override = override;
    this.applyVolumes();
    if (this.settings().level === 'off' || this.settings().muted || this.settings().music === 0) this.stopMusic();
    else if (this.wantedMusic && !this.music) this.setMusic(this.wantedMusic);
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
    else if (this.wantedMusic && !this.music) this.setMusic(this.wantedMusic);
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
    const pack = PACKS[this.settings().pack] ?? PACKS.classic;
    const def = SOUNDS[id];
    const t0 = ctx.currentTime + 0.01;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = pack.filter;
    filter.connect(this.sfxBus);
    for (const [semi, at, len, level = 1] of def.notes) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = def.accent ? pack.accent : pack.wave;
      osc.frequency.value = freq(semi);
      osc.detune.value = pack.detune;
      const peak = def.gain * level * pack.gain;
      env.gain.setValueAtTime(0.0001, t0 + at);
      env.gain.exponentialRampToValueAtTime(peak, t0 + at + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len + 0.12);
      osc.connect(env);
      env.connect(filter);
      osc.start(t0 + at);
      osc.stop(t0 + at + len + 0.15);
    }
    if (def.noise) {
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.25), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const src = ctx.createBufferSource();
      const g = ctx.createGain();
      g.gain.value = def.noise;
      src.buffer = buf;
      src.connect(g);
      g.connect(filter);
      src.start(t0);
    }
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
    if (this.music?.id === id) return;
    const ctx = this.ensure();
    if (!ctx || ctx.state !== 'running' || !this.musicBus) {
      this.log.push({ id: id!, at: Date.now(), kind: 'music', blocked: true });
      return;
    }
    this.stopMusic();
    this.log.push({ id: id!, at: Date.now(), kind: 'music', blocked: false });
    this.music = { id: id!, stop: this.startTrack(ctx, TRACKS[id!]) };
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

  private startTrack(ctx: AudioContext, track: Track): () => void {
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, ctx.currentTime);
    out.gain.exponentialRampToValueAtTime(track.level, ctx.currentTime + 1.2); // fade in
    out.connect(this.musicBus!);
    const pack = PACKS[this.settings().pack] ?? PACKS.classic;
    const stepLen = 60 / track.bpm / 2;
    let step = 0;
    let next = ctx.currentTime + 0.1;
    const base = 220;
    const voice = (f: number, at: number, len: number, type: OscillatorType, level: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(level, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + len);
      o.connect(g);
      g.connect(out);
      o.start(at);
      o.stop(at + len + 0.05);
    };
    // look-ahead scheduler: a timer wakes every 100 ms and schedules the next 300 ms precisely on the audio clock
    const timer = setInterval(() => {
      while (next < ctx.currentTime + 0.3) {
        const chord = track.chords[Math.floor(step / 8) % track.chords.length];
        const a = track.arp[step % 8];
        if (a !== null) voice(freq(chord[a % chord.length] + 12, base), next, stepLen * 0.9, pack.accent, 0.5);
        if (track.bass && step % 4 === 0) voice(freq(chord[0] - 12, base), next, stepLen * 3.5, 'sine', 0.6);
        if (track.pad && step % 8 === 0) for (const n of chord) voice(freq(n, base), next, stepLen * 7.8, 'sine', 0.12);
        next += stepLen;
        step++;
      }
    }, 100);
    return () => {
      clearInterval(timer);
      const t = ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setTargetAtTime(0.0001, t, 0.25); // fade out
      setTimeout(() => out.disconnect(), 1500);
    };
  }
}

export const audio = new AudioEngine();
