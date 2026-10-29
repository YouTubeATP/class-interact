import { beforeEach, describe, expect, it } from 'vitest';
import { applyAppearance, readPref, scopeForPath, setPref } from './appearance';

describe('appearance preferences', () => {
  beforeEach(() => localStorage.clear());

  it('maps routes to the presenter, participant and projector scopes', () => {
    expect(scopeForPath('/studio')).toBe('studio');
    expect(scopeForPath('/session/abc')).toBe('studio');
    expect(scopeForPath('/remote/abc')).toBe('studio');
    expect(scopeForPath('/project/abc')).toBe('projector');
    expect(scopeForPath('/')).toBe('participant');
    expect(scopeForPath('/play/abc')).toBe('participant');
  });

  it('defaults to system and keeps presenter and participant choices apart', () => {
    expect(readPref('studio')).toBe('system');
    setPref('studio', 'dark');
    expect(readPref('studio')).toBe('dark');
    expect(readPref('participant')).toBe('system');
    setPref('studio', 'system');
    expect(localStorage.length).toBe(0);
  });

  it('applies the choice, and never lets the projector follow the computer', () => {
    setPref('participant', 'dark');
    applyAppearance('participant');
    expect(document.documentElement.dataset.theme).toBe('dark');
    setPref('projector' as never, 'dark');
    applyAppearance('projector');
    // the projector page chrome stays fixed; its stage look comes from the presenter's session setting
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
