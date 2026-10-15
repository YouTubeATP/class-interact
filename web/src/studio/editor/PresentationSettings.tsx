import { Check } from 'lucide-react';
import { BACKGROUNDS, PALETTES, type PresentationDoc } from '@classinteract/shared';
import { cn } from '@/lib/cn';
import { Section, SelectField, TextField, type FieldIssue } from './fields';

const SWATCH: Record<string, string> = { azure: '#3347ff', lavender: '#6c4bff', mint: '#0e8f63', peach: '#dd5a14', rose: '#cf2f63', slate: '#334155' };

export function PresentationSettings({ doc, onChange, issues }: { doc: PresentationDoc; onChange: (p: Partial<PresentationDoc>) => void; issues: FieldIssue[] }) {
  return (
    <div className="grid gap-6">
      <Section title="Presentation">
        <TextField label="Title" value={doc.title} onChange={(title) => onChange({ title })} issues={issues} path="title" maxLength={140} testId="presentation-title" />
        <TextField label="Description" value={doc.description} onChange={(description) => onChange({ description })} issues={issues} path="description" multiline rows={3} maxLength={600} hint="Shown on the library card." />
      </Section>
      <Section title="Theme" hint="Colours follow the theme on the projector and on phones. Each activity type keeps its own tone.">
        <div role="radiogroup" aria-label="Accent colour" className="flex flex-wrap gap-3">
          {PALETTES.map((p) => (
            <button key={p} type="button" role="radio" aria-checked={doc.theme.palette === p} aria-label={p} onClick={() => onChange({ theme: { ...doc.theme, palette: p } })}
              className={cn('grid size-11 place-items-center rounded-full ring-offset-2 transition-shadow', doc.theme.palette === p ? 'ring-2 ring-ink' : 'hover:ring-2 hover:ring-line-2')} style={{ background: SWATCH[p] }}>
              {doc.theme.palette === p && <Check className="size-5 text-white" strokeWidth={3} aria-hidden />}
            </button>
          ))}
        </div>
        <SelectField label="Projector background" value={doc.theme.background} onChange={(background) => onChange({ theme: { ...doc.theme, background } })} options={BACKGROUNDS.map((b) => ({ value: b, label: b === 'soft' ? 'Soft colour shapes' : 'Plain white' }))} />
      </Section>
    </div>
  );
}
