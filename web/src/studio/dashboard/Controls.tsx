import { motion } from 'framer-motion';
import { BarChart3, ChevronLeft, ChevronRight, CirclePause, Eye, EyeOff, GitBranch, Lock, Medal, Play, Repeat, Square, Trophy, Unlock, Users } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { RUN_SCORING_LABEL, type ActionType, type PresenterCommand, type PresenterSnapshot, type RunScoring } from '@classinteract/shared';
import { TimerRing } from '@/components/Countdown';
import { Button } from '@/components/ui/button';
import { DialogContent } from '@/components/ui/dialog';
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
          <span className={cn('relative rounded-full px-3 py-1 text-xs font-bold transition-colors', i === idx ? 'text-white' : i < idx ? 'bg-accent-soft text-accent-ink' : 'bg-ink/6 text-ink-3')} data-active={i === idx} aria-current={i === idx ? 'step' : undefined}>
            {i === idx && <motion.span layoutId="phase-pill" className="absolute inset-0 rounded-full bg-accent" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
            <span className="relative">{s.label}</span>
          </span>
          {i < STEPS.length - 1 && <span className="h-px w-3 bg-line-2" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

/** "Run again": the earlier responses stay; the presenter decides explicitly what the new round does to scores. */
export function RunAgainDialog({ open, onOpenChange, onRun, scored }: { open: boolean; onOpenChange: (o: boolean) => void; onRun: (s: Exclude<RunScoring, 'counted'>) => void; scored: boolean }) {
  const [choice, setChoice] = useState<Exclude<RunScoring, 'counted'>>('practice');
  const options: Exclude<RunScoring, 'counted'>[] = scored ? ['practice', 'replace', 'add'] : ['practice'];
  return (
    <DialogContent open={open} onOpenChange={onOpenChange} title="Run this activity again" description="A new round with fresh responses. The earlier responses are kept, and the results page compares the rounds.">
      <div className="grid gap-4">
        {scored && (
          <div role="radiogroup" aria-label="Points for this round" className="grid gap-2">
            {options.map((o) => (
              <button key={o} type="button" role="radio" aria-checked={choice === o} onClick={() => setChoice(o)} data-testid={`run-scoring-${o}`}
                className={cn('rounded-xl border-2 px-3.5 py-2.5 text-left text-sm font-semibold transition-colors', choice === o ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-2')}>
                {RUN_SCORING_LABEL[o]}
                <span className="block text-xs font-medium text-ink-2">{o === 'practice' ? 'Safest: nobody earns points twice.' : o === 'replace' ? 'Each person’s latest attempt counts for this question.' : 'People can earn this question’s points again.'}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => { onRun(scored ? choice : 'practice'); onOpenChange(false); }} data-testid="run-again-confirm"><Repeat className="size-4" aria-hidden /> Start round</Button>
        </div>
      </div>
    </DialogContent>
  );
}

export function Controls({ snap, run, send, now, size = 'desktop' }: { snap: PresenterSnapshot; run: (type: ActionType) => void; send: (c: PresenterCommand) => Promise<boolean>; now: () => number; size?: 'desktop' | 'remote' }) {
  const { state, available, activity, behavior, counts } = snap;
  const [again, setAgain] = useState(false);
  const can = (a: ActionType) => available.includes(a);
  const interactive = !!behavior?.interactive;
  const hasAnswer = !!behavior?.hasCorrectAnswer;
  const inActivity = !!activity && state.phase !== 'standby' && state.phase !== 'lobby' && state.phase !== 'ended';
  const standalone = snap.session.mode === 'standalone';
  const navigate = snap.staff.permissions.includes('navigate');
  const remote = size === 'remote';
  const big = remote ? 'xl' : 'lg';
  const branch = snap.branch;
  const branchTarget = branch?.targetIndex != null ? snap.outline[branch.targetIndex] : null;

  // the one button you most likely want next
  let primary: { label: string; action: ActionType; icon: ReactNode } | null = null;
  if (state.phase === 'lobby') primary = standalone ? { label: 'Start presentation', action: 'start', icon: <Play className="size-5" aria-hidden /> } : null;
  else if (inActivity && interactive && state.phase === 'ready') primary = { label: 'Open responses', action: 'open', icon: <Unlock className="size-5" aria-hidden /> };
  else if (inActivity && interactive && state.phase === 'open') primary = { label: 'Close responses', action: 'close', icon: <Lock className="size-5" aria-hidden /> };
  else if (inActivity && interactive && state.phase === 'closed') primary = hasAnswer ? { label: 'Reveal answer', action: 'revealCorrect', icon: <Eye className="size-5" aria-hidden /> } : { label: 'Show results', action: 'revealResults', icon: <BarChart3 className="size-5" aria-hidden /> };
  else if (standalone && can('next') && state.phase !== 'ended') primary = { label: branchTarget ? `Next: ${branchTarget.title.slice(0, 28)}` : 'Next', action: 'next', icon: <ChevronRight className="size-5" aria-hidden /> };

  const Btn = ({ action, children, variant = 'secondary', testId }: { action: ActionType; children: ReactNode; variant?: 'secondary' | 'soft' | 'primary'; testId?: string }) => (
    <Button variant={variant} size={remote ? 'lg' : 'md'} disabled={!can(action) || !navigate} onClick={() => run(action)} data-testid={testId ?? `ctl-${action}`} className={remote ? 'flex-1 basis-[46%]' : undefined}>{children}</Button>
  );

  if (!navigate) {
    return (
      <div className="grid gap-2 rounded-card border border-line bg-surface p-4 text-sm text-ink-2" data-testid="controls" data-phase={state.phase}>
        <p className="font-semibold text-ink">You are moderating</p>
        <p>The presenter controls what is on screen. Use the panels to approve responses and questions.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 rounded-card border border-line bg-surface p-4" data-testid="controls" data-tour="dash-controls" data-phase={state.phase}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {inActivity && interactive ? <PhaseTrack phase={state.phase} /> : <span className="text-sm font-semibold text-ink-3">{state.phase === 'lobby' ? 'Waiting room' : state.phase === 'standby' ? 'Participants are on standby' : state.phase === 'ended' ? 'Session ended' : 'Content slide'}</span>}
        <div className="flex items-center gap-3">
          {snap.run && snap.run.count > 1 && <span className="rounded-full bg-ink/6 px-2.5 py-1 text-xs font-bold text-ink-2" data-testid="run-badge">Round {snap.run.number} of {snap.run.count}{snap.run.scoring === 'practice' ? ' · practice' : ''}</span>}
          {state.phase === 'open' && state.deadlineAt && <TimerRing openedAt={state.openedAt} deadlineAt={state.deadlineAt} now={now} className={remote ? 'w-16 text-[0.65rem]' : 'w-14 text-[0.55rem]'} />}
          {inActivity && interactive && (
            <p className="text-sm font-semibold text-ink-2" data-testid="answered">
              <span className="tabular text-lg font-extrabold text-ink">{counts.respondents}</span> of {counts.participants} answered
            </p>
          )}
          {!inActivity && <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-2"><Users className="size-4" aria-hidden /> <span className="tabular">{counts.online}</span> online</p>}
        </div>
      </div>

      {branch && branch.side && (
        <p className="flex items-start gap-2 rounded-xl bg-accent-soft px-3 py-2 text-sm font-semibold text-accent-ink" data-testid="branch-suggestion">
          <GitBranch className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{branch.reason}: {branchTarget ? <>Next goes to “{branchTarget.title}”.</> : 'carry on in order.'}</span>
        </p>
      )}

      <div className={cn('flex flex-wrap items-center gap-2', remote && 'grid grid-cols-2')}>
        {standalone && <Button variant="secondary" size={big} disabled={!can('previous')} onClick={() => run('previous')} aria-label="Previous" data-testid="ctl-previous"><ChevronLeft className="size-5" aria-hidden /> Previous</Button>}
        {primary && (
          <Button variant="primary" size={big} className={cn(remote ? 'col-span-2 row-start-1' : 'min-w-44 flex-1')} onClick={() => run(primary!.action)} disabled={!can(primary.action)} data-testid="ctl-primary">
            {primary.icon} <span className="truncate">{primary.label}</span>
          </Button>
        )}
        {standalone && !(primary?.action === 'next') && state.phase !== 'ended' && (
          <Button variant="secondary" size={big} disabled={!can('next')} onClick={() => run('next')} data-testid="ctl-next">Next <ChevronRight className="size-5" aria-hidden /></Button>
        )}
        {standalone && branchTarget && can('next') && <Button variant="ghost" size="sm" className={remote ? 'col-span-2' : undefined} onClick={() => void send({ cmd: 'nextPlain' })} data-testid="ctl-next-plain">Ignore the branch: next slide in order</Button>}
        {!standalone && !primary && inActivity && <p className="text-sm text-ink-3">Launch another activity from the list, or send participants back to standby.</p>}
      </div>

      {inActivity && interactive && (
        <div className={cn('flex flex-wrap items-center gap-2 border-t border-line pt-3.5', remote && 'gap-2')} aria-label="Activity controls">
          {primary?.action !== 'close' && primary?.action !== 'open' && (state.phase === 'open' ? <Btn action="close" testId="ctl-close"><Lock className="size-4" aria-hidden /> Close responses</Btn> : <Btn action="open" testId="ctl-open"><Unlock className="size-4" aria-hidden /> Reopen responses</Btn>)}
          {state.resultsVisible ? <Btn action="hideResults" testId="ctl-hide-results"><EyeOff className="size-4" aria-hidden /> Hide results</Btn> : <Btn action="revealResults" testId="ctl-reveal-results"><BarChart3 className="size-4" aria-hidden /> Show results</Btn>}
          {hasAnswer && (state.correctVisible ? <Btn action="hideCorrect" testId="ctl-hide-correct"><EyeOff className="size-4" aria-hidden /> Hide answer</Btn> : <Btn action="revealCorrect" variant="soft" testId="ctl-reveal-correct"><Eye className="size-4" aria-hidden /> Reveal answer</Btn>)}
          {state.phase !== 'ready' && <Btn action="complete" testId="ctl-complete"><Square className="size-3.5" aria-hidden /> Finish activity</Btn>}
          {state.phase !== 'ready' && state.phase !== 'open' && (
            <Button variant="secondary" size={remote ? 'lg' : 'md'} className={remote ? 'flex-1 basis-[46%]' : undefined} onClick={() => setAgain(true)} data-testid="ctl-run-again"><Repeat className="size-4" aria-hidden /> Run again</Button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3.5">
        {state.leaderboardVisible ? <Btn action="hideLeaderboard" testId="ctl-hide-leaderboard"><Medal className="size-4" aria-hidden /> Hide leaderboard</Btn> : <Btn action="showLeaderboard" testId="ctl-show-leaderboard"><Trophy className="size-4" aria-hidden /> Show leaderboard</Btn>}
        <Btn action="standby" testId="ctl-standby"><CirclePause className="size-4" aria-hidden /> Standby screen</Btn>
        {snap.session.mode === 'companion' && state.phase === 'lobby' && <span className="text-sm text-ink-3">Launch an activity from the list to begin.</span>}
      </div>
      <RunAgainDialog open={again} onOpenChange={setAgain} scored={hasAnswer && !!(snap.fullConfig as { scored?: boolean } | null)?.scored} onRun={(scoring) => void send({ cmd: 'runAgain', scoring })} />
    </div>
  );
}
