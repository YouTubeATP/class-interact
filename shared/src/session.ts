/**
 * Session state machine (pure, server-authoritative).
 *
 * Phases:
 *   lobby      – before anything has been shown; participants gather
 *   standby    – between activities (Companion Mode: presenter is in another app); the activity is hidden
 *   ready      – an activity is on screen, submissions not yet open
 *   open       – accepting submissions
 *   closed     – submissions closed, results not shown
 *   revealed   – results and/or correct answer shown
 *   completed  – activity finished (also what you see when re-visiting an activity that already ran)
 *   ended      – session over (terminal)
 *
 * Both Standalone navigation (next / previous) and Companion navigation (goto / standby)
 * are expressed with the same actions on the same state.
 */

export type Phase = 'lobby' | 'standby' | 'ready' | 'open' | 'closed' | 'revealed' | 'completed' | 'ended';

export interface SessionState {
  phase: Phase;
  /** Index of the current (or, in standby, most recent) activity; -1 before anything has run. */
  activityIndex: number;
  resultsVisible: boolean;
  correctVisible: boolean;
  leaderboardVisible: boolean;
  openedAt: number | null;
  deadlineAt: number | null;
  version: number;
}

export interface ActivityMeta {
  interactive: boolean;
  hasCorrectAnswer: boolean;
  liveResults: boolean;
  timeLimitSec: number | null;
  autoOpen: boolean;
  /** The activity has already run in this session (it was opened at least once and then left). */
  completed: boolean;
  /** The correct answer was revealed (its scores count towards the leaderboard). */
  answerRevealed: boolean;
}

export type Action =
  | { type: 'start' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'goto'; index: number }
  | { type: 'standby' }
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'complete' }
  | { type: 'revealResults' }
  | { type: 'hideResults' }
  | { type: 'revealCorrect' }
  | { type: 'hideCorrect' }
  | { type: 'showLeaderboard' }
  | { type: 'hideLeaderboard' }
  | { type: 'end' };

export type ActionType = Action['type'];
export const ACTION_TYPES: ActionType[] = [
  'start', 'next', 'previous', 'goto', 'standby', 'open', 'close', 'complete',
  'revealResults', 'hideResults', 'revealCorrect', 'hideCorrect', 'showLeaderboard', 'hideLeaderboard', 'end',
];

export type TransitionErrorCode =
  | 'SESSION_ENDED' | 'EMPTY_PRESENTATION' | 'INVALID_INDEX' | 'AT_LAST' | 'AT_FIRST' | 'NOT_INTERACTIVE'
  | 'NOT_STARTED' | 'INVALID_PHASE' | 'NO_CORRECT_ANSWER' | 'ANSWER_REVEALED' | 'ALREADY_OPEN';

export type TransitionResult =
  | {
      ok: true;
      state: SessionState;
      /** Activity that was left after being run → persist as completed. */
      completedIndex: number | null;
      /** Activity whose answer-revealed flag changed. */
      answerRevealed: { index: number; value: boolean } | null;
    }
  | { ok: false; code: TransitionErrorCode; message: string };

export const initialState = (): SessionState => ({
  phase: 'lobby',
  activityIndex: -1,
  resultsVisible: false,
  correctVisible: false,
  leaderboardVisible: false,
  openedAt: null,
  deadlineAt: null,
  version: 0,
});

/** True when an activity is on screen for the audience. */
export const showsActivity = (s: Pick<SessionState, 'phase' | 'activityIndex'>) =>
  s.activityIndex >= 0 && s.phase !== 'lobby' && s.phase !== 'standby' && s.phase !== 'ended';

const err = (code: TransitionErrorCode, message: string): TransitionResult => ({ ok: false, code, message });

/** Phase while results and/or the answer are shown or hidden, for a non-open activity. */
function settle(s: SessionState): SessionState {
  if (s.phase === 'closed' || s.phase === 'revealed') return { ...s, phase: s.resultsVisible || s.correctVisible ? 'revealed' : 'closed' };
  return s;
}

export function transition(state: SessionState, action: Action, activities: ActivityMeta[], now: number): TransitionResult {
  if (state.phase === 'ended') return err('SESSION_ENDED', 'This session has ended.');

  const idx = state.activityIndex;
  const meta = idx >= 0 ? activities[idx] : undefined;
  const bump = (s: SessionState): SessionState => ({ ...s, version: state.version + 1 });

  /** The activity currently shown counts as "run" if it was opened at least once. */
  const leftIndex = (): number | null => {
    if (idx < 0 || !meta?.interactive) return null;
    return ['open', 'closed', 'revealed', 'completed'].includes(state.phase) ? idx : null;
  };

  const done = (s: SessionState, extra: { completedIndex?: number | null; answerRevealed?: { index: number; value: boolean } | null } = {}): TransitionResult => ({
    ok: true,
    state: bump(s),
    completedIndex: extra.completedIndex ?? null,
    answerRevealed: extra.answerRevealed ?? null,
  });

  const openState = (s: SessionState, m: ActivityMeta): SessionState => ({
    ...s,
    phase: 'open',
    openedAt: now,
    deadlineAt: m.timeLimitSec ? now + m.timeLimitSec * 1000 : null,
    resultsVisible: m.liveResults,
    correctVisible: false,
    leaderboardVisible: false,
  });

  const enter = (index: number): TransitionResult => {
    const m = activities[index];
    let s: SessionState = {
      phase: 'ready',
      activityIndex: index,
      resultsVisible: false,
      correctVisible: false,
      leaderboardVisible: false,
      openedAt: null,
      deadlineAt: null,
      version: state.version,
    };
    if (m.interactive && m.completed) {
      s = { ...s, phase: 'completed', resultsVisible: true, correctVisible: m.answerRevealed };
    } else if (m.interactive && m.autoOpen) {
      s = openState(s, m);
    }
    return done(s, { completedIndex: leftIndex() });
  };

  const requireInteractive = (): TransitionResult | null => {
    if (!meta) return err('NOT_STARTED', 'No activity is on screen.');
    if (state.phase === 'standby' || state.phase === 'lobby') return err('NOT_STARTED', 'No activity is on screen. Launch one first.');
    if (!meta.interactive) return err('NOT_INTERACTIVE', 'This slide has no responses to collect.');
    return null;
  };

  switch (action.type) {
    case 'start':
      if (state.phase !== 'lobby') return err('INVALID_PHASE', 'The session has already started.');
      if (activities.length === 0) return err('EMPTY_PRESENTATION', 'This presentation has no slides yet.');
      return enter(0);

    case 'goto':
      if (action.index === idx && showsActivity(state)) return err('INVALID_PHASE', 'That slide is already on screen.');
      if (!Number.isInteger(action.index) || action.index < 0 || action.index >= activities.length) {
        return err(activities.length === 0 ? 'EMPTY_PRESENTATION' : 'INVALID_INDEX', activities.length === 0 ? 'This presentation has no slides yet.' : `There is no slide ${action.index + 1}.`);
      }
      return enter(action.index);

    case 'next': {
      if (activities.length === 0) return err('EMPTY_PRESENTATION', 'This presentation has no slides yet.');
      const target = idx + 1;
      if (target >= activities.length) return err('AT_LAST', 'This is the last slide. End the session when you are done.');
      return enter(target);
    }

    case 'previous': {
      if (state.phase === 'lobby') return err('AT_FIRST', 'Nothing comes before the lobby.');
      const target = idx - 1;
      if (target < 0) {
        if (state.phase === 'standby') return err('AT_FIRST', 'This is the first slide.');
        // back to the lobby
        return done({ ...initialState(), phase: 'lobby', version: state.version }, { completedIndex: leftIndex() });
      }
      return enter(target);
    }

    case 'standby':
      if (state.phase === 'lobby' || state.phase === 'standby') return err('INVALID_PHASE', 'Already on standby.');
      return done(
        { ...state, phase: 'standby', resultsVisible: false, correctVisible: false, leaderboardVisible: false, openedAt: null, deadlineAt: null },
        { completedIndex: leftIndex() },
      );

    case 'open': {
      const e = requireInteractive();
      if (e) return e;
      if (state.phase === 'open') return err('ALREADY_OPEN', 'Responses are already open.');
      if (state.correctVisible) return err('ANSWER_REVEALED', 'The answer is already revealed. Hide it before reopening responses.');
      return done(openState(state, meta!));
    }

    case 'close': {
      if (state.phase !== 'open') return err('INVALID_PHASE', 'Responses are not open.');
      return done(settle({ ...state, phase: 'closed', openedAt: null, deadlineAt: null }));
    }

    case 'complete': {
      const e = requireInteractive();
      if (e) return e;
      if (state.phase === 'ready') return err('INVALID_PHASE', 'Open responses before completing this activity.');
      return done({ ...state, phase: 'completed', openedAt: null, deadlineAt: null }, { completedIndex: idx });
    }

    case 'revealResults': {
      const e = requireInteractive();
      if (e) return e;
      if (state.phase === 'ready') return err('INVALID_PHASE', 'Open responses before revealing results.');
      const closed: SessionState = state.phase === 'open' ? { ...state, phase: 'closed', openedAt: null, deadlineAt: null } : state;
      return done(settle({ ...closed, resultsVisible: true }));
    }

    case 'hideResults': {
      const e = requireInteractive();
      if (e) return e;
      return done(settle({ ...state, resultsVisible: false }));
    }

    case 'revealCorrect': {
      const e = requireInteractive();
      if (e) return e;
      if (!meta!.hasCorrectAnswer) return err('NO_CORRECT_ANSWER', 'This activity has no correct answer.');
      if (state.phase === 'ready') return err('INVALID_PHASE', 'Open responses before revealing the answer.');
      const closed: SessionState = state.phase === 'open' ? { ...state, phase: 'closed', openedAt: null, deadlineAt: null } : state;
      return done(settle({ ...closed, correctVisible: true, resultsVisible: true }), { answerRevealed: { index: idx, value: true } });
    }

    case 'hideCorrect': {
      const e = requireInteractive();
      if (e) return e;
      if (!meta!.hasCorrectAnswer) return err('NO_CORRECT_ANSWER', 'This activity has no correct answer.');
      return done(settle({ ...state, correctVisible: false }), { answerRevealed: { index: idx, value: false } });
    }

    case 'showLeaderboard':
      if (state.phase === 'lobby') return err('INVALID_PHASE', 'There is nothing to rank yet.');
      if (state.phase === 'open') return err('INVALID_PHASE', 'Close responses before showing the leaderboard.');
      return done({ ...state, leaderboardVisible: true });

    case 'hideLeaderboard':
      return done({ ...state, leaderboardVisible: false });

    case 'end':
      return done({ ...state, phase: 'ended', openedAt: null, deadlineAt: null, leaderboardVisible: false }, { completedIndex: leftIndex() });
  }
}

/** Which actions would currently succeed (used to enable/disable presenter controls). `goto` is listed when any other slide exists. */
export function availableActions(state: SessionState, activities: ActivityMeta[], now = Date.now()): ActionType[] {
  return ACTION_TYPES.filter((type) => {
    const action: Action = type === 'goto' ? { type, index: activities.length > 1 && state.activityIndex === 0 ? 1 : 0 } : ({ type } as Action);
    return transition(state, action, activities, now).ok;
  });
}
