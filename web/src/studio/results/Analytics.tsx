import { ArrowDownRight, ArrowUpRight, Gauge, Lightbulb, Loader2, MessageCircleQuestion, Minus, Sparkles, Target, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import type { ConfidenceStat, Difficulty, QuestionStat, RunComparison, SessionAnalytics, SessionRecap } from '@classinteract/shared';
import { typeMeta } from '@/activities/meta';
import { RichText } from '@/components/RichText';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { plural } from '@/lib/format';

const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v * 100)}%`);
const secs = (ms: number | null) => (ms === null ? '–' : `${(ms / 1000).toFixed(1)} s`);

const DIFFICULTY: Record<Difficulty, { label: string; variant: 'ok' | 'warn' | 'bad'; icon: typeof Target }> = {
  easy: { label: 'Easy', variant: 'ok', icon: Target },
  moderate: { label: 'Moderate', variant: 'warn', icon: Gauge },
  hard: { label: 'Hard', variant: 'bad', icon: TriangleAlert },
};

function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-3 rounded-card border border-line bg-surface p-5" data-testid={`analytics-${id}`}>
      <div className="grid gap-0.5"><h2 id={id} className="text-lg">{title}</h2>{hint && <p className="text-sm text-ink-3">{hint}</p>}</div>
      {children}
    </section>
  );
}

/** Measured statements only. The optional AI suggestions sit apart, labelled, and only see these aggregates. */
export function RecapCard({ recap, sessionId, aiEnabled, rehearsal }: { recap: SessionRecap; sessionId: string; aiEnabled: boolean; rehearsal: boolean }) {
  const [ai, setAi] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groups: [string, typeof recap.participation][] = [
    ['Participation', recap.participation], ['Difficult questions', recap.difficult], ['Common misconceptions', recap.misconceptions],
    ['Strongly supported observations', recap.observations], ['Shifts in understanding', recap.shifts], ['Unanswered audience questions', recap.unanswered],
  ];
  return (
    <Section id="recap" title="Session recap" hint={rehearsal ? 'This was a rehearsal with simulated participants: these numbers are not real results.' : 'Every statement below is computed from the responses. Slide numbers point to the evidence.'}>
      <div className="grid gap-4 md:grid-cols-2">
        {groups.filter(([, items]) => items.length).map(([title, items]) => (
          <div key={title} className="grid content-start gap-1.5">
            <h3 className="text-sm font-bold">{title}</h3>
            <ul className="grid gap-1 text-sm text-ink-2">{items.map((i, k) => <li key={k} className="flex gap-2"><span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-3" /><span>{i.text}{i.slide ? <span className="text-ink-3"> (slide {i.slide})</span> : null}</span></li>)}</ul>
          </div>
        ))}
      </div>
      <div className="grid gap-1.5 rounded-xl bg-accent-soft p-3.5" data-testid="recap-followups">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-accent-ink"><Lightbulb className="size-4" aria-hidden /> Suggested follow-ups</h3>
        <ul className="grid gap-1 text-sm">{recap.followUps.map((i, k) => <li key={k}>{i.text}</li>)}</ul>
        <p className="text-xs text-ink-3">Rule-based suggestions from the measured results above.</p>
      </div>
      {aiEnabled && (
        <div className="grid gap-2 rounded-xl border border-dashed border-line-2 p-3.5" data-testid="recap-ai">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-bold"><Sparkles className="size-4" aria-hidden /> AI suggestions <Badge>generated, check before use</Badge></h3>
            <Button size="sm" variant="secondary" disabled={busy} onClick={async () => { setBusy(true); setError(null); try { setAi((await api.ai.recap(sessionId)).text); } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); } }} data-testid="recap-ai-run">{busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />} {ai ? 'Ask again' : 'Ask the AI'}</Button>
          </div>
          <p className="text-xs text-ink-3">Only the aggregated numbers above are sent, never names or individual answers. The AI does not see anything that is not in them, so treat its ideas as suggestions.</p>
          {error && <p role="alert" className="text-sm font-semibold text-bad">{error}</p>}
          {ai && <RichText text={ai} className="text-sm text-ink-2" />}
        </div>
      )}
    </Section>
  );
}

function QuestionsTable({ questions }: { questions: QuestionStat[] }) {
  return (
    <Section id="questions" title="Question by question" hint="Correct: fully right. Not answered: share of the people present who did not respond. Times are from opening to answering.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left text-sm" data-testid="question-table">
          <thead className="text-xs text-ink-3"><tr><th className="py-2 pr-2 font-semibold">Slide</th><th className="font-semibold">Activity</th><th className="font-semibold">Answers</th><th className="font-semibold">Not answered</th><th className="font-semibold">Correct</th><th className="font-semibold">Partly</th><th className="font-semibold">Median time</th><th className="font-semibold">Difficulty</th></tr></thead>
          <tbody>
            {questions.map((q) => {
              const m = typeMeta[q.type];
              const d = q.difficulty ? DIFFICULTY[q.difficulty] : null;
              return (
                <tr key={q.activityId} className="border-t border-line align-top">
                  <td className="tabular py-2 pr-2 text-ink-3">{q.index + 1}</td>
                  <td className="max-w-[18rem] py-2 pr-2"><span className="line-clamp-2 font-semibold">{q.title}</span><span className="flex flex-wrap gap-1 text-xs text-ink-3"><span>{m.label}</span>{q.runCount > 1 && <span>· round {q.runNumber} of {q.runCount}</span>}{q.concepts.map((c) => <Badge key={c} className="px-1.5 py-0">{c}</Badge>)}</span></td>
                  <td className="tabular">{q.respondents}/{q.eligible}</td>
                  <td className="tabular">{pct(q.nonresponseRate)}</td>
                  <td className="tabular font-semibold">{pct(q.correctRate)}</td>
                  <td className="tabular">{q.partialRate ? pct(q.partialRate) : '–'}</td>
                  <td className="tabular">{secs(q.medianMs)}</td>
                  <td>{d ? <Badge variant={d.variant}><d.icon className="size-3" aria-hidden /> {d.label}</Badge> : <span className="text-xs text-ink-3">{q.correctRate !== null && q.lowSample ? 'Too few answers' : ''}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function ScoreHistogram({ scores }: { scores: NonNullable<SessionAnalytics['scores']> }) {
  const max = Math.max(1, ...scores.bins.map((b) => b.count));
  return (
    <Section id="scores" title="Points per person" hint={`Mean ${scores.mean.toLocaleString()}, median ${scores.median.toLocaleString()}, highest ${scores.max.toLocaleString()}.`}>
      <div className="flex h-40 items-end gap-1" role="img" aria-label={`Distribution of total points: ${scores.bins.map((b) => `${b.from}–${b.to}: ${b.count}`).join(', ')}`}>
        {scores.bins.map((b) => (
          <div key={b.from} className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${b.from.toLocaleString()}–${b.to.toLocaleString()} points: ${plural(b.count, 'person', 'people')}`}>
            <span className="tabular text-xs font-semibold text-ink-2">{b.count || ''}</span>
            <span className="w-full rounded-t bg-accent" style={{ height: `${Math.max(b.count ? 4 : 0, (b.count / max) * 85)}%` }} />
            <span className="tabular truncate text-[0.6875rem] text-ink-3">{b.from >= 1000 ? `${Math.round(b.from / 100) / 10}k` : b.from}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Concepts({ analytics }: { analytics: SessionAnalytics }) {
  if (!analytics.concepts.length && !analytics.misconceptions.length) return null;
  return (
    <Section id="concepts" title="Concepts and misconceptions" hint="From the optional concept tags and misconception notes on your quiz questions.">
      {analytics.concepts.length > 0 && (
        <ul className="grid gap-2" data-testid="concept-list">
          {analytics.concepts.map((c) => (
            <li key={c.concept} className="grid gap-1 text-sm">
              <span className="flex justify-between gap-2"><span className="font-semibold">{c.concept}</span><span className="tabular text-ink-2">{pct(c.correctRate)} correct · {plural(c.questions, 'question')}</span></span>
              <span className="h-2 overflow-hidden rounded-full bg-ink/8"><span className={cn('block h-full rounded-full', c.correctRate < 0.5 ? 'bg-bad' : c.correctRate < 0.8 ? 'bg-warn' : 'bg-ok')} style={{ width: `${Math.max(2, c.correctRate * 100)}%` }} /></span>
            </li>
          ))}
        </ul>
      )}
      {analytics.misconceptions.length > 0 && (
        <ul className="grid gap-1.5 text-sm" data-testid="misconception-list">
          {analytics.misconceptions.slice(0, 8).map((m, i) => (
            <li key={i} className="rounded-xl bg-warn-soft px-3 py-2 text-warn-ink"><b>{pct(m.share)}</b> chose “{m.optionText}” in “{m.activityTitle}”: {m.misconception}</li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Comparison({ c }: { c: RunComparison }) {
  const max = Math.max(1, ...c.distribution.flatMap((d) => [d.before, d.after]));
  const Trend = c.delta === null ? Minus : c.delta > 0 ? ArrowUpRight : c.delta < 0 ? ArrowDownRight : Minus;
  return (
    <article className="grid gap-3 rounded-xl border border-line p-4" data-testid="comparison">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-[0.9375rem] font-bold">{c.title} <span className="font-medium text-ink-3">(slide {c.index + 1})</span></h3>
        {c.delta !== null && <Badge variant={c.delta > 0 ? 'ok' : c.delta < 0 ? 'bad' : 'neutral'}><Trend className="size-3" aria-hidden /> {pct(c.beforeRate)} → {pct(c.afterRate)} correct</Badge>}
        {c.ratingAverages && c.ratingAverages.before !== null && c.ratingAverages.after !== null && <Badge variant="accent">Average {c.ratingAverages.before.toFixed(1)} → {c.ratingAverages.after.toFixed(1)}</Badge>}
      </div>
      <div className="flex gap-4 text-xs font-semibold text-ink-2" aria-hidden><span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-ink-3" /> Round {c.before} ({c.beforeRespondents})</span><span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-accent" /> Round {c.after} ({c.afterRespondents})</span></div>
      <ul className="grid gap-2" aria-label={`Answers in round ${c.before} and round ${c.after}`}>
        {c.distribution.map((d) => (
          <li key={d.label} className="grid gap-0.5 text-sm">
            <span className="font-semibold">{d.label}{d.correct ? <span className="ml-1 text-ok-ink" aria-label="correct answer"> ✓</span> : null}</span>
            <span className="flex items-center gap-2"><span className="h-2 rounded-sm bg-ink-3" style={{ width: `${(d.before / max) * 70}%` }} /><span className="tabular text-xs text-ink-2">{d.before}</span></span>
            <span className="flex items-center gap-2"><span className="h-2 rounded-sm bg-accent" style={{ width: `${(d.after / max) * 70}%` }} /><span className="tabular text-xs text-ink-2">{d.after}</span></span>
          </li>
        ))}
      </ul>
      {c.transitions && (
        <p className="text-sm text-ink-2" data-testid="transitions">People who answered both rounds: <b>{c.transitions.improved}</b> went from wrong to right, <b>{c.transitions.slipped}</b> from right to wrong, {c.transitions.stayedRight} stayed right, {c.transitions.stayedWrong} stayed wrong.</p>
      )}
    </article>
  );
}

function ConfidenceMatrix({ c }: { c: ConfidenceStat }) {
  const q = c.quadrants;
  const counted = q.confidentCorrect + q.confidentWrong + q.unsureCorrect + q.unsureWrong;
  const cell = (n: number, label: string, tone: string, testId: string) => (
    <div className={cn('grid gap-0.5 rounded-xl p-3', tone)} data-testid={testId}><span className="display tabular text-2xl">{n}</span><span className="text-xs font-semibold">{label}{counted ? ` · ${Math.round((n / counted) * 100)}%` : ''}</span></div>
  );
  return (
    <article className="grid gap-3" data-testid="confidence">
      <p className="text-sm text-ink-2">“{c.title}” compared, person by person, with {c.linkedTitles.map((t) => `“${t}”`).join(', ')}. {plural(c.pairs, 'person', 'people')} answered both{c.neutral ? `; ${c.neutral} chose the middle of the scale and are not counted below` : ''}.</p>
      <div className="grid grid-cols-[auto_1fr_1fr] items-stretch gap-2 text-sm">
        <span />
        <span className="text-center text-xs font-bold text-ink-3">Correct</span>
        <span className="text-center text-xs font-bold text-ink-3">Not correct</span>
        <span className="self-center text-xs font-bold text-ink-3">Confident</span>
        {cell(q.confidentCorrect, 'Confident and right', 'bg-ok-soft text-ok-ink', 'q-cc')}
        {cell(q.confidentWrong, 'Confident but wrong: check these', 'bg-bad-soft text-bad-ink', 'q-cw')}
        <span className="self-center text-xs font-bold text-ink-3">Unsure</span>
        {cell(q.unsureCorrect, 'Right but unsure', 'bg-info-soft text-info-ink', 'q-uc')}
        {cell(q.unsureWrong, 'Unsure and wrong', 'bg-warn-soft text-warn-ink', 'q-uw')}
      </div>
    </article>
  );
}

export function AnalyticsView({ analytics, recap, sessionId, aiEnabled, rehearsal }: { analytics: SessionAnalytics; recap: SessionRecap; sessionId: string; aiEnabled: boolean; rehearsal: boolean }) {
  return (
    <div className="grid gap-6" data-testid="analytics">
      <RecapCard recap={recap} sessionId={sessionId} aiEnabled={aiEnabled} rehearsal={rehearsal} />
      {analytics.questions.length > 0 && <QuestionsTable questions={analytics.questions} />}
      {analytics.comparisons.length > 0 && (
        <Section id="before-after" title="Before and after" hint="Activities you ran more than once: the first round against the latest.">
          <div className="grid gap-3 lg:grid-cols-2">{analytics.comparisons.map((c) => <Comparison key={c.activityId} c={c} />)}</div>
        </Section>
      )}
      {analytics.confidence.length > 0 && (
        <Section id="confidence" title="Confidence and correctness" hint="Only people who answered both the confidence rating and the linked questions in this session are counted.">
          {analytics.confidence.map((c) => <ConfidenceMatrix key={c.activityId} c={c} />)}
        </Section>
      )}
      <Concepts analytics={analytics} />
      {analytics.scores && <ScoreHistogram scores={analytics.scores} />}
      {analytics.unansweredQuestions.length > 0 && (
        <Section id="audience" title="Audience questions still open" hint="Approved questions you have not marked answered, most votes first.">
          <ul className="grid gap-1.5 text-sm">{analytics.unansweredQuestions.map((q) => <li key={q.id} className="flex items-start gap-2 rounded-xl bg-ink/5 px-3 py-2"><MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden /><span className="flex-1">{q.text}</span><span className="tabular shrink-0 text-xs font-semibold text-ink-3">{plural(q.votes, 'vote')}</span></li>)}</ul>
        </Section>
      )}
    </div>
  );
}
