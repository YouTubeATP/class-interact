import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const badgeVariants = cva('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold', {
  variants: {
    variant: {
      neutral: 'bg-ink/6 text-ink-2',
      accent: 'bg-accent-soft text-accent-ink',
      ok: 'bg-ok-soft text-ok-ink',
      warn: 'bg-warn-soft text-warn-ink',
      bad: 'bg-bad-soft text-bad-ink',
      tone: 'bg-tone text-tone-ink',
    },
  },
  defaultVariants: { variant: 'neutral' },
});

export function Badge({ className, variant, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
