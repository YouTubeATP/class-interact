import { DoorOpen, Frown, Unplug } from 'lucide-react';
import { useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Notice, Spinner } from '@/components/Status';
import { useSession } from '@/lib/session-client';
import { loadCredential, participantKey, store } from '@/lib/storage';
import type { ParticipantSnapshot } from '@classinteract/shared';
import { ParticipantApp } from '@/participant/ParticipantApp';

export default function PlayPage() {
  const { sessionId = '' } = useParams();
  const cred = loadCredential(sessionId);
  const { snapshot, status, submit, now } = useSession<ParticipantSnapshot>(cred ? { role: 'participant', sessionId, token: cred.token } : null);

  useEffect(() => {
    if (status === 'denied' || status === 'removed') store.remove(participantKey(sessionId));
  }, [status, sessionId]);

  if (!cred) return <Navigate to="/join" replace />;

  if (status === 'removed') {
    return <div className="grid min-h-dvh place-items-center"><Notice icon={<Frown className="size-7" />} title="You were removed from this session" action={<Button asChild variant="primary"><Link to="/join">Join another session</Link></Button>}>The presenter removed you. If this was a mistake, ask them to let you rejoin with a new name.</Notice></div>;
  }
  if (status === 'denied') {
    return <div className="grid min-h-dvh place-items-center"><Notice icon={<DoorOpen className="size-7" />} title="Please join again" action={<Button asChild variant="primary"><Link to="/join">Enter the code</Link></Button>}>This device is no longer recognised by the session.</Notice></div>;
  }
  if (status === 'notfound') {
    return <div className="grid min-h-dvh place-items-center"><Notice icon={<Unplug className="size-7" />} title="This session is no longer available" action={<Button asChild variant="primary"><Link to="/join">Join another session</Link></Button>}>It may have been deleted by the presenter.</Notice></div>;
  }
  if (!snapshot) {
    return <div className="grid min-h-dvh place-items-center" data-palette="azure"><div className="grid justify-items-center gap-3 text-ink-2"><Spinner className="size-7" /><p className="font-semibold">{status === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}</p></div></div>;
  }
  return <ParticipantApp snap={snapshot} status={status} submit={submit} now={now} />;
}
