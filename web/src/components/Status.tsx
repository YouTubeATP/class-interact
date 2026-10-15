import { Loader2, WifiOff } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import type { ConnectionStatus } from '@/lib/session-client';
import { cn } from '@/lib/cn';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-ink-3', className)} aria-label="Loading" />;
}

export function ConnectionBanner({ status, className }: { status: ConnectionStatus; className?: string }) {
  const show = status === 'reconnecting' || status === 'connecting';
  return (
    <AnimatePresence>
      {show && (
        <motion.div role="status" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className={cn('flex items-center justify-center gap-2 bg-warn-soft px-4 py-2 text-sm font-semibold text-warn', className)}>
          <WifiOff className="size-4" aria-hidden />
          {status === 'connecting' ? 'Connecting…' : 'Connection lost. Reconnecting — you will not lose your place.'}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Centered message for empty / error / ended states. */
export function Notice({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-md justify-items-center gap-3 px-6 py-16 text-center">
      {icon && <div className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent-ink">{icon}</div>}
      <h2 className="text-xl">{title}</h2>
      {children && <div className="text-[0.9375rem] text-ink-2">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
