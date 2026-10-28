/**
 * Simple, visible branching: a quiz may say "if fewer than N% get this right, go to slide X; otherwise go to slide Y".
 * Live, the class's correct rate decides (the presenter can always override). Self-paced, the person's own answer does.
 * No variables, no loops: one rule per question, shown in the editor and on the presenter's lesson flow.
 */
import type { QuizConfig } from './schema';

export type BranchRule = NonNullable<QuizConfig['branch']>;

export interface BranchDecision {
  /** Slide id to go to, or null to carry on to the next slide in order. */
  targetId: string | null;
  /** Which side of the threshold was taken. */
  side: 'below' | 'atOrAbove' | null;
  reason: string;
}

/** `rate` is 0–1 (share correct); null when nobody answered, in which case the rule does not apply. */
export function decideBranch(rule: BranchRule | undefined, rate: number | null): BranchDecision {
  if (!rule) return { targetId: null, side: null, reason: '' };
  if (rate === null) return { targetId: null, side: null, reason: 'Nobody answered, so the branch rule does not apply.' };
  const pct = Math.round(rate * 100);
  const below = pct < rule.threshold;
  const targetId = (below ? rule.below : rule.atOrAbove) ?? null;
  return {
    targetId,
    side: below ? 'below' : 'atOrAbove',
    reason: `${pct}% correct, ${below ? 'below' : 'at or above'} ${rule.threshold}%`,
  };
}

export function describeBranch(rule: BranchRule, titleOf: (id: string) => string): string {
  const parts: string[] = [];
  if (rule.below) parts.push(`under ${rule.threshold}% correct → ${titleOf(rule.below)}`);
  if (rule.atOrAbove) parts.push(`${rule.threshold}% or more → ${titleOf(rule.atOrAbove)}`);
  return parts.join('; ');
}
