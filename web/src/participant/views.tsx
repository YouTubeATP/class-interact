import { AnimatePresence, motion } from 'framer-motion';
import { Check, Frown, PartyPopper, Trophy } from 'lucide-react';
import { TriangleAlert } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { ContentConfig, OpenConfig, PollConfig, QuizConfig, RatingConfig, SurveyConfig, WordcloudConfig } from '@classinteract/shared';
import { gradeQuiz, openMaxLength, quizCorrectIds, quizKind } from '@classinteract/shared';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { BreathingGlow } from '@/components/Ambient';
import { Input, Textarea } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { ContentSlide } from '@/render/ContentSlide';
import { ResultsView } from '@/render/ResultsView';
import { ScaleBox } from '@/render/ScaleBox';
import { Leaderboard } from '@/render/viz/Leaderboard';
import { OptionTile, type TileState } from '@/render/viz/OptionTile';
import { MatchPlay, OrderPlay } from './QuizPlay';
import { ActivityShell, BigButton, ErrorLine, Received, WaitingDots, useP, useSubmit } from './common';

/** Aggregated results, when the presenter has chosen to share them with the room. */
function SharedResults({ mine }: { mine?: { optionIds?: string[]; value?: number; terms?: string[] } }) {
  const { snap, activity } = useP();
  if (!snap.results || snap.results.type === 'content') return null;
  return (
    <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl bg-surface p-4 ring-1 ring-line" aria-label="Results" data-testid="participant-results">
      <h3 className="mb-3 text-[0.8125rem] font-bold text-ink-3">Results so far</h3>
      <ScaleBox pct={3.4}>
        <div className="h-auto">
          <ResultsView type={activity.type} config={activity.config} results={snap.results} mine={mine} correctIds={snap.state.correctVisible && activity.type === 'quiz' ? quizCorrectIds(activity.config as QuizConfig) : null} />
        </div>
      </ScaleBox>
    </motion.section>
  );
}

// ------------------------------------------------------------------------------------
// Waiting / ended / leaderboard
// ------------------------------------------------------------------------------------

export function WaitingView({ kind }: { kind: 'lobby' | 'standby' }) {
  const { snap } = useP();
  return (
    <div className="grid flex-1 content-center justify-items-center gap-5 py-10 text-center" data-testid={`waiting-${kind}`}>
      <div className="relative grid size-28 place-items-center">
        <BreathingGlow className="size-24" from={0.25} to={0.6} duration={4} />
        <motion.span aria-hidden className="absolute size-20 rounded-full border-2 border-accent/50" animate={{ scale: [1, 1.5], opacity: [0.7, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }} />
        <WaitingDots />
      </div>
      <div className="grid gap-2">
        <h2 className="display text-[1.9rem]">{kind === 'lobby' ? `You’re in, ${snap.me.name}` : 'Hang tight'}</h2>
        <p className="mx-auto max-w-[19rem] text-[1.0625rem] text-ink-2">
          {kind === 'lobby' ? 'Waiting for the presenter to start. Keep this page open.' : 'The next activity is coming up. It will appear here by itself, so there is no need to rejoin.'}
        </p>
      </div>
      <p className="tabular rounded-full bg-surface px-4 py-1.5 text-sm font-semibold text-ink-2 ring-1 ring-line">{snap.counts.participants} {snap.counts.participants === 1 ? 'person' : 'people'} here</p>
    </div>
  );
}

export function EndedView() {
  const { snap } = useP();
  const standing = snap.me.standing;
  return (
    <div className="grid flex-1 content-center justify-items-center gap-5 py-10 text-center" data-testid="participant-ended">
      <motion.span initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 14 }} className="grid size-16 place-items-center rounded-3xl bg-accent-soft text-accent-ink">
        <PartyPopper className="size-8" aria-hidden />
      </motion.span>
      <h2 className="display text-[1.9rem]">That’s a wrap</h2>
      <p className="max-w-[19rem] text-[1.0625rem] text-ink-2">Thanks for taking part, {snap.me.name}. The session has ended.</p>
      {snap.me.totalScore > 0 && (
        <div className="rounded-2xl bg-surface px-6 py-4 ring-1 ring-line">
          <p className="text-sm font-semibold text-ink-3">Your final score</p>
          <p className="display tabular text-[2.2rem]"><AnimatedNumber value={snap.me.totalScore} format={(n) => n.toLocaleString()} /></p>
          {standing && <p className="text-sm font-semibold text-ink-2">Rank {standing.rank}</p>}
        </div>
      )}
      {snap.leaderboard && snap.leaderboard.length > 0 && (
        <ScaleBox pct={3.2} className="w-full text-left">
          <Leaderboard standings={snap.leaderboard} meId={snap.me.id} limit={5} />
        </ScaleBox>
      )}
    </div>
  );
}

export function LeaderboardView() {
  const { snap } = useP();
  const list = snap.leaderboard ?? [];
  const me = snap.me.standing;
  const inTop = me && list.some((s) => s.participantId === me.participantId);
  return (
    <div className="grid gap-5" data-testid="participant-leaderboard">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-full bg-[#ffe08a] text-[#5d4100]"><Trophy className="size-5" aria-hidden /></span>
        <h2 className="display text-[1.65rem]">Leaderboard</h2>
      </div>
      <ScaleBox pct={3.1}><Leaderboard standings={list} meId={snap.me.id} limit={7} /></ScaleBox>
      {me && !inTop && (
        <p className="rounded-2xl bg-accent-soft px-4 py-3 text-center font-semibold text-accent-ink">You are #{me.rank} with {me.score.toLocaleString()} points</p>
      )}
    </div>
  );
}

export function ContentView() {
  const { activity } = useP();
  return <div className="py-2" data-testid="participant-content"><ContentSlide config={activity.config as ContentConfig} compact /></div>;
}

// ------------------------------------------------------------------------------------
// Quiz
// ------------------------------------------------------------------------------------

function QuizFeedback({ correct, score, fraction }: { correct: boolean | null; score: number | null; fraction: number }) {
  const { snap, activity } = useP();
  const c = activity.config as QuizConfig;
  const scored = c.scored;
  const standing = snap.me.standing;
  const partly = correct === false && fraction > 0;
  const tone = correct ? 'bg-ok-soft text-[#0b4a30]' : partly ? 'bg-warn-soft text-[#6b4300]' : correct === false ? 'bg-bad-soft text-[#7a1428]' : 'bg-surface ring-1 ring-line';
  const badge = correct ? 'bg-ok' : partly ? 'bg-warn' : correct === false ? 'bg-bad' : 'bg-ink-3';
  return (
    <motion.div initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 280, damping: 22 }} className={cn('grid justify-items-center gap-2 rounded-3xl px-5 py-6 text-center', tone)} data-testid="quiz-feedback" role="status">
      <motion.span initial={{ scale: 0, rotate: -35 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 480, damping: 15, delay: 0.1 }} className={cn('grid size-14 place-items-center rounded-full text-white', badge)}>
        {correct ? <Check className="size-8" strokeWidth={3} aria-hidden /> : partly ? <TriangleAlert className="size-7" aria-hidden /> : <Frown className="size-8" aria-hidden />}
      </motion.span>
      <h3 className="display text-[1.6rem]">{correct ? 'Correct!' : partly ? 'Partly right' : correct === false ? 'Not this time' : 'No answer recorded'}</h3>
      {partly && <p className="text-sm font-semibold opacity-80">You got {Math.round(fraction * 100)}% of it.</p>}
      {scored && score !== null && score > 0 && (
        <p className="tabular text-lg font-bold">+<AnimatedNumber value={score} format={(n) => n.toLocaleString()} /> points</p>
      )}
      {scored && snap.me.totalScore > 0 && <p className="text-sm font-semibold opacity-80">Total {snap.me.totalScore.toLocaleString()}{standing ? ` · rank ${standing.rank}` : ''}</p>}
      {c.explanation && <p className="mt-1 max-w-sm text-[0.9375rem] leading-snug">{c.explanation}</p>}
    </motion.div>
  );
}

export function QuizView() {
  const { snap, activity, mine } = useP();
  const c = activity.config as QuizConfig;
  const { phase, correctVisible } = snap.state;
  const submit = useSubmit();
  const kind = quizKind(c);
  const multiple = kind === 'multiple';
  const arranged = kind === 'match' || kind === 'order';
  const view = c.view;
  const [picked, setPicked] = useState<string[]>([]);
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [order, setOrder] = useState<string[]>(() => view?.items.map((i) => i.id) ?? []);
  const answer = mine[0];
  const answered: string[] = answer ? (Array.isArray(answer.payload?.optionIds) ? answer.payload.optionIds : [answer.payload?.optionId]) : [];
  const chosen = answer ? answered : picked;
  const canAnswer = phase === 'open' && !answer && !submit.pending;
  const correctIds = correctVisible ? quizCorrectIds(c) : [];

  const tile = (id: string): TileState => {
    if (correctIds.length) return correctIds.includes(id) ? 'correct' : chosen.includes(id) ? 'wrong' : 'dim';
    if (chosen.includes(id)) return 'selected';
    return chosen.length && !multiple ? 'dim' : 'idle';
  };
  const pick = (id: string) => {
    if (!canAnswer) return;
    if (multiple) {
      // several answers: tapping only ticks; nothing is sent until "Lock in"
      submit.clearError();
      setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
      return;
    }
    setPicked([id]);
    void submit.run({ optionId: id }).then((ok) => { if (!ok) setPicked([]); });
  };
  const lefts = view?.lefts.length ?? 0;
  const ready = kind === 'match' ? Object.keys(matches).length === lefts : kind === 'order' ? order.length > 0 : picked.length > 0;
  const lockIn = () => void submit.run(kind === 'match' ? { matches } : kind === 'order' ? { order } : { optionIds: picked });
  const lockLabel = kind === 'multiple' ? (picked.length ? `Lock in ${picked.length} ${picked.length === 1 ? 'answer' : 'answers'}` : 'Lock in answer') : kind === 'match' && !ready ? `Match all ${lefts} to lock in` : 'Lock in answer';
  const needsButton = (multiple || arranged) && canAnswer;
  // what to show once locked: the person's own arrangement, from the server's copy
  const shownMatches: Record<string, string> = answer?.payload?.matches ?? matches;
  const shownOrder: string[] = answer?.payload?.order ?? order;

  return (
    <ActivityShell
      title={c.question}
      footer={needsButton ? <BigButton disabled={!ready || submit.pending} loading={submit.pending} onClick={lockIn} data-testid="quiz-submit">{lockLabel}</BigButton> : undefined}
    >
      {multiple && phase === 'open' && !answer && <p className="text-sm font-semibold text-ink-3" data-testid="quiz-multi-hint">Select all that apply</p>}
      {kind === 'match' && phase === 'open' && !answer && <p className="text-sm font-semibold text-ink-3" data-testid="quiz-match-hint">Match every item</p>}
      {kind === 'order' && phase === 'open' && !answer && <p className="text-sm font-semibold text-ink-3" data-testid="quiz-order-hint">Put them in order, first at the top</p>}
      {kind === 'match' && view && <MatchPlay view={view} value={shownMatches} onChange={setMatches} locked={!canAnswer} answerMap={correctVisible && answer ? view.answerMap : undefined} />}
      {kind === 'order' && view && <OrderPlay view={view} value={shownOrder} onChange={setOrder} locked={!canAnswer} answerOrder={correctVisible && answer ? view.answerOrder : undefined} />}
      {!arranged && (
        <div className="grid gap-3" role={multiple ? 'group' : undefined} aria-label={multiple ? 'Answers, select all that apply' : undefined}>
          {c.options.map((o, i) => (
            <OptionTile key={o.id} size="phone" index={i} text={o.text} state={tile(o.id)} checkbox={multiple} delay={i * 0.05} disabled={!canAnswer} onClick={phase === 'open' && !answer ? () => pick(o.id) : undefined} />
          ))}
        </div>
      )}
      <ErrorLine message={submit.error} />
      {phase === 'ready' && <p className="text-center font-semibold text-ink-3">Get ready. Answers open soon.</p>}
      {phase === 'open' && answer && <Received title="Answer locked in" hint="Waiting for everyone else…" />}
      {phase === 'closed' && (answer ? <p className="text-center font-semibold text-ink-2" data-testid="waiting-reveal">Answers are closed. Waiting for the reveal…</p> : <p className="text-center font-semibold text-ink-2">Time’s up. No answer recorded.</p>)}
      {correctVisible && <QuizFeedback correct={answer ? answer.correct : null} score={answer?.score ?? null} fraction={answer ? gradeQuiz(c, answer.payload) : 0} />}
      {!arranged && <SharedResults mine={{ optionIds: chosen }} />}
      {arranged && <SharedResults />}
    </ActivityShell>
  );
}

// ------------------------------------------------------------------------------------
// Poll
// ------------------------------------------------------------------------------------

export function PollView() {
  const { snap, activity, mine } = useP();
  const c = activity.config as PollConfig;
  const { phase } = snap.state;
  const submit = useSubmit();
  const [sel, setSel] = useState<string[]>([]);
  const answer = mine[0];
  const done = !!answer;
  const chosen: string[] = answer?.payload?.optionIds ?? sel;
  const canAnswer = phase === 'open' && !done;
  const limit = c.maxSelections ?? c.options.length;

  const toggle = (id: string) => {
    if (!canAnswer) return;
    submit.clearError();
    setSel((cur) => {
      if (!c.multiple) return [id];
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      return cur.length >= limit ? cur : [...cur, id];
    });
  };

  return (
    <ActivityShell
      title={c.question}
      footer={canAnswer ? <BigButton disabled={sel.length === 0 || submit.pending} loading={submit.pending} onClick={() => void submit.run({ optionIds: sel })}>Submit</BigButton> : undefined}
    >
      {c.multiple && canAnswer && <p className="text-sm font-semibold text-ink-3">{c.maxSelections ? `Choose up to ${c.maxSelections}` : 'Choose all that apply'}{c.anonymous ? ' · anonymous' : ''}</p>}
      {!c.multiple && c.anonymous && canAnswer && <p className="text-sm font-semibold text-ink-3">Your answer is anonymous</p>}
      <ul className="grid gap-2.5">
        {c.options.map((o, i) => {
          const on = chosen.includes(o.id);
          return (
            <li key={o.id}>
              <motion.button
                type="button"
                role={c.multiple ? 'checkbox' : 'radio'}
                aria-checked={on}
                disabled={!canAnswer}
                onClick={() => toggle(o.id)}
                whileTap={canAnswer ? { scale: 0.98 } : undefined}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: !canAnswer && !on && done ? 0.55 : 1, y: 0 }}
                transition={{ delay: i * 0.04, type: 'spring', stiffness: 300, damping: 26 }}
                className={cn('flex min-h-14 w-full items-center gap-3.5 rounded-2xl border-2 bg-surface px-4 py-3 text-left text-[1.0625rem] font-semibold transition-colors', on ? 'border-accent bg-accent-soft' : 'border-line')}
              >
                <span className={cn('grid size-6 shrink-0 place-items-center border-2 transition-colors', c.multiple ? 'rounded-md' : 'rounded-full', on ? 'border-accent bg-accent text-white' : 'border-line-2')}>
                  <AnimatePresence>{on && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}><Check className="size-4" strokeWidth={3.5} aria-hidden /></motion.span>}</AnimatePresence>
                </span>
                {o.text}
              </motion.button>
            </li>
          );
        })}
      </ul>
      <ErrorLine message={submit.error} />
      {done && <Received />}
      {phase === 'ready' && <p className="text-center font-semibold text-ink-3">Get ready. Voting opens soon.</p>}
      {phase !== 'open' && phase !== 'ready' && !done && <p className="text-center font-semibold text-ink-2">Responses are closed.</p>}
      <SharedResults mine={{ optionIds: chosen }} />
    </ActivityShell>
  );
}

// ------------------------------------------------------------------------------------
// Word cloud + open-ended (free text)
// ------------------------------------------------------------------------------------

function TextEntry({ max, limit, paragraph, placeholder, wordHint }: { max: number; limit: number; paragraph: boolean; placeholder: string; wordHint?: string }) {
  const { snap, mine } = useP();
  const submit = useSubmit();
  const [text, setText] = useState('');
  const used = mine.length;
  const left = limit - used;
  const canAnswer = snap.state.phase === 'open' && left > 0;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canAnswer || !text.trim() || submit.pending) return;
    // Clear straight away so anything typed while the server is answering is never wiped;
    // put the text back only if the submission was refused and the field is still empty.
    const sent = text;
    setText('');
    if (!(await submit.run({ text: sent }))) setText((cur) => (cur === '' ? sent : cur));
  };

  return (
    <div className="grid gap-3">
      {canAnswer && (
        <form onSubmit={onSubmit} className="grid gap-2.5">
          {paragraph ? (
            <Textarea value={text} onChange={(e) => { setText(e.target.value); submit.clearError(); }} maxLength={max + 40} placeholder={placeholder} rows={5} aria-label="Your response" className="min-h-32 rounded-2xl text-[1.0625rem]" data-testid="text-input" />
          ) : (
            <Input value={text} onChange={(e) => { setText(e.target.value); submit.clearError(); }} placeholder={placeholder} aria-label="Your response" autoComplete="off" autoCapitalize="none" enterKeyHint="send" className="h-14 rounded-2xl text-[1.0625rem]" data-testid="text-input" />
          )}
          <div className="flex items-center justify-between text-sm font-medium text-ink-3">
            <span>{wordHint}</span>
            <span className={cn('tabular', text.trim().length > max && 'font-bold text-bad')}>{text.trim().length}/{max}</span>
          </div>
          <BigButton type="submit" disabled={!text.trim() || text.trim().length > max || submit.pending} loading={submit.pending} data-testid="text-submit">
            {limit > 1 ? `Send (${left} left)` : 'Submit'}
          </BigButton>
        </form>
      )}
      <ErrorLine message={submit.error} />
      {mine.length > 0 && (
        <ul className="grid gap-2" aria-label="Your responses">
          <AnimatePresence initial={false}>
            {mine.map((s) => (
              <motion.li key={s.id} layout initial={{ opacity: 0, scale: 0.9, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 360, damping: 24 }} className="flex items-start gap-2.5 rounded-2xl bg-surface px-4 py-3 ring-1 ring-line" data-testid="my-response">
                <Check className="mt-0.5 size-5 shrink-0 text-ok" strokeWidth={3} aria-hidden />
                <span className="min-w-0 flex-1 whitespace-pre-wrap break-words font-semibold">{s.payload.text}</span>
                {s.status === 'pending' && <span className="shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-xs font-bold text-warn">Awaiting approval</span>}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      {left === 0 && snap.state.phase === 'open' && <Received title={limit > 1 ? 'All responses sent' : 'Response received'} hint="You can watch the results on the big screen." />}
    </div>
  );
}

export function WordcloudView() {
  const { snap, activity, mine } = useP();
  const c = activity.config as WordcloudConfig;
  const phase = snap.state.phase;
  return (
    <ActivityShell title={c.question}>
      {phase === 'ready' && <p className="text-center font-semibold text-ink-3">Get ready. Answers open soon.</p>}
      {(phase === 'open' || mine.length > 0) && (
        <TextEntry max={c.maxLength} limit={c.maxSubmissions} paragraph={false} placeholder="Type a word or a few words…" wordHint={c.maxWords === 1 ? 'One word' : `Up to ${c.maxWords} words`} />
      )}
      {phase !== 'open' && phase !== 'ready' && mine.length === 0 && <p className="text-center font-semibold text-ink-2">Responses are closed.</p>}
      <SharedResults mine={{ terms: mine.map((m) => String(m.payload.text).toLowerCase()) }} />
    </ActivityShell>
  );
}

export function OpenView() {
  const { snap, activity } = useP();
  const c = activity.config as OpenConfig;
  const phase = snap.state.phase;
  const { mine } = useP();
  return (
    <ActivityShell title={c.question}>
      {phase === 'ready' && <p className="text-center font-semibold text-ink-3">Get ready. Answers open soon.</p>}
      {(phase === 'open' || mine.length > 0) && (
        <TextEntry max={openMaxLength(c)} limit={c.maxSubmissions} paragraph={c.mode === 'paragraph'} placeholder={c.mode === 'paragraph' ? 'Write your answer…' : 'Type your answer…'} />
      )}
      {phase !== 'open' && phase !== 'ready' && mine.length === 0 && <p className="text-center font-semibold text-ink-2">Responses are closed.</p>}
      <SharedResults />
    </ActivityShell>
  );
}

// ------------------------------------------------------------------------------------
// Rating
// ------------------------------------------------------------------------------------

export function RatingView() {
  const { snap, activity, mine } = useP();
  const c = activity.config as RatingConfig;
  const submit = useSubmit();
  const [value, setValue] = useState<number | null>(null);
  const answer = mine[0];
  const chosen: number | null = answer?.payload?.value ?? value;
  const canAnswer = snap.state.phase === 'open' && !answer;
  const values = Array.from({ length: c.max - c.min + 1 }, (_, i) => c.min + i);

  return (
    <ActivityShell
      title={c.question}
      footer={canAnswer ? <BigButton disabled={value === null || submit.pending} loading={submit.pending} onClick={() => value !== null && void submit.run({ value })}>Submit</BigButton> : undefined}
    >
      <div>
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(values.length, values.length > 6 ? 6 : values.length)}, minmax(0, 1fr))` }} role="radiogroup" aria-label="Rating">
          {values.map((v, i) => (
            <motion.button
              key={v}
              type="button"
              role="radio"
              aria-checked={chosen === v}
              disabled={!canAnswer}
              onClick={() => { setValue(v); submit.clearError(); }}
              whileTap={canAnswer ? { scale: 0.92 } : undefined}
              animate={{ scale: chosen === v ? 1.06 : 1 }}
              initial={{ opacity: 0, y: 10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 22, delay: i * 0.03 }}
              className={cn('tabular aspect-square min-h-14 rounded-2xl border-2 text-xl font-extrabold transition-colors', chosen === v ? 'border-tone-strong bg-tone-strong text-white' : 'border-line bg-surface')}
            >
              {v}
            </motion.button>
          ))}
        </div>
        {(c.minLabel || c.maxLabel) && (
          <div className="mt-2.5 flex justify-between text-sm font-semibold text-ink-2">
            <span>{c.minLabel}</span>
            <span>{c.maxLabel}</span>
          </div>
        )}
      </div>
      <ErrorLine message={submit.error} />
      {answer && <Received />}
      {snap.state.phase === 'ready' && <p className="text-center font-semibold text-ink-3">Get ready. Answers open soon.</p>}
      {snap.state.phase !== 'open' && snap.state.phase !== 'ready' && !answer && <p className="text-center font-semibold text-ink-2">Responses are closed.</p>}
      <SharedResults mine={{ value: chosen ?? undefined }} />
    </ActivityShell>
  );
}

// ------------------------------------------------------------------------------------
// Survey
// ------------------------------------------------------------------------------------

type Answers = Record<string, any>;

export function SurveyView() {
  const { snap, activity, mine } = useP();
  const c = activity.config as SurveyConfig;
  const submit = useSubmit();
  const [answers, setAnswers] = useState<Answers>({});
  const done = mine[0];
  const canAnswer = snap.state.phase === 'open' && !done;
  const view: Answers = done ? done.payload.answers : answers;

  const set = (id: string, v: unknown) => { submit.clearError(); setAnswers((a) => ({ ...a, [id]: v })); };
  const isAnswered = (id: string) => {
    const a = view[id];
    return !!a && (a.value !== undefined || (Array.isArray(a.optionIds) && a.optionIds.length > 0) || (typeof a.text === 'string' && a.text.trim().length > 0));
  };
  const requiredLeft = c.questions.filter((q) => q.required && !isAnswered(q.id)).length;
  const answered = c.questions.filter((q) => isAnswered(q.id)).length;

  const send = () => {
    const payload: Answers = {};
    for (const q of c.questions) if (isAnswered(q.id)) payload[q.id] = answers[q.id];
    void submit.run({ answers: payload });
  };

  return (
    <ActivityShell
      title={c.title}
      footer={canAnswer ? (
        <div className="grid gap-2">
          <p className="text-center text-sm font-semibold text-ink-3" aria-live="polite">{requiredLeft > 0 ? `${requiredLeft} required ${requiredLeft === 1 ? 'question' : 'questions'} left` : `${answered} of ${c.questions.length} answered`}</p>
          <BigButton disabled={requiredLeft > 0 || answered === 0 || submit.pending} loading={submit.pending} onClick={send} data-testid="survey-submit">Submit survey</BigButton>
        </div>
      ) : undefined}
    >
      {c.description && <p className="-mt-2 text-[1.0625rem] text-ink-2">{c.description}</p>}
      <ol className="grid gap-4">
        {c.questions.map((q, qi) => {
          const a = view[q.id];
          return (
            <motion.li key={q.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: qi * 0.05, type: 'spring', stiffness: 280, damping: 26 }} className="grid gap-3 rounded-3xl bg-surface p-4 ring-1 ring-line">
              <h3 className="text-[1.0625rem] font-bold leading-snug">{q.question}{q.required && <span className="text-bad" aria-label="required"> *</span>}</h3>
              {q.kind === 'choice' && (
                <div className="grid gap-2" role={q.multiple ? 'group' : 'radiogroup'}>
                  {q.options.map((o) => {
                    const on = (a?.optionIds ?? []).includes(o.id);
                    return (
                      <button key={o.id} type="button" role={q.multiple ? 'checkbox' : 'radio'} aria-checked={on} disabled={!canAnswer}
                        onClick={() => {
                          const cur: string[] = a?.optionIds ?? [];
                          const limit = q.maxSelections ?? q.options.length;
                          set(q.id, { optionIds: !q.multiple ? [o.id] : cur.includes(o.id) ? cur.filter((x) => x !== o.id) : cur.length >= limit ? cur : [...cur, o.id] });
                        }}
                        className={cn('flex min-h-12 items-center gap-3 rounded-xl border-2 px-3.5 py-2 text-left font-semibold transition-colors', on ? 'border-accent bg-accent-soft' : 'border-line')}>
                        <span className={cn('grid size-5 shrink-0 place-items-center border-2', q.multiple ? 'rounded-md' : 'rounded-full', on ? 'border-accent bg-accent text-white' : 'border-line-2')}>{on && <Check className="size-3.5" strokeWidth={3.5} aria-hidden />}</span>
                        {o.text}
                      </button>
                    );
                  })}
                </div>
              )}
              {q.kind === 'rating' && (
                <div>
                  <div className="flex gap-1.5" role="radiogroup">
                    {Array.from({ length: q.max - q.min + 1 }, (_, i) => q.min + i).map((v) => (
                      <button key={v} type="button" role="radio" aria-checked={a?.value === v} disabled={!canAnswer} onClick={() => set(q.id, { value: v })}
                        className={cn('tabular h-12 min-w-0 flex-1 rounded-xl border-2 text-lg font-extrabold transition-colors', a?.value === v ? 'border-tone-strong bg-tone-strong text-white' : 'border-line')}>{v}</button>
                    ))}
                  </div>
                  {(q.minLabel || q.maxLabel) && <div className="mt-1.5 flex justify-between text-xs font-semibold text-ink-3"><span>{q.minLabel}</span><span>{q.maxLabel}</span></div>}
                </div>
              )}
              {q.kind === 'text' && (
                q.mode === 'paragraph'
                  ? <Textarea disabled={!canAnswer} value={a?.text ?? ''} maxLength={openMaxLength(q) + 20} onChange={(e) => set(q.id, { text: e.target.value })} rows={3} aria-label={q.question} className="rounded-xl" />
                  : <Input disabled={!canAnswer} value={a?.text ?? ''} maxLength={openMaxLength(q) + 20} onChange={(e) => set(q.id, { text: e.target.value })} aria-label={q.question} className="h-12 rounded-xl" />
              )}
            </motion.li>
          );
        })}
      </ol>
      <ErrorLine message={submit.error} />
      {done && <Received title="Survey submitted" hint="Thank you for your feedback." />}
      {snap.state.phase === 'ready' && <p className="text-center font-semibold text-ink-3">Get ready. The survey opens soon.</p>}
      {snap.state.phase !== 'open' && snap.state.phase !== 'ready' && !done && <p className="text-center font-semibold text-ink-2">The survey is closed.</p>}
      <SharedResults />
    </ActivityShell>
  );
}
