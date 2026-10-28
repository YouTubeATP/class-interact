import QR from 'qrcode';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';

/** Modules of white border around the code. The QR specification asks for four; scanners struggle with less. */
export const QR_QUIET_ZONE = 4;

/**
 * Crisp, scannable QR code as inline SVG (no network, no canvas).
 *
 * Always dark modules on solid white with the full quiet zone, whatever the surrounding theme: a scanner across a
 * classroom needs contrast, not style. With `snap`, the code is sized to a whole number of screen pixels per module
 * (measured from the box it sits in), so a projector never blurs module edges by resampling a fractional size.
 */
export function QRCode({ value, className, label = 'QR code to join the session', snap = false }: { value: string; className?: string; label?: string; snap?: boolean }) {
  const { size, d } = useMemo(() => {
    if (!value) return { size: 0, d: '' };
    const qr = QR.create(value, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    let path = '';
    for (let y = 0; y < n; y++) {
      let x = 0;
      while (x < n) {
        if (!qr.modules.get(x, y)) { x++; continue; }
        let run = 1;
        while (x + run < n && qr.modules.get(x + run, y)) run++;
        path += `M${x} ${y}h${run}v1h-${run}z`;
        x += run;
      }
    }
    return { size: n, d: path };
  }, [value]);

  const box = useRef<HTMLDivElement>(null);
  const [px, setPx] = useState<number | null>(null);
  const total = size + QR_QUIET_ZONE * 2;

  useLayoutEffect(() => {
    if (!snap || !box.current || !total) return;
    const el = box.current;
    const fit = () => {
      const w = el.clientWidth;
      const dpr = window.devicePixelRatio || 1;
      // whole device pixels per module, never larger than the box
      const perModule = Math.floor((w * dpr) / total);
      setPx(perModule >= 1 ? (perModule * total) / dpr : w);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [snap, total]);

  if (!value) return <div className={className} aria-hidden />;
  const q = QR_QUIET_ZONE;
  const svg = (
    <svg
      viewBox={`${-q} ${-q} ${total} ${total}`}
      className={snap ? 'block' : className}
      style={snap ? { width: px ?? '100%', height: px ?? 'auto', aspectRatio: '1 / 1' } : undefined}
      role="img"
      aria-label={label}
      data-value={value}
      data-testid="qr-code"
      shapeRendering="crispEdges"
    >
      <rect x={-q} y={-q} width={total} height={total} fill="#ffffff" />
      <path d={d} fill="#000000" />
    </svg>
  );
  if (!snap) return svg;
  return (
    <div ref={box} className={className} style={{ display: 'grid', placeItems: 'center' }}>
      {svg}
    </div>
  );
}
