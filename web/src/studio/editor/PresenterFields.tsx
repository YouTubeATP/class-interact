import { Plus, X } from 'lucide-react';
import { MAX_CUES, MAX_CUE_LENGTH, cueLooksLikeALine, rosterOf, type Slide } from '@classinteract/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Section, errorAt, type FieldIssue } from './fields';

type WithPresenter = { presenter?: string; cues?: string[] };

/**
 * Who presents this slide, and the few cue words their phone shows. Cues are capped and nudged towards keywords on
 * purpose: a presenter phone is a safety net, and a paragraph on a phone gets read aloud instead of presented.
 */
export function PresenterFields({ slide, patch, issues, slides }: { slide: Slide; patch: (p: Partial<WithPresenter>) => void; issues: FieldIssue[]; slides: Slide[] }) {
  const s = slide as Slide & WithPresenter;
  const cues = s.cues ?? [];
  const roster = rosterOf(slides as WithPresenter[]);
  const listId = `presenters-${slide.id}`;
  const setCues = (next: string[]) => patch({ cues: next.length ? next : undefined });
  return (
    <Section title="Presenter" hint="For group or co-taught sessions. Presenters scan the Presenter QR on the dashboard; their phone buzzes before their turn and shows these cues.">
      <Field label="Presented by" htmlFor={`presenter-${slide.id}`} error={errorAt(issues, 'presenter')} hint={roster.length ? undefined : 'Type a name. Consecutive slides with the same name form one turn.'}>
        <Input id={`presenter-${slide.id}`} list={listId} value={s.presenter ?? ''} maxLength={60} placeholder="e.g. Priya" data-testid="field-presenter"
          onChange={(e) => patch({ presenter: e.target.value || undefined })} />
      </Field>
      <datalist id={listId}>{roster.map((r) => <option key={r} value={r} />)}</datalist>

      <div className="grid gap-2" data-testid="field-cues">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold">Phone cues</span>
          <span className="text-xs text-ink-3 tabular">{cues.length}/{MAX_CUES}</span>
        </div>
        <p className="text-xs text-ink-3">A keyword or two each, to jog memory at a glance. Not lines to read: the phone fades them during the turn.</p>
        {cues.map((c, i) => (
          <div key={i} className="grid gap-1">
            <div className="flex items-center gap-2">
              <Input value={c} maxLength={MAX_CUE_LENGTH} aria-label={`Cue ${i + 1}`} placeholder="e.g. Erosion data"
                onChange={(e) => setCues(cues.map((x, j) => (j === i ? e.target.value : x)))} />
              <Button size="sm" variant="ghost" aria-label={`Remove cue ${i + 1}`} onClick={() => setCues(cues.filter((_, j) => j !== i))}><X className="size-4" aria-hidden /></Button>
            </div>
            {cueLooksLikeALine(c) && <p className="text-xs text-warn-ink" data-testid="cue-hint">That reads like a sentence. Cues work best as a keyword or two, so you look up rather than read.</p>}
            {errorAt(issues, `cues.${i}`) && <p className="text-xs text-bad">{errorAt(issues, `cues.${i}`)}</p>}
          </div>
        ))}
        {cues.length < MAX_CUES && (
          <div><Button size="sm" variant="secondary" onClick={() => setCues([...cues, ''])} data-testid="add-cue"><Plus className="size-3.5" aria-hidden /> Add cue</Button></div>
        )}
      </div>
    </Section>
  );
}
