import { AnimatePresence, motion } from 'framer-motion';
import { CalendarClock, Check, ChevronLeft, ChevronRight, PartyPopper } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Ack, MySubmission, ParticipantSnapshot, SelfPacedItem } from '@classinteract/shared';
import { audio } from '@/audio/engine';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { store } from '@/lib/storage';
import { PCtx } from './common';
import { ContentView, OpenView, PollView, QuizView, RatingView, SurveyView, WordcloudView } from './views';

const VIEWS = { content: ContentView, quiz: QuizView, poll: PollView, wordcloud: WordcloudView, open: OpenView, rating: RatingView, survey: SurveyView } as const;

/**
 * Self-paced sessions: each person moves through the activities on their own, with Back and Next. Progress lives on
 * the server (what you answered), and the current position is remembered on the device, so closing the browser or
 * losing the connection never loses work. A branch rule on a quiz sends you to the slide it names once you answer.
 */
export function SelfPacedFlow({ snap, submit, now, online }: { snap: ParticipantSnapshot; submit: (activityId: string, payload: unknown) => Promise<Ack>; now: () => number; online: boolean }) {
  const sp = snap.selfPaced!;
  const items = sp.items;
  const posKey = `ci:sp:${snap.session.id}:${snap.me.id}`;
  const firstOpen = useMemo(() => Math.max(0, items.findIndex((i) => i.activity.interactive && i.submissions.length === 0)), [items]);
  const [index, setIndex] = useState<number>(() => Math.min(items.length - 1, store.get<number>(posKey) ?? firstOpen));
  const [local, setLocal] = useState<Record<string, MySubmission[]>>({});
  const [done, setDone] = useState(false);
  useEffect(() => store.set(posKey, index), [posKey, index]);

  const item = items[Math.min(index, items.length - 1)];
  const mine: MySubmission[] = useMemo(() => {
    const merged = new Map<string, MySubmission>();
    for (const s of item.submissions) merged.set(s.id, s);
    for (const s of local[item.activity.id] ?? []) if (!merged.has(s.id)) merged.set(s.id, s);
    return [...merged.values()].sort((a, b) => a.slot - b.slot);
  }, [item, local]);
  const answeredCount = items.filter((i) => i.activity.interactive && (i.submissions.length > 0 || (local[i.activity.id]?.length ?? 0) > 0)).length;
  const total = items.filter((i) => i.activity.interactive).length;

  const send = useCallback(async (payload: unknown) => {
    const ack = (await submit(item.activity.id, payload)) as Ack<{ submission: MySubmission }>;
    if (ack.ok) {
      setLocal((l) => ({ ...l, [item.activity.id]: [...(l[item.activity.id] ?? []), ack.submission] }));
      audio.play('submit');
    }
    return ack;
  }, [submit, item]);

  const go = (to: number) => { setIndex(Math.max(0, Math.min(items.length - 1, to))); window.scrollTo({ top: 0 }); };
  const next = () => {
    const branchTo = sp.next[item.activity.id];
    const target = branchTo ? items.findIndex((i) => i.activity.key === branchTo) : -1;
    if (target >= 0 && target !== index) return go(target);
    if (index >= items.length - 1) { setDone(true); audio.play('survey'); return; }
    go(index + 1);
  };

  // what the views expect from a live session, built for this one item
  const answered = mine.length > 0;
  const fakeSnap: ParticipantSnapshot = {
    ...snap,
    activity: item.activity,
    results: null,
    state: { ...snap.state, phase: sp.open ? 'open' : 'closed', activityIndex: index, deadlineAt: null, openedAt: null, correctVisible: sp.revealNow && answered, resultsVisible: false, leaderboardVisible: false },
    me: { ...snap.me, submissions: mine },
  };
  const View = VIEWS[item.activity.type];
  const deadline = sp.deadlineAt ? new Date(sp.deadlineAt) : null;
  const leftMs = sp.deadlineAt ? sp.deadlineAt - now() : null;

  if (!sp.open && answeredCount === 0 && snap.state.phase === 'lobby') {
    return (
      <div className="grid flex-1 content-center justify-items-center gap-4 py-10 text-center" data-testid="selfpaced-waiting">
        <CalendarClock className="size-10 text-accent" aria-hidden />
        <h2 className="display text-[1.9rem]">Not open yet</h2>
        <p className="max-w-[19rem] text-ink-2">The presenter has not opened these activities yet. Keep this page open, or come back with the same code later.</p>
      </div>
    );
  }
  if (done) {
    return (
      <div className="grid flex-1 content-center justify-items-center gap-4 py-10 text-center" data-testid="selfpaced-done">
        <span className="grid size-16 place-items-center rounded-3xl bg-accent-soft text-accent-ink"><PartyPopper className="size-8" aria-hidden /></span>
        <h2 className="display text-[1.9rem]">All done</h2>
        <p className="max-w-[19rem] text-ink-2">You answered {answeredCount} of {total}. {sp.revealNow ? (snap.me.standing ? `Your score: ${snap.me.standing.score.toLocaleString()}.` : '') : 'Results will be shown when the presenter closes the activities.'}</p>
        <Button variant="secondary" onClick={() => setDone(false)}>Review my answers</Button>
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col gap-4" data-testid="selfpaced">
      <div className="grid gap-2">
        <div className="flex items-center justify-between text-sm font-semibold text-ink-2">
          <span data-testid="selfpaced-progress">{answeredCount} of {total} answered</span>
          {deadline && <span className={cn(leftMs !== null && leftMs < 3600_000 && 'text-warn-ink')}>{sp.open ? `Due ${deadline.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}` : 'Closed'}</span>}
        </div>
        <div className="flex gap-1" aria-hidden>
          {items.map((it, i) => (
            <button key={it.activity.id} type="button" tabIndex={-1} onClick={() => go(i)} className={cn('h-1.5 flex-1 rounded-full', i === index ? 'bg-accent' : (it.submissions.length || local[it.activity.id]?.length) ? 'bg-accent/45' : 'bg-ink/10')} />
          ))}
        </div>
        {!sp.open && <p className="rounded-xl bg-ink/5 px-3 py-2 text-sm font-semibold text-ink-2" role="status">Responses are closed. You can still look through the activities.</p>}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={item.activity.id} className="flex flex-1 flex-col" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.2 }}>
          <PCtx.Provider value={{ snap: fakeSnap, activity: item.activity, mine, now, send, online }}><View /></PCtx.Provider>
        </motion.div>
      </AnimatePresence>
      <div className="flex items-center gap-2 pt-2">
        <Button variant="secondary" size="lg" disabled={index === 0} onClick={() => go(index - 1)} data-testid="sp-back"><ChevronLeft className="size-5" aria-hidden /> Back</Button>
        <Button variant={answered || !item.activity.interactive ? 'primary' : 'secondary'} size="lg" className="flex-1" onClick={next} data-testid="sp-next">
          {index >= items.length - 1 && !sp.next[item.activity.id] ? <><Check className="size-5" aria-hidden /> Finish</> : <>{answered || !item.activity.interactive ? 'Next' : 'Skip for now'} <ChevronRight className="size-5" aria-hidden /></>}
        </Button>
      </div>
    </div>
  );
}

export type { SelfPacedItem };
