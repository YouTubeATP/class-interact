import { KeyRound, Radio, ShieldOff, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ROLE_LABEL, type PresenterSnapshot, type SessionControlInfo } from '@classinteract/shared';
import { useSessionAudio } from '@/audio/useSessionAudio';
import { LogoMark } from '@/components/Logo';
import { AppearanceToggle, MuteButton } from '@/components/Preferences';
import { ConnectionBanner, Notice, Spinner } from '@/components/Status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useJoinInfo } from '@/lib/joinUrl';
import { useSession } from '@/lib/session-client';
import { projectorViewOfPresenter } from '@/render/model';
import { StageView } from '@/render/StageView';
import { Controls } from './dashboard/Controls';
import { PrivatePanel } from './dashboard/PrivatePanel';
import { ScreenControls } from './dashboard/ScreenControls';
import { SelfPacedPanel } from './dashboard/RoomPanels';
import { useStaff } from './dashboard/useStaff';

/**
 * The phone remote: big buttons for the presenter's own phone or a teaching assistant. Opened with an access link
 * (`#g=…`, a co-presenter or moderator token) or, signed in to the Studio, as the owner. The server checks every
 * command against the link's role; the screen only shows what that role may do.
 */
function RemoteLive({ info }: { info: SessionControlInfo }) {
  const auth = info.role === 'owner' ? { role: 'presenter' as const, sessionId: info.sessionId, token: info.presenterToken } : { role: 'delegate' as const, sessionId: info.sessionId, token: info.presenterToken };
  const { snapshot, status, command, now } = useSession<PresenterSnapshot>(auth);
  const { send, run } = useStaff(snapshot, command);
  const join = useJoinInfo(snapshot?.session.pin);
  const model = useMemo(() => (snapshot ? projectorViewOfPresenter(snapshot, now, { url: join.url, host: join.host }) : null), [snapshot, now, join.url, join.host]);
  useSessionAudio(snapshot, 'presenter', now);

  if (status === 'revoked' || status === 'denied') {
    return <div className="grid min-h-dvh place-items-center"><Notice icon={<ShieldOff className="size-7" />} title={status === 'revoked' ? 'This access link was revoked' : 'This link is not valid'}>Ask the presenter for a new link.</Notice></div>;
  }
  if (status === 'notfound') return <div className="grid min-h-dvh place-items-center"><Notice title="This session no longer exists" /></div>;
  if (!snapshot || !model) return <div className="grid min-h-dvh place-items-center"><div className="grid justify-items-center gap-3 text-ink-2"><Spinner className="size-7" /><p className="font-semibold">Connecting…</p></div></div>;
  const ended = snapshot.session.status === 'ended';
  const navigate = snapshot.staff.permissions.includes('navigate');
  return (
    <div data-palette={snapshot.session.theme.palette} className="mx-auto min-h-dvh max-w-xl bg-paper" data-testid="remote">
      <ConnectionBanner status={status} className="sticky top-0 z-30" />
      <header className="sticky top-0 z-20 flex items-center gap-2.5 border-b border-line bg-paper/95 px-4 py-2.5 backdrop-blur">
        <LogoMark className="size-8 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.9375rem] font-bold leading-tight">{snapshot.session.title}</p>
          <p className="flex items-center gap-2 text-xs text-ink-3">
            {ended ? 'Ended' : <><Radio className="size-3 text-ok" aria-hidden /> Live</>}
            <span className="flex items-center gap-1" data-testid="remote-online"><Users className="size-3" aria-hidden /> <span className="tabular">{snapshot.counts.online}</span>/<span className="tabular">{snapshot.counts.participants}</span></span>
            <Badge>{ROLE_LABEL[snapshot.staff.role]}</Badge>
          </p>
        </div>
        <MuteButton scope="studio" />
        <AppearanceToggle scope="studio" compact />
      </header>
      <main className="grid gap-4 p-4">
        <div className="aspect-video overflow-hidden rounded-2xl border border-line bg-stage-bg" data-testid="remote-stage"><StageView m={model} testId="remote-stage-view" /></div>
        {ended ? <Notice title="The session has ended">Results are saved in the Studio.</Notice> : (
          <>
            {snapshot.session.mode === 'selfpaced' ? (navigate && <SelfPacedPanel snap={snapshot} send={send} />) : <Controls snap={snapshot} run={run} send={send} now={now} size="remote" />}
            <ScreenControls snap={snapshot} send={send} compact />
            <section className="grid gap-2" aria-label="Panels">
              <PrivatePanel snap={snapshot} send={send} sessionId={info.sessionId} aiEnabled={false} />
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default function RemotePage() {
  const { id = '' } = useParams();
  const [info, setInfo] = useState<SessionControlInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('g');
    const go = token ? api.delegate.claim(id, token) : api.sessions.control(id);
    go.then(setInfo).catch((e) => setError(e instanceof Error ? e.message : 'Could not open the remote.'));
  }, [id]);
  if (error) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Notice icon={<KeyRound className="size-7" />} title="Could not open the remote" action={<Button asChild variant="primary"><Link to={`/login?next=${encodeURIComponent(`/remote/${id}`)}`}>Sign in to the Studio</Link></Button>}>{error}</Notice>
      </div>
    );
  }
  if (!info) return <div className="grid min-h-dvh place-items-center"><Spinner className="size-7" /></div>;
  return <RemoteLive info={info} />;
}
