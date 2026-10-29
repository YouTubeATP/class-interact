import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { RESIZE_EVENT } from '@/components/rich/events';
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
    // The scale is picked from fixed 2% steps; nothing may be clipped (at worst the slide is one step smaller). Replicas
    // lay the stage out at projector size (ReferenceStage), so they arrive at the same step as the projector.
    const fits = (k: number) => {
      content.style.fontSize = `${k}em`;
      return content.scrollHeight <= box.clientHeight && content.scrollWidth <= box.clientWidth;
    };
    const fit = () => {
      const steps = Math.round((1 - min) / 0.02);
      let k = 1;
      if (!fits(1)) {
        // largest step that fits (fitting only gets easier as the scale goes down)
        let lo = 1;
        let hi = steps;
        let best = steps;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (fits(1 - mid * 0.02)) { best = mid; hi = mid - 1; } else lo = mid + 1;
        }
        k = Math.max(min, 1 - best * 0.02);
      }
      content.style.fontSize = `${k}em`;
      setScale((s) => (Math.abs(s - k) > 0.002 ? k : s));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    // maths, code and chemical structures render asynchronously and change the content's size without a re-render here
    content.addEventListener(RESIZE_EVENT, fit);
    return () => { ro.disconnect(); content.removeEventListener(RESIZE_EVENT, fit); };
  });

  return (
    <div ref={outer} className={cn('size-full overflow-hidden', className)}>
      <div ref={inner} className="size-full" style={{ fontSize: `${scale}em` }}>
        {children}
      </div>
    </div>
  );
}
