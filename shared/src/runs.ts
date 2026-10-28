/**
 * Repeated activities. A slide can run several times in one session ("run again" after teaching, a before/after
 * check). Every run keeps its own responses, timing, reveal state and moderation. How a later run affects the
 * leaderboard is an explicit choice made when it starts, so nobody earns points twice by accident:
 *
 *   counted   the first run of every activity: points count as usual
 *   practice  points are shown to the person but never reach the leaderboard (the default for a repeat)
 *   replace   this attempt replaces the person's earlier points for the question (only if they answered it)
 *   add       points add to earlier runs (a deliberate "second chance to score")
 */
import { computeStandings, type ScoreRow, type Standing } from './standings';

export const RUN_SCORING = ['counted', 'practice', 'replace', 'add'] as const;
export type RunScoring = (typeof RUN_SCORING)[number];

export const RUN_SCORING_LABEL: Record<RunScoring, string> = {
  counted: 'Counts for the leaderboard',
  practice: 'Practice: no leaderboard points',
  replace: 'Replaces earlier points for this question',
  add: 'Adds to earlier points',
};

export interface RunRef {
  id: string;
  activityId: string;
  number: number;
  scoring: RunScoring;
  answerRevealed: boolean;
}

export interface RunSubmission {
  runId: string;
  participantId: string;
  score: number;
  correct: boolean | null;
  responseMs: number;
}

/**
 * The submissions that count towards standings, after applying each run's scoring rule. Runs are only counted once
 * their answer has been revealed (unless `includeUnrevealed`, used for the presenter's private totals).
 */
export function countedSubmissions<T extends RunSubmission>(runs: RunRef[], subs: T[], opts: { includeUnrevealed?: boolean } = {}): T[] {
  const byRun = new Map<string, T[]>();
  for (const s of subs) byRun.set(s.runId, [...(byRun.get(s.runId) ?? []), s]);
  const byActivity = new Map<string, RunRef[]>();
  for (const r of runs) byActivity.set(r.activityId, [...(byActivity.get(r.activityId) ?? []), r]);
  const out: T[] = [];
  for (const list of byActivity.values()) {
    const perPerson = new Map<string, T[]>();
    for (const run of [...list].sort((a, b) => a.number - b.number)) {
      if (!run.answerRevealed && !opts.includeUnrevealed) continue;
      if (run.scoring === 'practice') continue;
      for (const s of byRun.get(run.id) ?? []) {
        if (run.scoring === 'replace') perPerson.set(s.participantId, [s]);
        else perPerson.set(s.participantId, [...(perPerson.get(s.participantId) ?? []), s]);
      }
    }
    for (const rows of perPerson.values()) out.push(...rows);
  }
  return out;
}

export function standingsFromRuns(runs: RunRef[], subs: RunSubmission[], names: Map<string, string>, opts: { includeUnrevealed?: boolean } = {}): Standing[] {
  const rows: ScoreRow[] = countedSubmissions(runs, subs, opts).flatMap((s) => {
    const name = names.get(s.participantId);
    return name === undefined ? [] : [{ participantId: s.participantId, name, score: s.score, correct: s.correct, responseMs: s.responseMs }];
  });
  return computeStandings(rows);
}

// ---------------------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------------------

export interface TeamRef {
  id: string;
  name: string;
  color: string;
  memberIds: string[];
}

export interface TeamStanding {
  teamId: string;
  name: string;
  color: string;
  members: number;
  /** Sum of the members' points. */
  total: number;
  /** Average points per member: what teams are ranked by, so a bigger team has no built-in advantage. */
  score: number;
  rank: number;
}

export function computeTeamStandings(teams: TeamRef[], standings: Standing[]): TeamStanding[] {
  const points = new Map(standings.map((s) => [s.participantId, s.score]));
  const rows = teams.map((t) => {
    const total = t.memberIds.reduce((n, id) => n + (points.get(id) ?? 0), 0);
    return { teamId: t.id, name: t.name, color: t.color, members: t.memberIds.length, total, score: t.memberIds.length ? Math.round(total / t.memberIds.length) : 0 };
  });
  rows.sort((a, b) => b.score - a.score || b.total - a.total || a.name.localeCompare(b.name));
  const out: TeamStanding[] = [];
  rows.forEach((r, i) => {
    const prev = out[i - 1];
    out.push({ ...r, rank: prev && prev.score === r.score && prev.total === r.total ? prev.rank : i + 1 });
  });
  return out;
}

export const TEAM_PRESETS = [
  { name: 'Red Foxes', color: '#d93a55' },
  { name: 'Blue Whales', color: '#2c6fe0' },
  { name: 'Gold Bees', color: '#b07800' },
  { name: 'Green Frogs', color: '#17935d' },
  { name: 'Violet Owls', color: '#6b4ff0' },
  { name: 'Orange Tigers', color: '#d4520b' },
  { name: 'Teal Turtles', color: '#0f7f87' },
  { name: 'Pink Flamingos', color: '#c2255c' },
] as const;

/** The team a newcomer joins in automatic mode: the smallest, ties broken by team order. */
export function smallestTeam(teams: TeamRef[]): TeamRef | null {
  if (!teams.length) return null;
  return [...teams].sort((a, b) => a.memberIds.length - b.memberIds.length || teams.indexOf(a) - teams.indexOf(b))[0];
}
