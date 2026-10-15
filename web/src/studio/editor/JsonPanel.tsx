import { Check, Copy, Download, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { exportPresentationJson, parsePresentationJson, type DocIssue, type PresentationDoc } from '@classinteract/shared';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { IssueList } from '../ImportDialog';

/**
 * The whole presentation as canonical JSON. Applying it replaces the visual editor's model,
 * so the JSON view and the form view are two windows on the same document.
 */
export function JsonPanel({ doc, onApply }: { doc: PresentationDoc; onApply: (d: PresentationDoc) => void }) {
  const canonical = useMemo(() => exportPresentationJson(doc), [doc]);
  const [text, setText] = useState(canonical);
  const [issues, setIssues] = useState<DocIssue[]>([]);
  const dirty = text !== canonical;

  // follow edits made in the visual editor until the user starts typing here
  useEffect(() => { setText(canonical); setIssues([]); }, [canonical]);

  const apply = () => {
    const r = parsePresentationJson(text);
    if (!r.ok) return setIssues(r.errors);
    setIssues([]);
    onApply(r.doc);
    r.warnings.forEach((w) => toast.message(w));
    toast.success('JSON applied');
  };

  return (
    <div className="grid gap-3" data-testid="json-panel">
      <p className="text-sm text-ink-2">This is the complete, versioned document. Edit it directly, paste a generated presentation, or copy it for another tool.</p>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} className="min-h-[26rem] font-mono text-[0.8125rem] leading-relaxed" aria-label="Presentation JSON" data-testid="json-text" />
      {issues.length > 0 && <IssueList issues={issues} />}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={apply} disabled={!dirty} data-testid="json-apply"><Check className="size-4" aria-hidden /> Apply JSON</Button>
        <Button variant="ghost" onClick={() => { setText(canonical); setIssues([]); }} disabled={!dirty}><RotateCcw className="size-4" aria-hidden /> Revert</Button>
        <span className="flex-1" />
        <Button variant="secondary" onClick={() => void navigator.clipboard?.writeText(canonical).then(() => toast.success('Copied'))}><Copy className="size-4" aria-hidden /> Copy</Button>
        <Button variant="secondary" onClick={() => {
          const url = URL.createObjectURL(new Blob([canonical], { type: 'application/json' }));
          const a = Object.assign(document.createElement('a'), { href: url, download: `${doc.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'presentation'}.classinteract.json` });
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1500);
        }}><Download className="size-4" aria-hidden /> Download</Button>
      </div>
    </div>
  );
}
