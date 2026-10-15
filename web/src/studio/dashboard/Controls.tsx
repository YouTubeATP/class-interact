import { motion } from 'framer-motion';
import { BarChart3, ChevronLeft, ChevronRight, CirclePause, Eye, EyeOff, Lock, Medal, Play, Square, Trophy, Unlock } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ActionType, PresenterSnapshot } from '@classinteract/shared';
import { TimerRing } from '@/components/Countdown';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

const STEPS = [
  { phase: ['ready'], label: 'Ready' },
  { phase: ['open'], label: 'Open' },
  { phase: ['closed'], label: 'Closed' },
  { phase: ['revealed', 'completed'], label: 'Results' },
] as const;

function PhaseTrack({ phase }: { phase: string }) {
  const idx = STEPS.findIndex((s) => (s.phase as readonly string[]).includes(phase));
  return (
    <ol className="flex items-center gap-1.5" aria-label="Activity progress">
      {STEPS.map((s, i) => (
        <li key={s.label} className="flex items-center gap-1.5">
          <span className={cn('relative rounded-full px-3 py-1 text-xs font-bold transition-colors', i === idx ? 'text-white' : i < idx ? 'bg-accent-soft text-accent-ink' : 'bg-ink/6 text-ink-3')} data-active={i === idx}>
            {i === idx && <motion.span layoutId="phase-pill" className="absolute inset-0 rounded-full bg-accent" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
            <span className="relative">{s.label}</span>
          </span>
          {i < STEPS.length - 1 && <span className="h-px w-3 bg-line-2" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

export function Controls({ snap, run, now }: { snap: PresenterSnapshot; run: (type: ActionType) => void; now: () => number }) {
  const { state, available, activity, behavior, counts } = snap;
  const can = (a: ActionType) => available.includes(a);
  const interactive = !!behavior?.interactive;
  const hasAnswer = !!behavior?.hasCorrectAnswer;
  const inActivity = !!activity && state.phase !== 'standby' && state.phase !== 'lobby' && state.phase !== 'ended';
  const standalone = snap.session.mode === 'standalone';

  // the one button you most likely want next
  let primary: { label: string; action: ActionType; icon: ReactNode } | null = null;
  if (state.phase === 'lobby') primary = standalone ? { label: 'Start presentation', action: 'start', icon: <Play className="size-5" aria-hidden /> } : null;
  else if (inActivity && interactive && state.phase === 'ready') primary = { label: 'Open responses', action: 'open', icon: <Unlock className="size-5" aria-hidden /> };
  else if (inActivity && interactive && state.phase === 'open') primary = { label: 'Close responses', action: 'close', icon: <Lock className="size-5" aria-hidden /> };
  else if (inActivity && interactive && state.phase === 'closed') primary = hasAnswer ? { label: 'Reveal answer', action: 'revealCorrect', icon: <Eye className="size-5" aria-hidden /> } : { label: 'Show results', action: 'revealResults', icon: <BarChart3 className="size-5" aria-hidden /> };
  else if (can('next') && state.phase !== 'ended') primary = { label: 'Next', action: 'next', icon: <ChevronRight className="size-5" aria-hidden /> };

  const Btn = ({ action, children, variant = 'secondary', testId }: { action: ActionType; children: ReactNode; variant?: 'secondary' | 'soft' | 'primary'; testId?: string }) => (
    <Button variant={variant} size="md" disabled={!can(action)} onClick={() => run(action)} data-testid={testId ?? `ctl-${action}`}>{children}</Button>
  );

  return (
    <div className="grid gap-4 rounded-card border border-line bg-surface p-4" data-testid="controls" data-phase={state.phase}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {inActivity && interactive ? <PhaseTrack phase={state.phase} /> : <span className="text-sm font-semibold text-ink-3">{state.phase === 'lobby' ? 'Waiting room' : state.phase === 'standby' ? 'Participants are on standby' : state.phase === 'ended' ? 'Session ended' : 'Content slide'}</span>}
        <div className="flex items-center gap-3">
          {state.phase === 'open' && state.deadlineAt && <TimerRing openedAt={state.openedAt} deadlineAt={state.deadlineAt} now={now} className="w-14 text-[0.55rem]" />}
          {inActivity && interactive && (
            <p className="text-sm font-semibold text-ink-2" data-testid="answered">
              <span className="tabular text-lg font-extrabold text-ink">{counts.respondents}</span> of {counts.participants} answered
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="lg" disabled={!can('previous')} onClick={() => run('previous')} aria-label="Previous" data-testid="ctl-previous"><ChevronLeft className="size-5" aria-hidden /> Previous</Button>
        {primary && (
          <Button variant="primary" size="lg" className="min-w-44 flex-1" onClick={() => run(primary!.action)} disabled={!can(primary.action)} data-testid="ctl-primary">
            {primary.icon} {primary.label}
          </Button>
        )}
        {!(primary?.action === 'next') && state.phase !== 'ended' && (
          <Button variant="secondary" size="lg" disabled={!can('next')} onClick={() => run('next')} data-testid="ctl-next">Next <ChevronRight className="size-5" aria-hidden /></Button>
        )}
      </div>

      {inActivity && interactive && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3.5" aria-label="Activity controls">
          {primary?.action !== 'close' && primary?.action !== 'open' && (state.phase === 'open' ? <Btn action="close" testId="ctl-close"><Lock className="size-4" aria-hidden /> Close responses</Btn> : <Btn action="open" testId="ctl-open"><Unlock className="size-4" aria-hidden /> Reopen responses</Btn>)}
          {state.resultsVisible ? <Btn action="hideResults" testId="ctl-hide-results"><EyeOff className="size-4" aria-hidden /> Hide results</Btn> : <Btn action="revealResults" testId="ctl-reveal-results"><BarChart3 className="size-4" aria-hidden /> Show results</Btn>}
          {hasAnswer && (state.correctVisible ? <Btn action="hideCorrect" testId="ctl-hide-correct"><EyeOff className="size-4" aria-hidden /> Hide answer</Btn> : <Btn action="revealCorrect" variant="soft" testId="ctl-reveal-correct"><Eye className="size-4" aria-hidden /> Reveal answer</Btn>)}
          {state.phase !== 'ready' && <Btn action="complete" testId="ctl-complete"><Square className="size-3.5" aria-hidden /> Finish activity</Btn>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3.5">
        {state.leaderboardVisible ? <Btn action="hideLeaderboard" testId="ctl-hide-leaderboard"><Medal className="size-4" aria-hidden /> Hide leaderboard</Btn> : <Btn action="showLeaderboard" testId="ctl-show-leaderboard"><Trophy className="size-4" aria-hidden /> Show leaderboard</Btn>}
        <Btn action="standby" testId="ctl-standby"><CirclePause className="size-4" aria-hidden /> Standby screen</Btn>
        {snap.session.mode === 'companion' && state.phase === 'lobby' && <span className="text-sm text-ink-3">Launch an activity from the list to begin.</span>}
      </div>
    </div>
  );
}
