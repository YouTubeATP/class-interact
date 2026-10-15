import { redactResults, type Counts, type PresenterSnapshot, type ProjectorSnapshot, type PublicActivity, type Results, type SessionInfo, type SessionState, type Standing } from '@classinteract/shared';

/** Everything the projector renders. Built from a live snapshot, or synthesised for the editor preview. */
export interface StageModel {
  session: SessionInfo;
  state: SessionState;
  activity: PublicActivity | null;
  counts: Counts;
  results: Results | null;
  leaderboard: Standing[] | null;
  recentNames: string[];
  now: () => number;
  join: { url: string; host: string };
}

export function fromProjector(s: ProjectorSnapshot, now: () => number, join: StageModel['join']): StageModel {
  return { session: s.session, state: s.state, activity: s.activity, counts: s.counts, results: s.results, leaderboard: s.leaderboard, recentNames: s.recentNames, now, join };
}

/**
 * The presenter dashboard shows an exact replica of what the audience sees: the same
 * visibility rules the server applies to the projector are re-applied to the presenter's data.
 */
export function projectorViewOfPresenter(s: PresenterSnapshot, now: () => number, join: StageModel['join']): StageModel {
  const ended = s.state.phase === 'ended';
  const showBoard = s.state.leaderboardVisible || ended;
  return {
    session: s.session,
    state: s.state,
    activity: s.activity,
    counts: s.counts,
    results: s.results && s.state.resultsVisible ? redactResults(s.results) : null,
    leaderboard: showBoard && s.standings.length ? s.standings.slice(0, 10) : null,
    recentNames: s.recentNames,
    now,
    join,
  };
}
