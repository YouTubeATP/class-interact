import { motion } from 'framer-motion';
import { Check, Crosshair } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { checkImageUrl, type HotspotRegion } from '@classinteract/shared';
import { cn } from '@/lib/cn';

/**
 * An image with points and regions placed in normalised coordinates (0–1 of the image's own width and height). The
 * box always has the image's natural aspect ratio, so a point lands on the same pixel of the picture on a phone, the
 * projector and the results page, whatever their sizes.
 */
export function HotspotImage({ url, alt, points = [], regions = [], picked, onPick, className, maxHeight, testId = 'hotspot-image' }: {
  url: string; alt: string;
  points?: { x: number; y: number; correct: boolean | null }[];
  regions?: HotspotRegion[];
  picked?: { x: number; y: number } | null;
  onPick?: (p: { x: number; y: number }) => void;
  className?: string;
  /** CSS length limiting the height (the width follows the aspect ratio). */
  maxHeight?: string;
  testId?: string;
}) {
  const [ratio, setRatio] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [focused, setFocused] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // keyboard / screen-reader alternative: a crosshair moved with the arrow keys, placed with Enter
  const [cursor, setCursor] = useState<{ x: number; y: number }>(picked ?? { x: 0.5, y: 0.5 });
  useEffect(() => { if (picked) setCursor(picked); }, [picked?.x, picked?.y]);
  const bad = checkImageUrl(url);

  const pick = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onPick || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    setCursor({ x, y });
    onPick({ x, y });
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!onPick) return;
    const step = e.shiftKey ? 0.1 : 0.02;
    const move: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (move[e.key]) {
      e.preventDefault();
      setCursor((c) => ({ x: Math.min(1, Math.max(0, c.x + move[e.key][0])), y: Math.min(1, Math.max(0, c.y + move[e.key][1])) }));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPick(cursor);
    }
  };
  const grid = (v: number) => `${Math.round(v * 100)}%`;

  if (bad || failed) return <div role="img" aria-label={alt} className={cn('grid aspect-video place-items-center rounded-[0.8em] bg-ink/5 text-ink-3', className)}>Image unavailable</div>;
  return (
    <div className={cn('mx-auto', className)} style={{ width: ratio && maxHeight ? `min(100%, calc(${maxHeight} * ${ratio}))` : '100%' }}>
      <div
        ref={box}
        className={cn('relative w-full select-none overflow-hidden rounded-[0.8em] bg-ink/5 ring-1 ring-line', onPick && 'cursor-crosshair touch-manipulation')}
        style={{ aspectRatio: ratio ? String(ratio) : '16 / 10' }}
        onPointerDown={onPick ? pick : undefined}
        onKeyDown={key}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        tabIndex={onPick ? 0 : -1}
        role={onPick ? 'application' : 'img'}
        aria-label={onPick ? `${alt}. Tap the spot, or use the arrow keys to move the marker and Enter to choose it. Marker at ${grid(cursor.x)} across, ${grid(cursor.y)} down.` : alt}
        data-testid={testId}
      >
        <img src={url} alt="" referrerPolicy="no-referrer" draggable={false} className="pointer-events-none absolute inset-0 size-full" onLoad={(e) => setRatio(e.currentTarget.naturalWidth / Math.max(1, e.currentTarget.naturalHeight))} onError={() => setFailed(true)} />
        {regions.map((r) => (
          <motion.span
            key={r.id}
            aria-hidden
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={cn('absolute border-[0.18em] border-ok bg-ok/20 shadow-[0_0_0_0.12em_rgb(255_255_255/.8)]', r.shape === 'ellipse' ? 'rounded-[50%]' : 'rounded-[0.3em]')}
            style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
            data-testid="hotspot-region"
          />
        ))}
        {points.map((p, i) => (
          <span
            key={i}
            aria-hidden
            className={cn('absolute size-[0.9em] -translate-x-1/2 -translate-y-1/2 rounded-full border-[0.12em] border-white', p.correct === true ? 'bg-ok' : p.correct === false ? 'bg-bad' : 'bg-accent')}
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, opacity: 0.75 }}
            data-testid="hotspot-point"
          />
        ))}
        {(picked || (onPick && focused)) && (
          <span aria-hidden className="absolute -translate-x-1/2 -translate-y-1/2 text-accent drop-shadow-[0_0_2px_white]" style={{ left: `${(focused ? cursor : picked ?? cursor).x * 100}%`, top: `${(focused ? cursor : picked ?? cursor).y * 100}%` }} data-testid="hotspot-marker">
            {picked && !focused ? <span className="grid size-8 place-items-center rounded-full bg-accent text-white ring-4 ring-white/80"><Check className="size-4" strokeWidth={3} /></span> : <Crosshair className="size-9" strokeWidth={2.5} />}
          </span>
        )}
      </div>
    </div>
  );
}
