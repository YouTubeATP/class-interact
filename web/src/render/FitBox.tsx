import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Keeps content inside its box. Content is sized in `em`, so when it would overflow, the font size is reduced
 * just enough to fit (never below `min`), and the whole layout, spacing included, scales together.
 * Authors can write long instructions or six long answer options without the slide running off the screen,
 * and the projector, dashboard replica and editor preview all shrink by the same proportion.
 */
export function FitBox({ children, className, min = 0.5 }: { children: ReactNode; className?: string; min?: number }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Runs after every render: a new slide, new text or a resized stage can all change what fits.
  useLayoutEffect(() => {
    const box = outer.current;
    const content = inner.current;
    if (!box || !content) return;
    const fit = () => {
      let k = 1;
      for (let i = 0; i < 6; i++) {
        content.style.fontSize = `${k}em`;
        const overflowY = content.scrollHeight - box.clientHeight;
        const overflowX = content.scrollWidth - box.clientWidth;
        if (overflowY <= 1 && overflowX <= 1) break;
        const ratio = Math.min(overflowY > 1 ? box.clientHeight / content.scrollHeight : 1, overflowX > 1 ? box.clientWidth / content.scrollWidth : 1);
        const next = Math.max(min, k * ratio * 0.985);
        if (next >= k - 0.002 || k <= min) { k = Math.max(min, next); break; }
        k = next;
      }
      content.style.fontSize = `${k}em`;
      setScale((s) => (Math.abs(s - k) > 0.002 ? k : s));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  });

  return (
    <div ref={outer} className={cn('size-full overflow-hidden', className)}>
      <div ref={inner} className="size-full" style={{ fontSize: `${scale}em` }}>
        {children}
      </div>
    </div>
  );
}
