import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';

export interface TextFilter {
  /** true when the text should be rejected */
  isBlocked(text: string): boolean;
}

/**
 * Basic text moderation for names and free-text responses. English profanity/slurs with common
 * obfuscations (leetspeak, repeated letters), plus an operator-supplied list. It is a first line of
 * defence — presenters can still hide or approve individual responses.
 */
export function createTextFilter(extraWords: string[] = []): TextFilter {
  const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });
  const extras = extraWords.map((w) => w.toLowerCase()).filter(Boolean);
  return {
    isBlocked(text) {
      if (matcher.hasMatch(text)) return true;
      const lower = text.toLowerCase();
      return extras.some((w) => lower.includes(w));
    },
  };
}
