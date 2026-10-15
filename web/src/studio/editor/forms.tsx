import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import {
  CONTENT_LAYOUTS, nextId, openMaxLength, resolveContentLayout,
  type ContentConfig, type OpenConfig, type PollConfig, type QuizConfig, type RatingConfig, type Slide, type SurveyConfig, type SurveyQuestion, type WordcloudConfig,
} from '@classinteract/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { SwitchRow } from '@/components/ui/switch';
import { ImageField, NumberField, OptionsEditor, Section, SelectField, StepsEditor, TextField, TimerField, errorAt, type FieldIssue } from './fields';

type Patch<S extends Slide> = (p: Partial<S>) => void;
interface FormProps<S extends Slide> {
  slide: S;
  patch: Patch<S>;
  issues: FieldIssue[];
}

const LAYOUT_LABELS: Record<string, string> = { title: 'Title', text: 'Text', 'image-text': 'Image and text', 'full-image': 'Full image', instructions: 'Instructions' };

function Common({ slide, patch, issues, image = true }: { slide: Slide; patch: Patch<any>; issues: FieldIssue[]; image?: boolean }) {
  return (
    <>
      {image && (
        <Section title="Image" hint={slide.type === 'content' ? 'Shown according to the layout.' : 'Shown beside the question.'}>
          <ImageField image={slide.image} onChange={(image) => patch({ image })} issues={issues} />
        </Section>
      )}
      <Section title="Speaker notes" hint="Private. Only you see these on the presenter dashboard.">
        <TextField label="Notes" value={slide.notes} onChange={(notes) => patch({ notes })} issues={issues} path="notes" multiline rows={3} maxLength={4000} />
      </Section>
    </>
  );
}

function Behaviour({ slide, patch, issues, live = true, share = true }: { slide: Exclude<Slide, { type: 'content' }>; patch: Patch<any>; issues: FieldIssue[]; live?: boolean; share?: boolean }) {
  return (
    <Section title="Timing and visibility">
      <TimerField value={slide.timeLimitSec} onChange={(timeLimitSec) => patch({ timeLimitSec, ...(timeLimitSec === null && 'speedBonus' in slide ? { speedBonus: false } : {}) })} issues={issues} />
      <SwitchRow label="Open responses automatically" hint="When off, you press Open yourself after the activity appears." checked={slide.autoOpen} onChange={(autoOpen) => patch({ autoOpen })} />
      {live && 'liveResults' in slide && <SwitchRow label="Show results while responses come in" hint="Off keeps results hidden until you reveal them." checked={slide.liveResults} onChange={(liveResults) => patch({ liveResults })} />}
      {share && <SwitchRow label="Show results on participants’ phones" hint="You still choose when results appear." checked={slide.showResultsToParticipants} onChange={(showResultsToParticipants) => patch({ showResultsToParticipants })} />}
    </Section>
  );
}

// ------------------------------------------------------------------------------------

function ContentForm({ slide, patch, issues }: FormProps<Extract<Slide, { type: 'content' }>>) {
  const c = slide as ContentConfig & { id: string };
  // title slides are just a big heading (and optional subtitle), so there is nowhere to show a callout
  const isTitle = resolveContentLayout(c) === 'title';
  return (
    <div className="grid gap-6">
      <Section title="Content" hint="Pick a layout, or leave it on Automatic and the best one is chosen from what you add.">
        <SelectField label="Layout" value={(c.layout ?? 'auto') as string} onChange={(v) => patch({ layout: v === 'auto' ? undefined : (v as ContentConfig['layout']), ...(v === 'title' ? { callout: undefined } : {}) })} options={[{ value: 'auto', label: 'Automatic' }, ...CONTENT_LAYOUTS.map((l) => ({ value: l, label: LAYOUT_LABELS[l] }))]} />
        {errorAt(issues, 'image') && c.layout && <p className="text-[0.8125rem] text-bad" role="alert">{errorAt(issues, 'image')}</p>}
        <TextField label="Title" value={c.title} onChange={(title) => patch({ title })} issues={issues} path="title" maxLength={160} testId="content-title" />
        <TextField label="Body" value={c.body} onChange={(body) => patch({ body })} issues={issues} path="body" multiline rows={5} hint="Blank line for a new paragraph. Start lines with “- ” for bullets. **bold** works too." testId="content-body" />
      </Section>
      <Section title="Steps" hint="Numbered cards — good for instructions and procedures.">
        <StepsEditor steps={c.steps} onChange={(steps) => patch({ steps })} issues={issues} />
      </Section>
      <Section title="Callout" hint={isTitle ? 'Title slides do not show callouts. Choose another layout to add one.' : undefined}>
        <SwitchRow label="Highlight an important note" checked={!!c.callout && !isTitle} disabled={isTitle} onChange={(on) => patch({ callout: on ? { tone: 'info', text: 'Important:' } : undefined })} />
        {isTitle && c.callout && (
          <p className="flex flex-wrap items-center gap-2 text-[0.8125rem] text-warn" role="status">
            This slide has a callout that is not shown on a title slide.
            <button type="button" className="font-semibold underline" onClick={() => patch({ callout: undefined })} data-testid="remove-hidden-callout">Remove it</button>
          </p>
        )}
        {c.callout && !isTitle && (
          <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
            <SelectField label="Style" value={c.callout.tone} onChange={(tone) => patch({ callout: { ...c.callout!, tone } })} options={[{ value: 'info', label: 'Info' }, { value: 'warning', label: 'Warning' }, { value: 'success', label: 'Success' }]} />
            <TextField label="Text" value={c.callout.text} onChange={(text) => patch({ callout: { ...c.callout!, text } })} issues={issues} path="callout.text" maxLength={400} />
          </div>
        )}
      </Section>
      <Common slide={slide} patch={patch} issues={issues} />
      {errorAt(issues, '') && <p className="text-sm text-bad" role="alert">{errorAt(issues, '')}</p>}
    </div>
  );
}

function QuizForm({ slide, patch, issues }: FormProps<Extract<Slide, { type: 'quiz' }>>) {
  const c = slide as QuizConfig & { id: string };
  return (
    <div className="grid gap-6">
      <Section title="Question">
        <TextField label="Question" value={c.question} onChange={(question) => patch({ question })} issues={issues} path="question" multiline rows={2} maxLength={300} testId="quiz-question" />
        <OptionsEditor options={c.options} onChange={(options) => patch({ options })} issues={issues} min={2} max={6} correctId={c.correctOptionId} onCorrect={(correctOptionId) => patch({ correctOptionId })} />
        {errorAt(issues, 'correctOptionId') && <p className="text-[0.8125rem] text-bad" role="alert">{errorAt(issues, 'correctOptionId')}</p>}
        <TextField label="Explanation" value={c.explanation} onChange={(explanation) => patch({ explanation })} issues={issues} path="explanation" multiline rows={2} hint="Shown with the correct answer after you reveal it." maxLength={500} />
      </Section>
      <Section title="Scoring">
        <SwitchRow label="Award points" hint="Off makes this an unscored check — it never affects the leaderboard." checked={c.scored} onChange={(scored) => patch({ scored, ...(scored ? {} : { speedBonus: false }) })} />
        {c.scored && <NumberField label="Points for a correct answer" value={c.points} onChange={(points) => patch({ points })} min={10} max={10000} issues={issues} path="points" />}
        <SwitchRow label="Speed bonus" hint={c.timeLimitSec === null ? 'Needs a countdown timer.' : 'Faster correct answers earn up to 2× the minimum (down to half points at the deadline).'} checked={c.speedBonus} disabled={c.timeLimitSec === null || !c.scored} onChange={(speedBonus) => patch({ speedBonus })} />
        {errorAt(issues, 'speedBonus') && <p className="text-[0.8125rem] text-bad" role="alert">{errorAt(issues, 'speedBonus')}</p>}
      </Section>
      <Behaviour slide={slide} patch={patch} issues={issues} live={false} />
      <Common slide={slide} patch={patch} issues={issues} />
    </div>
  );
}

function PollForm({ slide, patch, issues }: FormProps<Extract<Slide, { type: 'poll' }>>) {
  const c = slide as PollConfig & { id: string };
  return (
    <div className="grid gap-6">
      <Section title="Question">
        <TextField label="Question" value={c.question} onChange={(question) => patch({ question })} issues={issues} path="question" multiline rows={2} maxLength={300} testId="poll-question" />
        <OptionsEditor options={c.options} onChange={(options) => patch({ options })} issues={issues} min={2} max={10} />
      </Section>
      <Section title="Choices">
        <SwitchRow label="Allow several answers" checked={c.multiple} onChange={(multiple) => patch({ multiple, maxSelections: multiple ? c.maxSelections : null })} />
        {c.multiple && (
          <NumberField label="Maximum choices" hint="Leave empty for no limit." value={c.maxSelections ?? NaN} onChange={(v) => patch({ maxSelections: Number.isFinite(v) ? v : null })} min={1} max={c.options.length} issues={issues} path="maxSelections" />
        )}
        <SwitchRow label="Anonymous" hint="Names are left out of the CSV export for this poll." checked={c.anonymous} onChange={(anonymous) => patch({ anonymous })} />
      </Section>
      <Behaviour slide={slide} patch={patch} issues={issues} />
      <Common slide={slide} patch={patch} issues={issues} />
    </div>
  );
}

function WordcloudForm({ slide, patch, issues }: FormProps<Extract<Slide, { type: 'wordcloud' }>>) {
  const c = slide as WordcloudConfig & { id: string };
  return (
    <div className="grid gap-6">
      <Section title="Prompt">
        <TextField label="Prompt" value={c.question} onChange={(question) => patch({ question })} issues={issues} path="question" multiline rows={2} maxLength={300} testId="wordcloud-question" />
      </Section>
      <Section title="Responses" hint="Answers are grouped ignoring case and punctuation; multiword answers stay together.">
        <div className="grid gap-3 sm:grid-cols-3">
          <NumberField label="Max characters" value={c.maxLength} onChange={(maxLength) => patch({ maxLength })} min={1} max={100} issues={issues} path="maxLength" />
          <NumberField label="Max words" value={c.maxWords} onChange={(maxWords) => patch({ maxWords })} min={1} max={10} issues={issues} path="maxWords" />
          <NumberField label="Answers each" value={c.maxSubmissions} onChange={(maxSubmissions) => patch({ maxSubmissions })} min={1} max={10} issues={issues} path="maxSubmissions" />
        </div>
        <SelectField label="Moderation" value={c.moderation} onChange={(moderation) => patch({ moderation })} options={[{ value: 'off', label: 'Show answers immediately' }, { value: 'premoderate', label: 'Approve each answer before it appears' }]} hint="Offensive language is always blocked. You can hide any term while presenting." />
      </Section>
      <Behaviour slide={slide} patch={patch} issues={issues} />
      <Common slide={slide} patch={patch} issues={issues} />
    </div>
  );
}

function OpenForm({ slide, patch, issues }: FormProps<Extract<Slide, { type: 'open' }>>) {
  const c = slide as OpenConfig & { id: string };
  return (
    <div className="grid gap-6">
      <Section title="Question">
        <TextField label="Question" value={c.question} onChange={(question) => patch({ question })} issues={issues} path="question" multiline rows={2} maxLength={300} testId="open-question" />
      </Section>
      <Section title="Responses">
        <div className="grid gap-3 sm:grid-cols-3">
          <SelectField label="Length" value={c.mode} onChange={(mode) => patch({ mode, maxLength: undefined })} options={[{ value: 'short', label: 'Short answer' }, { value: 'paragraph', label: 'Paragraph' }]} />
          <NumberField label="Max characters" value={openMaxLength(c)} onChange={(maxLength) => patch({ maxLength })} min={10} max={c.mode === 'short' ? 280 : 2000} issues={issues} path="maxLength" />
          <NumberField label="Answers each" value={c.maxSubmissions} onChange={(maxSubmissions) => patch({ maxSubmissions })} min={1} max={5} issues={issues} path="maxSubmissions" />
        </div>
        <SelectField label="Moderation" value={c.moderation} onChange={(moderation) => patch({ moderation })} options={[{ value: 'off', label: 'Show answers immediately' }, { value: 'premoderate', label: 'Approve each answer before it appears' }]} />
      </Section>
      <Behaviour slide={slide} patch={patch} issues={issues} />
      <Common slide={slide} patch={patch} issues={issues} />
    </div>
  );
}

function RatingForm({ slide, patch, issues }: FormProps<Extract<Slide, { type: 'rating' }>>) {
  const c = slide as RatingConfig & { id: string };
  return (
    <div className="grid gap-6">
      <Section title="Question">
        <TextField label="Question" value={c.question} onChange={(question) => patch({ question })} issues={issues} path="question" multiline rows={2} maxLength={300} testId="rating-question" />
      </Section>
      <Section title="Scale">
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Starts at" value={String(c.min) as '0' | '1'} onChange={(v) => patch({ min: Number(v) as 0 | 1 })} options={[{ value: '1', label: '1' }, { value: '0', label: '0' }]} />
          <NumberField label="Ends at" value={c.max} onChange={(max) => patch({ max })} min={2} max={10} issues={issues} path="max" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Low-end label" value={c.minLabel} onChange={(minLabel) => patch({ minLabel })} issues={issues} path="minLabel" maxLength={40} placeholder="Not at all" />
          <TextField label="High-end label" value={c.maxLabel} onChange={(maxLabel) => patch({ maxLabel })} issues={issues} path="maxLabel" maxLength={40} placeholder="Very" />
        </div>
      </Section>
      <Behaviour slide={slide} patch={patch} issues={issues} />
      <Common slide={slide} patch={patch} issues={issues} />
    </div>
  );
}

// ------------------------------------------------------------------------------------
// Survey
// ------------------------------------------------------------------------------------

function newQuestion(kind: SurveyQuestion['kind'], existing: string[]): SurveyQuestion {
  const id = nextId(existing, 'q');
  if (kind === 'choice') return { id, kind, question: 'New question', options: [{ id: 'a', text: 'Option A' }, { id: 'b', text: 'Option B' }], multiple: false, maxSelections: null, required: true };
  if (kind === 'rating') return { id, kind, question: 'New question', min: 1, max: 5, minLabel: '', maxLabel: '', required: true };
  return { id, kind, question: 'New question', mode: 'short', required: false };
}

function SurveyForm({ slide, patch, issues }: FormProps<Extract<Slide, { type: 'survey' }>>) {
  const c = slide as SurveyConfig & { id: string };
  const setQ = (i: number, q: SurveyQuestion) => patch({ questions: c.questions.map((x, k) => (k === i ? q : x)) });
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= c.questions.length) return;
    const next = [...c.questions];
    [next[i], next[j]] = [next[j], next[i]];
    patch({ questions: next });
  };
  return (
    <div className="grid gap-6">
      <Section title="Survey" hint="Participants answer every question on one screen and submit once.">
        <TextField label="Title" value={c.title} onChange={(title) => patch({ title })} issues={issues} path="title" maxLength={200} testId="survey-title" />
        <TextField label="Description" value={c.description} onChange={(description) => patch({ description })} issues={issues} path="description" multiline rows={2} maxLength={500} />
      </Section>
      <Section title={`Questions (${c.questions.length})`}>
        <ol className="grid gap-3">
          {c.questions.map((q, i) => {
            const base = `questions[${i}]`;
            const qi = issues.filter((x) => x.path.startsWith(base)).map((x) => ({ ...x, path: x.path.slice(base.length + 1) }));
            return (
              <li key={q.id} className="grid gap-3 rounded-2xl border border-line bg-paper/60 p-3.5" data-testid="survey-question-editor">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold">Question {i + 1} <span className="ml-1 rounded-full bg-ink/6 px-2 py-0.5 text-xs font-semibold text-ink-2">{q.kind === 'choice' ? 'Choice' : q.kind === 'rating' ? 'Rating' : 'Text'}</span></span>
                  <div className="flex items-center">
                    <Button variant="ghost" size="icon-sm" aria-label="Move question up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label="Move question down" disabled={i === c.questions.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Remove question ${i + 1}`} disabled={c.questions.length <= 1} onClick={() => patch({ questions: c.questions.filter((_, k) => k !== i) })}><Trash2 className="size-4" /></Button>
                  </div>
                </div>
                <TextField label="Question" value={q.question} onChange={(question) => setQ(i, { ...q, question })} issues={qi} path="question" maxLength={300} />
                {q.kind === 'choice' && (
                  <>
                    <OptionsEditor options={q.options} onChange={(options) => setQ(i, { ...q, options })} issues={qi} min={2} max={10} />
                    <SwitchRow label="Allow several answers" checked={q.multiple} onChange={(multiple) => setQ(i, { ...q, multiple, maxSelections: multiple ? q.maxSelections : null })} />
                  </>
                )}
                {q.kind === 'rating' && (
                  <div className="grid gap-3 sm:grid-cols-4">
                    <SelectField label="Starts at" value={String(q.min) as '0' | '1'} onChange={(v) => setQ(i, { ...q, min: Number(v) as 0 | 1 })} options={[{ value: '1', label: '1' }, { value: '0', label: '0' }]} />
                    <NumberField label="Ends at" value={q.max} onChange={(max) => setQ(i, { ...q, max })} min={2} max={10} issues={qi} path="max" />
                    <TextField label="Low label" value={q.minLabel} onChange={(minLabel) => setQ(i, { ...q, minLabel })} issues={qi} path="minLabel" maxLength={40} />
                    <TextField label="High label" value={q.maxLabel} onChange={(maxLabel) => setQ(i, { ...q, maxLabel })} issues={qi} path="maxLabel" maxLength={40} />
                  </div>
                )}
                {q.kind === 'text' && (
                  <SelectField label="Length" value={q.mode} onChange={(mode) => setQ(i, { ...q, mode, maxLength: undefined })} options={[{ value: 'short', label: 'Short answer' }, { value: 'paragraph', label: 'Paragraph' }]} />
                )}
                <SwitchRow label="Required" checked={q.required} onChange={(required) => setQ(i, { ...q, required })} />
              </li>
            );
          })}
        </ol>
        {errorAt(issues, 'questions') && !c.questions.length && <p className="text-[0.8125rem] text-bad" role="alert">{errorAt(issues, 'questions')}</p>}
        <div className="flex flex-wrap gap-2">
          {(['choice', 'rating', 'text'] as const).map((k) => (
            <Button key={k} variant="secondary" size="sm" disabled={c.questions.length >= 20} onClick={() => patch({ questions: [...c.questions, newQuestion(k, c.questions.map((q) => q.id))] })}>
              <Plus className="size-3.5" aria-hidden /> {k === 'choice' ? 'Choice' : k === 'rating' ? 'Rating' : 'Text'} question
            </Button>
          ))}
        </div>
      </Section>
      <Behaviour slide={slide} patch={patch} issues={issues} />
      <Common slide={slide} patch={patch} issues={issues} />
    </div>
  );
}

export function SlideForm({ slide, patch, issues }: { slide: Slide; patch: (p: Partial<Slide>) => void; issues: FieldIssue[] }) {
  switch (slide.type) {
    case 'content': return <ContentForm slide={slide} patch={patch as Patch<typeof slide>} issues={issues} />;
    case 'quiz': return <QuizForm slide={slide} patch={patch as Patch<typeof slide>} issues={issues} />;
    case 'poll': return <PollForm slide={slide} patch={patch as Patch<typeof slide>} issues={issues} />;
    case 'wordcloud': return <WordcloudForm slide={slide} patch={patch as Patch<typeof slide>} issues={issues} />;
    case 'open': return <OpenForm slide={slide} patch={patch as Patch<typeof slide>} issues={issues} />;
    case 'rating': return <RatingForm slide={slide} patch={patch as Patch<typeof slide>} issues={issues} />;
    case 'survey': return <SurveyForm slide={slide} patch={patch as Patch<typeof slide>} issues={issues} />;
  }
}

export function SlideIdField({ slide, onRename, taken }: { slide: Slide; onRename: (id: string) => void; taken: string[] }) {
  const clash = taken.includes(slide.id);
  return (
    <Field label="Slide id" hint="Stable name used in JSON and exports." error={clash ? 'Another slide already uses this id.' : null}>
      <Input value={slide.id} onChange={(e) => onRename(e.target.value.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 64))} aria-invalid={clash} />
    </Field>
  );
}
