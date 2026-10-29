import { LayoutTemplate, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { PresentationTemplate } from '@classinteract/shared';
import { Button } from '@/components/ui/button';
import { DialogContent } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

/** Pick a starting point. The result is an ordinary presentation: edit anything, nothing stays linked to the template. */
export function TemplateDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const [list, setList] = useState<Omit<PresentationTemplate, 'doc'>[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open && !list) api.templates.list().then(setList).catch((e) => setError(e.message)); }, [open, list]);
  return (
    <DialogContent open={open} onOpenChange={onOpenChange} wide title="Start from a template" description="Each template makes a normal presentation you can change freely.">
      {error && <p role="alert" className="text-sm font-semibold text-bad">{error}</p>}
      {!list ? <Loader2 className="size-5 animate-spin text-ink-3" aria-label="Loading" /> : (
        <ul className="grid gap-3 sm:grid-cols-2" data-testid="template-list">
          {list.map((t) => (
            <li key={t.id}>
              <button type="button" disabled={!!busy} onClick={async () => { setBusy(t.id); try { const r = await api.templates.create(t.id); onCreated(r.id); } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(null); } }}
                className={cn('grid h-full w-full gap-1.5 rounded-2xl border-2 border-line p-4 text-left transition-colors hover:border-accent disabled:opacity-60')} data-testid={`template-${t.id}`}>
                <span className="flex items-center gap-2 font-bold">{busy === t.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LayoutTemplate className="size-4 text-accent" aria-hidden />} {t.title}</span>
                <span className="text-sm text-ink-2">{t.description}</span>
                <span className="text-xs text-ink-3">{t.summary}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex justify-end"><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button></div>
    </DialogContent>
  );
}
