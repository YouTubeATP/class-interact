import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { audio } from './engine';
import { saveSoundSettings } from './settings';

describe('the style the engine plays', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => audio.configure('participant'));

  it('plays HKUST when it is chosen on this device (it is not a band style, but it is a real choice)', () => {
    audio.configure('studio');
    saveSoundSettings('studio', { style: 'hkust' });
    expect(audio.style()).toBe('hkust');
    saveSoundSettings('studio', { style: 'chill' });
    expect(audio.style()).toBe('chill');
  });

  it('plays HKUST on the projector when the presenter picks it on the dashboard', () => {
    audio.configure('projector', { style: 'hkust' });
    expect(audio.style()).toBe('hkust');
  });

  it('still falls back to Bright for an unknown style', () => {
    audio.configure('studio', { style: 'polka' as never });
    expect(audio.style()).toBe('bright');
  });
});
