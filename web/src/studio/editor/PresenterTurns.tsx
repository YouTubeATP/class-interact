import { useState } from 'react';
import { rosterOf, turnsOf, type PresentationDoc, type Slide } from '@classinteract/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Section } from './fields';

type WithPresenter = Slide & { presenter?: string };

/** Who presents which slides, at a glance, and a quick way to hand a run of slides to someone. */
export function PresenterTurns({ doc, onChange }: { doc: PresentationDoc; onChange: (p: Partial<PresentationDoc>) => void }) {
  const slides = doc.slides as WithPresenter[];
  const turns = turnsOf(slides);
  const roster = rosterOf(slides);
  const [name, setName] = useState('');
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(Math.max(1, slides.length));
  const n = slides.length;
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const assign = (who: string | undefined) =>
    onChange({ slides: slides.map((s, i) => (i + 1 >= lo && i + 1 <= hi ? ({ ...s, presenter: who } as Slide) : s)) as Slide[] });
  return (
    <Section title="Presenters" hint="For group presentations: each presenter scans the Presenter QR (or types the presenter code) and their phone buzzes before their turn.">
      {turns.length === 0 ? <p className="text-sm text-ink-3">No presenters assigned yet.</p> : (
        <ol className="grid gap-1 text-sm" data-testid="presenter-turns">
          {turns.map((t, i) => <li key={i}><span className="font-semibold">{t.presenter}</span> <span className="text-ink-3">· {t.from === t.to ? `slide ${t.from + 1}` : `slides ${t.from + 1}–${t.to + 1}`}</span></li>)}
        </ol>
      )}
      <div className="grid grid-cols-[1fr_4.5rem_4.5rem] items-end gap-2">
        <Field label="Name" htmlFor="assign-name"><Input id="assign-name" list="assign-roster" value={name} maxLength={60} placeholder="e.g. Priya" onChange={(e) => setName(e.target.value)} data-testid="assign-name" /></Field>
        <Field label="From" htmlFor="assign-from"><Input id="assign-from" type="number" min={1} max={n} value={from} onChange={(e) => setFrom(Math.min(n, Math.max(1, Number(e.target.value) || 1)))} /></Field>
        <Field label="To" htmlFor="assign-to"><Input id="assign-to" type="number" min={1} max={n} value={to} onChange={(e) => setTo(Math.min(n, Math.max(1, Number(e.target.value) || 1)))} /></Field>
      </div>
      <datalist id="assign-roster">{roster.map((r) => <option key={r} value={r} />)}</datalist>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={!name.trim() || n === 0} onClick={() => assign(name.trim())} data-testid="assign-apply">Assign slides {lo}–{hi}</Button>
        <Button size="sm" variant="ghost" disabled={n === 0} onClick={() => assign(undefined)}>Clear slides {lo}–{hi}</Button>
      </div>
    </Section>
  );
}
