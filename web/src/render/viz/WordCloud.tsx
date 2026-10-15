import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { colorFor } from '@/activities/meta';
import { cn } from '@/lib/cn';

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

let ctx2d: CanvasRenderingContext2D | null = null;
function measure(text: string, size: number): number {
  ctx2d ??= document.createElement('canvas').getContext('2d');
  if (!ctx2d) return text.length * size * 0.6;
  ctx2d.font = `800 ${size}px "Inter Variable", Inter, system-ui, sans-serif`;
  return ctx2d.measureText(text).width;
}

/** Spiral packing: biggest words first, each placed on the nearest free spot to the centre. */
export function layoutCloud(terms: Term[], W: number, H: number): Placed[] {
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

  const placed = useMemo(() => layoutCloud(terms.slice(0, 80), box.w, box.h), [terms, box.w, box.h, fontTick]);

  return (
    <div ref={ref} className={cn('relative size-full min-h-[6em]', className)} role="img" aria-label={`Word cloud: ${terms.slice(0, 8).map((t) => t.label).join(', ')}`}>
      {placed.map((p) => (
        <motion.span
          key={p.key}
          className="absolute left-0 top-0 whitespace-nowrap font-extrabold leading-[1.12] tracking-tight"
          style={{ color: colorFor(p.key), textShadow: mine.includes(p.key) ? '0 0 0 currentColor' : undefined, textDecoration: mine.includes(p.key) ? 'underline' : undefined, textUnderlineOffset: '0.12em', textDecorationThickness: '0.07em' }}
          initial={{ opacity: 0, scale: 0.4, x: p.x, y: p.y, fontSize: p.size }}
          animate={{ opacity: 1, scale: 1, x: p.x, y: p.y, fontSize: p.size }}
          transition={{ type: 'spring', stiffness: 130, damping: 18, mass: 0.9 }}
        >
          {p.label}
        </motion.span>
      ))}
    </div>
  );
}
