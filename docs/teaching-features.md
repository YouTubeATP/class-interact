# Teaching features: guide and design notes

This page covers the teaching tools added on top of the core session engine. For each one it says what the tool
does for a presenter and participants, and how it is built. The presentation fields are documented in
[presentation-format.md](presentation-format.md).

## Joining: the projector QR code

- The lobby shows a vertical "ticket" with the QR code at about a quarter of the stage width (444 CSS px on a 1080p
  projector, 296 px at 720p, 888 px at 4K). The six-digit PIN sits below it in large type. The stage is a 16:9 box
  that letterboxes inside any window, so the code keeps its proportion on 4:3 projectors and in windowed browsers.
- During slides and activities, a ticket in the bottom-right corner keeps the code on screen: a QR of about 11% of
  the stage width (about 220 px on a 1080p projector), the join address in large bold type, and the PIN. Slides keep
  that bottom band free, and long content shrinks to fit, so the ticket never covers anything.
- **Show join QR** (dashboard, phone remote) lays a large code (40% of the stage width) over whatever is on screen.
  It changes nothing underneath: the activity, its timer and the responses stay as they were. Hide it again from
  the same button.
- The code is always dark modules on white with a four-module quiet zone, whatever the projector theme. Each module
  is snapped to whole device pixels when that costs little size, so it stays sharp; small codes keep their full
  size instead, because size matters more for scanning from a distance.
- It encodes the **participant join link** (`/join/<PIN>`), never the projector link or projector code. The address
  comes from `PUBLIC_URL` when set, otherwise the address the Studio was opened on (a domain such as a Cloudflare
  Tunnel host is kept as is; on `localhost` the best LAN address is used instead). No hostname is hard-coded.
- Tested in `e2e/qr.spec.ts`. The QR is screenshotted at 1280×720, 1920×1080, 3840×2160, 1024×768 and a windowed
  size, then decoded with jsQR. The tests also check its size, squareness, whole-pixel modules and on-screen
  position, plus the overlay in light and dark projector themes.

## During a session

**Audience Q&A** works on every screen, including the lobby and breaks. Phones have an **Ask** button. Questions
may be anonymous (if the session allows it). People upvote others' questions once each (never their own; a second
tap takes the vote back). The presenter's Q&A tab can approve (when "approve questions first" is on), hide
(inappropriate), dismiss (repetitive), pin, mark answered, delete, and **show on screen** as a highlight card.
**Show questions** puts the whole board on the projector. Questions are separate from open-ended activities and
appear in the results, the CSV export and the recap ("unanswered questions").

**Understanding pulse.** Phones show three small buttons (Got it / Unsure / Lost) at the bottom. A person can
change their answer at any time. The presenter sees anonymous counts and a 20-minute trend. Nothing reaches the
projector unless the presenter shows it, and names are never attached.

**Breaks and countdowns.** **Break or countdown** shows a pause screen (Break, Get ready or Work time) with an
optional countdown and message on the projector and on phones. **Resume** removes it. The activity underneath is
untouched.

**Phone remote and helpers.** `/remote/<session>` is a large-button remote for a phone. It works for the presenter
(signed in to the Studio) or through an **access link** created in the dashboard's Access tab:

| Role | Can | Cannot |
| --- | --- | --- |
| Co-presenter | move through slides, open/close/reveal, run again, projector overlays, breaks, projector look and sound, moderate responses and questions | end the session, remove people, change session settings, create access links |
| Moderator | approve and hide responses and questions, review typed answers, manage participants and teams | change what is on screen |

An access link carries a random token. Only its hash is stored, it never reveals the Studio password, and
**Revoke** cuts the link off at once on every device using it. The server checks every command against the
permission table in `shared/src/permissions.ts`. The screen only hides what a role cannot do, as a convenience.

**Contradictory commands.** Several screens can control one session (dashboard, remote, co-presenter). Every
navigation command carries the state version it was based on. If a *different* screen has changed the state since
then, the server refuses the command and the sender sees the new state, so two people tapping "Next" at once never
skip a slide. A screen's own rapid taps are not refused.

**Run again.** After an activity, **Run again** starts a new round with independent responses, timing, reveal and
moderation. The presenter chooses how points work, so nobody earns points twice by accident:

- *Practice* (default): no leaderboard points.
- *Replaces earlier points*: each person's latest attempt counts.
- *Adds to earlier points*: a deliberate second chance to score.

The Compare tab and the results page show before/after rates, distributions and (for quizzes)
improved/slipped/stayed counts per person.

**Teams.** The Teams tab splits people into 2–8 teams (shuffled, or newcomers join the smallest team). Each answer
still counts for the person, and teams are ranked by their members' **average**, so a larger team has no built-in
advantage. The projector leaderboard can show teams or individuals.

**Review of near-miss answers.** Typed, numeric and hotspot answers that are almost right go to the Review tab with
an explanation. Accepting one marks it correct and awards the points.

**Grouping word-cloud answers.** Answers are always grouped ignoring case and punctuation. On top of that, the
Merge tab *suggests* merges with a reason (accents, singular/plural, a one-letter typo in a longer word). Nothing is
merged without the presenter's click, merges can be undone, and the original answers are kept. With AI configured,
an optional "Suggest groups by meaning (AI)" adds clearly labelled suggestions that go through the same accept/reject step.

**Rehearsal.** **Rehearse** (editor, More menu) starts a private session with simulated participants who join and
answer on their own. A rehearsal is marked in the library and on the dashboard, and is never counted in
cross-session progress.

**Self-paced mode.** Start a session as *Self-paced* to let people work through the activities at their own
speed: before class, as homework, or in a station rotation. The presenter opens and closes it, sets an optional
deadline and chooses when answers are revealed (immediately, after closing, or never). A person's
progress is saved, so they can leave and come back. Branching rules choose the next slide from that person's own
answer.

**Branching.** A quiz can say "under 60% correct → slide *Review*; otherwise → slide *Next topic*". Live, the
dashboard shows the suggestion once results are in, and the presenter can follow it ("Go to…") or just carry on.

**Chemistry.** Equations with KaTeX mhchem (`$\ce{…}$`), skeletal structures drawn from SMILES (`{{smiles:…}}`, also as
quiz answers, shown as large cards on the projector and tappable tiles on phones), and reaction schemes or multi-step
synthetic routes as a `route` block with reagents above and conditions below each arrow. See the syntax in
[presentation-format.md](presentation-format.md#slides) and the **Synthetic routes (chemistry)** template.

**A full example.** The **Popping boba lab (hands-on science)** template is a complete 17-slide workshop that uses
every question type, branching, an equation and structures, a method with a safety note, a table, a confidence check,
a brainstorm and a feedback survey. Its picture ships with the app, so it works without uploading anything.

## Before and after

**Templates.** The library offers eight starter templates (quick diagnostic quiz, icebreaker, workshop activities,
knowledge check and reflection, exit ticket, before/after lesson assessment, a worked chemistry lesson on synthetic routes,
and the popping boba lab). Each copies into an ordinary presentation. There is no shared question bank.

**Bulk import** (editor, More menu → Import questions). Upload or paste a CSV or JSON file, see a preview with every
problem listed by row, then add the valid rows. Limits: 300 KB, 300 rows. A CSV template is downloadable from the
dialog. With AI configured, **Convert with AI** turns pasted notes into slides that still go through the same
validator and preview. Without a key the button does not appear, and nothing is sent anywhere.

**Insights and recap.** The results page has three tabs: Responses, Insights and recap, and Audience questions.

- Per question: correct rate, partial credit, answer distribution, average and median response time, non-response
  among the people present, and a difficulty label (needs at least 3 answers).
- Score distribution, results by concept, the most chosen misconceptions, and before/after comparisons for
  activities that ran more than once.
- Confidence versus correctness: a rating slide linked with `confidenceFor` is paired person by person with the
  linked quizzes. The quadrants are confident and right, confident but wrong, unsure but right, unsure and wrong.
- A **recap** made of plain statements, each traceable to a number above (deterministic: the same session always
  gives the same recap). With AI configured, an optional AI summary is clearly labelled as such and only ever
  receives aggregates, never names or individual answers.

**Across sessions (opt-in).** A session started with "Offer remember me across sessions" (under More options) lets each participant choose, on the join
page, to be recognised next time. A random key is stored on their own device, never derived from their name. They
can separately agree to share their own progress with the presenter. **Across sessions** in the Studio shows the
class trend, plus individual histories only for people who agreed. Participants can forget themselves from their
phone (which deletes the link). The presenter can delete any person's link. Rehearsals never count.

## Look and sound

**Dark mode.** Light, Dark or System (the default) for the Studio, the dashboard and the remote, chosen in Settings
or the header button. Participants choose separately on their phones. A small blocking script (`/theme-init.js`)
applies the saved choice before the first paint, so there is no white flash. All colours are semantic tokens with
light and dark values checked for WCAG AA contrast, and state is never shown by colour alone.

The **projector never follows its computer's setting**. The presentation can be designed light or dark
(`theme.appearance`), and the presenter can override it per session ("Projector look": as designed, light or dark).
QR codes and the join ticket always stay black on white.

**Sound.** All sounds are synthesized in the browser with the Web Audio API. There are no audio files, nothing is
borrowed from other products, and the engine loads with the app (a few KB).

- Levels: Off, Subtle (essential cues: start, time up, reveal, correct/incorrect, leaderboard) and Playful (adds
  flourishes such as people joining, ticks and background music). Master, effects and music volumes, and mute. All
  settings are saved per device and kept separate for the Studio, phones and the projector.
- **Five band styles and the HKUST set.** The five band styles share the same compositions, each with its own instruments, drum kit and feel:
  **Bright** (warm mallets and a light band), **Chill** (lo-fi electric piano, swung beats, vinyl dust), **Arcade**
  (8-bit chiptune), **Calm** (bells and pads, no drums) and **Game show** (brass stabs and punchy drums).
- **HKUST is a set of its own, not a sixth arrangement.** The five band styles play the same compositions through
  one arranger with different instruments. HKUST shares none of that. It has its own six pieces, its own orchestrator,
  its own synthesised orchestra, its own concert hall and its own version of every one of the 29 sound effects
  (`web/src/audio/hkust/`). In the picker it sits apart from the band styles, as "a set with music of its own".
  - **Scored, not patterned.** Each section is orchestrated by hand: who has the tune and who doubles it (a solo horn,
    violins with the flute an octave up, the trumpet with tubular bells), how the harmony is held (divided strings,
    bowed tremolo, clarinets and flute, a trombone-and-horn chorale), what moves underneath (harp arpeggios in triplets
    at slow tempos, rolled harp chords, pizzicato, a cello spiccato ostinato, march afterbeats in the horns), the bass
    (arco basses with cellos an octave up, pizzicato, a march, a pedal), and the dynamic with its crescendo or
    diminuendo. There is no drum kit: the timpani are tuned to two notes per piece and struck only when their note is
    in the chord, with rolls into new sections, and there are clashed and suspended cymbals, bass drum, field drum
    and triangle. Ritardandos really slow the music: the closing bars of a marked section stretch to about two-thirds
    of the tempo and the last chord is held.
  - **Its own orchestra.** Strings are sections of several players, slightly out of tune and out of time with each
    other, each with a bow noise and a vibrato that starts late. The pizzicato section plucks raggedly. The harp rings
    for seconds. The flute breathes, brass gets brighter as it gets louder, timpani use a real drum's modes, and
    tubular bells and glockenspiel use their inharmonic partials.
  - **Its own room.** The players are seated across the stereo field (violins left, cellos and basses right) and heard
    in a synthesised concert hall: early reflections, then a 2.2-second tail that darkens as it decays. The hall's low
    end is cut so it does not boom in reverberant classrooms. Quiet passages are kept in a narrower dynamic range than
    a concert would use, so they still carry on a projector's speakers.
  - **Its material:**
    - two leitmotifs from the HKUST University Anthem (melody by Prof. Kelvin Yuen, 2023, © HKUST), quoted at the
      anthem's own rhythm: the opening *call* (F♯ G, A · A A, E E F♯, D C♯ D E) and the *climb* (D D G F♯ G G B, down
      through A F♯ F♯ E D D B, turning up C♯ D). They were transcribed from the official recording: the voices were
      separated from the accompaniment (Demucs), each sung note's onset detected and its pitch taken from a pYIN
      pitch track, and the onsets quantized to the beat. Only these two short phrases are quoted, inside original
      music;
    - "HKUST" spelled in notes with German letter names (H = B♮, S = E♭): B–D–G–E♭–F, rung on tubular bells like a
      campus bell. In D major the E♭ is the Neapolitan chord, which colours every bridge. It is also spelled in Morse
      code (···· −·− ··− ··· −) on a temple block;
    - the lobby at 91 beats a minute for 1991, and waves for Clear Water Bay.
  - **The pieces:**
    - *Atrium* (lobby, D major, about 1¾ min): the bell, then the call on a solo horn over harp and the sea;
    - *Problem set* (quiz, D minor): clarinet and pizzicato, steady enough to think over;
    - *Last call* (countdown): the call's turn climbing a step every bar over string tremolo and spiccato cellos;
    - *Piazza* (results): a march with field drum, a lyrical trio in G for flute and clarinet, and the procession a
      step higher;
    - *Clear Water Bay* (break, about 2 min): flute over harp and waves, and a quiet brass chorale;
    - *Commencement* (session end, A major): a hymn in A, the climb in A on horns, a return to the anthem's D, and a
      plagal "amen" from D to A that slows and holds.

  Its effects are orchestral cues on the same stage:
  - the session opens with the call on trumpet, the timpani rolling on A into the full orchestra on D;
  - it signs off with the cryptogram on the bell;
  - a correct answer is the climb's closing B–C♯–D on the harp with a glockenspiel;
  - an incorrect one is the cryptogram's E♭ sinking to D in the low clarinet;
  - the winner gets the whole climb on trumpet and a cymbal clash;
  - the countdown ticks are a temple block.

  All styles and the HKUST set are balanced to the same loudness, so changing between them never changes the volume.
- **The music is composed in sections, not looped noise.** Six pieces, one per situation, each one to three minutes
  long before it repeats:
  - *Doors open* (lobby, F major, about 2¼ min): a theme with variations that use secondary dominants, a B section
    with the borrowed minor iv (B♭m6), a bridge that jumps a minor third to A♭ and slides home through D♭, and a
    guide-tone counter-melody when the theme returns.
  - *Thinking time* (timed quiz, A minor, about 1¾ min): focused and steady, with a lift into the relative major and a
    breakdown over the ♭II (B♭).
  - *Ten seconds* (the final countdown): the figure climbs a semitone every two bars (A, B♭, B, C minor) and lands on
    the dominant. It lasts about 14 seconds, so it never audibly loops in the ten seconds it plays.
  - *The reveal* (results and leaderboard, C major, about 1½ min): fanfare, two themes, a bridge on the minor iv
    (Fm6), and the theme again a whole step up for the last chorus.
  - *Coffee* (breaks, E♭ major, swung, about 2¾ min): a ninth-chord head, a B section on A♭m6, and a solo chorus of
    eighth-note lines over a ii–V chain.
  - *Encore* (the end of the session, A major, about 1½ min): a slower, warmer goodbye with its own theme, a B section,
    the theme again with a counter-melody, and a plagal coda that settles on A.

  Chords are voice-led (each moves to the nearest notes of the next). The arrangement changes from section to section
  (intros without drums, half-time bridges, fills and crashes into big returns), and each style voices it its own way.
  Sound effects are short phrases in the same tonal world: good news rises to the tonic, an incorrect answer is a soft
  falling minor second rather than a buzzer, and time is marked with bells and a woodblock. Unit tests check that
  every bar adds up, that strong-beat melody notes and all counter-melody notes agree with the harmony, and that the
  texture really changes. Sources: `web/src/audio/compositions.ts`, `styles.ts`, `sfx.ts`.
- **Mastered for classroom AV systems.** Everything goes through one output chain built for projector speakers,
  ceiling speakers and TVs in reverberant rooms: a high-pass at 85 Hz (those speakers cannot play lower, so the energy
  is better spent elsewhere), a small low-mid cut and a presence lift, a glue compressor, a limiter and a soft clipper.
  Bass lines and kick drums sit an octave higher than usual, with extra harmonics, so they are heard on small speakers.
  Measured with an EBU R128 meter at the projector's default settings and full volume: music around −16 LUFS (up to
  about −13 LUFS for results and the countdown), sound effects about 5 dB above the music, true peaks at or below
  −1.2 dBTP. The volume control comes after the chain, so the sound keeps its character at any volume.
- **The projector is the room's sound.** The presenter sets its level, style, volume and music from the dashboard. The
  projector computer can mute itself locally. Browsers block sound until someone clicks, so the projector shows
  "Click to turn on sound".
- **Phones are quiet by default**: Subtle, never music. The presenter can turn phone sounds off for the whole session.
- Sounds follow **accepted server changes** only: a new state version, never a button press. The first snapshot
  after joining or reconnecting plays nothing, so late joiners never hear history. Correct/incorrect sounds play
  only once the answer is revealed, so a sound can never give an answer away. Repeats within a short window are
  merged.
- Every sound has a visual equivalent (feedback cards, the time-up banner, badges). With "reduce motion" on, only
  essential cues play unless the person turns Playful back on.
- Settings has a preview for every sound and for every piece of music in the chosen style.

## Architecture notes

- **Pure logic in `shared/`.** This covers grading (`grading.ts`), run scoring (`runs.ts`), Q&A rules (`qa.ts`),
  permissions, branching, the pulse, grouping suggestions, analytics and recap (`analytics.ts`), import
  (`importer.ts`), templates and simulated answers (`sim.ts`). The server and the browser use the same code, and it
  is unit tested in `shared/test/features.test.ts`.
- **Runs.** Each activity has one or more `ActivityRun` rows. The current run is the latest one. Submissions belong
  to a run, and the one-response-per-person constraints are per run. Leaderboards are computed from runs by
  `standingsFromRuns`, applying each run's scoring rule.
- **Session features** (Q&A, pulse, teams, continuity, phone sounds, projector look and sound, self-paced settings)
  live in one JSON column on the session and are changed by a single validated `features` command.
- **Change scopes.** The gateway debounces broadcasts by scope (`control`, `data`, `roster`, `qa`, `pulse`). Phones
  and the projector only receive a snapshot when something they display changed. A pulse change is sent back only
  to that person's own devices.

## Database migration

`server/prisma/migrations/20261028120000_runs_qa_roles` adds the tables `ActivityRun`, `Team`, `AudienceQuestion`,
`QuestionVote`, `PulseSignal`, `PulseEvent`, `AccessGrant` and `Learner`. It also adds session `features` and
`rehearsal` columns, participant `teamId`, `learnerId` and `simulated`, and submission `runId`, `review` and
`detail`.

Existing data is migrated in place. Every existing activity gets "run 1" (keeping its completed/revealed state),
and every existing submission is attached to it, so old sessions, results and CSV exports keep working unchanged.
The CSV keeps its original columns first and adds new ones at the end. The migration is applied by
`npm run db:migrate` (`prisma migrate deploy`), which the Docker entrypoint runs on start. It is tested against a
database populated at the previous schema in `server/test/migration.test.ts`.

## Known limits

- The phone remote and helpers need the server to be reachable from their phones, just like participants.
- Hotspot questions need an image. External `https://` images must allow embedding.
- YouTube and Vimeo embeds need the viewer's network to reach those services. Uploaded media files (up to 25 MB)
  play from the server.
- Self-paced response times are not shown in analytics: without a shared clock they would be misleading.
- Cross-session recognition works per device and browser. A participant who clears their browser data, or uses
  another device, starts fresh. This is the privacy trade-off.
- AI features (convert, recap summary, grouping suggestions) appear only when `AIMLAPI_KEY` is set. Everything else
  works without them.
