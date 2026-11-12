import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONFIRM_MS, HAPTICS, buzz, confirmTap, type ConfirmState } from './haptics';

const idle: ConfirmState = { armed: null, until: 0 };

describe('confirmTap', () => {
  it('fires at once when it is your turn', () => {
    expect(confirmTap(idle, 'next', true, 0)).toMatchObject({ fire: true, armed: false });
  });
  it('arms on the first tap and fires on the second', () => {
    const first = confirmTap(idle, 'next', false, 1000);
    expect(first).toMatchObject({ fire: false, armed: true, state: { armed: 'next' } });
    expect(confirmTap(first.state, 'next', false, 1000 + CONFIRM_MS - 1)).toMatchObject({ fire: true });
  });
  it('needs a fresh confirmation after the timeout or on the other button', () => {
    const first = confirmTap(idle, 'next', false, 0);
    expect(confirmTap(first.state, 'next', false, CONFIRM_MS + 1)).toMatchObject({ fire: false, armed: true });
    expect(confirmTap(first.state, 'previous', false, 10)).toMatchObject({ fire: false, state: { armed: 'previous' } });
  });
});

describe('buzz', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('plays the pattern when the device can vibrate and cues are on', () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal('navigator', { vibrate });
    expect(buzz('ready')).toBe(true);
    expect(vibrate).toHaveBeenCalledWith([...HAPTICS.ready]);
    expect(buzz('start', false)).toBe(false);
    expect(vibrate).toHaveBeenCalledTimes(1);
  });
  it('does nothing where vibration is not supported (iOS)', () => {
    vi.stubGlobal('navigator', {});
    expect(buzz('start')).toBe(false);
  });
  it('uses distinct rhythms', () => {
    const shapes = Object.values(HAPTICS).map((p) => p.join(','));
    expect(new Set(shapes).size).toBe(shapes.length);
  });
});
