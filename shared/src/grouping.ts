/**
 * Grouping free-text answers beyond exact matching. The baseline (`normalizeKey`) already ignores case, punctuation
 * and spacing. Here we only *suggest* further merges, with a reason, for the presenter to accept or reject: accents
 * ("café" / "cafe"), simple plurals ("cell" / "cells") and one-letter typos in longer words. Nothing is merged
 * silently, and the original answers are always kept.
 */
import { editDistance } from './grading';

export interface TermLike {
  key: string;
  label: string;
  count: number;
}

export interface MergeSuggestion {
  into: string;
  keys: string[];
  labels: string[];
  reason: string;
}

export const foldAccents = (s: string) => s.normalize('NFD').replace(/\p{M}+/gu, '');

function singular(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.length > 4 && /(ches|shes|sses|xes|zes)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !/(ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

const stem = (key: string) => foldAccents(key).split(' ').map(singular).join(' ');

/** `merged`: keys already merged by the presenter (left out of new suggestions). `rejected`: pairs not to suggest again. */
export function suggestMerges(terms: TermLike[], merged: Record<string, string> = {}, rejected: Set<string> = new Set()): MergeSuggestion[] {
  const free = terms.filter((t) => !(t.key in merged));
  const used = new Set<string>();
  const out: MergeSuggestion[] = [];
  const add = (group: TermLike[], reason: string) => {
    const keys = group.map((g) => g.key);
    const sig = [...keys].sort().join('|');
    if (group.length < 2 || rejected.has(sig)) return;
    keys.forEach((k) => used.add(k));
    const into = [...group].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))[0];
    out.push({ into: into.key, keys, labels: group.map((g) => g.label), reason });
  };
  // same once accents are removed or plurals reduced
  const byStem = new Map<string, TermLike[]>();
  for (const t of free) byStem.set(stem(t.key), [...(byStem.get(stem(t.key)) ?? []), t]);
  for (const group of byStem.values()) {
    if (group.length < 2) continue;
    const accentsOnly = new Set(group.map((g) => foldAccents(g.key))).size === 1;
    add(group, accentsOnly ? 'Same word with and without accents' : 'Singular and plural of the same word');
  }
  // one-letter typos in words of six letters or more
  const rest = free.filter((t) => !used.has(t.key));
  for (let i = 0; i < rest.length; i++) {
    for (let j = i + 1; j < rest.length; j++) {
      const a = rest[i];
      const b = rest[j];
      if (used.has(a.key) || used.has(b.key)) continue;
      if (Math.min(a.key.length, b.key.length) < 6 || /\d/.test(a.key + b.key)) continue;
      if (editDistance(a.key, b.key, 1) === 1) add([a, b], 'Looks like a typo (one letter different)');
    }
  }
  return out.slice(0, 20);
}

/** Apply presenter merges to a submission key (following chains, never looping). */
export function mergedKey(key: string, merges: Record<string, string>): string {
  let k = key;
  for (let i = 0; i < 5 && merges[k] && merges[k] !== k; i++) k = merges[k];
  return k;
}
