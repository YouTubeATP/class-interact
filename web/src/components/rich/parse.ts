/**
 * A small, safe Markdown subset for teaching content. It produces a tree, never HTML: React escapes all text, so
 * nothing an author or participant types can become markup. Supported:
 *
 *   **bold**  *italic*  `inline code`  $inline math$  $$display math$$
 *   ```python            fenced code blocks (indentation and blank lines kept exactly)
 *   - bullets / 1. numbered lists
 *   | a | b |            tables (header row, then |---|---|, optional :--: alignment)
 *   blank line           new paragraph; single line breaks are kept
 */
export type Inline =
  | { t: 'text'; v: string }
  | { t: 'b'; c: Inline[] }
  | { t: 'i'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'math'; tex: string }
  | { t: 'br' };

export type Block =
  | { t: 'p'; c: Inline[] }
  | { t: 'ul' | 'ol'; items: Inline[][]; start?: number }
  | { t: 'code'; lang: string; text: string }
  | { t: 'math'; tex: string }
  | { t: 'table'; head: Inline[][]; align: ('left' | 'center' | 'right')[]; rows: Inline[][][] };

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  const flush = () => { if (buf) { out.push({ t: 'text', v: buf }); buf = ''; } };
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\' && i + 1 < src.length && '*`$\\|_'.includes(src[i + 1])) { buf += src[i + 1]; i += 2; continue; }
    if (ch === '\n') { flush(); out.push({ t: 'br' }); i++; continue; }
    if (ch === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > i + 1) { flush(); out.push({ t: 'code', v: src.slice(i + 1, end) }); i = end + 1; continue; }
    }
    if (ch === '$' && src[i + 1] !== ' ') {
      // $x$ but not prices like "$5 and $10": the closing $ must not be followed by a digit and the content not end in a space
      const end = src.indexOf('$', i + 1);
      if (end > i + 1 && src[end - 1] !== ' ' && !/\d/.test(src[end + 1] ?? '')) { flush(); out.push({ t: 'math', tex: src.slice(i + 1, end) }); i = end + 1; continue; }
    }
    if (ch === '*' && src[i + 1] === '*') {
      const end = src.indexOf('**', i + 2);
      if (end > i + 2) { flush(); out.push({ t: 'b', c: parseInline(src.slice(i + 2, end)) }); i = end + 2; continue; }
    }
    if (ch === '*' && src[i + 1] !== ' ' && src[i + 1] !== '*') {
      const end = src.indexOf('*', i + 1);
      if (end > i + 1 && src[end - 1] !== ' ') { flush(); out.push({ t: 'i', c: parseInline(src.slice(i + 1, end)) }); i = end + 1; continue; }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

const splitRow = (line: string) => {
  const cells: string[] = [];
  let cur = '';
  let code = false;
  const body = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '\\' && body[i + 1] === '|') { cur += '|'; i++; continue; }
    if (ch === '`') code = !code;
    if (ch === '|' && !code) { cells.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
};
const isDivider = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);

export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push({ t: 'p', c: parseInline(para.join('\n').trim()) });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^\s*(```|~~~)\s*([\w+#.-]*)\s*$/.exec(line);
    if (fence) {
      flushPara();
      const body: string[] = [];
      i++;
      while (i < lines.length && !new RegExp(`^\\s*${fence[1]}\\s*$`).test(lines[i])) body.push(lines[i++]);
      blocks.push({ t: 'code', lang: fence[2].toLowerCase(), text: body.join('\n') });
      continue;
    }
    if (/^\s*\$\$/.test(line)) {
      flushPara();
      const one = /^\s*\$\$(.+)\$\$\s*$/.exec(line);
      if (one) { blocks.push({ t: 'math', tex: one[1].trim() }); continue; }
      const body: string[] = [line.replace(/^\s*\$\$/, '')];
      i++;
      while (i < lines.length && !/\$\$\s*$/.test(lines[i])) body.push(lines[i++]);
      if (i < lines.length) body.push(lines[i].replace(/\$\$\s*$/, ''));
      blocks.push({ t: 'math', tex: body.join('\n').trim() });
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && isDivider(lines[i + 1])) {
      flushPara();
      const head = splitRow(line);
      const align = splitRow(lines[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : 'left') as 'left' | 'center' | 'right');
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(splitRow(lines[i++]).map(parseInline));
      i--;
      blocks.push({ t: 'table', head: head.map(parseInline), align, rows });
      continue;
    }
    const bullet = /^\s*[-*] (.*)$/.exec(line);
    const num = /^\s*(\d+)[.)] (.*)$/.exec(line);
    if (bullet || num) {
      flushPara();
      const t = bullet ? 'ul' : 'ol';
      const items: Inline[][] = [];
      const start = num ? Number(num[1]) : undefined;
      while (i < lines.length) {
        const m = t === 'ul' ? /^\s*[-*] (.*)$/.exec(lines[i]) : /^\s*\d+[.)] (.*)$/.exec(lines[i]);
        if (!m) break;
        items.push(parseInline(m[1]));
        i++;
      }
      i--;
      blocks.push({ t, items, ...(start && start !== 1 ? { start } : {}) });
      continue;
    }
    if (!line.trim()) { flushPara(); continue; }
    para.push(line);
  }
  flushPara();
  return blocks;
}

/** True when text uses anything beyond plain words (lets callers skip work for ordinary sentences). */
export const hasMarkup = (s: string) => /[`$*|]|^\s*([-*] |\d+[.)] )/m.test(s);

/** The text without markup characters, for places that cannot render rich text (tooltips, lists, aria labels). */
export function plainInline(src: string): string {
  return src.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\$([^$]+)\$/g, '$1').replace(/(^|\s)\*([^*\s][^*]*)\*/g, '$1$2');
}
