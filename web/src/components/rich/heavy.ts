/**
 * The heavy renderers (KaTeX for maths, highlight.js for code) are fetched only when a slide actually contains maths
 * or code, so the join page and ordinary slides never download them.
 */
import type { HLJSApi } from 'highlight.js';

type Katex = typeof import('katex').default;
let katexP: Promise<Katex> | null = null;
let hljsP: Promise<HLJSApi> | null = null;

export const loadKatex = () =>
  (katexP ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([m]) => m.default).catch((e) => { katexP = null; throw e; }));

export const LANGUAGES = ['python', 'javascript', 'typescript', 'java', 'c', 'cpp', 'csharp', 'sql', 'bash', 'json', 'xml', 'css', 'plaintext'] as const;
const ALIASES: Record<string, string> = { py: 'python', js: 'javascript', ts: 'typescript', 'c++': 'cpp', 'c#': 'csharp', cs: 'csharp', sh: 'bash', shell: 'bash', html: 'xml', text: 'plaintext', txt: 'plaintext' };
export const languageOf = (lang: string) => ALIASES[lang] ?? lang;

export const loadHljs = () =>
  (hljsP ??= (async () => {
    const core = (await import('highlight.js/lib/core')).default;
    const langs = await Promise.all([
      import('highlight.js/lib/languages/python'), import('highlight.js/lib/languages/javascript'), import('highlight.js/lib/languages/typescript'),
      import('highlight.js/lib/languages/java'), import('highlight.js/lib/languages/c'), import('highlight.js/lib/languages/cpp'),
      import('highlight.js/lib/languages/csharp'), import('highlight.js/lib/languages/sql'), import('highlight.js/lib/languages/bash'),
      import('highlight.js/lib/languages/json'), import('highlight.js/lib/languages/xml'), import('highlight.js/lib/languages/css'),
      import('highlight.js/lib/languages/plaintext'),
    ]);
    LANGUAGES.forEach((name, i) => core.registerLanguage(name, langs[i].default));
    return core;
  })().catch((e) => { hljsP = null; throw e; }));
