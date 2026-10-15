import { cn } from '@/lib/cn';

/** The mark is a ticket stub: the product's one idea (join once, stay in) in a single shape. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('size-8', className)} aria-hidden>
      <rect width="64" height="64" rx="18" fill="var(--accent)" />
      <path d="M14 22a4 4 0 0 1 4-4h28a4 4 0 0 1 4 4v3a5 5 0 0 0 0 10v3a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4v-3a5 5 0 0 0 0-10z" fill="#fff" />
      <circle cx="32" cy="30" r="5" fill="var(--accent)" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 text-[1.0625rem] font-extrabold tracking-tight', className)}>
      <LogoMark />
      ClassInteract
    </span>
  );
}
