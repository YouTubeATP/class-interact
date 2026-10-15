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
export const BACKGROUNDS = ['soft', 'plain'] as const;
export const CONTENT_LAYOUTS = ['title', 'text', 'image-text', 'full-image', 'instructions'] as const;
/**
 * How a quiz question is answered.
 *   single    pick one option (`correctOptionId`)
 *   multiple  tick every option that applies (`correctOptionIds`); optional partial credit
 */
export const QUIZ_KINDS = ['single', 'multiple'] as const;
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

const base = {
  notes: optionalText(4000, 'Speaker notes'),
  image: imageSchema.optional(),
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
  options: z.array(optionSchema).max(6, 'A quiz can have at most 6 options').default([]),
  correctOptionId: itemId.optional(),
  correctOptionIds: z.array(itemId).max(6).default([]),
  partialCredit: z.boolean().default(true),
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
    const ids = new Set<string>(c.options.map((o: { id: string }) => o.id));
    const valid = () => `Valid ids: ${c.options.map((o: { id: string }) => o.id).join(', ')}`;
    uniqueIds(ctx, c.options, ['options'], 'option');
    if (c.options.length < 2) fail(ctx, ['options'], 'A quiz needs 2–6 options');

    if (kind === 'single') {
      if (!c.correctOptionId) fail(ctx, ['correctOptionId'], 'A single-answer quiz needs "correctOptionId"');
      else if (!ids.has(c.correctOptionId)) fail(ctx, ['correctOptionId'], `"correctOptionId" ("${c.correctOptionId}") does not match any option. ${valid()}`);
      if (c.correctOptionIds.length > 0) fail(ctx, ['correctOptionIds'], '"correctOptionIds" is for kind "multiple". A single-answer quiz uses "correctOptionId"');
    } else if (kind === 'multiple') {
      if (c.correctOptionId !== undefined) fail(ctx, ['correctOptionId'], '"correctOptionId" is for kind "single". A multiple-answer quiz uses "correctOptionIds"');
      if (c.correctOptionIds.length === 0) fail(ctx, ['correctOptionIds'], 'Mark at least one correct answer in "correctOptionIds"');
      const seen = new Set<string>();
      c.correctOptionIds.forEach((id: string, i: number) => {
        if (!ids.has(id)) fail(ctx, ['correctOptionIds', i], `"${id}" does not match any option. ${valid()}`);
        else if (seen.has(id)) fail(ctx, ['correctOptionIds', i], `"${id}" is listed twice`);
        seen.add(id);
      });
    }
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
