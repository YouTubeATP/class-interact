import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/** Controlled modal (Radix Dialog) with an animated surface; exit animations play because it stays mounted while closing. */
export function DialogContent({ open, onOpenChange, title, description, children, className, wide }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children: ReactNode; className?: string; wide?: boolean }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
    <AnimatePresence>
      {open && (
        <DialogPrimitive.Portal forceMount>
          <DialogPrimitive.Overlay asChild forceMount>
            <motion.div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} />
          </DialogPrimitive.Overlay>
          <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4">
            <DialogPrimitive.Content asChild forceMount>
              <motion.div
                className={cn('pointer-events-auto relative w-full rounded-[1.5rem] border border-line bg-surface p-6 shadow-[0_30px_80px_-30px_rgb(22_27_51/.45)]', wide ? 'max-w-3xl' : 'max-w-lg', className)}
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              >
                <div className="mb-5 grid gap-1 pr-8">
                  <DialogPrimitive.Title className="text-xl font-bold tracking-tight">{title}</DialogPrimitive.Title>
                  {description ? <DialogPrimitive.Description className="text-sm text-ink-2">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
                </div>
                {children}
                <DialogPrimitive.Close className="absolute right-4 top-4 grid size-8 pointer-coarse:size-11 place-items-center rounded-full text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink" aria-label="Close">
                  <X className="size-4" />
                </DialogPrimitive.Close>
              </motion.div>
            </DialogPrimitive.Content>
          </div>
        </DialogPrimitive.Portal>
      )}
    </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
