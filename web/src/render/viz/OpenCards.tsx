import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/cn';

const CARD_TONES = ['#ffe3d1', '#d9eaff', '#d5f2e3', '#fff0be', '#e6e1ff', '#ffdde5'];

/** Responses as cards. New cards pop in; the grid reflows with layout animation. */
export function OpenCards({ items, limit = 18, className, big = true }: { items: { id: string; text: string }[]; limit?: number; className?: string; big?: boolean }) {
  const shown = items.slice(0, limit);
  return (
    <div className={cn('columns-2 gap-[1em] [column-fill:balance]', className)}>
      <AnimatePresence initial={false}>
        {shown.map((it, i) => (
          <motion.figure
            key={it.id}
            layout
            initial={{ opacity: 0, scale: 0.85, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 280, damping: 24 }}
            className={cn('mb-[1em] break-inside-avoid rounded-[0.9em] p-[1em] font-semibold leading-snug text-ink', big ? 'text-[1.5em]' : 'text-[1.2em]')}
            style={{ background: CARD_TONES[hash(it.id) % CARD_TONES.length] }}
          >
            {it.text}
          </motion.figure>
        ))}
      </AnimatePresence>
      {items.length > limit && <p className="text-[1.1em] font-semibold text-ink-2">+ {items.length - limit} more</p>}
    </div>
  );
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
