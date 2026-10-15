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
| Projector (`/project/…`) | the room | 16:9 stage that scales to any display; shows only what the audience may see |
| Participant (`/join`) | phones | Mobile-first. Scanning the QR code with the camera app opens the session immediately (no account, no typing); the page also has a Scan button and a PIN field. Names are off by default (everyone gets a friendly name they can change); turn them on per session when you need real names |

**Activities.** Multiple-choice quiz (timer, points, speed bonus, leaderboard), poll (single/multiple,
anonymous), word cloud (normalised and grouped, moderation), open-ended (short or paragraph, optional
approval), rating scale, multi-question survey, and content slides (five layout templates).

**Animation** is built in with framer-motion: activity transitions, animated results, a word cloud that
re-packs as answers arrive, leaderboard reordering, and confirmations. It respects the OS "reduce motion" setting.

## Quick start (development)

Requires Node 20.12+ (Node 22 recommended).

```bash
npm install        # installs all workspaces and generates the Prisma client
npm run dev        # that's it
```

`npm run dev` does everything on a fresh clone: it creates and migrates the SQLite database, imports the demo
presentations (idempotent), then starts the API with auto-reload on <http://localhost:3001> and the web app with
hot reload on <http://localhost:5173> (Vite proxies `/api`, `/uploads` and the WebSocket to the API). No `.env`
is needed; copy `.env.example` to `.env` only to change settings.

Open <http://localhost:5173/studio>, pick **MSG: The Secret Ingredient?** and choose **Start session**.

**Phones on your Wi-Fi:** the QR code encodes a plain link (`https://your-host/join/123456`), so the phone's
own camera app opens it and lands straight in the session. It must point at an address phones can reach. In
development, when the Studio runs on `localhost`, the link automatically uses your machine's LAN address. In
Docker or behind a domain or tunnel, set `PUBLIC_URL` (see below); container-internal addresses are never offered.

### Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Migrate + seed the database, then run the API (tsx watch) and web (Vite) together |
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
docker compose up -d     # http://localhost:3001
```

The image runs migrations on start and keeps the database, uploads and signing secret in the
`classinteract-data` volume. The port is bound to `127.0.0.1` by default.

### Behind a Cloudflare Tunnel

No inbound ports, TLS handled by Cloudflare, WebSockets work as-is.

1. In Cloudflare Zero Trust, create a tunnel and add a **public hostname** (for example `class.example.com`)
   with service `http://app:3001`.
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

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | Server port |
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
npm test          # shared (50), server integration with real Socket.IO clients and SQLite (32), web (5)
npm run test:e2e  # Playwright: the full 10-step session, Companion mode + JSON import, MSG demo, export round trip,
                  # the in-page QR scanner (a real QR image played through a fake camera), and the scan-to-session link
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
- **Image uploads** accept PNG, JPEG, GIF and WebP only (SVG is refused). Presentation JSON may reference external
  `https://` images; failed loads show a placeholder.
- Docker images were not built in the authoring sandbox (no Docker daemon). The Dockerfile's build, prune and
  entrypoint steps were reproduced natively and the resulting production tree passed the end-to-end suite.

## Troubleshooting

- **"The database has not been set up yet"**: run `npm run db:migrate`.
- **Phones cannot open the QR code**: set `PUBLIC_URL`, or open the Studio using your computer's network address
  instead of `localhost`.
- **Projector shows "link is not valid"**: open it from **Open projector** on the session dashboard; it carries a
  signed key.
- **Lost the dashboard tab**: reopen the session from **Live now** in the library; control is re-issued to the Studio.
