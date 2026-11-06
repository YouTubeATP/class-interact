/**
 * The HKUST pieces: six compositions scored for orchestra (score.ts), built on material from and about the Hong Kong
 * University of Science and Technology. Nothing here is shared with the band styles: the music, its orchestration,
 * the instruments (instruments.ts), the hall (hall.ts) and every sound effect (sfx.ts) are the set's own.
 *
 * Leitmotifs from the University Anthem (melody by Prof. Kelvin Yuen, 2023; © HKUST). Transcribed for this purpose
 * from the official recording (hkust.edu.hk, "Our anthem", full version): the vocals were separated from the
 * accompaniment (Demucs), each sung note's onset detected and its pitch taken as the median of a pYIN pitch track,
 * and onsets quantized to sixteenths of a beat grid tracked on the accompaniment (about 70 beats a minute, D major).
 * Repeated notes are separate syllables in the anthem and are kept. The pickup into the call (F♯–G) is the one
 * uncertain spot. Only these two short phrases are quoted; everything around them is original:
 *   CALL   (pickup F♯ G) A · A A | E E F♯ · D C♯ D · E | F♯      the opening phrase
 *   CLIMB  D D G F♯ G G B | A F♯ F♯ E D D B C♯ D · F♯ E | E       the second phrase
 *
 * From the name itself:
 *   HKUST in notes   B–D–G–E♭–F: German letter names (H = B natural, S = "Es" = E-flat), as in Bach's B-A-C-H and
 *                    the cryptograms of Schumann, Ravel and Shostakovich. In D major the E♭ is the Neapolitan
 *                    (flat II), so the HKUST bridges turn through G – E♭ – F before the dominant.
 *   HKUST in Morse   ···· −·− ··− ··· −  tapped on a temple block (dot = a sixteenth, dash = three) in the bridges
 *                    and the countdown.
 *   The bell         The pieces open with the cryptogram rung on tubular bells, like a campus bell.
 *   1991             The year HKUST opened: the lobby runs at 91 beats a minute.
 *   Clear Water Bay  The campus sits on the sea: the lobby, the break and the end have waves under them.
 *   A major          The session ends in A, whose subdominant is the anthem's D: the final plagal "amen" cadence goes
 *                    from the anthem's home chord to A.
 * Titles name places and moments on campus: Atrium, Problem set, Last call, Piazza, Clear Water Bay, Commencement.
 */
import { noteToMidi } from '../theory';
import type { MusicId } from '../engine';
import type { Score } from './score';

const D3_A2: [number, number] = [noteToMidi('D3'), noteToMidi('A2')];

// --- the motifs, in D, at the anthem's rhythm (one octave up, where the trumpet sings) --------------------------
/** The pickup bar and the CALL: chords `A7 | D`. */
const CALL = 'r:3 F#5:.25 G5:.5 A4:.25 | A4:.25 A4:.5 E5:.5 E5:.25 F#5:.75 D5:.25 C#5:.25 D5:.75 E5:.5';
/** The CLIMB: chords `D G | A Bm`. */
const CLIMB = 'F#5:.25 F#5:1 D5:.5 D5:.25 G5:.25 F#5:.25 G5:.5 G5:.5 B5:.5 | A5:.25 F#5:.5 F#5:.25 E5:.25 D5:.25 D5:.5 B4:.5 C#5:.25 D5:.5 F#5:.5 E5:.25';
/** The same, in D minor (F natural, B-flat). */
const CALL_MINOR = 'r:3 F5:.25 G5:.5 A4:.25 | A4:.25 A4:.5 E5:.5 E5:.25 F5:.75 D5:.25 C#5:.25 D5:.75 E5:.5';
const CLIMB_MINOR = 'F5:.25 F5:1 D5:.5 D5:.25 G5:.25 F5:.25 G5:.5 G5:.5 Bb5:.5 | A5:.25 F5:.5 F5:.25 E5:.25 D5:.25 D5:.5 Bb4:.5 C#5:.25 D5:.5 F5:.5 E5:.25';

// ---------------------------------------------------------------------------------------------------------------
// Atrium (lobby). D major, 91 beats a minute (1991), about 1¾ minutes.
// The HKUST chime → the CALL over the sea → development: the CALL's turn sequenced round the circle of fifths →
// the HKUST bridge (notes and Morse together) → the CALL and CLIMB in full with horns → the chime resolves home.
// ---------------------------------------------------------------------------------------------------------------

const atrium: Score = {
  id: 'lobby',
  title: 'Atrium',
  timpani: D3_A2,
  bpm: 91,
  sections: [
    {
      name: 'chime', chords: 'G | Ebmaj7 F | Bm7 | A7sus4 A7',
      counter: 'B4:1 D5:1 G5:2 | Eb5:2 F5:2 | D5:2 F#5:2 | E5:2 C#5:2',
      scoring: { dyn: 'pp', to: 'p', counter: ['bells'], harmony: 'strings', figure: 'harpRoll', timpani: 'pedal', percussion: ['swell'], surf: true },
    },
    {
      name: 'call over the sea', chords: 'A7 | D | D G | A Bm | Em7 | A7 | D | A7sus4 A7',
      melody: `${CALL} | ${CLIMB} | G5:1.5 F#5:.5 E5:1 B4:1 | C#5:1 E5:1 G5:1 E5:1 | F#5:3 r:1 | D5:2 C#5:2`,
      scoring: { dyn: 'p', to: 'mp', tune: ['horns'], harmony: 'strings', figure: 'harp', bass: 'arco', surf: true },
    },
    {
      name: 'development', chords: 'Bm7 | Em7 | A7 | Dmaj7 | Gmaj7 | C#m7b5 | F#7 | Bm7',
      melody: 'D5:.25 C#5:.25 D5:.75 E5:.5 F#5:2.25 | G5:.25 F#5:.25 G5:.75 A5:.5 B5:2.25 | E5:.25 D5:.25 E5:.75 F#5:.5 G5:2.25 | A5:.25 G5:.25 A5:.75 B5:.5 C#6:2.25 | B5:2 A5:1 F#5:1 | G5:2 E5:2 | A#5:1 C#6:1 E5:2 | D5:4',
      counter: 'A4:4 | G4:4 | G4:4 | F#4:4 | F#4:4 | E4:4 | E4:4 | D4:4',
      scoring: { dyn: 'mp', to: 'mf', tune: ['violins'], counter: ['clarinet'], figure: 'pizz', bass: 'pizz', timpani: 'roll' },
    },
    {
      name: 'HKUST bridge', chords: 'G | Ebmaj7 F | G | Ebmaj7 F | Bbmaj7 | C | Gm6 | A7',
      melody: 'B4:1 D5:1 G5:2 | Eb5:2 F5:2 | B4:1 D5:1 G5:1 B5:1 | Bb5:2 C6:2 | D6:2 A5:2 | G5:2 E5:2 | Bb5:2 G5:2 | C#5:2 E5:1 G5:1',
      scoring: { dyn: 'f', tune: ['trumpet', 'bells'], harmony: 'chorale', bass: 'arco', timpani: 'beats', percussion: ['cymbals', 'swell'], morse: true },
    },
    {
      name: 'call and climb with horns', chords: 'A7 | D | D G | A Bm | D G | A Bm | Em7 A7 | D',
      melody: `${CALL} | ${CLIMB} | ${CLIMB} | G5:1 F#5:1 E5:1 C#5:1 | D5:4`,
      counter: 'G4:4 | F#4:4 | A4:2 B4:2 | C#5:2 B4:2 | A4:2 B4:2 | C#5:2 D5:2 | B4:2 C#5:2 | D5:4',
      scoring: { dyn: 'f', to: 'ff', tune: ['violins', ['flute', 1]], counter: ['horns'], harmony: 'tremolo', figure: 'harp', bass: 'arco', timpani: 'beats', percussion: ['cymbals', 'triangle'] },
    },
    {
      name: 'the chime resolves', chords: 'G | Ebmaj7 F | A7sus4 A7 | D',
      melody: 'B4:2 D5:2 | Eb5:2 F5:2 | E5:2 C#5:2 | D5:4',
      scoring: { dyn: 'p', to: 'pp', tune: ['bells'], harmony: 'strings', figure: 'harpRoll', bass: 'arco', timpani: 'pedal', surf: true, rit: true },
    },
  ],
};

// ---------------------------------------------------------------------------------------------------------------
// Problem set (timed quiz). D minor, about 1¾ minutes: focused, with pizzicato pulse.
// Pulse → the CALL and CLIMB in minor → a fugal passage: the CALL's turn passed round the circle of fifths →
// the HKUST bridge, major then minor → strings alone → return with horns.
// ---------------------------------------------------------------------------------------------------------------

const SET_CHORDS = 'A7 | Dm | Dm Gm | A Bbmaj7 | Gm7 | A7 | Dm | A7';
const SET_MELODY = `${CALL_MINOR} | ${CLIMB_MINOR} | G5:1 Bb5:1 A5:1 G5:1 | E5:3 r:1 | F5:1.5 E5:.5 D5:2 | C#5:2 E5:2`;
const problemSet: Score = {
  id: 'quiz',
  title: 'Problem set',
  trim: 2.3,
  timpani: D3_A2,
  bpm: 108,
  sections: [
    { name: 'pulse', chords: 'Dm | Bbmaj7 | Gm6 | A7', scoring: { dyn: 'p', harmony: 'winds', figure: 'pizz', bass: 'pizz' } },
    { name: 'call and climb in minor', chords: SET_CHORDS, melody: SET_MELODY, scoring: { dyn: 'mp', tune: ['clarinet'], harmony: 'strings', figure: 'pizz', bass: 'pizz' } },
    {
      name: 'fugato', chords: 'Dm | Gm | C7 | Fmaj7 | Bbmaj7 | Em7b5 | A7 | Dm',
      melody: 'D5:.25 C#5:.25 D5:.75 E5:.5 F5:2.25 | G5:.25 F#5:.25 G5:.75 A5:.5 Bb5:2.25 | C5:.25 B4:.25 C5:.75 D5:.5 E5:2.25 | F5:.25 E5:.25 F5:.75 G5:.5 A5:2.25 | D6:2 A5:1 F5:1 | G5:2 Bb5:2 | C#6:1 A5:1 E5:1 G5:1 | D5:4',
      counter: 'F4:4 | Bb4:4 | Bb4:4 | A4:4 | A4:4 | G4:4 | G4:4 | F4:4',
      scoring: { dyn: 'mp', to: 'mf', tune: ['violins'], counter: ['celli'], figure: 'pizz', bass: 'pizz', timpani: 'roll' },
    },
    {
      name: 'HKUST bridge', chords: 'G | Ebmaj7 F | Gm | Ebmaj7 F | Bbmaj7 | C | A7sus4 | A7',
      melody: 'B4:1 D5:1 G5:2 | Eb5:2 F5:2 | Bb4:1 D5:1 G5:2 | G5:2 A5:2 | D5:2 F5:2 | E5:2 G5:2 | D5:4 | C#5:2 E5:2',
      scoring: { dyn: 'mf', tune: ['horns'], harmony: 'tremolo', bass: 'arco', timpani: 'beats', percussion: ['cymbals'], morse: true },
    },
    {
      name: 'strings alone', chords: 'Dm | Bbmaj7 | Gm7 | A7 | Dm | Bbmaj7 | Gm6 | A7',
      melody: 'A4:2 E5:2 | F5:2 D5:2 | Bb4:2 D5:2 | C#5:2 E5:2 | F5:2 A5:2 | D6:2 A5:2 | G5:2 E5:2 | E5:4',
      scoring: { dyn: 'p', to: 'mp', tune: ['violins'], harmony: 'strings', bass: 'arco', timpani: 'roll' },
    },
    {
      name: 'return with horns', chords: SET_CHORDS, melody: SET_MELODY,
      counter: 'E4:4 | F4:4 | F4:2 G4:2 | E4:2 F4:2 | F4:4 | E4:4 | F4:4 | E4:4',
      scoring: { dyn: 'mf', to: 'f', tune: ['violins', ['flute', 1]], counter: ['horns'], figure: 'ostinato', bass: 'pizz', timpani: 'beats', percussion: ['cymbals', 'swell'] },
    },
  ],
};

// ---------------------------------------------------------------------------------------------------------------
// Last call (the countdown): the CALL's turn (D–C♯–D–E–F♯) climbs one scale step every bar, up through
// the key to the dominant, over a borrowed minor iv, while the woodblock taps HKUST in Morse. About 14½ seconds.
// ---------------------------------------------------------------------------------------------------------------

const turn = (a: string, b: string, c: string, d: string) => `${a}:.25 ${b}:.25 ${a}:.5 ${c}:.5 ${d}:.5 ${a}:.25 ${b}:.25 ${a}:.5 ${c}:.5 ${d}:.5`;
const tenSeconds: Score = {
  id: 'countdown',
  title: 'Last call',
  trim: 0.9,
  timpani: D3_A2,
  bpm: 132,
  sections: [
    { name: 'the turn climbs', chords: 'D | Em7 | F#m7 | G', melody: [turn('D5', 'C#5', 'E5', 'F#5'), turn('E5', 'D5', 'F#5', 'G5'), turn('F#5', 'E5', 'G5', 'A5'), turn('G5', 'F#5', 'A5', 'B5')].join(' | '), scoring: { dyn: 'mf', to: 'f', tune: ['trumpet', 'violins'], harmony: 'tremolo', figure: 'ostinato', bass: 'pizz', timpani: 'beats', morse: true } },
    { name: 'to the dominant', chords: 'A | Bm | Gm6 | A7', melody: `${turn('A5', 'G5', 'B5', 'C#6')} | ${turn('B5', 'A5', 'C#6', 'D6')} | Bb5:1 A5:1 G5:1 E5:1 | C#6:.5 E6:.5 C#6:.5 E6:.5 A5:2`, scoring: { dyn: 'f', to: 'ff', tune: ['trumpet', 'violins'], harmony: 'tremolo', figure: 'ostinato', bass: 'arco', timpani: 'roll', percussion: ['cymbals', 'swell'], morse: true } },
  ],
};

// ---------------------------------------------------------------------------------------------------------------
// Piazza (results and leaderboard). D major, about 1⅓ minutes: a ceremonial march.
// The CALL as a fanfare → the CLIMB as a procession → a lyrical trio in the subdominant, G, as marches have →
// the HKUST bridge in quicker notes → the procession a whole step up in E → outro that hands back to the fanfare.
// ---------------------------------------------------------------------------------------------------------------

const PROCESSION = { chords: 'D G | A Bm | Em7 A7 | D | D G | A Bm | G A | D', melody: `${CLIMB} | G5:1 E5:1 C#5:1 E5:1 | D5:3 r:1 | ${CLIMB} | B5:1 D6:1 C#6:1 A5:1 | D6:4` };
const piazza: Score = {
  id: 'results',
  title: 'Piazza',
  timpani: D3_A2,
  bpm: 116,
  sections: [
    { name: 'fanfare', chords: 'A7 | D', melody: CALL, scoring: { dyn: 'f', tune: ['trumpet'], harmony: 'chorale', bass: 'march', timpani: 'march', percussion: ['cymbals', 'fieldDrum'] } },
    { name: 'procession', ...PROCESSION, scoring: { dyn: 'f', tune: ['violins', ['flute', 1]], figure: 'afterbeats', bass: 'march', timpani: 'march', percussion: ['fieldDrum'] } },
    {
      name: 'trio in G', chords: 'G | D7 | G | C | G/B | Am7 | D7 | G',
      melody: 'B5:2 D6:1 B5:1 | A5:2 F#5:1 C6:1 | G5:1.5 B5:.5 D6:2 | E6:2 C6:2 | D6:1 B5:1 G5:1 B5:1 | C6:2 A5:2 | F#5:1 A5:1 C6:1 A5:1 | G5:4',
      counter: 'G4:4 | F#4:4 | G4:4 | G4:4 | G4:4 | G4:4 | F#4:4 | G4:4',
      scoring: { dyn: 'mp', tune: ['flute', ['clarinet', -1]], counter: ['celli'], harmony: 'strings', figure: 'harp', bass: 'pizz', percussion: ['triangle'] },
    },
    {
      name: 'HKUST bridge', chords: 'G Ebmaj7 | F Bbmaj7 | G Ebmaj7 | F C | Bbmaj7 | Gm6 | Asus4 | A7',
      melody: 'B4:.5 D5:.5 G5:1 Eb5:1 F5:1 | F5:2 D5:2 | B4:.5 D5:.5 G5:1 Bb5:1 G5:1 | A5:2 G5:2 | D6:2 F5:2 | Bb5:2 E5:2 | D6:2 E5:2 | C#6:2 A5:2',
      scoring: { dyn: 'mf', to: 'f', tune: ['trumpet', 'bells'], harmony: 'chorale', bass: 'arco', timpani: 'beats', percussion: ['cymbals', 'swell'], morse: true },
    },
    {
      name: 'procession, a step up', ...PROCESSION, transpose: 2,
      counter: 'A4:2 B4:2 | C#5:2 D5:2 | B4:2 C#5:2 | A4:4 | A4:2 B4:2 | C#5:2 D5:2 | B4:2 C#5:2 | D5:4',
      scoring: { dyn: 'f', to: 'ff', tune: ['violins', 'trumpet', ['flute', 1]], counter: ['horns'], harmony: 'tremolo', bass: 'march', timpani: 'march', percussion: ['cymbals', 'fieldDrum', 'bassDrum'] },
    },
    { name: 'outro', chords: 'E | C#m7 | F#m7 B7 | E', melody: 'G#5:2 B5:2 | E6:3 r:1 | C#6:2 D#6:2 | E6:4', scoring: { dyn: 'ff', tune: ['trumpet', 'violins'], harmony: 'chorale', bass: 'arco', timpani: 'roll', percussion: ['cymbals'] } },
  ],
};

// ---------------------------------------------------------------------------------------------------------------
// Clear Water Bay (breaks). D major, 76 beats a minute, about 2 minutes, with the sea underneath.
// Waves and harp → the CALL, lyrical, over ninth chords → the CLIMB, gently → HKUST as a slow chorale →
// the CALL again with horns → waves.
// ---------------------------------------------------------------------------------------------------------------

const BAY_CALL = { chords: 'A13 | Dmaj9 | Bm9 | Gmaj9 | Em9 | A13 | Dmaj9 | A7sus4 A7', melody: `${CALL} | F#5:1.5 E5:.5 D5:2 | B4:1 D5:1 F#5:2 | G5:1.5 F#5:.5 E5:2 | C#5:2 F#5:2 | E5:2 F#5:2 | D5:2 C#5:2` };
const clearWaterBay: Score = {
  id: 'break',
  title: 'Clear Water Bay',
  trim: 1.9,
  timpani: D3_A2,
  bpm: 76,
  sections: [
    { name: 'waves', chords: 'Dmaj9 | Gmaj9 | Dmaj9 | A13', scoring: { dyn: 'pp', harmony: 'strings', figure: 'harp', bass: 'pedal', surf: true } },
    { name: 'the call over the water', ...BAY_CALL, scoring: { dyn: 'p', tune: ['flute'], harmony: 'strings', figure: 'harp', bass: 'arco', surf: true } },
    {
      name: 'the climb, gently', chords: 'Dmaj9 Gmaj9 | A13 Bm9 | Em9 A13 | Dmaj9 | Dmaj9 Gmaj9 | A13 Bm9 | Gmaj9 A13 | Dmaj9',
      melody: `${CLIMB} | G5:2 E5:2 | F#5:4 | ${CLIMB} | B5:2 C#6:2 | A5:4`,
      counter: 'A4:2 B4:2 | C#5:2 D5:2 | D5:2 C#5:2 | C#5:4 | A4:2 B4:2 | C#5:2 D5:2 | B4:2 C#5:2 | C#5:4',
      scoring: { dyn: 'p', to: 'mp', tune: ['violins'], counter: ['clarinet'], figure: 'harpRoll', bass: 'arco' },
    },
    {
      name: 'HKUST chorale', chords: 'G | Ebmaj7 | F | Bbmaj7 | Gm6 | Ebmaj7 | A7sus4 | A7',
      melody: 'B4:2 D5:2 | G5:2 Eb5:2 | F5:4 | D5:2 F5:2 | E5:2 G5:2 | Bb4:2 G5:2 | D5:2 E5:2 | C#5:4',
      scoring: { dyn: 'p', to: 'mp', tune: ['horns'], harmony: 'chorale', bass: 'arco', timpani: 'pedal' },
    },
    { name: 'the call with horns', ...BAY_CALL, counter: 'G4:4 | F#4:4 | A4:4 | F#4:4 | G4:4 | G4:4 | F#4:4 | G4:4', scoring: { dyn: 'mp', tune: ['violins'], counter: ['horns'], figure: 'harp', bass: 'arco', surf: true } },
    { name: 'waves', chords: 'Dmaj9 | Gmaj9 | Dmaj9 | Dmaj9', counter: 'F#5:4 | B4:4 | A4:4 | A4:4', scoring: { dyn: 'p', to: 'pp', counter: ['celesta'], harmony: 'strings', bass: 'pedal', surf: true, rit: true } },
  ],
};

// ---------------------------------------------------------------------------------------------------------------
// Commencement (the session has ended). A major, about 1½ minutes, a hymn.
// The HKUST chime, leaning towards A → the CALL as a hymn in A → the CLIMB in A, stately → a return to the anthem's
// own key, D, for the CALL → amen: the plagal cadence D – A, the anthem's home chord closing the session.
// ---------------------------------------------------------------------------------------------------------------

const commencement: Score = {
  id: 'ended',
  title: 'Commencement',
  trim: -1.7,
  timpani: [noteToMidi('A2'), noteToMidi('E3')],
  bpm: 80,
  sections: [
    {
      name: 'chime', chords: 'G | Ebmaj7 F | Dmaj7 | E7sus4 E7',
      counter: 'B4:1 D5:1 G5:2 | Eb5:2 F5:2 | F#5:2 A5:2 | B4:2 G#4:2',
      scoring: { dyn: 'pp', to: 'p', counter: ['bells'], harmony: 'strings', figure: 'harpRoll', timpani: 'pedal', percussion: ['swell'], surf: true },
    },
    {
      name: 'hymn in A', chords: 'E7 | A | F#m7 | Dmaj7 | Bm7 | E7 | A | E7sus4 E7',
      melody: 'r:3 C#6:.25 D6:.5 E5:.25 | E5:.25 E5:.5 B5:.5 B5:.25 C#6:.75 A5:.25 G#5:.25 A5:.75 B5:.5 | C#6:1.5 B5:.5 A5:2 | F#5:2 A5:2 | D6:1 C#6:1 B5:2 | G#5:2 B5:2 | C#6:2 E6:2 | A5:2 G#5:2',
      scoring: { dyn: 'mp', tune: ['violins'], harmony: 'winds', figure: 'harpRoll', bass: 'arco' },
    },
    {
      name: 'climb in A', chords: 'A D | E F#m | Bm7 E7 | A | A D | E F#m | D E | A',
      melody: 'C#5:.25 C#5:1 A4:.5 A4:.25 D5:.25 C#5:.25 D5:.5 D5:.5 F#5:.5 | E5:.25 C#5:.5 C#5:.25 B4:.25 A4:.25 A4:.5 F#4:.5 G#4:.25 A4:.5 C#5:.5 B4:.25 | D5:2 B4:2 | A4:4 | C#5:.25 C#5:1 A4:.5 A4:.25 D5:.25 C#5:.25 D5:.5 D5:.5 F#5:.5 | E5:.25 C#5:.5 C#5:.25 B4:.25 A4:.25 A4:.5 F#4:.5 G#4:.25 A4:.5 C#5:.5 B4:.25 | F#5:2 G#5:2 | A5:4',
      counter: 'E4:2 F#4:2 | G#4:2 A4:2 | A4:2 G#4:2 | A4:4 | E4:2 F#4:2 | G#4:2 A4:2 | F#4:2 G#4:2 | A4:4',
      scoring: { dyn: 'mf', tune: ['horns', 'violins'], counter: ['celli'], harmony: 'strings', bass: 'arco', timpani: 'downbeats', percussion: ['cymbals'] },
    },
    {
      name: 'home to D', chords: 'A7 | D | Bm7 | G | Em7 | A7 | D | E7',
      melody: `${CALL} | D5:1.5 F#5:.5 B5:2 | B5:1 A5:1 G5:2 | G5:2 E5:2 | C#5:2 E5:2 | F#5:2 A5:2 | G#5:2 B5:2`,
      counter: 'G4:4 | F#4:4 | F#4:4 | G4:4 | G4:4 | G4:4 | F#4:4 | G#4:4',
      scoring: { dyn: 'f', to: 'ff', tune: ['violins', ['flute', 1], 'trumpet'], counter: ['horns'], harmony: 'tremolo', figure: 'harp', bass: 'arco', timpani: 'roll', percussion: ['cymbals', 'triangle'] },
    },
    { name: 'amen', chords: 'D | Bm7 | D | A', melody: 'F#5:4 | D5:4 | F#5:2 D5:2 | C#5:4', scoring: { dyn: 'f', to: 'p', tune: ['trumpet', 'violins'], harmony: 'chorale', bass: 'arco', timpani: 'pedal', percussion: ['cymbals'], rit: true } },
  ],
};

export const HKUST_PIECES: Record<MusicId, Score> = { lobby: atrium, quiz: problemSet, countdown: tenSeconds, results: piazza, break: clearWaterBay, ended: commencement };
