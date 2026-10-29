import type { Snapshot, ParticipantSnapshot } from '@classinteract/shared';
import type { MusicId, SoundId } from './engine';

/**
 * Which sounds a new snapshot calls for, given the previous one. Pure, so it is unit tested.
 *
 *   - The first snapshot after connecting (or reconnecting) plays nothing: a late joiner never hears history.
 *   - A snapshot that is not newer (same or lower state version) changes nothing.
 *   - Correct / incorrect only once the presenter has revealed the answer to this audience.
 *   - Only accepted, server-side changes count: what the server says happened, not what a button was pressed.
 */
export function soundsFor(prev: Snapshot | null, next: Snapshot, role: 'projector' | 'participant' | 'presenter'): SoundId[] {
  if (!prev) return [];
  const a = prev.state;
  const b = next.state;
  const out: SoundId[] = [];
  const newer = b.version > a.version;

  if (newer) {
    if (a.phase === 'lobby' && b.phase !== 'lobby' && b.phase !== 'ended') out.push('sessionStart');
    else if (b.phase === 'ended' && a.phase !== 'ended') out.push('sessionEnd');
    else if (b.phase === 'standby' && a.phase !== 'standby') out.push('standbyIn');
    else if (a.phase === 'standby' && b.phase !== 'standby') out.push('standbyOut');
    else {
      const changedActivity = next.activity?.id !== prev.activity?.id || next.run?.id !== prev.run?.id;
      if (changedActivity && next.activity) out.push(next.activity.interactive && b.phase === 'open' ? 'activityStart' : 'transition');
      else if (!changedActivity && a.phase !== 'open' && b.phase === 'open') out.push('activityStart');
    }
    if (a.phase === 'open' && b.phase === 'closed' && a.deadlineAt && next.serverNow >= a.deadlineAt - 300) out.push('timeUp');
    if (!a.correctVisible && b.correctVisible && next.activity?.id === prev.activity?.id) {
      if (role === 'participant') {
        const mine = (next as ParticipantSnapshot).me.submissions[0];
        out.push(!mine ? 'reveal' : mine.correct ? 'correct' : (mine.score ?? 0) > 0 ? 'partial' : 'incorrect');
        if (mine?.correct && (mine.score ?? 0) > 0) out.push('points');
      } else out.push('reveal');
    } else if (!a.resultsVisible && b.resultsVisible && a.phase !== 'open' && next.activity?.id === prev.activity?.id) out.push('results');
    if (!a.leaderboardVisible && b.leaderboardVisible) out.push(b.phase === 'ended' ? 'podium' : 'leaderboard');
    if (!a.breakScreen && b.breakScreen) out.push('breakStart');
    if (a.breakScreen && !b.breakScreen) out.push('breakEnd');
  }

  if (role === 'participant') {
    const pr = (prev as ParticipantSnapshot).me.standing;
    const nr = (next as ParticipantSnapshot).me.standing;
    if (pr && nr && nr.rank < pr.rank) out.push('rankUp');
  }
  if (role === 'projector' && (a.phase === 'lobby' || a.phase === 'standby') && next.counts.participants > prev.counts.participants && b.phase === a.phase) out.push('joined');
  if (role !== 'participant' && b.phase === 'open' && next.activity?.id === prev.activity?.id && next.counts.participants > 1 && prev.counts.respondents < prev.counts.participants && next.counts.respondents >= next.counts.participants) out.push('allAnswered');
  return out;
}

/** The music that suits what is on screen (only the projector plays music, and only at "playful"). */
export function musicFor(s: Snapshot, now: number): MusicId | null {
  const st = s.state;
  if (st.breakScreen) return 'break';
  if (st.phase === 'lobby' || st.phase === 'standby') return 'lobby';
  if (st.phase === 'ended' || st.leaderboardVisible) return 'results';
  if (st.phase === 'open' && st.deadlineAt && s.activity?.type === 'quiz') return st.deadlineAt - now <= 10_000 ? 'countdown' : 'quiz';
  if (st.phase === 'revealed' && s.activity?.type === 'quiz') return 'results';
  return null;
}
