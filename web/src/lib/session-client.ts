import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Ack, PresenterCommand, Snapshot, SocketAuth } from '@classinteract/shared';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'denied' | 'notfound' | 'removed';

/**
 * One persistent, authenticated socket per screen. The server is authoritative: every (re)connect
 * delivers a complete snapshot, so a phone that slept or a projector whose Wi-Fi dropped just catches up.
 */
export function useSession<T extends Snapshot>(auth: SocketAuth | null) {
  const [snapshot, setSnapshot] = useState<T | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const offset = useRef(0);
  /** Server time of the newest snapshot applied. Snapshots are built asynchronously, so a slow one can arrive late. */
  const appliedAt = useRef(0);
  const socketRef = useRef<Socket | null>(null);
  const authKey = auth ? JSON.stringify(auth) : '';

  useEffect(() => {
    if (!authKey) return;
    setSnapshot(null);
    appliedAt.current = 0;
    setStatus('connecting');
    const socket = io({ auth: JSON.parse(authKey), transports: ['websocket', 'polling'], reconnection: true, reconnectionDelay: 400, reconnectionDelayMax: 4000, timeout: 8000 });
    socketRef.current = socket;

    socket.on('connect', () => setStatus('connected'));
    socket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect') return; // removed / kicked: handled by the 'removed' event
      setStatus('reconnecting');
    });
    socket.io.on('reconnect_attempt', () => setStatus((s) => (s === 'denied' || s === 'removed' || s === 'notfound' ? s : 'reconnecting')));
    socket.on('connect_error', (err) => {
      if (err.message === 'UNAUTHORIZED') { setStatus('denied'); socket.disconnect(); }
      else if (err.message === 'NOT_FOUND') { setStatus('notfound'); socket.disconnect(); }
      else setStatus((s) => (s === 'connected' || s === 'reconnecting' ? 'reconnecting' : 'connecting'));
    });
    socket.on('removed', () => { setStatus('removed'); socket.disconnect(); });
    socket.on('snapshot', (s: T) => {
      if (s.serverNow < appliedAt.current) return; // stale: a newer snapshot was already applied
      appliedAt.current = s.serverNow;
      offset.current = s.serverNow - Date.now();
      setSnapshot(s);
    });

    // Phones suspend sockets when the screen locks; reconnect promptly when the tab is visible again.
    const onVisible = () => { if (document.visibilityState === 'visible' && socket.disconnected && !['denied', 'removed', 'notfound'].includes(statusRef.current)) socket.connect(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [authKey]);

  const statusRef = useRef(status);
  statusRef.current = status;

  const request = useCallback(<R,>(event: string, payload: unknown): Promise<Ack<R extends object ? R : object>> => {
    return new Promise((resolve) => {
      const s = socketRef.current;
      if (!s || !s.connected) return resolve({ ok: false, code: 'OFFLINE', message: 'You are offline. Reconnecting…' });
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; resolve({ ok: false, code: 'TIMEOUT', message: 'The server took too long to answer. Try again.' }); } }, 10_000);
      s.emit(event, payload, (ack: Ack<R extends object ? R : object>) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(ack);
      });
    });
  }, []);

  const rename = useCallback((name: string) => request<{ name: string }>('rename', { name }), [request]);
  const command = useCallback((cmd: PresenterCommand) => request('presenter', cmd), [request]);
  const submit = useCallback((activityId: string, payload: unknown) => request('submit', { activityId, payload }), [request]);
  /** Server time "now", corrected for this device's clock. */
  const now = useCallback(() => Date.now() + offset.current, []);

  return useMemo(() => ({ snapshot, status, command, submit, rename, now }), [snapshot, status, command, submit, rename, now]);
}
