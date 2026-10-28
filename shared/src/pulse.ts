/**
 * The understanding pulse: each participant can say "got it", "unsure" or "lost" at any time and change it whenever
 * they like. The presenter only ever sees counts and a trend, never who said what.
 */
import type { PulseSummary, PulseValue } from './protocol';

export interface PulseEventLite {
  at: number;
  value: PulseValue | '';
  previous: PulseValue | '';
}

const zero = () => ({ got: 0, unsure: 0, lost: 0 });

/** Counts now, plus one point per minute for the last `minutes` minutes, replayed from the change log. */
export function pulseSummary(current: Iterable<PulseValue>, events: PulseEventLite[], now: number, minutes = 20): PulseSummary {
  const counts = zero();
  for (const v of current) counts[v]++;
  const sorted = [...events].sort((a, b) => a.at - b.at);
  const running = zero();
  const start = Math.floor(now / 60_000) * 60_000 - (minutes - 1) * 60_000;
  const trend: PulseSummary['trend'] = [];
  let i = 0;
  for (let t = start; t <= now + 1; t += 60_000) {
    const until = Math.min(t + 60_000, now + 1);
    while (i < sorted.length && sorted[i].at < until) {
      const e = sorted[i++];
      if (e.previous) running[e.previous] = Math.max(0, running[e.previous] - 1);
      if (e.value) running[e.value]++;
    }
    trend.push({ t, ...running });
  }
  return { ...counts, total: counts.got + counts.unsure + counts.lost, trend };
}

export const PULSE_LABEL: Record<PulseValue, string> = { got: 'Got it', unsure: 'Unsure', lost: 'Lost' };
