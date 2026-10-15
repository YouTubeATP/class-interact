import { motion } from 'framer-motion';
import { Check, CirclePause, Eye, Play } from 'lucide-react';
import { useState } from 'react';
import type { PresenterSnapshot } from '@classinteract/shared';
import { typeMeta } from '@/activities/meta';
import { Button } from '@/components/ui/button';
import { SwitchRow } from '@/components/ui/switch';
import { cn } from '@/lib/cn';
import { plural } from '@/lib/format';

/** Standalone: the whole sequence, click any slide to jump. */
export function LessonFlow({ snap, onGoto }: { snap: PresenterSnapshot; onGoto: (i: number) => void }) {
  const current = snap.state.phase !== 'lobby' && snap.state.phase !== 'standby' && snap.state.phase !== 'ended' ? snap.state.activityIndex : -1;
  return (
    <ol className="grid gap-1.5" aria-label="Lesson flow" data-testid="lesson-flow">
      {snap.outline.map((o) => {
        const m = typeMeta[o.type];
        const active = o.index === current;
        return (
          <li key={o.key}>
            <button type="button" onClick={() => onGoto(o.index)} disabled={!snap.available.includes('goto') || active} data-tone={o.type} data-testid="flow-item" aria-current={active}
              className={cn('flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors disabled:cursor-default', active ? 'border-accent bg-accent-soft' : 'border-transparent hover:bg-ink/5')}>
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-tone text-tone-ink"><m.icon className="size-4" aria-label={m.label} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.8125rem] font-semibold leading-tight">{o.title || m.label}</span>
                <span className="tabular text-xs text-ink-3">{o.index + 1}{o.interactive && o.responses > 0 ? `  ·  ${plural(o.responses, 'response')}` : ''}</span>
              </span>
              {o.completed && !active && <Check className="size-4 shrink-0 text-ok" aria-label="Completed" />}
              {active && <motion.span layoutId="flow-dot" className="size-2 shrink-0 rounded-full bg-accent" />}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** Companion: pick any activity, any time. Slides are optional extras. */
export function ActivityLauncher({ snap, onGoto, onStandby }: { snap: PresenterSnapshot; onGoto: (i: number) => void; onStandby: () => void }) {
  const [showSlides, setShowSlides] = useState(false);
  const showing = snap.state.phase !== 'lobby' && snap.state.phase !== 'standby' && snap.state.phase !== 'ended' ? snap.state.activityIndex : -1;
  const items = snap.outline.filter((o) => showSlides || o.interactive);
  const onStandbyNow = snap.state.phase === 'standby' || snap.state.phase === 'lobby';
  return (
    <div className="grid gap-3" data-testid="activity-launcher">
      <Button variant={onStandbyNow ? 'soft' : 'secondary'} size="lg" className="w-full" onClick={onStandby} disabled={!snap.available.includes('standby')} data-testid="standby">
        <CirclePause className="size-4" aria-hidden /> {onStandbyNow ? 'Participants are on standby' : 'Back to standby'}
      </Button>
      <ul className="grid gap-2">
        {items.map((o) => {
          const m = typeMeta[o.type];
          const active = o.index === showing;
          return (
            <motion.li key={o.key} layout data-tone={o.type} className={cn('grid gap-2 rounded-2xl border bg-surface p-3', active ? 'border-accent shadow-[0_0_0_3px_var(--accent-soft)]' : 'border-line')} data-testid="launch-card">
              <div className="flex items-start gap-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-tone text-tone-ink"><m.icon className="size-[1.1rem]" aria-label={m.label} /></span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[0.8125rem] font-bold leading-snug">{o.title || m.label}</p>
                  <p className="text-xs text-ink-3">{active ? 'On screen now' : o.completed ? `Ran, ${plural(o.responses, 'response')}` : o.interactive ? 'Not run yet' : 'Content slide'}</p>
                </div>
              </div>
              <Button variant={o.completed ? 'secondary' : 'primary'} size="sm" disabled={active || !snap.available.includes('goto')} onClick={() => onGoto(o.index)}>
                {o.completed ? <><Eye className="size-3.5" aria-hidden /> Show results</> : <><Play className="size-3.5" aria-hidden /> {o.interactive ? 'Launch' : 'Show'}</>}
              </Button>
            </motion.li>
          );
        })}
        {items.length === 0 && <li className="rounded-2xl border border-dashed border-line-2 p-4 text-center text-sm text-ink-3">This presentation has no interactive activities.</li>}
      </ul>
      <SwitchRow label="Include content slides" checked={showSlides} onChange={setShowSlides} />
    </div>
  );
}
