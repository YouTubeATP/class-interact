import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';
import type { Config } from '../config';
import { AppError } from '../lib/errors';

/**
 * One-shot AI helpers for the Studio. Each is optional (only when an API key is configured), sends only what it says
 * (never names or participant identities), and its output is always checked by deterministic code before use:
 * converted slides go through the import validator, suggested groupings need the presenter's approval, and the recap
 * text is shown separately from the measured results and labelled as generated.
 */
export function aiTasks(config: Config) {
  const provider = config.aiApiKey
    ? createOpenAICompatible({ name: 'aimlapi', baseURL: config.aiBaseUrl, apiKey: config.aiApiKey, headers: { 'User-Agent': 'ClassInteract/1.0 (+https://github.com/YouTubeATP/class-interact)' } })
    : null;

  async function ask(task: string, system: string, prompt: string, maxOutputTokens = 4000): Promise<string> {
    if (!provider) throw new AppError(503, 'AI_DISABLED', 'AI features are not set up on this server. Set AIMLAPI_KEY to turn them on.');
    try {
      const r = await generateText({ model: provider.chatModel(config.aiModel), system: `[task:${task}] ${system}`, prompt, maxOutputTokens, maxRetries: 1, temperature: 0.2 });
      return r.text;
    } catch (e) {
      console.warn('[ai] task failed:', e instanceof Error ? e.message : 'unknown');
      throw new AppError(502, 'AI_FAILED', 'The AI service had a problem. Try again in a moment.');
    }
  }

  /** Pull the first JSON object out of a reply (models sometimes wrap it in a code fence). */
  function json(text: string): any {
    const m = /\{[\s\S]*\}/.exec(text);
    if (!m) throw new AppError(502, 'AI_FAILED', 'The AI reply could not be read. Try again.');
    try { return JSON.parse(m[0]); } catch { throw new AppError(502, 'AI_FAILED', 'The AI reply could not be read. Try again.'); }
  }

  return {
    enabled: !!provider,
    async convert(material: string): Promise<unknown[]> {
      const reply = await ask('convert',
        'You turn teaching material into interactive ClassInteract slides. Reply with JSON only: {"slides":[...]} where each slide is {"type":"quiz"|"poll"|"wordcloud"|"open"|"rating"|"content", ...fields}. Quizzes: "question", "options":[{"id":"a","text":"..."}], "correctOptionId" (or "kind":"multiple" with "correctOptionIds", "kind":"text" with "acceptedAnswers", "kind":"numeric" with "numeric":{"value":n,"tolerance":t}). Polls: "question","options". Keep questions short and faithful to the material; do not invent facts that are not in it. At most 15 slides.',
        material.slice(0, 20_000), 6000);
      const out = json(reply);
      return Array.isArray(out.slides) ? out.slides : [];
    },
    async recap(summary: unknown): Promise<string> {
      return ask('recap',
        'You help a teacher plan the next lesson. You are given measured, aggregated results from a class session (no names). Suggest at most five concrete follow-up actions in Markdown bullets. Only refer to numbers present in the data; never invent student outcomes or claim causes you cannot see. Start with the line "Suggested next steps (AI):".',
        JSON.stringify(summary).slice(0, 20_000), 1200);
    },
    async grouping(terms: { key: string; label: string; count: number }[]): Promise<{ keys: string[]; reason: string }[]> {
      const reply = await ask('grouping',
        'You group free-text answers that mean the same thing (synonyms, spelling variants, translations). Never group answers with different meanings, and never group opinions that differ. Reply with JSON only: {"groups":[{"keys":["key1","key2"],"reason":"short reason"}]}. Use the exact "key" values given. Leave answers ungrouped when unsure.',
        JSON.stringify(terms.slice(0, 200)), 2000);
      const out = json(reply);
      const known = new Set(terms.map((t) => t.key));
      return (Array.isArray(out.groups) ? out.groups : [])
        .map((g: any) => ({ keys: (Array.isArray(g?.keys) ? g.keys : []).filter((k: unknown) => typeof k === 'string' && known.has(k)), reason: typeof g?.reason === 'string' ? g.reason.slice(0, 120) : 'Similar meaning (AI suggestion)' }))
        .filter((g: { keys: string[] }) => new Set(g.keys).size >= 2);
    },
  };
}
