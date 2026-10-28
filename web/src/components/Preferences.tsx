import { Monitor, Moon, Play, Sun, Volume1, Volume2, VolumeX } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { audio, PACKS, type SoundId } from '@/audio/engine';
import { saveSoundSettings, useSoundSettings, type AudioScope, type SoundLevel } from '@/audio/settings';
import { Button } from '@/components/ui/button';
import { SwitchRow } from '@/components/ui/switch';
import { useAppearance, type AppearancePref, type AppearanceScope } from '@/lib/appearance';
import { cn } from '@/lib/cn';

const APPEARANCE: { id: AppearancePref; label: string; icon: typeof Sun }[] = [
  { id: 'system', label: 'System', icon: Monitor },
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
];

/** Light / dark / follow the system. `compact` is an icon button with a menu (headers); otherwise a segmented control. */
export function AppearanceToggle({ scope, compact = false }: { scope: Exclude<AppearanceScope, 'projector'>; compact?: boolean }) {
  const { pref, resolved, set } = useAppearance(scope);
  if (compact) {
    // one button that cycles System → Light → Dark (no menu library, so phones download almost nothing for it)
    const order: AppearancePref[] = ['system', 'light', 'dark'];
    const next = order[(order.indexOf(pref) + 1) % order.length];
    const Icon = pref === 'system' ? Monitor : resolved === 'dark' ? Moon : Sun;
    return (
      <Button variant="ghost" size="icon-sm" onClick={() => set(next)} aria-label={`Appearance: ${pref}. Switch to ${next}`} title={`Appearance: ${pref}`} data-testid="appearance-menu" data-pref={pref}>
        <Icon className="size-4" aria-hidden />
      </Button>
    );
  }
  return (
    <div role="radiogroup" aria-label="Appearance" className="inline-flex rounded-control bg-ink/6 p-1" data-testid="appearance-segment">
      {APPEARANCE.map((a) => (
        <button key={a.id} type="button" role="radio" aria-checked={pref === a.id} onClick={() => set(a.id)} data-testid={`appearance-${a.id}`}
          className={cn('inline-flex items-center gap-1.5 rounded-[0.6rem] px-3 py-1.5 text-[0.8125rem] font-semibold transition-colors pointer-coarse:min-h-10', pref === a.id ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink')}>
          <a.icon className="size-3.5" aria-hidden /> {a.label}
        </button>
      ))}
    </div>
  );
}

/** One tap mutes or unmutes this device. Always visible where sound can play. */
export function MuteButton({ scope, className }: { scope: AudioScope; className?: string }) {
  const s = useSoundSettings(scope);
  const silent = s.muted || s.level === 'off';
  const Icon = silent ? VolumeX : s.master < 0.4 ? Volume1 : Volume2;
  return (
    <Button variant="ghost" size="icon-sm" className={className} aria-pressed={silent} aria-label={silent ? 'Sound is off. Turn sound on' : 'Mute sound'} data-testid="mute-toggle"
      onClick={() => {
        if (s.level === 'off') saveSoundSettings(scope, { level: 'subtle', muted: false });
        else saveSoundSettings(scope, { muted: !s.muted });
        void audio.unlock();
        audio.refresh();
      }}>
      <Icon className="size-4" aria-hidden />
    </Button>
  );
}

const LEVELS: { id: SoundLevel; label: string; hint: string }[] = [
  { id: 'off', label: 'Off', hint: 'No sound at all.' },
  { id: 'subtle', label: 'Subtle', hint: 'Only what matters: answers, results, time up.' },
  { id: 'playful', label: 'Playful', hint: 'Game-show sounds and, on the projector, music.' },
];

const PREVIEW: { id: SoundId; label: string }[] = [
  { id: 'sessionStart', label: 'Session start' }, { id: 'activityStart', label: 'Activity starts' }, { id: 'submit', label: 'Answer sent' },
  { id: 'tickFinal', label: 'Final seconds' }, { id: 'timeUp', label: 'Time up' }, { id: 'reveal', label: 'Answer revealed' },
  { id: 'correct', label: 'Correct' }, { id: 'incorrect', label: 'Incorrect' }, { id: 'points', label: 'Points' },
  { id: 'leaderboard', label: 'Leaderboard' }, { id: 'podium', label: 'Winner' }, { id: 'question', label: 'Question asked' },
];

function Slider({ label, value, onChange, testId }: { label: string; value: number; onChange: (v: number) => void; testId?: string }) {
  return (
    <label className="grid gap-1 text-sm font-semibold">
      <span className="flex justify-between">{label} <span className="tabular text-ink-3">{Math.round(value * 100)}%</span></span>
      <input type="range" min={0} max={100} step={5} value={Math.round(value * 100)} onChange={(e) => onChange(Number(e.target.value) / 100)} className="w-full accent-[var(--accent)]" aria-label={label} data-testid={testId} />
    </label>
  );
}

/** Full sound settings for one kind of device, with a preview of every sound. */
export function SoundSettingsPanel({ scope, preview = false }: { scope: AudioScope; preview?: boolean }) {
  const s = useSoundSettings(scope);
  const state = useSyncExternalStore((cb) => audio.subscribe(cb), () => audio.state(), () => 'off' as const);
  const save = (p: Parameters<typeof saveSoundSettings>[1]) => { saveSoundSettings(scope, p); audio.refresh(); };
  return (
    <div className="grid gap-4" data-testid={`sound-settings-${scope}`}>
      <div role="radiogroup" aria-label="Sound" className="grid grid-cols-3 gap-2">
        {LEVELS.map((l) => (
          <button key={l.id} type="button" role="radio" aria-checked={s.level === l.id} onClick={() => save({ level: l.id, muted: false })} data-testid={`sound-level-${l.id}`}
            className={cn('grid gap-0.5 rounded-xl border-2 p-2.5 text-left transition-colors', s.level === l.id ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-2')}>
            <span className="font-bold">{l.label}</span>
            <span className="text-xs leading-snug text-ink-2">{l.hint}</span>
          </button>
        ))}
      </div>
      {s.level !== 'off' && (
        <>
          <SwitchRow label="Mute" checked={s.muted} onChange={(muted) => save({ muted })} />
          <Slider label="Volume" value={s.master} onChange={(master) => save({ master })} testId="volume-master" />
          <Slider label="Sound effects" value={s.sfx} onChange={(sfx) => save({ sfx })} />
          {scope !== 'participant' && (
            <>
              <SwitchRow label="Background music" hint={scope === 'projector' ? 'Lobby, timed quizzes, results and breaks. Playful only.' : 'Plays on this device only when you choose Playful.'} checked={s.musicEnabled} onChange={(musicEnabled) => save({ musicEnabled })} />
              {s.musicEnabled && <Slider label="Music" value={s.music} onChange={(music) => save({ music })} />}
            </>
          )}
          <label className="grid gap-1 text-sm font-semibold">Sound pack
            <select className="h-10 rounded-control border border-line-2 bg-surface px-3 text-sm font-medium" value={s.pack} onChange={(e) => save({ pack: e.target.value as typeof s.pack })} data-testid="sound-pack">
              {Object.entries(PACKS).map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}
            </select>
          </label>
        </>
      )}
      {preview && (
        <div className="grid gap-2" data-testid="sound-preview">
          <p className="text-sm font-semibold">Preview {state === 'blocked' && <span className="font-normal text-ink-3">(tap a sound to enable audio)</span>}</p>
          <div className="flex flex-wrap gap-1.5">
            {PREVIEW.map((p) => (
              <Button key={p.id} variant="secondary" size="sm" onClick={async () => { await audio.unlock(); audio.play(p.id, { force: true }); }} data-testid={`preview-${p.id}`}><Play className="size-3" aria-hidden /> {p.label}</Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
