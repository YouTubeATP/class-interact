import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

/** Remaining milliseconds until `deadlineAt` (server time), ticking ~10×/second. */
export function useRemaining(deadlineAt: number | null, now: () => number): number | null {
  const [remaining, setRemaining] = useState<number | null>(deadlineAt ? Math.max(0, deadlineAt - now()) : null);
  useEffect(() => {
    if (!deadlineAt) { setRemaining(null); return; }
    const tick = () => setRemaining(Math.max(0, deadlineAt - now()));
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [deadlineAt, now]);
  return remaining;
}

/** Circular countdown. Turns urgent and pulses in the last five seconds. */
export function TimerRing({ openedAt, deadlineAt, now, className }: { openedAt: number | null; deadlineAt: number | null; now: () => number; className?: string }) {
  const remaining = useRemaining(deadlineAt, now);
  if (remaining === null || !deadlineAt) return null;
  const total = Math.max(1, deadlineAt - (openedAt ?? deadlineAt - 20000));
  const fraction = Math.min(1, remaining / total);
  const secs = Math.ceil(remaining / 1000);
  const urgent = secs <= 5;
  const R = 44;
  const C = 2 * Math.PI * R;
  return (
    <motion.div className={cn('relative aspect-square', className)} animate={urgent && remaining > 0 ? { scale: [1, 1.06, 1] } : { scale: 1 }} transition={urgent ? { duration: 1, repeat: Infinity } : { duration: 0.2 }} role="timer" aria-label={`${secs} seconds left`}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={R} fill="var(--color-surface)" stroke="var(--color-line)" strokeWidth="8" />
        <circle cx="50" cy="50" r={R} fill="none" strokeWidth="8" strokeLinecap="round" stroke={urgent ? 'var(--color-bad)' : 'var(--accent)'} strokeDasharray={C} strokeDashoffset={C * (1 - fraction)} style={{ transition: 'stroke-dashoffset 0.12s linear, stroke 0.3s' }} />
      </svg>
      <span className={cn('tabular absolute inset-0 grid place-items-center text-[1.6em] font-extrabold', urgent ? 'text-bad' : 'text-ink')}>{secs}</span>
    </motion.div>
  );
}

/** Thin linear countdown for phones. */
export function TimerBar({ openedAt, deadlineAt, now }: { openedAt: number | null; deadlineAt: number | null; now: () => number }) {
  const remaining = useRemaining(deadlineAt, now);
  if (remaining === null || !deadlineAt) return null;
  const total = Math.max(1, deadlineAt - (openedAt ?? deadlineAt - 20000));
  const secs = Math.ceil(remaining / 1000);
  return (
    <div className="flex items-center gap-3" role="timer" aria-label={`${secs} seconds left`}>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink/8">
        <div className={cn('h-full rounded-full', secs <= 5 ? 'bg-bad' : 'bg-accent')} style={{ width: `${Math.min(100, (remaining / total) * 100)}%`, transition: 'width 0.12s linear' }} />
      </div>
      <span className={cn('tabular w-8 text-right text-sm font-bold', secs <= 5 && 'text-bad')}>{secs}s</span>
    </div>
  );
}
