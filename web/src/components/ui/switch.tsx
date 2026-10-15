import * as SwitchPrimitive from '@radix-ui/react-switch';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode, useId } from 'react';
import { cn } from '@/lib/cn';

export const Switch = forwardRef<ElementRef<typeof SwitchPrimitive.Root>, ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn('peer inline-flex h-6 w-10 shrink-0 items-center rounded-full border-2 border-transparent bg-line-2 transition-colors data-[state=checked]:bg-accent disabled:opacity-45', className)}
    {...props}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block size-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
  </SwitchPrimitive.Root>
));
Switch.displayName = 'Switch';

/** A switch with its label and an optional description, laid out as one row. */
export function SwitchRow({ label, hint, checked, onChange, disabled }: { label: ReactNode; hint?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <label htmlFor={id} className="grid cursor-pointer gap-0.5">
        <span className="text-sm font-semibold text-ink">{label}</span>
        {hint && <span className="text-[0.8125rem] text-ink-3">{hint}</span>}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
