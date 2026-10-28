import { redactResults, type AudienceQuestion, type Counts, type PresenterSnapshot, type ProjectorSnapshot, type PublicActivity, type PulseSummary, type Results, type RunInfo, type SessionInfo, type SessionState, type Standing, type TeamStanding } from '@classinteract/shared';

/** Everything the projector renders. Built from a live snapshot, or synthesised for the editor preview. */
export interface StageModel {
  session: SessionInfo;
  state: SessionState;
  activity: PublicActivity | null;
  run?: RunInfo | null;
  counts: Counts;
  results: Results | null;
  leaderboard: Standing[] | null;
  teamBoard?: TeamStanding[] | null;
  recentNames: string[];
  /** Questions shown when Q&A is on screen; the highlighted one (if any). */
  questions?: AudienceQuestion[] | null;
  highlight?: AudienceQuestion | null;
  pulse?: PulseSummary | null;
  now: () => number;
  join: { url: string; host: string };
  /** The projector's look: the presenter's choice, else the presentation's own, else light. */
  appearance?: 'light' | 'dark';
}

/** Projector appearance: never the projector computer's OS setting. */
export function stageAppearance(session: SessionInfo): 'light' | 'dark' {
  const choice = session.features?.projector.appearance ?? 'theme';
  if (choice === 'light' || choice === 'dark') return choice;
  return session.theme.appearance ?? 'light';
}

export function fromProjector(s: ProjectorSnapshot, now: () => number, join: StageModel['join']): StageModel {
  return {
    session: s.session, state: s.state, activity: s.activity, run: s.run, counts: s.counts, results: s.results, leaderboard: s.leaderboard, teamBoard: s.teamBoard,
    recentNames: s.recentNames, questions: s.questions, highlight: s.highlight, pulse: s.pulse, now, join, appearance: stageAppearance(s.session),
  };
}

/**
 * The presenter dashboard shows an exact replica of what the audience sees: the same
 * visibility rules the server applies to the projector are re-applied to the presenter's data.
 */
export function projectorViewOfPresenter(s: PresenterSnapshot, now: () => number, join: StageModel['join']): StageModel {
  const ended = s.state.phase === 'ended';
  const showBoard = s.state.leaderboardVisible || ended;
  const qaShown = s.session.features.qa.enabled && s.state.overlay === 'qa';
  return {
    session: s.session,
    state: s.state,
    activity: s.activity,
    run: s.run,
    counts: s.counts,
    results: s.results && s.state.resultsVisible ? redactResults(s.results, { revealCorrect: s.state.correctVisible }) : null,
    leaderboard: showBoard && s.standings.length ? s.standings.slice(0, 10) : null,
    teamBoard: showBoard && s.session.features.teams.enabled && (s.state.leaderboardMode === 'team' || ended) && s.teamStandings.length ? s.teamStandings : null,
    recentNames: s.recentNames,
    questions: qaShown ? (s.questions ?? []).filter((q) => !q.answered).slice(0, 8) : null,
    highlight: s.highlight,
    pulse: s.session.features.pulse.enabled && s.state.overlay === 'pulse' ? s.pulse : null,
    now,
    join,
    appearance: stageAppearance(s.session),
  };
}
