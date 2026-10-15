import * as LabelPrimitive from '@radix-ui/react-label';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const Label = forwardRef<ElementRef<typeof LabelPrimitive.Root>, ComponentPropsWithoutRef<typeof LabelPrimitive.Root>>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn('text-[0.8125rem] font-semibold text-ink', className)} {...props} />
));
Label.displayName = 'Label';

/** Label + control + hint/error, the standard form row. */
export function Field({ label, hint, error, htmlFor, children, className }: { label?: ReactNode; hint?: ReactNode; error?: string | null; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      {label && <Label htmlFor={htmlFor}>{label}</Label>}
      {children}
      {error ? <p className="text-[0.8125rem] text-bad" role="alert">{error}</p> : hint ? <p className="text-[0.8125rem] text-ink-3">{hint}</p> : null}
    </div>
  );
}
