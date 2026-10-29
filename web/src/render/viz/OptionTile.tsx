import { Check, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { OPTION_COLORS, letter } from '@/activities/meta';
import { cn } from '@/lib/cn';

export type TileState = 'idle' | 'selected' | 'correct' | 'wrong' | 'dim';

/** An answer option. On the projector it is display-only; on phones it is the tap target. */
export function OptionTile({ index, text, count, total, state = 'idle', onClick, disabled, delay = 0, size = 'stage', checkbox = false, card = false }: {
  index: number; text: React.ReactNode; count?: number; total?: number; state?: TileState; onClick?: () => void; disabled?: boolean; delay?: number; size?: 'stage' | 'phone';
  /** A tall tile with the content centred under the letter: for options that are a picture, such as a chemical structure. */
  card?: boolean;
  /** Several answers can apply: shows a tick box that fills when selected. */
  checkbox?: boolean;
}) {
  const c = OPTION_COLORS[index % OPTION_COLORS.length];
  const pct = count !== undefined && total ? (count / total) * 100 : 0;
  const interactive = !!onClick;
  const Tag = interactive ? motion.button : motion.div;
  return (
    <Tag
      {...(interactive ? (checkbox ? { type: 'button' as const, onClick, disabled, role: 'checkbox', 'aria-checked': state === 'selected' } : { type: 'button' as const, onClick, disabled, 'aria-pressed': state === 'selected' }) : {})}
      className={cn(
        'relative flex w-full overflow-hidden text-left',
        card ? 'h-full flex-wrap content-start items-start' : 'items-center',
        size === 'stage' ? 'gap-[0.9em] rounded-[1em] px-[1em] py-[0.8em] text-[1.9em]' : 'min-h-[4.25rem] gap-3.5 rounded-2xl px-4 py-3 text-[1.0625rem]',
        interactive && 'active:scale-[0.985]',
      )}
      style={{ ...(size === 'stage' ? { ['--mol-bond-solo' as string]: card ? '1.35em' : '0.95em', ['--mol-bond-inline' as string]: '0.6em' } : {}), backgroundColor: c.bg, color: c.ink, boxShadow: state === 'selected' || state === 'correct' ? `0 0 0 ${size === 'stage' ? '0.14em' : '3px'} ${state === 'correct' ? 'var(--color-ok)' : c.strong}` : 'none' }}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: state === 'dim' ? 0.4 : 1, y: 0, scale: state === 'correct' ? 1.015 : 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26, delay }}
      whileTap={interactive && !disabled ? { scale: 0.975 } : undefined}
    >
      {count !== undefined && (
        <motion.span aria-hidden className="absolute inset-y-0 left-0 opacity-30" style={{ background: c.strong }} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 120, damping: 22 }} />
      )}
      <span className={cn('relative grid shrink-0 place-items-center rounded-[0.55em] font-extrabold text-white', size === 'stage' ? 'size-[1.7em] text-[0.8em]' : 'size-9 text-base')} style={{ background: c.strong }}>
        {letter(index)}
      </span>
      <span className={cn('relative min-w-0 flex-1 font-semibold leading-snug', card && 'order-last grid basis-full place-items-center pt-[0.2em]')}>{text}</span>
      {count !== undefined && (
        <span className={cn('tabular relative shrink-0 font-bold', size === 'stage' ? 'text-[0.8em]' : 'text-sm')}>{count}</span>
      )}
      {checkbox && interactive && (
        <span aria-hidden className={cn('relative grid shrink-0 place-items-center rounded-[0.4em] border-2 transition-colors', size === 'stage' ? 'size-[1.1em]' : 'size-7', state === 'selected' ? 'border-transparent text-white' : 'border-current/40 text-transparent')} style={state === 'selected' ? { background: c.strong } : undefined}>
          <Check className="size-[70%]" strokeWidth={3.4} />
        </span>
      )}
      {state === 'correct' && (
        <motion.span className="relative grid shrink-0 place-items-center rounded-full bg-ok text-white" style={{ width: size === 'stage' ? '1.3em' : '2rem', height: size === 'stage' ? '1.3em' : '2rem' }} initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 18, delay: 0.1 }}>
          <Check className="size-[65%]" strokeWidth={3.2} aria-label="Correct answer" />
        </motion.span>
      )}
      {state === 'wrong' && (
        <motion.span className="relative grid shrink-0 place-items-center rounded-full bg-bad text-white" style={{ width: size === 'stage' ? '1.3em' : '2rem', height: size === 'stage' ? '1.3em' : '2rem' }} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }}>
          <X className="size-[65%]" strokeWidth={3.2} aria-label="Incorrect answer" />
        </motion.span>
      )}
    </Tag>
  );
}
