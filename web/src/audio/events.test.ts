import { describe, expect, it } from 'vitest';
import type { Snapshot } from '@classinteract/shared';
import { musicFor, soundsFor } from './events';

/** A snapshot with just the fields the sound rules read. */
function snap(state: Record<string, unknown>, extra: Record<string, unknown> = {}): Snapshot {
  return {
    serverNow: 0,
    state: { version: 1, phase: 'lobby', correctVisible: false, resultsVisible: false, leaderboardVisible: false, deadlineAt: null, ...state },
    activity: null,
    run: null,
    counts: { participants: 3, respondents: 0, online: 3 },
    me: { submissions: [], standing: null },
    ...extra,
  } as unknown as Snapshot;
}
const quiz = { id: 'a1', type: 'quiz', interactive: true };

describe('which sounds a change calls for', () => {
  it('plays nothing on the first snapshot (late join or reconnect)', () => {
    expect(soundsFor(null, snap({ phase: 'open', version: 9 }, { activity: quiz }), 'projector')).toEqual([]);
  });

  it('ignores snapshots that are not newer, so nothing plays twice', () => {
    const a = snap({ phase: 'lobby', version: 4 });
    const b = snap({ phase: 'open', version: 4 }, { activity: quiz });
    expect(soundsFor(a, b, 'projector')).toEqual([]);
    expect(soundsFor(snap({ phase: 'lobby', version: 5 }), snap({ phase: 'open', version: 6 }, { activity: quiz }), 'projector')).toEqual(['sessionStart']);
  });

  it('marks session, activity, time up and break transitions', () => {
    const open = snap({ phase: 'open', version: 2, deadlineAt: 10_000 }, { activity: quiz });
    expect(soundsFor(open, snap({ phase: 'closed', version: 3 }, { activity: quiz, serverNow: 10_000 }), 'projector')).toEqual(['timeUp']);
    expect(soundsFor(open, snap({ phase: 'open', version: 3, breakScreen: { kind: 'break' } }, { activity: quiz }), 'projector')).toContain('breakStart');
    expect(soundsFor(open, snap({ phase: 'ended', version: 3 }), 'projector')).toEqual(['sessionEnd']);
  });

  it('tells a participant right or wrong only on reveal', () => {
    const mine = (correct: boolean, score: number) => ({ me: { submissions: [{ correct, score }], standing: null }, activity: quiz });
    const closed = snap({ phase: 'closed', version: 2 }, mine(true, 800));
    // closing responses never reveals correctness
    expect(soundsFor(snap({ phase: 'open', version: 1 }, mine(true, 800)), closed, 'participant')).not.toContain('correct');
    expect(soundsFor(closed, snap({ phase: 'revealed', version: 3, correctVisible: true }, mine(true, 800)), 'participant')).toEqual(['correct', 'points']);
    expect(soundsFor(closed, snap({ phase: 'revealed', version: 3, correctVisible: true }, mine(false, 0)), 'participant')).toEqual(['incorrect']);
    expect(soundsFor(closed, snap({ phase: 'revealed', version: 3, correctVisible: true }, mine(false, 300)), 'participant')).toEqual(['partial']);
    // the room only hears a neutral reveal
    expect(soundsFor(closed, snap({ phase: 'revealed', version: 3, correctVisible: true }, { activity: quiz }), 'projector')).toEqual(['reveal']);
  });

  it('chimes once when everyone has answered', () => {
    const before = snap({ phase: 'open', version: 2 }, { activity: quiz, counts: { participants: 3, respondents: 2, online: 3 } });
    const after = snap({ phase: 'open', version: 2 }, { activity: quiz, counts: { participants: 3, respondents: 3, online: 3 } });
    expect(soundsFor(before, after, 'presenter')).toEqual(['allAnswered']);
    expect(soundsFor(after, after, 'presenter')).toEqual([]);
    expect(soundsFor(before, after, 'participant')).toEqual([]);
  });
});

describe('background music', () => {
  it('follows what is on screen', () => {
    expect(musicFor(snap({ phase: 'lobby' }), 0)).toBe('lobby');
    expect(musicFor(snap({ phase: 'open', deadlineAt: 30_000 }, { activity: quiz }), 0)).toBe('quiz');
    expect(musicFor(snap({ phase: 'open', deadlineAt: 30_000 }, { activity: quiz }), 25_000)).toBe('countdown');
    expect(musicFor(snap({ phase: 'open', breakScreen: { kind: 'break' } }), 0)).toBe('break');
    expect(musicFor(snap({ phase: 'open' }, { activity: { id: 'p', type: 'poll' } }), 0)).toBeNull();
  });
});
