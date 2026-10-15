import { Ban, Hand, Layers, LifeBuoy, LogIn, ShieldCheck, Smartphone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { HelpLayout } from './HelpLayout';
import { B, Bullets, Faq, H3, P, Steps, TextLink, TourButton, type HelpSection } from './parts';

const SECTIONS: HelpSection[] = [
  {
    id: 'what',
    title: 'What is this?',
    icon: Smartphone,
    body: (
      <>
        <P>ClassInteract turns a presentation into a conversation. The presenter shows slides on the big screen, and <B>you take part on your own phone</B>: vote in polls, answer quizzes, add words to a word cloud, share how you feel.</P>
        <P>There is nothing to install and no account to make. If you can open a web page, you can join.</P>
      </>
    ),
  },
  {
    id: 'join',
    title: 'Join in three steps',
    icon: LogIn,
    body: (
      <>
        <Steps items={[
          <>Look for the <B>6-digit code</B> and the <B>QR code</B> on the big screen.</>,
          <>Scan the QR code with your phone camera, or open this website and type the code. If the presenter asks for names, type one.</>,
          <>Wait for the first activity. When the presenter opens one, it appears on your phone by itself.</>,
        ]} />
        <div className="flex flex-wrap gap-2.5">
          <TourButton id="join">Show me on the join page</TourButton>
          <Link to="/join" className="inline-flex h-10 items-center rounded-control border border-line-2 bg-surface px-4 text-sm font-semibold text-ink hover:border-ink-3 hover:bg-paper pointer-coarse:h-11" data-testid="help-go-join">Go to the join page</Link>
        </div>
      </>
    ),
  },
  {
    id: 'activities',
    title: 'The activities you will see',
    icon: Layers,
    body: (
      <>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ['Quiz', 'Pick the right answer before time runs out. Some quizzes let you tick several answers, match pairs (tap or drag), or put items in the right order. Correct and fast answers earn points.'],
            ['Poll', 'Choose an option and watch the bars move as everyone votes.'],
            ['Word cloud', 'Type a short word or phrase. The words people repeat grow bigger.'],
            ['Open question', 'Write a short answer. The presenter may show some on screen.'],
            ['Rating', 'Slide to a number on a scale, such as 1 to 5.'],
            ['Survey', 'Answer a few questions in one go, then send them together.'],
          ].map(([name, text]) => (
            <div key={name} className="rounded-2xl border border-line bg-surface p-4">
              <p className="font-bold text-ink">{name}</p>
              <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-2">{text}</p>
            </div>
          ))}
        </div>
        <P>Between activities your phone shows a short waiting message. That just means the presenter is on a normal slide. Stay on the page and the next activity will appear.</P>
      </>
    ),
  },
  {
    id: 'answering',
    title: 'Answering well',
    icon: Hand,
    body: (
      <Bullets items={[
        <><B>Answer while the activity is open.</B> When the presenter closes it, answers can no longer be sent.</>,
        <>Once you send an answer it is <B>locked in</B>. Some questions send as soon as you tap an option, so choose carefully.</>,
        <>In a quiz, correct answers earn points, and some quizzes give extra for speed. A leaderboard may appear on the big screen between questions.</>,
        <>The correct answer is shown only when the presenter chooses to reveal it.</>,
        <>If you lose your connection, your phone reconnects by itself. Your answers are not lost.</>,
      ]} />
    ),
  },
  {
    id: 'privacy',
    title: 'Names and privacy',
    icon: ShieldCheck,
    body: (
      <Bullets items={[
        <>You only ever give a <B>display name</B>, and only if the presenter turned names on. There are no accounts, emails or passwords.</>,
        <>Your phone remembers your last name so that joining next time is quicker.</>,
        <>Typed answers can be moderated: the presenter can hide anything inappropriate before the room sees it.</>,
        <>The presenter can remove a participant from a session.</>,
      ]} />
    ),
  },
  {
    id: 'cannot',
    title: 'What you cannot do (on purpose)',
    icon: Ban,
    body: (
      <>
        <P>ClassInteract is something the presenter <B>runs</B>, not a file you hand in. So participants cannot:</P>
        <Bullets items={[
          <><B>Create or submit activities.</B> Only the presenter builds them, in the Presenter Studio, which is protected by a password.</>,
          <><B>Use a code to take control.</B> The 6-digit code on the screen only lets you into <i>that</i> live session as a participant. It stops working when the session ends.</>,
          <><B>See the answers early</B> or peek at other people&rsquo;s responses before the presenter shows them.</>,
        ]} />
        <P>The presenter also has a separate <i>projector code</i>. It is never shown to the audience, and it does not let you answer anything.</P>
      </>
    ),
  },
  {
    id: 'trouble',
    title: 'Something not working?',
    icon: LifeBuoy,
    body: (
      <div className="grid gap-2.5">
        <H3>Questions people ask</H3>
        <Faq q="My code does not work">
          <P>Check that you typed all <B>6 digits</B>, with nothing before or after. If you see &ldquo;That session has already ended&rdquo;, the presenter has finished that session. Ask them for the new code.</P>
        </Faq>
        <Faq q="The QR code or link will not open">
          <P>Make sure your phone has a working connection. If the session is running on a laptop at the front of the room, your phone may need to be on the <B>same Wi-Fi</B> as the laptop (not mobile data). Ask the presenter, or just type the code on the join page.</P>
        </Faq>
        <Faq q="I closed the page by accident">
          <P>Scan the QR code again, or enter the same code on the same phone. You are put back as the same participant, without choosing a name again.</P>
        </Faq>
        <Faq q="Nothing is showing on my phone">
          <P>You are probably in the waiting room, or the presenter is on a slide that does not need an answer. The next activity appears by itself. If the page looks frozen, refresh it.</P>
        </Faq>
        <Faq q="I pressed send but want to change my answer">
          <P>Answers are final once sent. Next time, check your choice before you send it.</P>
        </Faq>
        <Faq q="I am the presenter. Where do I go?">
          <P>Open the <TextLink to="/studio">Presenter Studio</TextLink> to build and run presentations, and see the <TextLink to="/studio/help">presenter guide</TextLink>.</P>
        </Faq>
      </div>
    ),
  },
];

/** The public help page: written for the people in the room, in plain language. */
export default function ParticipantHelp() {
  return (
    <HelpLayout
      variant="participants"
      title="Help for participants"
      intro={<>Joining a live session and taking part, in plain language. Looking for the guide to <i>running</i> sessions? Switch to <B>For presenters</B> below.</>}
      sections={SECTIONS}
    />
  );
}
