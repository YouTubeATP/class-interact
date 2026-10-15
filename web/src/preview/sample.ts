import type { AnyConfig, PollConfig, QuizConfig, RatingConfig, Results, SlideType, SurveyConfig } from '@classinteract/shared';
import { definitions, quizCorrectIds, quizKind, type AggSubmission } from '@classinteract/shared';

/**
 * Deterministic sample responses so the editor can show what the results will look like.
 * Built by running the real aggregators over fake submissions — never a separate code path.
 */
const WORDS = ['curious', 'practical', 'clear', 'energising', 'new ideas', 'helpful', 'fast', 'fun', 'curious', 'clear', 'practical', 'curious', 'hands-on', 'interesting'];
const SENTENCES = ['This makes sense to me.', 'Can we see one more example?', 'Interesting, I had not thought about it that way.', 'I would like to try this myself.'];

let n = 0;
const sub = (payload: unknown, key: string | null = null): AggSubmission => ({ id: `s${n++}`, participantId: `p${n}`, payload, status: 'visible', key, createdAt: n, correct: null, score: 0 });

function spread(total: number, buckets: number, peak: number): number[] {
  const w = Array.from({ length: buckets }, (_, i) => 1 + (i === peak ? 3 : 0) + (i === (peak + 1) % buckets ? 1 : 0));
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => Math.round((x / sum) * total));
}

export function sampleResults(type: SlideType, config: AnyConfig): Results {
  n = 0;
  const def = definitions[type] as any;
  switch (type) {
    case 'quiz': {
      const c = config as QuizConfig;
      const peak = Math.max(0, c.options.findIndex((o) => quizCorrectIds(c).includes(o.id)));
      const multiple = quizKind(c) === 'multiple';
      const subs = c.options.flatMap((o, i) => Array.from({ length: spread(12, c.options.length, peak)[i] }, () => sub(multiple ? { optionIds: [o.id] } : { optionId: o.id })));
      return def.aggregate(c, subs);
    }
    case 'poll': {
      const c = config as PollConfig;
      const subs = c.options.flatMap((o, i) => Array.from({ length: spread(14, c.options.length, 0)[i] }, () => sub({ optionIds: [o.id] })));
      return def.aggregate(c, subs);
    }
    case 'wordcloud':
      return def.aggregate(config, WORDS.map((w) => sub({ text: w }, w)));
    case 'open':
      return def.aggregate(config, SENTENCES.map((text) => sub({ text })));
    case 'rating': {
      const c = config as RatingConfig;
      const len = c.max - c.min + 1;
      const counts = spread(16, len, Math.floor(len * 0.65));
      return def.aggregate(c, counts.flatMap((k, i) => Array.from({ length: k }, () => sub({ value: c.min + i }))));
    }
    case 'survey': {
      const c = config as SurveyConfig;
      const answers = Array.from({ length: 9 }, (_, i) => ({
        answers: Object.fromEntries(
          c.questions.map((q) => [
            q.id,
            q.kind === 'choice' ? { optionIds: [q.options[i % q.options.length].id] } : q.kind === 'rating' ? { value: q.min + ((i * 2) % (q.max - q.min + 1)) } : { text: SENTENCES[i % SENTENCES.length] },
          ]),
        ),
      }));
      return def.aggregate(c, answers.map((a) => sub(a)));
    }
    default:
      return { type: 'content' };
  }
}
