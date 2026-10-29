import { numericTolerance, quizCorrectIds, quizKind, type QuizConfig } from '@classinteract/shared';

/** The answer key of a full (presenter-side, or revealed) quiz config, as readable lines. */
export function quizAnswerLines(c: QuizConfig): string[] {
  switch (quizKind(c)) {
    case 'match': return c.pairs.map((p) => `${p.left} → ${p.right}`);
    case 'order': return c.items.map((i, n) => `${n + 1}. ${i.text}`);
    case 'text': return c.acceptedAnswers;
    case 'numeric': {
      if (!c.numeric) return [];
      const tol = numericTolerance(c.numeric);
      return [`${c.numeric.value}${c.numeric.unit ? ` ${c.numeric.unit}` : ''}${tol ? ` (± ${Number(tol.toPrecision(6))})` : ''}`];
    }
    case 'hotspot': return c.regions.map((r, i) => r.label || `Region ${i + 1}`);
    default: return quizCorrectIds(c).flatMap((id) => c.options.find((o) => o.id === id)?.text ?? []);
  }
}

export const quizAnswerLabel = (c: QuizConfig): string => {
  const kind = quizKind(c);
  if (kind === 'match') return 'Correct matches';
  if (kind === 'order') return 'Correct order';
  if (kind === 'text') return c.acceptedAnswers.length > 1 ? 'Accepted answers' : 'Accepted answer';
  if (kind === 'hotspot') return 'Correct regions';
  return quizCorrectIds(c).length > 1 ? 'Correct answers' : 'Correct answer';
};
