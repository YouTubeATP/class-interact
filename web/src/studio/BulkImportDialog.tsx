import { AlertTriangle, Download, FileUp, Loader2, Sparkles } from 'lucide-react';
import { useRef, useState } from 'react';
import { CSV_TEMPLATE, IMPORT_MAX_BYTES, definitions, importCsv, importJsonSlides, type ImportResult, type Slide } from '@classinteract/shared';
import { typeMeta } from '@/activities/meta';
import { Button } from '@/components/ui/button';
import { DialogContent } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { plural } from '@/lib/format';

type Source = 'csv' | 'json' | 'notes';

/**
 * Add many activities at once. The file is checked row by row before anything changes, every row that cannot be
 * imported says why, and you choose to add the valid ones; nothing is dropped without being listed.
 */
export function BulkImportDialog({ open, onOpenChange, existingIds, onImport, aiEnabled }: { open: boolean; onOpenChange: (o: boolean) => void; existingIds: string[]; onImport: (slides: Slide[]) => void; aiEnabled: boolean }) {
  const [source, setSource] = useState<Source>('csv');
  const [text, setText] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const reset = (s: Source) => { setSource(s); setResult(null); setError(null); };
  const check = async () => {
    setError(null);
    if (source === 'notes') {
      setBusy(true);
      try { setResult(await api.ai.convert(text, existingIds)); } catch (e) { setError(e instanceof Error ? e.message : 'The conversion failed.'); } finally { setBusy(false); }
      return;
    }
    setResult(source === 'csv' ? importCsv(text, existingIds) : importJsonSlides(text, existingIds));
  };
  const load = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > IMPORT_MAX_BYTES * (source === 'json' ? 3 : 1)) { setError(`That file is too large (maximum ${Math.round((IMPORT_MAX_BYTES * (source === 'json' ? 3 : 1)) / 1000)} KB).`); return; }
    const t = await f.text();
    setText(t);
    setResult(source === 'csv' || f.name.toLowerCase().endsWith('.csv') ? importCsv(t, existingIds) : importJsonSlides(t, existingIds));
    if (file.current) file.current.value = '';
  };
  const template = () => {
    const url = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'classinteract-questions.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  return (
    <DialogContent open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setResult(null); setText(''); setError(null); } }} wide title="Import activities" description="Add questions from a spreadsheet, a JSON list or (with AI) your teaching notes. Everything is checked before it is added.">
      <div className="grid gap-4" data-testid="bulk-import">
        <Tabs value={source} onValueChange={(v) => reset(v as Source)}>
          <TabsList>
            <TabsTrigger value="csv">Spreadsheet (CSV)</TabsTrigger>
            <TabsTrigger value="json">JSON</TabsTrigger>
            {aiEnabled && <TabsTrigger value="notes"><Sparkles className="size-3.5" aria-hidden /> From notes</TabsTrigger>}
          </TabsList>
        </Tabs>
        {source === 'csv' && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-ink/5 px-3 py-2 text-[0.8125rem] text-ink-2">
            <span>Columns: <code className="font-semibold">type, question, options</code> (separated by <code>|</code>)<code className="font-semibold">, correct</code> (A, A,C or the text), and optionally kind, tolerance, unit, time_limit, points, explanation, concepts.</span>
            <Button variant="ghost" size="sm" onClick={template}><Download className="size-3.5" aria-hidden /> Example file</Button>
          </div>
        )}
        {source === 'notes' && <p className="rounded-xl bg-ink/5 px-3 py-2 text-[0.8125rem] text-ink-2">Paste lesson notes or a worksheet. The AI service drafts questions from it; you review every one before it is added. Only the text you paste is sent.</p>}
        <Textarea value={text} onChange={(e) => { setText(e.target.value); setResult(null); }} rows={8} placeholder={source === 'csv' ? 'type,question,options,correct\nquiz,2 + 2 = ?,3|4|5,B' : source === 'json' ? '[{ "type": "poll", "question": "…", "options": [{ "text": "A" }, { "text": "B" }] }]' : 'Paste your teaching material here…'} className="font-mono text-[0.8125rem]" aria-label="Content to import" data-testid="bulk-text" />
        <div className="flex flex-wrap items-center gap-2">
          {source !== 'notes' && (
            <>
              <input ref={file} type="file" accept={source === 'csv' ? '.csv,text/csv,text/plain' : '.json,application/json'} className="sr-only" onChange={(e) => void load(e.target.files?.[0])} data-testid="bulk-file" />
              <Button variant="secondary" size="sm" onClick={() => file.current?.click()}><FileUp className="size-4" aria-hidden /> Choose a file</Button>
            </>
          )}
          <Button variant="secondary" size="sm" onClick={() => void check()} disabled={!text.trim() || busy} data-testid="bulk-check">{busy && <Loader2 className="size-4 animate-spin" aria-hidden />} {source === 'notes' ? 'Draft questions' : 'Check'}</Button>
        </div>
        {error && <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-sm font-semibold text-bad-ink">{error}</p>}
        {result && (
          <div className="grid gap-3" data-testid="bulk-preview">
            <p className="text-sm font-semibold">{plural(result.slides.length, 'slide')} ready{result.issues.length ? `, ${plural(result.issues.length, 'problem')} to look at` : ''}{result.ignoredColumns.length ? `. Ignored columns: ${result.ignoredColumns.join(', ')}` : ''}</p>
            {result.issues.length > 0 && (
              <ul className="grid max-h-40 gap-1 overflow-y-auto rounded-xl bg-warn-soft p-3 text-[0.8125rem] text-warn-ink" data-testid="bulk-issues">
                {result.issues.map((i, k) => <li key={k} className="flex gap-2"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> <span><b>{i.row ? `${source === 'csv' ? 'Row' : 'Item'} ${i.row}` : 'File'}:</b> {i.message}</span></li>)}
              </ul>
            )}
            {result.slides.length > 0 && (
              <ol className="grid max-h-60 gap-1.5 overflow-y-auto">
                {result.slides.map((s) => {
                  const m = typeMeta[s.type];
                  return (
                    <li key={s.id} data-tone={s.type} className="flex items-center gap-2.5 rounded-xl border border-line px-2.5 py-2 text-sm">
                      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-tone text-tone-ink"><m.icon className="size-3.5" aria-label={m.label} /></span>
                      <span className="min-w-0 flex-1 truncate font-semibold">{(definitions[s.type] as any).titleOf(s)}</span>
                      <span className="shrink-0 text-xs text-ink-3">{s.type === 'quiz' ? `Quiz · ${s.kind}` : m.label}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={!result?.slides.length} onClick={() => result && onImport(result.slides)} data-testid="bulk-add">Add {result?.slides.length ? plural(result.slides.length, 'slide') : 'slides'}</Button>
        </div>
      </div>
    </DialogContent>
  );
}
