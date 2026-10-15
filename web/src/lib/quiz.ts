import { quizCorrectIds, quizKind, type QuizConfig } from '@classinteract/shared';

/** The answer key of a full (presenter-side) quiz config, as readable lines. */
export function quizAnswerLines(c: QuizConfig): string[] {
  switch (quizKind(c)) {
    case 'match': return c.pairs.map((p) => `${p.left} → ${p.right}`);
    case 'order': return c.items.map((i, n) => `${n + 1}. ${i.text}`);
    default: return quizCorrectIds(c).flatMap((id) => c.options.find((o) => o.id === id)?.text ?? []);
  }
}

export const quizAnswerLabel = (c: QuizConfig): string => {
  const kind = quizKind(c);
  if (kind === 'match') return 'Correct matches';
  if (kind === 'order') return 'Correct order';
  return quizCorrectIds(c).length > 1 ? 'Correct answers' : 'Correct answer';
};
