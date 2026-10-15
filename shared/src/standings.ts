export interface ScoreRow {
  participantId: string;
  name: string;
  score: number;
  correct: boolean | null;
  responseMs: number;
}

export interface Standing {
  participantId: string;
  name: string;
  score: number;
  correctCount: number;
  rank: number;
}

/**
 * Leaderboard: highest total score first; ties broken by lower cumulative response time.
 * Participants with identical score *and* time share a rank (competition ranking: 1, 2, 2, 4).
 */
export function computeStandings(rows: ScoreRow[]): Standing[] {
  const byPerson = new Map<string, { name: string; score: number; correctCount: number; ms: number }>();
  for (const r of rows) {
    const cur = byPerson.get(r.participantId) ?? { name: r.name, score: 0, correctCount: 0, ms: 0 };
    cur.score += r.score;
    if (r.correct) {
      cur.correctCount++;
      cur.ms += r.responseMs;
    }
    byPerson.set(r.participantId, cur);
  }
  const sorted = [...byPerson.entries()]
    .map(([participantId, v]) => ({ participantId, ...v }))
    .sort((a, b) => b.score - a.score || a.ms - b.ms || a.name.localeCompare(b.name));
  const out: Standing[] = [];
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1];
    const rank = prev && prev.score === p.score && prev.ms === p.ms ? out[i - 1].rank : i + 1;
    out.push({ participantId: p.participantId, name: p.name, score: p.score, correctCount: p.correctCount, rank });
  });
  return out;
}
