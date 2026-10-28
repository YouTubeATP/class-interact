import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { can, type Ack, type ActionType, type Permission, type PresenterCommand, type PresenterSnapshot } from '@classinteract/shared';

/**
 * Sends presenter commands with the state version this screen last saw. If another control screen (a co-presenter,
 * the phone remote) changed the session in the meantime, the server refuses rather than applying a contradictory
 * command, and the presenter sees why.
 */
export function useStaff(snapshot: PresenterSnapshot | null, command: (c: PresenterCommand) => Promise<Ack>) {
  const snap = useRef(snapshot);
  snap.current = snapshot;
  const send = useCallback(async (cmd: PresenterCommand): Promise<boolean> => {
    const version = snap.current?.version;
    const withVersion = (cmd.cmd === 'action' || cmd.cmd === 'runAgain' || cmd.cmd === 'nextPlain') && version !== undefined ? { ...cmd, expectVersion: version } : cmd;
    const ack = await command(withVersion as PresenterCommand);
    if (!ack.ok) toast.error(ack.code === 'STALE' ? 'Someone else just changed the session from another screen. Check what is on screen and try again.' : ack.message);
    return ack.ok;
  }, [command]);
  const run = useCallback((type: ActionType) => void send({ cmd: 'action', action: { type } as never }), [send]);
  const goto = useCallback((index: number) => void send({ cmd: 'action', action: { type: 'goto', index } }), [send]);
  const allowed = useCallback((p: Permission) => !!snap.current && can(snap.current.staff.role, p), []);
  return { send, run, goto, allowed };
}
