import { AnimatePresence, motion } from 'framer-motion';
import { MonitorX, Volume2, VolumeX, WifiOff } from 'lucide-react';
import { audio } from '@/audio/engine';
import { saveSoundSettings, useSoundSettings } from '@/audio/settings';
import { useAudioState, useSessionAudio } from '@/audio/useSessionAudio';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import type { ProjectorSnapshot } from '@classinteract/shared';
import { Notice, Spinner } from '@/components/Status';
import { useJoinInfo } from '@/lib/joinUrl';
import { useSession } from '@/lib/session-client';
import { fromProjector } from '@/render/model';
import { StageView } from '@/render/StageView';

/** Audience-facing screen. Receives only what the audience may see; has no controls. */
export default function ProjectPage() {
  const { sessionId = '' } = useParams();
  const [search] = useSearchParams();
  const key = search.get('k') ?? '';
  const { snapshot, status, now } = useSession<ProjectorSnapshot>(key ? { role: 'projector', sessionId, key } : null);
  const join = useJoinInfo(snapshot?.session.pin);
  // room sound: the presenter's choices from the dashboard, never this computer's other settings
  useSessionAudio(snapshot, 'projector', now);
  const audioState = useAudioState();
  const local = useSoundSettings('projector');
  const wantsSound = !!snapshot && snapshot.session.features.projector.sound !== 'off';
  const [hint, setHint] = useState(true);
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setHint(false), 5000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'f' && !e.metaKey && !e.ctrlKey) {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen?.().catch(() => undefined);
      }
    };
    let timer: ReturnType<typeof setTimeout>;
    const onMove = () => { setIdle(false); clearTimeout(timer); timer = setTimeout(() => setIdle(true), 2500); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousemove', onMove);
    onMove();
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousemove', onMove); clearTimeout(timer); };
  }, []);

  const model = useMemo(() => (snapshot ? fromProjector(snapshot, now, { url: join.url, host: join.host }) : null), [snapshot, now, join.url, join.host]);

  if (!key || status === 'denied') {
    return <div className="grid h-dvh place-items-center"><Notice icon={<MonitorX className="size-7" />} title="This projector link is not valid">Open the projector from the session controls in the Presenter Studio.</Notice></div>;
  }
  if (status === 'notfound') {
    return <div className="grid h-dvh place-items-center"><Notice icon={<MonitorX className="size-7" />} title="This session no longer exists" /></div>;
  }

  return (
    <div className={`relative h-dvh w-screen overflow-hidden bg-stage-bg ${idle ? 'cursor-none' : ''}`} data-testid="projector">
      {model ? (
        <StageView m={model} />
      ) : (
        <div className="grid size-full place-items-center text-white/70"><div className="grid justify-items-center gap-3"><Spinner className="size-8 text-white/70" /><p className="text-lg font-semibold">Connecting to the session…</p></div></div>
      )}
      <AnimatePresence>
        {status === 'reconnecting' && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-2 rounded-full bg-warn-soft px-4 py-2 text-sm font-bold text-warn shadow-lg" role="status">
            <WifiOff className="size-4" aria-hidden /> Reconnecting…
          </motion.div>
        )}
        {wantsSound && audioState === 'blocked' && !local.muted && model && (
          <motion.button key="enable-sound" type="button" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} onClick={() => void audio.unlock()} className="absolute right-4 top-4 flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-sm font-bold text-white" data-testid="enable-sound">
            <Volume2 className="size-4" aria-hidden /> Click to turn on sound
          </motion.button>
        )}
        {wantsSound && !idle && model && audioState !== 'blocked' && (
          <motion.button key="local-mute" type="button" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { saveSoundSettings('projector', { muted: !local.muted }); void audio.unlock(); }} aria-pressed={local.muted} aria-label={local.muted ? 'Unmute this projector' : 'Mute this projector'} className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-black/60 text-white" data-testid="projector-local-mute">
            {local.muted ? <VolumeX className="size-5" aria-hidden /> : <Volume2 className="size-5" aria-hidden />}
          </motion.button>
        )}
        {hint && model && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute bottom-3 left-4 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white">Press F for full screen</motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
