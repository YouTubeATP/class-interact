import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useMemo, useState } from 'react';
import type { Ack, MySubmission, ParticipantSnapshot } from '@classinteract/shared';
import { LogoMark } from '@/components/Logo';
import { ConnectionBanner } from '@/components/Status';
import { cn } from '@/lib/cn';
import { prettyPin } from '@/lib/joinUrl';
import type { ConnectionStatus } from '@/lib/session-client';
import { PCtx } from './common';
import { ContentView, EndedView, LeaderboardView, OpenView, PollView, QuizView, RatingView, SurveyView, WaitingView, WordcloudView } from './views';

/**
 * The phone experience. One screen that changes by itself as the presenter moves the session along:
 * waiting → activity → feedback → waiting… The participant never navigates and never rejoins.
 */
export function ParticipantApp({ snap, status, submit, now }: { snap: ParticipantSnapshot; status: ConnectionStatus; submit: (activityId: string, payload: unknown) => Promise<Ack>; now: () => number }) {
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

  const ctx = activity ? { snap, activity, mine, now, send } : null;
  const tone = activity && state.phase !== 'lobby' && state.phase !== 'standby' && state.phase !== 'ended' ? activity.type : 'content';

  return (
    <div data-palette={snap.session.theme.palette} data-tone={tone} className="mx-auto flex min-h-dvh max-w-lg flex-col bg-paper">
      <ConnectionBanner status={status} className="sticky top-0 z-20" />
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-paper/90 px-4 py-3 backdrop-blur">
        <LogoMark className="size-8 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.9375rem] font-bold leading-tight" data-testid="participant-session-title">{snap.session.title}</p>
          <p className="truncate text-[0.8125rem] text-ink-3">{snap.me.name}</p>
        </div>
        <span className="tabular shrink-0 rounded-full bg-surface px-3 py-1 text-[0.8125rem] font-bold text-ink-2 ring-1 ring-line" aria-label="Session code">{prettyPin(snap.session.pin)}</span>
        <span className={cn('size-2.5 shrink-0 rounded-full', status === 'connected' ? 'bg-ok' : 'bg-warn')} role="img" aria-label={status === 'connected' ? 'Connected' : 'Reconnecting'} />
      </header>
      <main className="flex flex-1 flex-col px-4 pb-6 pt-5">
        {ctx ? (
          <PCtx.Provider value={ctx}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={key} className="flex flex-1 flex-col" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.24, ease: [0.3, 0.7, 0.2, 1] }}>
                {view}
              </motion.div>
            </AnimatePresence>
          </PCtx.Provider>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={key} className="flex flex-1 flex-col" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.24 }}>
              <NoActivityContext snap={snap} now={now}>{view}</NoActivityContext>
            </motion.div>
          </AnimatePresence>
        )}
      </main>
    </div>
  );
}

/** Lobby / standby / ended screens have no current activity, but still read from the snapshot. */
function NoActivityContext({ snap, now, children }: { snap: ParticipantSnapshot; now: () => number; children: React.ReactNode }) {
  const dummy = { snap, activity: null as never, mine: [], now, send: async () => ({ ok: false as const, code: 'NO_ACTIVITY', message: 'Nothing to answer yet.' }) };
  return <PCtx.Provider value={dummy}>{children}</PCtx.Provider>;
}
