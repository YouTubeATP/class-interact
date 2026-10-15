import { motion } from 'framer-motion';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { OPTION_COLORS } from '@/activities/meta';
import { cn } from '@/lib/cn';

export interface BarItem {
  id: string;
  label: string;
  count: number;
  highlight?: boolean;
}

/** Horizontal bars with spring-animated widths and counting numbers. */
export function BarList({ items, total, mine = [], className }: { items: BarItem[]; total: number; mine?: string[]; className?: string }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <ul className={cn('grid gap-[0.75em]', className)}>
      {items.map((it, i) => {
        const c = OPTION_COLORS[i % OPTION_COLORS.length];
        const pct = total ? Math.round((it.count / total) * 100) : 0;
        const isMine = mine.includes(it.id);
        return (
          <motion.li key={it.id} className="grid gap-[0.3em]" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05, type: 'spring', stiffness: 260, damping: 26 }}>
            <div className="flex items-baseline justify-between gap-[1em] text-[1.45em] font-semibold leading-tight">
              <span className="min-w-0">
                {it.label}
                {isMine && <span className="ml-[0.5em] rounded-full bg-ink px-[0.55em] py-[0.05em] align-middle text-[0.62em] font-bold text-white">You</span>}
              </span>
              <span className="tabular shrink-0 text-ink-2">
                <AnimatedNumber value={it.count} className="font-bold text-ink" /> <span className="text-[0.8em]">({pct}%)</span>
              </span>
            </div>
            <div className="h-[0.9em] overflow-hidden rounded-full bg-ink/7">
              <motion.div className="h-full rounded-full" style={{ background: c.strong }} initial={{ width: 0 }} animate={{ width: `${(it.count / max) * 100}%` }} transition={{ type: 'spring', stiffness: 110, damping: 20 }} />
            </div>
          </motion.li>
        );
      })}
    </ul>
  );
}
