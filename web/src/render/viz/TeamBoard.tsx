import { motion } from 'framer-motion';
import type { TeamStanding } from '@classinteract/shared';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { cn } from '@/lib/cn';

/** Teams are ranked by average points per member, so team size gives no advantage. */
export function TeamBoard({ teams, className, meTeamId }: { teams: TeamStanding[]; className?: string; meTeamId?: string }) {
  const max = Math.max(1, ...teams.map((t) => t.score));
  return (
    <ol className={cn('grid content-start gap-[0.7em]', className)} data-testid="team-board">
      {teams.map((t, i) => (
        <motion.li key={t.teamId} layout initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 28, delay: i * 0.06 }}
          className={cn('relative flex items-center gap-[0.9em] overflow-hidden rounded-[0.9em] border bg-surface px-[0.9em] py-[0.6em] text-[1.8em]', meTeamId === t.teamId ? 'border-accent' : 'border-line')}>
          <motion.span aria-hidden className="absolute inset-y-0 left-0 opacity-15" style={{ background: t.color }} initial={{ width: 0 }} animate={{ width: `${(t.score / max) * 100}%` }} transition={{ type: 'spring', stiffness: 110, damping: 20 }} />
          <span className="tabular relative grid size-[1.7em] shrink-0 place-items-center rounded-full text-[0.8em] font-extrabold text-white" style={{ background: t.color }}>{t.rank}</span>
          <span className="relative min-w-0 flex-1 truncate font-bold">{t.name}<span className="ml-[0.5em] text-[0.6em] font-semibold text-ink-3">{t.members} {t.members === 1 ? 'member' : 'members'}</span></span>
          <span className="tabular relative shrink-0 text-right font-extrabold leading-tight">
            <AnimatedNumber value={t.score} format={(n) => n.toLocaleString()} />
            <span className="block text-[0.5em] font-semibold text-ink-3">avg · {t.total.toLocaleString()} total</span>
          </span>
        </motion.li>
      ))}
    </ol>
  );
}

