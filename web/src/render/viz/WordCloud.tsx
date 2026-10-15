import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { colorFor } from '@/activities/meta';
import { cn } from '@/lib/cn';

const VIRTUAL_W = 1000;

interface Term {
  key: string;
  label: string;
  count: number;
}
interface Placed extends Term {
  x: number;
  y: number;
  size: number;
}

/** Width in px of `text` set at `size` px. Supplied by the component, measured in the real DOM with the real font. */
export type Measure = (text: string, size: number) => number;

/**
 * Spiral packing: biggest words first, each placed on the nearest free spot to the centre.
 * Pure and scale-free: the caller lays out in a fixed virtual space and scales the result, so the same terms
 * pack identically on the projector, the dashboard replica and a thumbnail.
 */
export function layoutCloud(terms: Term[], W: number, H: number, measure: Measure): Placed[] {
  if (!W || !H || terms.length === 0) return [];
  const sorted = [...terms].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const maxC = sorted[0].count;
  const minC = sorted[sorted.length - 1].count;
  const maxSize = Math.min(H * 0.3, W * 0.13);
  const minSize = Math.max(13, Math.min(H * 0.085, W * 0.06));
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  const out: Placed[] = [];
  const pad = 6;

  for (const t of sorted) {
    const ratio = maxC === minC ? 0.55 : Math.sqrt((t.count - minC) / (maxC - minC));
    let size = minSize + (maxSize - minSize) * ratio;
    if (sorted.length <= 3 && maxC === minC) size = maxSize * 0.8;
    for (let attempt = 0; attempt < 9; attempt++) {
      const w = Math.min(measure(t.label, size), W - 8) + pad * 2;
      const h = size * 1.12 + pad;
      let found: { x: number; y: number } | null = null;
      for (let step = 0; step < 2600 && !found; step++) {
        const a = step * 0.42;
        const r = step * 0.55;
        const cx = W / 2 + r * Math.cos(a) * (W / H) * 0.85;
        const cy = H / 2 + r * Math.sin(a);
        const x = cx - w / 2;
        const y = cy - h / 2;
        if (x < 0 || y < 0 || x + w > W || y + h > H) continue;
        if (rects.every((o) => x + w <= o.x || o.x + o.w <= x || y + h <= o.y || o.y + o.h <= y)) found = { x, y };
      }
      if (found) {
        rects.push({ ...found, w, h });
        out.push({ ...t, x: found.x + pad, y: found.y + pad / 2, size });
        break;
      }
      size *= 0.86;
      if (size < 11) break;
    }
  }
  return out;
}

export function WordCloud({ terms, className, mine = [] }: { terms: Term[]; className?: string; mine?: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [fontTick, setFontTick] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { void document.fonts?.ready.then(() => setFontTick((n) => n + 1)); }, []);

  // Lay out in a 1000-unit-wide virtual space (so pixel constants never depend on screen size), then scale up.
  const scale = box.w / VIRTUAL_W;
  const placed = useMemo(() => {
    const el = probe.current;
    if (!el || !scale) return [];
    const measure: Measure = (text, size) => {
      el.style.fontSize = `${size * scale}px`; // measure at the real on-screen size
      el.textContent = text;
      return el.getBoundingClientRect().width / scale || 0; // and convert back into virtual units
    };
    const laid = layoutCloud(terms.slice(0, 80), VIRTUAL_W, box.h / scale, measure);
    el.textContent = ''; // the probe must not leave a stray copy of the last word in the page
    return laid;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terms, box.w, box.h, fontTick, scale]);

  return (
    <div ref={ref} className={cn('relative size-full min-h-[6em]', className)} role="img" aria-label={`Word cloud: ${terms.slice(0, 8).map((t) => t.label).join(', ')}`}>
      {/* off-screen probe: text is measured with the exact font the words are drawn in */}
      <span ref={probe} aria-hidden className="pointer-events-none invisible absolute left-0 top-0 whitespace-nowrap font-extrabold leading-[1.12] tracking-tight" />
      {placed.map((p) => (
        <motion.span
          key={p.key}
          className="absolute left-0 top-0 whitespace-nowrap font-extrabold leading-[1.12] tracking-tight"
          style={{ color: colorFor(p.key), textShadow: mine.includes(p.key) ? '0 0 0 currentColor' : undefined, textDecoration: mine.includes(p.key) ? 'underline' : undefined, textUnderlineOffset: '0.12em', textDecorationThickness: '0.07em' }}
          initial={{ opacity: 0, scale: 0.4, x: p.x * scale, y: p.y * scale, fontSize: p.size * scale }}
          animate={{ opacity: 1, scale: 1, x: p.x * scale, y: p.y * scale, fontSize: p.size * scale }}
          transition={{ type: 'spring', stiffness: 130, damping: 18, mass: 0.9 }}
        >
          {p.label}
        </motion.span>
      ))}
    </div>
  );
}
