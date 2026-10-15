import { motion } from 'framer-motion';
import { ArrowRight, Check } from 'lucide-react';
import type { QuizConfig } from '@classinteract/shared';
import { OPTION_COLORS } from '@/activities/meta';
import { cn } from '@/lib/cn';

export type QuizView = NonNullable<QuizConfig['view']>;

/** Colour for the n-th item, cycling through the option palette. */
export const swatch = (i: number) => OPTION_COLORS[i % OPTION_COLORS.length];

const rise = (i: number) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { type: 'spring' as const, stiffness: 300, damping: 26, delay: i * 0.05 } });

/**
 * Projector view of a matching question. Before the reveal: the things to match, and the answers in a shuffled tray.
 * After: each left item beside its right item. Sized in `em` like the other stage views.
 */
export function MatchStage({ view, revealed }: { view: QuizView; revealed: boolean }) {
  const map = view.answerMap;
  if (revealed && map) {
    return (
      <ul className="grid gap-[0.7em] p-[0.15em]" data-testid="stage-match-answer">
        {view.lefts.map((l, i) => {
          const right = view.rights.find((r) => r.id === map[l.id]);
          const c = swatch(i);
          return (
            <motion.li key={l.id} {...rise(i)} className="grid grid-cols-[1fr_auto_1fr] items-center gap-[0.8em] text-[1.9em] font-semibold">
              <span className="rounded-[0.7em] px-[0.8em] py-[0.45em]" style={{ background: c.bg, color: c.ink }}>{l.text}</span>
              <span className="grid size-[1.4em] place-items-center rounded-full bg-ok text-white"><Check className="size-[70%]" strokeWidth={3.2} aria-label="Correct match" /></span>
              <span className="rounded-[0.7em] bg-ok-soft px-[0.8em] py-[0.45em] text-[#0b4a30]">{right?.text}</span>
            </motion.li>
          );
        })}
      </ul>
    );
  }
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-[1em] p-[0.15em]" data-testid="stage-match">
      <ul className="grid gap-[0.7em]" aria-label="Match these">
        {view.lefts.map((l, i) => (
          <motion.li key={l.id} {...rise(i)} className="rounded-[0.7em] px-[0.8em] py-[0.45em] text-[1.9em] font-semibold" style={{ background: swatch(i).bg, color: swatch(i).ink }}>{l.text}</motion.li>
        ))}
      </ul>
      <ArrowRight className="mt-[0.5em] size-[2.4em] text-ink-3" aria-hidden />
      <ul className="grid gap-[0.7em]" aria-label="With these">
        {view.rights.map((r, i) => (
          <motion.li key={r.id} {...rise(i + 2)} className="rounded-[0.7em] bg-surface px-[0.8em] py-[0.45em] text-[1.9em] font-semibold ring-[0.1em] ring-line-2">{r.text}</motion.li>
        ))}
      </ul>
    </div>
  );
}

/** Projector view of an ordering question: the items shuffled, then numbered in the right order once revealed. */
export function OrderStage({ view, revealed }: { view: QuizView; revealed: boolean }) {
  const key = view.answerOrder;
  const list = revealed && key ? key.map((id) => view.items.find((i) => i.id === id)!).filter(Boolean) : view.items;
  return (
    <ol className="grid gap-[0.7em] p-[0.15em]" data-testid={revealed && key ? 'stage-order-answer' : 'stage-order'}>
      {list.map((it, i) => (
        <motion.li key={it.id} layout {...rise(i)} className={cn('flex items-center gap-[0.8em] rounded-[0.7em] px-[0.8em] py-[0.45em] text-[1.9em] font-semibold', revealed && key ? 'bg-ok-soft text-[#0b4a30]' : 'bg-surface ring-[0.1em] ring-line-2')}>
          {revealed && key ? <span className="tabular grid size-[1.4em] shrink-0 place-items-center rounded-full bg-ok text-[0.8em] font-extrabold text-white">{i + 1}</span> : <span aria-hidden className="size-[0.5em] shrink-0 rounded-full" style={{ background: swatch(i).strong }} />}
          {it.text}
        </motion.li>
      ))}
    </ol>
  );
}
