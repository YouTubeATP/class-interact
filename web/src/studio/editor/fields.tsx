import { ArrowDown, ArrowUp, Check, ImagePlus, Loader2, Plus, Trash2, X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { nextId, type SlideImage } from '@classinteract/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input, Select, Textarea } from '@/components/ui/input';
import { SwitchRow } from '@/components/ui/switch';
import { SafeImage } from '@/components/SafeImage';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { toast } from 'sonner';

/** Validation problems for one slide, with paths relative to the slide (e.g. `options[1].text`). */
export interface FieldIssue {
  path: string;
  message: string;
}

export function errorAt(issues: FieldIssue[], path: string): string | null {
  const exact = issues.find((i) => i.path === path);
  if (exact) return exact.message;
  const nested = issues.find((i) => i.path.startsWith(`${path}.`) || i.path.startsWith(`${path}[`));
  return nested ? nested.message : null;
}

export function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <section className="grid gap-3.5 border-t border-line pt-5 first:border-t-0 first:pt-0">
      <div className="grid gap-0.5">
        <h3 className="text-[0.9375rem] font-bold tracking-tight">{title}</h3>
        {hint && <p className="text-[0.8125rem] text-ink-3">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function TextField({ label, value, onChange, issues, path, multiline, rows, hint, maxLength, placeholder, testId }: {
  label: string; value: string; onChange: (v: string) => void; issues: FieldIssue[]; path: string; multiline?: boolean; rows?: number; hint?: string; maxLength?: number; placeholder?: string; testId?: string;
}) {
  const err = errorAt(issues, path);
  const id = `f-${path}-${label}`.replace(/\W+/g, '-');
  return (
    <Field label={label} error={err} hint={hint} htmlFor={id}>
      {multiline ? (
        <Textarea id={id} value={value} rows={rows ?? 3} maxLength={maxLength} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-invalid={!!err} data-testid={testId} />
      ) : (
        <Input id={id} value={value} maxLength={maxLength} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-invalid={!!err} data-testid={testId} />
      )}
    </Field>
  );
}

export function NumberField({ label, value, onChange, min, max, hint, issues = [], path = '', suffix }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; hint?: string; issues?: FieldIssue[]; path?: string; suffix?: string;
}) {
  const err = path ? errorAt(issues, path) : null;
  return (
    <Field label={label} hint={hint} error={err}>
      <div className="relative">
        <Input type="number" inputMode="numeric" min={min} max={max} value={Number.isFinite(value) ? value : ''} onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))} aria-invalid={!!err} className={suffix ? 'pr-12' : ''} />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-3">{suffix}</span>}
      </div>
    </Field>
  );
}

export function SelectField<T extends string>({ label, value, onChange, options, hint }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <Select value={value} aria-label={label} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    </Field>
  );
}

/** Optional countdown: a switch and a number of seconds. */
export function TimerField({ value, onChange, issues, label = 'Countdown timer', hint = 'Responses close automatically when time runs out.' }: { value: number | null; onChange: (v: number | null) => void; issues: FieldIssue[]; label?: string; hint?: string }) {
  const err = errorAt(issues, 'timeLimitSec');
  return (
    <div className="grid gap-2">
      <SwitchRow label={label} hint={hint} checked={value !== null} onChange={(on) => onChange(on ? 20 : null)} />
      {value !== null && <NumberField label="Seconds" value={value} onChange={(v) => onChange(v)} min={5} max={900} suffix="sec" issues={issues} path="timeLimitSec" />}
      {err && value === null && <p className="text-[0.8125rem] text-bad">{err}</p>}
    </div>
  );
}

/** Answer options. When `correctId` is provided, each row has a "correct answer" selector (quiz). */
export function OptionsEditor({ options, onChange, issues, path = 'options', min, max, correctId, onCorrect, correctIds, onToggleCorrect }: {
  options: { id: string; text: string }[]; onChange: (o: { id: string; text: string }[]) => void; issues: FieldIssue[]; path?: string; min: number; max: number; correctId?: string; onCorrect?: (id: string) => void;
  /** Several correct answers: tick boxes instead of one radio. */
  correctIds?: string[]; onToggleCorrect?: (id: string) => void;
}) {
  const multi = correctIds !== undefined;
  const set = (i: number, text: string) => onChange(options.map((o, k) => (k === i ? { ...o, text } : o)));
  const remove = (i: number) => {
    const removed = options[i];
    const next = options.filter((_, k) => k !== i);
    onChange(next);
    if (onCorrect && removed.id === correctId && next[0]) onCorrect(next[0].id);
    if (multi && correctIds!.includes(removed.id)) onToggleCorrect?.(removed.id);
  };
  const add = () => onChange([...options, { id: nextId(options.map((o) => o.id), 'o'), text: `Option ${options.length + 1}` }]);
  const listErr = errorAt(issues.filter((i) => i.path === path), path);
  return (
    <div className="grid gap-2.5">
      <ul className="grid gap-2" aria-label="Options">
        {options.map((o, i) => {
          const err = errorAt(issues, `${path}[${i}]`);
          return (
            <li key={o.id} className="grid gap-1">
              <div className="flex items-center gap-2">
                {multi && (
                  <button type="button" role="checkbox" aria-checked={correctIds!.includes(o.id)} aria-label={`Mark option ${i + 1} as a correct answer`} title="Correct answer" onClick={() => onToggleCorrect?.(o.id)}
                    className={cn('grid size-8 shrink-0 place-items-center rounded-lg border-2 transition-colors', correctIds!.includes(o.id) ? 'border-ok bg-ok text-white' : 'border-line-2 text-transparent hover:border-ok hover:text-ok/50')}>
                    <Check className="size-4" strokeWidth={3} />
                  </button>
                )}
                {correctId !== undefined && (
                  <button type="button" role="radio" aria-checked={correctId === o.id} aria-label={`Mark option ${i + 1} as the correct answer`} title="Correct answer" onClick={() => onCorrect?.(o.id)}
                    className={cn('grid size-8 shrink-0 place-items-center rounded-full border-2 transition-colors', correctId === o.id ? 'border-ok bg-ok text-white' : 'border-line-2 text-transparent hover:border-ok hover:text-ok/50')}>
                    <Check className="size-4" strokeWidth={3} />
                  </button>
                )}
                <Input value={o.text} onChange={(e) => set(i, e.target.value)} aria-label={`Option ${i + 1}`} aria-invalid={!!err} placeholder={`Option ${i + 1}`} />
                <Button variant="ghost" size="icon-sm" aria-label={`Remove option ${i + 1}`} disabled={options.length <= min} onClick={() => remove(i)}><X className="size-4" /></Button>
              </div>
              {err && <p className="ml-10 text-[0.8125rem] text-bad">{err}</p>}
            </li>
          );
        })}
      </ul>
      {listErr && !options.some((_, i) => errorAt(issues, `${path}[${i}]`)) && <p className="text-[0.8125rem] text-bad" role="alert">{listErr}</p>}
      <div className="flex items-center justify-between">
        <Button variant="secondary" size="sm" onClick={add} disabled={options.length >= max}><Plus className="size-3.5" aria-hidden /> Add option</Button>
        <span className="text-xs text-ink-3">{min}–{max} options{multi ? ', tick every correct one' : correctId !== undefined ? ', tick the correct one' : ''}</span>
      </div>
    </div>
  );
}

export function StepsEditor({ steps, onChange, issues }: { steps: string[]; onChange: (s: string[]) => void; issues: FieldIssue[] }) {
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="grid gap-2">
      {steps.map((s, i) => (
        <div key={i} className="grid gap-1">
          <div className="flex items-center gap-1.5">
            <span className="tabular grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent-ink">{i + 1}</span>
            <Input value={s} onChange={(e) => onChange(steps.map((x, k) => (k === i ? e.target.value : x)))} aria-label={`Step ${i + 1}`} aria-invalid={!!errorAt(issues, `steps[${i}]`)} />
            <Button variant="ghost" size="icon-sm" aria-label="Move step up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" /></Button>
            <Button variant="ghost" size="icon-sm" aria-label="Move step down" disabled={i === steps.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" /></Button>
            <Button variant="ghost" size="icon-sm" aria-label={`Remove step ${i + 1}`} onClick={() => onChange(steps.filter((_, k) => k !== i))}><Trash2 className="size-4" /></Button>
          </div>
          {errorAt(issues, `steps[${i}]`) && <p className="ml-8 text-[0.8125rem] text-bad">{errorAt(issues, `steps[${i}]`)}</p>}
        </div>
      ))}
      <div><Button variant="secondary" size="sm" disabled={steps.length >= 12} onClick={() => onChange([...steps, ''])}><Plus className="size-3.5" aria-hidden /> Add step</Button></div>
    </div>
  );
}

/** Image by URL or upload, with alt text and fit. Bad URLs and failed loads are explained, not hidden. */
export function ImageField({ image, onChange, issues }: { image: SlideImage | undefined; onChange: (i: SlideImage | undefined) => void; issues: FieldIssue[] }) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const urlErr = errorAt(issues, 'image.url') ?? errorAt(issues, 'image');

  const upload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const { url } = await api.upload(f);
      onChange({ url, alt: image?.alt ?? '', fit: image?.fit ?? 'cover' });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  };

  if (!image) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => onChange({ url: '', alt: '', fit: 'cover' })}><ImagePlus className="size-4" aria-hidden /> Add image</Button>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} data-testid="image-upload" />
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => file.current?.click()}>{busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Upload instead</Button>
      </div>
    );
  }
  return (
    <div className="grid gap-3 rounded-2xl border border-line bg-paper/60 p-3.5">
      <div className="grid grid-cols-[6.5rem_1fr] gap-3">
        <SafeImage src={image.url || '/_'} alt={image.alt} fit={image.fit} showWhyFailed className="aspect-[4/3] rounded-xl border border-line text-xs" />
        <div className="grid content-start gap-2">
          <Field error={urlErr}>
            <Input value={image.url} onChange={(e) => onChange({ ...image, url: e.target.value })} placeholder="https://… or upload" aria-label="Image URL" aria-invalid={!!urlErr} data-testid="image-url" />
          </Field>
          <div className="flex items-center gap-2">
            <input ref={file} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} />
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => file.current?.click()}>{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />} Upload</Button>
            <Button variant="ghost" size="sm" onClick={() => onChange(undefined)}><Trash2 className="size-4" aria-hidden /> Remove</Button>
          </div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
        <Field label="Alt text" hint="Describe the image for people who cannot see it." error={errorAt(issues, 'image.alt')}>
          <Input value={image.alt} onChange={(e) => onChange({ ...image, alt: e.target.value })} maxLength={240} />
        </Field>
        <SelectField label="Fit" value={image.fit} onChange={(fit) => onChange({ ...image, fit })} options={[{ value: 'cover', label: 'Fill (crop)' }, { value: 'contain', label: 'Fit inside' }]} />
      </div>
    </div>
  );
}
