import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SOUND, saveSoundSettings, soundSettingsFor } from './settings';

describe('sound settings', () => {
  beforeEach(() => localStorage.clear());

  it('are quiet on phones by default and never play music there', () => {
    expect(soundSettingsFor('participant')).toEqual(DEFAULT_SOUND.participant);
    saveSoundSettings('participant', { musicEnabled: true });
    expect(soundSettingsFor('participant').musicEnabled).toBe(false);
  });

  it('persist and stay independent per device role', () => {
    saveSoundSettings('studio', { muted: true, master: 0.2 });
    expect(soundSettingsFor('studio')).toMatchObject({ muted: true, master: 0.2 });
    expect(soundSettingsFor('participant').muted).toBe(false);
    expect(soundSettingsFor('projector').muted).toBe(false);
  });

  it('carry an old sound-pack choice over to the matching style', () => {
    localStorage.setItem('ci:sound:studio', JSON.stringify({ pack: 'soft' }));
    expect(soundSettingsFor('studio').style).toBe('calm');
    localStorage.setItem('ci:sound:studio', JSON.stringify({ pack: 'arcade' }));
    expect(soundSettingsFor('studio').style).toBe('arcade');
    localStorage.setItem('ci:sound:studio', JSON.stringify({ style: 'nonsense' }));
    expect(soundSettingsFor('studio').style).toBe('bright');
  });
});
