import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { cn } from '@/lib/cn';
import { drawMolecule } from './rich/chem';
import { RESIZE_EVENT } from './rich/events';
import { loadHljs, loadKatex, languageOf } from './rich/heavy';
import { hasMarkup, parseBlocks, parseInline, type Block, type Inline, type SchemeItem } from './rich/parse';

/** Tell a surrounding FitBox that this content changed size after an asynchronous render. */
const announce = (el: Element | null) => el?.dispatchEvent(new Event(RESIZE_EVENT, { bubbles: true }));

/**
 * Maths with KaTeX. Until the library has loaded (or if it fails), the TeX source is shown as code, so nothing jumps
 * or disappears. KaTeX escapes everything and is run with `trust: false`, so its HTML is safe to insert.
 */
function Math({ tex, display }: { tex: string; display: boolean }) {
  const [html, setHtml] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { if (html !== null) announce(ref.current); }, [html]);
  useEffect(() => {
    let live = true;
    loadKatex(tex)
      .then((k) => live && setHtml(k.renderToString(tex, { displayMode: display, throwOnError: false, trust: false, strict: 'ignore', maxSize: 20, maxExpand: 200 })))
      .catch(() => undefined);
    return () => { live = false; };
  }, [tex, display]);
  if (html === null) return <code className={cn('rich-code-inline', display && 'block text-center')} data-math={tex}>{tex}</code>;
  return display ? <div ref={ref as RefObject<HTMLDivElement>} className="rich-math-display" dangerouslySetInnerHTML={{ __html: html }} /> : <span ref={ref} className="rich-math" dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Code with highlight.js (its output escapes the source). Whitespace and indentation are kept exactly. */
function Code({ text, lang }: { text: string; lang: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { if (html !== null) announce(ref.current); }, [html]);
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
    <figure ref={ref} className="rich-code" data-lang={language || undefined}>
      {lang && <figcaption className="rich-code-lang">{lang}</figcaption>}
      <pre tabIndex={0}>{html === null ? <code>{text}</code> : <code dangerouslySetInnerHTML={{ __html: html }} />}</pre>
    </figure>
  );
}

/**
 * A skeletal structure from SMILES, sized in em so it scales with the text around it (a slide, an option tile, a phone). Until it is drawn, and if the SMILES cannot be read, the SMILES itself is shown.
 */
/**
 * `bond` is the length of one bond, as CSS: an em value, or a variable a container sets (an option tile on the projector
 * wants smaller structures than the same tile on a phone held at arm's length).
 */
function Molecule({ smiles, bond, label }: { smiles: string; bond: string; label?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [h, setH] = useState(2);
  const wrap = useRef<HTMLSpanElement>(null);
  // Colours are drawn into the SVG, so redraw when the surrounding text colour changes (the presenter switches the
  // projector to dark, or someone changes their own appearance).
  const [ink, setInk] = useState('');
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const check = () => setInk(getComputedStyle(el).color);
    check();
    let late: ReturnType<typeof setTimeout> | undefined;
    const mo = new MutationObserver(() => { check(); clearTimeout(late); late = setTimeout(check, 450); }); // again after any colour transition
    const themed = el.closest('[data-appearance]');
    if (themed) mo.observe(themed, { attributes: true, attributeFilter: ['data-appearance'] });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { mo.disconnect(); clearTimeout(late); };
  }, []);
  useEffect(() => {
    if (!ink) return;
    let live = true;
    if (ref.current) drawMolecule(ref.current, smiles).then((size) => { if (live) { setH(size.h); setState('ok'); } }, () => live && setState('error'));
    return () => { live = false; };
  }, [smiles, ink]);
  useEffect(() => { if (state !== 'loading') announce(wrap.current); }, [state, h]);
  return (
    // every structure uses the same bond length (`bond` em), so molecules side by side are drawn to the same scale
    <span ref={wrap} className="rich-mol" data-smiles={smiles} data-state={state} style={{ ['--mol-h' as string]: `calc(${h.toFixed(3)} * ${bond})` }}>
      <svg ref={ref} role="img" aria-label={label ? `Structure of ${label}` : `Chemical structure, SMILES ${smiles}`} className={state === 'ok' ? undefined : 'hidden'} />
      {state !== 'ok' && <code className={cn('rich-code-inline', state === 'error' && 'rich-mol-error')} title={state === 'error' ? 'This SMILES could not be drawn' : undefined}>{smiles}</code>}
    </span>
  );
}

/** A reaction or a synthetic route: molecules, arrows with conditions above and below, and plus signs. */
function Scheme({ items, arrows }: { items: SchemeItem[]; arrows: boolean }) {
  // keep an arrow together with the molecule after it, so a wrapped route never ends a row on an arrow
  const groups: SchemeItem[][] = [];
  items.forEach((it, i) => {
    if (i > 0 && (items[i - 1].t === 'arrow' || items[i - 1].t === 'plus')) groups[groups.length - 1].push(it);
    else groups.push([it]);
  });
  // A route reads best on one line: shrink it a little (down to 72%) rather than wrap; wrap only when it is much too wide.
  const fig = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = fig.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = '';
      el.style.flexWrap = 'nowrap';
      const k = el.clientWidth / el.scrollWidth;
      if (k >= 1) el.style.flexWrap = '';
      else if (k >= 0.72) el.style.fontSize = `${globalThis.Math.floor(k * 100) / 100}em`;
      else el.style.flexWrap = '';
    };
    fit();
    // only a change of available width matters (fitting changes the height, which must not trigger another fit)
    let lastW = el.clientWidth;
    const ro = new ResizeObserver(() => { if (el.clientWidth !== lastW) { lastW = el.clientWidth; fit(); } });
    ro.observe(el);
    el.addEventListener(RESIZE_EVENT, fit);
    return () => { ro.disconnect(); el.removeEventListener(RESIZE_EVENT, fit); };
  }, [items]);
  return (
    <figure ref={fig} className={cn('rich-scheme', !arrows && 'rich-scheme-plain')} data-testid="chem-scheme">
      {groups.map((g, gi) => (
        <span key={gi} className="rich-scheme-group">
          {g.map((it, i) => {
            if (it.t === 'plus') return <span key={i} className="rich-scheme-plus" aria-label="plus">+</span>;
            if (it.t === 'arrow') {
              return (
                <span key={i} className="rich-scheme-arrow" role="img" aria-label={`reacts${it.above ? ` with ${it.above}` : ''}${it.below ? `, ${it.below}` : ''}, to give`}>
                  {/* one inner span: as direct flex children, the spaces between words and formulas would collapse */}
                  <span className="rich-scheme-cond">{it.above && <span><RichInline text={it.above} /></span>}</span>
                  <svg viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden><line x1="0" y1="5" x2="97" y2="5" /><path d="M88 0.5 L99.5 5 L88 9.5" /></svg>
                  <span className="rich-scheme-cond">{it.below && <span><RichInline text={it.below} /></span>}</span>
                </span>
              );
            }
            return (
              <span key={i} className="rich-scheme-mol">
                {it.smiles === '?' ? <span className="rich-scheme-unknown" aria-label={`unknown${it.caption ? ` ${it.caption}` : ''}`}>?</span> : <Molecule smiles={it.smiles} bond={arrows ? '1.05em' : '1.5em'} label={it.caption || undefined} />}
                {it.caption && <span className="rich-scheme-caption"><RichInline text={it.caption} /></span>}
              </span>
            );
          })}
        </span>
      ))}
    </figure>
  );
}

// a structure inside a line of text, and one that is a whole option on its own (containers may override either)
const INLINE_BOND = 'var(--mol-bond-inline, 0.7em)';
const SOLO_BOND = 'var(--mol-bond-solo, 1.25em)';

function renderInline(nodes: Inline[], molBond = INLINE_BOND): ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.t) {
      case 'text': return <Fragment key={i}>{n.v}</Fragment>;
      case 'b': return <strong key={i} className="font-bold">{renderInline(n.c)}</strong>;
      case 'i': return <em key={i}>{renderInline(n.c)}</em>;
      case 'code': return <code key={i} className="rich-code-inline">{n.v}</code>;
      case 'math': return <Math key={i} tex={n.tex} display={false} />;
      case 'mol': return <Molecule key={i} smiles={n.smiles} bond={molBond} />;
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
    case 'scheme': return <Scheme key={i} items={b.items} arrows={b.arrows} />;
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

/** One line of text (a question, an option): bold, italic, `code`, $maths$ and {{smiles:…}} structures, nothing block-level. */
export function RichInline({ text }: { text: string }) {
  const nodes = useMemo(() => (hasMarkup(text) ? parseInline(text) : null), [text]);
  if (!nodes) return <>{text}</>;
  // an option that is only a structure gets drawn large enough to read on a phone
  const solo = nodes.filter((n) => !(n.t === 'text' && !n.v.trim()));
  return <>{renderInline(nodes, solo.length === 1 && solo[0].t === 'mol' ? SOLO_BOND : INLINE_BOND)}</>;
}
