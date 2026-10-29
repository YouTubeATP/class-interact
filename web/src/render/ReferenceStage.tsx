import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Lays the stage out at a projector-like reference size, then scales the result down to fit its box. A miniature
 * (the dashboard replica, the phone remote, the editor preview) is then an exact picture of the projector: line
 * breaks and fitted text sizes match, which they would not if the stage were laid out small, because borders, gaps
 * and text metrics do not shrink perfectly in proportion.
 */
export function ReferenceStage({ children, width = 1600 }: { children: ReactNode; width?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setK(Math.min(el.clientWidth / width, el.clientHeight / ((width * 9) / 16)) || 0);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div ref={box} className="relative size-full overflow-hidden">
      <div style={{ position: 'absolute', left: 0, top: 0, width, height: (width * 9) / 16, transform: `scale(${k})`, transformOrigin: '0 0', visibility: k ? 'visible' : 'hidden' }}>
        {children}
      </div>
    </div>
  );
}
