import { motion } from 'framer-motion';
import { ArrowLeft, Download, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { SessionAnalytics, SessionRecap } from '@classinteract/shared';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useClientConfig } from '@/lib/joinUrl';
import { AnalyticsView } from './results/Analytics';
import { FlaskConical } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { quizCorrectIds } from '@classinteract/shared';
import type { ActivityResultsView, QuizConfig, SessionResultsView, SurveyConfig, TextTally } from '@classinteract/shared';
import { typeMeta } from '@/activities/meta';
import { Notice, Spinner } from '@/components/Status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { formatDateTime, plural } from '@/lib/format';
import { ResultsView } from '@/render/ResultsView';
import { ScaleBox } from '@/render/ScaleBox';
import { Leaderboard } from '@/render/viz/Leaderboard';
import { TeamBoard } from '@/render/viz/TeamBoard';
import { cn } from '@/lib/cn';
import { StudioHeader } from './StudioRoutes';

function SurveyText({ a }: { a: ActivityResultsView }) {
  if (a.results.type !== 'survey') return null;
  const c = a.config as SurveyConfig;
  const blocks = c.questions.flatMap((q) => {
    const r = (a.results as Extract<typeof a.results, { type: 'survey' }>).questions[q.id];
    return q.kind === 'text' && r?.kind === 'text' && (r as TextTally).items.length ? [{ q, items: (r as TextTally).items }] : [];
  });
  if (!blocks.length) return null;
  return (
    <div className="mt-4 grid gap-4 border-t border-line pt-4">
      {blocks.map(({ q, items }) => (
        <div key={q.id}>
          <h4 className="mb-2 text-sm font-bold">{q.question} <span className="font-medium text-ink-3">({plural(items.length, 'answer')})</span></h4>
          <ul className="grid gap-1.5">{items.map((i) => <li key={i.id} className="rounded-xl bg-paper px-3 py-2 text-sm">{i.text}</li>)}</ul>
        </div>
      ))}
    </div>
  );
}

function ActivityCard({ a, i }: { a: ActivityResultsView; i: number }) {
  const m = typeMeta[a.type];
  const [runIdx, setRunIdx] = useState(a.runs.length - 1);
  const run = a.runs[runIdx] ?? null;
  const results = run?.results ?? a.results;
  const responses = run ? run.respondents : a.respondents;
  const quiz = a.type === 'quiz' ? (a.config as QuizConfig) : null;
  const interactive = a.type !== 'content';
  return (
    <motion.article initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ type: 'spring', stiffness: 260, damping: 28, delay: Math.min(i, 4) * 0.03 }} data-tone={a.type} className="rounded-card border border-line bg-surface p-5" data-testid="result-card">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-tone text-tone-ink"><m.icon className="size-5" aria-label={m.label} /></span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-ink-3">Slide {a.index + 1}</p>
            <h3 className="text-[1.0625rem] font-bold leading-snug">{a.title}</h3>
          </div>
        </div>
        {interactive && <div className="flex flex-wrap gap-1.5">{a.runs.length > 1 ? (
          <div className="flex rounded-lg bg-ink/6 p-0.5" role="radiogroup" aria-label="Round">
            {a.runs.map((r, k) => <button key={r.id} type="button" role="radio" aria-checked={k === runIdx} onClick={() => setRunIdx(k)} className={cn('rounded-md px-2.5 py-1 text-xs font-semibold', k === runIdx ? 'bg-surface shadow-sm' : 'text-ink-2')} data-testid="result-run">Round {r.number}</button>)}
          </div>
        ) : <Badge variant="tone">{plural(a.responses, 'response')}</Badge>}<Badge>{plural(responses, 'person', 'people')}</Badge></div>}
      </header>
      {!interactive ? <p className="text-sm text-ink-3">Content slide, nothing to collect.</p> : responses === 0 ? <p className="rounded-xl bg-paper px-4 py-6 text-center text-sm text-ink-3">{a.runs.length > 1 ? 'Nobody answered in this round.' : 'This activity did not receive any responses.'}</p> : (
        <ScaleBox pct={a.type === 'survey' ? 1.5 : 2.1}>
          <div className={a.type === 'wordcloud' ? 'h-[20em]' : ''}>
            <ResultsView type={a.type} config={a.config} results={results} correctIds={quiz ? quizCorrectIds(quiz) : null} fill={a.type === 'wordcloud'} />
          </div>
        </ScaleBox>
      )}
      <SurveyText a={a} />
    </motion.article>
  );
}

export default function ResultsPage() {
  const { id = '' } = useParams();
  const [data, setData] = useState<SessionResultsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<{ analytics: SessionAnalytics; recap: SessionRecap; rehearsal: boolean } | null>(null);
  const cfg = useClientConfig();
  useEffect(() => {
    api.sessions.results(id).then(setData).catch((e) => setError(e instanceof Error ? e.message : 'Could not load results.'));
    api.sessions.analytics(id).then(setInsights).catch(() => undefined);
  }, [id]);

  if (error) return <div className="grid min-h-dvh place-items-center"><Notice title="Could not load these results" action={<Button asChild variant="primary"><Link to="/studio">Back to presentations</Link></Button>}>{error}</Notice></div>;
  if (!data) return <div className="grid min-h-dvh place-items-center"><Spinner className="size-7" /></div>;

  const { session } = data;
  const ran = data.activities.filter((a) => a.type !== 'content');
  return (
    <div data-palette={data.theme.palette} className="min-h-dvh bg-paper">
      <StudioHeader />
      <main className="mx-auto grid max-w-5xl gap-8 px-4 py-8 sm:px-6">
        <div className="grid gap-4">
          <Button asChild variant="ghost" size="sm" className="w-fit"><Link to="/studio"><ArrowLeft className="size-4" aria-hidden /> Presentations</Link></Button>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="grid gap-1.5">
              <h1 className="display text-[2.2rem]" data-testid="results-title">{session.title}</h1>
              {session.rehearsal && <Badge variant="warn" className="w-fit"><FlaskConical className="size-3" aria-hidden /> Rehearsal with simulated participants</Badge>}
              <p className="text-ink-2">{formatDateTime(session.createdAt)} · {session.mode === 'companion' ? 'Companion' : 'Standalone'} · {session.status === 'live' ? 'Still live' : 'Ended'}</p>
            </div>
            <div className="flex gap-2">
              {session.status === 'live' && <Button asChild variant="secondary"><Link to={`/session/${id}`}>Open controls</Link></Button>}
              <Button variant="primary" onClick={() => void api.sessions.exportCsv(id).catch((e) => toast.error(e.message))} data-testid="export-csv"><Download className="size-4" aria-hidden /> Export CSV</Button>
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-3">
            {[['Participants', data.participants], ['Responses', session.responseCount], ['Activities run', ran.filter((a) => a.responses > 0).length]].map(([k, v]) => (
              <div key={k as string} className="rounded-2xl border border-line bg-surface px-4 py-3"><dt className="text-xs font-semibold text-ink-3">{k}</dt><dd className="display tabular text-[1.8rem]" data-testid={`stat-${String(k).toLowerCase().replace(/\s+/g, '-')}`}>{v}</dd></div>
            ))}
          </dl>
        </div>

        <Tabs defaultValue="activities" className="grid gap-5">
          <TabsList className="w-fit" aria-label="Results views">
            <TabsTrigger value="activities" data-testid="tab-activities">Responses</TabsTrigger>
            <TabsTrigger value="insights" data-testid="tab-insights">Insights and recap</TabsTrigger>
            {data.questions.length > 0 && <TabsTrigger value="questions" data-testid="tab-audience-questions">Audience questions</TabsTrigger>}
          </TabsList>
          <TabsContent value="insights" className="grid gap-6 outline-none">
            {insights ? <AnalyticsView analytics={insights.analytics} recap={insights.recap} sessionId={id} aiEnabled={!!cfg?.aiEnabled} rehearsal={insights.rehearsal} /> : <Spinner />}
            {data.standings.length > 0 && (
              <section aria-label="Final standings" className="rounded-card border border-line bg-surface p-5">
                <h2 className="mb-4 flex items-center gap-2 text-xl"><Trophy className="size-5 text-warn" aria-hidden /> Final standings</h2>
                <div className={cn('grid gap-6', data.teamStandings.length > 0 && 'lg:grid-cols-2')}>
                  <ScaleBox pct={1.7}><Leaderboard standings={data.standings} limit={10} /></ScaleBox>
                  {data.teamStandings.length > 0 && <ScaleBox pct={1.7}><TeamBoard teams={data.teamStandings} /></ScaleBox>}
                </div>
              </section>
            )}
          </TabsContent>
          <TabsContent value="activities" className="outline-none">
            <section aria-label="Activity results" className="grid gap-4">
              {data.activities.length === 0 ? <p className="text-ink-3">This session had no slides.</p> : data.activities.map((a, i) => <ActivityCard key={a.key} a={a} i={i} />)}
            </section>
          </TabsContent>
          <TabsContent value="questions" className="outline-none">
            <ul className="grid gap-2" data-testid="results-questions">
              {data.questions.map((q) => (
                <li key={q.id} className="flex items-start gap-3 rounded-xl border border-line bg-surface p-3 text-sm">
                  <span className="tabular grid min-w-10 justify-items-center rounded-lg bg-ink/5 px-1.5 py-1 text-xs font-bold">{q.votes}</span>
                  <span className="min-w-0 flex-1"><span className="font-semibold">{q.text}</span><span className="block text-xs text-ink-3">{q.authorName ?? 'Anonymous'} · {q.answered ? 'answered' : 'not answered'}{q.status !== 'visible' ? ` · ${q.status}` : ''}</span></span>
                </li>
              ))}
            </ul>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
