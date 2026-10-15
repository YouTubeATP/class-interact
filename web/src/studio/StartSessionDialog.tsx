import { Loader2, MonitorPlay, PanelsTopLeft } from 'lucide-react';
import { useState } from 'react';
import type { SessionMode } from '@classinteract/shared';
import { Button } from '@/components/ui/button';
import { DialogContent } from '@/components/ui/dialog';
import { SwitchRow } from '@/components/ui/switch';
import { cn } from '@/lib/cn';

const MODES: { id: SessionMode; icon: typeof MonitorPlay; title: string; body: string }[] = [
  { id: 'standalone', icon: MonitorPlay, title: 'Standalone', body: 'Present everything here: slides, activities and results in order, on one screen.' },
  { id: 'companion', icon: PanelsTopLeft, title: 'Companion', body: 'Teach in Canva, PowerPoint or Google Slides. Launch any activity from here when you need it.' },
];

export function StartSessionDialog({ open, onOpenChange, title, onStart }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; onStart: (o: { mode: SessionMode; collectNames: boolean }) => Promise<void> }) {
  const [mode, setMode] = useState<SessionMode>('standalone');
  const [collectNames, setCollectNames] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <DialogContent open={open} onOpenChange={onOpenChange} title="Start a live session" description={`“${title}” — participants join with one code and stay connected the whole time.`}>
      <div className="grid gap-5">
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Session mode">
          {MODES.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} onClick={() => setMode(m.id)} data-testid={`mode-${m.id}`}
              className={cn('grid gap-2 rounded-2xl border-2 p-4 text-left transition-colors', mode === m.id ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-2')}>
              <span className={cn('grid size-9 place-items-center rounded-xl', mode === m.id ? 'bg-accent text-white' : 'bg-ink/6 text-ink-2')}><m.icon className="size-5" aria-hidden /></span>
              <span className="font-bold">{m.title}</span>
              <span className="text-[0.8125rem] leading-snug text-ink-2">{m.body}</span>
            </button>
          ))}
        </div>
        <SwitchRow label="Ask participants for a name" hint={collectNames ? 'They type a name before entering. Best when you need to know who is who, e.g. leaderboards.' : 'Scanning the code takes them straight in with a friendly name they can change any time.'} checked={collectNames} onChange={setCollectNames} />
        <p className="text-[0.8125rem] text-ink-3">You can switch between Standalone and Companion at any time during the session.</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={busy} data-testid="start-session-confirm" onClick={async () => { setBusy(true); try { await onStart({ mode, collectNames }); } finally { setBusy(false); } }}>
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Start session
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}
