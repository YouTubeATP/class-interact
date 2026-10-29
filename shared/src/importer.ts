/**
 * Bulk import: turn a spreadsheet (CSV) or a JSON list into ordinary slides, row by row, through the same validator
 * as everything else. Nothing is dropped silently: every row either becomes a slide or comes back with a reason.
 *
 * CSV columns (header names are case-insensitive; only `question` is required):
 *   type          quiz | poll | wordcloud | open | rating | content | truefalse   (default quiz when `correct` is set, else poll)
 *   kind          single | multiple | text | numeric   (quiz only; usually inferred)
 *   question      the question (or the title of a content slide)
 *   options       answer options separated by |        (or columns option_a … option_f / option1 … option6)
 *   correct       letter(s) like B or A,C, or the option text; for typed answers the accepted answers (a|b); for numeric the number
 *   tolerance     numeric: allowed difference (absolute), or e.g. 5% for relative
 *   unit, time_limit, points, explanation, concepts (a|b), notes, body, min, max, min_label, max_label, multiple (yes/no)
 */
import { defaultConfig, nextId } from './activities';
import { parseSlideConfig } from './document';
import { SLIDE_TYPES, type Slide, type SlideType } from './schema';

export const IMPORT_MAX_BYTES = 300_000;
export const IMPORT_MAX_ROWS = 300;

export interface ImportIssue {
  /** 1-based row in the file (the header is row 1), or item number for JSON. */
  row: number;
  message: string;
}

export interface ImportResult {
  slides: Slide[];
  /** Rows that could not become slides, with why. */
  issues: ImportIssue[];
  /** Columns that were not recognised (ignored). */
  ignoredColumns: string[];
  rows: number;
}

/** RFC 4180 CSV (quotes, doubled quotes, newlines inside quotes). Also accepts semicolon- or tab-separated files. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = [',', ';', '\t'].map((d) => ({ d, n: firstLine.split(d).length })).sort((a, b) => b.n - a.n)[0].d;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const KNOWN = ['type', 'kind', 'question', 'prompt', 'title', 'options', 'correct', 'answer', 'tolerance', 'unit', 'time_limit', 'timelimit', 'time', 'points', 'explanation', 'concepts', 'notes', 'body', 'min', 'max', 'min_label', 'max_label', 'multiple'];
const optionCol = (h: string) => /^option[ _-]?([a-f]|[1-6])$/.exec(h);
const split = (v: string) => v.split('|').map((x) => x.trim()).filter(Boolean);
const yes = (v: string | undefined) => !!v && /^(y|yes|true|1|x)$/i.test(v.trim());

function rowToSlide(get: (k: string) => string | undefined, options: string[], id: string): { slide?: Slide; error?: string } {
  const question = (get('question') ?? get('prompt') ?? get('title') ?? '').trim();
  let type = (get('type') ?? '').trim().toLowerCase();
  const correct = (get('correct') ?? get('answer') ?? '').trim();
  if (type === 'truefalse' || type === 'true/false') type = 'quiz';
  if (!type) type = correct ? 'quiz' : options.length ? 'poll' : 'open';
  if (!(SLIDE_TYPES as readonly string[]).includes(type) || type === 'survey') return { error: `Unknown type “${type}”. Use quiz, poll, wordcloud, open, rating or content.` };
  if (!question) return { error: 'The question (or title) is empty.' };
  const t = type as SlideType;
  const base: Record<string, any> = { ...defaultConfig(t) };
  const time = Number(get('time_limit') ?? get('timelimit') ?? get('time') ?? '');
  if ('timeLimitSec' in base && Number.isFinite(time) && time > 0) base.timeLimitSec = Math.round(time);
  if (get('notes')) base.notes = get('notes')!.trim();
  const opts = options.map((text, i) => ({ id: String.fromCharCode(97 + i), text }));

  if (t === 'content') {
    Object.assign(base, { title: question, body: (get('body') ?? '').trim() });
  } else if (t === 'quiz') {
    let kind = (get('kind') ?? '').trim().toLowerCase();
    const isTrueFalse = (get('type') ?? '').trim().toLowerCase().startsWith('true');
    const quizOpts = isTrueFalse ? [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }] : opts;
    const resolve = (token: string): string | null => {
      const tk = token.trim();
      if (/^[a-f]$/i.test(tk) && quizOpts[tk.toLowerCase().charCodeAt(0) - 97]) return quizOpts[tk.toLowerCase().charCodeAt(0) - 97].id;
      if (/^[1-6]$/.test(tk) && quizOpts[Number(tk) - 1]) return quizOpts[Number(tk) - 1].id;
      return quizOpts.find((o) => o.text.toLowerCase() === tk.toLowerCase())?.id ?? null;
    };
    if (!kind) kind = quizOpts.length ? (correct.split(/[,;|]/).filter(Boolean).length > 1 ? 'multiple' : 'single') : /^[-+]?[\d.,/e]+$/i.test(correct) ? 'numeric' : 'text';
    Object.assign(base, { question, kind, options: [], correctOptionId: undefined, correctOptionIds: [] });
    if (kind === 'single' || kind === 'multiple') {
      if (quizOpts.length < 2) return { error: 'A quiz needs at least two options.' };
      const ids = correct.split(kind === 'multiple' ? /[,;|]/ : /\|/).map(resolve);
      if (!correct || ids.some((x) => x === null)) return { error: `“correct” (${correct || 'empty'}) does not match an option. Use a letter (A–F) or the option text.` };
      base.options = quizOpts;
      if (kind === 'single') base.correctOptionId = ids[0];
      else base.correctOptionIds = [...new Set(ids)];
    } else if (kind === 'text') {
      const accepted = split(correct);
      if (!accepted.length) return { error: 'A typed-answer question needs at least one accepted answer in “correct” (separate several with |).' };
      base.acceptedAnswers = accepted;
    } else if (kind === 'numeric') {
      const value = Number(correct.replace(/,/g, ''));
      if (!correct || !Number.isFinite(value)) return { error: `“correct” must be a number for a numeric question (got ${correct || 'nothing'}).` };
      const tol = (get('tolerance') ?? '').trim();
      base.numeric = { value, tolerance: tol && !tol.endsWith('%') ? Math.abs(Number(tol)) || 0 : 0, tolerancePercent: tol.endsWith('%') ? Math.abs(Number(tol.slice(0, -1))) || 0 : 0, unit: (get('unit') ?? '').trim() };
    } else {
      return { error: `Unknown quiz kind “${kind}”. Use single, multiple, text or numeric.` };
    }
    const points = Number(get('points') ?? '');
    if (Number.isFinite(points) && points > 0) base.points = Math.round(points);
    if (get('explanation')) base.explanation = get('explanation')!.trim();
    if (get('concepts')) base.concepts = split(get('concepts')!);
  } else if (t === 'poll') {
    if (opts.length < 2) return { error: 'A poll needs at least two options.' };
    Object.assign(base, { question, options: opts, multiple: yes(get('multiple')) });
  } else if (t === 'rating') {
    const min = Number(get('min') ?? 1);
    const max = Number(get('max') ?? 5);
    Object.assign(base, { question, min: min === 0 ? 0 : 1, max: Number.isFinite(max) ? Math.round(max) : 5, minLabel: (get('min_label') ?? '').trim(), maxLabel: (get('max_label') ?? '').trim() });
  } else {
    base.question = question;
  }
  const parsed = parseSlideConfig(t, base);
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join('; ') };
  return { slide: { id, type: t, ...parsed.data } as Slide };
}

export function importCsv(text: string, existingIds: string[] = []): ImportResult {
  if (text.length > IMPORT_MAX_BYTES) return { slides: [], issues: [{ row: 0, message: `The file is too large (maximum ${Math.round(IMPORT_MAX_BYTES / 1000)} KB).` }], ignoredColumns: [], rows: 0 };
  const rows = parseCsv(text);
  if (rows.length < 2) return { slides: [], issues: [{ row: 0, message: 'The file needs a header row and at least one question.' }], ignoredColumns: [], rows: 0 };
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  if (!header.some((h) => h === 'question' || h === 'prompt' || h === 'title')) return { slides: [], issues: [{ row: 1, message: 'No “question” column found. The first row must name the columns, for example: type,question,options,correct' }], ignoredColumns: [], rows: 0 };
  const ignoredColumns = header.filter((h) => h && !KNOWN.includes(h) && !optionCol(h));
  const body = rows.slice(1, IMPORT_MAX_ROWS + 1);
  const issues: ImportIssue[] = rows.length - 1 > IMPORT_MAX_ROWS ? [{ row: IMPORT_MAX_ROWS + 2, message: `Only the first ${IMPORT_MAX_ROWS} rows are read; ${rows.length - 1 - IMPORT_MAX_ROWS} more were not imported.` }] : [];
  const ids = [...existingIds];
  const slides: Slide[] = [];
  body.forEach((cells, i) => {
    const get = (k: string) => {
      const j = header.indexOf(k);
      return j >= 0 && cells[j] !== undefined && cells[j].trim() !== '' ? cells[j] : undefined;
    };
    const inline = get('options') ? split(get('options')!) : [];
    const columns = header.map((h, j) => (optionCol(h) ? cells[j]?.trim() ?? '' : '')).filter(Boolean);
    const id = nextId(ids, 'imported-');
    const r = rowToSlide(get, inline.length ? inline : columns, id);
    if (r.slide) {
      ids.push(id);
      slides.push(r.slide);
    } else issues.push({ row: i + 2, message: r.error! });
  });
  return { slides, issues, ignoredColumns, rows: body.length };
}

/** A JSON list of slides, `{ "slides": [...] }`, or a whole presentation. Each slide is checked on its own. */
export function importJsonSlides(text: string, existingIds: string[] = []): ImportResult {
  if (text.length > IMPORT_MAX_BYTES * 3) return { slides: [], issues: [{ row: 0, message: 'The file is too large (maximum 900 KB).' }], ignoredColumns: [], rows: 0 };
  let data: unknown;
  try { data = JSON.parse(text); } catch (e) { return { slides: [], issues: [{ row: 0, message: `Not valid JSON: ${(e as Error).message}` }], ignoredColumns: [], rows: 0 }; }
  const list = Array.isArray(data) ? data : data && typeof data === 'object' && Array.isArray((data as any).slides) ? (data as any).slides : null;
  if (!list) return { slides: [], issues: [{ row: 0, message: 'Expected a list of slides, or an object with "slides".' }], ignoredColumns: [], rows: 0 };
  const ids = [...existingIds];
  const slides: Slide[] = [];
  const issues: ImportIssue[] = [];
  list.slice(0, IMPORT_MAX_ROWS).forEach((raw: any, i: number) => {
    if (!raw || typeof raw !== 'object' || !(SLIDE_TYPES as readonly string[]).includes(raw.type)) {
      issues.push({ row: i + 1, message: `Item ${i + 1} has no valid "type" (${SLIDE_TYPES.join(', ')}).` });
      return;
    }
    const { id: _id, type, ...config } = raw;
    const parsed = parseSlideConfig(type, config);
    if (!parsed.success) {
      issues.push({ row: i + 1, message: parsed.error.issues.map((x) => `${x.path.join('.') || 'slide'}: ${x.message}`).join('; ') });
      return;
    }
    const id = typeof _id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(_id) && !ids.includes(_id) ? _id : nextId(ids, 'imported-');
    ids.push(id);
    slides.push({ id, type, ...parsed.data } as Slide);
  });
  if (list.length > IMPORT_MAX_ROWS) issues.push({ row: IMPORT_MAX_ROWS + 1, message: `Only the first ${IMPORT_MAX_ROWS} items are read.` });
  return { slides, issues, ignoredColumns: [], rows: Math.min(list.length, IMPORT_MAX_ROWS) };
}

export const CSV_TEMPLATE = [
  'type,kind,question,options,correct,tolerance,unit,time_limit,points,explanation,concepts',
  'quiz,single,"What does len([1,2,3]) return?",1|2|3|Error,C,,,20,1000,len counts the items.,Lists',
  'quiz,multiple,Which are prime?,2|4|5|9,"A,C",,,,,,Number theory',
  'quiz,text,Which keyword starts a loop over a list in Python?,,for,,,,,,Loops',
  'quiz,numeric,What is 0.1 + 0.2 to two decimal places?,,0.3,0.005,,30,,,Data representation',
  'poll,,How confident are you with loops?,Very|Somewhat|Not yet,,,,,,,',
  'wordcloud,,One word to describe today,,,,,,,,',
].join('\n') + '\n';
