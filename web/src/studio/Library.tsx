import { motion } from 'framer-motion';
import { BarChart3, Copy, Download, FileUp, MoreHorizontal, Pencil, Play, Plus, Radio, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { PresentationSummary, SessionMode, SessionSummary } from '@classinteract/shared';
import { typeMeta } from '@/activities/meta';
import { Notice, Spinner } from '@/components/Status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/dropdown';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, api } from '@/lib/api';
import { formatDateTime, plural, timeAgo } from '@/lib/format';
import { prettyPin } from '@/lib/joinUrl';
import { ConfirmDialog, PromptDialog } from './dialogs';
import { ImportDialog } from './ImportDialog';
import { StartSessionDialog } from './StartSessionDialog';
import { StudioHeader } from './StudioRoutes';

type Dialog =
  | { kind: 'new' }
  | { kind: 'import' }
  | { kind: 'start'; p: PresentationSummary }
  | { kind: 'rename'; p: PresentationSummary }
  | { kind: 'delete'; p: PresentationSummary }
  | { kind: 'delete-session'; s: SessionSummary }
  | null;

function DeckCard({ p, i, onAction }: { p: PresentationSummary; i: number; onAction: (a: 'start' | 'rename' | 'delete' | 'duplicate' | 'export') => void }) {
  return (
    <motion.article layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04, type: 'spring', stiffness: 260, damping: 26 }} className="group grid overflow-hidden rounded-card border border-line bg-surface transition-colors hover:border-line-2" data-testid="deck-card">
      <div data-palette={p.theme.palette} className="relative h-24 overflow-hidden bg-accent-soft">
        <div aria-hidden className="absolute -right-6 -top-10 size-36 rounded-full bg-accent/15" />
        <div className="absolute inset-x-4 bottom-3 flex flex-wrap gap-1.5">
          {p.types.length === 0 && <span className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-semibold text-ink-2">Empty</span>}
          {p.types.map((t) => {
            const m = typeMeta[t];
            return <span key={t} data-tone={t} title={m.label} className="grid size-8 place-items-center rounded-full bg-tone text-tone-ink shadow-sm"><m.icon className="size-4" aria-label={m.label} /></span>;
          })}
        </div>
      </div>
      <div className="grid gap-3 p-4">
        <div className="grid gap-1">
          <h3 className="line-clamp-2 text-[1.0625rem] font-bold leading-snug tracking-tight">{p.title}</h3>
          <p className="line-clamp-3 min-h-[4.125em] text-[0.8125rem] leading-snug text-ink-2" title={p.description || undefined}>{p.description || 'No description yet.'}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge>{plural(p.slideCount, 'slide')}</Badge>
          <Badge variant="accent">{p.interactiveCount} interactive</Badge>
          {p.sessionCount > 0 && <Badge>{plural(p.sessionCount, 'session')} run</Badge>}
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Button variant="primary" size="sm" className="flex-1" onClick={() => onAction('start')} disabled={p.slideCount === 0} data-testid="start-session"><Play className="size-3.5" aria-hidden /> Start session</Button>
          <Button asChild variant="secondary" size="sm"><Link to={`/studio/${p.id}`} data-testid="edit-presentation"><Pencil className="size-3.5" aria-hidden /> Edit</Link></Button>
          <Menu>
            <MenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`More actions for ${p.title}`}><MoreHorizontal className="size-4" /></Button></MenuTrigger>
            <MenuContent>
              <MenuItem icon={<Pencil className="size-4" />} onSelect={() => onAction('rename')}>Rename</MenuItem>
              <MenuItem icon={<Copy className="size-4" />} onSelect={() => onAction('duplicate')}>Duplicate</MenuItem>
              <MenuItem icon={<Download className="size-4" />} onSelect={() => onAction('export')}>Export JSON</MenuItem>
              <MenuSeparator />
              <MenuItem danger icon={<Trash2 className="size-4" />} onSelect={() => onAction('delete')}>Delete</MenuItem>
            </MenuContent>
          </Menu>
        </div>
        <p className="text-xs text-ink-3">Updated {timeAgo(p.updatedAt)}</p>
      </div>
    </motion.article>
  );
}

export default function LibraryPage() {
  const navigate = useNavigate();
  const [decks, setDecks] = useState<PresentationSummary[] | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [d, s] = await Promise.all([api.presentations.list(), api.sessions.list()]);
      setDecks(d);
      setSessions(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your presentations.');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Something went wrong.');
  const live = sessions?.filter((s) => s.status === 'live') ?? [];
  const past = sessions?.filter((s) => s.status === 'ended') ?? [];

  const action = async (p: PresentationSummary, a: 'start' | 'rename' | 'delete' | 'duplicate' | 'export') => {
    if (a === 'start' || a === 'rename' || a === 'delete') return setDialog({ kind: a, p });
    try {
      if (a === 'duplicate') { await api.presentations.duplicate(p.id); toast.success('Duplicated'); await load(); }
      else await api.presentations.export(p.id);
    } catch (e) { fail(e); }
  };

  const start = async (p: PresentationSummary, o: { mode: SessionMode; collectNames: boolean }) => {
    try {
      const s = await api.presentations.startSession(p.id, o);
      navigate(`/session/${s.id}`);
    } catch (e) { fail(e); }
  };

  return (
    <div className="min-h-dvh bg-paper">
      <StudioHeader />
      <main className="mx-auto grid max-w-7xl gap-10 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid gap-1.5">
            <h1 className="display text-[2.4rem]">Presentations</h1>
            <p className="max-w-xl text-ink-2">Build once, then run it live as a full presentation or as interactive activities alongside your own slides.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setDialog({ kind: 'import' })} data-testid="import-open"><FileUp className="size-4" aria-hidden /> Import JSON</Button>
            <Button variant="primary" onClick={() => setDialog({ kind: 'new' })} data-testid="new-presentation"><Plus className="size-4" aria-hidden /> New presentation</Button>
          </div>
        </div>

        {live.length > 0 && (
          <section aria-label="Live sessions" className="grid gap-3">
            <h2 className="flex items-center gap-2 text-lg"><span className="relative flex size-2.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-60" /><span className="relative inline-flex size-2.5 rounded-full bg-ok" /></span> Live now</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {live.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 rounded-card border border-ok/30 bg-surface p-4" data-testid="live-session">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{s.title}</p>
                    <p className="text-sm text-ink-2">Code <span className="tabular font-bold text-ink">{s.pin ? prettyPin(s.pin) : ''}</span> · {plural(s.participantCount, 'participant')} · {s.mode === 'companion' ? 'Companion' : 'Standalone'}</p>
                  </div>
                  <Button asChild variant="primary" size="sm"><Link to={`/session/${s.id}`}><Radio className="size-3.5" aria-hidden /> Open controls</Link></Button>
                </div>
              ))}
            </div>
          </section>
        )}

        <section aria-label="Your presentations">
          {error ? (
            <Notice title="Could not load presentations" action={<Button onClick={() => void load()}>Try again</Button>}>{error}</Notice>
          ) : decks === null ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-72" />)}</div>
          ) : decks.length === 0 ? (
            <Notice icon={<Plus className="size-7" />} title="Create your first presentation" action={<div className="flex gap-2"><Button variant="primary" onClick={() => setDialog({ kind: 'new' })}>New presentation</Button><Button onClick={() => setDialog({ kind: 'import' })}>Import JSON</Button></div>}>Add slides, quizzes, polls and word clouds, or import a presentation someone generated as JSON.</Notice>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {decks.map((p, i) => <DeckCard key={p.id} p={p} i={i} onAction={(a) => void action(p, a)} />)}
            </div>
          )}
        </section>

        <section aria-label="Past sessions" className="grid gap-3">
          <h2 className="text-xl">Past sessions</h2>
          {sessions === null ? (
            <Spinner />
          ) : past.length === 0 ? (
            <p className="rounded-card border border-dashed border-line-2 px-5 py-8 text-center text-ink-3">Finished sessions show up here with their results and CSV export.</p>
          ) : (
            <div className="overflow-x-auto rounded-card border border-line bg-surface">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="border-b border-line text-ink-3"><tr><th className="px-4 py-3 font-semibold">Session</th><th className="px-4 py-3 font-semibold">Date</th><th className="px-4 py-3 font-semibold">Participants</th><th className="px-4 py-3 font-semibold">Responses</th><th className="px-4 py-3 text-right font-semibold">Actions</th></tr></thead>
                <tbody>
                  {past.map((s) => (
                    <tr key={s.id} className="border-b border-line last:border-0" data-testid="past-session">
                      <td className="px-4 py-3"><span className="font-semibold">{s.title}</span> <Badge className="ml-1">{s.mode === 'companion' ? 'Companion' : 'Standalone'}</Badge></td>
                      <td className="px-4 py-3 text-ink-2">{formatDateTime(s.createdAt)}</td>
                      <td className="tabular px-4 py-3">{s.participantCount}</td>
                      <td className="tabular px-4 py-3">{s.responseCount}</td>
                      <td className="px-4 py-3"><div className="flex justify-end gap-1.5">
                        <Button asChild variant="secondary" size="sm"><Link to={`/results/${s.id}`}><BarChart3 className="size-3.5" aria-hidden /> Results</Link></Button>
                        <Button variant="ghost" size="sm" onClick={() => void api.sessions.exportCsv(s.id).catch(fail)}><Download className="size-3.5" aria-hidden /> CSV</Button>
                        <Button variant="ghost" size="icon-sm" aria-label={`Delete results for ${s.title}`} onClick={() => setDialog({ kind: 'delete-session', s })}><Trash2 className="size-4" /></Button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      <PromptDialog open={dialog?.kind === 'new'} onOpenChange={(o) => !o && setDialog(null)} title="New presentation" label="Title" confirm="Create" initial="" onSubmit={async (title) => { const r = await api.presentations.create(title); navigate(`/studio/${r.id}`); }} />
      <ImportDialog open={dialog?.kind === 'import'} onOpenChange={(o) => !o && setDialog(null)} onImported={(id, warnings) => { toast.success('Presentation imported'); warnings.forEach((w) => toast.message(w)); navigate(`/studio/${id}`); }} />
      <StartSessionDialog open={dialog?.kind === 'start'} onOpenChange={(o) => !o && setDialog(null)} title={dialog?.kind === 'start' ? dialog.p.title : ''} onStart={(o) => start((dialog as { p: PresentationSummary }).p, o)} />
      <PromptDialog open={dialog?.kind === 'rename'} onOpenChange={(o) => !o && setDialog(null)} title="Rename presentation" label="Title" confirm="Save" initial={dialog?.kind === 'rename' ? dialog.p.title : ''} onSubmit={async (title) => {
        const p = (dialog as { p: PresentationSummary }).p;
        const { doc } = await api.presentations.get(p.id);
        await api.presentations.save(p.id, { ...doc, title });
        setDialog(null);
        await load();
      }} />
      <ConfirmDialog open={dialog?.kind === 'delete'} onOpenChange={(o) => !o && setDialog(null)} title="Delete this presentation?" description={dialog?.kind === 'delete' ? `“${dialog.p.title}” will be removed. Results from sessions you already ran are kept.` : ''} confirm="Delete presentation" onConfirm={async () => { try { await api.presentations.remove((dialog as { p: PresentationSummary }).p.id); setDialog(null); await load(); } catch (e) { fail(e instanceof ApiError ? e : e); } }} />
      <ConfirmDialog open={dialog?.kind === 'delete-session'} onOpenChange={(o) => !o && setDialog(null)} title="Delete these results?" description="The session's responses and results will be permanently removed. Export the CSV first if you need them." confirm="Delete results" onConfirm={async () => { try { await api.sessions.remove((dialog as { s: SessionSummary }).s.id); setDialog(null); await load(); } catch (e) { fail(e); } }} />
    </div>
  );
}
