import { AnimatePresence, motion } from 'framer-motion';
import { CameraOff, Loader2, X } from 'lucide-react';
import jsQR from 'jsqr';
import { useEffect, useRef, useState } from 'react';
import { parseJoinCode } from '@/lib/joinCode';
import { Button } from './ui/button';

type Problem = 'insecure' | 'denied' | 'nocamera' | 'other';

const COPY: Record<Problem, string> = {
  insecure: 'The camera needs a secure (https) connection. Use your phone’s camera app to scan the code, or type it in.',
  denied: 'Camera access was blocked. Allow it in your browser’s site settings, or type the code instead.',
  nocamera: 'No camera was found on this device. Type the code instead.',
  other: 'The camera could not be started. Type the code instead.',
};

/**
 * Full-screen QR scanner. Decodes on the device (nothing is uploaded) with jsQR, so it works in
 * every browser that can open the camera, including iOS Safari.
 */
export function QrScanner({ open, onClose, onCode }: { open: boolean; onClose: () => void; onCode: (pin: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [ready, setReady] = useState(false);
  const [unknown, setUnknown] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProblem(null);
    setReady(false);
    setUnknown(false);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { setProblem('insecure'); return; }

    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    let last = 0;
    let unknownTimer: ReturnType<typeof setTimeout> | undefined;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const v = video.current;
      if (stopped || !v || !ctx || v.readyState < 2 || t - last < 100) return; // ~10 scans per second
      last = t;
      const scale = Math.min(1, 640 / v.videoWidth);
      canvas.width = Math.round(v.videoWidth * scale);
      canvas.height = Math.round(v.videoHeight * scale);
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      if (!hit?.data) return;
      const pin = parseJoinCode(hit.data);
      if (pin) { stopped = true; try { navigator.vibrate?.(30); } catch { /* optional */ } onCode(pin); }
      else { setUnknown(true); clearTimeout(unknownTimer); unknownTimer = setTimeout(() => setUnknown(false), 2500); }
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false })
      .then((s) => {
        if (stopped) { s.getTracks().forEach((x) => x.stop()); return; }
        stream = s;
        const v = video.current;
        if (v) { v.srcObject = s; void v.play().then(() => setReady(true)).catch(() => setProblem('other')); }
        raf = requestAnimationFrame(tick);
      })
      .catch((e: DOMException) => setProblem(e.name === 'NotAllowedError' || e.name === 'SecurityError' ? 'denied' : e.name === 'NotFoundError' || e.name === 'OverconstrainedError' ? 'nocamera' : 'other'));

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      clearTimeout(unknownTimer);
      stream?.getTracks().forEach((x) => x.stop());
    };
  }, [open, onCode]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div role="dialog" aria-modal="true" aria-label="Scan the QR code" data-testid="scan-overlay" className="fixed inset-0 z-50 grid bg-ink" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          <video ref={video} playsInline muted autoPlay className="absolute inset-0 size-full object-cover" />

          {!problem && (
            <>
              {/* the dimmed frame: a clear square cut out of a dark overlay */}
              <div className="pointer-events-none absolute left-1/2 top-[42%] size-[min(72vw,22rem)] -translate-x-1/2 -translate-y-1/2 rounded-3xl shadow-[0_0_0_100vmax_rgb(13_17_36/0.62)]" aria-hidden>
                {(['left-0 top-0 border-l-4 border-t-4 rounded-tl-3xl', 'right-0 top-0 border-r-4 border-t-4 rounded-tr-3xl', 'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-3xl', 'bottom-0 right-0 border-b-4 border-r-4 rounded-br-3xl'] as const).map((c, i) => (
                  <motion.span key={i} className={`absolute size-10 border-white drop-shadow-[0_0_3px_rgb(13_17_36/0.85)] ${c}`} animate={{ opacity: [0.6, 1, 0.6], scale: [1, 1.06, 1] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.15 }} />
                ))}
                <motion.span className="absolute inset-x-3 h-[3px] rounded-full bg-accent shadow-[0_0_14px_3px_var(--accent),0_0_0_1px_rgb(255_255_255/0.85)]" initial={{ top: '8%' }} animate={{ top: ['8%', '92%', '8%'] }} transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }} />
              </div>
              <div className="absolute inset-x-0 bottom-[10%] grid justify-items-center gap-3 px-6 text-center text-white">
                {!ready && <Loader2 className="size-6 animate-spin" aria-hidden />}
                <p className="text-lg font-semibold" aria-live="polite">{unknown ? 'That is not a ClassInteract code.' : ready ? 'Point your camera at the QR code on the screen' : 'Starting the camera…'}</p>
              </div>
            </>
          )}

          {problem && (
            <div className="relative grid place-content-center justify-items-center gap-4 bg-ink px-8 text-center text-white" data-testid="scan-problem" role="alert">
              <span className="grid size-14 place-items-center rounded-2xl bg-white/10"><CameraOff className="size-7" aria-hidden /></span>
              <p className="max-w-xs text-[1.0625rem] leading-snug">{COPY[problem]}</p>
              <Button variant="secondary" size="lg" onClick={onClose}>Type the code instead</Button>
            </div>
          )}

          <button type="button" onClick={onClose} aria-label="Close scanner" data-testid="scan-close" className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] grid size-11 place-items-center rounded-full bg-black/45 text-white backdrop-blur">
            <X className="size-5" aria-hidden />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
