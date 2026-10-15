import { AlertTriangle, ArrowLeft, Check, Cloud, Download, Eye, Loader2, Play } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { defaultConfig, nextId, parsePresentationDoc, type PresentationDoc, type SessionMode, type Slide, type SlideType } from '@classinteract/shared';
import { typeMeta } from '@/activities/meta';
import { Notice, Spinner } from '@/components/Status';
import { Button } from '@/components/ui/button';
import { DialogContent } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { PreviewPane } from '@/preview/PreviewPane';
import { SlideForm, SlideIdField } from './editor/forms';
import { JsonPanel } from './editor/JsonPanel';
import { PresentationSettings } from './editor/PresentationSettings';
import { SlideList } from './editor/SlideList';
import type { FieldIssue } from './editor/fields';
import { StartSessionDialog } from './StartSessionDialog';
import { StudioHeader } from './StudioRoutes';

type SaveState = 'saved' | 'dirty' | 'saving' | 'invalid' | 'error';

function SaveBadge({ state, problems, onRetry }: { state: SaveState; problems: number; onRetry: () => void }) {
  const map = {
    saved: { icon: <Check className="size-3.5" aria-hidden />, text: 'Saved', cls: 'bg-ok-soft text-ok' },
    dirty: { icon: <Cloud className="size-3.5" aria-hidden />, text: 'Unsaved changes', cls: 'bg-ink/6 text-ink-2' },
    saving: { icon: <Loader2 className="size-3.5 animate-spin" aria-hidden />, text: 'Saving…', cls: 'bg-ink/6 text-ink-2' },
    invalid: { icon: <AlertTriangle className="size-3.5" aria-hidden />, text: `Fix ${problems} ${problems === 1 ? 'problem' : 'problems'} to save`, cls: 'bg-warn-soft text-warn' },
    error: { icon: <AlertTriangle className="size-3.5" aria-hidden />, text: 'Could not save', cls: 'bg-bad-soft text-bad' },
  }[state];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold', map.cls)} role="status" data-testid="save-state" data-state={state}>
      {map.icon} {map.text}
      {state === 'error' && <button className="underline" onClick={onRetry}>Retry</button>}
    </span>
  );
}

export default function EditorPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<PresentationDoc | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>('settings');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [tab, setTab] = useState<'edit' | 'json'>('edit');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [retry, setRetry] = useState(0);
  const lastSaved = useRef('');
  const docRef = useRef<PresentationDoc | null>(null);
  docRef.current = doc;

  useEffect(() => {
    let live = true;
    api.presentations.get(id).then((r) => {
      if (!live) return;
      lastSaved.current = JSON.stringify(r.doc);
      setDoc(r.doc);
      setSelected(r.doc.slides[0]?.id ?? 'settings');
    }).catch((e) => live && setLoadError(e instanceof Error ? e.message : 'Could not open this presentation.'));
    return () => { live = false; };
  }, [id]);

  // One validation pass over the canonical model drives problems, saving and the save badge.
  const check = useMemo(() => (doc ? parsePresentationDoc(doc) : null), [doc]);
  const errors = check && !check.ok ? check.errors : [];

  const issuesBySlide = useMemo(() => {
    const m = new Map<number, FieldIssue[]>();
    for (const e of errors) {
      if (e.slide === null) continue;
      const rel = e.path.replace(/^slides\[\d+\]\.?/, '');
      m.set(e.slide, [...(m.get(e.slide) ?? []), { path: rel, message: e.message }]);
    }
    return m;
  }, [errors]);
  const docIssues: FieldIssue[] = errors.filter((e) => e.slide === null).map((e) => ({ path: e.path, message: e.message }));

  // Autosave: only ever sends a document that passed validation.
  useEffect(() => {
    if (!doc || !check) return;
    const sig = JSON.stringify(doc);
    if (sig === lastSaved.current) { setSaveState('saved'); return; }
    if (!check.ok) { setSaveState('invalid'); return; }
    setSaveState('dirty');
    const t = setTimeout(async () => {
      setSaveState('saving');
      try {
        await api.presentations.save(id, check.doc);
        lastSaved.current = sig;
        setSaveState(JSON.stringify(docRef.current) === sig ? 'saved' : 'dirty');
      } catch (e) {
        setSaveState('error');
        toast.error(e instanceof Error ? e.message : 'Could not save your changes.');
      }
    }, 650);
    return () => clearTimeout(t);
  }, [doc, check, id, retry]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (saveState !== 'saved') { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saveState]);

  const update = useCallback((fn: (d: PresentationDoc) => PresentationDoc) => setDoc((d) => (d ? fn(d) : d)), []);
  const patchSlide = (slideId: string, p: Partial<Slide>) => update((d) => ({ ...d, slides: d.slides.map((s) => (s.id === slideId ? ({ ...s, ...p } as Slide) : s)) }));

  const addSlide = (type: SlideType) => {
    if (!doc) return;
    const slideId = nextId(doc.slides.map((s) => s.id), `${type}-`);
    const slide = { id: slideId, type, ...defaultConfig(type) } as Slide;
    const at = Math.max(0, doc.slides.findIndex((s) => s.id === selected) + 1) || doc.slides.length;
    update((d) => ({ ...d, slides: [...d.slides.slice(0, at), slide, ...d.slides.slice(at)] }));
    setSelected(slideId);
    setTab('edit');
  };

  const duplicate = (slideId: string) => {
    if (!doc) return;
    const i = doc.slides.findIndex((s) => s.id === slideId);
    const copy = structuredClone(doc.slides[i]) as Slide;
    copy.id = nextId(doc.slides.map((s) => s.id), `${copy.type}-`);
    update((d) => ({ ...d, slides: [...d.slides.slice(0, i + 1), copy, ...d.slides.slice(i + 1)] }));
    setSelected(copy.id);
  };

  const remove = (slideId: string) => {
    if (!doc) return;
    const i = doc.slides.findIndex((s) => s.id === slideId);
    const removed = doc.slides[i];
    update((d) => ({ ...d, slides: d.slides.filter((s) => s.id !== slideId) }));
    if (selected === slideId) setSelected(doc.slides[i + 1]?.id ?? doc.slides[i - 1]?.id ?? 'settings');
    toast('Slide deleted', { action: { label: 'Undo', onClick: () => { update((d) => ({ ...d, slides: [...d.slides.slice(0, i), removed, ...d.slides.slice(i)] })); setSelected(removed.id); } } });
  };

  if (loadError) return <div className="grid min-h-dvh place-items-center"><Notice title="Could not open this presentation" action={<Button asChild variant="primary"><Link to="/studio">Back to presentations</Link></Button>}>{loadError}</Notice></div>;
  if (!doc) return <div className="grid min-h-dvh place-items-center"><Spinner className="size-7" /></div>;

  const index = doc.slides.findIndex((s) => s.id === selected);
  const slide = index >= 0 ? doc.slides[index] : null;
  const previewIndex = Math.max(0, index);
  const meta = slide ? typeMeta[slide.type] : null;

  const start = async (o: { mode: SessionMode; collectNames: boolean }) => {
    try {
      const s = await api.presentations.startSession(id, o);
      navigate(`/session/${s.id}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not start the session.'); }
  };

  return (
    <div className="flex h-dvh flex-col bg-paper">
      <StudioHeader />
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-2.5 sm:px-6">
        <Button asChild variant="ghost" size="sm"><Link to="/studio"><ArrowLeft className="size-4" aria-hidden /> Presentations</Link></Button>
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold tracking-tight" data-testid="editor-title">{doc.title || 'Untitled'}</h1>
        <SaveBadge state={saveState} problems={errors.length} onRetry={() => setRetry((n) => n + 1)} />
        <Button variant="secondary" onClick={() => setPreviewOpen(true)} data-testid="preview-open"><Eye className="size-4" aria-hidden /> Preview</Button>
        <Button variant="secondary" onClick={() => void api.presentations.export(id)} disabled={saveState !== 'saved'}><Download className="size-4" aria-hidden /> Export JSON</Button>
        <Button variant="primary" disabled={doc.slides.length === 0 || saveState !== 'saved'} onClick={() => setStartOpen(true)} data-testid="editor-start"><Play className="size-4" aria-hidden /> Start session</Button>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[17.5rem_minmax(0,1fr)] xl:grid-cols-[17.5rem_minmax(0,1fr)_minmax(24rem,31rem)]">
        <aside className="overflow-y-auto border-r border-line p-4" aria-label="Slides">
          <SlideList
            slides={doc.slides}
            selected={selected}
            issueIndexes={new Set(issuesBySlide.keys())}
            onSelect={(s) => { setSelected(s); setTab('edit'); }}
            onReorder={(slides) => update((d) => ({ ...d, slides }))}
            onAdd={addSlide}
            onDuplicate={duplicate}
            onDelete={remove}
          />
        </aside>

        <main className="min-h-0 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-5 py-6">
            <Tabs value={tab} onValueChange={(v) => setTab(v as 'edit' | 'json')}>
              <div className="mb-6 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  {tab === 'edit' && (
                    <div className="flex items-center gap-2.5">
                      {meta && slide && <span data-tone={slide.type} className="grid size-9 place-items-center rounded-xl bg-tone text-tone-ink"><meta.icon className="size-[1.1rem]" aria-hidden /></span>}
                      <h2 className="truncate text-xl">{slide ? `${meta!.label} ${index + 1}` : 'Presentation settings'}</h2>
                    </div>
                  )}
                </div>
                <TabsList>
                  <TabsTrigger value="edit" data-testid="tab-edit">Editor</TabsTrigger>
                  <TabsTrigger value="json" data-testid="tab-json">JSON</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="edit" className="outline-none">
                {slide ? (
                  <div className="grid gap-6">
                    {(issuesBySlide.get(index)?.length ?? 0) > 0 && (
                      <div className="flex items-start gap-2.5 rounded-2xl bg-warn-soft px-4 py-3 text-sm font-semibold text-warn" role="alert" data-testid="slide-problems">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                        <ul className="grid gap-0.5">{issuesBySlide.get(index)!.slice(0, 4).map((i, k) => <li key={k}>{i.message}</li>)}</ul>
                      </div>
                    )}
                    <SlideForm key={slide.id} slide={slide} patch={(p) => patchSlide(slide.id, p)} issues={issuesBySlide.get(index) ?? []} />
                    <details className="rounded-2xl border border-line bg-surface px-4 py-3">
                      <summary className="cursor-pointer text-sm font-semibold text-ink-2">Advanced</summary>
                      <div className="pt-3">
                        <SlideIdField slide={slide} taken={doc.slides.filter((s) => s !== slide).map((s) => s.id)} onRename={(newId) => { patchSlide(slide.id, { id: newId } as Partial<Slide>); setSelected(newId); }} />
                      </div>
                    </details>
                  </div>
                ) : (
                  <PresentationSettings doc={doc} onChange={(p) => update((d) => ({ ...d, ...p }))} issues={docIssues} />
                )}
              </TabsContent>
              <TabsContent value="json" className="outline-none"><JsonPanel doc={doc} onApply={(d) => { setDoc(d); if (!d.slides.some((s) => s.id === selected)) setSelected(d.slides[0]?.id ?? 'settings'); }} /></TabsContent>
            </Tabs>
          </div>
        </main>

        <aside className="hidden overflow-y-auto border-l border-line bg-surface/60 p-4 xl:block" aria-label="Live preview">
          <h2 className="mb-3 text-[0.8125rem] font-bold text-ink-2">Live preview</h2>
          <PreviewPane doc={doc} index={previewIndex} onIndexChange={(i) => doc.slides[i] && setSelected(doc.slides[i].id)} />
        </aside>
      </div>

      <DialogContent open={previewOpen} onOpenChange={setPreviewOpen} wide title="Preview" description="Step through the presentation exactly as the room and phones will see it.">
        <div className="max-h-[75vh] overflow-y-auto pr-1"><PreviewPane doc={doc} index={previewIndex} large onIndexChange={(i) => doc.slides[i] && setSelected(doc.slides[i].id)} /></div>
      </DialogContent>
      <StartSessionDialog open={startOpen} onOpenChange={setStartOpen} title={doc.title} onStart={start} />
    </div>
  );
}
