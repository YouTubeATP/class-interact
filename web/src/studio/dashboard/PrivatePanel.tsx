import { Check, EyeOff, Lock, StickyNote, UserX, Users } from 'lucide-react';
import { useState } from 'react';
import { quizCorrectIds, type ModerationItem, type PresenterCommand, type PresenterSnapshot, type QuizConfig, type WordcloudConfig } from '@classinteract/shared';
import { AccessPanel, ComparePanel, MergePanel, PulsePanel, QaPanel, ReviewPanel, TeamsPanel } from './RoomPanels';
import { quizAnswerLabel, quizAnswerLines } from '@/lib/quiz';
import { RichInline } from '@/components/RichText';
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

export function Roster({ snap, onKick }: { snap: PresenterSnapshot; onKick?: (id: string, name: string) => void }) {
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
              {p.simulated && <span className="text-[0.6875rem] font-semibold text-ink-3">sim</span>}
              {p.teamId && snap.teams.find((t) => t.id === p.teamId) && <span className="size-2 shrink-0 rounded-full" style={{ background: snap.teams.find((t) => t.id === p.teamId)!.color }} title={snap.teams.find((t) => t.id === p.teamId)!.name} aria-label={`Team ${snap.teams.find((t) => t.id === p.teamId)!.name}`} />}
              {onKick && <Button variant="ghost" size="icon-sm" aria-label={`Remove ${p.name}`} onClick={() => onKick(p.id, p.name)}><UserX className="size-4" /></Button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Send = (c: PresenterCommand) => Promise<boolean>;

/** Everything only the presenter sees: live results, moderation, notes, the answer key, and the room (Q&A, pulse, teams, access). */
export function PrivatePanel({ snap, send, sessionId, aiEnabled }: { snap: PresenterSnapshot; send: Send; sessionId: string; aiEnabled: boolean }) {
  const { activity, fullConfig, results, state, moderation } = snap;
  const onModerate: Moderate = (c) => void send({ cmd: 'moderate', ...c });
  const text = activity?.type === 'wordcloud' || activity?.type === 'open' || (activity?.type === 'quiz' && moderation.length > 0);
  const notes = (fullConfig as { notes?: string } | null)?.notes ?? '';
  const pending = moderation.filter((m) => m.status === 'pending').length;
  const quiz = fullConfig && activity?.type === 'quiz' ? (fullConfig as QuizConfig) : null;
  const answerTexts = quiz ? quizAnswerLines(quiz) : [];
  const premod = fullConfig && (activity?.type === 'wordcloud' || activity?.type === 'open') ? (fullConfig as WordcloudConfig).moderation === 'premoderate' : false;
  const perms = snap.staff.permissions;
  const qaPending = snap.allQuestions.filter((q) => q.status === 'pending').length;
  const qaOpen = snap.allQuestions.filter((q) => q.status === 'visible' && !q.answered).length;
  const undecided = snap.reviews.filter((r) => !r.decision).length;
  const hasActivity = !!activity && !!fullConfig;
  // until the presenter picks a tab, follow what is on screen: results during an activity, questions otherwise
  const [picked, setTab] = useState<string | null>(null);
  const tab = picked ?? (hasActivity ? 'results' : 'qa');
  const available = [
    hasActivity && 'results', hasActivity && text && 'moderate', snap.reviews.length > 0 && 'review', snap.runs.length > 1 && 'compare', 'qa', 'pulse',
    perms.includes('participants') && 'teams', perms.includes('access') && 'access', hasActivity && 'notes',
  ].filter(Boolean) as string[];
  // a tab that does not apply to the new activity falls back to the first one that does
  const shown = available.includes(tab) ? tab : available[0];

  return (
    <Tabs value={shown} onValueChange={setTab} className="grid gap-3">
      <TabsList className="flex h-auto w-full flex-wrap justify-start" aria-label="Presenter panels">
        {hasActivity && <TabsTrigger value="results" data-testid="tab-results">Results</TabsTrigger>}
        {hasActivity && text && <TabsTrigger value="moderate" data-testid="tab-moderate">Moderate{pending > 0 && <Badge variant="warn" className="ml-1">{pending}</Badge>}</TabsTrigger>}
        {snap.reviews.length > 0 && <TabsTrigger value="review" data-testid="tab-review">Review{undecided > 0 && <Badge variant="warn" className="ml-1">{undecided}</Badge>}</TabsTrigger>}
        {snap.runs.length > 1 && <TabsTrigger value="compare" data-testid="tab-compare">Compare</TabsTrigger>}
        <TabsTrigger value="qa" data-testid="tab-qa">Q&amp;A{qaPending > 0 ? <Badge variant="warn" className="ml-1">{qaPending}</Badge> : qaOpen > 0 ? <Badge className="ml-1">{qaOpen}</Badge> : null}</TabsTrigger>
        <TabsTrigger value="pulse" data-testid="tab-pulse">Pulse</TabsTrigger>
        {perms.includes('participants') && <TabsTrigger value="teams" data-testid="tab-teams">Teams</TabsTrigger>}
        {perms.includes('access') && <TabsTrigger value="access" data-testid="tab-access">Access</TabsTrigger>}
        {hasActivity && <TabsTrigger value="notes" data-testid="tab-notes"><StickyNote className="size-3.5" aria-hidden /> Notes</TabsTrigger>}
      </TabsList>

      {hasActivity && (
        <TabsContent value="results" className="grid gap-3 outline-none">
          <div className="flex items-center justify-between text-xs font-semibold text-ink-3">
            <span className="flex items-center gap-1.5"><Lock className="size-3.5" aria-hidden /> Private view</span>
            <Badge variant={state.resultsVisible ? 'ok' : 'neutral'}>{state.resultsVisible ? 'Showing on screen' : 'Not on screen'}</Badge>
          </div>
          {quiz && answerTexts.length > 0 && <p className="rounded-xl bg-ok-soft px-3 py-2 text-sm font-semibold text-ok-ink" data-testid="answer-key">{quizAnswerLabel(quiz)}: {answerTexts.map((t, i) => <span key={i}>{i > 0 && ' · '}<RichInline text={t} /></span>)}</p>}
          {results && results.type !== 'content' ? (
            <div data-tone={activity!.type} className="rounded-2xl bg-surface p-3.5 ring-1 ring-line" data-testid="private-results">
              <ScaleBox pct={activity!.type === 'survey' ? 2.3 : 3.1}>
                <div className={activity!.type === 'wordcloud' ? 'h-[22em]' : ''}>
                  <ResultsView type={activity!.type} config={fullConfig!} results={results} correctIds={quiz ? quizCorrectIds(quiz) : null} fill={activity!.type === 'wordcloud'} />
                </div>
              </ScaleBox>
            </div>
          ) : <p className="text-sm text-ink-3">This slide has no responses.</p>}
        </TabsContent>
      )}

      {hasActivity && text && (
        <TabsContent value="moderate" className="grid gap-5 outline-none">
          {premod && <p className="text-sm text-ink-2">Responses wait for your approval before they can appear on screen.</p>}
          <ModerationList items={moderation} isCloud={activity!.type === 'wordcloud'} onModerate={onModerate} />
          {activity!.type === 'wordcloud' && <div className="border-t border-line pt-4"><h3 className="mb-2 text-sm font-bold">Group similar answers</h3><MergePanel snap={snap} send={send} aiEnabled={aiEnabled} /></div>}
        </TabsContent>
      )}
      <TabsContent value="review" className="outline-none"><ReviewPanel snap={snap} send={send} /></TabsContent>
      <TabsContent value="compare" className="outline-none"><ComparePanel snap={snap} /></TabsContent>
      <TabsContent value="qa" className="outline-none"><QaPanel snap={snap} send={send} /></TabsContent>
      <TabsContent value="pulse" className="outline-none"><PulsePanel snap={snap} send={send} /></TabsContent>
      {perms.includes('participants') && <TabsContent value="teams" className="outline-none"><TeamsPanel snap={snap} send={send} /></TabsContent>}
      {perms.includes('access') && <TabsContent value="access" className="outline-none"><AccessPanel snap={snap} sessionId={sessionId} /></TabsContent>}
      {hasActivity && (
        <TabsContent value="notes" className="outline-none">
          {notes ? <p className="whitespace-pre-wrap rounded-2xl bg-warn-soft/60 p-4 text-[0.9375rem] leading-relaxed" data-testid="speaker-notes">{notes}</p> : <p className="text-sm text-ink-3">No speaker notes for this slide.</p>}
        </TabsContent>
      )}
    </Tabs>
  );
}
