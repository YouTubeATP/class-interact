import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Scales everything inside (sized in `em`) to the width of this box. One visualisation, many sizes:
 * the projector, presenter panel, results page and phone all reuse the same components.
 */
export function ScaleBox({ pct, children, className, style, fill = false }: { pct: number; children: ReactNode; className?: string; style?: CSSProperties; fill?: boolean }) {
  return (
    <div className={cn(fill && 'size-full', className)} style={{ containerType: 'inline-size', ...style }}>
      <div className={cn(fill && 'size-full')} style={{ fontSize: `${pct}cqw` }}>{children}</div>
    </div>
  );
}
