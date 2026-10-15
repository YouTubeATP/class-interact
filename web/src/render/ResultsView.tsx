import type { ChoiceTally, QuizConfig, PollConfig, RatingConfig, RatingTally, Results, SlideType, SurveyConfig, TextTally, AnyConfig } from '@classinteract/shared';
import { cn } from '@/lib/cn';
import { BarList } from './viz/BarList';
import { OpenCards } from './viz/OpenCards';
import { RatingChart } from './viz/RatingChart';
import { WordCloud } from './viz/WordCloud';
import { Users } from 'lucide-react';

/** Renders aggregated results for any activity type. Sized in `em`; wrap in <ScaleBox>. */
export function ResultsView({ type, config, results, mine, correctIds, fill }: { type: SlideType; config: AnyConfig; results: Results; mine?: { optionIds?: string[]; value?: number; terms?: string[] }; correctIds?: string[] | null; fill?: boolean }) {
  if (results.type === 'content') return null;
  switch (results.type) {
    case 'quiz': {
      const c = config as QuizConfig;
      return <BarList total={results.total} items={c.options.map((o) => ({ id: o.id, label: o.text + (correctIds?.includes(o.id) ? '  ✓' : ''), count: results.counts[o.id] ?? 0 }))} mine={mine?.optionIds} />;
    }
    case 'poll': {
      const c = config as PollConfig;
      return <BarList total={results.total} items={c.options.map((o) => ({ id: o.id, label: o.text, count: results.counts[o.id] ?? 0 }))} mine={mine?.optionIds} />;
    }
    case 'wordcloud':
      return results.terms.length ? <div className={cn(fill ? 'size-full' : 'h-[26em]')}><WordCloud terms={results.terms} mine={mine?.terms} /></div> : <EmptyResults />;
    case 'open':
      return results.items.length ? <OpenCards items={results.items} /> : <EmptyResults />;
    case 'rating': {
      const c = config as RatingConfig;
      return <RatingChart distribution={results.distribution} average={results.average} total={results.total} minLabel={c.minLabel} maxLabel={c.maxLabel} mine={mine?.value ?? null} />;
    }
    case 'survey': {
      const c = config as SurveyConfig;
      return (
        <div className="grid gap-[1.6em] md:grid-cols-2">
          {c.questions.map((q) => {
            const r = results.questions[q.id];
            return (
              <section key={q.id} className="grid content-start gap-[0.8em] rounded-[1em] bg-surface/80 p-[1.1em]">
                <h4 className="text-[1.6em] font-bold leading-snug">{q.question}</h4>
                {q.kind === 'choice' && r?.kind === 'choice' && <BarList total={(r as ChoiceTally).total} items={q.options.map((o) => ({ id: o.id, label: o.text, count: (r as ChoiceTally).counts[o.id] ?? 0 }))} />}
                {q.kind === 'rating' && r?.kind === 'rating' && (
                  <RatingChart distribution={(r as RatingTally).distribution} average={(r as RatingTally).average} total={(r as RatingTally).total} minLabel={q.minLabel} maxLabel={q.maxLabel} />
                )}
                {q.kind === 'text' && r?.kind === 'text' && (
                  <p className="flex items-center gap-[0.6em] text-[1.3em] font-medium text-ink-2">
                    <Users className="size-[1.1em]" aria-hidden /> {(r as TextTally).total} written {(r as TextTally).total === 1 ? 'answer' : 'answers'} — shown only to the presenter
                  </p>
                )}
              </section>
            );
          })}
        </div>
      );
    }
  }
}

function EmptyResults() {
  return <p className="grid h-full min-h-[8em] place-items-center text-[1.6em] font-medium text-ink-3">No responses yet</p>;
}
