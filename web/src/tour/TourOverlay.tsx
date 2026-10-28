import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import type { TourId } from './routes';
import { TOURS, type TourStep } from './tours';

interface Box { left: number; top: number; width: number; height: number }

const targetNames = (s: TourStep): string[] => (s.target === undefined ? [] : Array.isArray(s.target) ? s.target : [s.target]);

function isShown(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none';
}

/** The first of the step's targets that is actually on screen (a layout may hide some, e.g. the preview below xl). */
function findTarget(step: TourStep): HTMLElement | null {
  for (const n of targetNames(step)) {
    for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${n}"]`)) if (isShown(el)) return el;
  }
  return null;
}

const MARGIN = 12;
const GAP = 14;

/** Puts the card beside the lit-up element where it fits; on phones it docks to the top or bottom, away from the element. */
function place(box: Box | null, w: number, h: number, vw: number, vh: number): { left: number; top: number } {
  if (!box) return { left: (vw - w) / 2, top: Math.max(MARGIN, (vh - h) / 2) };
  const lower = box.top + box.height / 2 > vh / 2;
  if (vw < 640) return { left: MARGIN, top: lower ? MARGIN : Math.max(MARGIN, vh - h - MARGIN) };
  const cx = box.left + box.width / 2;
  const clampX = (x: number) => Math.min(Math.max(MARGIN, x), vw - w - MARGIN);
  const clampY = (y: number) => Math.min(Math.max(MARGIN, y), vh - h - MARGIN);
  if (box.top + box.height + GAP + h <= vh - MARGIN) return { left: clampX(cx - w / 2), top: box.top + box.height + GAP };
  if (box.top - GAP - h >= MARGIN) return { left: clampX(cx - w / 2), top: box.top - GAP - h };
  if (box.left + box.width + GAP + w <= vw - MARGIN) return { left: box.left + box.width + GAP, top: clampY(box.top) };
  if (box.left - GAP - w >= MARGIN) return { left: box.left - GAP - w, top: clampY(box.top) };
  return { left: clampX(cx - w / 2), top: lower ? MARGIN : Math.max(MARGIN, vh - h - MARGIN) };
}

/**
 * A guided tour over the real page: the element being explained is lit up, everything else is dimmed, and a card says
 * what it is for. It follows the element as the page scrolls or resizes, and works from the keyboard
 * (arrows to move, Esc to leave).
 */
export default function TourOverlay({ id, onClose }: { id: TourId; onClose: (finished: boolean) => void }) {
  const tour = TOURS[id];
  const titleId = useId();
  const [i, setI] = useState(0);
  const dir = useRef(1);
  const [ready, setReady] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [cardH, setCardH] = useState(200);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const step = tour.steps[i];
  const last = i === tour.steps.length - 1;
  const close = useCallback(() => onClose(true), [onClose]);

  const advance = useCallback((delta: number) => {
    dir.current = delta;
    if (delta > 0 && i >= tour.steps.length - 1) return close();
    setI((cur) => Math.min(tour.steps.length - 1, Math.max(0, cur + delta)));
  }, [i, tour, close]);

  // Arriving at a step: switch the editor pane on phones, wait for the target to appear, bring it into view.
  useEffect(() => {
    let dead = false;
    let timer: ReturnType<typeof setTimeout>;
    setReady(false);
    setBox(null);
    const s = tour.steps[i];
    if (s.pane) {
      const nav = document.querySelector<HTMLElement>(`[data-testid="editor-nav-${s.pane}"]`);
      if (nav && isShown(nav)) nav.click();
    }
    const started = performance.now();
    const wantsTarget = targetNames(s).length > 0;
    const tick = () => {
      if (dead) return;
      const el = wantsTarget ? findTarget(s) : null;
      if (wantsTarget && !el && performance.now() - started < 1500) { timer = setTimeout(tick, 60); return; }
      if (wantsTarget && !el && s.optional) { advance(dir.current >= 0 ? 1 : (i > 0 ? -1 : 1)); return; }
      el?.scrollIntoView({ block: 'center', inline: 'nearest' });
      setReady(true);
    };
    timer = setTimeout(tick, s.pane ? 150 : 0);
    return () => { dead = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, tour]);

  // Follow the element while the page scrolls, animates or is resized.
  useEffect(() => {
    if (!ready) return;
    let raf = 0;
    let prev = '';
    const loop = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const el = targetNames(step).length ? findTarget(step) : null;
      let b: Box | null = null;
      if (el) {
        const r = el.getBoundingClientRect();
        const pad = 8;
        const l = Math.max(4, r.left - pad);
        const t = Math.max(4, r.top - pad);
        const rr = Math.min(vw - 4, r.right + pad);
        const bb = Math.min(vh - 4, r.bottom + pad);
        if (rr > l && bb > t) b = { left: l, top: t, width: rr - l, height: bb - t };
      }
      const sig = `${b ? [b.left, b.top, b.width, b.height].map(Math.round).join(',') : 'none'}|${vw}x${vh}`;
      if (sig !== prev) { prev = sig; setBox(b); setVp({ w: vw, h: vh }); }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [ready, step]);

  useLayoutEffect(() => {
    const h = cardRef.current?.offsetHeight;
    if (h && Math.abs(h - cardH) > 1) setCardH(h);
  });

  useEffect(() => { if (ready) nextRef.current?.focus({ preventScroll: true }); }, [ready, i]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); advance(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); advance(-1); }
      else if (e.key === 'Tab') {
        // keep keyboard focus on the card: the page underneath is out of reach while the tour runs
        const items = Array.from(cardRef.current?.querySelectorAll<HTMLElement>('button') ?? []).filter((b) => getComputedStyle(b).visibility !== 'hidden');
        if (items.length === 0) return;
        const at = items.indexOf(document.activeElement as HTMLElement);
        if (at === -1) { e.preventDefault(); items[0].focus(); }
        else if (e.shiftKey && at === 0) { e.preventDefault(); items[items.length - 1].focus(); }
        else if (!e.shiftKey && at === items.length - 1) { e.preventDefault(); items[0].focus(); }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [advance, close]);

  const width = vp.w < 640 ? vp.w - MARGIN * 2 : 352;
  const pos = place(ready ? box : null, width, cardH, vp.w, vp.h);

  return createPortal(
    <div className="fixed inset-0 z-[90]" data-testid="tour" data-tour-id={id} data-step={i} data-ready={ready}>
      <div className="absolute inset-0" aria-hidden />
      {ready && box ? (
        <div aria-hidden data-testid="tour-spot" className="pointer-events-none absolute rounded-2xl transition-[left,top,width,height] duration-200 ease-out motion-reduce:transition-none" style={{ left: box.left, top: box.top, width: box.width, height: box.height, boxShadow: '0 0 0 3px var(--accent), 0 0 0 100vmax rgb(13 17 36 / 0.6)' }} />
      ) : (
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-stage-bg/60" />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid="tour-card"
        className="absolute grid gap-3 rounded-card border border-line bg-surface p-4 text-ink shadow-[0_24px_60px_-20px_rgb(13_17_36/.55)] outline-none transition-[left,top,opacity] duration-200 motion-reduce:transition-none"
        style={{ left: pos.left, top: pos.top, width, opacity: ready ? 1 : 0 }}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="tabular text-xs font-bold uppercase tracking-wide text-ink-3" data-testid="tour-progress">Step {i + 1} of {tour.steps.length}</p>
          <Button variant="ghost" size="icon-sm" onClick={close} aria-label="Leave the tour" data-testid="tour-skip"><X className="size-4" aria-hidden /></Button>
        </div>
        <div className="grid gap-1.5">
          <h2 id={titleId} className="text-[1.0625rem] font-bold leading-snug tracking-tight" data-testid="tour-title">{step.title}</h2>
          <p className="text-[0.9375rem] leading-relaxed text-ink-2">{step.body}</p>
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <Button variant="ghost" onClick={() => advance(-1)} className={i === 0 ? 'invisible' : undefined} tabIndex={i === 0 ? -1 : 0} data-testid="tour-back"><ArrowLeft className="size-4" aria-hidden /> Back</Button>
          <Button ref={nextRef} variant="primary" onClick={() => advance(1)} data-testid="tour-next">{last ? 'Done' : i === 0 && !step.target ? 'Show me' : 'Next'} {!last && <ArrowRight className="size-4" aria-hidden />}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
