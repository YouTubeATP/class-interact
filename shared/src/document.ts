/**
 * Import / export / validation pipeline for presentation documents.
 * Everything that creates a presentation (visual editor, JSON import, seed) goes through here.
 */
import type { ZodIssue } from 'zod';
import {
  CONTENT_LAYOUTS,
  DOCUMENT_FORMAT,
  PALETTES,
  SCHEMA_VERSION,
  SLIDE_TYPES,
  configSchemas,
  presentationDocSchema,
  shapes,
  type ContentConfig,
  type PresentationDoc,
  type Slide,
  type SlideType,
} from './schema';

export interface DocIssue {
  /** JSON path such as `slides[2].options[1].text` */
  path: string;
  message: string;
  /** Zero-based slide index when the issue belongs to a slide */
  slide: number | null;
}

export type ParseResult =
  | { ok: true; doc: PresentationDoc; warnings: string[] }
  | { ok: false; errors: DocIssue[] };

type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;
/** migrations[n] upgrades a version-n document to version n+1. Empty until the schema changes. */
const MIGRATIONS: Record<number, Migration> = {};

// ---------------------------------------------------------------------------------------

function isObj(v: unknown): v is Record<string, any> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function pathToString(path: (string | number)[]): string {
  return path.reduce<string>((acc, seg) => (typeof seg === 'number' ? `${acc}[${seg}]` : acc ? `${acc}.${seg}` : String(seg)), '');
}

function distance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

function suggest(key: string, allowed: string[]): string | null {
  const k = key.toLowerCase();
  let best: string | null = null;
  let bestD = Infinity;
  for (const a of allowed) {
    const d = a.toLowerCase() === k ? 0 : distance(k, a.toLowerCase());
    if (d < bestD) {
      best = a;
      bestD = d;
    }
  }
  return best !== null && bestD <= Math.max(2, Math.floor(key.length / 3)) ? best : null;
}

function allowedKeysAt(raw: unknown, path: (string | number)[]): string[] {
  let node: any = raw;
  for (const seg of path) node = node?.[seg as any];
  if (path.length === 0) return ['format', 'schemaVersion', 'title', 'description', 'theme', 'slides'];
  const last = path[path.length - 1];
  if (last === 'theme') return ['palette', 'background'];
  if (last === 'image') return ['url', 'alt', 'fit'];
  if (last === 'callout') return ['tone', 'text'];
  if (path.length === 2 && path[0] === 'slides' && isObj(node)) {
    const t = node.type as SlideType;
    return ['id', 'type', ...Object.keys((shapes as any)[t] ?? {})];
  }
  if (isObj(node) && 'text' in node && 'id' in node) return ['id', 'text'];
  return [];
}

export function formatIssues(issues: ZodIssue[], raw: unknown): DocIssue[] {
  const out: DocIssue[] = [];
  for (const issue of issues) {
    const slide = issue.path[0] === 'slides' && typeof issue.path[1] === 'number' ? issue.path[1] : null;
    const path = pathToString(issue.path) || '(document)';
    const push = (message: string, p = path) => out.push({ path: p, message, slide });

    if (issue.code === 'unrecognized_keys') {
      const allowed = allowedKeysAt(raw, issue.path);
      for (const key of issue.keys) {
        const hint = suggest(key, allowed);
        const where = path === '(document)' ? '' : ` in ${path}`;
        push(`Unknown field "${key}"${where}.${hint ? ` Did you mean "${hint}"?` : allowed.length ? ` Allowed fields: ${allowed.join(', ')}.` : ''}`, pathToString([...issue.path, key]));
      }
      continue;
    }
    if (issue.code === 'invalid_type' && issue.received === 'undefined') {
      const field = String(issue.path[issue.path.length - 1] ?? 'value');
      push(issue.message && !/^Required$/i.test(issue.message) ? issue.message : `Missing required field "${field}"`);
      continue;
    }
    if (issue.code === 'invalid_type') {
      push(`${issue.message.replace(/^Expected/, 'Expected')} (found ${issue.received})`);
      continue;
    }
    if (issue.code === 'invalid_enum_value') {
      push(`Invalid value "${String(issue.received)}". Expected one of: ${issue.options.join(', ')}`);
      continue;
    }
    if (issue.code === 'invalid_union_discriminator') {
      const node = issue.path.reduce<any>((n, seg) => n?.[seg as any], raw);
      push(`Unknown ${issue.path[issue.path.length - 1] === 'kind' ? 'question kind' : 'slide type'} "${String(node)}". ${issue.message}`);
      continue;
    }
    push(issue.message);
  }
  return out;
}

export function issueToString(i: DocIssue): string {
  return `${i.path}: ${i.message}`;
}

// ---------------------------------------------------------------------------------------

/** Fills in the ids that a human or generator may reasonably omit (slides, options, questions). */
export function normalizeDoc(raw: unknown): unknown {
  if (!isObj(raw)) return raw;
  const doc: Record<string, any> = { ...raw };
  delete doc.$schema;
  if (Array.isArray(doc.slides)) {
    const used = new Set<string>(doc.slides.filter((s: any) => isObj(s) && typeof s.id === 'string').map((s: any) => s.id));
    doc.slides = doc.slides.map((s: any, i: number) => {
      if (!isObj(s)) return s;
      const slide: Record<string, any> = { ...s };
      if (slide.id === undefined) {
        let n = i + 1;
        while (used.has(`slide-${n}`)) n++;
        slide.id = `slide-${n}`;
        used.add(slide.id);
      }
      const fillOptions = (opts: unknown) =>
        Array.isArray(opts) ? opts.map((o, j) => (isObj(o) && o.id === undefined ? { id: `o${j + 1}`, ...o } : o)) : opts;
      if (slide.options !== undefined) slide.options = fillOptions(slide.options);
      if (Array.isArray(slide.questions)) {
        slide.questions = slide.questions.map((q: any, j: number) => {
          if (!isObj(q)) return q;
          const qq: Record<string, any> = { ...q };
          if (qq.id === undefined) qq.id = `q${j + 1}`;
          if (qq.options !== undefined) qq.options = fillOptions(qq.options);
          return qq;
        });
      }
      return slide;
    });
  }
  return doc;
}

export function parsePresentationDoc(input: unknown): ParseResult {
  const warnings: string[] = [];
  if (!isObj(input)) {
    return { ok: false, errors: [{ path: '(document)', message: 'A presentation must be a JSON object with "title" and "slides".', slide: null }] };
  }
  let raw: Record<string, unknown> = { ...input };

  // --- versioning -------------------------------------------------------------------
  if (raw.schemaVersion === undefined) {
    warnings.push(`"schemaVersion" was missing, so version ${SCHEMA_VERSION} was assumed.`);
    raw.schemaVersion = SCHEMA_VERSION;
  }
  if (typeof raw.schemaVersion !== 'number' || !Number.isInteger(raw.schemaVersion) || raw.schemaVersion < 1) {
    return { ok: false, errors: [{ path: 'schemaVersion', message: '"schemaVersion" must be a positive whole number', slide: null }] };
  }
  if (raw.schemaVersion > SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [
        {
          path: 'schemaVersion',
          message: `This presentation uses schema version ${raw.schemaVersion}, but this ClassInteract supports up to version ${SCHEMA_VERSION}. Update ClassInteract to open it.`,
          slide: null,
        },
      ],
    };
  }
  while ((raw.schemaVersion as number) < SCHEMA_VERSION) {
    const from = raw.schemaVersion as number;
    const migrate = MIGRATIONS[from];
    if (!migrate) {
      return { ok: false, errors: [{ path: 'schemaVersion', message: `No migration available from schema version ${from}`, slide: null }] };
    }
    raw = migrate(raw);
    raw.schemaVersion = from + 1;
    warnings.push(`Migrated from schema version ${from} to ${from + 1}.`);
  }

  // --- structure --------------------------------------------------------------------
  const normalized = normalizeDoc(raw);
  const parsed = presentationDocSchema.safeParse(normalized);
  if (!parsed.success) return { ok: false, errors: formatIssues(parsed.error.issues, normalized) };
  return { ok: true, doc: parsed.data as PresentationDoc, warnings };
}

export function parsePresentationJson(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [{ path: '(document)', message: `Not valid JSON: ${(e as Error).message}`, slide: null }] };
  }
  return parsePresentationDoc(json);
}

/**
 * Resolved defaults make exports explicit, but fields that cannot apply to a question's kind are noise
 * (`correctOptionIds: []` on a single-answer question), so they are left out. Parsing puts the defaults back.
 */
function withoutUnusedFields(slide: Slide): Slide {
  if (slide.type !== 'quiz') return slide;
  const q: Record<string, unknown> = { ...slide };
  const kind = (q.kind as string | undefined) ?? 'single';
  if (kind !== 'multiple') delete q.correctOptionIds;
  if (kind === 'single') delete q.partialCredit;
  if (Array.isArray(q.options) && q.options.length === 0) delete q.options;
  return q as unknown as Slide;
}

/** Canonical, fully-resolved JSON text. `parsePresentationJson(exportDoc(d))` yields an equal document. */
export function exportPresentationJson(doc: PresentationDoc): string {
  return JSON.stringify({ ...doc, slides: doc.slides.map(withoutUnusedFields), format: DOCUMENT_FORMAT, schemaVersion: SCHEMA_VERSION }, null, 2) + '\n';
}

/** Validates a single slide's configuration (used by the editor and the server for row-level writes). */
export function parseSlideConfig(type: SlideType, config: unknown) {
  return configSchemas[type].safeParse(config);
}

export function createEmptyDoc(title = 'Untitled presentation'): PresentationDoc {
  return { format: DOCUMENT_FORMAT, schemaVersion: SCHEMA_VERSION, title, description: '', theme: { palette: 'azure', background: 'soft' }, slides: [] };
}

// ---------------------------------------------------------------------------------------
// Layout resolution (sensible defaults when optional settings are omitted)
// ---------------------------------------------------------------------------------------

export function resolveContentLayout(c: Pick<ContentConfig, 'layout' | 'image' | 'title' | 'body' | 'steps'>): (typeof CONTENT_LAYOUTS)[number] {
  if (c.layout) return c.layout;
  if (c.image && !c.title && !c.body && c.steps.length === 0) return 'full-image';
  if (c.image) return 'image-text';
  if (c.steps.length > 0) return 'instructions';
  if (c.title && !c.body) return 'title';
  return 'text';
}

export function isPalette(v: string): v is (typeof PALETTES)[number] {
  return (PALETTES as readonly string[]).includes(v);
}

export function isSlideType(v: string): v is SlideType {
  return (SLIDE_TYPES as readonly string[]).includes(v);
}

export type { Slide };
