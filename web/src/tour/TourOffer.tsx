import { Compass } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { TourId } from './routes';
import { hasSeenTour, markTourSeen } from './seen';
import { useTour } from './TourProvider';

/** A one-time, in-page invitation to take a tour. It never covers anything and goes away for good once answered. */
export function TourOffer({ id, children }: { id: TourId; children: string }) {
  const { start, active } = useTour();
  const [open, setOpen] = useState(() => !hasSeenTour(id));
  if (!open || active) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-card bg-accent-soft px-4 py-3.5 text-accent-ink" role="region" aria-label="Tour" data-testid="tour-offer">
      <Compass className="size-5 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1 basis-56 text-[0.9375rem] font-semibold">{children}</p>
      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={() => { setOpen(false); start(id); }} data-testid="tour-offer-start">Take the tour</Button>
        <Button variant="ghost" size="sm" onClick={() => { markTourSeen(id); setOpen(false); }} data-testid="tour-offer-dismiss">Not now</Button>
      </div>
    </div>
  );
}
