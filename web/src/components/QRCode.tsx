import QR from 'qrcode';
import { useMemo } from 'react';

/** Crisp, scannable QR code as inline SVG (no network, no canvas). */
export function QRCode({ value, className, label = 'QR code to join the session' }: { value: string; className?: string; label?: string }) {
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

  if (!value) return <div className={className} aria-hidden />;
  const quiet = 2;
  return (
    <svg viewBox={`${-quiet} ${-quiet} ${size + quiet * 2} ${size + quiet * 2}`} className={className} role="img" aria-label={label} data-value={value} shapeRendering="crispEdges">
      <rect x={-quiet} y={-quiet} width={size + quiet * 2} height={size + quiet * 2} fill="#fff" />
      <path d={d} fill="#161b33" />
    </svg>
  );
}
