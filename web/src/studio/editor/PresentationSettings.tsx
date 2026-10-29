import { Check, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { BACKGROUNDS, PALETTES, contrastRatio, type PresentationDoc } from '@classinteract/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { SwitchRow } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Section, SelectField, TextField, errorAt, type FieldIssue } from './fields';

const SWATCH: Record<string, string> = { azure: '#3347ff', lavender: '#6c4bff', mint: '#0e8f63', peach: '#dd5a14', rose: '#cf2f63', slate: '#334155' };
const BACKGROUND_LABEL: Record<string, string> = { soft: 'Soft colour shapes', plain: 'Plain', gradient: 'Gentle gradient', grid: 'Squared paper' };

export function PresentationSettings({ doc, onChange, issues }: { doc: PresentationDoc; onChange: (p: Partial<PresentationDoc>) => void; issues: FieldIssue[] }) {
  const theme = doc.theme;
  const set = (p: Partial<PresentationDoc['theme']>) => onChange({ theme: { ...theme, ...p } });
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const accentOk = !theme.accent || contrastRatio(theme.accent, '#ffffff') >= 4.5;
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const { url } = await api.upload(f);
      set({ logo: { url, alt: theme.logo?.alt ?? '' } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  };
  return (
    <div className="grid gap-6">
      <Section title="Presentation">
        <TextField label="Title" value={doc.title} onChange={(title) => onChange({ title })} issues={issues} path="title" maxLength={140} testId="presentation-title" />
        <TextField label="Description" value={doc.description} onChange={(description) => onChange({ description })} issues={issues} path="description" multiline rows={3} maxLength={600} hint="Shown on the library card." />
      </Section>
      <Section title="Theme" hint="Colours follow the theme on the projector and on phones. Each activity type keeps its own tone.">
        <div role="radiogroup" aria-label="Accent colour" className="flex flex-wrap items-center gap-3">
          {PALETTES.map((p) => (
            <button key={p} type="button" role="radio" aria-checked={theme.palette === p && !theme.accent} aria-label={p} onClick={() => set({ palette: p, accent: undefined })}
              className={cn('grid size-11 place-items-center rounded-full ring-offset-2 ring-offset-surface transition-shadow', theme.palette === p && !theme.accent ? 'ring-2 ring-ink' : 'hover:ring-2 hover:ring-line-2')} style={{ background: SWATCH[p] }}>
              {theme.palette === p && !theme.accent && <Check className="size-5 text-white" strokeWidth={3} aria-hidden />}
            </button>
          ))}
          <label className={cn('relative grid size-11 cursor-pointer place-items-center overflow-hidden rounded-full ring-offset-2 ring-offset-surface', theme.accent ? 'ring-2 ring-ink' : 'ring-1 ring-line-2')} title="Custom colour" style={{ background: theme.accent ?? 'conic-gradient(#d93a55, #b07800, #17935d, #2c6fe0, #6b4ff0, #d93a55)' }}>
            <input type="color" className="absolute inset-0 cursor-pointer opacity-0" aria-label="Custom accent colour" value={theme.accent ?? '#3347ff'} onChange={(e) => set({ accent: e.target.value })} data-testid="custom-accent" />
            {theme.accent && <Check className="size-5 text-white" strokeWidth={3} aria-hidden />}
          </label>
        </div>
        {!accentOk && <p className="text-[0.8125rem] font-semibold text-bad" role="alert">This colour is too light for white text on buttons. Pick a darker one.</p>}
        {errorAt(issues, 'theme.accent') && accentOk && <p className="text-[0.8125rem] text-bad">{errorAt(issues, 'theme.accent')}</p>}
        <SelectField label="Projector background" value={theme.background} onChange={(background) => set({ background })} options={BACKGROUNDS.map((b) => ({ value: b, label: BACKGROUND_LABEL[b] ?? b }))} />
        <SwitchRow label="Dark projector" hint="The presentation’s own look. When presenting you can still switch the projector between light and dark." checked={theme.appearance === 'dark'} onChange={(on) => set({ appearance: on ? 'dark' : undefined })} />
      </Section>
      <Section title="Branding" hint="Optional: a logo in the corner of the projector and a short footer line on every slide.">
        {theme.logo ? (
          <div className="grid gap-3 rounded-2xl border border-line bg-paper/60 p-3.5 sm:grid-cols-[7rem_1fr]">
            <img src={theme.logo.url} alt={theme.logo.alt} className="h-16 w-28 rounded-lg bg-surface object-contain ring-1 ring-line" referrerPolicy="no-referrer" />
            <div className="grid gap-2">
              <Field label="Logo description" hint="For screen readers"><Input value={theme.logo.alt} maxLength={120} onChange={(e) => set({ logo: { ...theme.logo!, alt: e.target.value } })} /></Field>
              <div><Button variant="ghost" size="sm" onClick={() => set({ logo: undefined })}><Trash2 className="size-4" aria-hidden /> Remove logo</Button></div>
            </div>
          </div>
        ) : (
          <div>
            <input ref={file} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} data-testid="logo-upload" />
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => file.current?.click()}>{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />} Upload a logo</Button>
          </div>
        )}
        <Field label="Footer" hint="For example a course code or “© Department of Computing”."><Input value={theme.footer ?? ''} maxLength={120} onChange={(e) => set({ footer: e.target.value || undefined })} data-testid="theme-footer" /></Field>
      </Section>
    </div>
  );
}
