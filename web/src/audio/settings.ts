import { SOUND_STYLES, type SoundStyle } from '@classinteract/shared';
import { useSyncExternalStore } from 'react';
import { store } from '@/lib/storage';

/**
 * Sound settings, kept separately for each kind of device:
 *   studio       the presenter's own computer or phone (dashboard, remote)
 *   participant  a student's phone: quiet by default, never plays music
 *   projector    the room. The presenter sets level, music and volume from the dashboard (saved with the session);
 *                the projector computer can additionally mute itself. It never inherits the presenter's settings.
 */
export type AudioScope = 'studio' | 'participant' | 'projector';
export type SoundLevel = 'off' | 'subtle' | 'playful';

export interface SoundSettings {
  level: SoundLevel;
  muted: boolean;
  /** 0–1 */
  master: number;
  sfx: number;
  music: number;
  musicEnabled: boolean;
  /** Instruments and feel; see styles.ts. */
  style: SoundStyle;
  /** Play flourishes even when the OS asks for reduced motion (an explicit choice in Settings). */
  forcePlayful?: boolean;
}

export const DEFAULT_SOUND: Record<AudioScope, SoundSettings> = {
  studio: { level: 'subtle', muted: false, master: 0.9, sfx: 0.8, music: 0.7, musicEnabled: false, style: 'bright' },
  // phones: essential feedback only, quietly, and no music: the room's sound comes from the projector
  participant: { level: 'subtle', muted: false, master: 0.6, sfx: 0.8, music: 0, musicEnabled: false, style: 'bright' },
  projector: { level: 'subtle', muted: false, master: 1, sfx: 0.8, music: 0.7, musicEnabled: false, style: 'bright' },
};

const key = (scope: AudioScope) => `ci:sound:${scope}`;
const EVENT = 'ci:sound';

export function soundSettingsFor(scope: AudioScope): SoundSettings {
  const saved = store.get<Partial<SoundSettings> & { pack?: string }>(key(scope)) ?? {};
  const { pack, ...rest } = saved;
  const s: SoundSettings = { ...DEFAULT_SOUND[scope], ...rest };
  // settings saved before styles existed chose a "pack": keep the closest match
  if (!rest.style && pack) s.style = pack === 'arcade' ? 'arcade' : pack === 'soft' ? 'calm' : 'bright';
  if (!(SOUND_STYLES as readonly string[]).includes(s.style)) s.style = 'bright';
  if (scope === 'participant') s.musicEnabled = false;
  return s;
}

export function saveSoundSettings(scope: AudioScope, patch: Partial<SoundSettings>) {
  store.set(key(scope), { ...soundSettingsFor(scope), ...patch });
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

export function useSoundSettings(scope: AudioScope): SoundSettings {
  const raw = useSyncExternalStore(subscribe, () => JSON.stringify(soundSettingsFor(scope)), () => JSON.stringify(DEFAULT_SOUND[scope]));
  return JSON.parse(raw) as SoundSettings;
}
