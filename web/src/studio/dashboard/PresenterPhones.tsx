import { Copy, Loader2, RefreshCw, Smartphone, UserX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { sameName, type PresenterCommand, type PresenterSnapshot, type SpeakerLink } from '@classinteract/shared';
import { QRCode } from '@/components/QRCode';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { displayHost, prettyPin, useJoinInfo } from '@/lib/joinUrl';

type Send = (c: PresenterCommand) => Promise<boolean>;

/**
 * The Presenter QR. One shared code for every presenter: each phone types a name, which is matched to the presenters
 * assigned to slides in the editor. Phones buzz before and at each handover and show their own cue points.
 */
export function PresenterPhonesPanel({ snap, send, sessionId }: { snap: PresenterSnapshot; send: Send; sessionId: string }) {
  const [link, setLink] = useState<SpeakerLink | null>(null);
  const [busy, setBusy] = useState(false);
  const { base } = useJoinInfo(snap.session.pin);
  useEffect(() => {
    api.sessions.speakerLink(sessionId).then(setLink, (e) => toast.error(e instanceof Error ? e.message : 'Could not load the presenter QR.'));
  }, [sessionId]);
  const url = link ? `${base}${link.path}` : '';
  const reset = async () => {
    setBusy(true);
    try {
      setLink(await api.sessions.resetSpeakerLink(sessionId));
      toast.success('New presenter QR and code. Phones that used the old ones were disconnected.');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not reset.'); } finally { setBusy(false); }
  };
  const roster = link?.roster ?? [];
  const missing = roster.filter((r) => !snap.speakers.some((s) => sameName(s.name, r)));

  return (
    <div className="grid gap-4" data-testid="presenter-phones">
      <p className="text-sm text-ink-2">
        Presenters scan this with their phone and pick their name. Their phone buzzes one slide before their turn and again when it starts, and shows a few cue words for their own slide, never your speaker notes.
      </p>
      {roster.length === 0 && <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn-ink">No slides have a presenter yet. Assign presenters in the editor (each slide’s “Presenter” field) so phones know whose turn it is.</p>}
      <div className="grid gap-3 rounded-2xl border border-line bg-paper/60 p-3.5 sm:grid-cols-[9rem_1fr]">
        <div className="rounded-lg bg-white p-1">{url ? <QRCode value={url} label="Presenter QR" className="w-full" /> : <div className="grid aspect-square place-items-center"><Loader2 className="size-5 animate-spin text-ink-3" aria-hidden /></div>}</div>
        <div className="grid content-start gap-2 text-sm">
          <p className="font-semibold">Presenter QR</p>
          {link?.code && (
            <p className="text-ink-2">Or type this code at <span className="font-semibold">{displayHost(base)}</span>: <span className="tabular text-lg font-extrabold tracking-wider text-ink" data-testid="speaker-code" data-code={link.code}>{prettyPin(link.code)}</span></p>
          )}
          <p className="text-ink-3">Anyone with this link or code can move slides one at a time. Reset to replace both if they were shared too widely.</p>
          {url && <code className="break-all rounded-lg bg-surface px-2 py-1 text-xs" data-testid="speaker-url">{url}</code>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={!url} onClick={() => void navigator.clipboard.writeText(url).then(() => toast.success('Copied'), () => toast.error('Copy failed'))}><Copy className="size-3.5" aria-hidden /> Copy link</Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void reset()} data-testid="speaker-reset"><RefreshCw className={cn('size-3.5', busy && 'animate-spin')} aria-hidden /> Reset QR</Button>
          </div>
        </div>
      </div>

      <ul className="grid gap-2" aria-label="Presenter phones">
        {snap.speakers.map((p) => (
          <li key={p.id} className="flex items-center gap-2 rounded-xl border border-line p-2.5 text-sm" data-testid="speaker-row">
            <Smartphone className="size-4 shrink-0 text-ok" aria-label="Connected" />
            <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
            {p.matched ? <Badge variant="ok">On the slides</Badge> : <Badge variant="warn">Helper</Badge>}
            <Button size="sm" variant="danger-soft" aria-label={`Remove ${p.name}`} onClick={() => void send({ cmd: 'kickSpeaker', id: p.id })}><UserX className="size-3.5" aria-hidden /></Button>
          </li>
        ))}
        {missing.map((r) => (
          <li key={r} className="flex items-center gap-2 rounded-xl border border-dashed border-line-2 p-2.5 text-sm text-ink-3" data-testid="speaker-missing">
            <Smartphone className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{r}</span>
            <span className="text-xs">not connected</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
