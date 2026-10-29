import { Coffee, Gauge, MessageCircleQuestion, Moon, Play, QrCode, Sun, Users, Volume2, VolumeX } from 'lucide-react';
import { useState } from 'react';
import type { BreakScreen, Overlay, PresenterCommand, PresenterSnapshot, ProjectorAppearance, SoundLevel } from '@classinteract/shared';
import { Button } from '@/components/ui/button';
import { DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/label';
import { Input, Select, Textarea } from '@/components/ui/input';
import { cn } from '@/lib/cn';

const PRESETS: { kind: BreakScreen['kind']; title: string; minutes: number | null; message: string }[] = [
  { kind: 'break', title: 'Break', minutes: 10, message: 'Back in ten minutes. Leave this page open.' },
  { kind: 'prepare', title: 'Get ready', minutes: 2, message: 'Get your notes out. We start in a moment.' },
  { kind: 'work', title: 'Work time', minutes: 5, message: 'Work on the task with your group.' },
];

function BreakDialog({ open, onOpenChange, onStart }: { open: boolean; onOpenChange: (o: boolean) => void; onStart: (b: { kind: BreakScreen['kind']; title: string; message: string; minutes: number | null }) => void }) {
  const [kind, setKind] = useState<BreakScreen['kind']>('break');
  const [title, setTitle] = useState('Break');
  const [message, setMessage] = useState(PRESETS[0].message);
  const [minutes, setMinutes] = useState('10');
  return (
    <DialogContent open={open} onOpenChange={onOpenChange} title="Pause screen" description="Shows over everything on the projector and phones. The current activity stays exactly as it is.">
      <div className="grid gap-4">
        <div role="radiogroup" aria-label="Kind" className="grid grid-cols-3 gap-2">
          {PRESETS.map((p) => (
            <button key={p.kind} type="button" role="radio" aria-checked={kind === p.kind} onClick={() => { setKind(p.kind); setTitle(p.title); setMessage(p.message); setMinutes(p.minutes ? String(p.minutes) : ''); }}
              className={cn('rounded-xl border-2 px-3 py-2 text-sm font-bold', kind === p.kind ? 'border-accent bg-accent-soft' : 'border-line')} data-testid={`break-kind-${p.kind}`}>{p.title}</button>
          ))}
        </div>
        <Field label="Title"><Input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} data-testid="break-title" /></Field>
        <Field label="Message or instructions"><Textarea value={message} maxLength={400} rows={3} onChange={(e) => setMessage(e.target.value)} /></Field>
        <Field label="Countdown (minutes)" hint="Leave empty for no countdown. You resume when you are ready either way."><Input type="number" min={0.25} max={180} step={0.25} value={minutes} onChange={(e) => setMinutes(e.target.value)} data-testid="break-minutes" /></Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" data-testid="break-start" onClick={() => { const m = Number(minutes); onStart({ kind, title: title.trim(), message: message.trim(), minutes: minutes && Number.isFinite(m) && m >= 0.25 ? m : null }); onOpenChange(false); }}><Play className="size-4" aria-hidden /> Show it</Button>
        </div>
      </div>
    </DialogContent>
  );
}

/**
 * What the room sees on top of the lesson: the join code for latecomers, the Q&A board, the understanding pulse, a
 * pause screen, plus the projector's own look and sound. None of these change the activity underneath.
 */
export function ScreenControls({ snap, send, compact = false }: { snap: PresenterSnapshot; send: (c: PresenterCommand) => Promise<boolean>; compact?: boolean }) {
  const [breakOpen, setBreakOpen] = useState(false);
  const { state, session } = snap;
  const f = session.features;
  const screen = snap.staff.permissions.includes('screen');
  if (!screen || state.phase === 'ended') return null;
  const overlay = (o: Overlay) => void send({ cmd: 'action', action: state.overlay === o ? { type: 'hideOverlay' } : { type: 'showOverlay', overlay: o } });
  const proj = f.projector;
  const setProj = (p: Partial<typeof proj>) => void send({ cmd: 'features', patch: { projector: p } });
  const toggle = (on: boolean, cls?: string) => cn(on && 'border-accent bg-accent-soft text-accent-ink', cls);
  const size = compact ? 'lg' : 'md';
  return (
    <section className="grid gap-3 rounded-card border border-line bg-surface p-4" aria-label="Projector" data-testid="screen-controls">
      <h2 className="text-[0.9375rem] font-bold">On top of the projector</h2>
      <div className={cn('flex flex-wrap gap-2', compact && 'grid grid-cols-2')}>
        <Button variant="secondary" size={size} className={toggle(state.overlay === 'join')} aria-pressed={state.overlay === 'join'} onClick={() => overlay('join')} data-testid="show-join-qr"><QrCode className="size-4" aria-hidden /> {state.overlay === 'join' ? 'Hide join QR' : 'Show join QR'}</Button>
        {f.qa.enabled && <Button variant="secondary" size={size} className={toggle(state.overlay === 'qa')} aria-pressed={state.overlay === 'qa'} onClick={() => overlay('qa')} data-testid="show-qa-board"><MessageCircleQuestion className="size-4" aria-hidden /> {state.overlay === 'qa' ? 'Hide questions' : 'Show questions'}</Button>}
        {f.pulse.enabled && <Button variant="secondary" size={size} className={toggle(state.overlay === 'pulse')} aria-pressed={state.overlay === 'pulse'} onClick={() => overlay('pulse')} data-testid="show-pulse"><Gauge className="size-4" aria-hidden /> {state.overlay === 'pulse' ? 'Hide understanding' : 'Show understanding'}</Button>}
        {state.breakScreen
          ? <Button variant="primary" size={size} onClick={() => void send({ cmd: 'action', action: { type: 'endBreak' } })} data-testid="end-break"><Play className="size-4" aria-hidden /> Resume</Button>
          : <Button variant="secondary" size={size} onClick={() => setBreakOpen(true)} data-testid="open-break"><Coffee className="size-4" aria-hidden /> Break or countdown</Button>}
        {f.teams.enabled && snap.teams.length > 0 && (
          <Button variant="secondary" size={size} className={toggle(state.leaderboardMode === 'team')} aria-pressed={state.leaderboardMode === 'team'} onClick={() => void send({ cmd: 'action', action: { type: 'setLeaderboardMode', mode: state.leaderboardMode === 'team' ? 'individual' : 'team' } })} data-testid="toggle-team-board">
            <Users className="size-4" aria-hidden /> {state.leaderboardMode === 'team' ? 'Leaderboard: teams' : 'Leaderboard: individuals'}
          </Button>
        )}
      </div>
      <div className="grid gap-3 border-t border-line pt-3 sm:grid-cols-3" data-testid="projector-settings">
        <label className="grid gap-1 text-xs font-semibold text-ink-2">Projector look
          <Select value={proj.appearance} onChange={(e) => setProj({ appearance: e.target.value as ProjectorAppearance })} aria-label="Projector appearance" data-testid="projector-appearance">
            <option value="theme">As designed ({session.theme.appearance === 'dark' ? 'dark' : 'light'})</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </Select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-ink-2">Projector sound
          <Select value={proj.sound} onChange={(e) => setProj({ sound: e.target.value as SoundLevel })} aria-label="Projector sound" data-testid="projector-sound">
            <option value="off">Off</option>
            <option value="subtle">Subtle</option>
            <option value="playful">Playful</option>
          </Select>
        </label>
        <div className="grid gap-1 text-xs font-semibold text-ink-2">
          <span className="flex items-center justify-between">Volume <span className="tabular">{Math.round(proj.volume * 100)}%</span></span>
          <div className="flex items-center gap-2">
            <button type="button" className="grid size-8 shrink-0 place-items-center rounded-lg hover:bg-ink/6" aria-label={proj.sound === 'off' ? 'Turn projector sound on' : 'Turn projector sound off'} onClick={() => setProj({ sound: proj.sound === 'off' ? 'subtle' : 'off' })} data-testid="projector-mute">{proj.sound === 'off' ? <VolumeX className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}</button>
            <input type="range" min={0} max={100} step={5} value={Math.round(proj.volume * 100)} onChange={(e) => setProj({ volume: Number(e.target.value) / 100 })} className="w-full accent-[var(--accent)]" aria-label="Projector volume" />
          </div>
        </div>
        {proj.sound === 'playful' && (
          <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-3"><input type="checkbox" className="size-4 accent-[var(--accent)]" checked={proj.music} onChange={(e) => setProj({ music: e.target.checked })} data-testid="projector-music" /> Background music on the projector (lobby, timed quizzes, results, breaks)</label>
        )}
        {snap.staff.permissions.includes('settings') && (
          <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-3"><input type="checkbox" className="size-4 accent-[var(--accent)]" checked={f.phoneSounds} onChange={(e) => void send({ cmd: 'features', patch: { phoneSounds: e.target.checked } })} data-testid="phone-sounds" /> Allow sounds on participants’ phones</label>
        )}
      </div>
      <p className="flex items-center gap-1.5 text-xs text-ink-3">{proj.appearance === 'dark' || (proj.appearance === 'theme' && session.theme.appearance === 'dark') ? <Moon className="size-3.5" aria-hidden /> : <Sun className="size-3.5" aria-hidden />} The projector never follows its computer’s light or dark setting; you choose here.</p>
      <BreakDialog open={breakOpen} onOpenChange={setBreakOpen} onStart={(b) => void send({ cmd: 'action', action: { type: 'startBreak', ...b } })} />
    </section>
  );
}
