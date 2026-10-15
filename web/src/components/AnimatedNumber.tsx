import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { useEffect } from 'react';

/** Counts smoothly from the previous value to the next one. */
export function AnimatedNumber({ value, className, format = (n: number) => String(n), duration = 0.7, testId }: { value: number; className?: string; format?: (n: number) => string; duration?: number; testId?: string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => format(Math.round(v)));
  useEffect(() => {
    if (reduce) { mv.set(value); return; }
    const controls = animate(mv, value, { duration, ease: [0.2, 0.8, 0.2, 1] });
    return () => controls.stop();
  }, [value, reduce, duration, mv]);
  return <motion.span className={className} data-testid={testId} data-value={value}>{text}</motion.span>;
}
