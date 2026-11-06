/**
 * The HKUST sound set: six orchestral compositions of its own (trumpet, horns, strings, harp, timpani), built on
 * material from and about the Hong Kong University of Science and Technology. Nothing here is shared with the other
 * styles: the pieces, their arrangements and every sound effect (sfx.ts, HKUST_SFX) are its own.
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
 *   HKUST in Morse   ···· −·− ··− ··· −  tapped on a woodblock (dot = a sixteenth, dash = three) in the bridges and
 *                    the countdown.
 *   1991             The year HKUST opened: the lobby runs at 91 beats a minute.
 *   Clear Water Bay  The campus sits on the sea: the lobby, the break and the end have waves under them.
 *   A major          The session ends in A, whose subdominant is the anthem's D: the final plagal "amen" cadence goes
 *                    from the anthem's home chord to A.
 * Titles name places and moments on campus: Atrium, Problem set, Ten seconds, Piazza, Clear Water Bay, Commencement.
 */
import type { Composition } from './compositions';
import type { MusicId } from './engine';

/** Woodblock onsets (in sixteenths) that spell H-K-U-S-T in Morse code, and whether each is a dash. */
export const MORSE_HKUST: [step: number, dash: boolean][] = (() => {
  const letters = ['....', '-.-', '..-', '...', '-'];
  const out: [number, boolean][] = [];
  let t = 0;
  for (const l of letters) {
    for (const ch of l) {
      out.push([t, ch === '-']);
      t += ch === '-' ? 4 : 2; // the element plus one unit of space
    }
    t += 2; // the gap between letters (three units in all)
  }
  return out;
})();

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

const atrium: Composition = {
  id: 'lobby',
  title: 'Atrium',
  bpm: 91,
  sections: [
    {
      name: 'chime', chords: 'G | Ebmaj7 F | Bm7 | A7sus4 A7',
      counter: 'B4:1 D5:1 G5:2 | Eb5:2 F5:2 | D5:2 F#5:2 | E5:2 C#5:2',
      texture: { drums: 'none', pad: true, comp: false, surf: true },
    },
    {
      name: 'call over the sea', chords: 'A7 | D | D G | A Bm | Em7 | A7 | D | A7sus4 A7',
      melody: `${CALL} | ${CLIMB} | G5:1.5 F#5:.5 E5:1 B4:1 | C#5:1 E5:1 G5:1 E5:1 | F#5:3 r:1 | D5:2 C#5:2`,
      texture: { drums: 'light', surf: true },
    },
    {
      name: 'development', chords: 'Bm7 | Em7 | A7 | Dmaj7 | Gmaj7 | C#m7b5 | F#7 | Bm7',
      melody: 'D5:.25 C#5:.25 D5:.75 E5:.5 F#5:2.25 | G5:.25 F#5:.25 G5:.75 A5:.5 B5:2.25 | E5:.25 D5:.25 E5:.75 F#5:.5 G5:2.25 | A5:.25 G5:.25 A5:.75 B5:.5 C#6:2.25 | B5:2 A5:1 F#5:1 | G5:2 E5:2 | A#5:1 C#6:1 E5:2 | D5:4',
      counter: 'A4:4 | G4:4 | G4:4 | F#4:4 | F#4:4 | E4:4 | E4:4 | D4:4',
      texture: { drums: 'light', fill: true },
    },
    {
      name: 'HKUST bridge', chords: 'G | Ebmaj7 F | G | Ebmaj7 F | Bbmaj7 | C | Gm6 | A7',
      melody: 'B4:1 D5:1 G5:2 | Eb5:2 F5:2 | B4:1 D5:1 G5:1 B5:1 | Bb5:2 C6:2 | D6:2 A5:2 | G5:2 E5:2 | Bb5:2 G5:2 | C#5:2 E5:1 G5:1',
      texture: { drums: 'half', pad: true, morse: true, crash: true, fill: true },
    },
    {
      name: 'call and climb with horns', chords: 'A7 | D | D G | A Bm | D G | A Bm | Em7 A7 | D',
      melody: `${CALL} | ${CLIMB} | ${CLIMB} | G5:1 F#5:1 E5:1 C#5:1 | D5:4`,
      counter: 'G4:4 | F#4:4 | A4:2 B4:2 | C#5:2 B4:2 | A4:2 B4:2 | C#5:2 D5:2 | B4:2 C#5:2 | D5:4',
      texture: { drums: 'groove', pad: true, crash: true, fill: true },
    },
    {
      name: 'the chime resolves', chords: 'G | Ebmaj7 F | A7sus4 A7 | D',
      melody: 'B4:2 D5:2 | Eb5:2 F5:2 | E5:2 C#5:2 | D5:4',
      texture: { drums: 'none', pad: true, comp: false, surf: true },
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
const problemSet: Composition = {
  id: 'quiz',
  title: 'Problem set',
  bpm: 108,
  sections: [
    { name: 'pulse', chords: 'Dm | Bbmaj7 | Gm6 | A7', texture: { drums: 'light', pad: true } },
    { name: 'call and climb in minor', chords: SET_CHORDS, melody: SET_MELODY, texture: { drums: 'groove' } },
    {
      name: 'fugato', chords: 'Dm | Gm | C7 | Fmaj7 | Bbmaj7 | Em7b5 | A7 | Dm',
      melody: 'D5:.25 C#5:.25 D5:.75 E5:.5 F5:2.25 | G5:.25 F#5:.25 G5:.75 A5:.5 Bb5:2.25 | C5:.25 B4:.25 C5:.75 D5:.5 E5:2.25 | F5:.25 E5:.25 F5:.75 G5:.5 A5:2.25 | D6:2 A5:1 F5:1 | G5:2 Bb5:2 | C#6:1 A5:1 E5:1 G5:1 | D5:4',
      counter: 'F4:4 | Bb4:4 | Bb4:4 | A4:4 | A4:4 | G4:4 | G4:4 | F4:4',
      texture: { drums: 'groove', fill: true },
    },
    {
      name: 'HKUST bridge', chords: 'G | Ebmaj7 F | Gm | Ebmaj7 F | Bbmaj7 | C | A7sus4 | A7',
      melody: 'B4:1 D5:1 G5:2 | Eb5:2 F5:2 | Bb4:1 D5:1 G5:2 | G5:2 A5:2 | D5:2 F5:2 | E5:2 G5:2 | D5:4 | C#5:2 E5:2',
      texture: { drums: 'half', pad: true, morse: true, crash: true, fill: true },
    },
    {
      name: 'strings alone', chords: 'Dm | Bbmaj7 | Gm7 | A7 | Dm | Bbmaj7 | Gm6 | A7',
      melody: 'A4:2 E5:2 | F5:2 D5:2 | Bb4:2 D5:2 | C#5:2 E5:2 | F5:2 A5:2 | D6:2 A5:2 | G5:2 E5:2 | E5:4',
      texture: { drums: 'half', comp: false, pad: true, fill: true },
    },
    {
      name: 'return with horns', chords: SET_CHORDS, melody: SET_MELODY,
      counter: 'E4:4 | F4:4 | F4:2 G4:2 | E4:2 F4:2 | F4:4 | E4:4 | F4:4 | E4:4',
      texture: { drums: 'drive', crash: true, fill: true },
    },
  ],
};

// ---------------------------------------------------------------------------------------------------------------
// Ten seconds (HKUST). The countdown: the CALL's turn (D–C♯–D–E–F♯) climbs one scale step every bar, up through
// the key to the dominant, over a borrowed minor iv, while the woodblock taps HKUST in Morse. About 14½ seconds.
// ---------------------------------------------------------------------------------------------------------------

const turn = (a: string, b: string, c: string, d: string) => `${a}:.25 ${b}:.25 ${a}:.5 ${c}:.5 ${d}:.5 ${a}:.25 ${b}:.25 ${a}:.5 ${c}:.5 ${d}:.5`;
const tenSeconds: Composition = {
  id: 'countdown',
  title: 'Ten seconds (HKUST)',
  bpm: 132,
  sections: [
    { name: 'the turn climbs', chords: 'D | Em7 | F#m7 | G', melody: [turn('D5', 'C#5', 'E5', 'F#5'), turn('E5', 'D5', 'F#5', 'G5'), turn('F#5', 'E5', 'G5', 'A5'), turn('G5', 'F#5', 'A5', 'B5')].join(' | '), texture: { drums: 'drive', morse: true } },
    { name: 'to the dominant', chords: 'A | Bm | Gm6 | A7', melody: `${turn('A5', 'G5', 'B5', 'C#6')} | ${turn('B5', 'A5', 'C#6', 'D6')} | Bb5:1 A5:1 G5:1 E5:1 | C#6:.5 E6:.5 C#6:.5 E6:.5 A5:2`, texture: { drums: 'drive', crash: true, morse: true, fill: true } },
  ],
};

// ---------------------------------------------------------------------------------------------------------------
// Piazza (results and leaderboard). D major, about 1⅓ minutes: a ceremonial march.
// The CALL as a fanfare → the CLIMB as a procession → a lyrical trio in the subdominant, G, as marches have →
// the HKUST bridge in quicker notes → the procession a whole step up in E → outro that hands back to the fanfare.
// ---------------------------------------------------------------------------------------------------------------

const PROCESSION = { chords: 'D G | A Bm | Em7 A7 | D | D G | A Bm | G A | D', melody: `${CLIMB} | G5:1 E5:1 C#5:1 E5:1 | D5:3 r:1 | ${CLIMB} | B5:1 D6:1 C#6:1 A5:1 | D6:4` };
const piazza: Composition = {
  id: 'results',
  title: 'Piazza',
  bpm: 116,
  sections: [
    { name: 'fanfare', chords: 'A7 | D', melody: CALL, texture: { drums: 'groove', crash: true, fill: true } },
    { name: 'procession', ...PROCESSION, texture: { drums: 'groove', crash: true } },
    {
      name: 'trio in G', chords: 'G | D7 | G | C | G/B | Am7 | D7 | G',
      melody: 'B5:2 D6:1 B5:1 | A5:2 F#5:1 C6:1 | G5:1.5 B5:.5 D6:2 | E6:2 C6:2 | D6:1 B5:1 G5:1 B5:1 | C6:2 A5:2 | F#5:1 A5:1 C6:1 A5:1 | G5:4',
      counter: 'G4:4 | F#4:4 | G4:4 | G4:4 | G4:4 | G4:4 | F#4:4 | G4:4',
      texture: { drums: 'light', pad: true, fill: true },
    },
    {
      name: 'HKUST bridge', chords: 'G Ebmaj7 | F Bbmaj7 | G Ebmaj7 | F C | Bbmaj7 | Gm6 | Asus4 | A7',
      melody: 'B4:.5 D5:.5 G5:1 Eb5:1 F5:1 | F5:2 D5:2 | B4:.5 D5:.5 G5:1 Bb5:1 G5:1 | A5:2 G5:2 | D6:2 F5:2 | Bb5:2 E5:2 | D6:2 E5:2 | C#6:2 A5:2',
      texture: { drums: 'half', pad: true, morse: true, crash: true, fill: true },
    },
    {
      name: 'procession, a step up', ...PROCESSION, transpose: 2,
      counter: 'A4:2 B4:2 | C#5:2 D5:2 | B4:2 C#5:2 | A4:4 | A4:2 B4:2 | C#5:2 D5:2 | B4:2 C#5:2 | D5:4',
      texture: { drums: 'drive', crash: true, fill: true },
    },
    { name: 'outro', chords: 'E | C#m7 | F#m7 B7 | E', melody: 'G#5:2 B5:2 | E6:3 r:1 | C#6:2 D#6:2 | E6:4', texture: { drums: 'groove', crash: true, fill: true } },
  ],
};

// ---------------------------------------------------------------------------------------------------------------
// Clear Water Bay (breaks). D major, 76 beats a minute, about 2 minutes, with the sea underneath.
// Waves and harp → the CALL, lyrical, over ninth chords → the CLIMB, gently → HKUST as a slow chorale →
// the CALL again with horns → waves.
// ---------------------------------------------------------------------------------------------------------------

const BAY_CALL = { chords: 'A13 | Dmaj9 | Bm9 | Gmaj9 | Em9 | A13 | Dmaj9 | A7sus4 A7', melody: `${CALL} | F#5:1.5 E5:.5 D5:2 | B4:1 D5:1 F#5:2 | G5:1.5 F#5:.5 E5:2 | C#5:2 F#5:2 | E5:2 F#5:2 | D5:2 C#5:2` };
const clearWaterBay: Composition = {
  id: 'break',
  title: 'Clear Water Bay',
  bpm: 76,
  sections: [
    { name: 'waves', chords: 'Dmaj9 | Gmaj9 | Dmaj9 | A13', texture: { drums: 'none', pad: true, surf: true } },
    { name: 'the call over the water', ...BAY_CALL, texture: { drums: 'light', surf: true } },
    {
      name: 'the climb, gently', chords: 'Dmaj9 Gmaj9 | A13 Bm9 | Em9 A13 | Dmaj9 | Dmaj9 Gmaj9 | A13 Bm9 | Gmaj9 A13 | Dmaj9',
      melody: `${CLIMB} | G5:2 E5:2 | F#5:4 | ${CLIMB} | B5:2 C#6:2 | A5:4`,
      counter: 'A4:2 B4:2 | C#5:2 D5:2 | D5:2 C#5:2 | C#5:4 | A4:2 B4:2 | C#5:2 D5:2 | B4:2 C#5:2 | C#5:4',
      texture: { drums: 'light' },
    },
    {
      name: 'HKUST chorale', chords: 'G | Ebmaj7 | F | Bbmaj7 | Gm6 | Ebmaj7 | A7sus4 | A7',
      melody: 'B4:2 D5:2 | G5:2 Eb5:2 | F5:4 | D5:2 F5:2 | E5:2 G5:2 | Bb4:2 G5:2 | D5:2 E5:2 | C#5:4',
      texture: { drums: 'half', pad: true, fill: true },
    },
    { name: 'the call with horns', ...BAY_CALL, counter: 'G4:4 | F#4:4 | A4:4 | F#4:4 | G4:4 | G4:4 | F#4:4 | G4:4', texture: { drums: 'light', surf: true } },
    { name: 'waves', chords: 'Dmaj9 | Gmaj9 | Dmaj9 | Dmaj9', counter: 'F#5:4 | B4:4 | A4:4 | A4:4', texture: { drums: 'none', pad: true, comp: false, surf: true } },
  ],
};

// ---------------------------------------------------------------------------------------------------------------
// Commencement (the session has ended). A major, about 1½ minutes, a hymn.
// The HKUST chime, leaning towards A → the CALL as a hymn in A → the CLIMB in A, stately → a return to the anthem's
// own key, D, for the CALL → amen: the plagal cadence D – A, the anthem's home chord closing the session.
// ---------------------------------------------------------------------------------------------------------------

const commencement: Composition = {
  id: 'ended',
  title: 'Commencement',
  bpm: 80,
  sections: [
    {
      name: 'chime', chords: 'G | Ebmaj7 F | Dmaj7 | E7sus4 E7',
      counter: 'B4:1 D5:1 G5:2 | Eb5:2 F5:2 | F#5:2 A5:2 | B4:2 G#4:2',
      texture: { drums: 'none', pad: true, comp: false, surf: true },
    },
    {
      name: 'hymn in A', chords: 'E7 | A | F#m7 | Dmaj7 | Bm7 | E7 | A | E7sus4 E7',
      melody: 'r:3 C#6:.25 D6:.5 E5:.25 | E5:.25 E5:.5 B5:.5 B5:.25 C#6:.75 A5:.25 G#5:.25 A5:.75 B5:.5 | C#6:1.5 B5:.5 A5:2 | F#5:2 A5:2 | D6:1 C#6:1 B5:2 | G#5:2 B5:2 | C#6:2 E6:2 | A5:2 G#5:2',
      texture: { drums: 'light' },
    },
    {
      name: 'climb in A', chords: 'A D | E F#m | Bm7 E7 | A | A D | E F#m | D E | A',
      melody: 'C#5:.25 C#5:1 A4:.5 A4:.25 D5:.25 C#5:.25 D5:.5 D5:.5 F#5:.5 | E5:.25 C#5:.5 C#5:.25 B4:.25 A4:.25 A4:.5 F#4:.5 G#4:.25 A4:.5 C#5:.5 B4:.25 | D5:2 B4:2 | A4:4 | C#5:.25 C#5:1 A4:.5 A4:.25 D5:.25 C#5:.25 D5:.5 D5:.5 F#5:.5 | E5:.25 C#5:.5 C#5:.25 B4:.25 A4:.25 A4:.5 F#4:.5 G#4:.25 A4:.5 C#5:.5 B4:.25 | F#5:2 G#5:2 | A5:4',
      counter: 'E4:2 F#4:2 | G#4:2 A4:2 | A4:2 G#4:2 | A4:4 | E4:2 F#4:2 | G#4:2 A4:2 | F#4:2 G#4:2 | A4:4',
      texture: { drums: 'half', pad: true, crash: true },
    },
    {
      name: 'home to D', chords: 'A7 | D | Bm7 | G | Em7 | A7 | D | E7',
      melody: `${CALL} | D5:1.5 F#5:.5 B5:2 | B5:1 A5:1 G5:2 | G5:2 E5:2 | C#5:2 E5:2 | F#5:2 A5:2 | G#5:2 B5:2`,
      counter: 'G4:4 | F#4:4 | F#4:4 | G4:4 | G4:4 | G4:4 | F#4:4 | G#4:4',
      texture: { drums: 'groove', pad: true, crash: true, fill: true },
    },
    { name: 'amen', chords: 'D | Bm7 | D | A', melody: 'F#5:4 | D5:4 | F#5:2 D5:2 | C#5:4', texture: { drums: 'none', pad: true, comp: false, surf: true } },
  ],
};

export const HKUST_COMPOSITIONS: Record<MusicId, Composition> = { lobby: atrium, quiz: problemSet, countdown: tenSeconds, results: piazza, break: clearWaterBay, ended: commencement };
