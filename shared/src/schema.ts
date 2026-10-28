/**
 * Canonical, versioned presentation document.
 *
 * One JSON shape describes a presentation: metadata, theme, and an ordered list of slides.
 * Every slide is either a content slide or an interactive activity. The JSON describes
 * content and semantic intent (layout *templates*, not coordinates); the renderer decides
 * how it is laid out. The visual editor, JSON import/export, the seed data and live
 * sessions all operate on this same model.
 */
import { z } from 'zod';
import { SLUG_RE } from './ids';

export const SCHEMA_VERSION = 1;
export const DOCUMENT_FORMAT = 'classinteract.presentation';

export const PALETTES = ['azure', 'lavender', 'mint', 'peach', 'rose', 'slate'] as const;
export const BACKGROUNDS = ['soft', 'plain', 'gradient', 'grid'] as const;
export const APPEARANCES = ['light', 'dark'] as const;
export const CONTENT_LAYOUTS = ['title', 'text', 'image-text', 'full-image', 'instructions'] as const;
/**
 * How a quiz question is answered.
 *   single    pick one option (`correctOptionId`)
 *   multiple  tick every option that applies (`correctOptionIds`); optional partial credit
 *   match     connect each left item to its right item (`pairs`)
 *   order     put `items` in the right order (the order they are written in is the answer)
 *   text      type an answer, graded against `acceptedAnswers` (case and spacing rules configurable)
 *   numeric   type a number, graded against `numeric.value` with an optional absolute and/or relative tolerance
 *   hotspot   tap a point on the slide's image, graded against `regions` (normalised 0–1 coordinates)
 */
export const QUIZ_KINDS = ['single', 'multiple', 'match', 'order', 'text', 'numeric', 'hotspot'] as const;
export type QuizKind = (typeof QUIZ_KINDS)[number];

export const SLIDE_TYPES = ['content', 'quiz', 'poll', 'wordcloud', 'open', 'rating', 'survey'] as const;
export const INTERACTIVE_TYPES = ['quiz', 'poll', 'wordcloud', 'open', 'rating', 'survey'] as const;

export type Palette = (typeof PALETTES)[number];
export type ContentLayout = (typeof CONTENT_LAYOUTS)[number];
export type SlideType = (typeof SLIDE_TYPES)[number];
export type InteractiveType = (typeof INTERACTIVE_TYPES)[number];

// ---------------------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------------------

/** Returns an error message for unsafe image URLs, or null when the URL is acceptable. */
export function checkImageUrl(url: string): string | null {
  if (url.length > 2000) return 'Image URL is too long (maximum 2000 characters).';
  if (url.startsWith('/') && !url.startsWith('//') && !url.includes('\\')) return null; // uploaded or bundled image
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Image URL must be a full https:// address (or an uploaded image path starting with "/").';
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return `Image URLs must start with https:// or http:// (got "${parsed.protocol}").`;
  }
  if (parsed.username || parsed.password) return 'Image URLs must not contain a username or password.';
  return null;
}

/** Video and audio: YouTube and Vimeo embeds, or a direct https / uploaded file in a browser-playable format. */
export const MEDIA_FILE_EXT = ['mp4', 'webm', 'ogv', 'mp3', 'ogg', 'oga', 'wav', 'm4a'] as const;

export type MediaSource = { provider: 'youtube'; id: string } | { provider: 'vimeo'; id: string } | { provider: 'file'; url: string };

/** Recognise a media URL. Only these providers are ever embedded; anything else is rejected at validation. */
export function parseMediaUrl(url: string): MediaSource | null {
  const u = url.trim();
  if (u.startsWith('/uploads/') && !u.includes('..') && !u.includes('\\')) {
    const ext = u.split('.').pop()?.toLowerCase() ?? '';
    return (MEDIA_FILE_EXT as readonly string[]).includes(ext) ? { provider: 'file', url: u } : null;
  }
  let p: URL;
  try { p = new URL(u); } catch { return null; }
  if (p.protocol !== 'https:' || p.username || p.password) return null;
  const host = p.hostname.replace(/^www\./, '').replace(/^m\./, '');
  const ytId = (v: string | null | undefined) => (v && /^[A-Za-z0-9_-]{6,20}$/.test(v) ? v : null);
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const id = ytId(p.searchParams.get('v')) ?? ytId(p.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/)?.[1]);
    return id ? { provider: 'youtube', id } : null;
  }
  if (host === 'youtu.be') {
    const id = ytId(p.pathname.slice(1).split('/')[0]);
    return id ? { provider: 'youtube', id } : null;
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = p.pathname.match(/(?:^|\/)(\d{5,12})(?:$|\/)/)?.[1];
    return id ? { provider: 'vimeo', id } : null;
  }
  const ext = p.pathname.split('.').pop()?.toLowerCase() ?? '';
  return (MEDIA_FILE_EXT as readonly string[]).includes(ext) ? { provider: 'file', url: u } : null;
}

/** WCAG relative luminance of a #rrggbb colour. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const text = (min: number, max: number, what = 'Text') =>
  z
    .string({ required_error: `${what} is required`, invalid_type_error: `${what} must be text` })
    .trim()
    .min(min, min === 1 ? `${what} cannot be empty` : `${what} needs at least ${min} characters`)
    .max(max, `${what} is too long (maximum ${max} characters)`);

const optionalText = (max: number, what = 'Text') =>
  z.string({ invalid_type_error: `${what} must be text` }).trim().max(max, `${what} is too long (maximum ${max} characters)`).default('');

const itemId = z
  .string({ required_error: 'An id is required' })
  .regex(/^[A-Za-z0-9_-]{1,32}$/, 'Ids may only contain letters, numbers, "-" and "_" (max 32 characters)');

export const imageSchema = z
  .object({
    url: z.string({ required_error: 'Image needs a "url"' }).trim().superRefine((v, ctx) => {
      const err = checkImageUrl(v);
      if (err) ctx.addIssue({ code: 'custom', message: err });
    }),
    alt: optionalText(240, 'Alt text'),
    fit: z.enum(['cover', 'contain'], { errorMap: () => ({ message: 'Image fit must be "cover" or "contain"' }) }).default('cover'),
  })
  .strict();
export type SlideImage = z.infer<typeof imageSchema>;

export const mediaSchema = z
  .object({
    url: z.string({ required_error: 'Media needs a "url"' }).trim().max(2000, 'Media URL is too long').superRefine((v, ctx) => {
      if (!parseMediaUrl(v)) ctx.addIssue({ code: 'custom', message: `Use a YouTube or Vimeo link, or an https:// file ending in ${MEDIA_FILE_EXT.map((e) => '.' + e).join(', ')}` });
    }),
    kind: z.enum(['video', 'audio'], { errorMap: () => ({ message: 'Media kind must be "video" or "audio"' }) }).default('video'),
    title: optionalText(160, 'Media title'),
    start: z.number().int().min(0).max(86400).optional(),
    /** Also show the player on participants' phones (off: it plays on the main screen only). */
    phones: z.boolean().default(false),
  })
  .strict();
export type SlideMedia = z.infer<typeof mediaSchema>;

const timeLimit = z
  .number({ invalid_type_error: 'Time limit must be a number of seconds' })
  .int('Time limit must be a whole number of seconds')
  .min(5, 'Time limit must be at least 5 seconds')
  .max(900, 'Time limit can be at most 900 seconds')
  .nullable()
  .default(null);

const optionSchema = z
  .object({ id: itemId, text: text(1, 160, 'Option text') })
  .strict();

const quizOptionSchema = z
  .object({
    id: itemId,
    text: text(1, 160, 'Option text'),
    /** Optional: the misunderstanding that usually leads someone to pick this (wrong) option. */
    misconception: z.string().trim().max(120, 'Misconception is too long (maximum 120 characters)').optional(),
  })
  .strict();

const regionSchema = z
  .object({
    id: itemId,
    shape: z.enum(['rect', 'ellipse'], { errorMap: () => ({ message: 'Region shape must be "rect" or "ellipse"' }) }).default('rect'),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().gt(0, 'Region width must be more than 0').max(1),
    h: z.number().gt(0, 'Region height must be more than 0').max(1),
    label: optionalText(80, 'Region label'),
  })
  .strict();
export type HotspotRegion = z.infer<typeof regionSchema>;

const pairSchema = z
  .object({ id: itemId, left: text(1, 120, 'Left item'), right: text(1, 120, 'Right item') })
  .strict();

/** What an audience sees of a match or order question: shuffled, opaque ids, and the answer only once revealed. */
const quizViewSchema = z.object({
  lefts: z.array(z.object({ id: z.string(), text: z.string() })),
  rights: z.array(z.object({ id: z.string(), text: z.string() })),
  items: z.array(z.object({ id: z.string(), text: z.string() })),
  answerMap: z.record(z.string()).optional(),
  answerOrder: z.array(z.string()).optional(),
  /** Numeric questions: the unit to show next to the answer box before the answer is revealed. */
  unit: z.string().optional(),
});

const base = {
  notes: optionalText(4000, 'Speaker notes'),
  image: imageSchema.optional(),
  media: mediaSchema.optional(),
};

const interactiveBase = {
  ...base,
  timeLimitSec: timeLimit,
  autoOpen: z.boolean().default(true),
};

// ---------------------------------------------------------------------------------------
// Slide shapes (plain objects; cross-field rules live in the `refine*` functions below)
// ---------------------------------------------------------------------------------------

export const contentShape = {
  ...base,
  layout: z.enum(CONTENT_LAYOUTS, { errorMap: () => ({ message: `Layout must be one of: ${CONTENT_LAYOUTS.join(', ')}` }) }).optional(),
  title: optionalText(160, 'Title'),
  body: optionalText(2500, 'Body'),
  steps: z.array(text(1, 240, 'Step')).max(12, 'An instruction slide can have at most 12 steps').default([]),
  callout: z
    .object({ tone: z.enum(['info', 'warning', 'success']).default('info'), text: text(1, 400, 'Callout text') })
    .strict()
    .optional(),
};

export const quizShape = {
  ...interactiveBase,
  question: text(1, 300, 'Question'),
  kind: z.enum(QUIZ_KINDS, { errorMap: () => ({ message: `Question kind must be one of: ${QUIZ_KINDS.join(', ')}` }) }).default('single'),
  // Which of the fields below apply depends on `kind` (checked in the quiz refiner). Unused ones are left out of exports.
  options: z.array(quizOptionSchema).max(6, 'A quiz can have at most 6 options').default([]),
  correctOptionId: itemId.optional(),
  correctOptionIds: z.array(itemId).max(6).default([]),
  pairs: z.array(pairSchema).max(6, 'A matching question can have at most 6 pairs').default([]),
  items: z.array(optionSchema).max(6, 'An ordering question can have at most 6 items').default([]),
  partialCredit: z.boolean().default(true),
  // typed answers
  acceptedAnswers: z.array(text(1, 200, 'Accepted answer')).max(20, 'At most 20 accepted answers').default([]),
  caseSensitive: z.boolean().default(false),
  /** normalize: trim and collapse runs of spaces; ignore: remove all whitespace (good for code and formulas); exact: compare as typed */
  whitespace: z.enum(['normalize', 'ignore', 'exact']).default('normalize'),
  // numeric answers
  numeric: z
    .object({
      value: z.number({ required_error: 'The correct number is required', invalid_type_error: 'The correct answer must be a number' }).finite(),
      tolerance: z.number().min(0, 'Tolerance cannot be negative').default(0),
      tolerancePercent: z.number().min(0, 'Tolerance cannot be negative').max(100).default(0),
      unit: optionalText(20, 'Unit'),
    })
    .strict()
    .optional(),
  // hotspot
  regions: z.array(regionSchema).max(10, 'At most 10 correct regions').default([]),
  /** Optional teaching metadata: the concepts this question checks. */
  concepts: z.array(text(1, 60, 'Concept')).max(8, 'At most 8 concepts').optional(),
  /** Optional: what to do next depending on how the class (or, self-paced, the person) did. */
  branch: z
    .object({
      threshold: z.number().int().min(1).max(100).default(60),
      below: z.string().regex(SLUG_RE).optional(),
      atOrAbove: z.string().regex(SLUG_RE).optional(),
    })
    .strict()
    .optional(),
  /** Generated for the audience; never authored. */
  view: quizViewSchema.optional(),
  explanation: optionalText(500, 'Explanation'),
  scored: z.boolean().default(true),
  points: z.number().int().min(10, 'Points must be at least 10').max(10000, 'Points can be at most 10000').default(1000),
  speedBonus: z.boolean().default(false),
  showResultsToParticipants: z.boolean().default(true),
};

export const pollShape = {
  ...interactiveBase,
  question: text(1, 300, 'Question'),
  options: z.array(optionSchema, { required_error: 'A poll needs "options"' }).min(2, 'A poll needs 2–10 options').max(10, 'A poll can have at most 10 options'),
  multiple: z.boolean().default(false),
  maxSelections: z.number().int().min(1).nullable().default(null),
  anonymous: z.boolean().default(false),
  liveResults: z.boolean().default(true),
  showResultsToParticipants: z.boolean().default(true),
};

export const wordcloudShape = {
  ...interactiveBase,
  question: text(1, 300, 'Prompt'),
  maxLength: z.number().int().min(1).max(100, 'Word cloud responses can be at most 100 characters').default(40),
  maxWords: z.number().int().min(1).max(10, 'Word cloud responses can have at most 10 words').default(5),
  maxSubmissions: z.number().int().min(1).max(10, 'Participants can submit at most 10 responses').default(3),
  moderation: z.enum(['off', 'premoderate']).default('off'),
  liveResults: z.boolean().default(true),
  showResultsToParticipants: z.boolean().default(true),
};

export const openShape = {
  ...interactiveBase,
  question: text(1, 300, 'Question'),
  mode: z.enum(['short', 'paragraph']).default('short'),
  maxLength: z.number().int().min(10).max(2000, 'Open responses can be at most 2000 characters').optional(),
  maxSubmissions: z.number().int().min(1).max(5, 'Participants can submit at most 5 responses').default(1),
  moderation: z.enum(['off', 'premoderate']).default('off'),
  liveResults: z.boolean().default(true),
  showResultsToParticipants: z.boolean().default(false),
};

export const ratingShape = {
  ...interactiveBase,
  question: text(1, 300, 'Question'),
  min: z.union([z.literal(0), z.literal(1)], { errorMap: () => ({ message: 'Scale must start at 0 or 1' }) }).default(1),
  max: z.number().int().min(2).max(10, 'Scale can go up to 10').default(5),
  minLabel: optionalText(40, 'Low-end label'),
  maxLabel: optionalText(40, 'High-end label'),
  /** Optional: this rating is a confidence check for these quiz slides (compared person by person in the results). */
  confidenceFor: z.array(z.string().regex(SLUG_RE)).max(20).optional(),
  liveResults: z.boolean().default(true),
  showResultsToParticipants: z.boolean().default(true),
};

const surveyChoiceQ = z
  .object({
    id: itemId,
    kind: z.literal('choice'),
    question: text(1, 300, 'Question'),
    options: z.array(optionSchema).min(2, 'A choice question needs 2–10 options').max(10),
    multiple: z.boolean().default(false),
    maxSelections: z.number().int().min(1).nullable().default(null),
    required: z.boolean().default(true),
  })
  .strict();
const surveyRatingQ = z
  .object({
    id: itemId,
    kind: z.literal('rating'),
    question: text(1, 300, 'Question'),
    min: z.union([z.literal(0), z.literal(1)]).default(1),
    max: z.number().int().min(2).max(10).default(5),
    minLabel: optionalText(40, 'Low-end label'),
    maxLabel: optionalText(40, 'High-end label'),
    required: z.boolean().default(true),
  })
  .strict();
const surveyTextQ = z
  .object({
    id: itemId,
    kind: z.literal('text'),
    question: text(1, 300, 'Question'),
    mode: z.enum(['short', 'paragraph']).default('short'),
    maxLength: z.number().int().min(10).max(2000).optional(),
    required: z.boolean().default(false),
  })
  .strict();
export const surveyQuestionSchema = z.discriminatedUnion('kind', [surveyChoiceQ, surveyRatingQ, surveyTextQ], {
  errorMap: () => ({ message: 'Survey question "kind" must be "choice", "rating" or "text"' }),
});
export type SurveyQuestion = z.infer<typeof surveyQuestionSchema>;

export const surveyShape = {
  ...interactiveBase,
  title: text(1, 200, 'Survey title'),
  description: optionalText(500, 'Description'),
  questions: z.array(surveyQuestionSchema, { required_error: 'A survey needs "questions"' }).min(1, 'A survey needs at least 1 question').max(20, 'A survey can have at most 20 questions'),
  liveResults: z.boolean().default(true),
  showResultsToParticipants: z.boolean().default(false),
};

export const shapes = {
  content: contentShape,
  quiz: quizShape,
  poll: pollShape,
  wordcloud: wordcloudShape,
  open: openShape,
  rating: ratingShape,
  survey: surveyShape,
} as const;

// ---------------------------------------------------------------------------------------
// Cross-field rules
// ---------------------------------------------------------------------------------------

type Ctx = z.RefinementCtx;
const fail = (ctx: Ctx, path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });

function uniqueIds(ctx: Ctx, items: { id: string }[], path: (string | number)[], what: string) {
  const seen = new Set<string>();
  items.forEach((it, i) => {
    if (seen.has(it.id)) fail(ctx, [...path, i, 'id'], `Duplicate ${what} id "${it.id}"`);
    seen.add(it.id);
  });
}

function refineMaxSelections(ctx: Ctx, c: { multiple: boolean; maxSelections: number | null; options: { id: string }[] }, path: (string | number)[]) {
  if (c.maxSelections !== null) {
    if (!c.multiple) fail(ctx, [...path, 'maxSelections'], '"maxSelections" only applies when "multiple" is true');
    else if (c.maxSelections > c.options.length) fail(ctx, [...path, 'maxSelections'], `"maxSelections" (${c.maxSelections}) cannot exceed the number of options (${c.options.length})`);
  }
}

export const refiners: Record<SlideType, (c: any, ctx: Ctx) => void> = {
  content(c, ctx) {
    if (!c.title && !c.body && !c.image && c.steps.length === 0) {
      fail(ctx, [], 'A content slide needs at least a title, body text, steps or an image');
    }
    if ((c.layout === 'image-text' || c.layout === 'full-image') && !c.image) {
      fail(ctx, ['image'], `Layout "${c.layout}" needs an "image" (add one, or choose layout "text")`);
    }
    if (c.layout === 'instructions' && c.steps.length === 0 && !c.body) {
      fail(ctx, ['steps'], 'Layout "instructions" needs "steps" (or body text)');
    }
  },
  quiz(c, ctx) {
    const kind: QuizKind = c.kind ?? 'single';
    const choice = kind === 'single' || kind === 'multiple';
    const ids = new Set<string>(c.options.map((o: { id: string }) => o.id));
    const valid = () => `Valid ids: ${c.options.map((o: { id: string }) => o.id).join(', ')}`;
    const unused = (field: string, used: string) => fail(ctx, [field], `"${field}" is not used by kind "${kind}"${used ? `. It belongs to kind ${used}` : ''}`);

    if (c.view !== undefined) fail(ctx, ['view'], '"view" is generated for the audience and cannot be set');
    uniqueIds(ctx, c.options, ['options'], 'option');
    uniqueIds(ctx, c.pairs, ['pairs'], 'pair');
    uniqueIds(ctx, c.items, ['items'], 'item');

    // fields that belong to other kinds are errors, so a typo in "kind" never silently drops an answer key
    if (!choice && c.options.length > 0) unused('options', '"single" or "multiple"');
    if (kind !== 'match' && c.pairs.length > 0) unused('pairs', '"match"');
    if (kind !== 'order' && c.items.length > 0) unused('items', '"order"');
    if (kind !== 'single' && c.correctOptionId !== undefined) unused('correctOptionId', '"single"');
    if (kind !== 'multiple' && c.correctOptionIds.length > 0) unused('correctOptionIds', '"multiple"');
    if (kind !== 'text' && c.acceptedAnswers.length > 0) unused('acceptedAnswers', '"text"');
    if (kind !== 'numeric' && c.numeric !== undefined) unused('numeric', '"numeric"');
    if (kind !== 'hotspot' && c.regions.length > 0) unused('regions', '"hotspot"');
    if (!choice && c.options.some((o: { misconception?: string }) => o.misconception)) fail(ctx, ['options'], 'Misconceptions belong to answer options');

    if (choice && c.options.length < 2) fail(ctx, ['options'], 'A quiz needs 2–6 options');
    if (kind === 'single') {
      if (!c.correctOptionId) fail(ctx, ['correctOptionId'], 'A single-answer quiz needs "correctOptionId"');
      else if (!ids.has(c.correctOptionId)) fail(ctx, ['correctOptionId'], `"correctOptionId" ("${c.correctOptionId}") does not match any option. ${valid()}`);
    } else if (kind === 'multiple') {
      if (c.correctOptionIds.length === 0) fail(ctx, ['correctOptionIds'], 'Mark at least one correct answer in "correctOptionIds"');
      const seen = new Set<string>();
      c.correctOptionIds.forEach((id: string, i: number) => {
        if (!ids.has(id)) fail(ctx, ['correctOptionIds', i], `"${id}" does not match any option. ${valid()}`);
        else if (seen.has(id)) fail(ctx, ['correctOptionIds', i], `"${id}" is listed twice`);
        seen.add(id);
      });
    } else if (kind === 'match') {
      if (c.pairs.length < 2) fail(ctx, ['pairs'], 'A matching question needs 2–6 pairs');
      const rights = new Set<string>();
      c.pairs.forEach((p: { right: string }, i: number) => {
        const key = p.right.trim().toLowerCase();
        if (rights.has(key)) fail(ctx, ['pairs', i, 'right'], `Two pairs share the right item "${p.right}", so the match would be ambiguous`);
        rights.add(key);
      });
    } else if (kind === 'order') {
      if (c.items.length < 2) fail(ctx, ['items'], 'An ordering question needs 2–6 items, written in the correct order');
    } else if (kind === 'text') {
      if (c.acceptedAnswers.length === 0) fail(ctx, ['acceptedAnswers'], 'A typed-answer question needs at least one accepted answer in "acceptedAnswers"');
    } else if (kind === 'numeric') {
      if (!c.numeric) fail(ctx, ['numeric'], 'A numeric question needs "numeric": { "value": … }');
    } else if (kind === 'hotspot') {
      if (!c.image) fail(ctx, ['image'], 'A hotspot question needs an "image" to click on');
      if (c.regions.length === 0) fail(ctx, ['regions'], 'Mark at least one correct region in "regions"');
      uniqueIds(ctx, c.regions, ['regions'], 'region');
      c.regions.forEach((r: { x: number; y: number; w: number; h: number }, i: number) => {
        if (r.x + r.w > 1.0001 || r.y + r.h > 1.0001) fail(ctx, ['regions', i], 'A region must stay inside the image (x + w and y + h at most 1)');
      });
    }
    if (c.branch && !c.branch.below && !c.branch.atOrAbove) fail(ctx, ['branch'], 'A branch needs a slide for "below" and/or "atOrAbove"');
    if (c.speedBonus && c.timeLimitSec === null) fail(ctx, ['speedBonus'], 'A speed bonus needs a countdown: set "timeLimitSec"');
    if (c.speedBonus && !c.scored) fail(ctx, ['speedBonus'], 'A speed bonus needs "scored": true');
  },
  poll(c, ctx) {
    uniqueIds(ctx, c.options, ['options'], 'option');
    refineMaxSelections(ctx, c, []);
  },
  wordcloud() {},
  open(c, ctx) {
    if (c.mode === 'short' && c.maxLength !== undefined && c.maxLength > 280) {
      fail(ctx, ['maxLength'], 'Short answers are limited to 280 characters; use mode "paragraph" for longer answers');
    }
  },
  rating(c, ctx) {
    if (c.max <= c.min) fail(ctx, ['max'], `"max" (${c.max}) must be greater than "min" (${c.min})`);
  },
  survey(c, ctx) {
    uniqueIds(ctx, c.questions, ['questions'], 'question');
    c.questions.forEach((q: any, i: number) => {
      if (q.kind === 'choice') {
        uniqueIds(ctx, q.options, ['questions', i, 'options'], 'option');
        refineMaxSelections(ctx, q, ['questions', i]);
      }
      if (q.kind === 'rating' && q.max <= q.min) fail(ctx, ['questions', i, 'max'], `"max" (${q.max}) must be greater than "min" (${q.min})`);
      if (q.kind === 'text' && q.mode === 'short' && q.maxLength !== undefined && q.maxLength > 280) {
        fail(ctx, ['questions', i, 'maxLength'], 'Short answers are limited to 280 characters');
      }
    });
  },
};

/** Schema for the *configuration* of one slide type (everything except `id` and `type`). */
export const configSchemas = Object.fromEntries(
  SLIDE_TYPES.map((t) => [t, z.object(shapes[t] as z.ZodRawShape).strict().superRefine(refiners[t])]),
) as unknown as Record<SlideType, z.ZodType<any, any, any>>;

// ---------------------------------------------------------------------------------------
// Slide + presentation documents
// ---------------------------------------------------------------------------------------

const slideId = z
  .string({ required_error: 'Every slide needs an "id"' })
  .regex(SLUG_RE, 'Slide ids may only contain letters, numbers, "-" and "_" (max 64 characters, start with a letter or number)');

const slideObjects = SLIDE_TYPES.map((t) =>
  z.object({ id: slideId, type: z.literal(t), ...shapes[t] } as z.ZodRawShape).strict(),
) as unknown as [z.ZodObject<any>, z.ZodObject<any>, ...z.ZodObject<any>[]];

export const slideSchema = z
  .discriminatedUnion('type', slideObjects, {
    errorMap: (issue, ctx) =>
      issue.code === 'invalid_union_discriminator'
        ? { message: `Unknown slide type. Use one of: ${SLIDE_TYPES.join(', ')}` }
        : { message: ctx.defaultError },
  })
  .superRefine((s: any, ctx) => {
    const { id: _id, type, ...config } = s;
    refiners[type as SlideType](config, ctx);
  });

export const themeSchema = z
  .object({
    palette: z.enum(PALETTES, { errorMap: () => ({ message: `Palette must be one of: ${PALETTES.join(', ')}` }) }).default('azure'),
    background: z.enum(BACKGROUNDS, { errorMap: () => ({ message: `Background must be one of: ${BACKGROUNDS.join(', ')}` }) }).default('soft'),
    /** Optional custom accent (#rrggbb). Must keep white text readable on it. */
    accent: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Accent must be a colour like #3347ff')
      .refine((v) => contrastRatio(v, '#ffffff') >= 4.5, 'That accent is too light for white text on buttons. Pick a darker colour (contrast with white of at least 4.5:1).')
      .optional(),
    /** The presentation's own look on the projector. The presenter can still override it per session. */
    appearance: z.enum(APPEARANCES).optional(),
    logo: z
      .object({
        url: z.string().trim().superRefine((v, ctx) => {
          const e = checkImageUrl(v);
          if (e) ctx.addIssue({ code: 'custom', message: e });
        }),
        alt: optionalText(120, 'Logo description'),
      })
      .strict()
      .optional(),
    footer: z.string().trim().max(120, 'Footer is too long (maximum 120 characters)').optional(),
  })
  .strict();
export type Theme = z.infer<typeof themeSchema>;

export const presentationDocSchema = z
  .object({
    format: z.literal(DOCUMENT_FORMAT, { errorMap: () => ({ message: `"format" must be "${DOCUMENT_FORMAT}"` }) }).default(DOCUMENT_FORMAT),
    schemaVersion: z.number({ required_error: '"schemaVersion" is required', invalid_type_error: '"schemaVersion" must be a number' }).int(),
    title: text(1, 140, 'Presentation title'),
    description: optionalText(600, 'Description'),
    theme: themeSchema.default({}),
    slides: z.array(slideSchema, { required_error: '"slides" is required' }).max(150, 'A presentation can have at most 150 slides'),
  })
  .strict()
  .superRefine((d, ctx) => {
    const seen = new Set<string>();
    d.slides.forEach((s: any, i) => {
      if (seen.has(s.id)) fail(ctx, ['slides', i, 'id'], `Duplicate slide id "${s.id}" — slide ids must be unique`);
      seen.add(s.id);
    });
    // references between slides (branches, confidence pairing) must point at slides that exist
    const byId = new Map(d.slides.map((s: any) => [s.id, s]));
    d.slides.forEach((s: any, i) => {
      for (const k of ['below', 'atOrAbove'] as const) {
        const target = s.branch?.[k];
        if (target !== undefined && !byId.has(target)) fail(ctx, ['slides', i, 'branch', k], `Branch target "${target}" is not a slide in this presentation`);
        if (target === s.id) fail(ctx, ['slides', i, 'branch', k], 'A branch cannot point at its own slide');
      }
      (s.confidenceFor ?? []).forEach((id: string, j: number) => {
        const t: any = byId.get(id);
        if (!t) fail(ctx, ['slides', i, 'confidenceFor', j], `"${id}" is not a slide in this presentation`);
        else if (t.type !== 'quiz') fail(ctx, ['slides', i, 'confidenceFor', j], `"${id}" is not a quiz, so there is no correctness to compare with`);
      });
    });
  });

// ---------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------

type Out<T extends SlideType> = z.output<z.ZodObject<(typeof shapes)[T]>>;
export type ContentConfig = Out<'content'>;
export type QuizConfig = Out<'quiz'>;
export type PollConfig = Out<'poll'>;
export type WordcloudConfig = Out<'wordcloud'>;
export type OpenConfig = Out<'open'>;
export type RatingConfig = Out<'rating'>;
export type SurveyConfig = Out<'survey'>;

export interface ConfigByType {
  content: ContentConfig;
  quiz: QuizConfig;
  poll: PollConfig;
  wordcloud: WordcloudConfig;
  open: OpenConfig;
  rating: RatingConfig;
  survey: SurveyConfig;
}
export type AnyConfig = ConfigByType[SlideType];

export type Slide = { [T in SlideType]: { id: string; type: T } & ConfigByType[T] }[SlideType];
export type PresentationDoc = {
  format: typeof DOCUMENT_FORMAT;
  schemaVersion: number;
  title: string;
  description: string;
  theme: Theme;
  slides: Slide[];
};
