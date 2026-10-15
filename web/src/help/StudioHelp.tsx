import { BarChart3, Hammer, KeyRound, LifeBuoy, MonitorPlay, Rocket, Share2, Sparkles } from 'lucide-react';
import { SLIDE_TYPES } from '@classinteract/shared';
import { typeMeta } from '@/activities/meta';
import { useClientConfig } from '@/lib/joinUrl';
import { StudioHeader } from '@/studio/StudioRoutes';
import { HelpLayout } from './HelpLayout';
import { B, Bullets, Faq, H3, P, Steps, TextLink, TourButton, Tip, type HelpSection } from './parts';

function AiSection({ enabled }: { enabled: boolean | undefined }) {
  return (
    <>
      <P>The <B>AI assistant</B> builds and edits slides from a plain-language request, right inside the editor. Open it with the <B>AI assistant</B> button at the top of the editor.</P>
      <Steps items={[
        <>Ask for what you want: <i>&ldquo;Make a five-question quiz on fractions for year 6&rdquo;</i> or <i>&ldquo;Add a word cloud asking what people already know about volcanoes&rdquo;</i>.</>,
        <>Watch the slides appear in the editor as it works. Every change goes through the same checks as a manual edit and saves automatically.</>,
        <>Not right? Press <B>Undo</B> to put the presentation back as it was before the assistant&rsquo;s last turn, or just ask for changes.</>,
      ]} />
      <Bullets items={[
        <>It can <B>add, change, delete and reorder slides</B>, and set the title and colour theme. It cannot start sessions or see participants.</>,
        <>Always read what it wrote, especially quiz answers: AI can be confidently wrong.</>,
        <><B>New chat</B> (the circular arrow) clears the conversation but keeps your presentation.</>,
      ]} />
      {enabled === false && <Tip title="Not showing up?">The AI assistant is switched off on this server. Whoever runs it turns it on by setting an <code className="rounded bg-ink/6 px-1">AIMLAPI_KEY</code>. Everything else works without it.</Tip>}
      {enabled === true && <Tip title="Good news">The AI assistant is turned on for this server.</Tip>}
    </>
  );
}

/** The Studio help page: how to build, run and share presentations. Lives behind the Studio sign-in. */
export default function StudioHelp() {
  const cfg = useClientConfig();

  const sections: HelpSection[] = [
    {
      id: 'quickstart',
      title: 'Quick start',
      icon: Rocket,
      body: (
        <>
          <Steps items={[
            <>In the <TextLink to="/studio">Studio</TextLink>, press <B>New presentation</B> and give it a title.</>,
            <>Press <B>Add</B> to put in slides: a plain content slide, or an activity such as a quiz or poll.</>,
            <>Check it in the <B>Live preview</B>. Everything saves by itself.</>,
            <>Press <B>Start session</B>. Choose how you will present, then share the join code or QR code.</>,
            <>Run it from the controls. When you finish, press <B>End session</B> and open the results.</>,
          ]} />
          <div className="flex flex-wrap gap-2.5">
            <TourButton id="library">Take the Studio tour</TourButton>
          </div>
          <Tip title="Tours for each page">Open <B>Help</B> at the top of the editor or the session controls and choose <B>Tour of this page</B> to be guided around that screen.</Tip>
        </>
      ),
    },
    {
      id: 'build',
      title: 'Build a presentation',
      icon: Hammer,
      body: (
        <>
          <H3>Slide types</H3>
          <div className="grid gap-2.5 sm:grid-cols-2" data-testid="help-types">
            {SLIDE_TYPES.map((t) => {
              const m = typeMeta[t];
              return (
                <div key={t} data-tone={t} className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-3.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-tone text-tone-ink"><m.icon className="size-[1.1rem]" aria-hidden /></span>
                  <div className="min-w-0"><p className="font-bold text-ink">{m.label}</p><p className="text-[0.9375rem] leading-snug text-ink-2">{m.description}</p></div>
                </div>
              );
            })}
          </div>
          <H3>Quiz question types</H3>
          <Bullets items={[
            <><B>One correct answer</B>: the classic. Add a time limit and optional speed bonus.</>,
            <><B>Several correct answers</B>: tick every right option. Turn partial credit on to reward partly right answers.</>,
            <><B>Matching</B>: pairs to connect, by tap or drag and drop.</>,
            <><B>Ordering</B>: write the items in the correct order; phones see them shuffled.</>,
          ]} />
          <P>Phones and the projector are never sent the answers. They are only revealed when you press <B>Reveal answer</B>.</P>
          <H3>Good to use</H3>
          <Bullets items={[
            <><B>Speaker notes</B> on any slide are private and appear only on your controls.</>,
            <><B>Presentation settings</B> (top of the slide list) set the title, description, colours and background.</>,
            <>Content slides take text, numbered steps, an image, and an optional <B>callout</B> (not on title-only slides).</>,
            <>The <B>JSON</B> tab shows the whole presentation as text. Experts can edit it directly; mistakes are listed with the exact place to fix.</>,
            <>If a slide shows a warning, the badge at the top says <i>Fix N problems to save</i> until it is resolved.</>,
          ]} />
        </>
      ),
    },
    {
      id: 'ai',
      title: 'The AI assistant',
      icon: Sparkles,
      body: <AiSection enabled={cfg?.aiEnabled} />,
    },
    {
      id: 'run',
      title: 'Run it live',
      icon: MonitorPlay,
      body: (
        <>
          <H3>Starting</H3>
          <P>Press <B>Start session</B> from the library or the editor. You choose two things:</P>
          <Bullets items={[
            <><B>Standalone</B>: ClassInteract shows your slides on the projector and you move through them from your controls.</>,
            <><B>Companion</B>: you teach in another app (PowerPoint, a whiteboard, anything) and launch activities from the list only when you need them. Participants stay connected and see a standby screen in between.</>,
          ]} />
          <P>You can also ask for <B>participant names</B>. You can switch between Standalone and Companion mid-session.</P>
          <H3>Getting the room connected</H3>
          <Steps items={[
            <>On the controls page, press <B>Open projector</B>. It opens in a new window: drag that window onto the room&rsquo;s display and go full screen. Or, on the display&rsquo;s own computer, open this site and type the <B>projector code</B> in the box where participants type theirs.</>,
            <>The projector shows a <B>QR code and a 6-digit join code</B>. Participants scan it, or type the code on this site&rsquo;s address.</>,
            <>Watch the <B>participants</B> count rise. Open the list to remove anyone who should not be there.</>,
          ]} />
          <H3>Running an activity</H3>
          <P>Each activity moves through four steps, shown above the buttons: <B>Ready</B> → <B>Open</B> → <B>Closed</B> → <B>Results</B>. The big blue button is always the most likely next step.</P>
          <Bullets items={[
            <><B>Open responses</B> lets phones answer. A counter shows how many have answered.</>,
            <><B>Close responses</B> stops answers. Then <B>Show results</B> or <B>Reveal answer</B> puts them on the big screen. You can hide them again.</>,
            <><B>Show leaderboard</B> ranks the scores so far. <B>Standby screen</B> clears the activity.</>,
            <>On the right, <B>Results</B> shows live numbers that only you see. <B>Moderate</B> lets you approve or hide typed answers before the room sees them.</>,
            <>Pick any slide in <B>Lesson flow</B> to jump to it (Standalone), or any activity in <B>Launch an activity</B> (Companion).</>,
          ]} />
        </>
      ),
    },
    {
      id: 'codes',
      title: 'Codes and passwords',
      icon: KeyRound,
      body: (
        <>
          <P>Three different codes do three different jobs. Keep them straight and nothing gets mixed up.</P>
          <div className="grid gap-2.5">
            {[
              ['Join code', '6 digits', 'Shown to the room on the projector. Lets anyone in as a participant of that live session. Stops working when the session ends.'],
              ['Projector code', '6 digits', 'Shown only on your controls. Typed on another computer, it turns that computer into the projector. Do not share it with the audience.'],
              ['Studio password', 'Set by the host', 'Protects the Presenter Studio, where presentations are made and sessions run. Participants never need it.'],
            ].map(([name, kind, text]) => (
              <div key={name} className="grid gap-1 rounded-2xl border border-line bg-surface p-4">
                <p className="flex flex-wrap items-baseline gap-x-2 font-bold text-ink">{name} <span className="text-xs font-semibold text-ink-3">{kind}</span></p>
                <p className="text-[0.9375rem] leading-relaxed text-ink-2">{text}</p>
              </div>
            ))}
          </div>
          <Tip title="Why participants cannot submit anything">ClassInteract is a live service that the presenter runs. Participants can only answer; they cannot add activities, change slides or reach the Studio with a code.</Tip>
        </>
      ),
    },
    {
      id: 'results',
      title: 'Results',
      icon: BarChart3,
      body: (
        <Bullets items={[
          <>When you <B>End session</B>, everything is saved. Participants see a closing screen.</>,
          <>Find finished sessions under <B>Past sessions</B> in the library. <B>Results</B> shows every activity with its answers, and for quizzes who got what right.</>,
          <><B>CSV</B> downloads the answers as a spreadsheet for marking or records.</>,
          <>Deleting a presentation keeps the results of sessions you already ran. Deleting a session&rsquo;s results removes them for good, so export the CSV first.</>,
        ]} />
      ),
    },
    {
      id: 'share',
      title: 'Share and back up',
      icon: Share2,
      body: (
        <>
          <P>A presentation is a small <B>JSON file</B>. Use <B>Export JSON</B> (in the editor, or the three-dot menu on a card) to download it, and <B>Import JSON</B> in the library to bring one in.</P>
          <Faq q="Can I hand a presentation in like a PowerPoint file?">
            <P>Not as a PowerPoint: the activities only come alive while a session is running. What you can do:</P>
            <Bullets items={[
              <><B>Present it live</B> and let the class or teacher join with the code.</>,
              <><B>Send the exported JSON.</B> Someone with their own ClassInteract imports it, edits it and runs it themselves.</>,
              <><B>Share the Studio address and password</B> with a colleague so they can open and run it.</>,
            ]} />
          </Faq>
          <Faq q="Can a participant send me an activity?">
            <P>No. Only people signed in to the Studio can create activities. Participants answer what you open for them.</P>
          </Faq>
          <Faq q="Can I generate a presentation with another tool?">
            <P>Yes. Ask any AI to write a presentation in ClassInteract&rsquo;s JSON format, then use <B>Import JSON</B>. Errors are listed with the exact path to fix.</P>
          </Faq>
        </>
      ),
    },
    {
      id: 'trouble',
      title: 'Troubleshooting',
      icon: LifeBuoy,
      body: (
        <div className="grid gap-2.5">
          <Faq q="Phones cannot open the link or QR code">
            <Bullets items={[
              <>Phones must be on the <B>same Wi-Fi</B> as the computer running ClassInteract, not mobile data, unless the site is published online.</>,
              <>Allow <B>Node.js</B> through the computer&rsquo;s firewall for private networks.</>,
              <>On the controls page open <B>Phone can&rsquo;t open the link?</B> and pick another network address. The right one usually starts <code className="rounded bg-ink/6 px-1">192.168.</code>.</>,
              <>If the QR code shows <i>localhost</i>, the host needs to set <code className="rounded bg-ink/6 px-1">PUBLIC_URL</code>, or you should open the Studio using the computer&rsquo;s network address.</>,
            ]} />
          </Faq>
          <Faq q="The projector window is blank or says it cannot connect">
            <P>Check the controls page still shows <B>Live</B>. Reopen it with <B>Open projector</B>, or type the projector code again. Closing the session ends the projector too.</P>
          </Faq>
          <Faq q="The AI assistant button is missing">
            <P>It only appears when the server has an AI key. See <a href="#ai" className="font-semibold text-accent-ink underline decoration-accent/40 underline-offset-2">The AI assistant</a> above.</P>
          </Faq>
          <Faq q="The editor says &ldquo;Fix problems to save&rdquo;">
            <P>A slide has something missing, such as an empty question or missing options. Slides with problems are marked in the list, and the slide itself says what to change.</P>
          </Faq>
          <Faq q="I ended the session by mistake">
            <P>Ended sessions cannot be reopened, but nothing is lost. Start a new session from the same presentation, and open the results of the old one from the library.</P>
          </Faq>
          <Faq q="I forgot the Studio password">
            <P>It is set by whoever runs the server (the <code className="rounded bg-ink/6 px-1">STUDIO_PASSWORD</code> setting). Ask them, or see the project README if that is you.</P>
          </Faq>
        </div>
      ),
    },
  ];

  return (
    <HelpLayout
      variant="presenters"
      header={<StudioHeader />}
      title="Help for presenters"
      intro={<>How to build a presentation, run it live and share it. Want to see what your audience sees? Switch to <B>For participants</B> below.</>}
      sections={sections}
      actions={<TourButton id="library">Take the Studio tour</TourButton>}
    />
  );
}
