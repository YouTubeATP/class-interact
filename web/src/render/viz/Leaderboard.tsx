import { motion } from 'framer-motion';
import type { Standing } from '@classinteract/shared';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { cn } from '@/lib/cn';

const MEDAL = ['#ffe08a', '#dfe3ee', '#f2c9a4'];

/** Ranked list. Rows slide to their new position when scores change (layout animation). */
export function Leaderboard({ standings, meId, limit = 8, className }: { standings: Standing[]; meId?: string; limit?: number; className?: string }) {
  const shown = standings.slice(0, limit);
  return (
    <ol className={cn('grid gap-[0.6em]', className)}>
      {shown.map((s, i) => (
        <motion.li
          key={s.participantId}
          layout
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28, delay: i * 0.06 }}
          className={cn('flex items-center gap-[0.9em] rounded-[0.9em] border px-[0.9em] py-[0.55em] text-[1.7em]', meId === s.participantId ? 'border-accent bg-accent-soft' : 'border-line bg-surface')}
        >
          <span className="tabular grid size-[1.7em] shrink-0 place-items-center rounded-full text-[0.8em] font-extrabold" style={{ background: MEDAL[s.rank - 1] ?? 'var(--color-paper)' }}>
            {s.rank}
          </span>
          <span className="min-w-0 flex-1 truncate font-bold">{s.name}{meId === s.participantId && <span className="ml-[0.4em] text-[0.6em] font-semibold text-accent-ink">You</span>}</span>
          <span className="tabular shrink-0 font-extrabold">
            <AnimatedNumber value={s.score} format={(n) => n.toLocaleString()} />
          </span>
        </motion.li>
      ))}
    </ol>
  );
}
