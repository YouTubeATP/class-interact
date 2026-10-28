import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { Snapshot } from '@classinteract/shared';
import { audio } from './engine';
import { musicFor, soundsFor } from './events';
import { useSoundSettings, type AudioScope } from './settings';

/** Plays the sounds (and, on the projector, the music) that follow from the session's snapshots. */
export function useSessionAudio(snapshot: Snapshot | null, role: 'projector' | 'participant' | 'presenter', now: () => number, extra: { disabled?: boolean } = {}) {
  const scope: AudioScope = role === 'presenter' ? 'studio' : role;
  const settings = useSoundSettings(scope);
  const prev = useRef<Snapshot | null>(null);
  const projector = snapshot?.session.features.projector;

  // which device's settings are in force (and, for the projector, the presenter's choices from the dashboard)
  useEffect(() => {
    if (role === 'projector' && projector) audio.configure('projector', { level: projector.sound, musicEnabled: projector.music, master: projector.volume * settings.master, muted: settings.muted });
    else audio.configure(scope, extra.disabled ? { level: 'off' } : null);
  }, [role, scope, projector?.sound, projector?.music, projector?.volume, settings.master, settings.muted, extra.disabled, JSON.stringify(settings)]);

  useEffect(() => {
    if (!snapshot) return;
    const p = prev.current;
    prev.current = snapshot;
    for (const id of soundsFor(p, snapshot, role)) audio.play(id);
    if (role === 'projector') audio.setMusic(musicFor(snapshot, now()));
  }, [snapshot, role, now]);

  // final countdown: ticks in the last seconds of a timed activity (the projector and presenter screens only)
  const st = snapshot?.state;
  useEffect(() => {
    if (role === 'participant' || !st || st.phase !== 'open' || !st.deadlineAt) return;
    const deadline = st.deadlineAt;
    let last = -1;
    const id = setInterval(() => {
      const left = Math.ceil((deadline - now()) / 1000);
      if (left !== last && left >= 1 && left <= 5) audio.play(left <= 3 ? 'tickFinal' : 'tick');
      if (role === 'projector' && left <= 10 && left > 0) audio.setMusic('countdown');
      last = left;
    }, 200);
    return () => clearInterval(id);
  }, [role, st?.phase, st?.deadlineAt, now]);

  useEffect(() => () => { if (role === 'projector') audio.setMusic(null); }, [role]);
}

export function useAudioState() {
  return useSyncExternalStore((cb) => audio.subscribe(cb), () => audio.state(), () => 'off' as const);
}
