import { AnimatePresence, motion } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { Ack, MySubmission, ParticipantSnapshot, PublicActivity } from '@classinteract/shared';
import { typeMeta } from '@/activities/meta';
import { TimerBar } from '@/components/Countdown';
import { cn } from '@/lib/cn';

export interface ParticipantCtx {
  snap: ParticipantSnapshot;
  activity: PublicActivity;
  /** Submissions for this activity: the server's, plus any accepted a moment ago. */
  mine: MySubmission[];
  now: () => number;
  send: (payload: unknown) => Promise<Ack<{ submission: MySubmission }>>;
}

export const PCtx = createContext<ParticipantCtx | null>(null);
export const useP = () => {
  const c = useContext(PCtx);
  if (!c) throw new Error('useP outside provider');
  return c;
};

/** Submit helper with pending + error state. Vibrates lightly on success where supported. */
export function useSubmit() {
  const { send } = useP();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async (payload: unknown): Promise<boolean> => {
      setPending(true);
      setError(null);
      const ack = await send(payload);
      setPending(false);
      if (ack.ok) {
        try { navigator.vibrate?.(14); } catch { /* not supported */ }
        return true;
      }
      setError(ack.message);
      return false;
    },
    [send],
  );
  return { run, pending, error, clearError: () => setError(null) };
}

const PHASE_COPY: Record<string, string> = { ready: 'Get ready', open: 'Open', closed: 'Closed', revealed: 'Results', completed: 'Finished' };

/** Frame for an interactive activity on the phone: type chip, phase, timer, question, content. */
export function ActivityShell({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  const { snap, activity, now } = useP();
  const m = typeMeta[activity.type];
  const { state } = snap;
  return (
    <div className="flex min-h-full flex-1 flex-col" data-testid={`participant-${activity.type}`}>
      <div className="grid gap-4">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-tone px-3 py-1 text-[0.8125rem] font-bold text-tone-ink">
            <m.icon className="size-3.5" aria-hidden /> {m.label}
          </span>
          <span className="text-[0.8125rem] font-semibold text-ink-3" data-testid="participant-phase">{PHASE_COPY[state.phase]}</span>
        </div>
        {state.phase === 'open' && state.deadlineAt && <TimerBar openedAt={state.openedAt} deadlineAt={state.deadlineAt} now={now} />}
        <h2 className="display text-[1.65rem] leading-[1.12]" data-testid="participant-question">{title}</h2>
      </div>
      <div className="mt-5 flex flex-1 flex-col gap-4">{children}</div>
      {footer && <div className="safe-bottom sticky bottom-0 -mx-4 mt-6 bg-gradient-to-t from-paper from-70% to-transparent px-4 pt-6">{footer}</div>}
    </div>
  );
}

export function BigButton({ children, loading, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <motion.button
      type="button"
      whileTap={props.disabled ? undefined : { scale: 0.97 }}
      className={cn('flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-[1.0625rem] font-bold text-white shadow-[0_10px_24px_-12px_var(--accent)] transition-opacity disabled:opacity-40', className)}
      {...(props as object)}
    >
      {loading && <Loader2 className="size-5 animate-spin" aria-hidden />}
      {children}
    </motion.button>
  );
}

export function ErrorLine({ message }: { message: string | null }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.p initial={{ opacity: 0, y: -6, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} exit={{ opacity: 0, height: 0 }} role="alert" className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-sm font-semibold text-bad">
          {message}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

/** "Response received" confirmation with a springy check. */
export function Received({ title = 'Response received', hint, pending }: { title?: string; hint?: string; pending?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 320, damping: 24 }} className="flex items-center gap-3 rounded-2xl bg-ok-soft px-4 py-3.5 text-[#0b4a30]" data-testid="received" role="status">
      <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 520, damping: 16, delay: 0.1 }} className="grid size-9 shrink-0 place-items-center rounded-full bg-ok text-white">
        <Check className="size-5" strokeWidth={3} aria-hidden />
      </motion.span>
      <div className="grid">
        <span className="font-bold">{pending ? 'Sent — waiting for approval' : title}</span>
        {hint && <span className="text-sm opacity-80">{hint}</span>}
      </div>
    </motion.div>
  );
}

export function WaitingDots({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)} aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span key={i} className="size-2.5 rounded-full bg-accent" animate={{ y: [0, -7, 0], opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.14, ease: 'easeInOut' }} />
      ))}
    </span>
  );
}
