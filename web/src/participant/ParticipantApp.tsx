import { AnimatePresence, motion } from 'framer-motion';
import { Pencil } from 'lucide-react';
import { useCallback, useMemo, useState, type FormEvent } from 'react';
import type { Ack, MySubmission, ParticipantSnapshot } from '@classinteract/shared';
import { AmbientBackdrop } from '@/components/Ambient';
import { LogoMark } from '@/components/Logo';
import { ConnectionBanner } from '@/components/Status';
import { Button } from '@/components/ui/button';
import { DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { prettyPin } from '@/lib/joinUrl';
import type { ConnectionStatus } from '@/lib/session-client';
import { PCtx } from './common';
import { ContentView, EndedView, LeaderboardView, OpenView, PollView, QuizView, RatingView, SurveyView, WaitingView, WordcloudView } from './views';

/**
 * The phone experience. One screen that changes by itself as the presenter moves the session along:
 * waiting → activity → feedback → waiting… The participant never navigates and never rejoins.
 */
function RenameDialog({ open, onOpenChange, current, rename }: { open: boolean; onOpenChange: (o: boolean) => void; current: string; rename: (name: string) => Promise<Ack<{ name: string }>> }) {
  const [value, setValue] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ack = await rename(value);
    setBusy(false);
    if (ack.ok) onOpenChange(false);
    else setError(ack.message);
  };
  return (
    <DialogContent open={open} onOpenChange={(o) => { onOpenChange(o); if (o) { setValue(current); setError(null); } }} title="Change your name" description="Everyone in the session sees this name.">
      <form onSubmit={submit} className="grid gap-4">
        <Field error={error}><Input autoFocus value={value} maxLength={24} onChange={(e) => { setValue(e.target.value); setError(null); }} aria-label="Your name" data-testid="rename-input" aria-invalid={!!error} className="h-12 rounded-xl text-base" /></Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy || !value.trim()} data-testid="rename-submit">Save</Button>
        </div>
      </form>
    </DialogContent>
  );
}

export function ParticipantApp({ snap, status, submit, rename, now }: { snap: ParticipantSnapshot; status: ConnectionStatus; submit: (activityId: string, payload: unknown) => Promise<Ack>; rename: (name: string) => Promise<Ack<{ name: string }>>; now: () => number }) {
  const [renaming, setRenaming] = useState(false);
  // Snapshots to participants are not pushed on every submission, so remember accepted ones locally.
  const [local, setLocal] = useState<Record<string, MySubmission[]>>({});
  const { activity, state } = snap;

  const mine = useMemo(() => {
    if (!activity) return [];
    const merged = new Map<string, MySubmission>();
    for (const s of snap.me.submissions) merged.set(s.id, s);
    for (const s of local[activity.id] ?? []) if (!merged.has(s.id)) merged.set(s.id, s);
    return [...merged.values()].sort((a, b) => a.slot - b.slot);
  }, [activity, snap.me.submissions, local]);

  const send = useCallback(
    async (payload: unknown) => {
      const ack = (await submit(activity!.id, payload)) as Ack<{ submission: MySubmission }>;
      if (ack.ok) setLocal((l) => ({ ...l, [activity!.id]: [...(l[activity!.id] ?? []), ack.submission] }));
      return ack;
    },
    [submit, activity],
  );

  let key: string = state.phase;
  let view: React.ReactNode;
  if (state.phase === 'lobby' || state.phase === 'standby') view = <WaitingView kind={state.phase} />;
  else if (state.phase === 'ended') view = <EndedView />;
  else if (!activity) view = <WaitingView kind="standby" />;
  else if (state.leaderboardVisible && snap.leaderboard?.length) { key = 'board'; view = <LeaderboardView />; }
  else {
    key = `act:${activity.id}`;
    view =
      activity.type === 'content' ? <ContentView /> :
      activity.type === 'quiz' ? <QuizView /> :
      activity.type === 'poll' ? <PollView /> :
      activity.type === 'wordcloud' ? <WordcloudView /> :
      activity.type === 'open' ? <OpenView /> :
      activity.type === 'rating' ? <RatingView /> :
      <SurveyView />;
  }

  // Each view gets its own context value, captured when it was created. AnimatePresence keeps the
  // *exiting* view mounted for a moment; a shared provider would hand it the next activity's data.
  const ctx = activity
    ? { snap, activity, mine, now, send }
    : { snap, activity: null as never, mine: [] as MySubmission[], now, send: async () => ({ ok: false as const, code: 'NO_ACTIVITY', message: 'Nothing to answer yet.' }) };
  const node = <PCtx.Provider value={ctx}>{view}</PCtx.Provider>;
  const tone = activity && state.phase !== 'lobby' && state.phase !== 'standby' && state.phase !== 'ended' ? activity.type : 'content';
  return (
    <div data-palette={snap.session.theme.palette} data-tone={tone} className="mx-auto flex min-h-dvh max-w-lg flex-col">
      {(state.phase === 'lobby' || state.phase === 'standby') && <AmbientBackdrop />}
      <ConnectionBanner status={status} className="sticky top-0 z-20" />
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-paper/90 px-4 py-3 backdrop-blur">
        <LogoMark className="size-8 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.9375rem] font-bold leading-tight" data-testid="participant-session-title">{snap.session.title}</p>
          <button type="button" onClick={() => setRenaming(true)} className="-ml-1 inline-flex max-w-full items-center gap-1 rounded-md px-1 text-[0.8125rem] text-ink-3 hover:text-ink" aria-label={`You are ${snap.me.name}. Change name`} data-testid="participant-name">
            <span className="truncate">{snap.me.name}</span> <Pencil className="size-3 shrink-0" aria-hidden />
          </button>
        </div>
        <span className="tabular shrink-0 rounded-full bg-surface px-3 py-1 text-[0.8125rem] font-bold text-ink-2 ring-1 ring-line" aria-label="Session code">{prettyPin(snap.session.pin)}</span>
        <span className={cn('size-2.5 shrink-0 rounded-full', status === 'connected' ? 'bg-ok' : 'bg-warn')} role="img" aria-label={status === 'connected' ? 'Connected' : 'Reconnecting'} />
      </header>
      <main className="flex flex-1 flex-col px-4 pb-6 pt-5">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={key} className="flex flex-1 flex-col" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.24, ease: [0.3, 0.7, 0.2, 1] }}>
            {node}
          </motion.div>
        </AnimatePresence>
      </main>
      <RenameDialog open={renaming} onOpenChange={setRenaming} current={snap.me.name} rename={rename} />
    </div>
  );
}
