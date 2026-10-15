import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Ambient motion: slow, low-contrast movement that makes a waiting screen feel alive without
 * competing with content. Every loop is skipped when the user prefers reduced motion.
 */

/** A soft light that breathes in and out. Place it behind the thing it should draw the eye to. */
export function BreathingGlow({ className, duration = 5.5, from = 0.35, to = 0.8, grow = 1.14, delay = 0 }: { className?: string; duration?: number; from?: number; to?: number; grow?: number; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      aria-hidden
      className={cn('pointer-events-none absolute rounded-full bg-accent blur-[3em]', className)}
      animate={reduce ? { opacity: (from + to) / 2 } : { scale: [1, grow, 1], opacity: [from, to, from] }}
      transition={{ duration, repeat: Infinity, ease: 'easeInOut', delay }}
    />
  );
}

/** A shape that drifts on a slow Lissajous-like path. */
export function DriftingShape({ className, dx = 24, dy = 16, duration = 18, delay = 0, spin = 0, children }: { className?: string; dx?: number; dy?: number; duration?: number; delay?: number; spin?: number; children?: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      aria-hidden
      className={cn('pointer-events-none absolute', className)}
      animate={reduce ? undefined : { x: [0, dx, 0, -dx, 0], y: [0, -dy, dy, -dy * 0.4, 0], rotate: spin ? [0, spin, 0, -spin, 0] : 0 }}
      transition={{ duration, repeat: Infinity, ease: 'easeInOut', delay }}
    >
      {children}
    </motion.div>
  );
}

/** A thin light that sweeps down the QR code now and then, like a scanner. */
export function ScanSweep({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <motion.span
      aria-hidden
      className={cn('pointer-events-none absolute inset-x-0 h-[14%] bg-gradient-to-b from-transparent via-accent/45 to-transparent', className)}
      initial={{ top: '-14%', opacity: 0 }}
      animate={{ top: ['-14%', '100%'], opacity: [0, 1, 1, 0] }}
      transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 2.4, ease: 'easeInOut', times: [0, 0.15, 0.85, 1] }}
    />
  );
}

/** Full-screen ambient backdrop for phone-sized screens (join page, waiting room). */
export function AmbientBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <DriftingShape className="-left-24 -top-20 size-80 rounded-full bg-accent-soft" dx={34} dy={26} duration={20} />
      <DriftingShape className="-bottom-28 -right-20 size-96 rounded-full bg-tone opacity-70" dx={-30} dy={22} duration={24} delay={2} />
      <BreathingGlow className="left-1/2 top-[44%] size-72 -translate-x-1/2 -translate-y-1/2 opacity-30" from={0.12} to={0.3} duration={6} />
    </div>
  );
}
