import { ChevronDown, Footprints, Loader2, MonitorPlay, PanelsTopLeft } from 'lucide-react';
import { useState } from 'react';
import type { FeaturesPatch, SessionMode } from '@classinteract/shared';
import { Button } from '@/components/ui/button';
import { DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/label';
import { Input, Select } from '@/components/ui/input';
import { SwitchRow } from '@/components/ui/switch';
import { cn } from '@/lib/cn';

export interface StartOptions {
  mode: SessionMode;
  collectNames: boolean;
  features?: FeaturesPatch;
}

const MODES: { id: SessionMode; icon: typeof MonitorPlay; title: string; body: string }[] = [
  { id: 'standalone', icon: MonitorPlay, title: 'Standalone', body: 'Present everything here: slides, activities and results in order, on one screen.' },
  { id: 'companion', icon: PanelsTopLeft, title: 'Companion', body: 'Teach in Canva, PowerPoint or Google Slides. Launch any activity from here when you need it.' },
  { id: 'selfpaced', icon: Footprints, title: 'Self-paced', body: 'Participants work through the activities on their own, at their own speed, until a deadline.' },
];

const localInput = (ms: number) => {
  const d = new Date(ms - new Date().getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
};

/**
 * Starting a session needs one decision (how you will present). Everything else has a sensible default and sits
 * under "More options", so a teacher can start a quiz in two clicks.
 */
export function StartSessionDialog({ open, onOpenChange, title, onStart }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; onStart: (o: StartOptions) => Promise<void> }) {
  const [mode, setMode] = useState<SessionMode>('standalone');
  const [collectNames, setCollectNames] = useState(false);
  const [more, setMore] = useState(false);
  const [qa, setQa] = useState(true);
  const [premoderate, setPremoderate] = useState(false);
  const [pulse, setPulse] = useState(true);
  const [teams, setTeams] = useState(false);
  const [continuity, setContinuity] = useState(false);
  const [phoneSounds, setPhoneSounds] = useState(true);
  const [deadline, setDeadline] = useState(() => localInput(Date.now() + 7 * 24 * 3600_000));
  const [reveal, setReveal] = useState<'immediately' | 'after-close' | 'never'>('after-close');
  const [busy, setBusy] = useState(false);

  const features = (): FeaturesPatch => ({
    qa: { enabled: qa, premoderate },
    pulse: { enabled: pulse },
    teams: { enabled: teams },
    continuity,
    phoneSounds,
    ...(mode === 'selfpaced' ? { selfPaced: { deadlineAt: deadline ? new Date(deadline).getTime() : null, reveal } } : {}),
  });

  return (
    <DialogContent open={open} onOpenChange={onOpenChange} wide title="Start a live session" description={`“${title}”: participants join with one code and stay connected the whole time.`}>
      <div className="grid gap-5">
        <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Session mode">
          {MODES.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} onClick={() => setMode(m.id)} data-testid={`mode-${m.id}`}
              className={cn('grid content-start gap-2 rounded-2xl border-2 p-4 text-left transition-colors', mode === m.id ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-2')}>
              <span className={cn('grid size-9 place-items-center rounded-xl', mode === m.id ? 'bg-accent text-white' : 'bg-ink/6 text-ink-2')}><m.icon className="size-5" aria-hidden /></span>
              <span className="font-bold">{m.title}</span>
              <span className="text-[0.8125rem] leading-snug text-ink-2">{m.body}</span>
            </button>
          ))}
        </div>
        <SwitchRow label="Ask participants for a name" hint={collectNames ? 'They type a name before entering. Best when you need to know who is who, e.g. leaderboards.' : 'Scanning the code takes them straight in with a friendly name they can change any time.'} checked={collectNames} onChange={setCollectNames} />
        {mode === 'selfpaced' && (
          <div className="grid gap-3 rounded-2xl border border-line bg-paper/60 p-4 sm:grid-cols-2" data-testid="selfpaced-options">
            <Field label="Deadline" hint="Leave empty for no deadline. You can close it early."><Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} data-testid="selfpaced-deadline" /></Field>
            <Field label="Show people whether they were right">
              <Select value={reveal} onChange={(e) => setReveal(e.target.value as typeof reveal)} aria-label="When to show answers">
                <option value="immediately">Straight after each answer</option>
                <option value="after-close">After the session closes</option>
                <option value="never">Never</option>
              </Select>
            </Field>
          </div>
        )}
        <div className="rounded-2xl border border-line">
          <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-ink-2" aria-expanded={more} onClick={() => setMore((m) => !m)} data-testid="start-more">
            More options <span className="flex items-center gap-2 text-xs font-medium text-ink-3">Q&A, understanding check, teams, … <ChevronDown className={cn('size-4 transition-transform', more && 'rotate-180')} aria-hidden /></span>
          </button>
          {more && (
            <div className="grid gap-1 border-t border-line px-4 py-3">
              <SwitchRow label="Audience questions (Q&A)" hint="People can ask and upvote questions at any time, separately from the activities." checked={qa} onChange={setQa} />
              {qa && <SwitchRow label="Approve questions before others see them" checked={premoderate} onChange={setPremoderate} />}
              <SwitchRow label="Understanding check" hint="A small Got it / Unsure / Lost signal people can change any time. You see only the totals." checked={pulse} onChange={setPulse} />
              <SwitchRow label="Teams" hint="People are put into teams automatically; a team leaderboard appears next to the individual one." checked={teams} onChange={setTeams} />
              <SwitchRow label="Offer “remember me across sessions”" hint="Optional for participants, with their consent. Lets you follow a class’s progress over several lessons." checked={continuity} onChange={setContinuity} />
              <SwitchRow label="Sounds on participants’ phones" hint="Off silences every phone in this session. Room sound comes from the projector." checked={phoneSounds} onChange={setPhoneSounds} />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={busy} data-testid="start-session-confirm" onClick={async () => { setBusy(true); try { await onStart({ mode, collectNames, features: features() }); } finally { setBusy(false); } }}>
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Start session
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}
