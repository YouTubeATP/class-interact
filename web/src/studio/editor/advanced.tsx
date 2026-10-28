import { Film, Loader2, Plus, Trash2, Upload, X } from 'lucide-react';
import { useRef, useState, type PointerEvent } from 'react';
import { toast } from 'sonner';
import { definitions, nextId, parseMediaUrl, type HotspotRegion, type QuizConfig, type Slide, type SlideImage, type SlideMedia } from '@classinteract/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { SwitchRow } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { NumberField, SelectField, errorAt, type FieldIssue } from './fields';

/** Accepted answers for a typed-answer question. */
export function AcceptedAnswersEditor({ answers, onChange, issues }: { answers: string[]; onChange: (a: string[]) => void; issues: FieldIssue[] }) {
  const listErr = errorAt(issues.filter((i) => i.path === 'acceptedAnswers'), 'acceptedAnswers');
  return (
    <div className="grid gap-2" data-testid="accepted-answers">
      <ul className="grid gap-2" aria-label="Accepted answers">
        {answers.map((a, i) => (
          <li key={i} className="flex items-center gap-2">
            <Input value={a} onChange={(e) => onChange(answers.map((x, k) => (k === i ? e.target.value : x)))} aria-label={`Accepted answer ${i + 1}`} placeholder="An answer you accept" aria-invalid={!!errorAt(issues, `acceptedAnswers[${i}]`)} className="font-mono" />
            <Button variant="ghost" size="icon-sm" aria-label={`Remove accepted answer ${i + 1}`} disabled={answers.length <= 1} onClick={() => onChange(answers.filter((_, k) => k !== i))}><X className="size-4" /></Button>
          </li>
        ))}
      </ul>
      {listErr && <p className="text-[0.8125rem] text-bad" role="alert">{listErr}</p>}
      <div><Button variant="secondary" size="sm" disabled={answers.length >= 20} onClick={() => onChange([...answers, ''])}><Plus className="size-3.5" aria-hidden /> Add accepted answer</Button></div>
    </div>
  );
}

/** The correct number, with optional absolute and relative tolerance and a unit. */
export function NumericEditor({ value, onChange, issues }: { value: QuizConfig['numeric']; onChange: (n: QuizConfig['numeric']) => void; issues: FieldIssue[] }) {
  const n = value ?? { value: 0, tolerance: 0, tolerancePercent: 0, unit: '' };
  const set = (p: Partial<typeof n>) => onChange({ ...n, ...p });
  return (
    <div className="grid gap-3 sm:grid-cols-4" data-testid="numeric-editor">
      <NumberField label="Correct answer" value={n.value} onChange={(v) => set({ value: Number.isFinite(v) ? v : 0 })} issues={issues} path="numeric.value" />
      <NumberField label="± allowed" hint="Absolute" value={n.tolerance} onChange={(v) => set({ tolerance: Number.isFinite(v) ? Math.max(0, v) : 0 })} min={0} issues={issues} path="numeric.tolerance" />
      <NumberField label="± %" hint="Relative" value={n.tolerancePercent} onChange={(v) => set({ tolerancePercent: Number.isFinite(v) ? Math.max(0, v) : 0 })} min={0} max={100} issues={issues} path="numeric.tolerancePercent" />
      <Field label="Unit" hint="Optional"><Input value={n.unit} maxLength={20} onChange={(e) => set({ unit: e.target.value })} placeholder="cm" /></Field>
    </div>
  );
}

/**
 * Correct regions on the question image. Drag on the image to draw a region; select one to resize it with the numbers
 * or remove it. Everything is stored as fractions of the image (0–1), never pixels.
 */
export function RegionEditor({ image, regions, onChange, issues }: { image: SlideImage | undefined; regions: HotspotRegion[]; onChange: (r: HotspotRegion[]) => void; issues: FieldIssue[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [ratio, setRatio] = useState(16 / 10);
  const [sel, setSel] = useState<string | null>(regions[0]?.id ?? null);
  const pos = (e: PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const listErr = errorAt(issues, 'regions');
  if (!image?.url) return <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm font-semibold text-warn-ink">Add an image below first: people tap a spot on it.</p>;
  const round = (v: number) => Math.round(v * 1000) / 1000;
  const selected = regions.find((r) => r.id === sel);
  const setRegion = (id: string, p: Partial<HotspotRegion>) => onChange(regions.map((r) => (r.id === id ? { ...r, ...p } : r)));
  return (
    <div className="grid gap-3" data-testid="region-editor">
      <p className="text-[0.8125rem] text-ink-3">Drag on the image to mark a correct area. Taps inside any marked area count as correct.</p>
      <div
        ref={box}
        className="relative w-full cursor-crosshair touch-none select-none overflow-hidden rounded-xl ring-1 ring-line"
        style={{ aspectRatio: String(ratio) }}
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); const p = pos(e); setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }); }}
        onPointerMove={(e) => { if (draft) { const p = pos(e); setDraft({ ...draft, x1: p.x, y1: p.y }); } }}
        onPointerUp={() => {
          if (!draft) return;
          const x = Math.min(draft.x0, draft.x1); const y = Math.min(draft.y0, draft.y1);
          const w = Math.abs(draft.x1 - draft.x0); const h = Math.abs(draft.y1 - draft.y0);
          setDraft(null);
          if (w < 0.01 || h < 0.01 || regions.length >= 10) return;
          const id = nextId(regions.map((r) => r.id), 'r');
          onChange([...regions, { id, shape: 'rect', x: round(x), y: round(y), w: round(w), h: round(h), label: '' }]);
          setSel(id);
        }}
        data-testid="region-canvas"
      >
        <img src={image.url} alt={image.alt} draggable={false} referrerPolicy="no-referrer" className="pointer-events-none absolute inset-0 size-full" onLoad={(e) => setRatio(e.currentTarget.naturalWidth / Math.max(1, e.currentTarget.naturalHeight))} />
        {regions.map((r, i) => (
          <button key={r.id} type="button" aria-label={`Region ${i + 1}${r.label ? `: ${r.label}` : ''}`} onPointerDown={(e) => { e.stopPropagation(); setSel(r.id); }}
            className={cn('absolute border-2 bg-ok/25', r.shape === 'ellipse' ? 'rounded-[50%]' : 'rounded-md', sel === r.id ? 'border-accent ring-2 ring-white' : 'border-ok')}
            style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}>
            <span className="absolute left-1 top-0.5 text-xs font-bold text-white drop-shadow">{i + 1}</span>
          </button>
        ))}
        {draft && <span className="absolute border-2 border-dashed border-accent bg-accent/15" style={{ left: `${Math.min(draft.x0, draft.x1) * 100}%`, top: `${Math.min(draft.y0, draft.y1) * 100}%`, width: `${Math.abs(draft.x1 - draft.x0) * 100}%`, height: `${Math.abs(draft.y1 - draft.y0) * 100}%` }} />}
      </div>
      {listErr && <p className="text-[0.8125rem] text-bad" role="alert">{listErr}</p>}
      {selected && (
        <div className="grid gap-3 rounded-xl border border-line bg-paper/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold">Region {regions.indexOf(selected) + 1}</span>
            <Button variant="ghost" size="sm" onClick={() => { onChange(regions.filter((r) => r.id !== selected.id)); setSel(null); }}><Trash2 className="size-4" aria-hidden /> Remove</Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
            <Field label="Label" hint="Shown after the reveal"><Input value={selected.label} maxLength={80} onChange={(e) => setRegion(selected.id, { label: e.target.value })} /></Field>
            <SelectField label="Shape" value={selected.shape} onChange={(shape) => setRegion(selected.id, { shape })} options={[{ value: 'rect', label: 'Rectangle' }, { value: 'ellipse', label: 'Ellipse' }]} />
          </div>
          <div className="grid grid-cols-4 gap-2">
            {(['x', 'y', 'w', 'h'] as const).map((k) => (
              <NumberField key={k} label={{ x: 'Left %', y: 'Top %', w: 'Width %', h: 'Height %' }[k]} value={Math.round(selected[k] * 1000) / 10} min={0} max={100} onChange={(v) => Number.isFinite(v) && setRegion(selected.id, { [k]: round(Math.min(1, Math.max(k === 'w' || k === 'h' ? 0.005 : 0, v / 100))) })} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Video or audio: a YouTube / Vimeo link, an https file, or an upload. */
export function MediaField({ media, onChange, issues }: { media: SlideMedia | undefined; onChange: (m: SlideMedia | undefined) => void; issues: FieldIssue[] }) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const err = errorAt(issues, 'media.url') ?? errorAt(issues, 'media');
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const { url } = await api.uploadMedia(f);
      onChange({ url, kind: f.type.startsWith('audio') ? 'audio' : 'video', title: media?.title ?? '', phones: media?.phones ?? false });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  };
  const input = <input ref={file} type="file" accept="video/mp4,video/webm,audio/mpeg,audio/mp4,audio/x-m4a,audio/ogg,audio/wav,audio/webm" className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} data-testid="media-upload" />;
  if (!media) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => onChange({ url: '', kind: 'video', title: '', phones: false })} data-testid="media-add"><Film className="size-4" aria-hidden /> Add video or audio</Button>
        {input}
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => file.current?.click()}>{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />} Upload a file</Button>
      </div>
    );
  }
  const src = parseMediaUrl(media.url);
  return (
    <div className="grid gap-3 rounded-2xl border border-line bg-paper/60 p-3.5">
      <Field label="Link" error={err} hint="YouTube, Vimeo, or an https link to an MP4, WebM, MP3, M4A, OGG or WAV file. Uploads up to 25 MB.">
        <Input value={media.url} onChange={(e) => onChange({ ...media, url: e.target.value })} placeholder="https://www.youtube.com/watch?v=…" aria-invalid={!!err} data-testid="media-url" />
      </Field>
      {src && <p className="text-xs font-semibold text-ok">Recognised: {src.provider === 'file' ? 'media file' : src.provider === 'youtube' ? 'YouTube (privacy-enhanced embed)' : 'Vimeo'}</p>}
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem_7rem]">
        <Field label="Title" hint="Optional"><Input value={media.title} maxLength={160} onChange={(e) => onChange({ ...media, title: e.target.value })} /></Field>
        <SelectField label="Kind" value={media.kind} onChange={(kind) => onChange({ ...media, kind })} options={[{ value: 'video', label: 'Video' }, { value: 'audio', label: 'Audio' }]} />
        <NumberField label="Start at (s)" value={media.start ?? NaN} min={0} onChange={(v) => onChange({ ...media, start: Number.isFinite(v) && v > 0 ? Math.round(v) : undefined })} />
      </div>
      <SwitchRow label="Also play on participants’ phones" hint="Off: it plays on the main screen and phones say “Watch the main screen”." checked={media.phones} onChange={(phones) => onChange({ ...media, phones })} />
      <div className="flex gap-2">
        {input}
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => file.current?.click()}>{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />} Upload instead</Button>
        <Button variant="ghost" size="sm" onClick={() => onChange(undefined)}><Trash2 className="size-4" aria-hidden /> Remove</Button>
      </div>
    </div>
  );
}

/** Optional concept tags (comma-separated). */
export function ConceptsField({ concepts, onChange }: { concepts: string[] | undefined; onChange: (c: string[] | undefined) => void }) {
  const [text, setText] = useState((concepts ?? []).join(', '));
  return (
    <Field label="Concepts" hint="Optional. Separate with commas, for example: loops, boundary conditions. The results page shows how the class did on each.">
      <Input value={text} data-testid="concepts-input" onChange={(e) => setText(e.target.value)} onBlur={() => {
        const list = [...new Set(text.split(',').map((x) => x.trim()).filter(Boolean))].slice(0, 8).map((x) => x.slice(0, 60));
        onChange(list.length ? list : undefined);
        setText(list.join(', '));
      }} placeholder="loops, array indexing" />
    </Field>
  );
}

/** Optional: for each wrong option, the misunderstanding that usually leads there. */
export function MisconceptionsEditor({ c, onChange }: { c: QuizConfig; onChange: (options: QuizConfig['options']) => void }) {
  const correct = new Set(c.kind === 'multiple' ? c.correctOptionIds : [c.correctOptionId]);
  const wrong = c.options.filter((o) => !correct.has(o.id));
  if (!wrong.length) return null;
  return (
    <div className="grid gap-2" data-testid="misconceptions">
      {wrong.map((o) => (
        <Field key={o.id} label={`If someone picks “${o.text}”`}>
          <Input value={o.misconception ?? ''} maxLength={120} placeholder="They probably think… (optional)" onChange={(e) => onChange(c.options.map((x) => (x.id === o.id ? { ...x, misconception: e.target.value || undefined } : x)))} />
        </Field>
      ))}
    </div>
  );
}

const slideTitle = (s: Slide, i: number) => `${i + 1}. ${(definitions[s.type] as any).titleOf(s).slice(0, 60)}`;

/** "If fewer than N% get it right, go to …; otherwise go to …" */
export function BranchField({ slide, slides, onChange, issues }: { slide: Slide & { type: 'quiz' }; slides: Slide[]; onChange: (b: QuizConfig['branch']) => void; issues: FieldIssue[] }) {
  const b = slide.branch;
  const others = slides.map((s, i) => ({ s, i })).filter(({ s }) => s.id !== slide.id);
  const options = [{ value: '', label: 'Carry on to the next slide' }, ...others.map(({ s, i }) => ({ value: s.id, label: slideTitle(s, i) }))];
  return (
    <div className="grid gap-3" data-testid="branch-editor">
      <SwitchRow label="Choose the next slide from the answers" hint="Live, the class’s result decides (you can always override). Self-paced, each person’s own answer does." checked={!!b} onChange={(on) => onChange(on ? { threshold: 60, below: undefined, atOrAbove: undefined } : undefined)} />
      {b && (
        <div className="grid gap-3 rounded-2xl border border-line bg-paper/60 p-3.5">
          <NumberField label="Threshold (% fully correct)" value={b.threshold} min={1} max={100} onChange={(v) => onChange({ ...b, threshold: Number.isFinite(v) ? Math.round(Math.min(100, Math.max(1, v))) : 60 })} issues={issues} path="branch.threshold" />
          <SelectField label={`Below ${b.threshold}%, go to`} value={b.below ?? ''} onChange={(v) => onChange({ ...b, below: v || undefined })} options={options} />
          <SelectField label={`${b.threshold}% or more, go to`} value={b.atOrAbove ?? ''} onChange={(v) => onChange({ ...b, atOrAbove: v || undefined })} options={options} />
          {errorAt(issues, 'branch') && <p className="text-[0.8125rem] text-bad" role="alert">{errorAt(issues, 'branch')}</p>}
        </div>
      )}
    </div>
  );
}

/** Pair a rating with quiz questions, to compare confidence with correctness person by person. */
export function ConfidenceForField({ value, slides, onChange }: { value: string[] | undefined; slides: Slide[]; onChange: (v: string[] | undefined) => void }) {
  const quizzes = slides.map((s, i) => ({ s, i })).filter(({ s }) => s.type === 'quiz');
  const set = new Set(value ?? []);
  if (!quizzes.length) return <p className="text-sm text-ink-3">Add quiz questions to compare confidence with correctness.</p>;
  return (
    <fieldset className="grid gap-1.5" data-testid="confidence-for">
      <legend className="mb-1 text-[0.8125rem] text-ink-3">Optional. The results page compares each person’s rating with how they did on the questions you tick.</legend>
      {quizzes.map(({ s, i }) => (
        <label key={s.id} className="flex items-center gap-2.5 rounded-lg px-1 py-1 text-sm font-medium hover:bg-ink/5">
          <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={set.has(s.id)} onChange={(e) => {
            const next = new Set(set);
            if (e.target.checked) next.add(s.id); else next.delete(s.id);
            onChange(next.size ? [...next] : undefined);
          }} />
          {slideTitle(s, i)}
        </label>
      ))}
    </fieldset>
  );
}
