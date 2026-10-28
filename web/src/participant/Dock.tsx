import { AnimatePresence, motion } from 'framer-motion';
import { Check, CircleCheck, CircleHelp, Loader2, MessageCircleQuestion, ThumbsUp, TriangleAlert } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { PULSE_LABEL, QA_MAX_LENGTH, sortQuestions, type Ack, type AudienceQuestion, type ParticipantSnapshot, type PulseValue, type QuestionOrder } from '@classinteract/shared';
import { audio } from '@/audio/engine';
import { Button } from '@/components/ui/button';
import { DialogContent } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/cn';

export interface DockActions {
  ask: (text: string, anonymous: boolean) => Promise<Ack<{ question: AudienceQuestion }>>;
  vote: (id: string, on: boolean) => Promise<Ack<{ votes: number }>>;
  pulse: (value: PulseValue | null) => Promise<Ack>;
}

const PULSE_ICON = { got: CircleCheck, unsure: CircleHelp, lost: TriangleAlert } as const;

/**
 * The always-available extras on a phone, kept out of the way of the activity: a Questions button and the
 * understanding check. Opening Questions shows a sheet over the activity, so a half-written answer is still there
 * when it closes.
 */
export function Dock({ snap, actions }: { snap: ParticipantSnapshot; actions: DockActions }) {
  const f = snap.session.features;
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<PulseValue | null | 'busy'>(null);
  if (!f.qa.enabled && !f.pulse.enabled) return null;
  if (snap.state.phase === 'ended') return null;
  const mine = snap.me.pulse;
  const answered = (snap.questions ?? []).filter((q) => q.mine && q.answered).length;
  const setPulse = async (v: PulseValue) => {
    const next = mine === v ? null : v;
    setPending('busy');
    const ack = await actions.pulse(next);
    setPending(null);
    if (ack.ok) audio.play('select');
  };
  return (
    <>
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-lg items-center gap-2 border-t border-line bg-paper/95 px-3 pt-2 backdrop-blur" aria-label="Questions and understanding" data-testid="participant-dock">
        {f.qa.enabled && (
          <Button variant="secondary" size="sm" className="shrink-0" onClick={() => setOpen(true)} data-testid="qa-open">
            <MessageCircleQuestion className="size-4" aria-hidden /> Ask
            {(snap.questions?.length ?? 0) > 0 && <span className="tabular rounded-full bg-ink/8 px-1.5 text-xs">{snap.questions!.length}</span>}
            {answered > 0 && <span className="sr-only">{answered} of your questions answered</span>}
          </Button>
        )}
        {f.pulse.enabled && (
          <div role="radiogroup" aria-label="How well are you following?" className="ml-auto flex min-w-0 gap-1" data-testid="pulse">
            {(['got', 'unsure', 'lost'] as const).map((v) => {
              const Icon = PULSE_ICON[v];
              const on = mine === v;
              return (
                <button key={v} type="button" role="radio" aria-checked={on} disabled={pending === 'busy'} onClick={() => void setPulse(v)} data-testid={`pulse-${v}`}
                  className={cn('inline-flex h-10 items-center gap-1 rounded-full border px-2.5 text-[0.8125rem] font-semibold transition-colors pointer-coarse:h-11',
                    on ? (v === 'got' ? 'border-ok bg-ok-soft text-ok-ink' : v === 'unsure' ? 'border-warn bg-warn-soft text-warn-ink' : 'border-bad bg-bad-soft text-bad-ink') : 'border-line bg-surface text-ink-2')}>
                  <Icon className="size-4 shrink-0" aria-hidden /> {PULSE_LABEL[v]}
                </button>
              );
            })}
          </div>
        )}
      </nav>
      {f.qa.enabled && <QaSheet open={open} onOpenChange={setOpen} snap={snap} actions={actions} />}
    </>
  );
}

function QaSheet({ open, onOpenChange, snap, actions }: { open: boolean; onOpenChange: (o: boolean) => void; snap: ParticipantSnapshot; actions: DockActions }) {
  const [text, setText] = useState('');
  const [anon, setAnon] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<QuestionOrder>('popular');
  const [voting, setVoting] = useState<string | null>(null);
  const list = useMemo(() => sortQuestions(snap.questions ?? [], order), [snap.questions, order]);
  const allowAnon = snap.session.features.qa.allowAnonymous;

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    const ack = await actions.ask(text, anon && allowAnon);
    setBusy(false);
    if (ack.ok) { setText(''); audio.play('question'); } else setError(ack.message);
  };
  const vote = async (q: AudienceQuestion) => {
    setVoting(q.id);
    const ack = await actions.vote(q.id, !q.voted);
    setVoting(null);
    if (ack.ok && !q.voted) audio.play('upvote');
    if (!ack.ok) setError(ack.message);
  };

  return (
    <DialogContent open={open} onOpenChange={onOpenChange} title="Questions" description={snap.session.features.qa.premoderate ? 'Ask the presenter anything. Questions appear once the presenter approves them.' : 'Ask the presenter anything, and upvote questions you want answered.'} className="max-h-[92dvh] overflow-y-auto">
      <div className="grid gap-4" data-testid="qa-sheet">
        <form onSubmit={send} className="grid gap-2">
          <Textarea value={text} onChange={(e) => { setText(e.target.value); setError(null); }} rows={3} maxLength={QA_MAX_LENGTH + 20} placeholder="Type your question…" aria-label="Your question" data-testid="qa-input" className="rounded-2xl text-base" />
          <div className="flex items-center justify-between gap-3">
            {allowAnon ? (
              <label className="flex items-center gap-2 text-sm font-semibold text-ink-2"><input type="checkbox" className="size-4 accent-[var(--accent)]" checked={anon} onChange={(e) => setAnon(e.target.checked)} data-testid="qa-anonymous" /> Ask anonymously</label>
            ) : <span className="text-sm text-ink-3">Your name is shown.</span>}
            <span className={cn('tabular text-xs font-semibold', text.trim().length > QA_MAX_LENGTH ? 'text-bad' : 'text-ink-3')}>{text.trim().length}/{QA_MAX_LENGTH}</span>
          </div>
          {error && <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-sm font-semibold text-bad-ink">{error}</p>}
          <Button type="submit" variant="primary" disabled={!text.trim() || busy || text.trim().length > QA_MAX_LENGTH} data-testid="qa-send">{busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Send question</Button>
        </form>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold">{list.length ? `${list.length} ${list.length === 1 ? 'question' : 'questions'}` : 'No questions yet'}</h3>
          <Tabs value={order} onValueChange={(v) => setOrder(v as QuestionOrder)}>
            <TabsList><TabsTrigger value="popular">Popular</TabsTrigger><TabsTrigger value="recent">Recent</TabsTrigger></TabsList>
          </Tabs>
        </div>
        <ul className="grid gap-2" data-testid="qa-list">
          <AnimatePresence initial={false}>
            {list.map((q) => (
              <motion.li key={q.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={cn('flex items-start gap-3 rounded-2xl border p-3', q.pinned ? 'border-accent bg-accent-soft' : 'border-line bg-surface')} data-testid="qa-item">
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap break-words font-semibold">{q.text}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
                    <span>{q.mine ? 'You' : q.authorName ?? 'Anonymous'}</span>
                    {q.status === 'pending' && <span className="rounded-full bg-warn-soft px-2 py-0.5 font-bold text-warn-ink">Waiting for approval</span>}
                    {q.answered && <span className="inline-flex items-center gap-1 rounded-full bg-ok-soft px-2 py-0.5 font-bold text-ok-ink"><Check className="size-3" aria-hidden /> Answered</span>}
                    {q.pinned && <span className="font-bold text-accent-ink">Pinned</span>}
                  </p>
                </div>
                <button type="button" disabled={q.mine || q.status !== 'visible' || voting === q.id} aria-pressed={!!q.voted} aria-label={`${q.voted ? 'Remove your upvote' : 'Upvote'} (${q.votes} ${q.votes === 1 ? 'vote' : 'votes'})`} onClick={() => void vote(q)} data-testid="qa-vote"
                  className={cn('grid min-w-12 shrink-0 justify-items-center rounded-xl border px-2 py-1.5 text-sm font-bold transition-colors disabled:opacity-60', q.voted ? 'border-accent bg-accent text-white' : 'border-line bg-paper text-ink-2')}>
                  <ThumbsUp className="size-4" aria-hidden /> <span className="tabular">{q.votes}</span>
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>
    </DialogContent>
  );
}
