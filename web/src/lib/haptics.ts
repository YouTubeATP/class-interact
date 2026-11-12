/**
 * Vibration cues for presenter phones. Each cue has its own rhythm so it can be told apart in a pocket or a hand,
 * without looking down: that is the point, the timing lives in the hand so the eyes can stay on the room.
 *
 * iOS Safari has no Vibration API. Callers check `canVibrate()` and show a visual cue instead. Never sound: the
 * audience would hear it.
 */
export const HAPTICS = {
  /** The slide before your turn is on: two short taps. */
  ready: [80, 120, 80],
  /** Your turn has started: one long buzz. */
  start: [400],
  /** You handed over: one tiny tick. */
  end: [40],
  /** "Are you sure?" on a button that is not yours to press. */
  confirm: [30, 60, 30],
} as const satisfies Record<string, readonly number[]>;

export type Haptic = keyof typeof HAPTICS;

export function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/** Buzz if this device can and the presenter has not turned cues off. Returns whether it buzzed. */
export function buzz(kind: Haptic, enabled = true): boolean {
  if (!enabled || !canVibrate()) return false;
  try {
    return navigator.vibrate([...HAPTICS[kind]]);
  } catch {
    return false;
  }
}

/**
 * Two-tap confirmation for slide buttons that are not yours. Not a dialog: the button itself turns into
 * "Confirm next?" for a few seconds. Pure, so the state machine is easy to test.
 */
export interface ConfirmState {
  armed: string | null;
  /** When the armed button falls back to normal. */
  until: number;
}

export const CONFIRM_MS = 3000;

export function confirmTap(state: ConfirmState, key: string, direct: boolean, now: number): { state: ConfirmState; fire: boolean; armed: boolean } {
  if (direct) return { state: { armed: null, until: 0 }, fire: true, armed: false };
  if (state.armed === key && now < state.until) return { state: { armed: null, until: 0 }, fire: true, armed: false };
  return { state: { armed: key, until: now + CONFIRM_MS }, fire: false, armed: true };
}
