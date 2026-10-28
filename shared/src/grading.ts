/**
 * Deterministic grading for typed answers, numbers and image hotspots. No AI is involved: the same answer always
 * gets the same grade, and every grade comes with a plain explanation. Answers that are *nearly* right (one typo,
 * a rounding difference) are flagged for the teacher to review rather than silently accepted or rejected.
 */
import type { HotspotRegion, QuizConfig } from './schema';

export interface Grade {
  correct: boolean;
  /** Not correct, but close enough that a person should decide. */
  review: boolean;
  detail: string;
}

type TypedRules = Pick<QuizConfig, 'caseSensitive' | 'whitespace'>;

export function normalizeTyped(input: string, rules: Partial<TypedRules>): string {
  let t = input.normalize('NFKC').replace(/[​-‍﻿]/g, '');
  const ws = rules.whitespace ?? 'normalize';
  if (ws === 'normalize') t = t.trim().replace(/\s+/g, ' ');
  else if (ws === 'ignore') t = t.replace(/\s+/g, '');
  if (!rules.caseSensitive) t = t.toLocaleLowerCase();
  return t;
}

/** Edit distance counting a swap of two neighbouring letters as one edit ("whlie" → "while"). Stops early past `cap`. */
export function editDistance(a: string, b: string, cap = 8): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > cap) return cap + 1;
  }
  return d[a.length][b.length];
}

/** How many characters may differ before an answer is no longer "nearly right". */
const typoAllowance = (len: number) => (len < 4 ? 0 : len < 9 ? 1 : 2);

export function gradeText(c: TypedRules & { acceptedAnswers: string[] }, answer: string): Grade {
  const given = normalizeTyped(answer, c);
  const accepted = c.acceptedAnswers.map((a) => ({ raw: a, norm: normalizeTyped(a, c) }));
  const hit = accepted.find((a) => a.norm === given);
  if (hit) return { correct: true, review: false, detail: `Matches the accepted answer “${hit.raw}”.` };

  // differs only in letter case or spacing, while the rules ask for an exact match: let a person decide
  if (c.caseSensitive || (c.whitespace ?? 'normalize') === 'exact') {
    const loose = normalizeTyped(answer, { caseSensitive: false, whitespace: 'ignore' });
    const near = accepted.find((a) => normalizeTyped(a.raw, { caseSensitive: false, whitespace: 'ignore' }) === loose);
    if (near) return { correct: false, review: true, detail: `Same as “${near.raw}” except for capital letters or spacing.` };
  }
  let best: { raw: string; d: number } | null = null;
  for (const a of accepted) {
    const d = editDistance(given, a.norm, 3);
    if (!best || d < best.d) best = { raw: a.raw, d };
  }
  if (best && best.d > 0 && best.d <= typoAllowance(Math.max(given.length, normalizeTyped(best.raw, c).length))) {
    return { correct: false, review: true, detail: `Close to “${best.raw}” (${best.d} character${best.d === 1 ? '' : 's'} different).` };
  }
  return { correct: false, review: false, detail: 'Does not match any accepted answer.' };
}

/**
 * Reads a typed number: "3.5", "-2", "1,000", "1e-3", "3/4", "12 cm" (when the unit is cm). Returns null when the
 * text is not a single number. Commas are thousands separators only in the 1,234,567 pattern, never decimals.
 */
export function parseNumber(raw: string, unit = ''): number | null {
  let t = raw.normalize('NFKC').trim().replace(/−/g, '-');
  if (unit) {
    const u = unit.trim().toLowerCase();
    if (u && t.toLowerCase().endsWith(u)) t = t.slice(0, t.length - u.length);
  }
  t = t.replace(/\s+/g, '');
  if (/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
  if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) {
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  const frac = /^([-+]?\d+)\/(\d+)$/.exec(t);
  if (frac && Number(frac[2]) !== 0) return Number(frac[1]) / Number(frac[2]);
  return null;
}

export function numericTolerance(n: NonNullable<QuizConfig['numeric']>): number {
  return Math.max(n.tolerance ?? 0, (Math.abs(n.value) * (n.tolerancePercent ?? 0)) / 100);
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(10))));

export function gradeNumeric(n: NonNullable<QuizConfig['numeric']>, value: number): Grade {
  const tol = numericTolerance(n);
  const diff = Math.abs(value - n.value);
  const eps = 1e-9 * Math.max(1, Math.abs(n.value));
  const target = `${fmt(n.value)}${n.unit ? ` ${n.unit}` : ''}`;
  if (diff <= tol + eps) {
    return { correct: true, review: false, detail: tol > 0 ? `Within ${fmt(tol)} of ${target}.` : `Equals ${target}.` };
  }
  // just outside the window (or a rounding slip on an exact answer): a person decides
  const nearWindow = tol > 0 ? 2 * tol : Math.max(Math.abs(n.value) * 0.01, eps);
  if (diff <= nearWindow + eps) return { correct: false, review: true, detail: `Close to ${target} (off by ${fmt(diff)}, allowed ${fmt(tol)}).` };
  return { correct: false, review: false, detail: `Expected ${target}${tol > 0 ? ` ± ${fmt(tol)}` : ''}; off by ${fmt(diff)}.` };
}

export function inRegion(r: Pick<HotspotRegion, 'shape' | 'x' | 'y' | 'w' | 'h'>, px: number, py: number): boolean {
  if (r.shape === 'ellipse') {
    const rx = r.w / 2;
    const ry = r.h / 2;
    const dx = (px - (r.x + rx)) / rx;
    const dy = (py - (r.y + ry)) / ry;
    return dx * dx + dy * dy <= 1;
  }
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

export function gradeHotspot(regions: HotspotRegion[], x: number, y: number): Grade {
  const hit = regions.find((r) => inRegion(r, x, y));
  if (hit) return { correct: true, review: false, detail: hit.label ? `Inside “${hit.label}”.` : 'Inside a correct region.' };
  // a tap just outside a region's edge (within 3% of the image) is worth a second look
  const near = regions.find((r) => inRegion({ ...r, x: r.x - 0.03, y: r.y - 0.03, w: r.w + 0.06, h: r.h + 0.06 }, x, y));
  if (near) return { correct: false, review: true, detail: `Just outside ${near.label ? `“${near.label}”` : 'a correct region'}.` };
  return { correct: false, review: false, detail: 'Outside every correct region.' };
}
