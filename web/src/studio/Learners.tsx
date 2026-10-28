import { ShieldCheck, Trash2, UsersRound } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Notice, Spinner } from '@/components/Status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { LearnerReport } from '@/lib/learners';
import { ConfirmDialog } from './dialogs';
import { StudioHeader } from './StudioRoutes';

const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v * 100)}%`);

/**
 * Progress across sessions, for people who chose "remember me". The class view uses everyone who opted in; an
 * individual history appears only for people who also agreed to share their own progress.
 */
export default function LearnersPage() {
  const [data, setData] = useState<LearnerReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remove, setRemove] = useState<string | null>(null);
  const load = useCallback(() => api.learners.report().then(setData).catch((e) => setError(e instanceof Error ? e.message : 'Could not load.')), []);
  useEffect(() => { void load(); }, [load]);

  if (error) return <div className="grid min-h-dvh place-items-center"><Notice title="Could not load this report">{error}</Notice></div>;
  if (!data) return <div className="grid min-h-dvh place-items-center"><Spinner className="size-7" /></div>;
  const sharing = data.learners.filter((l) => l.history);
  return (
    <div className="min-h-dvh bg-paper">
      <StudioHeader />
      <main className="mx-auto grid max-w-5xl gap-8 px-4 py-8 sm:px-6" data-testid="learners-page">
        <div className="grid gap-1.5">
          <h1 className="display text-[2.2rem]">Across sessions</h1>
          <p className="max-w-2xl text-ink-2">When a session offers “remember me”, participants can choose to be recognised again next time by a random key on their own device (never by their name). Rehearsals are never counted.</p>
        </div>
        {data.totals.learners === 0 ? (
          <Notice icon={<UsersRound className="size-7" />} title="Nobody is being remembered yet">Start a session with “Offer remember me across sessions” switched on (under More options). Participants who agree will appear here.</Notice>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[['People remembered', data.totals.learners], ['Sharing their own progress', data.totals.sharing], ['Sessions', data.sessions.length]].map(([k, v]) => (
                <div key={k as string} className="rounded-2xl border border-line bg-surface px-4 py-3"><dt className="text-xs font-semibold text-ink-3">{k}</dt><dd className="display tabular text-[1.8rem]">{v}</dd></div>
              ))}
            </dl>
            <section className="grid gap-3 rounded-card border border-line bg-surface p-5" aria-labelledby="class-h">
              <h2 id="class-h" className="text-lg">The class over time</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] text-left text-sm" data-testid="learner-sessions">
                  <thead className="text-ink-3"><tr><th className="py-2 font-semibold">Session</th><th className="font-semibold">Remembered</th><th className="font-semibold">Returning</th><th className="font-semibold">Answered</th><th className="font-semibold">Correct</th></tr></thead>
                  <tbody>
                    {data.sessions.map((s) => (
                      <tr key={s.sessionId} className="border-t border-line">
                        <td className="py-2"><span className="font-semibold">{s.title}</span><span className="block text-xs text-ink-3">{formatDateTime(s.createdAt)}</span></td>
                        <td className="tabular">{s.linked} of {s.participants}</td>
                        <td className="tabular">{s.returning}</td>
                        <td className="tabular">{pct(s.linkedParticipation)}</td>
                        <td className="tabular">{pct(s.linkedCorrectRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-ink-3">Answered: average share of each session’s activities that remembered people answered. Correct: share of their scored answers that were right.</p>
            </section>
            <section className="grid gap-3 rounded-card border border-line bg-surface p-5" aria-labelledby="ind-h">
              <h2 id="ind-h" className="flex items-center gap-2 text-lg"><ShieldCheck className="size-5 text-ok" aria-hidden /> Individual progress (with permission)</h2>
              {sharing.length === 0 ? <p className="text-sm text-ink-3">Nobody has agreed to share their own progress.</p> : (
                <ul className="grid gap-3">
                  {sharing.map((l) => (
                    <li key={l.id} className="grid gap-2 rounded-xl border border-line p-3" data-testid="learner-row">
                      <div className="flex flex-wrap items-center gap-2">
                        <Input defaultValue={l.label} placeholder="Your label (optional)" maxLength={60} aria-label="Label" className="h-8 max-w-56 text-sm" onBlur={(e) => e.target.value !== l.label && void api.learners.label(l.id, e.target.value).then(() => toast.success('Saved'))} />
                        <Badge>{l.sessions} sessions</Badge>
                        <Button variant="ghost" size="sm" className="ml-auto text-bad" onClick={() => setRemove(l.id)}><Trash2 className="size-3.5" aria-hidden /> Delete</Button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[28rem] text-left text-sm">
                          <thead className="text-xs text-ink-3"><tr><th className="font-semibold">Session</th><th className="font-semibold">Name used</th><th className="font-semibold">Answered</th><th className="font-semibold">Correct</th><th className="font-semibold">Points</th></tr></thead>
                          <tbody>{l.history!.map((h) => <tr key={h.sessionId} className="border-t border-line"><td className="py-1.5">{h.title}<span className="block text-xs text-ink-3">{formatDateTime(h.date)}</span></td><td>{h.displayName}</td><td className="tabular">{h.answered}</td><td className="tabular">{pct(h.correctRate)}</td><td className="tabular">{h.score.toLocaleString()}</td></tr>)}</tbody>
                        </table>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
      <ConfirmDialog open={!!remove} onOpenChange={(o) => !o && setRemove(null)} title="Delete this person’s cross-session link?" description="Their past sessions stay, under the display names they used, but are no longer connected to each other." confirm="Delete" onConfirm={async () => { await api.learners.remove(remove!); setRemove(null); await load(); }} />
    </div>
  );
}
