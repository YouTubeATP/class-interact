import { AnimatePresence, motion } from 'framer-motion';
import { Coffee, Hourglass, Pencil, Settings2 } from 'lucide-react';
import { useCallback, useMemo, useState, type FormEvent } from 'react';
import type { Ack, MySubmission, ParticipantSnapshot } from '@classinteract/shared';
import { audio, type SoundId } from '@/audio/engine';
import { useSessionAudio } from '@/audio/useSessionAudio';
import { useRemaining } from '@/components/Countdown';
import { AppearanceToggle, MuteButton, SoundSettingsPanel } from '@/components/Preferences';
import { api } from '@/lib/api';
import { LEARNER_KEY } from '@/lib/learners';
import { store } from '@/lib/storage';
import { Dock, type DockActions } from './Dock';
import { SelfPacedFlow } from './SelfPaced';
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

/** This phone's own settings: appearance, sound, and the optional "remember me" link. */
function PreferencesDialog({ open, onOpenChange, linked, phoneSounds }: { open: boolean; onOpenChange: (o: boolean) => void; linked: boolean; phoneSounds: boolean }) {
  const [key, setKey] = useState(() => store.get<string>(LEARNER_KEY));
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <DialogContent open={open} onOpenChange={onOpenChange} title="Settings" description="These only change this phone." className="max-h-[92dvh] overflow-y-auto">
      <div className="grid gap-6" data-testid="participant-settings">
        <section className="grid gap-2"><h3 className="text-sm font-bold">Appearance</h3><AppearanceToggle scope="participant" /></section>
        <section className="grid gap-2">
          <h3 className="text-sm font-bold">Sound</h3>
          {phoneSounds ? <SoundSettingsPanel scope="participant" /> : <p className="text-sm text-ink-3">The presenter turned off sounds on phones for this session.</p>}
        </section>
        {(key || linked) && (
          <section className="grid gap-2" data-testid="remember-section">
            <h3 className="text-sm font-bold">Remembered on this device</h3>
            <p className="text-sm text-ink-2">Your teacher can follow class progress across sessions. Forgetting deletes the link; past results stay under your display names only.</p>
            {msg && <p role="status" className="text-sm font-semibold text-ok">{msg}</p>}
            {key && <Button variant="danger-soft" onClick={async () => { await api.learners.forget(key).catch(() => undefined); store.remove(LEARNER_KEY); setKey(null); setMsg('Forgotten. This device will not be recognised next time.'); }} data-testid="forget-me">Forget me</Button>}
          </section>
        )}
      </div>
    </DialogContent>
  );
}

/** Break, preparation or work time: covers the activity without discarding it. */
function BreakOverlay({ snap, now }: { snap: ParticipantSnapshot; now: () => number }) {
  const b = snap.state.breakScreen!;
  const left = useRemaining(b.endsAt, now);
  const Icon = b.kind === 'break' ? Coffee : Hourglass;
  const mm = left === null ? null : `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
  return (
    <motion.div className="fixed inset-0 z-20 mx-auto grid max-w-lg place-items-center bg-paper/97 px-6 text-center backdrop-blur" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="participant-break" role="status">
      <div className="grid justify-items-center gap-4">
        <span className="grid size-16 place-items-center rounded-3xl bg-accent-soft text-accent-ink"><Icon className="size-8" aria-hidden /></span>
        <h2 className="display text-[2rem]">{b.title || (b.kind === 'break' ? 'Break' : b.kind === 'prepare' ? 'Get ready' : 'Work time')}</h2>
        {b.message && <p className="whitespace-pre-line text-[1.0625rem] text-ink-2">{b.message}</p>}
        {mm !== null && <p className="display tabular text-[3rem]" role="timer">{left! > 0 ? mm : 'Time’s up'}</p>}
        <p className="text-sm text-ink-3">Keep this page open. You will not lose your place.</p>
      </div>
    </motion.div>
  );
}

const SUBMIT_SOUND: Record<string, SoundId> = { quiz: 'submit', poll: 'poll', wordcloud: 'word', open: 'word', rating: 'survey', survey: 'survey' };

export function ParticipantApp({ snap, status, submit, rename, now, actions, preview = false }: { snap: ParticipantSnapshot; status: ConnectionStatus; submit: (activityId: string, payload: unknown) => Promise<Ack>; rename: (name: string) => Promise<Ack<{ name: string }>>; now: () => number; actions?: DockActions; preview?: boolean }) {
  const [renaming, setRenaming] = useState(false);
  const [prefs, setPrefs] = useState(false);
  useSessionAudio(preview ? null : snap, 'participant', now, { disabled: !snap.session.features.phoneSounds });
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
      if (ack.ok) {
        setLocal((l) => ({ ...l, [activity!.id]: [...(l[activity!.id] ?? []), ack.submission] }));
        if (!preview) audio.play(SUBMIT_SOUND[activity!.type] ?? 'submit');
      }
      return ack;
    },
    [submit, activity, preview],
  );

  const online = status === 'connected';
  let key: string = state.phase;
  let view: React.ReactNode;
  if (snap.selfPaced && state.phase !== 'ended') { key = 'selfpaced'; view = <SelfPacedFlow snap={snap} submit={submit} now={now} online={online} />; }
  else if (state.phase === 'lobby' || state.phase === 'standby') view = <WaitingView kind={state.phase} />;
  else if (state.phase === 'ended') view = <EndedView />;
  else if (!activity) view = <WaitingView kind="standby" />;
  else if (state.leaderboardVisible && (snap.leaderboard?.length || snap.teamBoard?.length)) { key = 'board'; view = <LeaderboardView />; }
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
    ? { snap, activity, mine, now, send, online }
    : { snap, activity: null as never, mine: [] as MySubmission[], now, online, send: async () => ({ ok: false as const, code: 'NO_ACTIVITY', message: 'Nothing to answer yet.' }) };
  const node = <PCtx.Provider value={ctx}>{view}</PCtx.Provider>;
  const dock = !!actions && (snap.session.features.qa.enabled || snap.session.features.pulse.enabled) && state.phase !== 'ended';
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
        {snap.me.team && <span className="hidden max-w-24 shrink-0 truncate rounded-full px-2.5 py-1 text-xs font-bold text-white min-[360px]:inline" style={{ background: snap.me.team.color }} data-testid="team-badge">{snap.me.team.name}</span>}
        <span className="tabular shrink-0 rounded-full bg-surface px-3 py-1 text-[0.8125rem] font-bold text-ink-2 ring-1 ring-line" aria-label="Session code">{prettyPin(snap.session.pin)}</span>
        {snap.session.features.phoneSounds && <MuteButton scope="participant" className="-mr-1 shrink-0" />}
        <Button variant="ghost" size="icon-sm" className="-mr-1 shrink-0" aria-label="Settings" onClick={() => setPrefs(true)} data-testid="participant-settings-open"><Settings2 className="size-4" aria-hidden /></Button>
        <span className={cn('size-2.5 shrink-0 rounded-full ring-2', status === 'connected' ? 'bg-ok ring-ok-soft' : 'bg-warn ring-warn-soft')} role="img" aria-label={status === 'connected' ? 'Connected' : 'Reconnecting'} />
      </header>
      <main className={cn('flex flex-1 flex-col px-4 pt-5', dock ? 'pb-24' : 'pb-6')} style={dock ? ({ ['--dock-h' as string]: '4.25rem' }) : undefined}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={key} className="flex flex-1 flex-col" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.24, ease: [0.3, 0.7, 0.2, 1] }}>
            {node}
          </motion.div>
        </AnimatePresence>
      </main>
      <AnimatePresence>{state.breakScreen && state.phase !== 'ended' && <BreakOverlay key="break" snap={snap} now={now} />}</AnimatePresence>
      {dock && actions && <Dock snap={snap} actions={actions} />}
      <RenameDialog open={renaming} onOpenChange={setRenaming} current={snap.me.name} rename={rename} />
      <PreferencesDialog open={prefs} onOpenChange={setPrefs} linked={snap.me.linked} phoneSounds={snap.session.features.phoneSounds} />
    </div>
  );
}
