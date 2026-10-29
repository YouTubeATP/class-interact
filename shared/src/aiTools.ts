/**
 * The editing tools an AI assistant is given for building a presentation, as pure functions over the presentation
 * document. They run wherever the document lives (in the editor, in tests): nothing here touches a database or the
 * network, and nothing reaches beyond the one presentation being edited.
 *
 * Every call is validated by the same pipeline as JSON import, so the assistant can never leave the deck in a state
 * the editor could not have produced, and a rejected call returns the same actionable messages a person would see,
 * which lets the model correct itself.
 */
import { definitions } from './activities';
import { exportPresentationJson, parsePresentationDoc, withoutUnusedFields } from './document';
import { nextId } from './activities';
import { PALETTES, BACKGROUNDS, SLIDE_TYPES, type PresentationDoc, type Slide } from './schema';

export interface AiToolDef {
  name: string;
  description: string;
  /** JSON Schema (draft-07). Deliberately loose for slide contents: the document validator is the real contract. */
  parameters: Record<string, unknown>;
}

export type AiToolResult = { ok: true; [key: string]: unknown } | { ok: false; error: string; issues?: string[] };

export interface AiToolOutcome {
  doc: PresentationDoc;
  result: AiToolResult;
  changed: boolean;
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });
const slideContent = {
  type: 'object',
  description: 'The slide\'s fields exactly as in the format reference (for example question, options, correctOptionId). Do not repeat "type".',
  additionalProperties: true,
};

export const AI_TOOLS: AiToolDef[] = [
  {
    name: 'get_presentation',
    description: 'Read the presentation being edited: title, theme and a list of slides (index, id, type, title). Pass slide_id to read one slide in full. Call this first, and again whenever you are unsure what the deck currently contains.',
    parameters: obj({ slide_id: { type: 'string', description: 'Return this slide\'s full contents instead of the overview.' } }),
  },
  {
    name: 'set_presentation_info',
    description: 'Change the presentation\'s title, description or colour theme.',
    parameters: obj({
      title: { type: 'string' },
      description: { type: 'string' },
      palette: { type: 'string', enum: [...PALETTES] },
      background: { type: 'string', enum: [...BACKGROUNDS] },
    }),
  },
  {
    name: 'add_slides',
    description: 'Add one or more slides in a single call. Prefer this when building several slides: it is all-or-nothing, so if any slide is invalid nothing is added and you are told which one to fix.',
    parameters: obj({
      slides: { type: 'array', minItems: 1, maxItems: 20, items: obj({ type: { type: 'string', enum: [...SLIDE_TYPES] }, config: slideContent }, ['type', 'config']) },
      position: { type: 'integer', minimum: 0, description: 'Insert at this 0-based index. Omit to add at the end.' },
    }, ['slides']),
  },
  {
    name: 'update_slide',
    description: 'Change fields of an existing slide. Only the fields you give are changed (arrays such as options are replaced as a whole). Set a field to null to remove it. To change a quiz\'s kind, set the new kind, its answer key, and null the fields of the old kind.',
    parameters: obj({ slide_id: { type: 'string' }, changes: slideContent }, ['slide_id', 'changes']),
  },
  {
    name: 'delete_slide',
    description: 'Delete a slide. Only do this when the user asked for it.',
    parameters: obj({ slide_id: { type: 'string' } }, ['slide_id']),
  },
  {
    name: 'move_slide',
    description: 'Move a slide to a new 0-based position.',
    parameters: obj({ slide_id: { type: 'string' }, to_index: { type: 'integer', minimum: 0 } }, ['slide_id', 'to_index']),
  },
];

export const AI_TOOL_NAMES = AI_TOOLS.map((t) => t.name);

// ---------------------------------------------------------------------------------------

type Raw = Record<string, any>;
const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const fail = (error: string, issues?: string[]): AiToolResult => ({ ok: false, error, ...(issues?.length ? { issues } : {}) });

/** A slide as the assistant sees it: stripped of fields that do not apply, so nothing misleading is shown. */
function cleanSlide(slide: Slide): Raw {
  return withoutUnusedFields(slide) as unknown as Raw;
}

function summary(slide: Slide, index: number): Raw {
  const { id, type, ...config } = slide as Raw;
  const kind = type === 'quiz' ? (config.kind ?? 'single') : undefined;
  return { index, id, type, ...(kind ? { kind } : {}), title: (definitions[type as Slide['type']] as any).titleOf(config) };
}

/** Compact overview of a deck, used both by get_presentation and as context for the model. */
export function describeDeck(doc: PresentationDoc): Raw {
  return {
    title: doc.title,
    description: doc.description,
    theme: doc.theme,
    slide_count: doc.slides.length,
    slides: doc.slides.map((s, i) => summary(s, i)),
  };
}

/** Validates a raw document; on failure returns messages written for the model, relative to the slide that caused them. */
function commit(before: PresentationDoc, raw: Raw, success: Raw, focus?: { index: number; label: string }): AiToolOutcome {
  const parsed = parsePresentationDoc(raw);
  if (parsed.ok) return { doc: parsed.doc, result: { ok: true, ...success, slide_count: parsed.doc.slides.length }, changed: true };
  const issues = parsed.errors.map((e) => {
    const m = /^slides\[(\d+)\]\.?(.*)$/.exec(e.path);
    const where = m ? (focus && Number(m[1]) === focus.index ? m[2] : `slide ${m[1]}${m[2] ? `.${m[2]}` : ''}`) : e.path;
    return `${where || focus?.label || 'slide'}: ${e.message}`;
  });
  return { doc: before, result: fail('Nothing was changed because the result is not a valid presentation. Fix these and try again.', issues), changed: false };
}

function rawOf(doc: PresentationDoc): Raw {
  return JSON.parse(exportPresentationJson(doc));
}

function find(raw: Raw, id: unknown): number {
  return typeof id === 'string' ? raw.slides.findIndex((s: Raw) => s.id === id) : -1;
}

const unknownSlide = (raw: Raw, id: unknown): AiToolResult =>
  fail(`There is no slide with id ${JSON.stringify(id)}. Existing ids: ${raw.slides.map((s: Raw) => s.id).join(', ') || '(none)'}.`);

/** Applies one tool call. Never throws: bad arguments come back as `{ ok: false, error }`. */
export function applyAiTool(doc: PresentationDoc, name: string, args: unknown): AiToolOutcome {
  const a: Raw = isObj(args) ? args : {};
  const unchanged = (result: AiToolResult): AiToolOutcome => ({ doc, result, changed: false });

  switch (name) {
    case 'get_presentation': {
      if (a.slide_id === undefined) return unchanged({ ok: true, ...describeDeck(doc) });
      const slide = doc.slides.find((s) => s.id === a.slide_id);
      return unchanged(slide ? { ok: true, slide: cleanSlide(slide) } : unknownSlide(rawOf(doc), a.slide_id));
    }

    case 'set_presentation_info': {
      const raw = rawOf(doc);
      const known = ['title', 'description', 'palette', 'background'];
      const unknown = Object.keys(a).filter((k) => !known.includes(k));
      if (unknown.length) return unchanged(fail(`Unknown field${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. Use title, description, palette, background.`));
      if (a.title !== undefined) raw.title = a.title;
      if (a.description !== undefined) raw.description = a.description;
      raw.theme = { ...raw.theme, ...(a.palette !== undefined ? { palette: a.palette } : {}), ...(a.background !== undefined ? { background: a.background } : {}) };
      return commit(doc, raw, { updated: Object.keys(a) });
    }

    case 'add_slides': {
      const raw = rawOf(doc);
      if (!Array.isArray(a.slides) || a.slides.length === 0) return unchanged(fail('"slides" must be a non-empty array of { type, config }.'));
      const used = new Set<string>(raw.slides.map((s: Raw) => s.id));
      const added: Raw[] = [];
      for (const [i, item] of (a.slides as unknown[]).entries()) {
        if (!isObj(item) || typeof item.type !== 'string' || !(SLIDE_TYPES as readonly string[]).includes(item.type)) {
          return unchanged(fail(`slides[${i}].type must be one of: ${SLIDE_TYPES.join(', ')}.`));
        }
        const { type: _ignored, ...config } = isObj(item.config) ? item.config : ({} as Raw);
        const id = typeof config.id === 'string' && config.id ? config.id : nextId(used, 's');
        used.add(id);
        added.push({ ...config, id, type: item.type });
      }
      const at = Number.isInteger(a.position) ? Math.max(0, Math.min(raw.slides.length, a.position)) : raw.slides.length;
      raw.slides.splice(at, 0, ...added);
      const out = commit(doc, raw, { added: added.map((s, i) => ({ slide_id: s.id, index: at + i, type: s.type })) });
      if (!out.changed && out.result.ok === false && out.result.issues) {
        // point errors at the slide in the batch, not at its position in the whole deck
        out.result.issues = out.result.issues.map((m) => m.replace(/^slide (\d+)/, (_, n) => (Number(n) >= at && Number(n) < at + added.length ? `slides[${Number(n) - at}] (batch)` : `slide ${n}`)));
      }
      return out;
    }

    case 'update_slide': {
      const raw = rawOf(doc);
      const i = find(raw, a.slide_id);
      if (i < 0) return unchanged(unknownSlide(raw, a.slide_id));
      if (!isObj(a.changes) || Object.keys(a.changes).length === 0) return unchanged(fail('"changes" must be an object with at least one field.'));
      const { id: _id, type: newType, ...changes } = a.changes;
      if (newType !== undefined && newType !== raw.slides[i].type) return unchanged(fail('A slide\'s type cannot be changed. Add a new slide of the type you want and delete this one.'));
      const next: Raw = { ...raw.slides[i] };
      for (const [k, v] of Object.entries(changes)) {
        if (v === null) delete next[k];
        else next[k] = v;
      }
      raw.slides[i] = next;
      return commit(doc, raw, { slide_id: next.id, updated: Object.keys(changes) }, { index: i, label: String(next.id) });
    }

    case 'delete_slide': {
      const raw = rawOf(doc);
      const i = find(raw, a.slide_id);
      if (i < 0) return unchanged(unknownSlide(raw, a.slide_id));
      const [gone] = raw.slides.splice(i, 1);
      return commit(doc, raw, { deleted: gone.id });
    }

    case 'move_slide': {
      const raw = rawOf(doc);
      const i = find(raw, a.slide_id);
      if (i < 0) return unchanged(unknownSlide(raw, a.slide_id));
      if (!Number.isInteger(a.to_index)) return unchanged(fail('"to_index" must be a whole number, the 0-based position to move to.'));
      const to = Math.max(0, Math.min(raw.slides.length - 1, a.to_index));
      const [slide] = raw.slides.splice(i, 1);
      raw.slides.splice(to, 0, slide);
      return commit(doc, raw, { slide_id: slide.id, index: to });
    }

    default:
      return unchanged(fail(`Unknown tool "${name}". Available tools: ${AI_TOOL_NAMES.join(', ')}.`));
  }
}

// ---------------------------------------------------------------------------------------

/** System prompt for the assistant. Lives next to the tools so the two never drift apart. */
export const AI_SYSTEM_PROMPT = `You are the presentation assistant inside ClassInteract, a tool teachers and presenters use to run live, interactive presentations: slides, quizzes, polls, word clouds, open questions, ratings and surveys that the audience answers on their phones while results appear on the projector.

Your job is to build and edit the presentation the user has open, using your tools. You can only change this one presentation. You cannot start sessions, see results or do anything outside the editor.

How to work
- Start by calling get_presentation unless the user's message makes the current deck irrelevant (for example "make me a new deck about X" on an empty one).
- When asked to create content, just build it. Choose sensible defaults instead of asking questions, and ask a short question only when a missing fact would make the result useless (for example the topic).
- Build a coherent whole: a title slide, then a good mix of content and interactive slides, not only quizzes. Vary activity types to keep an audience engaged. Aim for what was asked: if the user asks for one question, add one slide.
- Prefer add_slides to add several slides at once. If a tool reports problems, read the messages, fix the slide and call again; do not give up after one error.
- Never delete or rewrite slides the user did not ask you to touch.
- Your replies are shown as Markdown (bold, lists, short headings are fine). After you have made changes, reply with a short summary of what you did and what to look at next. Do not repeat the slide contents back at length, and do not describe the tools you used.
- Keep slide text short and large-print friendly: it is projected in a classroom. Questions at most about 120 characters, options a few words each. Use plain text, no markdown headings.
- Write correct, age-appropriate content. For quizzes, make exactly the intended answer correct and the others plausible but wrong. Add a one-sentence explanation to quizzes where it helps learning.
- Respect the user's language: write slides in the language they write to you in, unless told otherwise.

Slide format (always give options, pairs and items explicit ids such as "a", "b", "c" and reference those ids in answer keys)
Every slide has a type: content, quiz, poll, wordcloud, open, rating, survey. Every slide may have notes (private speaker notes) and image { url (https only), alt, fit: cover|contain } (only use image URLs the user gave you, never invent them).
Interactive slides may have timeLimitSec (5-900) and autoOpen.

content: title, body (blank line = new paragraph, "- " = bullet, **bold**), steps (array of strings, numbered cards, up to 12), layout (title|text|image-text|full-image|instructions, usually leave it out), callout { tone: info|warning|success, text } (callouts are not shown on title-only slides). A slide with only a title is a title slide.
quiz: question, kind (single|multiple|match|order, default single), explanation, scored (default true), points (10-10000, default 1000), speedBonus (needs timeLimitSec), partialCredit (multiple/match/order, default true).
  single: options [{id,text}] (2-6) and correctOptionId.
  multiple: options (2-6) and correctOptionIds [ids] (one or more).
  match: pairs [{id,left,right}] (2-6); each right-hand item must be different. People connect each left item to its right item.
  order: items [{id,text}] (2-6) written in the CORRECT order; people see them shuffled.
  text: acceptedAnswers [strings] (people type the answer; near misses go to the presenter for review).
  numeric: numeric { value, tolerance (absolute), tolerancePercent, unit }.
  True/false is a single quiz with options [{id:"true",text:"True"},{id:"false",text:"False"}].
poll: question, options (2-10), multiple (bool), maxSelections, anonymous (bool).
wordcloud: question, maxWords (default 5), maxLength, maxSubmissions (default 3).
open: question, mode (short|paragraph), maxSubmissions.
rating: question, min (0 or 1), max (2-10), minLabel, maxLabel.
survey: title, description, questions [{id, kind: choice|rating|text, question, required, ...}]: choice has options and multiple; rating has min, max, minLabel, maxLabel; text has mode.
Rich text (titles, bodies, questions, options): **bold**, *italic*, \`code\`, $maths$ in LaTeX, $$display maths$$, fenced code blocks with a language (three backticks then the language), "| a | b |" tables.
Chemistry: $\\ce{2H2 + O2 -> 2H2O}$ for formulas and equations (mhchem; arrows with conditions: $\\ce{->[NaBH4][MeOH]}$). {{smiles:CC(=O)O}} draws a skeletal structure from SMILES, inline; an option that is only {{smiles:...}} becomes a large structure card. In a content body, a fenced block whose language is "route" draws a reaction scheme, one item per line: a molecule as "SMILES caption", an arrow as "-> conditions above | conditions below", "+" for a plus sign, "?" for an unknown to work out. Write rings in Kekulé form (C1=CC=CC=C1) for alternating double bonds. Double-check every SMILES: it must be the exact intended molecule.
Unknown fields are rejected, so use only the fields above. Palettes: azure, lavender, mint, peach, rose, slate; backgrounds: soft, plain.`;
