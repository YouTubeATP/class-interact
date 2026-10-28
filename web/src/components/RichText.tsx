import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { loadHljs, loadKatex, languageOf } from './rich/heavy';
import { hasMarkup, parseBlocks, parseInline, type Block, type Inline } from './rich/parse';

/**
 * Maths with KaTeX. Until the library has loaded (or if it fails), the TeX source is shown as code, so nothing jumps
 * or disappears. KaTeX escapes everything and is run with `trust: false`, so its HTML is safe to insert.
 */
function Math({ tex, display }: { tex: string; display: boolean }) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loadKatex()
      .then((k) => live && setHtml(k.renderToString(tex, { displayMode: display, throwOnError: false, trust: false, strict: 'ignore', maxSize: 20, maxExpand: 200 })))
      .catch(() => undefined);
    return () => { live = false; };
  }, [tex, display]);
  if (html === null) return <code className={cn('rich-code-inline', display && 'block text-center')} data-math={tex}>{tex}</code>;
  return display ? <div className="rich-math-display" dangerouslySetInnerHTML={{ __html: html }} /> : <span className="rich-math" dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Code with highlight.js (its output escapes the source). Whitespace and indentation are kept exactly. */
function Code({ text, lang }: { text: string; lang: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const language = languageOf(lang);
  useEffect(() => {
    let live = true;
    if (!lang || language === 'plaintext') return;
    loadHljs()
      .then((h) => { if (live && h.getLanguage(language)) setHtml(h.highlight(text, { language, ignoreIllegals: true }).value); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [text, lang, language]);
  return (
    <figure className="rich-code" data-lang={language || undefined}>
      {lang && <figcaption className="rich-code-lang">{lang}</figcaption>}
      <pre tabIndex={0}>{html === null ? <code>{text}</code> : <code dangerouslySetInnerHTML={{ __html: html }} />}</pre>
    </figure>
  );
}

function renderInline(nodes: Inline[]): ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.t) {
      case 'text': return <Fragment key={i}>{n.v}</Fragment>;
      case 'b': return <strong key={i} className="font-bold">{renderInline(n.c)}</strong>;
      case 'i': return <em key={i}>{renderInline(n.c)}</em>;
      case 'code': return <code key={i} className="rich-code-inline">{n.v}</code>;
      case 'math': return <Math key={i} tex={n.tex} display={false} />;
      case 'br': return <br key={i} />;
    }
  });
}

function renderBlock(b: Block, i: number, bulletClassName?: string): ReactNode {
  switch (b.t) {
    case 'p': return <p key={i}>{renderInline(b.c)}</p>;
    case 'ul':
      return (
        <ul key={i} className={cn('grid gap-[0.45em]', bulletClassName)}>
          {b.items.map((it, j) => <li key={j} className="relative pl-[1.1em] before:absolute before:left-0 before:top-[0.62em] before:size-[0.38em] before:rounded-full before:bg-accent">{renderInline(it)}</li>)}
        </ul>
      );
    case 'ol':
      return <ol key={i} start={b.start} className={cn('grid list-decimal gap-[0.45em] pl-[1.4em] marker:font-bold marker:text-accent-ink', bulletClassName)}>{b.items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}</ol>;
    case 'code': return <Code key={i} text={b.text} lang={b.lang} />;
    case 'math': return <Math key={i} tex={b.tex} display />;
    case 'table':
      return (
        <div key={i} className="rich-table-wrap" tabIndex={0}>
          <table className="rich-table">
            <thead><tr>{b.head.map((c, j) => <th key={j} style={{ textAlign: b.align[j] ?? 'left' }} scope="col">{renderInline(c)}</th>)}</tr></thead>
            <tbody>{b.rows.map((r, k) => <tr key={k}>{b.head.map((_, j) => <td key={j} style={{ textAlign: b.align[j] ?? 'left' }}>{renderInline(r[j] ?? [])}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
  }
}

/** Paragraphs, lists, tables, code blocks and maths. No HTML is ever interpreted. */
export function RichText({ text, className, bulletClassName }: { text: string; className?: string; bulletClassName?: string }) {
  const blocks = useMemo(() => parseBlocks(text.trim()), [text]);
  return <div className={cn('rich grid gap-[0.7em]', className)}>{blocks.map((b, i) => renderBlock(b, i, bulletClassName))}</div>;
}

/** One line of text (a question, an option): bold, italic, `code` and $maths$, nothing block-level. */
export function RichInline({ text }: { text: string }) {
  const nodes = useMemo(() => (hasMarkup(text) ? parseInline(text) : null), [text]);
  if (!nodes) return <>{text}</>;
  return <>{renderInline(nodes)}</>;
}
