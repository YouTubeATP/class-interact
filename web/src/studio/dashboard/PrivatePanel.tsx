import { Check, EyeOff, Lock, StickyNote, UserX, Users } from 'lucide-react';
import { useState } from 'react';
import { quizCorrectIds, type ModerationItem, type PresenterSnapshot, type QuizConfig, type WordcloudConfig } from '@classinteract/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/cn';
import { ResultsView } from '@/render/ResultsView';
import { ScaleBox } from '@/render/ScaleBox';

type Moderate = (cmd: { status: 'visible' | 'hidden'; ids?: string[]; key?: string }) => void;

function ModerationList({ items, isCloud, onModerate }: { items: ModerationItem[]; isCloud: boolean; onModerate: Moderate }) {
  const pending = items.filter((i) => i.status === 'pending');
  if (items.length === 0) return <p className="rounded-2xl border border-dashed border-line-2 p-5 text-center text-sm text-ink-3">Responses will appear here as they arrive.</p>;
  return (
    <div className="grid gap-3" data-testid="moderation-list">
      {pending.length > 0 && (
        <div className="flex items-center justify-between rounded-2xl bg-warn-soft px-3.5 py-2.5 text-sm font-semibold text-warn">
          <span>{pending.length} waiting for approval</span>
          <Button size="sm" variant="secondary" onClick={() => onModerate({ status: 'visible', ids: pending.map((p) => p.id) })} data-testid="approve-all">Approve all</Button>
        </div>
      )}
      <ul className="grid gap-2">
        {items.map((i) => (
          <li key={i.id} className={cn('grid gap-1.5 rounded-xl border p-3', i.status === 'hidden' ? 'border-line bg-paper opacity-70' : i.status === 'pending' ? 'border-warn/40 bg-surface' : 'border-line bg-surface')} data-testid="moderation-item" data-status={i.status}>
            <p className="whitespace-pre-wrap break-words text-sm font-semibold">{i.text}</p>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs text-ink-3">{i.participantName}{i.status !== 'visible' && <Badge variant={i.status === 'pending' ? 'warn' : 'neutral'} className="ml-2">{i.status === 'pending' ? 'Pending' : 'Hidden'}</Badge>}</span>
              <span className="flex shrink-0 gap-1">
                {i.status !== 'visible' && <Button size="sm" variant="soft" onClick={() => onModerate({ status: 'visible', ids: [i.id] })} data-testid="mod-show"><Check className="size-3.5" aria-hidden /> {i.status === 'pending' ? 'Approve' : 'Show'}</Button>}
                {i.status !== 'hidden' && <Button size="sm" variant="ghost" onClick={() => onModerate(isCloud && i.key ? { status: 'hidden', key: i.key } : { status: 'hidden', ids: [i.id] })} data-testid="mod-hide"><EyeOff className="size-3.5" aria-hidden /> {isCloud ? 'Hide term' : 'Hide'}</Button>}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Roster({ snap, onKick }: { snap: PresenterSnapshot; onKick: (id: string, name: string) => void }) {
  const [open, setOpen] = useState(false);
  const { participants, counts } = snap;
  return (
    <div className="grid gap-2">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center justify-between rounded-xl px-1 py-1 text-left" aria-expanded={open} data-testid="roster-toggle">
        <span className="flex items-center gap-2 text-sm font-bold"><Users className="size-4 text-ink-3" aria-hidden /> <span data-testid="participant-count" className="tabular">{counts.participants}</span> {counts.participants === 1 ? 'participant' : 'participants'}</span>
        <span className="tabular text-xs font-semibold text-ink-3"><span className="mr-1 inline-block size-2 rounded-full bg-ok align-middle" />{counts.online} online</span>
      </button>
      {open && (
        <ul className="grid max-h-60 gap-1 overflow-y-auto" data-testid="roster">
          {participants.length === 0 && <li className="px-1 py-2 text-sm text-ink-3">No one has joined yet.</li>}
          {participants.map((p) => (
            <li key={p.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-ink/5">
              <span className={cn('size-2 shrink-0 rounded-full', p.online ? 'bg-ok' : 'bg-line-2')} aria-label={p.online ? 'Online' : 'Offline'} />
              <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
              {p.responses > 0 && <span className="tabular text-xs text-ink-3">{p.responses}</span>}
              <Button variant="ghost" size="icon-sm" aria-label={`Remove ${p.name}`} onClick={() => onKick(p.id, p.name)}><UserX className="size-4" /></Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Everything only the presenter sees: live results, moderation, notes and the answer key. */
export function PrivatePanel({ snap, onModerate }: { snap: PresenterSnapshot; onModerate: Moderate }) {
  const { activity, fullConfig, results, state, moderation } = snap;
  const text = activity?.type === 'wordcloud' || activity?.type === 'open';
  const notes = (fullConfig as { notes?: string } | null)?.notes ?? '';
  const pending = moderation.filter((m) => m.status === 'pending').length;
  const quiz = fullConfig && activity?.type === 'quiz' ? (fullConfig as QuizConfig) : null;
  const answerTexts = quiz ? quizCorrectIds(quiz).flatMap((id) => quiz.options.find((o) => o.id === id)?.text ?? []) : [];
  const premod = fullConfig && (activity?.type === 'wordcloud' || activity?.type === 'open') ? (fullConfig as WordcloudConfig).moderation === 'premoderate' : false;

  if (!activity || !fullConfig) {
    return <p className="rounded-card border border-dashed border-line-2 p-6 text-center text-sm text-ink-3">Live results, moderation and speaker notes for the current activity appear here.</p>;
  }
  return (
    <Tabs defaultValue="results" className="grid gap-3">
      <TabsList className="w-full">
        <TabsTrigger value="results" className="flex-1" data-testid="tab-results">Results</TabsTrigger>
        {text && <TabsTrigger value="moderate" className="flex-1" data-testid="tab-moderate">Moderate{pending > 0 && <Badge variant="warn" className="ml-1">{pending}</Badge>}</TabsTrigger>}
        <TabsTrigger value="notes" className="flex-1" data-testid="tab-notes"><StickyNote className="size-3.5" aria-hidden /> Notes</TabsTrigger>
      </TabsList>

      <TabsContent value="results" className="grid gap-3 outline-none">
        <div className="flex items-center justify-between text-xs font-semibold text-ink-3">
          <span className="flex items-center gap-1.5"><Lock className="size-3.5" aria-hidden /> Private view</span>
          <Badge variant={state.resultsVisible ? 'ok' : 'neutral'}>{state.resultsVisible ? 'Showing on screen' : 'Not on screen'}</Badge>
        </div>
        {quiz && answerTexts.length > 0 && <p className="rounded-xl bg-ok-soft px-3 py-2 text-sm font-semibold text-[#0b4a30]" data-testid="answer-key">{answerTexts.length > 1 ? 'Correct answers' : 'Correct answer'}: {answerTexts.join(' · ')}</p>}
        {results && results.type !== 'content' ? (
          <div data-tone={activity.type} className="rounded-2xl bg-surface p-3.5 ring-1 ring-line" data-testid="private-results">
            <ScaleBox pct={activity.type === 'survey' ? 2.3 : 3.1}>
              <div className={activity.type === 'wordcloud' ? 'h-[22em]' : ''}>
                <ResultsView type={activity.type} config={fullConfig} results={results} correctIds={quiz ? quizCorrectIds(quiz) : null} fill={activity.type === 'wordcloud'} />
              </div>
            </ScaleBox>
          </div>
        ) : <p className="text-sm text-ink-3">This slide has no responses.</p>}
      </TabsContent>

      {text && (
        <TabsContent value="moderate" className="outline-none">
          {premod && <p className="mb-3 text-sm text-ink-2">Responses wait for your approval before they can appear on screen.</p>}
          <ModerationList items={moderation} isCloud={activity.type === 'wordcloud'} onModerate={onModerate} />
        </TabsContent>
      )}

      <TabsContent value="notes" className="outline-none">
        {notes ? <p className="whitespace-pre-wrap rounded-2xl bg-warn-soft/60 p-4 text-[0.9375rem] leading-relaxed" data-testid="speaker-notes">{notes}</p> : <p className="text-sm text-ink-3">No speaker notes for this slide.</p>}
      </TabsContent>
    </Tabs>
  );
}

