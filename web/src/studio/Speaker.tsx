import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Eye, EyeOff, KeyRound, ShieldOff, Vibrate, VibrateOff } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { cueFor, isMine, sameName, type Cue, type SessionControlInfo, type SpeakerSnapshot, type Turn } from '@classinteract/shared';
import { LogoMark } from '@/components/Logo';
import { ConnectionBanner, Notice, Spinner } from '@/components/Status';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { CONFIRM_MS, buzz, canVibrate, confirmTap, type ConfirmState } from '@/lib/haptics';
import { useSession } from '@/lib/session-client';
import { store } from '@/lib/storage';

/**
 * The presenter phone. One shared QR on the dashboard; each presenter types their name and gets:
 * - a buzz one slide before their turn and another when it starts, so the timing lives in their hand, not their eyes;
 * - cue points (a few keywords, never the speaker notes) for their own current slide only;
 * - Next / Previous. Pressing them out of turn needs a second tap on the same button.
 *
 * Built so the phone stays a safety net rather than a script: always dark, cues fade after a few seconds unless
 * tapped, nothing to scroll ahead into while live, and a private note at the end on how often you looked down.
 */

const DIM_AFTER_MS = 5000;
const nameKey = (id: string) => `ci:speaker-name:${id}`;
const VIBRATE_KEY = 'ci:speaker-vibrate';

// ------------------------------------------------------------------------------------
// Small hooks
// ------------------------------------------------------------------------------------

/** Keep the screen on while connected (cues and buzzes need the page awake). Dimming is ours, not the OS's. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: { release(): Promise<void> } | null = null;
    let gone = false;
    const take = async () => {
      try {
        if (document.visibilityState === 'visible') lock = await (navigator as any).wakeLock.request('screen');
        if (gone) void lock?.release();
      } catch { /* refused (battery saver, permissions): the page still works */ }
    };
    void take();
    // the browser drops the lock whenever the tab is hidden
    const onVisible = () => { if (document.visibilityState === 'visible') void take(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      gone = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
}

export interface GlanceStats { glances: number; litMs: number; turnMs: number }

/**
 * Heads-up mode: during your turn the cue card fades after a few seconds; a tap brings it back. Counts how often and
 * how long the presenter looked, privately, on this phone only.
 */
function useHeadsUp(onTurn: boolean) {
  const [lit, setLit] = useState(true);
  const timer = useRef<number>();
  const stats = useRef<GlanceStats>({ glances: 0, litMs: 0, turnMs: 0 });
  const litRef = useRef(lit);
  litRef.current = lit;

  const relight = useCallback((count: boolean) => {
    if (count && onTurn && !litRef.current) stats.current.glances += 1;
    setLit(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setLit(false), DIM_AFTER_MS);
  }, [onTurn]);

  // a new turn starts lit, then fades
  useEffect(() => {
    relight(false);
    return () => window.clearTimeout(timer.current);
  }, [onTurn, relight]);

  useEffect(() => {
    if (!onTurn) return;
    const t = window.setInterval(() => {
      stats.current.turnMs += 1000;
      if (litRef.current) stats.current.litMs += 1000;
    }, 1000);
    return () => window.clearInterval(t);
  }, [onTurn]);

  return { lit: lit || !onTurn, poke: () => relight(true), stats };
}

/** Slides from the one on screen to the start of this presenter's next turn (0 = it is their slide). */
function slidesUntilMine(index: number, name: string, turns: Turn[]): number | null {
  if (isMine(index, name, turns)) return 0;
  const next = turns.find((t) => t.from > index && sameName(t.presenter, name));
  return next ? next.from - Math.max(index, -1) : null;
}

// ------------------------------------------------------------------------------------
// Name step
// ------------------------------------------------------------------------------------

function NameStep({ roster, initial, onPick }: { roster: string[]; initial: string; onPick: (name: string) => void }) {
  const [other, setOther] = useState(roster.length === 0 || (!!initial && !roster.some((r) => sameName(r, initial))));
  const [typed, setTyped] = useState(initial);
  const vibrates = canVibrate();
  return (
    <main className="mx-auto grid min-h-dvh max-w-md content-center gap-6 p-5" data-testid="speaker-name-step">
      <div className="grid gap-2">
        <LogoMark className="size-9" />
        <h1 className="text-2xl font-extrabold">Who’s presenting?</h1>
        <p className="text-ink-2">This phone buzzes before your turn and shows a few cue words for your slides. It’s a safety net, not a script: keep your eyes on the room.</p>
      </div>
      {roster.length > 0 && (
        <div className="grid gap-2" role="list" aria-label="Presenters">
          {roster.map((r) => (
            <button key={r} type="button" role="listitem" onClick={() => onPick(r)} data-testid="speaker-pick"
              className="rounded-2xl border-2 border-line bg-surface px-4 py-4 text-left text-lg font-bold active:border-accent">
              {r}
            </button>
          ))}
          {!other && <button type="button" className="py-2 text-sm font-semibold text-ink-2 underline" onClick={() => setOther(true)}>I’m someone else</button>}
        </div>
      )}
      {other && (
        <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) onPick(typed.trim()); }}>
          <label className="text-sm font-semibold" htmlFor="speaker-name">Your name</label>
          <Input id="speaker-name" value={typed} maxLength={60} autoFocus onChange={(e) => setTyped(e.target.value)} data-testid="speaker-name" />
          {roster.length > 0 && typed.trim() && !roster.some((r) => sameName(r, typed)) && (
            <p className="text-sm text-ink-3">That name isn’t on any slide yet, so you’ll join as a helper: no turns, and moving slides asks you to confirm.</p>
          )}
          <Button type="submit" variant="primary" size="lg" disabled={!typed.trim()} data-testid="speaker-join">Join</Button>
        </form>
      )}
      {!vibrates && <p className="rounded-xl bg-surface p-3 text-sm text-ink-2" data-testid="speaker-no-vibrate">This phone can’t vibrate from a web page (iPhones can’t), so your cues will flash the screen edge instead. Keep it face up where you can catch it in the corner of your eye.</p>}
    </main>
  );
}

// ------------------------------------------------------------------------------------
// Live
// ------------------------------------------------------------------------------------

const CUE_TEXT: Record<Cue, string> = { ready: 'Get ready: you’re next', start: 'Your turn', end: 'Handed over' };

function SpeakerLive({ info, name, onRename }: { info: SessionControlInfo; name: string; onRename: () => void }) {
  const auth = useMemo(() => ({ role: 'delegate' as const, sessionId: info.sessionId, token: info.presenterToken, name }), [info, name]);
  const { snapshot: s, status, command } = useSession<SpeakerSnapshot>(auth);
  const [vibrate, setVibrate] = useState(() => store.get<boolean>(VIBRATE_KEY) ?? true);
  const [flash, setFlash] = useState<Cue | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>({ armed: null, until: 0 });
  const [hideCues, setHideCues] = useState(false);
  const [busy, setBusy] = useState(false);
  const prev = useRef<number | null>(null);
  const reduce = useReducedMotion();

  const live = !!s && s.status === 'live' && s.phase !== 'ended' && s.phase !== 'lobby';
  const mine = !!s && live && isMine(s.activityIndex, name, s.turns);
  const { lit, poke, stats } = useHeadsUp(mine);
  useWakeLock(!!s && s.status === 'live');

  // Buzz on handovers. The first snapshot only sets where we are: joining mid-talk must not buzz.
  useEffect(() => {
    if (!s) return;
    const index = s.phase === 'lobby' ? -1 : s.activityIndex;
    const before = prev.current;
    prev.current = index;
    if (before === null || !s.me.matched) return;
    const cue = cueFor(before, index, name, s.turns);
    if (!cue) return;
    buzz(cue, vibrate);
    setFlash(cue);
    const t = window.setTimeout(() => setFlash(null), cue === 'end' ? 900 : 1800);
    return () => window.clearTimeout(t);
  }, [s?.activityIndex, s?.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!confirm.armed) return;
    const t = window.setTimeout(() => setConfirm({ armed: null, until: 0 }), Math.max(0, confirm.until - Date.now()));
    return () => window.clearTimeout(t);
  }, [confirm]);

  if (status === 'revoked' || status === 'denied') {
    return <Centered><Notice icon={<ShieldOff className="size-7" />} title={status === 'revoked' ? 'The presenter QR was reset' : 'This link is not valid'}>Scan the new presenter QR on the presenter’s screen.</Notice></Centered>;
  }
  if (status === 'removed') return <Centered><Notice title="You were removed from the presenter phones">Scan the presenter QR again if that was a mistake.</Notice></Centered>;
  if (status === 'notfound') return <Centered><Notice title="This session no longer exists" /></Centered>;
  if (!s) return <Centered><Spinner className="size-7" /><p className="font-semibold text-ink-2">Connecting…</p></Centered>;

  const ended = s.status === 'ended' || s.phase === 'ended';
  const until = slidesUntilMine(s.phase === 'lobby' ? -1 : s.activityIndex, name, s.turns);
  const onNow = s.current?.presenter ?? null;

  const move = async (type: 'next' | 'previous') => {
    // Only the person presenting moves with one tap. Anyone else (or a helper) confirms on the same button.
    const r = confirmTap(confirm, type, mine, Date.now());
    setConfirm(r.state);
    if (r.armed) buzz('confirm', vibrate);
    if (!r.fire) return;
    setBusy(true);
    const ack = await command({ cmd: 'action', action: { type }, expectVersion: s.version });
    setBusy(false);
    if (!ack.ok) toast.error(ack.code === 'STALE' ? 'Someone moved the slide just before you. Check the screen.' : ack.message);
  };

  let headline: string;
  let tone: 'turn' | 'ready' | 'quiet' = 'quiet';
  if (ended) headline = 'The presentation has ended';
  else if (s.phase === 'lobby' || s.activityIndex < 0) {
    headline = !s.me.matched ? 'Waiting to start' : until === 1 ? 'You’re up first' : 'Waiting to start';
    if (s.me.matched && until === 1) tone = 'ready';
  } else if (mine) { headline = 'Your turn'; tone = 'turn'; }
  else if (s.me.matched && until === 1) { headline = 'Get ready: you’re next'; tone = 'ready'; }
  else headline = onNow ? `Now: ${onNow}` : 'Nobody assigned to this slide';

  return (
    <div data-appearance="dark" className="relative min-h-dvh bg-paper text-ink" data-testid="speaker" data-turn={mine ? 'mine' : 'other'} onPointerDown={() => mine && poke()}>
      <ConnectionBanner status={status} className="sticky top-0 z-30" />
      <AnimatePresence>
        {flash && (
          // The visual twin of the buzz (and the only cue on phones that cannot vibrate): the screen edge pulses in
          // the cue's rhythm. Reduced motion gets a steady ring instead.
          <motion.div key={flash} aria-hidden data-testid="speaker-flash" data-cue={flash}
            className={cn('pointer-events-none fixed inset-0 z-40 rounded-[28px] ring-[14px] ring-inset', flash === 'start' ? 'ring-accent' : flash === 'ready' ? 'ring-warn' : 'ring-line-2')}
            initial={{ opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { opacity: flash === 'ready' ? [0, 1, 0.2, 1, 0.6] : flash === 'start' ? [0, 1, 0.7, 1] : [0, 0.8] }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : flash === 'start' ? 1.2 : 0.8, ease: 'easeOut' }} />
        )}
      </AnimatePresence>
      <div role="status" aria-live="assertive" className="sr-only">{flash ? CUE_TEXT[flash] : ''}</div>

      <div className="mx-auto grid min-h-dvh max-w-xl grid-rows-[auto_1fr_auto] gap-3 p-4">
        <header className="grid gap-1">
          <div className="flex items-center gap-2 text-xs text-ink-3">
            <span className="min-w-0 flex-1 truncate">{s.title}</span>
            {s.activityIndex >= 0 && !ended && <span className="tabular" data-testid="speaker-position">{s.activityIndex + 1}/{s.total}</span>}
            <button type="button" onClick={onRename} className="truncate font-semibold underline">{name}</button>
          </div>
          <p data-testid="speaker-status" data-tone={tone}
            className={cn('rounded-2xl px-4 py-3 text-xl font-extrabold', tone === 'turn' ? 'bg-accent text-accent-ink' : tone === 'ready' ? 'bg-warn-soft text-warn-ink' : 'bg-surface text-ink-2')}>
            {headline}
          </p>
          {!s.me.matched && !ended && <p className="text-xs text-ink-3" data-testid="speaker-helper">You joined as a helper: “{name}” isn’t on any slide.</p>}
        </header>

        <main className="grid content-start gap-3">
          {ended ? <Reflection stats={stats.current} /> : s.outline ? (
            <RunOfShow s={s} name={name} hideCues={hideCues} onToggle={() => setHideCues((v) => !v)} />
          ) : (
            <>
              {mine && s.current && (
                <motion.section aria-label="Your cues" data-testid="speaker-cues" data-lit={lit}
                  className="grid gap-3 rounded-3xl border border-line p-5"
                  initial={false}
                  // fades out slowly (it should not grab attention) and back in quickly (a peek must be instant)
                  animate={{ opacity: lit ? 1 : 0.1 }}
                  transition={{ duration: reduce ? 0 : lit ? 0.15 : 1.2, ease: 'easeOut' }}>
                  <p className="text-sm font-semibold text-ink-3">{s.current.title}</p>
                  {s.current.cues.length ? (
                    <ul className="grid gap-2.5">
                      {s.current.cues.map((c, i) => <li key={i} className="text-[1.75rem] font-bold leading-tight">{c}</li>)}
                    </ul>
                  ) : <p className="text-lg text-ink-2">No cues on this slide. You know this one.</p>}
                  {!lit && <p className="text-xs text-ink-3">Tap anywhere to peek.</p>}
                </motion.section>
              )}
              {!mine && (
                <section className="grid gap-1 rounded-3xl border border-line p-5" data-testid="speaker-waiting">
                  <p className="text-sm text-ink-3">{s.current?.title}</p>
                  {s.me.matched && until !== null && until > 1 && <p className="text-lg font-semibold text-ink-2">Your turn in {until} slides</p>}
                  {s.me.matched && until === null && <p className="text-lg font-semibold text-ink-2">No more turns for you. Nice work.</p>}
                </section>
              )}
              {s.next && (
                <p className="px-1 text-sm text-ink-3" data-testid="speaker-up-next">
                  Next: <span className="font-semibold text-ink-2">{s.next.title}</span>{s.next.presenter && <> · {sameName(s.next.presenter, name) ? 'you' : s.next.presenter}</>}
                </p>
              )}
            </>
          )}
        </main>

        <footer className="grid gap-3 pb-[env(safe-area-inset-bottom)]">
          {!ended && (
            <div className="grid grid-cols-[1fr_2fr] gap-3">
              <NavButton kind="previous" armed={confirm.armed === 'previous'} disabled={!live || busy || s.activityIndex <= 0} onTap={() => void move('previous')} />
              <NavButton kind="next" armed={confirm.armed === 'next'} disabled={!live || busy || s.activityIndex >= s.total - 1} onTap={() => void move('next')} />
            </div>
          )}
          {!live && !ended && <p className="text-center text-xs text-ink-3">The presenter starts the presentation from their screen.</p>}
          <button type="button" className="flex items-center justify-center gap-1.5 text-xs text-ink-3" data-testid="speaker-vibrate-toggle" aria-pressed={vibrate}
            onClick={() => { const v = !vibrate; setVibrate(v); store.set(VIBRATE_KEY, v); if (v) buzz('end'); }}>
            {vibrate ? <Vibrate className="size-3.5" aria-hidden /> : <VibrateOff className="size-3.5" aria-hidden />} {vibrate ? 'Vibrate cues on' : 'Vibrate cues off'}
          </button>
        </footer>
      </div>
    </div>
  );
}

/** Next / Previous. Out of turn, the first tap turns the button itself into a confirmation; no dialog covers the screen. */
function NavButton({ kind, armed, disabled, onTap }: { kind: 'next' | 'previous'; armed: boolean; disabled: boolean; onTap: () => void }) {
  const reduce = useReducedMotion();
  const label = kind === 'next' ? 'Next' : 'Back';
  return (
    <button type="button" disabled={disabled} onClick={onTap} data-testid={`speaker-${kind}`} data-armed={armed}
      aria-label={armed ? `Confirm ${kind === 'next' ? 'next slide' : 'previous slide'}` : kind === 'next' ? 'Next slide' : 'Previous slide'}
      className={cn('relative flex h-20 items-center justify-center gap-1 overflow-hidden rounded-2xl border-2 text-lg font-extrabold disabled:opacity-40',
        armed ? 'border-warn bg-warn-soft text-warn-ink' : kind === 'next' ? 'border-transparent bg-surface text-ink' : 'border-line bg-transparent text-ink-2')}>
      {armed ? <span>Confirm {kind === 'next' ? 'next' : 'back'}?</span> : <>{kind === 'previous' && <ChevronLeft className="size-6" aria-hidden />}{label}{kind === 'next' && <ChevronRight className="size-6" aria-hidden />}</>}
      {/* the bar runs out with the confirmation window */}
      {armed && <motion.span aria-hidden className="absolute inset-x-0 bottom-0 h-1 origin-left bg-warn" initial={{ scaleX: 1 }} animate={{ scaleX: reduce ? 1 : 0 }} transition={{ duration: CONFIRM_MS / 1000, ease: 'linear' }} />}
    </button>
  );
}

/** Before the start: the whole run of show, for rehearsal. Practice mode hides your cues so you can test yourself. */
function RunOfShow({ s, name, hideCues, onToggle }: { s: SpeakerSnapshot; name: string; hideCues: boolean; onToggle: () => void }) {
  return (
    <section className="grid gap-2" aria-label="Run of show" data-testid="speaker-outline">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-ink-2">Run of show</h2>
        <button type="button" onClick={onToggle} className="flex items-center gap-1 text-xs font-semibold text-ink-2 underline" data-testid="speaker-practice">
          {hideCues ? <Eye className="size-3.5" aria-hidden /> : <EyeOff className="size-3.5" aria-hidden />} {hideCues ? 'Show my cues' : 'Practise without cues'}
        </button>
      </div>
      <p className="text-xs text-ink-3">Only before the start: once you begin, this phone shows just the slide you’re on.</p>
      <ol className="grid gap-1.5">
        {s.outline!.map((o, i) => {
          const me = sameName(o.presenter, name);
          return (
            <li key={i} className={cn('rounded-xl border p-2.5', me ? 'border-accent' : 'border-line')}>
              <p className="flex gap-2 text-sm"><span className="tabular text-ink-3">{i + 1}</span><span className="min-w-0 flex-1 truncate font-semibold">{o.title}</span><span className="text-ink-3">{me ? 'you' : o.presenter ?? ''}</span></p>
              {me && o.cues.length > 0 && (hideCues ? <p className="pl-5 text-xs text-ink-3">{o.cues.length} cue{o.cues.length === 1 ? '' : 's'}: say them out loud, then check.</p> : <p className="pl-5 text-sm text-ink-2">{o.cues.join(' · ')}</p>)}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Private, on this phone only: how much the presenter leaned on it. Never sent anywhere. */
function Reflection({ stats }: { stats: GlanceStats }) {
  const turnMin = Math.max(1, Math.round(stats.turnMs / 60000));
  const litSec = Math.round(stats.litMs / 1000);
  if (stats.turnMs === 0) return <p className="text-ink-2">Thanks for presenting.</p>;
  const share = stats.turnMs ? stats.litMs / stats.turnMs : 0;
  const tip = share > 0.5
    ? 'Your cues were on screen for most of your turn. Next time, try rehearsing once with “Practise without cues”.'
    : stats.glances <= 3 ? 'You barely needed the phone. Nice: the room had your eyes.' : 'A quick glance now and then is what cues are for.';
  return (
    <section className="grid gap-2 rounded-3xl border border-line p-5" data-testid="speaker-reflection">
      <h2 className="text-lg font-bold">Just for you</h2>
      <p className="text-ink-2">You peeked at your cues <strong className="text-ink">{stats.glances}</strong> time{stats.glances === 1 ? '' : 's'} (about {litSec}s of screen) during about {turnMin} minute{turnMin === 1 ? '' : 's'} of presenting.</p>
      <p className="text-sm text-ink-3">{tip}</p>
      <p className="text-xs text-ink-3">This stays on this phone. Nobody else sees it.</p>
    </section>
  );
}

const Centered = ({ children }: { children: React.ReactNode }) => <div data-appearance="dark" className="grid min-h-dvh place-items-center bg-paper text-ink"><div className="grid justify-items-center gap-3 p-6">{children}</div></div>;

export default function SpeakerPage() {
  const { id = '' } = useParams();
  const [info, setInfo] = useState<SessionControlInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const remembered = store.get<string>(nameKey(id)) ?? '';
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('g');
    if (!token) { setError('This page opens from the presenter QR on the presenter’s screen.'); return; }
    api.delegate.claim(id, token).then((i) => {
      if (i.role !== 'speaker') throw new Error('This is not a presenter QR.');
      setInfo(i);
    }).catch((e) => setError(e instanceof Error ? e.message : 'Could not open the presenter phone.'));
  }, [id]);
  if (error) return <Centered><Notice icon={<KeyRound className="size-7" />} title="Could not open the presenter phone">{error}</Notice></Centered>;
  if (!info) return <Centered><Spinner className="size-7" /></Centered>;
  if (!name) {
    // The tap on a name is also the user gesture browsers want before they allow vibration.
    return <div data-appearance="dark" className="min-h-dvh bg-paper text-ink"><NameStep roster={info.roster ?? []} initial={remembered} onPick={(n) => { store.set(nameKey(id), n); buzz('end'); setName(n); }} /></div>;
  }
  return <SpeakerLive info={info} name={name} onRename={() => setName(null)} />;
}
