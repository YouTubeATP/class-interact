/**
 * Simulated participants for rehearsals. They answer through the same validation and scoring as real people, so a
 * rehearsal shows populated polls, quizzes, word clouds and leaderboards without inviting anyone. The answers are
 * plausible, not real: never mix them with real results (rehearsal sessions are flagged and excluded from analytics).
 */
import { quizKind, quizView } from './activities';
import type { AnyConfig, QuizConfig, SlideType, SurveyConfig } from './schema';

export const SIM_NAMES = ['Ada', 'Alan', 'Grace', 'Katherine', 'Linus', 'Margaret', 'Tim', 'Barbara', 'Dennis', 'Radia', 'Ken', 'Frances', 'Edsger', 'Hedy', 'John', 'Annie', 'Claude', 'Dorothy', 'Guido', 'Shafi'];
const WORDS = ['curious', 'clear', 'practical', 'fun', 'interesting', 'hands-on', 'confusing', 'fast', 'useful', 'new ideas', 'challenging', 'creative'];
const SENTENCES = ['This makes sense to me.', 'Can we see one more example?', 'I would like to try this myself.', 'The second part was harder to follow.', 'Interesting, I had not thought about it that way.'];

export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(rnd: () => number, list: readonly T[]): T => list[Math.floor(rnd() * list.length) % list.length];
const shuffle = <T>(rnd: () => number, list: T[]): T[] => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** A payload a person might plausibly send. `skill` (0–1) is the chance of answering a quiz correctly. */
export function simulatedAnswer(type: SlideType, config: AnyConfig, seed: string, rnd: () => number, skill = 0.65): unknown | null {
  const right = rnd() < skill;
  switch (type) {
    case 'quiz': {
      const c = config as QuizConfig;
      const kind = quizKind(c);
      if (kind === 'single') {
        const wrong = c.options.filter((o) => o.id !== c.correctOptionId);
        return { optionId: right || !wrong.length ? c.correctOptionId : pick(rnd, wrong).id };
      }
      if (kind === 'multiple') return { optionIds: right ? c.correctOptionIds : shuffle(rnd, c.options.map((o) => o.id)).slice(0, 1 + Math.floor(rnd() * 2)) };
      if (kind === 'match') {
        const v = quizView(c, seed, true)!;
        return { matches: right ? v.answerMap : Object.fromEntries(v.lefts.map((l, i) => [l.id, v.rights[(i + 1) % v.rights.length].id])) };
      }
      if (kind === 'order') {
        const v = quizView(c, seed, true)!;
        return { order: right ? v.answerOrder : shuffle(rnd, v.items.map((i) => i.id)) };
      }
      if (kind === 'text') return { text: right ? c.acceptedAnswers[0] : pick(rnd, ['not sure', 'something else', c.acceptedAnswers[0].slice(0, -1) || 'x']) };
      if (kind === 'numeric') return { text: String(right ? c.numeric!.value : Math.round(c.numeric!.value * (1.3 + rnd()) * 100) / 100 + 1) };
      if (kind === 'hotspot') {
        const r = c.regions[0];
        return right && r ? { x: r.x + r.w * (0.3 + 0.4 * rnd()), y: r.y + r.h * (0.3 + 0.4 * rnd()) } : { x: rnd(), y: rnd() };
      }
      return null;
    }
    case 'poll': {
      const c = config as { options: { id: string }[]; multiple: boolean };
      const weighted = c.options.flatMap((o, i) => Array.from({ length: Math.max(1, c.options.length - i) }, () => o.id));
      return { optionIds: [pick(rnd, weighted)] };
    }
    case 'wordcloud':
      return { text: pick(rnd, WORDS) };
    case 'open':
      return { text: pick(rnd, SENTENCES) };
    case 'rating': {
      const c = config as { min: number; max: number };
      return { value: Math.min(c.max, Math.max(c.min, Math.round(c.min + (c.max - c.min) * (0.45 + 0.5 * rnd())))) };
    }
    case 'survey': {
      const c = config as SurveyConfig;
      const answers: Record<string, unknown> = {};
      for (const q of c.questions) {
        if (q.kind === 'choice') answers[q.id] = { optionIds: [pick(rnd, q.options).id] };
        else if (q.kind === 'rating') answers[q.id] = { value: Math.round(q.min + (q.max - q.min) * (0.4 + 0.6 * rnd())) };
        else if (q.required || rnd() < 0.5) answers[q.id] = { text: pick(rnd, SENTENCES) };
      }
      return { answers };
    }
    default:
      return null;
  }
}

export const SIM_QUESTIONS = ['Can you show another example?', 'Will this be on the test?', 'How does this connect to last week?', 'Could you explain the second step again?'];
