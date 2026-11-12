/**
 * Who may do what while a session runs. The owner (the Studio) can do everything. Teaching assistants get revocable
 * links with one of two narrower roles. The server checks every command against this table.
 */
export type StaffRole = 'owner' | 'copresenter' | 'moderator' | 'speaker';
export type DelegateRole = Exclude<StaffRole, 'owner'>;

export type Permission =
  | 'navigate' // move through slides, open/close responses, reveal, leaderboard, run again
  | 'screen' // projector overlays, breaks, highlight a question, projector appearance and sound
  | 'end' // end the session
  | 'mode' // switch Standalone / Companion
  | 'moderate' // hide / approve responses, review typed answers, regroup word clouds
  | 'qa' // moderate audience questions
  | 'participants' // remove people, manage teams
  | 'settings' // turn Q&A, pulse, teams, phone sounds on or off
  | 'access'; // create and revoke access links

const TABLE: Record<StaffRole, readonly Permission[]> = {
  owner: ['navigate', 'screen', 'end', 'mode', 'moderate', 'qa', 'participants', 'settings', 'access'],
  copresenter: ['navigate', 'screen', 'mode', 'moderate', 'qa'],
  moderator: ['moderate', 'qa', 'participants'],
  // Presenter phones: the server further limits them to Next and Previous.
  speaker: ['navigate'],
};

export function can(role: StaffRole, p: Permission): boolean {
  return TABLE[role].includes(p);
}

export function permissionsOf(role: StaffRole): Permission[] {
  return [...TABLE[role]];
}

export const ROLE_LABEL: Record<StaffRole, string> = { owner: 'Presenter', copresenter: 'Co-presenter', moderator: 'Moderator', speaker: 'Presenter phone' };
export const ROLE_HINT: Record<DelegateRole, string> = {
  copresenter: 'Moves through slides, opens and closes responses, reveals results and controls the projector. Cannot end the session or remove people.',
  moderator: 'Approves and hides responses and questions, reviews typed answers and manages participants. Cannot change what is on screen.',
  speaker: 'Shows cue points for their own slides and buzzes when their turn is near. Can only move to the next or previous slide.',
};

/** Navigation a presenter phone may send. Anything else from a phone is refused. */
export const SPEAKER_ACTIONS = ['next', 'previous'] as const;
