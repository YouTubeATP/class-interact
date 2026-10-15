# Presentation format (schema version 1)

A ClassInteract presentation is one JSON document. The visual editor, JSON import and export, the
seeded demos and live sessions all use this same model, so anything you can build by hand you can
also generate from code, and anything you build by hand you can export.

The document describes **content and intent**, never pixel positions. A renderer maps each slide to
a responsive layout template for the projector and for phones.

- Machine-readable schema: [`presentation.schema.json`](./presentation.schema.json)
  (also served at `/api/schema/presentation.json`). Cross-field rules, such as "the correct option must
  exist", are enforced on import rather than by JSON Schema.
- Import in the Studio: **Import JSON**, or `POST /api/studio/presentations/import`.
- Export: **Export JSON** in the library or editor, or `GET /api/studio/presentations/:id/export`.
- Examples: [`server/seed/msg-secret-ingredient.json`](../server/seed/msg-secret-ingredient.json) and
  [`server/seed/workshop-activities.json`](../server/seed/workshop-activities.json).

## Document

```json
{
  "format": "classinteract.presentation",
  "schemaVersion": 1,
  "title": "My workshop",
  "description": "Optional, shown on the library card.",
  "theme": { "palette": "azure", "background": "soft" },
  "slides": [ ]
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `schemaVersion` | yes | Integer. Missing means "assume 1" with a warning. A version newer than the app supports is rejected with a clear message. Older versions are migrated automatically. |
| `format` | no | Always `classinteract.presentation`. |
| `title` | yes | 1–140 characters. |
| `description` | no | Up to 600 characters. |
| `theme.palette` | no | `azure` (default), `lavender`, `mint`, `peach`, `rose`, `slate`. |
| `theme.background` | no | `soft` (default, colour shapes) or `plain`. |
| `slides` | yes | Ordered list, up to 150. |

Unknown fields are errors, with a "did you mean…" suggestion, so typos never silently disappear.

## Slides

Every slide has a `type`. `id` is optional on import (generated as `slide-N`); exports always include it.
Every slide may also have:

| Field | Notes |
| --- | --- |
| `notes` | Private speaker notes. Never sent to the projector or phones. |
| `image` | `{ "url", "alt", "fit" }`. `url` must be `https://…`, `http://…` or an uploaded `/uploads/…` path. `fit` is `cover` (default) or `contain`. Failed loads show a placeholder. |

Interactive slides also share these (with defaults):

| Field | Default | Notes |
| --- | --- | --- |
| `timeLimitSec` | `null` | 5–900. Responses close automatically when time runs out. |
| `autoOpen` | `true` | Open responses as soon as the slide appears. |
| `liveResults` | `true` (not quizzes) | Show results while responses arrive. |
| `showResultsToParticipants` | varies | Let phones see results once you show them. |

### `content`: title, text, steps, image

`title`, `body` (blank line = paragraph, `- ` = bullet, `**bold**`), `steps` (numbered cards),
`callout` (`{ "tone": "info|warning|success", "text" }`; not shown on title slides, so the editor disables it there), `image`.

`layout` is optional. Without it a template is chosen from what you provide:

| Layout | Chosen when | Looks like |
| --- | --- | --- |
| `title` | only a title (and maybe a subtitle) | Large title slide |
| `text` | title and body | Heading with body text |
| `image-text` | there is an image and text | Text on the left, image on the right |
| `full-image` | only an image | Edge-to-edge image |
| `instructions` | there are `steps` | Numbered step cards |

### `quiz`

`question`, `kind`, `options` (2–6, each `{ "id", "text" }`; ids are generated if omitted),
`explanation`, `timeLimitSec`, `scored` (default true), `points` (default 1000),
`speedBonus` (needs a timer; decays linearly to half points at the deadline).

`kind` says how the question is answered; it decides which answer key you give:

| `kind` | Answer key | People |
| --- | --- | --- |
| `single` (default) | `correctOptionId` | Tap one option; it is sent at once |
| `multiple` | `correctOptionIds` (one or more) and optional `partialCredit` (default `true`) | Tick every option that applies, then lock in |
| `match` | `pairs` (2–6, each `{ "id", "left", "right" }`) and optional `partialCredit` | Connect each left item to its right item, by tapping or dragging |
| `order` | `items` (2–6, each `{ "id", "text" }`, **written in the correct order**) and optional `partialCredit` | Drag the items (shuffled) into the right order |

Fields that belong to another kind are rejected, so a mistake is caught on import (`options` for `match`/`order`,
`pairs` for anything but `match`, and so on). A True/False question is just a `single` question with two options.

```json
{ "id": "capitals", "type": "quiz", "kind": "match", "question": "Match each country with its capital",
  "pairs": [ { "left": "France", "right": "Paris" }, { "left": "Japan", "right": "Tokyo" } ] }
{ "id": "cycle", "type": "quiz", "kind": "order", "question": "Put the water cycle in order",
  "items": [ { "text": "Evaporation" }, { "text": "Condensation" }, { "text": "Precipitation" } ] }
```

Matching and ordering never reveal the answer before you do: phones and the projector get the items shuffled under
opaque ids (`L0`, `R2`, `I1`…) using a private per-activity seed that stays on the server, and the pairing or order
only arrives when you reveal the answer. Right-hand items must be different from each other.

Scoring: with `partialCredit` on, a person earns a share of the points. `multiple`: `(right ticks − wrong ticks) ÷
number of correct answers` (never below zero). `match`: the share of items connected correctly. `order`: the share
of positions holding the right item. Getting everything right earns all of them, and the speed bonus applies to the
full amount. With `partialCredit` off it is all or nothing. Only a fully right answer counts as "correct" in the
leaderboard and CSV; the CSV score column shows the partial points.

### `poll`

`question`, `options` (2–10), `multiple`, `maxSelections`, `anonymous` (names are left out of the CSV).

### `wordcloud`

`question`, `maxLength` (40), `maxWords` (5), `maxSubmissions` (3), `moderation` (`off` or `premoderate`).
Answers are grouped ignoring case and punctuation; multiword answers stay together.

### `open`

`question`, `mode` (`short` or `paragraph`), `maxLength`, `maxSubmissions` (1), `moderation`.

### `rating`

`question`, `min` (0 or 1), `max` (2–10), `minLabel`, `maxLabel`.

### `survey`

`title`, `description`, `questions` (1–20), answered together as one activity. Each question has an `id`,
a `kind`, `question` and `required`:

- `choice`: `options`, `multiple`, `maxSelections`
- `rating`: `min`, `max`, `minLabel`, `maxLabel`
- `text`: `mode`, `maxLength`

Free-text survey answers are visible to the presenter only; they are never projected.

## Minimal example

```json
{
  "schemaVersion": 1,
  "title": "Quick check",
  "slides": [
    { "type": "content", "title": "Welcome", "body": "Today we compare two approaches." },
    { "type": "poll", "question": "Which do you prefer?", "options": [{ "text": "A" }, { "text": "B" }] },
    {
      "type": "quiz",
      "question": "What is 2 + 2?",
      "options": [{ "id": "a", "text": "3" }, { "id": "b", "text": "4" }],
      "correctOptionId": "b",
      "timeLimitSec": 15
    }
  ]
}
```

## Errors

Import reports every problem at once, each with a path and a fix:

```
slides[0].options: A quiz needs 2–6 options
slides[0].correctOptionId: "correctOptionId" ("zzz") does not match any option. Valid ids: a, b
slides[0].timelimit: Unknown field "timelimit" in slides[0]. Did you mean "timeLimitSec"?
```

## Round trips and versioning

`import → export → import → export` produces identical JSON; exports are fully resolved (every default is
written out), so the meaning of a presentation never depends on app defaults that might change later.
Future schema versions will ship a migration from version 1; documents carry `schemaVersion` so they can be
upgraded automatically.

## Using the same presentation in both workflows

A presentation has no "mode". **Standalone** runs the slides in order, projecting content slides and
activities. **Companion** lets you launch any activity on demand while you teach in another app, with a
standby screen between activities. The same JSON works for both with no conversion.
