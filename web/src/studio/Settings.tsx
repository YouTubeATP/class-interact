import { AppearanceToggle, SoundSettingsPanel } from '@/components/Preferences';
import { StudioHeader } from './StudioRoutes';

/** The presenter's own preferences on this device. The projector's look and sound are set per session, on the dashboard. */
export default function SettingsPage() {
  return (
    <div className="min-h-dvh bg-paper">
      <StudioHeader />
      <main className="mx-auto grid max-w-2xl gap-8 px-4 py-8 sm:px-6" data-testid="settings-page">
        <div className="grid gap-1.5">
          <h1 className="display text-[2.2rem]">Settings</h1>
          <p className="text-ink-2">For this device only. Participants choose their own appearance and sound on their phones.</p>
        </div>
        <section className="grid gap-3 rounded-card border border-line bg-surface p-5" aria-labelledby="appearance-h">
          <h2 id="appearance-h" className="text-lg">Appearance</h2>
          <p className="text-sm text-ink-2">System follows your computer’s light or dark setting. The projector is separate: you choose its look for each session on the dashboard, and it never changes by itself.</p>
          <AppearanceToggle scope="studio" />
        </section>
        <section className="grid gap-3 rounded-card border border-line bg-surface p-5" aria-labelledby="sound-h">
          <h2 id="sound-h" className="text-lg">Sound on this device</h2>
          <p className="text-sm text-ink-2">Room sound and music come from the projector: set them on the session dashboard. Here you choose the cues this computer or phone plays while you present (time up, all answered, new questions).</p>
          <SoundSettingsPanel scope="studio" preview />
        </section>
      </main>
    </div>
  );
}
