import { ChevronDown, Compass, Lightbulb, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { TourId } from '@/tour/routes';
import { useTour } from '@/tour/TourProvider';

export interface HelpSection {
  id: string;
  title: string;
  icon: LucideIcon;
  body: ReactNode;
}

export const P = ({ children, className }: { children: ReactNode; className?: string }) => <p className={cn('text-[1rem] leading-relaxed text-ink-2', className)}>{children}</p>;
export const H3 = ({ children }: { children: ReactNode }) => <h3 className="mt-2 text-[1.0625rem] font-bold tracking-tight text-ink">{children}</h3>;
export const B = ({ children }: { children: ReactNode }) => <strong className="font-bold text-ink">{children}</strong>;

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="grid gap-2 text-[1rem] leading-relaxed text-ink-2">
      {items.map((t, i) => <li key={i} className="flex gap-2.5"><span className="mt-[0.7em] size-1.5 shrink-0 rounded-full bg-accent" aria-hidden /><span className="min-w-0">{t}</span></li>)}
    </ul>
  );
}

export function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="grid gap-3">
      {items.map((t, i) => (
        <li key={i} className="flex gap-3.5">
          <span className="tabular grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-[0.9375rem] font-extrabold text-accent-ink" aria-hidden>{i + 1}</span>
          <span className="min-w-0 pt-0.5 text-[1rem] leading-relaxed text-ink-2">{t}</span>
        </li>
      ))}
    </ol>
  );
}

export function Tip({ children, title = 'Good to know' }: { children: ReactNode; title?: string }) {
  return (
    <aside className="flex gap-3 rounded-2xl bg-accent-soft/70 px-4 py-3.5 text-accent-ink">
      <Lightbulb className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="grid gap-0.5 text-[0.9375rem] leading-relaxed"><p className="font-bold">{title}</p><div>{children}</div></div>
    </aside>
  );
}

export function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="group rounded-2xl border border-line bg-surface px-4 py-3 open:shadow-sm" data-testid="faq">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[1rem] font-semibold text-ink marker:hidden [&::-webkit-details-marker]:hidden">
        {q}
        <ChevronDown className="size-4 shrink-0 text-ink-3 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="grid gap-2 pt-2.5 text-[1rem] leading-relaxed text-ink-2">{children}</div>
    </details>
  );
}

/** Starts a live tour on the real page (going there first when needed). */
export function TourButton({ id, children, variant = 'primary' }: { id: TourId; children: ReactNode; variant?: 'primary' | 'secondary' }) {
  const { start } = useTour();
  return <Button variant={variant} onClick={() => start(id)} data-testid={`tour-start-${id}`}><Compass className="size-4" aria-hidden /> {children}</Button>;
}

export const TextLink = ({ to, children }: { to: string; children: ReactNode }) => (
  <Link to={to} className="font-semibold text-accent-ink underline decoration-accent/40 underline-offset-2 hover:decoration-accent">{children}</Link>
);

export const Kbd = ({ children }: { children: ReactNode }) => <kbd className="rounded-md border border-line-2 bg-paper px-1.5 py-0.5 text-[0.8125rem] font-semibold text-ink">{children}</kbd>;
