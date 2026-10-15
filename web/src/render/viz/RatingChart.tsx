import { motion } from 'framer-motion';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { cn } from '@/lib/cn';

/** Vertical distribution with the average called out. */
export function RatingChart({ distribution, average, total, minLabel, maxLabel, mine, className }: {
  distribution: { value: number; count: number }[]; average: number | null; total: number; minLabel?: string; maxLabel?: string; mine?: number | null; className?: string;
}) {
  const max = Math.max(1, ...distribution.map((d) => d.count));
  return (
    <div className={cn('grid gap-[1em]', className)}>
      <div className="flex items-end justify-between gap-[1em]">
        <div>
          <div className="display tabular text-[4.2em] leading-none text-tone-ink">
            {average === null ? '–' : <AnimatedNumber value={average * 10} format={(n) => (n / 10).toFixed(1)} />}
          </div>
          <div className="mt-[0.2em] text-[1.3em] font-semibold text-ink-2">average from {total} {total === 1 ? 'response' : 'responses'}</div>
        </div>
      </div>
      <div className="flex h-[11em] items-end gap-[0.6em]" role="img" aria-label="Rating distribution">
        {distribution.map((d, i) => (
          <div key={d.value} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-[0.4em]">
            <span className="tabular text-[1.3em] font-bold text-ink-2">{d.count}</span>
            <motion.div className={cn('w-full rounded-t-[0.5em]', mine === d.value ? 'bg-ink' : 'bg-tone-strong')} initial={{ height: 0 }} animate={{ height: `${Math.max(d.count ? 6 : 2, (d.count / max) * 78)}%` }} transition={{ type: 'spring', stiffness: 120, damping: 18, delay: i * 0.04 }} style={{ opacity: d.count ? 1 : 0.25 }} />
            <span className="tabular text-[1.5em] font-extrabold leading-none">{d.value}</span>
          </div>
        ))}
      </div>
      {(minLabel || maxLabel) && (
        <div className="flex justify-between text-[1.2em] font-semibold text-ink-2">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      )}
    </div>
  );
}
