import { describe, expect, it } from 'vitest';
import { availableActions, initialState, transition, type Action, type ActivityMeta, type SessionState } from '../src';

const interactive = (over: Partial<ActivityMeta> = {}): ActivityMeta => ({
  interactive: true, hasCorrectAnswer: false, liveResults: false, timeLimitSec: null, autoOpen: false, completed: false, answerRevealed: false, ...over,
});
const slide = (): ActivityMeta => ({ ...interactive(), interactive: false });
const quiz = (over: Partial<ActivityMeta> = {}) => interactive({ hasCorrectAnswer: true, ...over });

const NOW = 1_000_000;
function run(state: SessionState, acts: ActivityMeta[], ...actions: Action[]) {
  let s = state;
  for (const a of actions) {
    const r = transition(s, a, acts, NOW);
    if (!r.ok) throw new Error(`${a.type}: ${r.message}`);
    s = r.state;
  }
  return s;
}
const fails = (state: SessionState, acts: ActivityMeta[], a: Action) => {
  const r = transition(state, a, acts, NOW);
  return r.ok ? null : r.code;
};

describe('session state machine', () => {
  const acts = [slide(), quiz({ timeLimitSec: 20 }), interactive({ liveResults: true }), slide()];

  it('starts in the lobby and cannot start an empty presentation', () => {
    expect(initialState().phase).toBe('lobby');
    expect(fails(initialState(), [], { type: 'start' })).toBe('EMPTY_PRESENTATION');
  });

  it('walks the standalone flow: lobby → ready → open → closed → revealed → completed → ended', () => {
    let s = run(initialState(), acts, { type: 'start' });
    expect(s).toMatchObject({ phase: 'ready', activityIndex: 0 });
    s = run(s, acts, { type: 'next' });
    expect(s).toMatchObject({ phase: 'ready', activityIndex: 1 });
    s = run(s, acts, { type: 'open' });
    expect(s).toMatchObject({ phase: 'open', openedAt: NOW, deadlineAt: NOW + 20_000 });
    s = run(s, acts, { type: 'close' });
    expect(s.phase).toBe('closed');
    s = run(s, acts, { type: 'revealResults' });
    expect(s).toMatchObject({ phase: 'revealed', resultsVisible: true, correctVisible: false });
    s = run(s, acts, { type: 'complete' });
    expect(s.phase).toBe('completed');
    s = run(s, acts, { type: 'end' });
    expect(s.phase).toBe('ended');
  });

  it('bumps the version on every transition', () => {
    const a = run(initialState(), acts, { type: 'start' });
    const b = run(a, acts, { type: 'next' });
    expect(b.version).toBe(a.version + 1);
  });

  it('rejects everything after the session has ended', () => {
    const s = run(initialState(), acts, { type: 'start' }, { type: 'end' });
    for (const a of [{ type: 'next' }, { type: 'open' }, { type: 'standby' }, { type: 'goto', index: 1 }] as Action[]) {
      expect(fails(s, acts, a)).toBe('SESSION_ENDED');
    }
  });

  it('auto-opens activities that ask for it and applies live results', () => {
    const a = [interactive({ autoOpen: true, liveResults: true, timeLimitSec: 30 })];
    const s = run(initialState(), a, { type: 'start' });
    expect(s).toMatchObject({ phase: 'open', resultsVisible: true, deadlineAt: NOW + 30_000 });
  });

  it('only allows submission controls on interactive activities', () => {
    const s = run(initialState(), acts, { type: 'start' }); // content slide
    expect(fails(s, acts, { type: 'open' })).toBe('NOT_INTERACTIVE');
    expect(fails(s, acts, { type: 'revealResults' })).toBe('NOT_INTERACTIVE');
  });

  it('quiz: reveal answer closes responses, shows results and flags answerRevealed; reopening is blocked until hidden', () => {
    let s = run(initialState(), acts, { type: 'goto', index: 1 }, { type: 'open' });
    const r = transition(s, { type: 'revealCorrect' }, acts, NOW);
    expect(r.ok && r.state).toMatchObject({ phase: 'revealed', correctVisible: true, resultsVisible: true, openedAt: null });
    expect(r.ok && r.answerRevealed).toEqual({ index: 1, value: true });
    s = r.ok ? r.state : s;
    expect(fails(s, acts, { type: 'open' })).toBe('ANSWER_REVEALED');
    const h = transition(s, { type: 'hideCorrect' }, acts, NOW);
    expect(h.ok && h.answerRevealed).toEqual({ index: 1, value: false });
    s = h.ok ? h.state : s;
    expect(run(s, acts, { type: 'open' }).phase).toBe('open');
  });

  it('non-quiz activities have no correct answer to reveal', () => {
    const s = run(initialState(), acts, { type: 'goto', index: 2 }, { type: 'open' });
    expect(fails(s, acts, { type: 'revealCorrect' })).toBe('NO_CORRECT_ANSWER');
  });

  it('hiding results returns to closed unless the answer is still shown', () => {
    let s = run(initialState(), acts, { type: 'goto', index: 2 }, { type: 'open' }, { type: 'revealResults' });
    expect(s.phase).toBe('revealed');
    s = run(s, acts, { type: 'hideResults' });
    expect(s).toMatchObject({ phase: 'closed', resultsVisible: false });
  });

  it('leaderboard cannot be shown while responses are open', () => {
    const s = run(initialState(), acts, { type: 'goto', index: 1 }, { type: 'open' });
    expect(fails(s, acts, { type: 'showLeaderboard' })).toBe('INVALID_PHASE');
    const c = run(s, acts, { type: 'close' }, { type: 'showLeaderboard' });
    expect(c.leaderboardVisible).toBe(true);
    expect(run(c, acts, { type: 'next' }).leaderboardVisible).toBe(false);
  });

  it('marks an activity completed when the presenter moves on, but not if it never opened', () => {
    let s = run(initialState(), acts, { type: 'goto', index: 2 });
    let r = transition(s, { type: 'next' }, acts, NOW);
    expect(r.ok && r.completedIndex).toBeNull();
    s = run(s, acts, { type: 'open' });
    r = transition(s, { type: 'next' }, acts, NOW);
    expect(r.ok && r.completedIndex).toBe(2);
  });

  it('re-entering a completed activity shows its results without reopening', () => {
    const a = [quiz({ completed: true, answerRevealed: true }), slide()];
    const s = run(initialState(), a, { type: 'start' });
    expect(s).toMatchObject({ phase: 'completed', resultsVisible: true, correctVisible: true });
  });

  it('companion: goto any activity directly from the lobby, in any order', () => {
    const s = run(initialState(), acts, { type: 'goto', index: 2 });
    expect(s).toMatchObject({ activityIndex: 2, phase: 'ready' });
    expect(run(s, acts, { type: 'goto', index: 1 }).activityIndex).toBe(1);
    expect(fails(s, acts, { type: 'goto', index: 99 })).toBe('INVALID_INDEX');
  });

  it('companion: standby hides the activity, closes it, and relaunching shows retained results', () => {
    let s = run(initialState(), acts, { type: 'goto', index: 2 }, { type: 'open' });
    const r = transition(s, { type: 'standby' }, acts, NOW);
    expect(r.ok && r.state).toMatchObject({ phase: 'standby', activityIndex: 2, openedAt: null, resultsVisible: false });
    expect(r.ok && r.completedIndex).toBe(2);
    s = r.ok ? r.state : s;
    expect(fails(s, acts, { type: 'standby' })).toBe('INVALID_PHASE');
    // relaunch: the activity is now marked completed in the metadata, so its results come straight back
    const meta = acts.map((m, i) => (i === 2 ? { ...m, completed: true } : m));
    expect(run(s, meta, { type: 'goto', index: 2 })).toMatchObject({ phase: 'completed', resultsVisible: true });
    // and the standalone controls still work from standby
    expect(run(s, acts, { type: 'next' }).activityIndex).toBe(3);
  });

  it('does not restart the activity that is already on screen', () => {
    const s = run(initialState(), acts, { type: 'goto', index: 2 }, { type: 'open' });
    expect(fails(s, acts, { type: 'goto', index: 2 })).toBe('INVALID_PHASE');
  });

  it('previous from the first activity returns to the lobby; next at the end is refused', () => {
    expect(run(initialState(), acts, { type: 'start' }, { type: 'previous' }).phase).toBe('lobby');
    const last = run(initialState(), acts, { type: 'goto', index: 3 });
    expect(fails(last, acts, { type: 'next' })).toBe('AT_LAST');
  });

  it('lists available actions for the presenter UI', () => {
    const lobby = availableActions(initialState(), acts, NOW);
    expect(lobby).toContain('start');
    expect(lobby).not.toContain('open');
    const open = availableActions(run(initialState(), acts, { type: 'goto', index: 1 }, { type: 'open' }), acts, NOW);
    expect(open).toEqual(expect.arrayContaining(['close', 'revealCorrect', 'standby', 'end']));
    expect(open).not.toContain('open');
  });
});
