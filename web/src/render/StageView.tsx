import { AnimatePresence, motion } from 'framer-motion';
import { Trophy, Users } from 'lucide-react';
import { SafeImage } from '@/components/SafeImage';
import type { ReactNode } from 'react';
import { resolveContentLayout, type ContentConfig, type OpenConfig, type PollConfig, type QuizConfig, type RatingConfig, type SurveyConfig, type WordcloudConfig } from '@classinteract/shared';
import { typeMeta } from '@/activities/meta';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { BreathingGlow, DriftingShape } from '@/components/Ambient';
import { TimerRing } from '@/components/Countdown';
import { Ticket } from '@/components/Ticket';
import { cn } from '@/lib/cn';
import { ContentSlide } from './ContentSlide';
import type { StageModel } from './model';
import { ResultsView } from './ResultsView';
import { OptionTile, type TileState } from './viz/OptionTile';
import { Leaderboard } from './viz/Leaderboard';

/** 16:9 letterboxed canvas. Everything inside is sized in cqw, so it looks identical at any resolution. */
export function StageFrame({ palette, background, tone, children, className }: { palette: string; background: 'soft' | 'plain'; tone: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid size-full place-items-center', className)} style={{ containerType: 'size' }}>
      <div
        data-palette={palette}
        data-tone={tone}
        className="relative overflow-hidden bg-surface text-ink"
        style={{ width: 'min(100cqw, calc(100cqh * 16 / 9))', aspectRatio: '16 / 9', containerType: 'size', fontSize: '1cqw' }}
      >
        {background === 'soft' && (
          <>
            <motion.div aria-hidden className="absolute -right-[9%] -top-[18%] size-[46%]" key={tone} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 0.7 }} transition={{ type: 'spring', stiffness: 80, damping: 18 }}>
              <DriftingShape className="inset-0 rounded-full bg-tone" dx={22} dy={16} duration={22} />
            </motion.div>
            <DriftingShape className="-bottom-[26%] -left-[8%] size-[38%] rounded-full bg-accent-soft opacity-70" dx={-18} dy={14} duration={26} delay={3} />
          </>
        )}
        {children}
      </div>
    </div>
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

function JoinCorner({ m }: { m: StageModel }) {
  return (
    <div className="absolute bottom-[3%] right-[3%] z-10" style={{ width: '17.5%', fontSize: '1.05cqw' }}>
      <Ticket pin={m.session.pin} url={m.join.url} host={m.join.host} variant="mini" />
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

function ActivityBody({ m }: { m: StageModel }) {
  const a = m.activity!;
  const { state, results } = m;
  const showResults = !!results && results.type !== 'content';

  if (a.type === 'quiz') {
    const c = a.config as QuizConfig;
    const correct = state.correctVisible && c.correctOptionId ? c.correctOptionId : null;
    const counts = showResults && results.type === 'quiz' ? results.counts : null;
    const total = showResults && results.type === 'quiz' ? results.total : 0;
    return (
      <div className="grid gap-[1.4em]">
        <div className={cn('grid gap-[0.9em]', c.options.length > 3 ? 'grid-cols-2' : 'grid-cols-1')}>
          {c.options.map((o, i) => {
            const tile: TileState = correct ? (o.id === correct ? 'correct' : 'dim') : 'idle';
            return <OptionTile key={o.id} index={i} text={o.text} count={counts ? (counts[o.id] ?? 0) : undefined} total={total} state={tile} delay={i * 0.06} />;
          })}
        </div>
        <AnimatePresence>
          {correct && c.explanation && (
            <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="max-w-[60em] rounded-[0.9em] bg-ok-soft px-[1em] py-[0.7em] text-[1.7em] font-semibold text-[#0b4a30]">
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
  const image = (a.config as { image?: { url: string; alt: string; fit: 'cover' | 'contain' } }).image;
  return (
    <div className="absolute inset-0 grid grid-rows-[auto_auto_1fr_auto] px-[4.2%] pb-[3%] pt-[3.4%]">
      <div className="flex items-center justify-between gap-[1.5em]">
        <div className="flex items-center gap-[1em]">
          <TypeChip type={a.type} />
          <span className="text-[1.45em] font-semibold text-ink-2" data-testid="stage-phase">{PHASE_LABEL[state.phase] ?? ''}</span>
        </div>
        <div className="flex items-center gap-[1.4em]">
          {m.session.mode === 'standalone' && <span className="tabular rounded-full bg-ink/6 px-[0.9em] py-[0.3em] text-[1.4em] font-bold text-ink-2">{a.index + 1} / {m.session.activityCount}</span>}
          {showTimer && <TimerRing openedAt={state.openedAt} deadlineAt={state.deadlineAt} now={m.now} className="w-[6.4em] text-[1em]" />}
        </div>
      </div>
      <div className="relative">
        <h2 className={cn('display mt-[1.6em]', image ? 'max-w-[64%]' : 'max-w-[88%]', size)} data-testid="stage-question">{q}</h2>
        {image && <SafeImage src={image.url} alt={image.alt} fit={image.fit} className="absolute right-0 top-[1.2em] z-0 h-[17.5em] w-[26em] rounded-[1.2em] ring-1 ring-line" />}
      </div>
      <div className={cn('min-h-0 pr-[1%]', image ? 'mt-[2.6em]' : 'mt-[1.8em]')}>
        <ActivityBody m={m} />
      </div>
      <div className="flex min-h-[5.6em] items-end justify-between pt-[1em]">
        {a.interactive && state.phase !== 'ready' ? <ResponseMeter m={m} /> : <span />}
        <span className="w-[17.5%]" aria-hidden />
      </div>
      <JoinCorner m={m} />
    </div>
  );
}

function LobbyView({ m }: { m: StageModel }) {
  const standby = m.state.phase === 'standby';
  const names = m.recentNames;
  return (
    <div className="absolute inset-0 grid grid-cols-[1fr_auto] items-center gap-[4em] px-[5%] py-[4%]">
      <div className="grid content-center gap-[1.2em]">
        <p className="text-[1.8em] font-semibold text-ink-2">{m.session.title}</p>
        <h1 className="display max-w-[11em] text-[6.6em]" data-testid="lobby-heading">{standby ? 'Back in a moment' : 'Join this session'}</h1>
        <p className="max-w-[26em] text-[2.1em] font-medium leading-snug text-ink-2">
          {standby ? 'Stay on this page. The next activity will appear on your phone by itself.' : 'Scan the code with your phone camera. You only need to join once — you stay connected for the whole session.'}
        </p>
        <div className="mt-[0.8em] flex max-w-[44em] flex-wrap gap-[0.6em]" aria-label="People who have joined">
          <AnimatePresence initial={false}>
            {names.slice(0, 24).map((n) => (
              <motion.span key={n} layout initial={{ opacity: 0, scale: 0.5, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.6 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }} className="rounded-full bg-surface px-[0.9em] py-[0.35em] text-[1.5em] font-semibold ring-1 ring-line">
                {n}
              </motion.span>
            ))}
          </AnimatePresence>
          {names.length > 24 && <span className="px-[0.5em] py-[0.35em] text-[1.5em] font-semibold text-ink-2">+{names.length - 24} more</span>}
        </div>
        <p className="flex items-center gap-[0.6em] text-[1.9em] font-bold" data-testid="lobby-count">
          <Users className="size-[1.1em] text-accent" aria-hidden />
          <AnimatedNumber value={m.counts.participants} /> {m.counts.participants === 1 ? 'person' : 'people'} joined
        </p>
      </div>
      <div className="relative" style={{ width: '44cqw', fontSize: '1.5cqw' }}>
        {/* the ticket "breathes": a slow halo says this is the thing to scan */}
        <BreathingGlow className="inset-[-6%] opacity-60" from={0.3} to={0.75} duration={5} />
        <BreathingGlow className="inset-[2%] bg-tone-strong" from={0.15} to={0.45} duration={5} delay={1.2} />
        <div className="relative"><Ticket pin={m.session.pin} url={m.join.url} host={m.join.host} variant="hero" animate /></div>
      </div>
    </div>
  );
}

function LeaderboardView({ m }: { m: StageModel }) {
  return (
    <div className="absolute inset-0 grid grid-rows-[auto_1fr] gap-[2em] px-[8%] py-[5%]">
      <div className="flex items-center gap-[1em]">
        <span className="grid size-[4em] place-items-center rounded-full bg-[#ffe08a] text-[#5d4100]"><Trophy className="size-[2em]" aria-hidden /></span>
        <h2 className="display text-[4.6em]">Leaderboard</h2>
      </div>
      <Leaderboard standings={m.leaderboard ?? []} limit={7} className="content-start text-[1.1em]" />
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
      {m.leaderboard && m.leaderboard.length > 0 ? <Leaderboard standings={m.leaderboard} limit={5} className="text-[1em]" /> : <span />}
    </div>
  );
}

function contentForPhase(m: StageModel): { key: string; node: ReactNode; tone: string } {
  const { state, activity } = m;
  if (state.phase === 'lobby' || state.phase === 'standby') return { key: state.phase, node: <LobbyView m={m} />, tone: 'content' };
  if (state.phase === 'ended') return { key: 'ended', node: <EndedView m={m} />, tone: 'content' };
  if (!activity) return { key: 'none', node: <LobbyView m={m} />, tone: 'content' };
  if (state.leaderboardVisible && m.leaderboard?.length) return { key: 'board', node: <LeaderboardView m={m} />, tone: 'quiz' };
  if (activity.type === 'content') {
    const c = activity.config as ContentConfig;
    const full = resolveContentLayout(c) === 'full-image';
    return {
      key: `slide:${activity.id}`,
      tone: 'content',
      node: full ? <ContentSlide config={c} /> : (
        <div className="absolute inset-0 px-[6%] py-[5.5%]">
          <ContentSlide config={c} />
          <JoinCorner m={m} />
        </div>
      ),
    };
  }
  return { key: `act:${activity.id}`, node: <ActivityView m={m} />, tone: activity.type };
}

/** The whole projector screen. Cross-fades between lobby, slides, activities and the leaderboard. */
export function StageView({ m, background }: { m: StageModel; background?: 'soft' | 'plain' }) {
  const view = contentForPhase(m);
  return (
    <StageFrame palette={m.session.theme.palette} background={background ?? m.session.theme.background} tone={view.tone}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={view.key} className="absolute inset-0" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.28, ease: [0.3, 0.7, 0.2, 1] }}>
          {view.node}
        </motion.div>
      </AnimatePresence>
      {m.state.phase === 'open' && m.activity?.interactive && <span className="sr-only" aria-live="polite">Responses are open</span>}
    </StageFrame>
  );
}
