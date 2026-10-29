import { AlertCircle, FileJson, Loader2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { parsePresentationJson, type DocIssue } from '@classinteract/shared';
import { Button } from '@/components/ui/button';
import { DialogContent } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/input';
import { ApiError, api } from '@/lib/api';

const EXAMPLE = `{
  "schemaVersion": 1,
  "title": "My presentation",
  "slides": [
    { "type": "content", "title": "Welcome" },
    { "type": "poll", "question": "Ready?", "options": [{ "text": "Yes" }, { "text": "Not yet" }] }
  ]
}`;

export function IssueList({ issues }: { issues: DocIssue[] }) {
  return (
    <ul className="grid max-h-56 gap-2 overflow-y-auto rounded-2xl bg-bad-soft p-3.5 text-sm" role="alert" data-testid="issue-list">
      {issues.map((i, k) => (
        <li key={k} className="flex gap-2.5 text-bad-ink">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span><code className="rounded bg-surface/60 px-1 py-0.5 text-[0.8125rem] font-semibold">{i.path}</code> {i.message}</span>
        </li>
      ))}
    </ul>
  );
}

/** Import a presentation from JSON text or a file. Validation runs locally first, then on the server. */
export function ImportDialog({ open, onOpenChange, onImported }: { open: boolean; onOpenChange: (o: boolean) => void; onImported: (id: string, warnings: string[]) => void }) {
  const [text, setText] = useState('');
  const [issues, setIssues] = useState<DocIssue[]>([]);
  const [busy, setBusy] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const submit = async () => {
    setFatal(null);
    const local = parsePresentationJson(text);
    if (!local.ok) { setIssues(local.errors); return; }
    setIssues([]);
    setBusy(true);
    try {
      const res = await api.presentations.import(JSON.parse(text));
      onImported(res.id, res.warnings);
    } catch (e) {
      if (e instanceof ApiError && e.issues) setIssues(e.issues);
      else setFatal(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  };

  const load = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 2_000_000) { setFatal('That file is larger than 2 MB.'); return; }
    setText(await f.text());
    setIssues([]);
    setFatal(null);
  };

  return (
    <DialogContent open={open} onOpenChange={onOpenChange} wide title="Import presentation" description="Paste ClassInteract JSON or choose a .json file. Missing optional settings get sensible defaults.">
      <div className="grid gap-3">
        <Textarea value={text} onChange={(e) => { setText(e.target.value); setIssues([]); }} placeholder={EXAMPLE} spellCheck={false} className="min-h-64 font-mono text-[0.8125rem] leading-relaxed" aria-label="Presentation JSON" data-testid="import-json" />
        {issues.length > 0 && <IssueList issues={issues} />}
        {fatal && <p className="rounded-xl bg-bad-soft px-3 py-2 text-sm font-semibold text-bad" role="alert">{fatal}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <input ref={file} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => void load(e.target.files?.[0])} data-testid="import-file" />
            <Button variant="secondary" onClick={() => file.current?.click()}><Upload className="size-4" aria-hidden /> Choose file</Button>
            <a className="text-sm font-semibold text-accent-ink underline-offset-2 hover:underline" href="/api/schema/presentation.json" target="_blank" rel="noreferrer"><FileJson className="mr-1 inline size-4" aria-hidden />JSON Schema</a>
          </div>
          <Button variant="primary" onClick={() => void submit()} disabled={!text.trim() || busy} data-testid="import-submit">{busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Import</Button>
        </div>
      </div>
    </DialogContent>
  );
}
