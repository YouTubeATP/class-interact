import { AnimatePresence, motion } from 'framer-motion';
import { Coffee, Hourglass, MessageCircleQuestion, ThumbsUp, Trophy, Users } from 'lucide-react';
import { SafeImage } from '@/components/SafeImage';
import type { ReactNode } from 'react';
import { PULSE_LABEL, quizCorrectIds, quizKind, resolveContentLayout, type AudienceQuestion, type ContentConfig, type OpenConfig, type PollConfig, type PulseSummary, type QuizConfig, type RatingConfig, type SlideMedia, type SurveyConfig, type TeamStanding, type Theme, type WordcloudConfig } from '@classinteract/shared';
import { useRemaining } from '@/components/Countdown';
import { MediaPlayer } from '@/components/Media';
import { RichInline } from '@/components/RichText';
import { quizAnswerLabel, quizAnswerLines } from '@/lib/quiz';
import { HotspotImage } from './viz/Hotspot';
import { typeMeta } from '@/activities/meta';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { BreathingGlow, DriftingShape } from '@/components/Ambient';
import { TimerRing } from '@/components/Countdown';
import { QRCode } from '@/components/QRCode';
import { Ticket } from '@/components/Ticket';
import { prettyPin } from '@/lib/joinUrl';
import { cn } from '@/lib/cn';
import { ContentSlide } from './ContentSlide';
import { FitBox } from './FitBox';
import type { StageModel } from './model';
import { ResultsView } from './ResultsView';
import { OptionTile, type TileState } from './viz/OptionTile';
import { MatchStage, OrderStage } from './viz/MatchOrder';
import { Leaderboard } from './viz/Leaderboard';
import { TeamBoard } from './viz/TeamBoard';
export { TeamBoard };

/** 16:9 letterboxed canvas. Everything inside is sized in cqw, so it looks identical at any resolution. */
export function StageFrame({ palette, background, tone, children, className, appearance = 'light', accent, testId = 'stage' }: { palette: string; background: Theme['background']; tone: string; children: ReactNode; className?: string; appearance?: 'light' | 'dark'; accent?: string; testId?: string }) {
  return (
    <div className={cn('grid size-full place-items-center', className)} style={{ containerType: 'size' }}>
      <div
        data-testid={testId}
        data-palette={palette}
        data-tone={tone}
        data-appearance={appearance}
        {...(accent ? { 'data-accent': '' } : {})}
        className="relative overflow-hidden bg-surface text-ink"
        style={{ width: 'min(100cqw, calc(100cqh * 16 / 9))', aspectRatio: '16 / 9', containerType: 'size', ...(accent ? { ['--custom-accent' as string]: accent } : {}) }}
      >
        {/*
          The base font size lives on a CHILD of the size container. A cqw unit on the container itself would
          resolve against the *outer* box, so on a letterboxed display (any window that is not exactly 16:9) every
          em-sized element would come out too big and wrap differently from the same slide in the dashboard replica.
          Optical sizing is pinned so glyph widths are identical at every scale; otherwise text wraps differently
          on a thumbnail than on the projector.
        */}
        <div className="absolute inset-0" style={{ fontSize: '1cqw', fontOpticalSizing: 'none', fontVariationSettings: "'opsz' 28" }}>
          {background === 'soft' && (
            <>
              <motion.div aria-hidden className="absolute -right-[9%] -top-[18%] size-[46%]" key={tone} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 0.7 }} transition={{ type: 'spring', stiffness: 80, damping: 18 }}>
                <DriftingShape className="inset-0 rounded-full bg-tone" dx={22} dy={16} duration={22} />
              </motion.div>
              <DriftingShape className="-bottom-[26%] -left-[8%] size-[38%] rounded-full bg-accent-soft opacity-70" dx={-18} dy={14} duration={26} delay={3} />
            </>
          )}
          {background === 'gradient' && <div aria-hidden className="absolute inset-0" style={{ background: 'radial-gradient(120% 90% at 100% 0%, var(--tone) 0%, transparent 55%), radial-gradient(90% 80% at 0% 100%, var(--accent-soft) 0%, transparent 60%)' }} />}
          {background === 'grid' && <div aria-hidden className="absolute inset-0 opacity-60" style={{ backgroundImage: 'linear-gradient(var(--color-line) 1px, transparent 1px), linear-gradient(90deg, var(--color-line) 1px, transparent 1px)', backgroundSize: '4em 4em' }} />}
          {children}
        </div>
      </div>
    </div>
  );
}

/** The presentation's own logo and footer line (optional branding). */
function Branding({ theme, footer = true }: { theme: Theme; footer?: boolean }) {
  return (
    <>
      {theme.logo && <img src={theme.logo.url} alt={theme.logo.alt || ''} referrerPolicy="no-referrer" className="absolute right-[2.4%] top-[3%] z-10 h-[3.4em] max-w-[14em] object-contain" data-testid="stage-logo" />}
      {footer && theme.footer && <p className="absolute bottom-[1.1%] left-1/2 z-10 max-w-[36%] -translate-x-1/2 truncate text-center text-[1.15em] font-semibold text-ink-3" data-testid="stage-footer">{theme.footer}</p>}
    </>
  );
}

const PHASE_LABEL: Record<string, string> = { ready: 'Get ready', open: 'Responses open', closed: 'Responses closed', revealed: 'Results', completed: 'Finished' };

function TypeChip({ type }: { type: keyof typeof typeMeta }) {
  const m = typeMeta[type];
  return (
    <span className="inline-flex items-center gap-[0.55em] rounded-full bg-tone px-[1em] py-[0.4em] text-[1.45em] font-bold text-tone-ink">
      <m.icon className="size-[1.1em]" aria-hidden /> {m.label}
    </span>
  );
}

/**
 * The join code in the corner of every slide: big enough to scan from the back of the room (the QR is about 11% of
 * the stage width, ~210 px on a 1080p projector) with the address in large type. Slides keep the bottom band of the
 * stage (CORNER_BAND) free for it, so it never covers content.
 */
const CORNER_BAND = '15cqw';
function JoinCorner({ m }: { m: StageModel }) {
  return (
    <div className="absolute bottom-[2.6%] right-[2.4%] z-10 max-w-[44%]" style={{ fontSize: '1cqw' }}>
      <Ticket pin={m.session.pin} url={m.join.url} host={m.join.host} variant="corner" />
    </div>
  );
}

function ResponseMeter({ m }: { m: StageModel }) {
  const { responses, respondents, participants } = m.counts;
  const pct = participants ? Math.min(100, (respondents / participants) * 100) : 0;
  return (
    <div className="flex items-center gap-[1em]" data-testid="response-meter">
      <span className="grid size-[3.4em] place-items-center rounded-full bg-tone text-tone-ink"><Users className="size-[1.7em]" aria-hidden /></span>
      <div className="grid gap-[0.35em]">
        <div className="text-[1.9em] font-bold leading-none">
          <AnimatedNumber value={responses} className="tabular" testId="stage-responses" /> <span className="text-[0.75em] font-semibold text-ink-2">{responses === 1 ? 'response' : 'responses'}</span>
        </div>
        <div className="flex items-center gap-[0.7em]">
          <div className="h-[0.55em] w-[12em] overflow-hidden rounded-full bg-ink/8">
            <motion.div className="h-full rounded-full bg-tone-strong" animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
          </div>
          <span className="tabular text-[1.2em] font-semibold text-ink-2">{respondents} of {participants} answered</span>
        </div>
      </div>
    </div>
  );
}

function questionText(m: StageModel): string {
  const c = m.activity!.config as { question?: string; title?: string };
  return m.activity!.type === 'survey' ? (c.title ?? '') : (c.question ?? '');
}

/** Typed, numeric and hotspot questions on the projector: the prompt, then the answers once results are shown. */
function OpenQuizBody({ m, c }: { m: StageModel; c: QuizConfig }) {
  const kind = quizKind(c);
  const { state, results } = m;
  const revealed = state.correctVisible;
  const key = revealed ? quizAnswerLines(c) : [];
  if (kind === 'hotspot' && c.image) {
    const pts = results?.type === 'quiz' && results.kind === 'points' ? results.points : [];
    return (
      <div className="grid h-full grid-rows-[auto_minmax(0,1fr)] gap-[0.8em]">
        <p className="text-[1.6em] font-bold text-ink-2" data-testid="stage-hotspot-hint">{revealed ? `${results?.type === 'quiz' && results.kind === 'points' && results.correctCount !== null ? results.correctCount : 0} of ${pts.length} tapped a correct spot` : 'Tap the spot on your phone'}</p>
        <HotspotImage url={c.image.url} alt={c.image.alt} points={results ? pts : []} regions={revealed ? c.regions : []} maxHeight="30em" testId="stage-hotspot" />
      </div>
    );
  }
  return (
    <div className="grid gap-[1.2em]">
      {!results && <p className="max-w-[40em] text-[2.1em] font-medium text-ink-2">{kind === 'numeric' ? `Type a number on your phone${c.view?.unit || c.numeric?.unit ? ` (in ${c.view?.unit || c.numeric?.unit})` : ''}.` : 'Type your answer on your phone.'}</p>}
      {results && results.type === 'quiz' && <ResultsView type="quiz" config={c} results={results} />}
      <AnimatePresence>
        {revealed && key.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="max-w-[60em] rounded-[0.9em] bg-ok-soft px-[1em] py-[0.7em] text-[1.7em] font-semibold text-ok-ink" data-testid="stage-answer-key">
            {quizAnswerLabel(c)}: {key.join(' · ')}{c.explanation && <span className="mt-[0.3em] block font-medium">{c.explanation}</span>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ActivityBody({ m }: { m: StageModel }) {
  const a = m.activity!;
  const { state, results } = m;
  const showResults = !!results && results.type !== 'content';

  if (a.type === 'quiz') {
    const c = a.config as QuizConfig;
    const correct = state.correctVisible ? quizCorrectIds(c) : [];
    const kind = quizKind(c);
    if (kind === 'text' || kind === 'numeric' || kind === 'hotspot') return <OpenQuizBody m={m} c={c} />;
    const counts = showResults && results.type === 'quiz' && results.kind === 'choice' ? results.counts : null;
    const total = showResults && results.type === 'quiz' ? results.total : 0;
    if ((quizKind(c) === 'match' || quizKind(c) === 'order') && c.view) {
      const revealedKey = state.correctVisible;
      return (
        <div className="grid gap-[1.2em]">
          <p className="-mb-[0.2em] text-[1.6em] font-bold text-ink-2" data-testid="stage-arrange-hint">{quizKind(c) === 'match' ? 'Match each item on your phone' : 'Put them in order on your phone'}</p>
          {quizKind(c) === 'match' ? <MatchStage view={c.view} revealed={revealedKey} /> : <OrderStage view={c.view} revealed={revealedKey} />}
          <AnimatePresence>
            {revealedKey && c.explanation && (
              <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="max-w-[60em] rounded-[0.9em] bg-ok-soft px-[1em] py-[0.7em] text-[1.7em] font-semibold text-ok-ink">
                {c.explanation}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      );
    }
    return (
      <div className="grid gap-[1.4em]">
        {quizKind(c) === 'multiple' && <p className="-mb-[0.4em] text-[1.6em] font-bold text-ink-2" data-testid="stage-multi-hint">Select all that apply</p>}
        <div className={cn('grid gap-[0.9em]', c.options.length > 3 ? 'grid-cols-2' : 'grid-cols-1')}>
          {c.options.map((o, i) => {
            const tile: TileState = correct.length ? (correct.includes(o.id) ? 'correct' : 'dim') : 'idle';
            return <OptionTile key={o.id} index={i} text={<RichInline text={o.text} />} count={counts ? (counts[o.id] ?? 0) : undefined} total={total} state={tile} delay={i * 0.06} />;
          })}
        </div>
        <AnimatePresence>
          {correct.length > 0 && c.explanation && (
            <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="max-w-[60em] rounded-[0.9em] bg-ok-soft px-[1em] py-[0.7em] text-[1.7em] font-semibold text-ok-ink">
              {c.explanation}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    );
  }

  if (showResults) {
    return (
      <div className={cn(a.type === 'wordcloud' && 'h-full')}>
        <ResultsView type={a.type} config={a.config} results={results!} fill={a.type === 'wordcloud'} />
      </div>
    );
  }

  // no results on screen yet
  if (a.type === 'survey') {
    const c = a.config as SurveyConfig;
    return (
      <div className="grid max-w-[54em] gap-[0.8em]">
        {c.description && <p className="text-[2em] font-medium text-ink-2">{c.description}</p>}
        <p className="text-[1.9em] font-semibold text-ink-2">{c.questions.length} {c.questions.length === 1 ? 'question' : 'questions'}. Answer them all on your phone.</p>
      </div>
    );
  }
  const hint = promptHint(a.type, a.config);
  return <p className="max-w-[40em] text-[2.1em] font-medium text-ink-2">{hint}</p>;
}

function promptHint(type: string, config: unknown): string {
  if (type === 'wordcloud') {
    const c = config as WordcloudConfig;
    return `Type ${c.maxWords === 1 ? 'one word' : 'a word or a few words'} on your phone${c.maxSubmissions > 1 ? ` (up to ${c.maxSubmissions} answers)` : ''}.`;
  }
  if (type === 'open') return (config as OpenConfig).mode === 'paragraph' ? 'Write your answer on your phone.' : 'Type your answer on your phone.';
  if (type === 'rating') return `Choose ${(config as RatingConfig).min} to ${(config as RatingConfig).max} on your phone.`;
  if (type === 'poll') return (config as PollConfig).multiple ? 'Choose all that apply on your phone.' : 'Choose one option on your phone.';
  return 'Answer on your phone.';
}

function ActivityView({ m }: { m: StageModel }) {
  const a = m.activity!;
  const { state } = m;
  const q = questionText(m);
  const size = q.length > 120 ? 'text-[2.9em]' : q.length > 70 ? 'text-[3.5em]' : 'text-[4.3em]';
  const showTimer = state.phase === 'open' && state.deadlineAt;
  const hotspot = a.type === 'quiz' && quizKind(a.config as QuizConfig) === 'hotspot';
  const image = hotspot ? undefined : (a.config as { image?: { url: string; alt: string; fit: 'cover' | 'contain' } }).image;
  const media = (a.config as { media?: SlideMedia }).media;
  const side = !!image || !!media;
  return (
    <div className="absolute inset-0 grid grid-rows-[auto_auto_1fr_auto] px-[4.2%] pb-[3%] pt-[3.4%]">
      <div className="flex items-center justify-between gap-[1.5em]">
        <div className="flex items-center gap-[1em]">
          <TypeChip type={a.type} />
          <span className="text-[1.45em] font-semibold text-ink-2" data-testid="stage-phase">{PHASE_LABEL[state.phase] ?? ''}</span>
          {m.run && m.run.number > 1 && <span className="rounded-full bg-ink/6 px-[0.8em] py-[0.25em] text-[1.3em] font-bold text-ink-2" data-testid="stage-run">Round {m.run.number}</span>}
        </div>
        <div className="flex items-center gap-[1.4em]">
          {m.session.theme.logo && <img src={m.session.theme.logo.url} alt={m.session.theme.logo.alt || ''} referrerPolicy="no-referrer" className="h-[3em] max-w-[12em] object-contain" data-testid="stage-logo" />}
          {m.session.mode === 'standalone' && <span className="tabular rounded-full bg-ink/6 px-[0.9em] py-[0.3em] text-[1.4em] font-bold text-ink-2">{a.index + 1} / {m.session.activityCount}</span>}
          {showTimer && <TimerRing openedAt={state.openedAt} deadlineAt={state.deadlineAt} now={m.now} className="w-[6.4em] text-[1em]" />}
        </div>
      </div>
      <div className="relative">
        <h2 className={cn('display mt-[1.6em]', side ? 'max-w-[64%]' : 'max-w-[88%]', size)} data-testid="stage-question"><RichInline text={q} /></h2>
        {image && <SafeImage src={image.url} alt={image.alt} fit={image.fit} className="absolute right-0 top-[1.2em] z-0 h-[17.5em] w-[26em] rounded-[1.2em] ring-1 ring-line" />}
        {!image && media && <MediaPlayer media={media} compact className="absolute right-0 top-[1.2em] z-0 w-[26em] text-[1em]" />}
      </div>
      <div className={cn('min-h-0 pr-[1%]', side ? 'mt-[2.6em]' : 'mt-[1.8em]')}>
        {hotspot ? <ActivityBody m={m} /> : <FitBox><ActivityBody m={m} /></FitBox>}
      </div>
      <div className="flex items-end justify-between pt-[1em]" style={{ minHeight: `calc(${CORNER_BAND} - 3cqw)` /* the row sits above the 3% bottom padding */ }}>
        {a.interactive && state.phase !== 'ready' ? <ResponseMeter m={m} /> : <span />}
        <span aria-hidden />
      </div>
      <JoinCorner m={m} />
    </div>
  );
}

function LobbyView({ m }: { m: StageModel }) {
  const standby = m.state.phase === 'standby';
  const names = m.recentNames;
  return (
    <div className="absolute inset-0 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-[4em] py-[3.2%] pl-[5%] pr-[4.5%]">
      <div className="grid min-w-0 content-center gap-[1.1em]">
        <p className="text-[1.8em] font-semibold text-ink-2">{m.session.title}</p>
        <h1 className="display max-w-[11em] text-[5.6em]" data-testid="lobby-heading">{standby ? 'Back in a moment' : 'Join this session'}</h1>
        <p className="max-w-[24em] text-[2.1em] font-medium leading-snug text-ink-2">
          {standby ? 'Stay on this page. The next activity will appear on your phone by itself.' : 'Point your phone camera at the code. You join once and stay connected for the whole session.'}
        </p>
        <div className="mt-[0.6em] flex max-w-[40em] flex-wrap gap-[0.6em]" aria-label="People who have joined">
          <AnimatePresence initial={false}>
            {names.slice(0, 18).map((n) => (
              <motion.span key={n} layout initial={{ opacity: 0, scale: 0.5, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.6 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }} className="rounded-full bg-surface px-[0.9em] py-[0.35em] text-[1.5em] font-semibold ring-1 ring-line">
                {n}
              </motion.span>
            ))}
          </AnimatePresence>
          {names.length > 18 && <span className="px-[0.5em] py-[0.35em] text-[1.5em] font-semibold text-ink-2">+{names.length - 18} more</span>}
        </div>
        <p className="flex items-center gap-[0.6em] text-[1.9em] font-bold" data-testid="lobby-count">
          <Users className="size-[1.1em] text-accent" aria-hidden />
          <AnimatedNumber value={m.counts.participants} /> {m.counts.participants === 1 ? 'person' : 'people'} joined
        </p>
      </div>
      {/* The code is the biggest thing on this screen: about a quarter of the stage width, so it scans from the back row. */}
      <div className="relative" style={{ width: '26cqw', fontSize: '1.3cqw' }}>
        <BreathingGlow className="inset-[-5%] opacity-50" from={0.25} to={0.6} duration={5} />
        <div className="relative"><Ticket pin={m.session.pin} url={m.join.url} host={m.join.host} variant="poster" animate /></div>
      </div>
    </div>
  );
}

/** "Show join QR": over whatever is on screen, without touching the activity underneath. */
export function JoinOverlay({ m }: { m: StageModel }) {
  return (
    <motion.div className="absolute inset-0 z-40 grid place-items-center bg-[rgb(8_10_24/0.82)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} data-testid="join-overlay">
      <motion.div className="grid grid-cols-[auto_minmax(0,28em)] items-center gap-[3em] rounded-[2em] bg-white p-[2.4em] text-ink" data-appearance="light" initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 28 }}>
        <div style={{ width: '40cqw' }}><QRCode value={m.join.url} snap className="w-full" label="QR code to join the session" /></div>
        <div className="grid gap-[1em]">
          <p className="text-[2.6em] font-extrabold leading-tight">Join the session</p>
          <p className="text-[1.7em] leading-snug text-ink-2">Scan with your phone camera, or go to <strong className="text-ink [overflow-wrap:anywhere]">{m.join.host}</strong> and enter</p>
          <p className="display tabular whitespace-nowrap text-[5.6em] leading-none" data-testid="overlay-pin">{prettyPin(m.session.pin)}</p>
        </div>
      </motion.div>
    </motion.div>
  );
}

function LeaderboardView({ m }: { m: StageModel }) {
  const teams = m.state.leaderboardMode === 'team' && m.teamBoard?.length;
  return (
    <div className="absolute inset-0 grid grid-rows-[auto_1fr] gap-[2em] px-[8%] py-[5%]">
      <div className="flex items-center gap-[1em]">
        <span className="grid size-[4em] place-items-center rounded-full bg-gold text-gold-ink"><Trophy className="size-[2em]" aria-hidden /></span>
        <h2 className="display text-[4.6em]">{teams ? 'Team leaderboard' : 'Leaderboard'}</h2>
      </div>
      {teams ? <TeamBoard teams={m.teamBoard!} /> : <Leaderboard standings={m.leaderboard ?? []} limit={7} className="content-start text-[1.1em]" />}
    </div>
  );
}

function EndedView({ m }: { m: StageModel }) {
  return (
    <div className="absolute inset-0 grid grid-cols-2 items-center gap-[4em] px-[7%] py-[5%]">
      <div className="grid gap-[1em]">
        <p className="text-[1.8em] font-semibold text-ink-2">{m.session.title}</p>
        <h1 className="display text-[6.6em]" data-testid="ended-heading">That’s a wrap</h1>
        <p className="text-[2.1em] font-medium text-ink-2">Thank you for taking part.</p>
      </div>
      {m.teamBoard && m.teamBoard.length > 0 ? <TeamBoard teams={m.teamBoard} /> : m.leaderboard && m.leaderboard.length > 0 ? <Leaderboard standings={m.leaderboard} limit={5} className="text-[1em]" /> : <span />}
    </div>
  );
}

function contentForPhase(m: StageModel): { key: string; node: ReactNode; tone: string } {
  const { state, activity } = m;
  if (state.phase === 'lobby' || state.phase === 'standby') return { key: state.phase, node: <LobbyView m={m} />, tone: 'content' };
  if (state.phase === 'ended') return { key: 'ended', node: <EndedView m={m} />, tone: 'content' };
  if (!activity) return { key: 'none', node: <LobbyView m={m} />, tone: 'content' };
  if (state.leaderboardVisible && (m.leaderboard?.length || (state.leaderboardMode === 'team' && m.teamBoard?.length))) return { key: `board:${state.leaderboardMode ?? 'individual'}`, node: <LeaderboardView m={m} />, tone: 'quiz' };
  if (activity.type === 'content') {
    const c = activity.config as ContentConfig;
    const full = resolveContentLayout(c) === 'full-image';
    return {
      key: `slide:${activity.id}`,
      tone: 'content',
      node: full ? <ContentSlide config={c} /> : (
        <div className="absolute inset-0 px-[6%] pt-[5.5%]" style={{ paddingBottom: CORNER_BAND }}>
          {/* leave the bottom band to the join ticket; shrink long slides instead of letting them run off */}
          <FitBox><ContentSlide config={c} /></FitBox>
          <JoinCorner m={m} />
        </div>
      ),
    };
  }
  return { key: `act:${activity.id}`, node: <ActivityView m={m} />, tone: activity.type };
}

/** A pause screen over everything: break, preparation or work time, with an optional countdown. */
function BreakView({ m }: { m: StageModel }) {
  const b = m.state.breakScreen!;
  const left = useRemaining(b.endsAt, m.now);
  const Icon = b.kind === 'break' ? Coffee : Hourglass;
  const fallback = b.kind === 'break' ? 'Break' : b.kind === 'prepare' ? 'Get ready' : 'Work time';
  const mm = left === null ? null : `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
  return (
    <motion.div className="absolute inset-0 z-30 grid place-items-center bg-surface" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="stage-break">
      <div className="grid justify-items-center gap-[1.4em] px-[8%] text-center">
        <span className="grid size-[6em] place-items-center rounded-full bg-accent-soft text-accent-ink"><Icon className="size-[3em]" aria-hidden /></span>
        <h1 className="display text-[6em]">{b.title || fallback}</h1>
        {b.message && <p className="max-w-[34em] whitespace-pre-line text-[2.3em] font-medium leading-snug text-ink-2">{b.message}</p>}
        {mm !== null && (left! > 0
          ? <p className="display tabular text-[9em] leading-none text-accent-ink" role="timer" aria-label={`${mm} left`} data-testid="break-countdown">{mm}</p>
          : <p className="text-[3em] font-bold text-ok" data-testid="break-done">Time’s up. We are about to start again.</p>)}
      </div>
    </motion.div>
  );
}

/** Audience questions on the big screen. */
function QaBoard({ m }: { m: StageModel }) {
  const list = (m.questions ?? []).slice(0, 6);
  return (
    <motion.div className="absolute inset-0 z-20 grid grid-rows-[auto_1fr] gap-[1.6em] bg-surface px-[6%] py-[4.5%]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="stage-qa">
      <div className="flex items-end justify-between gap-[2em]">
        <h2 className="display flex items-center gap-[0.4em] text-[4.4em]"><MessageCircleQuestion className="size-[1em] text-accent" aria-hidden /> Questions</h2>
        <p className="text-[1.6em] font-semibold text-ink-2">Ask and upvote on your phone at <strong className="text-ink">{m.join.host}</strong></p>
      </div>
      {list.length === 0 ? <p className="self-center justify-self-center text-[2.4em] font-semibold text-ink-3">No questions yet. Tap “Ask” on your phone.</p> : (
        <ol className="grid content-start gap-[0.8em]">
          <AnimatePresence initial={false}>
            {list.map((q) => (
              <motion.li key={q.id} layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={cn('flex items-start gap-[1em] rounded-[1em] border px-[1.1em] py-[0.8em]', q.pinned ? 'border-accent bg-accent-soft' : 'border-line bg-paper')}>
                <span className="grid min-w-[3.2em] shrink-0 justify-items-center rounded-[0.7em] bg-surface px-[0.6em] py-[0.3em] text-[1.5em] font-extrabold ring-1 ring-line"><ThumbsUp className="size-[0.8em] text-accent" aria-hidden /><span className="tabular">{q.votes}</span></span>
                <span className="min-w-0 flex-1 text-[2em] font-semibold leading-snug">{q.text}<span className="mt-[0.2em] block text-[0.62em] font-medium text-ink-3">{q.authorName ?? 'Anonymous'}</span></span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}
    </motion.div>
  );
}

/** One question shown large over whatever is on screen. */
function HighlightCard({ q }: { q: AudienceQuestion }) {
  return (
    <motion.div className="absolute inset-x-[8%] bottom-[6%] z-30 rounded-[1.4em] bg-surface p-[1.6em] shadow-[0_1.4em_3em_-1em_var(--color-shadow)] ring-[0.18em] ring-accent" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} data-testid="stage-highlight">
      <p className="mb-[0.4em] flex items-center gap-[0.5em] text-[1.4em] font-bold text-accent-ink"><MessageCircleQuestion className="size-[1.1em]" aria-hidden /> Question from {q.authorName ?? 'the audience'} · {q.votes} {q.votes === 1 ? 'vote' : 'votes'}</p>
      <p className="display text-[3.4em] leading-tight">{q.text}</p>
    </motion.div>
  );
}

const PULSE_COLOR = { got: 'var(--color-ok)', unsure: 'var(--color-warn)', lost: 'var(--color-bad)' } as const;

/** How the room feels about the lesson so far: counts only, never names. */
export function PulseChart({ pulse, className }: { pulse: PulseSummary; className?: string }) {
  const total = Math.max(1, pulse.total);
  const max = Math.max(1, ...pulse.trend.map((t) => t.got + t.unsure + t.lost));
  return (
    <div className={cn('grid gap-[1.2em]', className)} data-testid="pulse-chart">
      <div className="grid grid-cols-3 gap-[1em]">
        {(['got', 'unsure', 'lost'] as const).map((k) => (
          <div key={k} className="grid gap-[0.3em] rounded-[1em] bg-paper p-[1em] ring-1 ring-line">
            <span className="flex items-center gap-[0.4em] text-[1.4em] font-bold text-ink-2"><span className="size-[0.7em] rounded-full" style={{ background: PULSE_COLOR[k] }} aria-hidden />{PULSE_LABEL[k]}</span>
            <span className="display tabular text-[4em] leading-none" data-testid={`pulse-${k}`}>{pulse[k]}</span>
            <span className="tabular text-[1.3em] font-semibold text-ink-3">{Math.round((pulse[k] / total) * 100)}%</span>
          </div>
        ))}
      </div>
      {pulse.trend.some((t) => t.got + t.unsure + t.lost > 0) && (
        <div className="flex h-[8em] items-end gap-[0.3em]" role="img" aria-label="Understanding over the last 20 minutes">
          {pulse.trend.map((t) => {
            const n = t.got + t.unsure + t.lost;
            return (
              <div key={t.t} className="flex h-full min-w-0 flex-1 flex-col-reverse overflow-hidden rounded-[0.25em]" style={{ height: `${Math.max(4, (n / max) * 100)}%` }}>
                {(['got', 'unsure', 'lost'] as const).map((k) => <span key={k} style={{ height: n ? `${(t[k] / n) * 100}%` : 0, background: PULSE_COLOR[k] }} />)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PulseBoard({ m }: { m: StageModel }) {
  return (
    <motion.div className="absolute inset-0 z-20 grid content-center gap-[2em] bg-surface px-[10%]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="stage-pulse">
      <h2 className="display text-[4.4em]">How is it going?</h2>
      {m.pulse ? <PulseChart pulse={m.pulse} className="text-[1.2em]" /> : <p className="text-[2em] text-ink-3">Nobody has said yet.</p>}
      <p className="text-[1.6em] font-medium text-ink-2">Change yours any time on your phone. Answers are anonymous.</p>
    </motion.div>
  );
}

/** The whole projector screen. Cross-fades between lobby, slides, activities and the leaderboard. */
export function StageView({ m, background, testId }: { m: StageModel; background?: Theme['background']; testId?: string }) {
  const view = contentForPhase(m);
  const theme = m.session.theme;
  const ov = m.state.overlay;
  return (
    <StageFrame palette={theme.palette} accent={theme.accent} background={background ?? theme.background} tone={view.tone} appearance={m.appearance ?? 'light'} testId={testId}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={view.key} className="absolute inset-0" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.28, ease: [0.3, 0.7, 0.2, 1] }}>
          {view.node}
        </motion.div>
      </AnimatePresence>
      {!view.key.startsWith('act:') && <Branding theme={theme} />}
      {view.key.startsWith('act:') && <Branding theme={{ ...theme, logo: undefined }} />}
      <AnimatePresence>
        {ov === 'qa' && m.questions && <QaBoard key="qa" m={m} />}
        {ov === 'pulse' && <PulseBoard key="pulse" m={m} />}
      </AnimatePresence>
      <AnimatePresence>{m.highlight && ov !== 'qa' && <HighlightCard key={m.highlight.id} q={m.highlight} />}</AnimatePresence>
      <AnimatePresence>{m.state.breakScreen && <BreakView key="break" m={m} />}</AnimatePresence>
      <AnimatePresence>{ov === 'join' && m.state.phase !== 'ended' && <JoinOverlay key="join" m={m} />}</AnimatePresence>
      {m.state.phase === 'open' && m.activity?.interactive && <span className="sr-only" aria-live="polite">Responses are open</span>}
    </StageFrame>
  );
}
