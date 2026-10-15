import { Loader2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

export function PromptDialog({ open, onOpenChange, title, label, initial = '', confirm, onSubmit, maxLength = 140 }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; label: string; initial?: string; confirm: string; onSubmit: (value: string) => Promise<void>; maxLength?: number;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setValue(initial); setError(null); } }, [open, initial]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    try { await onSubmit(value.trim()); } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong.'); } finally { setBusy(false); }
  };

  return (
    <DialogContent open={open} title={title}>
      <form onSubmit={submit} className="grid gap-5">
        <Field label={label} error={error} htmlFor="prompt-value">
          <Input id="prompt-value" autoFocus value={value} maxLength={maxLength} onChange={(e) => setValue(e.target.value)} data-testid="prompt-input" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy || !value.trim()} data-testid="prompt-submit">{busy && <Loader2 className="size-4 animate-spin" aria-hidden />} {confirm}</Button>
        </div>
      </form>
    </DialogContent>
  );
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirm, onConfirm, danger = true }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description: string; confirm: string; onConfirm: () => Promise<void>; danger?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <DialogContent open={open} title={title} description={description}>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} disabled={busy} data-testid="confirm-submit" onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}>
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden />} {confirm}
        </Button>
      </div>
    </DialogContent>
  );
}
