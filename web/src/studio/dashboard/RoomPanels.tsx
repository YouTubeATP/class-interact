import { Check, Copy, Eye, EyeOff, FlaskConical, Link2, Loader2, Pin, PinOff, Shuffle, Sparkles, ThumbsUp, Trash2, Undo2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ROLE_HINT, ROLE_LABEL, RUN_SCORING_LABEL, sortQuestions,
  type AudienceQuestion, type DelegateRole, type PresenterCommand, type PresenterSnapshot, type QuestionOrder, type Results,
} from '@classinteract/shared';
import { QRCode } from '@/components/QRCode';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input, Select } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { plural } from '@/lib/format';
import { ScaleBox } from '@/render/ScaleBox';
import { PulseChart } from '@/render/StageView';
import { BarList } from '@/render/viz/BarList';

type Send = (c: PresenterCommand) => Promise<boolean>;

const Empty = ({ children }: { children: React.ReactNode }) => <p className="rounded-2xl border border-dashed border-line-2 p-5 text-center text-sm text-ink-3">{children}</p>;

// ------------------------------------------------------------------------------------
// Q&A
// ------------------------------------------------------------------------------------

export function QaPanel({ snap, send }: { snap: PresenterSnapshot; send: Send }) {
  const [order, setOrder] = useState<QuestionOrder>('popular');
  const [filter, setFilter] = useState<'open' | 'answered' | 'hidden'>('open');
  const qa = snap.session.features.qa;
  const canScreen = snap.staff.permissions.includes('screen');
  const canSettings = snap.staff.permissions.includes('settings');
  const list = useMemo(() => {
    const all = snap.allQuestions;
    const f = filter === 'open' ? all.filter((q) => (q.status === 'visible' || q.status === 'pending') && !q.answered)
      : filter === 'answered' ? all.filter((q) => q.answered && q.status === 'visible')
      : all.filter((q) => q.status === 'hidden' || q.status === 'dismissed');
    return sortQuestions(f, order);
  }, [snap.allQuestions, order, filter]);
  const op = (o: Extract<PresenterCommand, { cmd: 'qa' }>['op'], id: string) => void send({ cmd: 'qa', op: o, id });
  const pending = snap.allQuestions.filter((q) => q.status === 'pending').length;

  if (!qa.enabled) {
    return <div className="grid gap-3"><Empty>Audience questions are off for this session.</Empty>{canSettings && <Button variant="secondary" onClick={() => void send({ cmd: 'features', patch: { qa: { enabled: true } } })} data-testid="qa-enable">Turn on questions</Button>}</div>;
  }
  return (
    <div className="grid gap-3" data-testid="qa-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList><TabsTrigger value="open">Open{pending > 0 && <Badge variant="warn" className="ml-1">{pending}</Badge>}</TabsTrigger><TabsTrigger value="answered">Answered</TabsTrigger><TabsTrigger value="hidden">Hidden</TabsTrigger></TabsList>
        </Tabs>
        <Select value={order} onChange={(e) => setOrder(e.target.value as QuestionOrder)} aria-label="Sort questions" className="h-9 w-auto text-sm"><option value="popular">Most votes</option><option value="recent">Newest</option></Select>
      </div>
      {canSettings && (
        <label className="flex items-center gap-2 text-sm font-semibold text-ink-2"><input type="checkbox" className="size-4 accent-[var(--accent)]" checked={qa.premoderate} onChange={(e) => void send({ cmd: 'features', patch: { qa: { premoderate: e.target.checked } } })} data-testid="qa-premoderate" /> Approve questions before others see them</label>
      )}
      {list.length === 0 ? <Empty>{filter === 'open' ? 'Questions from the audience appear here.' : 'Nothing here.'}</Empty> : (
        <ul className="grid gap-2">
          {list.map((q) => <QuestionRow key={q.id} q={q} highlighted={snap.state.highlightQuestionId === q.id} canScreen={canScreen} op={op} />)}
        </ul>
      )}
    </div>
  );
}

function QuestionRow({ q, highlighted, canScreen, op }: { q: AudienceQuestion; highlighted: boolean; canScreen: boolean; op: (o: Extract<PresenterCommand, { cmd: 'qa' }>['op'], id: string) => void }) {
  return (
    <li className={cn('grid gap-2 rounded-xl border p-3', highlighted ? 'border-accent bg-accent-soft' : q.status === 'pending' ? 'border-warn/50 bg-surface' : 'border-line bg-surface')} data-testid="qa-row" data-status={q.status}>
      <div className="flex items-start gap-2.5">
        <span className="grid min-w-10 shrink-0 justify-items-center rounded-lg bg-ink/5 px-1.5 py-1 text-xs font-bold text-ink-2"><ThumbsUp className="size-3.5" aria-hidden /><span className="tabular">{q.votes}</span></span>
        <div className="min-w-0 flex-1">
          <p className="whitespace-pre-wrap break-words text-sm font-semibold">{q.text}</p>
          <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-ink-3">
            <span>{q.authorName ?? 'Anonymous'}</span>
            {q.status === 'pending' && <Badge variant="warn">Waiting for approval</Badge>}
            {q.pinned && <Badge variant="accent">Pinned</Badge>}
            {q.answered && <Badge variant="ok">Answered</Badge>}
            {highlighted && <Badge variant="accent">On screen</Badge>}
            {q.status === 'dismissed' && <Badge>Dismissed</Badge>}
            {q.status === 'hidden' && <Badge>Hidden</Badge>}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {q.status !== 'visible' && <Button size="sm" variant="soft" onClick={() => op('approve', q.id)} data-testid="qa-approve"><Check className="size-3.5" aria-hidden /> {q.status === 'pending' ? 'Approve' : 'Show again'}</Button>}
        {q.status === 'visible' && canScreen && <Button size="sm" variant={highlighted ? 'soft' : 'ghost'} onClick={() => op('highlight', q.id)} data-testid="qa-highlight"><Eye className="size-3.5" aria-hidden /> {highlighted ? 'Remove from screen' : 'Show on screen'}</Button>}
        {q.status === 'visible' && <Button size="sm" variant="ghost" onClick={() => op(q.answered ? 'unanswer' : 'answer', q.id)} data-testid="qa-answer"><Check className="size-3.5" aria-hidden /> {q.answered ? 'Not answered' : 'Mark answered'}</Button>}
        {q.status === 'visible' && <Button size="sm" variant="ghost" onClick={() => op(q.pinned ? 'unpin' : 'pin', q.id)}>{q.pinned ? <PinOff className="size-3.5" aria-hidden /> : <Pin className="size-3.5" aria-hidden />} {q.pinned ? 'Unpin' : 'Pin'}</Button>}
        {q.status !== 'hidden' && q.status !== 'dismissed' && <Button size="sm" variant="ghost" onClick={() => op('dismiss', q.id)} title="Repetitive or off-topic: hidden from everyone, kept in the record" data-testid="qa-dismiss"><X className="size-3.5" aria-hidden /> Dismiss</Button>}
        {q.status !== 'hidden' && <Button size="sm" variant="ghost" onClick={() => op('hide', q.id)} title="Inappropriate: hidden from everyone" data-testid="qa-hide"><EyeOff className="size-3.5" aria-hidden /> Hide</Button>}
        <Button size="sm" variant="ghost" className="text-bad" onClick={() => op('delete', q.id)} data-testid="qa-delete"><Trash2 className="size-3.5" aria-hidden /> Delete</Button>
      </div>
    </li>
  );
}

// ------------------------------------------------------------------------------------
// Pulse
// ------------------------------------------------------------------------------------

export function PulsePanel({ snap, send }: { snap: PresenterSnapshot; send: Send }) {
  const on = snap.session.features.pulse.enabled;
  if (!on) {
    return <div className="grid gap-3"><Empty>The understanding check is off.</Empty>{snap.staff.permissions.includes('settings') && <Button variant="secondary" onClick={() => void send({ cmd: 'features', patch: { pulse: { enabled: true } } })}>Turn it on</Button>}</div>;
  }
  const p = snap.pulse;
  return (
    <div className="grid gap-3" data-testid="pulse-panel">
      <p className="text-sm text-ink-2">Private: only you see this unless you put it on screen. {p ? `${p.total} of ${snap.counts.participants} people have said how they are doing.` : ''}</p>
      {p && p.total > 0 ? <ScaleBox pct={3}><PulseChart pulse={p} /></ScaleBox> : <Empty>Nobody has said yet. The buttons are at the bottom of everyone’s phone.</Empty>}
      {p && p.total >= 3 && p.lost / p.total >= 0.3 && <p className="rounded-xl bg-bad-soft px-3 py-2 text-sm font-semibold text-bad-ink" role="status">{Math.round((p.lost / p.total) * 100)}% feel lost right now.</p>}
    </div>
  );
}

// ------------------------------------------------------------------------------------
// Teams
// ------------------------------------------------------------------------------------

export function TeamsPanel({ snap, send }: { snap: PresenterSnapshot; send: Send }) {
  const [count, setCount] = useState('4');
  const f = snap.session.features.teams;
  const names = new Map(snap.participants.map((p) => [p.id, p.name]));
  const unassigned = snap.participants.filter((p) => !p.teamId || !snap.teams.some((t) => t.id === p.teamId));
  if (!f.enabled || snap.teams.length === 0) {
    return (
      <div className="grid gap-3" data-testid="teams-panel">
        <p className="text-sm text-ink-2">Put everyone into teams. Each answer still counts for the person; teams are ranked by their members’ average.</p>
        <div className="flex items-end gap-2">
          <Field label="Number of teams"><Select value={count} onChange={(e) => setCount(e.target.value)} aria-label="Number of teams">{[2, 3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>{n}</option>)}</Select></Field>
          <Button variant="primary" onClick={() => void send({ cmd: 'teams', team: { op: 'setup', count: Number(count) } })} data-testid="teams-setup">Make teams</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="grid gap-3" data-testid="teams-panel">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => void send({ cmd: 'teams', team: { op: 'shuffle' } })} data-testid="teams-shuffle"><Shuffle className="size-3.5" aria-hidden /> Shuffle everyone</Button>
        <Select value={f.assignment} onChange={(e) => void send({ cmd: 'features', patch: { teams: { assignment: e.target.value as 'auto' | 'manual' } } })} aria-label="Newcomers" className="h-9 w-auto text-sm"><option value="auto">Newcomers join the smallest team</option><option value="manual">I place newcomers myself</option></Select>
        <Button variant="ghost" size="sm" onClick={() => void send({ cmd: 'features', patch: { teams: { enabled: false } } })}>Turn teams off</Button>
      </div>
      <ul className="grid gap-2">
        {snap.teams.map((t) => {
          const st = snap.teamStandings.find((s) => s.teamId === t.id);
          return (
            <li key={t.id} className="grid gap-1.5 rounded-xl border border-line p-3">
              <div className="flex items-center gap-2">
                <span className="size-3 shrink-0 rounded-full" style={{ background: t.color }} aria-hidden />
                <Input defaultValue={t.name} maxLength={40} aria-label="Team name" className="h-8 flex-1 text-sm font-bold" onBlur={(e) => e.target.value.trim() && e.target.value !== t.name && void send({ cmd: 'teams', team: { op: 'rename', teamId: t.id, name: e.target.value } })} />
                <span className="tabular shrink-0 text-xs font-semibold text-ink-3">{st ? `${st.score.toLocaleString()} avg` : ''}</span>
              </div>
              <p className="text-xs text-ink-2">{t.memberIds.length ? t.memberIds.map((id) => names.get(id)).filter(Boolean).join(', ') : 'No members yet'}</p>
            </li>
          );
        })}
      </ul>
      {snap.participants.length > 0 && (
        <details className="rounded-xl border border-line px-3 py-2 text-sm">
          <summary className="cursor-pointer font-semibold">Move people {unassigned.length > 0 && <Badge variant="warn">{unassigned.length} without a team</Badge>}</summary>
          <ul className="mt-2 grid max-h-60 gap-1 overflow-y-auto">
            {snap.participants.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <Select value={p.teamId ?? ''} onChange={(e) => void send({ cmd: 'teams', team: { op: 'assign', participantId: p.id, teamId: e.target.value || null } })} aria-label={`Team for ${p.name}`} className="h-8 w-40 text-xs">
                  <option value="">No team</option>
                  {snap.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------
// Access links
// ------------------------------------------------------------------------------------

export function AccessPanel({ snap, sessionId }: { snap: PresenterSnapshot; sessionId: string }) {
  const [role, setRole] = useState<DelegateRole>('copresenter');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ url: string; role: DelegateRole } | null>(null);
  const create = async () => {
    setBusy(true);
    try {
      const g = await api.sessions.createGrant(sessionId, role, label);
      setMade({ url: `${window.location.origin}${g.path}`, role });
      setLabel('');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not create the link.'); } finally { setBusy(false); }
  };
  const active = snap.grants.filter((g) => !g.revokedAt);
  return (
    <div className="grid gap-4" data-testid="access-panel">
      <p className="text-sm text-ink-2">Give a teaching assistant (or your own phone) a link to help run this session. They never need the Studio password, and you can revoke a link at any time without ending the session.</p>
      <div className="grid gap-3 rounded-2xl border border-line bg-paper/60 p-3.5">
        <div role="radiogroup" aria-label="Role" className="grid gap-2 sm:grid-cols-2">
          {(['copresenter', 'moderator'] as const).map((r) => (
            <button key={r} type="button" role="radio" aria-checked={role === r} onClick={() => setRole(r)} data-testid={`grant-role-${r}`}
              className={cn('grid gap-0.5 rounded-xl border-2 p-2.5 text-left', role === r ? 'border-accent bg-accent-soft' : 'border-line')}>
              <span className="text-sm font-bold">{ROLE_LABEL[r]}</span><span className="text-xs leading-snug text-ink-2">{ROLE_HINT[r]}</span>
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <Field label="Name (for you)"><Input value={label} maxLength={60} placeholder={role === 'moderator' ? 'e.g. Sam (TA)' : 'e.g. My phone'} onChange={(e) => setLabel(e.target.value)} /></Field>
          <Button variant="primary" disabled={busy} onClick={() => void create()} data-testid="grant-create">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Link2 className="size-4" aria-hidden />} Create link</Button>
        </div>
      </div>
      {made && (
        <div className="grid gap-3 rounded-2xl border border-accent bg-accent-soft p-3.5 sm:grid-cols-[8rem_1fr]" data-testid="grant-made">
          <div className="rounded-lg bg-white p-1"><QRCode value={made.url} label="QR code for the access link" className="w-full" /></div>
          <div className="grid content-start gap-2 text-sm">
            <p className="font-semibold">{ROLE_LABEL[made.role]} link ready. Scan it with a phone, or send it privately: anyone with the link gets this access.</p>
            <code className="break-all rounded-lg bg-surface px-2 py-1 text-xs" data-testid="grant-url">{made.url}</code>
            <div><Button size="sm" variant="secondary" onClick={() => void navigator.clipboard.writeText(made.url).then(() => toast.success('Copied'), () => toast.error('Copy failed'))}><Copy className="size-3.5" aria-hidden /> Copy link</Button></div>
          </div>
        </div>
      )}
      {active.length === 0 ? <Empty>No access links yet.</Empty> : (
        <ul className="grid gap-2">
          {active.map((g) => (
            <li key={g.id} className="flex items-center gap-2 rounded-xl border border-line p-2.5 text-sm" data-testid="grant-row">
              <span className={cn('size-2 shrink-0 rounded-full', g.online ? 'bg-ok' : 'bg-line-2')} aria-label={g.online ? 'Connected' : 'Not connected'} />
              <span className="min-w-0 flex-1 truncate font-semibold">{g.label}</span>
              <Badge>{ROLE_LABEL[g.role]}</Badge>
              <Button size="sm" variant="danger-soft" onClick={() => void api.sessions.revokeGrant(sessionId, g.id).then(() => toast.success('Access revoked'), (e) => toast.error(e.message))} data-testid="grant-revoke">Revoke</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------
// Typed-answer review, word-cloud grouping, run comparison
// ------------------------------------------------------------------------------------

export function ReviewPanel({ snap, send }: { snap: PresenterSnapshot; send: Send }) {
  if (!snap.reviews.length) return <Empty>Answers the grader is unsure about (a typo, a number just outside the tolerance) appear here for you to decide.</Empty>;
  return (
    <ul className="grid gap-2" data-testid="review-panel">
      {snap.reviews.map((r) => (
        <li key={r.key} className="grid gap-2 rounded-xl border border-line p-3" data-testid="review-item">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 break-words font-mono text-sm font-semibold">{r.label}</p>
            <span className="shrink-0 text-xs text-ink-3">{plural(r.count, 'person', 'people')}</span>
          </div>
          <p className="text-xs text-ink-2">{r.detail}</p>
          <div className="flex gap-1.5">
            <Button size="sm" variant={r.decision === 'accepted' ? 'soft' : 'secondary'} aria-pressed={r.decision === 'accepted'} onClick={() => void send({ cmd: 'review', key: r.key, accept: true })} data-testid="review-accept"><Check className="size-3.5" aria-hidden /> Accept</Button>
            <Button size="sm" variant={r.decision === 'rejected' ? 'soft' : 'ghost'} aria-pressed={r.decision === 'rejected'} onClick={() => void send({ cmd: 'review', key: r.key, accept: false })} data-testid="review-reject"><X className="size-3.5" aria-hidden /> Not accepted</Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function MergePanel({ snap, send, aiEnabled }: { snap: PresenterSnapshot; send: Send; aiEnabled: boolean }) {
  const [ai, setAi] = useState<typeof snap.mergeSuggestions>([]);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const merged = Object.entries(snap.merges);
  const terms = snap.results?.type === 'wordcloud' ? snap.results.terms : [];
  const suggestions = [...snap.mergeSuggestions, ...ai].filter((s) => !dismissed.has(s.keys.join('|')) && s.keys.every((k) => !(k in snap.merges)));
  const askAi = async () => {
    setBusy(true);
    try { setAi((await api.ai.grouping(snap.session.id, terms.map((t) => ({ key: t.key, label: t.label, count: t.count })))).suggestions); } catch (e) { toast.error(e instanceof Error ? e.message : 'AI grouping failed.'); } finally { setBusy(false); }
  };
  return (
    <div className="grid gap-3" data-testid="merge-panel">
      <p className="text-sm text-ink-2">Answers are already grouped ignoring case and punctuation. These are further groupings to consider; nothing is merged unless you accept it, and the original answers are always kept.</p>
      {suggestions.length === 0 ? <Empty>No grouping suggestions.</Empty> : (
        <ul className="grid gap-2">
          {suggestions.map((s) => (
            <li key={s.keys.join('|')} className="grid gap-2 rounded-xl border border-line p-3 text-sm" data-testid="merge-suggestion">
              <p className="font-semibold">{s.labels.map((l) => `“${l}”`).join(' + ')}</p>
              <p className="text-xs text-ink-3">{s.reason}</p>
              <div className="flex gap-1.5">
                <Button size="sm" variant="soft" onClick={() => void send({ cmd: 'merge', keys: s.keys, into: s.into })} data-testid="merge-accept"><Check className="size-3.5" aria-hidden /> Group them</Button>
                <Button size="sm" variant="ghost" onClick={() => setDismissed((d) => new Set([...d, s.keys.join('|')]))}><X className="size-3.5" aria-hidden /> Keep apart</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {aiEnabled && terms.length >= 2 && <Button variant="secondary" size="sm" disabled={busy} onClick={() => void askAi()} data-testid="merge-ai">{busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Sparkles className="size-3.5" aria-hidden />} Suggest groups by meaning (AI)</Button>}
      {merged.length > 0 && (
        <div className="grid gap-1.5">
          <h4 className="text-xs font-bold text-ink-3">Grouped by you</h4>
          {merged.map(([k, into]) => (
            <p key={k} className="flex items-center justify-between gap-2 rounded-lg bg-ink/5 px-2.5 py-1.5 text-sm"><span>“{k}” counted as “{into}”</span><Button size="sm" variant="ghost" onClick={() => void send({ cmd: 'unmerge', key: k })}><Undo2 className="size-3.5" aria-hidden /> Undo</Button></p>
          ))}
        </div>
      )}
    </div>
  );
}

function distributionOf(r: Results, labels: Map<string, string>): { id: string; label: string; count: number }[] {
  if ((r.type === 'quiz' || r.type === 'poll') && r.kind === 'choice') return Object.entries(r.counts).map(([id, count]) => ({ id, label: labels.get(id) ?? id, count }));
  if (r.type === 'quiz' && r.kind === 'answers') return r.answers.slice(0, 6).map((a) => ({ id: a.key, label: a.label, count: a.count }));
  if (r.type === 'rating') return r.distribution.map((d) => ({ id: String(d.value), label: String(d.value), count: d.count }));
  if (r.type === 'wordcloud') return r.terms.slice(0, 6).map((t) => ({ id: t.key, label: t.label, count: t.count }));
  return [];
}

/** Every run of the current activity side by side. */
export function ComparePanel({ snap }: { snap: PresenterSnapshot }) {
  if (snap.runs.length < 2) return <Empty>Run this activity again to compare rounds.</Empty>;
  const cfg = snap.fullConfig as { options?: { id: string; text: string }[]; pairs?: { left: string }[] } | null;
  const labels = new Map<string, string>([...(cfg?.options ?? []).map((o) => [o.id, o.text] as [string, string]), ...(cfg?.pairs ?? []).map((p, i) => [`L${i}`, p.left] as [string, string])]);
  const first = snap.runs[0];
  const last = snap.runs[snap.runs.length - 1];
  const delta = first.correctRate !== null && last.correctRate !== null ? Math.round((last.correctRate - first.correctRate) * 100) : null;
  return (
    <div className="grid gap-3" data-testid="compare-panel">
      {delta !== null && (
        <p className={cn('rounded-xl px-3 py-2 text-sm font-semibold', delta > 0 ? 'bg-ok-soft text-ok-ink' : delta < 0 ? 'bg-bad-soft text-bad-ink' : 'bg-ink/5 text-ink-2')} data-testid="compare-delta">
          Correct: {Math.round(first.correctRate! * 100)}% in round {first.number} → {Math.round(last.correctRate! * 100)}% in round {last.number} ({delta > 0 ? '+' : ''}{delta} percentage points)
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {snap.runs.map((r) => (
          <section key={r.id} className="grid gap-2 rounded-xl border border-line p-3">
            <h4 className="flex items-center justify-between text-sm font-bold">Round {r.number} <span className="text-xs font-medium text-ink-3">{plural(r.respondents, 'person', 'people')}</span></h4>
            <p className="text-xs text-ink-3">{RUN_SCORING_LABEL[r.scoring]}</p>
            <ScaleBox pct={4.2}><BarList total={Math.max(1, r.respondents)} items={distributionOf(r.results, labels)} /></ScaleBox>
          </section>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------
// Self-paced and rehearsal
// ------------------------------------------------------------------------------------

export function SelfPacedPanel({ snap, send }: { snap: PresenterSnapshot; send: Send }) {
  const sp = snap.selfPaced;
  const f = snap.session.features.selfPaced;
  const open = snap.state.phase === 'open';
  const names = new Map(snap.participants.map((p) => [p.id, p.name]));
  const local = (ms: number) => new Date(ms - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  return (
    <section className="grid gap-4 rounded-card border border-line bg-surface p-4" data-testid="selfpaced-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[0.9375rem] font-bold">Self-paced</h2>
          <p className="text-sm text-ink-2">{open ? (f.deadlineAt ? `Open until ${new Date(f.deadlineAt).toLocaleString()}` : 'Open, no deadline') : snap.state.phase === 'lobby' ? 'Not open yet: people can join and wait.' : 'Closed'}</p>
        </div>
        {snap.state.phase !== 'ended' && (open
          ? <Button variant="secondary" size="lg" onClick={() => void send({ cmd: 'selfPaced', op: 'close' })} data-testid="sp-close">Close responses</Button>
          : <Button variant="primary" size="lg" onClick={() => void send({ cmd: 'selfPaced', op: 'open' })} data-testid="sp-open">{snap.state.phase === 'closed' ? 'Reopen' : 'Open for responses'}</Button>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Deadline"><Input type="datetime-local" defaultValue={f.deadlineAt ? local(f.deadlineAt) : ''} onBlur={(e) => void send({ cmd: 'features', patch: { selfPaced: { deadlineAt: e.target.value ? new Date(e.target.value).getTime() : null } } })} /></Field>
        <Field label="Show whether answers were right">
          <Select value={f.reveal} onChange={(e) => void send({ cmd: 'features', patch: { selfPaced: { reveal: e.target.value as typeof f.reveal } } })} aria-label="Reveal answers">
            <option value="immediately">Straight after each answer</option><option value="after-close">After closing</option><option value="never">Never</option>
          </Select>
        </Field>
      </div>
      {sp && (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="grid gap-1.5">
            <h3 className="text-sm font-bold">Activities</h3>
            {snap.outline.filter((o) => o.interactive).map((o, i) => {
              const a = sp.perActivity[i];
              const pct = snap.counts.participants ? Math.round(((a?.answered ?? 0) / snap.counts.participants) * 100) : 0;
              return (
                <div key={o.key} className="grid gap-1 text-sm">
                  <span className="flex justify-between gap-2"><span className="truncate font-semibold">{o.title}</span><span className="tabular shrink-0 text-ink-3">{a?.answered ?? 0}/{snap.counts.participants}</span></span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-ink/8"><span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} /></span>
                </div>
              );
            })}
          </div>
          <div className="grid content-start gap-1.5">
            <h3 className="text-sm font-bold">People</h3>
            <ul className="grid max-h-64 gap-1 overflow-y-auto text-sm" data-testid="sp-people">
              {sp.perParticipant.map((p) => (
                <li key={p.participantId} className="flex justify-between gap-2 rounded-lg px-2 py-1 hover:bg-ink/5"><span className="truncate">{names.get(p.participantId)}</span><span className="tabular shrink-0 text-ink-3">{p.answered}/{sp.interactiveCount}</span></li>
              ))}
              {sp.perParticipant.length === 0 && <li className="text-ink-3">Nobody has joined yet.</li>}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

export function RehearsalBar({ snap, send }: { snap: PresenterSnapshot; send: Send }) {
  const sims = snap.participants.filter((p) => p.simulated).length;
  const [n, setN] = useState(String(sims || 12));
  if (!snap.session.features.rehearsal) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 bg-warn-soft px-4 py-2.5 text-sm text-warn-ink sm:px-6" data-testid="rehearsal-bar" role="status">
      <FlaskConical className="size-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1 font-semibold">Rehearsal: {sims} simulated {sims === 1 ? 'participant answers' : 'participants answer'} automatically. Nothing here counts in your results or reports.</p>
      {snap.state.phase !== 'ended' && (
        <div className="flex items-center gap-2">
          <Select value={n} onChange={(e) => setN(e.target.value)} aria-label="Simulated participants" className="h-8 w-20 text-sm">{[...new Set([0, 4, 8, 12, 20, 30, 45, 60, sims])].sort((a, b) => a - b).map((v) => <option key={v} value={v}>{v}</option>)}</Select>
          <Button size="sm" variant="secondary" onClick={() => void send({ cmd: 'simulate', count: Number(n) })} data-testid="simulate-apply">Apply</Button>
        </div>
      )}
    </div>
  );
}

