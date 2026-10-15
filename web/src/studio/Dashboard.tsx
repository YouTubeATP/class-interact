import { ArrowUpRight, Check, Copy, Download, Link2, MonitorPlay, Tv, PanelsTopLeft, Power, Radio } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { ActionType, PresenterCommand, PresenterSnapshot, SessionControlInfo, SessionMode } from '@classinteract/shared';
import { Ticket } from '@/components/Ticket';
import { ConnectionBanner, Notice, Spinner } from '@/components/Status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/dropdown';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { prettyPin, useJoinInfo } from '@/lib/joinUrl';
import { useSession } from '@/lib/session-client';
import { projectorViewOfPresenter } from '@/render/model';
import { StageView } from '@/render/StageView';
import { ConfirmDialog } from './dialogs';
import { Controls } from './dashboard/Controls';
import { ActivityLauncher, LessonFlow } from './dashboard/Navigator';
import { PrivatePanel, Roster } from './dashboard/PrivatePanel';
import { StudioHeader } from './StudioRoutes';

const MODES: { id: SessionMode; label: string; icon: typeof MonitorPlay }[] = [
  { id: 'standalone', label: 'Standalone', icon: MonitorPlay },
  { id: 'companion', label: 'Companion', icon: PanelsTopLeft },
];

function Live({ info }: { info: SessionControlInfo }) {
  const { snapshot, status, command, now } = useSession<PresenterSnapshot>({ role: 'presenter', sessionId: info.sessionId, token: info.presenterToken });
  const join = useJoinInfo(snapshot?.session.pin);
  const [confirmEnd, setConfirmEnd] = useState<'end' | null>(null);
  const [kick, setKick] = useState<{ id: string; name: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const send = useCallback(async (cmd: PresenterCommand) => {
    const ack = await command(cmd);
    if (!ack.ok) toast.error(ack.message);
    return ack.ok;
  }, [command]);
  const run = useCallback((type: ActionType) => void send({ cmd: 'action', action: { type } as never }), [send]);
  const goto = useCallback((index: number) => void send({ cmd: 'action', action: { type: 'goto', index } }), [send]);

  // keyboard: ← → move through the presentation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable], [role="dialog"]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!snapshot || snapshot.session.mode !== 'standalone') return;
      if (e.key === 'ArrowRight' && snapshot.available.includes('next')) run('next');
      if (e.key === 'ArrowLeft' && snapshot.available.includes('previous')) run('previous');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [snapshot, run]);

  const model = useMemo(() => (snapshot ? projectorViewOfPresenter(snapshot, now, { url: join.url, host: join.host }) : null), [snapshot, now, join.url, join.host]);

  if (status === 'denied' || status === 'notfound') {
    return <Notice title={status === 'notfound' ? 'This session no longer exists' : 'Control link not accepted'} action={<Button asChild variant="primary"><Link to="/studio">Back to presentations</Link></Button>}>{status === 'notfound' ? 'It may have been deleted.' : 'Open the session again from the Studio.'}</Notice>;
  }
  if (!snapshot || !model) return <div className="grid min-h-[60vh] place-items-center"><div className="grid justify-items-center gap-3 text-ink-2"><Spinner className="size-7" /><p className="font-semibold">Connecting to the session…</p></div></div>;

  const { session, state } = snapshot;
  const ended = session.status === 'ended';
  const projectorUrl = `${window.location.origin}/project/${info.sessionId}?k=${encodeURIComponent(info.projectorKey)}`;
  const copy = async (what: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 1600); } catch { toast.error('Copy failed. Select the address manually.'); }
  };

  return (
    <div data-palette={session.theme.palette} className="min-h-dvh bg-paper">
      <ConnectionBanner status={status} />
      <StudioHeader />
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-2.5 sm:px-6">
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold tracking-tight" data-testid="session-title">{session.title}</h1>
        {ended ? <Badge variant="neutral" data-testid="session-status">Ended</Badge> : <Badge variant="ok" data-testid="session-status"><Radio className="size-3" aria-hidden /> Live</Badge>}
        {!ended && (
          <div className="flex rounded-xl bg-ink/6 p-1" role="radiogroup" aria-label="Presenting mode">
            {MODES.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={session.mode === m.id} onClick={() => session.mode !== m.id && void send({ cmd: 'setMode', mode: m.id })} data-testid={`mode-switch-${m.id}`}
                className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.8125rem] font-semibold transition-colors', session.mode === m.id ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink')}>
                <m.icon className="size-3.5" aria-hidden /> {m.label}
              </button>
            ))}
          </div>
        )}
        <Button asChild variant="primary"><a href={projectorUrl} target="_blank" rel="noreferrer" data-testid="open-projector"><MonitorPlay className="size-4" aria-hidden /> Open projector <ArrowUpRight className="size-3.5" aria-hidden /></a></Button>
        <Menu>
          <MenuTrigger asChild><Button variant="secondary" aria-label="Copy links"><Link2 className="size-4" aria-hidden /> Links</Button></MenuTrigger>
          <MenuContent>
            <MenuItem icon={<Copy className="size-4" />} onSelect={() => void copy('join', join.url)}>Copy participant link</MenuItem>
            <MenuItem icon={<Copy className="size-4" />} onSelect={() => void copy('proj', projectorUrl)}>Copy projector link</MenuItem>
          </MenuContent>
        </Menu>
        {!ended && <Button variant="danger-soft" onClick={() => setConfirmEnd('end')} data-testid="end-session"><Power className="size-4" aria-hidden /> End session</Button>}
      </div>

      {ended && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-ink px-6 py-3 text-white" data-testid="ended-banner">
          <p className="font-semibold">This session has ended. Results are saved.</p>
          <div className="flex gap-2">
            <Button asChild variant="secondary" size="sm"><Link to={`/results/${info.sessionId}`}>View results</Link></Button>
            <Button variant="secondary" size="sm" onClick={() => void api.sessions.exportCsv(info.sessionId).catch((e) => toast.error(e.message))}><Download className="size-4" aria-hidden /> Export CSV</Button>
          </div>
        </div>
      )}

      <div className="mx-auto grid max-w-[110rem] gap-5 p-4 sm:p-6 lg:grid-cols-[20.5rem_minmax(0,1fr)] xl:grid-cols-[20.5rem_minmax(0,1fr)_25rem]">
        <aside className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-5" aria-label="Session">
          <div data-testid="join-card" className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-card border border-line bg-surface p-4">
            <div style={{ fontSize: '0.82rem' }}><Ticket pin={session.pin} url={join.url} host={join.host} variant="card" className="ring-1 ring-line" /></div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate text-ink-3" title={join.url}>{join.host}/join/{session.pin}</span>
              <Button variant="ghost" size="sm" onClick={() => void copy('join', join.url)}>{copied === 'join' ? <Check className="size-4 text-ok" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied === 'join' ? 'Copied' : 'Copy'}</Button>
            </div>
            {join.localhostWarning && <p className="rounded-xl bg-warn-soft px-3 py-2 text-xs font-semibold text-warn" role="alert">The QR code points to localhost, which phones cannot reach. Set PUBLIC_URL on the server or open this page using your computer’s network address.</p>}
            {info.projectorCode && !ended && (
              <div className="grid gap-1 rounded-2xl bg-ink/5 px-3.5 py-3" data-testid="projector-code-card">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-3"><Tv className="size-3.5" aria-hidden /> Projector code</p>
                <div className="flex items-center justify-between gap-2">
                  <span className="tabular text-[1.6rem] font-extrabold tracking-[0.08em]" data-testid="projector-code" data-code={info.projectorCode}>{prettyPin(info.projectorCode)}</span>
                  <Button variant="ghost" size="sm" onClick={() => void copy('code', info.projectorCode!)}>{copied === 'code' ? <Check className="size-4 text-ok" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied === 'code' ? 'Copied' : 'Copy'}</Button>
                </div>
                <p className="text-xs leading-snug text-ink-2">On the screen’s computer, open <span className="font-semibold">{join.host}</span> and type this code to make it the projector. Keep it to yourself: it is not the join code.</p>
              </div>
            )}
            <Roster snap={snapshot} onKick={(id, name) => setKick({ id, name })} />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-card border border-line bg-surface p-4">
            <h2 className="text-[0.9375rem] font-bold">{session.mode === 'standalone' ? 'Lesson flow' : 'Launch an activity'}</h2>
            {session.mode === 'companion' && <p className="-mt-1 text-[0.8125rem] leading-snug text-ink-3">Teach in your other app. Launch any activity here whenever you need it, then return to standby. Participants stay connected.</p>}
            {session.mode === 'standalone'
              ? <LessonFlow snap={snapshot} onGoto={goto} />
              : <ActivityLauncher snap={snapshot} onGoto={goto} onStandby={() => run('standby')} />}
          </div>
        </aside>

        <main className="grid min-w-0 content-start gap-4">
          <section aria-label="On screen now" className="grid gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-[0.9375rem] font-bold">On the projector</h2>
              <span className="text-xs font-semibold text-ink-3">{state.phase === 'lobby' ? 'Join screen' : state.phase === 'standby' ? 'Standby screen' : state.leaderboardVisible ? 'Leaderboard' : ended ? 'Closing screen' : 'Live view'}</span>
            </div>
            <div className="aspect-video overflow-hidden rounded-2xl border border-line bg-[#0d1124]" data-testid="dashboard-stage"><StageView m={model} /></div>
          </section>
          {!ended && <Controls snap={snapshot} run={run} now={now} />}
        </main>

        <aside className="grid content-start gap-3 lg:col-span-2 xl:col-span-1" aria-label="Private presenter view">
          <h2 className="text-[0.9375rem] font-bold">Presenter only</h2>
          <PrivatePanel snap={snapshot} onModerate={(c) => void send({ cmd: 'moderate', ...c })} />
        </aside>
      </div>

      <ConfirmDialog open={confirmEnd === 'end'} onOpenChange={(o) => !o && setConfirmEnd(null)} title="End this session?" description="Participants will see the closing screen. Everyone’s responses are saved and you can still view results and export them." confirm="End session" onConfirm={async () => { await send({ cmd: 'action', action: { type: 'end' } }); setConfirmEnd(null); }} />
      <ConfirmDialog open={!!kick} onOpenChange={(o) => !o && setKick(null)} title={`Remove ${kick?.name ?? ''}?`} description="They are disconnected and their responses are hidden. They cannot rejoin with this device." confirm="Remove participant" onConfirm={async () => { if (kick) await send({ cmd: 'kick', participantId: kick.id }); setKick(null); }} />
    </div>
  );
}

export default function DashboardPage() {
  const { id = '' } = useParams();
  const [info, setInfo] = useState<SessionControlInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.sessions.control(id).then(setInfo).catch((e) => setError(e instanceof Error ? e.message : 'Could not open this session.'));
  }, [id]);
  if (error) return <div className="grid min-h-dvh place-items-center"><Notice title="Could not open this session" action={<Button asChild variant="primary"><Link to="/studio">Back to presentations</Link></Button>}>{error}</Notice></div>;
  if (!info) return <div className="grid min-h-dvh place-items-center"><Spinner className="size-7" /></div>;
  return <Live info={info} />;
}
