import type { TourId } from './routes';

export interface TourStep {
  /** `data-tour` name(s) of the element to light up; the first one that is on screen wins. Absent: a centred card. */
  target?: string | string[];
  title: string;
  body: string;
  /** On phones the editor shows one pane at a time: switch to this one first. */
  pane?: 'slides' | 'edit' | 'preview';
  /** Skip the step when its target is not on this page right now (for example no presentations yet). */
  optional?: boolean;
}

export interface Tour {
  title: string;
  steps: TourStep[];
}

export const TOURS: Record<TourId, Tour> = {
  join: {
    title: 'Joining a session',
    steps: [
      { title: 'Join in a few taps', body: 'You do not need an app or an account. Here is how it works.' },
      { target: 'join-code', title: 'Type the code', body: 'The big screen shows a 6-digit code. Type it here, then press Continue.', optional: true },
      { target: 'join-scan', title: 'Or scan the QR code', body: 'Point your camera at the QR code on the screen and you are taken straight in.', optional: true },
      { title: 'Then wait for the first question', body: 'If the presenter asks for names, pick one. After that, each activity appears on your phone when the presenter opens it. Answer, and watch the results on the big screen.' },
    ],
  },

  library: {
    title: 'The Studio',
    steps: [
      { title: 'Welcome to the Presenter Studio', body: 'A one-minute tour of where things live. You can leave at any time and replay it from the Help menu.' },
      { target: 'lib-new', title: 'Start here', body: 'Create a presentation: give it a title, then add slides, quizzes, polls and word clouds. Or ask the AI assistant to build it for you.' },
      { target: 'lib-import', title: 'Bring one in', body: 'Import a presentation saved as JSON, for example one a colleague sent you or one you exported from here.' },
      { target: 'lib-decks', title: 'Your presentations', body: 'Each card shows what is inside. Edit opens the editor, and the three-dot menu renames, duplicates, exports or deletes it.', optional: true },
      { target: 'lib-start', title: 'Run it live', body: 'Start session gives you a 6-digit join code and a QR code for the room. Your audience joins on their phones.', optional: true },
      { target: 'lib-live', title: 'Sessions in progress', body: 'A session that is still running shows up here, so you can always get back to its controls.', optional: true },
      { target: 'lib-past', title: 'Results afterwards', body: 'Finished sessions land here with their results and a CSV export.' },
      { target: 'help', title: 'Help is always one tap away', body: 'Replay a tour or open the help centre from this menu whenever you like.' },
    ],
  },

  editor: {
    title: 'The editor',
    steps: [
      { target: 'ed-slides', pane: 'slides', title: 'Your slides', body: 'Every slide, in order. Drag the handle to reorder them, and use the three-dot menu to duplicate or delete.' },
      { target: 'ed-add', pane: 'slides', title: 'Add a slide', body: 'Choose a plain content slide or an activity: quiz, poll, word cloud, open question, rating scale or survey.' },
      { target: 'ed-form', pane: 'edit', title: 'Edit the selected slide', body: 'Write the question and the options here. Quizzes let you pick the correct answer, and every slide has private speaker notes.' },
      { target: 'ed-save', pane: 'edit', title: 'It saves itself', body: 'Changes are saved as you type. If something cannot be saved, this badge tells you what to fix.' },
      { target: ['ed-preview', 'ed-preview-btn'], pane: 'preview', title: 'See what the room sees', body: 'A live preview of the projector. Step through the slides to check how they look.' },
      { target: 'ed-ai', pane: 'edit', title: 'Ask the AI', body: 'Describe what you want, such as "a five-question quiz on fractions", and the assistant builds the slides right here. You can undo it afterwards.', optional: true },
      { target: 'ed-export', pane: 'edit', title: 'Keep a copy', body: 'More has the extras: import many questions at once from a spreadsheet or notes, rehearse privately with simulated participants, and export the presentation as JSON for backup or sharing.' },
      { target: 'ed-start', pane: 'edit', title: 'Run it live', body: 'Starts a session and takes you to the presenter controls. You will be asked whether to run it Standalone or as a Companion.' },
    ],
  },

  dashboard: {
    title: 'Running a session',
    steps: [
      { target: 'dash-join', title: 'Bring people in', body: 'Your audience scans the QR code or types the 6-digit code at this site’s address. They need no account.' },
      { target: 'dash-projector', title: 'Put it on the big screen', body: 'Open the projector in a new window and drag it onto the room’s display. Or type the projector code (below the QR code) on another computer.' },
      { target: 'dash-mode', title: 'Standalone or Companion', body: 'Standalone runs your slides here. Companion lets you teach in another app and launch activities only when you need them.', optional: true },
      { target: 'dash-stage', title: 'What the room sees', body: 'A live copy of the projector, so you always know what is on screen.' },
      { target: 'dash-controls', title: 'Run the activity', body: 'Open responses, close them, then reveal the results or the answer. The big blue button is usually the step you want next.' },
      { target: 'dash-flow', title: 'Jump anywhere', body: 'Pick any slide or activity to go straight to it. Participants stay connected all the while.' },
      { target: 'dash-private', title: 'Only you see this', body: 'Live results, moderation for typed answers, and your private speaker notes.' },
      { target: 'dash-end', title: 'When you are finished', body: 'Ending the session saves every response. Find the results and the CSV export in the Studio.', optional: true },
    ],
  },
};
