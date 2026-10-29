# ClassInteract

Real-time interactive presentations for classrooms and workshops. Kahoot-style quizzes, Mentimeter-style
polls and word clouds, and ordinary slides, all in one live session. Participants **join once with a single
QR code or PIN and stay connected for the whole session**, whatever activity comes next.

It is a complete application, not a demo: a Presenter Studio, a full-screen projector view and a mobile
participant experience, kept in sync by a server-authoritative session engine and persisted in SQLite.

## What you get

**Two ways to present, one engine.**

- **Standalone:** present everything here. Content slides, images, instructions, quizzes, polls, surveys,
  word clouds and live results run in order on the projector.
- **Companion:** teach in Canva, PowerPoint or Google Slides and use ClassInteract only for the interactive
  parts. Launch any activity directly, send everyone to a standby screen in between, and come back to results
  later. Participants never scan a second time; the session stays alive while you are in the other app.

A presentation made for one mode runs in the other without conversion, and you can switch mode mid-session.

**Three synchronised screens.**

| Screen | For | Notes |
| --- | --- | --- |
| Presenter Studio (`/studio`) | the presenter | Library, editor with drag-and-drop ordering, live preview, JSON import/export, session dashboard, results and CSV export |
| Projector (`/project/…`) | the room | 16:9 stage that scales to any display; shows only what the audience may see. Open it from the dashboard, or on any other computer type the session's **projector code** (shown in the dashboard) into the box on the home page |
| Participant (`/join`) | phones | Mobile-first. Scanning the QR code with the camera app opens the session immediately (no account, no typing); the page also has a Scan button and a PIN field. Names are off by default (everyone gets a friendly name they can change); turn them on per session when you need real names |

**Activities.** Quiz (one correct answer, tick-all-that-apply, matching pairs and ordering with drag and drop or tap,
typed answers, numbers with a tolerance and unit, and tap-the-image hotspots; partial credit, timer, points, speed bonus,
leaderboard), poll (single/multiple, anonymous), word cloud (normalised and grouped, moderation), open-ended (short or
paragraph, optional approval), rating scale, multi-question survey, and content slides (five layout templates). Any slide
can carry a YouTube/Vimeo video, an audio or video file, code with syntax highlighting, KaTeX maths and tables, and
chemistry: equations (mhchem), skeletal structures drawn from SMILES, and reaction schemes for synthetic routes.

**Teaching tools.** Audience Q&A with upvotes and moderation, an anonymous "Got it / Unsure / Lost" pulse, breaks and
countdowns, a phone remote, co-presenter and moderator access links, run-again rounds with before/after comparison,
teams, review of nearly-right typed answers, rehearsal with simulated participants, self-paced mode with deadlines,
simple branching, templates, bulk CSV/JSON import, insights (difficulty, misconceptions, concepts, confidence versus
correctness) with a deterministic recap, and opt-in progress across sessions. Light, dark and system appearance
everywhere, a presenter-controlled projector look, and synthesized sound effects and music with per-device settings.
See **[docs/teaching-features.md](docs/teaching-features.md)** for how each works.

**Animation** is built in with framer-motion: activity transitions, animated results, a word cloud that
re-packs as answers arrive, leaderboard reordering, and confirmations. It respects the OS "reduce motion" setting.

**Help and live tours.** There are two help pages, switchable from each other: **For participants** (`/help`, public,
plain language: joining, the activity types, what participants cannot do, troubleshooting) and **For presenters**
(`/studio/help`, behind the Studio sign-in: building, the AI assistant, running a session, the three kinds of code,
results, sharing, troubleshooting). Both are linked from the page footers, the join page and the Studio's **Help** menu.
The **live tours** light up the real screen step by step (library, editor, session controls, and the join page for
participants). The Studio offers its tour once on first visit; afterwards use **Help → Tour of this page** on any Studio
page, or the buttons in the help pages. Tours work on phones (the editor tour switches panes for you), from the keyboard
(arrow keys, Esc) and are lazy-loaded, so phones joining a session never download them. To add a step, edit
`web/src/tour/tours.ts` and put a `data-tour="name"` attribute on the element to explain.

## Quick start (development)

Requires Node 20.12+ (Node 22 recommended).

```bash
npm install        # installs all workspaces and generates the Prisma client
npm run dev        # that's it
```

`npm run dev` does everything on a fresh clone: it regenerates the Prisma client, creates and migrates the SQLite database, imports the demo
presentations (idempotent), then starts the API with auto-reload on <http://localhost:3001> and the web app with
hot reload on <http://localhost:5173> (Vite proxies `/api`, `/uploads` and the WebSocket to the API). No `.env`
is needed; copy `.env.example` to `.env` only to change settings.

Open <http://localhost:5173/studio>, pick **MSG: The Secret Ingredient?** and choose **Start session**.

**Phones on your Wi-Fi:** the QR code encodes a plain link (`https://your-host/join/123456`), so the phone's
own camera app opens it and lands straight in the session. It must point at an address phones can reach. In
development, when the Studio runs on `localhost`, the link automatically uses your machine's LAN address. In
Docker or behind a domain or tunnel, set `PUBLIC_URL` (see below); container-internal addresses are never offered.

**Ports.** Nothing is pinned to 5173 or 3001. Set `WEB_PORT` (dev server) and `PORT` (API; the whole app in production)
in `.env`, and the Vite proxy follows. If a port is taken, the dev server stops with an error instead of quietly
choosing another one, so QR codes, bookmarks and tunnels never point at the wrong place.

**Serving `npm run dev` through a Cloudflare Tunnel.** Point the tunnel's public hostname at
`http://localhost:<WEB_PORT>` (the dev server proxies `/api`, uploads and the WebSocket to the API, so one hostname
is enough) and set, in `.env`:

```
PUBLIC_URL=https://class.example.com      # QR codes use it, and Vite accepts its hostname
# ALLOWED_HOSTS=other.example.com         # more hostnames, or * for any
# HMR_CLIENT_PORT=443                     # only if you want hot reload through the https tunnel
```

For real use, prefer the production build below (`npm start` on `PORT`, or Docker Compose); it needs none of this.

### Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Regenerate the Prisma client, migrate + seed the database, then run the API (tsx watch) and web (Vite) together |
| `npm run build` | Build the web app and bundle the server |
| `npm start` | Run the production build (serves the web app too) on `PORT` (default 3001) |
| `npm run db:migrate` | Apply migrations (`prisma migrate deploy`) |
| `npm run db:migrate:dev` | Create a new migration after editing `server/prisma/schema.prisma` |
| `npm run db:seed` | Import the demo presentations through the JSON import pipeline (idempotent) |
| `npm run db:reset` | Drop and recreate the database |
| `npm run typecheck` | TypeScript across all workspaces |
| `npm test` | Unit and integration tests (Vitest) |
| `npm run test:e2e` | Build, then run the Playwright end-to-end suite against the production build |
| `npm run test:e2e:dev` | Run the same suite against `npm run dev` (hot-reload mode) on a throwaway database |
| `npm run schema` | Regenerate `docs/presentation.schema.json` |

## Production

```bash
npm ci && npm run build
DATABASE_URL=file:/var/lib/classinteract/app.db DATA_DIR=/var/lib/classinteract \
  PUBLIC_URL=https://class.example.com STUDIO_PASSWORD=… npm run db:migrate && npm start
```

### Docker Compose (home server)

```bash
cp .env.example .env     # set PUBLIC_URL and STUDIO_PASSWORD
docker compose up -d     # http://localhost:3001 (or your PORT / HOST_PORT)
```

The image runs migrations on start and keeps the database, uploads and signing secret in the
`classinteract-data` volume. The port is bound to `127.0.0.1` by default.

### Behind a Cloudflare Tunnel

No inbound ports, TLS handled by Cloudflare, WebSockets work as-is.

1. In Cloudflare Zero Trust, create a tunnel and add a **public hostname** (for example `class.example.com`)
   with service `http://app:3001` (`http://app:<PORT>` if you changed `PORT`).
2. Put the tunnel token and your public address in `.env`:

   ```
   TUNNEL_TOKEN=…
   PUBLIC_URL=https://class.example.com
   STUDIO_PASSWORD=choose-something-long
   TRUST_PROXY=1
   ```
3. Start both containers:

   ```bash
   docker compose --profile tunnel up -d
   ```

`PUBLIC_URL` makes the projector's QR code point at your domain. `TRUST_PROXY=1` lets rate limiting see real
client addresses. **Set `STUDIO_PASSWORD` on anything public**: it protects the Studio; participants never
need it. For defence in depth you can also put a Cloudflare Access policy on `/studio*`, `/session*`,
`/results*` and `/api/studio*` while leaving `/join*`, `/play*`, `/project*`, `/api/join*`, `/api/config`
and `/socket.io` open for participants and projectors.

### Running it in a lesson

What has been tested (`server/test/resilience.test.ts`, `e2e/reconnect.spec.ts`, and a manual `kill -9` of the production
build with a real browser): 30 phones joining and answering in the same instant (every answer counted exactly once; a
stress run at 150 phones also had no errors), double taps, two dashboards jabbing the controls at once, the quiz timer and
the presenter closing at the same moment, malformed messages, a phone that locks and comes back, and **the server being
killed mid-quiz**. After a restart the same people reconnect with the same answers, and the quiz deadline still applies. A
student who taps an answer while their phone is reconnecting has it held for up to 12 seconds and sent as soon as the
connection returns.

Before class:

1. **Use the Cloudflare Tunnel (or another public address), not the school Wi-Fi.** Many school networks isolate devices
   from each other, so phones cannot reach a laptop directly even on the same Wi-Fi. Set `PUBLIC_URL` so the QR code uses
   the public address, and set `STUDIO_PASSWORD`.
2. **Do one test join from a phone on the school's network** a few minutes before the lesson. Typing the 6-digit code on the
   join page always works if a QR scan does not.
3. **Keep the laptop awake and plugged in.** Turn off sleep for the lesson, and pause Windows Update so it cannot restart the
   machine. If the app does restart, nothing is lost: keep the window open or run it under a supervisor (Docker's
   `restart: unless-stopped`, or [pm2](https://pm2.keymetrics.io/) on Windows) so it comes back by itself.
4. Set `NODE_ENV=production` in `.env` when serving through a tunnel: it turns on the strict browser security headers.
5. **Back up the `data` folder** (the SQLite database, uploads and signing secret) now and then.
6. Run through your presentation once in **Preview**, and keep the **projector code** handy in case the projector window
   needs to be reopened on another computer.

Rough capacity: a single process on a laptop handles a class of 30 with ease; each answer takes a few milliseconds, and
even 150 simultaneous phones were served without errors. The AI assistant is the only part that depends on an outside
service, so build presentations before class rather than during it.

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | Server port (API in dev, the whole app in production, and inside the Docker container) |
| `WEB_PORT` | `5173` | Dev server port for `npm run dev` |
| `ALLOWED_HOSTS` | none | Extra hostnames the dev server accepts (`*` for any); `PUBLIC_URL`'s host is always allowed |
| `HMR_CLIENT_PORT` | unset | Port the browser uses for hot reload behind an https tunnel (`443`) |
| `DATABASE_URL` | `file:../data/classinteract.db` | SQLite file (relative to `server/prisma/` in dev) |
| `DATA_DIR` | `./data` | Uploads and the generated signing secret |
| `PUBLIC_URL` | unset | Address people open on phones; used for the QR code |
| `STUDIO_PASSWORD` | unset | Protects the Presenter Studio |
| `SERVER_SECRET` | generated | Signs presenter and projector links |
| `TRUST_PROXY` | `false` | Proxy hops to trust (`1` behind a tunnel or reverse proxy) |
| `MAX_PARTICIPANTS` | `500` | Per session |
| `SESSION_IDLE_HOURS` | `24` | Live sessions with no activity are ended |
| `AUTO_SEED` | `false` (`true` in Docker) | Import demos when the library is empty |
| `EXTRA_BLOCKED_WORDS` | none | Extra words to reject in names and answers |
| `AIMLAPI_KEY` | unset | Turns on the AI assistant in the editor. Server-side only |
| `AI_MODEL` | `deepseek/deepseek-v4.1-flash` | Model the assistant uses |
| `AI_BASE_URL` | `https://api.aimlapi.com/v1` | Any OpenAI-compatible endpoint |

## The AI assistant

With an API key set, the editor gets an **AI assistant** button: a chat panel that builds and edits the open
presentation for you. Ask for "a 6 slide lesson about the water cycle with a quiz and a matching question" and the
slides appear in the editor as it works; ask it to turn a quiz into a select-all question, reorder slides or retheme the
deck. Every turn can be undone in one click ("Undo AI changes"), and everything it makes goes through the same
validation and autosave as anything you type.

```bash
# .env  (the key stays on the server and is never sent to a browser)
AIMLAPI_KEY=your-key
# optional: AI_MODEL=deepseek/deepseek-v4.1-flash   AI_BASE_URL=https://api.aimlapi.com/v1
```

Without a key the button is not shown. It is built with [assistant-ui](https://www.assistant-ui.com) and the Vercel
AI SDK, and talks to [AIMLAPI](https://aimlapi.com) by default (any OpenAI-compatible service works).

- **What it can do.** Six tools, nothing more: read the deck, set title/description/theme, add slides (several at once),
  update a slide, delete a slide, move a slide. It cannot start sessions, see participants' answers, touch other
  presentations or reach anything outside the editor. The tool list and the instructions live on the server, so a
  browser cannot add tools or change them.
- **It cannot make a broken deck.** The tools run in your browser against the same validator as JSON import. A rejected
  call comes back to the model with the validator's messages (for example `correctOptionId "zzz" does not match any
  option. Valid ids: a, b`) and it corrects itself.
- **What is sent to the AI service.** Your messages, plus the slide contents it reads or writes. Nothing about sessions,
  participants or results. Use a self-hosted OpenAI-compatible endpoint if that matters to you.
- **Cost and abuse.** The route needs Studio sign-in (set `STUDIO_PASSWORD` on anything public), is rate limited,
  caps history and tool steps per request, and stops the upstream call when you close the panel.
- **Testing.** Tests never call a real model: `scripts/fake-llm.mjs` is a scripted OpenAI-compatible server used by the
  integration and end-to-end tests. To try the real thing against a running server, use
  `npm run ai:smoke -w server -- "Make a 4 slide deck about fractions"`.

## The presentation format

A presentation is one versioned JSON document: metadata, theme, ordered slides, activity configuration,
timers, scoring and result visibility, with a fixed set of layout templates. No coordinates, no freeform
canvas. The editor, JSON import/export and the seeded demo all use the same model, so you can generate a
complete interactive presentation from code.

```json
{
  "schemaVersion": 1,
  "title": "Quick check",
  "slides": [
    { "type": "content", "title": "Welcome" },
    { "type": "quiz", "question": "2 + 2?", "options": [{ "id": "a", "text": "3" }, { "id": "b", "text": "4" }], "correctOptionId": "b", "timeLimitSec": 15 }
  ]
}
```

Validation reports every problem with a path and a suggested fix; exports re-import to identical JSON.
Full reference: [docs/presentation-format.md](docs/presentation-format.md) and
[docs/presentation.schema.json](docs/presentation.schema.json).

## How it works

```
shared/   TypeScript types, Zod schemas, the activity engine and the session state machine (pure, tested)
server/   Express + Socket.IO + Prisma/SQLite. Authoritative session state, REST for the Studio
web/      React + Vite + Tailwind. Studio, projector and participant apps sharing one set of renderers
e2e/      Playwright scenarios against the built app
```

- **Reusable vs live.** A *presentation* holds ordered slides. Starting a *session* copies the slides into
  the session, so editing or deleting the presentation never changes a running or finished session's results.
- **Server-authoritative state machine.** `lobby → standby → ready → open → closed → revealed → completed →
  ended`. Presenters send intents; the server validates and applies them. Clients only receive snapshots.
- **Role-scoped snapshots.** The presenter, the projector and each participant receive different data. The
  projector and phones never receive speaker notes or the correct answer until you reveal it, and results
  only when you show them. Every connection starts from a complete snapshot, so refreshes and reconnects
  are seamless.
- **Projector code.** Each live session also has a second six-digit code, shown only in the presenter's dashboard. Typing it on the home page of any computer turns that screen into the projector (no link to copy). It is separate from the join PIN, never collides with one, stops working when the session ends, and claim attempts are rate limited. It unlocks only the audience-safe projector view.
- **Identity and access.** Participants get an unpredictable token (stored hashed). The PIN only lets someone
  *join*. Presenter control and the projector use separate server-signed credentials, so a PIN grants nothing.
- **Integrity in the database.** Unique constraints make double submissions impossible (one response per
  participant per slot; one term per participant for word clouds; one name per session; one live session per PIN).
- **Moderation.** Server-side validation of every submission, profanity filtering on names and text, optional
  approval queues, per-term hiding, participant removal, and rate limiting.
- **Exports.** Results stay available after a session ends. CSV has one row per response (one per answered
  question for surveys), anonymous polls omit names, and cells are protected against spreadsheet formula injection.

## Testing

```bash
npm test          # shared (91), server integration with real Socket.IO clients and SQLite (46), web (8)
npm run test:e2e  # Playwright: the full 10-step session, Companion mode + JSON import, MSG demo, export round trip,
                  # the in-page QR scanner (a real QR image played through a fake camera), and the scan-to-session link, and the dashboard-replica-matches-projector layout check
```

The main end-to-end scenario authors a quiz and word cloud in the editor, starts a session, joins a projector
and two phones, runs the quiz and reveal, advances to the word cloud, checks the aggregated projector view,
refreshes a phone mid-session, ends the session, and verifies results and CSV after a reload.

GitHub Actions (`.github/workflows/ci.yml`) runs typecheck, tests, build and the Playwright suite on every push.

## The MSG demonstration

*MSG: The Secret Ingredient?* is imported from [`server/seed/msg-secret-ingredient.json`](server/seed/msg-secret-ingredient.json)
through the same pipeline as any user JSON. It follows the UTOP 3201 lesson plan: prediction, prior-knowledge
poll, an umami warm-up quiz, tasting precautions and the single-dip method, cracker and beef-jerky rounds with
word clouds, a jerky prediction poll, a rating, an explanation question, the glutamate structure, an
"observation versus evidence" slide, a three-question scored knowledge check with leaderboard, a confidence
rating, a reflection, a feedback survey, and sources. Tasting is always voluntary, observers have an equal role
in every activity, and the deck separates subjective taste impressions from scientific claims without
suggesting MSG improves food for everyone. A second deck, *Workshop activity kit*, shows a slide-free
presentation for Companion mode.

## Design trade-offs and limits

- **Single server process.** Session state is cached in memory and persisted to SQLite. This keeps the system
  simple and is comfortable for hundreds of participants on a small host; horizontal scaling would need a shared
  store and pub/sub (deliberately not included).
- **SQLite and Prisma** for zero-setup persistence; Prisma 6 is used because it runs without extra infrastructure.
- **Moderation is first-line.** The profanity filter is English-focused; use `EXTRA_BLOCKED_WORDS`, approval mode
  and the hide/remove controls for other languages or stricter rooms.
- **Studio access** is a single shared password (no user accounts) by design. It is meant for one presenter or
  a small team on a self-hosted server.
- **Optional AI only.** Bulk conversion, the AI recap summary and meaning-based grouping appear only when
  `AIMLAPI_KEY` is set, are always labelled, and never merge or change anything without the presenter's click.
  Everything else (grading, analytics, recap, grouping suggestions) is deterministic and works offline.
- **Progress across sessions** is opt-in per session and per participant, keyed by a random identifier on the
  participant's own device; clearing browser data or switching device starts fresh.
- **Image uploads** accept PNG, JPEG, GIF and WebP only (SVG is refused). Media uploads (MP4, WebM, MP3, M4A, OGG, WAV)
  are limited to 25 MB and checked by their content, not just their name. Presentation JSON may reference external
  `https://` images; failed loads show a placeholder.
- Docker images were not built in the authoring sandbox (no Docker daemon). The Dockerfile's build, prune and
  entrypoint steps were reproduced natively and the resulting production tree passed the end-to-end suite.

## Troubleshooting

- **"The database has not been set up yet"**: run `npm run db:migrate`.
- **Phones cannot open the QR code**: the phone must be on the **same Wi-Fi** as the computer (not mobile data), and the
  firewall must allow Node.js on private networks (Windows prompts the first time; choose *Private networks*). A computer
  with several network adapters (VPN, WSL, Hyper-V) may guess the wrong address: open **Phone can't open the link?** on
  the session dashboard and pick another one (usually `192.168.…`). For anything beyond one room, set `PUBLIC_URL`.
- **Projector shows "link is not valid"**: open it from **Open projector** on the session dashboard; it carries a
  signed key.
- **Lost the dashboard tab**: reopen the session from **Live now** in the library; control is re-issued to the Studio.

---

Built with ❤️ by [AnsonWPH](https://ansonwph.me)
