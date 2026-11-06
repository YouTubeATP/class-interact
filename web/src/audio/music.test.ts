import { SOUND_STYLES } from '@classinteract/shared';
import { describe, expect, it } from 'vitest';
import { barLengths, chordAt, COMPOSITIONS, loopBeats, parseChordBars, resolve, type Composition, type Passage } from './compositions';
import { ORCHESTRA, RANGE, type Instrument } from './hkust/instruments';
import { HKUST_PIECES } from './hkust/pieces';
import { fitLine, MORSE_HKUST, orchestrate, timeWarp } from './hkust/score';
import { HKUST_CUES } from './hkust/sfx';
import { SFX } from './sfx';
import { arrange, STYLE_INFO, STYLES, type BandStyle } from './styles';
import { chordTones, parseChord, voiceChord } from './theory';

const pieces: Composition<Passage>[] = [...Object.values(COMPOSITIONS), ...Object.values(HKUST_PIECES)];
const bandStyles = Object.keys(STYLES) as BandStyle[];

describe('music theory', () => {
  it('parses chord symbols, including slash chords and extensions', () => {
    expect(chordTones(parseChord('Cmaj7'))).toEqual([0, 4, 7, 11]);
    expect(chordTones(parseChord('Am7'))).toEqual([9, 0, 4, 7]);
    expect(parseChord('F/A')).toMatchObject({ root: 5, bass: 9 });
    expect(chordTones(parseChord('Bb13')).sort((a, b) => a - b)).toEqual([0, 2, 7, 8, 10].sort((a, b) => a - b));
    expect(() => parseChord('Cfoo')).toThrow(/Unknown chord quality/);
  });

  it('voices a progression with smooth voice leading', () => {
    let prev: number[] | null = null;
    for (const sym of ['C', 'Am7', 'Fmaj7', 'G7', 'C']) {
      const v = voiceChord(parseChord(sym), prev);
      if (prev) {
        const moved = v.reduce((s, n) => s + Math.min(...prev!.map((p) => Math.abs(p - n))), 0) / v.length;
        expect(moved, `${sym} moves too far`).toBeLessThanOrEqual(3);
      }
      expect(Math.max(...v) - Math.min(...v)).toBeLessThanOrEqual(16);
      prev = v;
    }
  });
});

describe('compositions', () => {
  it.each(pieces)('$title is long enough not to sound like a short loop', (c) => {
    const seconds = (loopBeats(c) / c.bpm) * 60;
    // the countdown only plays for the last ten seconds, so it must simply outlast them
    expect(seconds).toBeGreaterThanOrEqual(c.id === 'countdown' ? 12 : 75);
    // the countdown can be one idea climbing; everything else needs a journey (an end piece's five sections included)
    expect(c.sections.length).toBeGreaterThanOrEqual(c.id === 'countdown' ? 2 : 5);
  });

  it.each(pieces)('$title: every bar adds up to four beats, and melodies line up with the chords', (c) => {
    for (const sec of c.sections) {
      const chordBars = sec.chords.split('|').filter((b) => b.trim()).length;
      for (const [what, line] of [['melody', sec.melody], ['counter', sec.counter]] as const) {
        if (!line) continue;
        const lengths = barLengths(line);
        lengths.forEach((n, i) => expect(n, `${c.title} › ${sec.name} › ${what} bar ${i + 1}`).toBeCloseTo(4, 6));
        expect(lengths.length, `${c.title} › ${sec.name} › ${what} has a different number of bars than the chords`).toBe(chordBars);
      }
      for (const [sym] of parseChordBars(sec.chords, sec.transpose)) expect(() => parseChord(sym), sym).not.toThrow();
    }
  });

  it.each(pieces)('$title keeps the melody in a singable register and the counter-melody below it', (c) => {
    for (const r of resolve(c)) {
      for (const [, midi] of r.melody) { expect(midi).toBeGreaterThanOrEqual(60); expect(midi).toBeLessThanOrEqual(88); }
      for (const [, midi] of r.counter) { expect(midi).toBeGreaterThanOrEqual(55); expect(midi).toBeLessThanOrEqual(86); }
    }
  });

  it.each(pieces)('$title keeps strong-beat melody notes and every counter-melody note consonant with the harmony', (c) => {
    // a chord tone, or a gentle extension: the 9th or 13th, and the 11th only over minor or suspended chords. Never a
    // clash such as a natural 11th over a major chord or a flat 9th.
    const check = (where: string, beat: number, midi: number) => {
      const chord = parseChord(chordAt(c, beat));
      const interval = (midi - chord.root + 120) % 12;
      // the bass note of a slash chord and the perfect fifth (left out of the spelling of 13th chords) count too
      const tones = [...chordTones(chord), chord.bass, (chord.root + 7) % 12].map((pc) => (pc - chord.root + 12) % 12);
      const minorOrSus = tones.includes(3) || tones.includes(5);
      const ok = tones.includes(interval) || interval === 2 || interval === 9 || (interval === 5 && minorOrSus);
      expect(ok, `${c.title} › ${where}: MIDI ${midi} at beat ${beat} over ${chord.symbol}`).toBe(true);
    };
    for (const r of resolve(c)) {
      for (const [beat, midi] of r.melody) if (beat % 2 === 0) check(`${r.section.name} melody`, r.start + beat, midi);
      for (const [beat, midi] of r.counter) check(`${r.section.name} counter-melody`, r.start + beat, midi);
    }
  });
});

describe('band styles', () => {
  it('are every sound choice except HKUST, which is a set of its own', () => {
    expect(bandStyles.sort()).toEqual(SOUND_STYLES.filter((s) => s !== 'hkust').sort());
    for (const s of SOUND_STYLES) expect(STYLE_INFO[s].label).toBeTruthy();
  });

  for (const style of bandStyles) {
    it.each(Object.values(COMPOSITIONS))(`${style} arranges $title`, (c) => {
      const events = arrange(c, STYLES[style]);
      const total = loopBeats(c);
      expect(events.filter((e) => e.part === 'lead')).toHaveLength(resolve(c).reduce((n, r) => n + r.melody.length, 0));
      expect(events.some((e) => e.part === 'bass')).toBe(true);
      for (const e of events) {
        expect(Number.isFinite(e.beat) && e.beat >= 0 && e.beat < total, `${e.part} at ${e.beat}`).toBe(true);
        expect(e.vel).toBeGreaterThan(0);
        if (e.part === 'bass') expect(e.midi).toBeGreaterThanOrEqual(28);
        if (e.part === 'bass') expect(e.midi).toBeLessThanOrEqual(64);
        if (e.part === 'comp' || e.part === 'pad') expect(e.midi).toBeGreaterThanOrEqual(48);
      }
      // the texture changes between sections: some sections have no drums, some build up with fills and crashes
      if (STYLES[style].drums && c.id !== 'countdown') {
        const drumsPerSection = resolve(c).map((r) => events.filter((e) => e.part === 'drum' && e.drum !== 'crackle' && e.beat >= r.start && e.beat < r.start + r.beats).length / r.beats);
        expect(new Set(drumsPerSection.map((d) => d.toFixed(2))).size, 'drum density never changes').toBeGreaterThan(1);
      }
      expect(events.every((e, i) => i === 0 || events[i - 1].beat <= e.beat)).toBe(true);
    });
  }

  it('keeps Calm free of drums except a soft pulse when the music drives', () => {
    const drums = (id: keyof typeof COMPOSITIONS) => arrange(COMPOSITIONS[id], STYLES.calm).filter((e) => e.part === 'drum');
    expect(drums('lobby')).toHaveLength(0);
    expect(drums('countdown').every((e) => e.drum === 'hat')).toBe(true);
  });

  it('swings the off-beats only where the style asks for it', () => {
    const chill = arrange(COMPOSITIONS.break, STYLES.chill);
    const bright = arrange(COMPOSITIONS.lobby, STYLES.bright);
    expect(chill.some((e) => Math.abs((e.beat % 1) - 0.62) < 1e-6)).toBe(true);
    expect(bright.some((e) => Math.abs((e.beat % 1) - 0.62) < 1e-6)).toBe(false);
  });
});

describe('sound effects', () => {
  it('define something to play for every sound, in a sensible range', () => {
    for (const [id, def] of Object.entries(SFX)) {
      const notes = [...(def.notes ?? []).map((n) => n[0]), ...(def.chords ?? []).flatMap((c) => c[0])];
      expect(notes.length + (def.perc?.length ?? 0), id).toBeGreaterThan(0);
      for (const n of notes) {
        expect(n, id).toBeGreaterThanOrEqual(40);
        expect(n, id).toBeLessThanOrEqual(96);
      }
      expect(def.gain).toBeLessThanOrEqual(0.6);
    }
  });
});

describe('HKUST set', () => {
  const pitched = (i: Instrument) => !!RANGE[i];

  it('spells HKUST in Morse code', () => {
    // ···· −·− ··− ··· −
    expect(MORSE_HKUST).toHaveLength(14);
    expect(MORSE_HKUST.map(([, dash]) => (dash ? '-' : '.')).join('')).toBe('....-.-..-...-');
  });

  it('has music of its own, scored for orchestra rather than given band textures', () => {
    const shared = new Set(Object.values(COMPOSITIONS).map((c) => c.title));
    for (const score of Object.values(HKUST_PIECES)) {
      expect(shared.has(score.title), score.title).toBe(false);
      for (const sec of score.sections) {
        expect(sec.scoring, `${score.title}: ${sec.name}`).toBeDefined();
        expect('texture' in sec).toBe(false);
      }
    }
    expect(HKUST_PIECES.lobby.bpm).toBe(91);
  });

  it.each(Object.values(HKUST_PIECES))('orchestrates $title on orchestral instruments, each in its range', (score) => {
    const { events, beats } = orchestrate(score);
    expect(beats).toBeGreaterThanOrEqual(loopBeats(score));
    expect(events.length).toBeGreaterThan(50);
    for (const e of events) {
      expect(ORCHESTRA[e.inst], e.inst).toBeDefined();
      expect(Number.isFinite(e.beat) && e.beat >= 0 && e.beat < beats, `${e.inst} at ${e.beat}`).toBe(true);
      expect(e.beats).toBeGreaterThan(0);
      expect(e.vel).toBeGreaterThan(0);
      expect(e.vel).toBeLessThanOrEqual(1);
      const range = RANGE[e.inst];
      if (range) expect(e.midi, `${e.inst} ${e.midi}`).toBeGreaterThanOrEqual(range[0] - 5), expect(e.midi, `${e.inst} ${e.midi}`).toBeLessThanOrEqual(range[1] + 5);
      if (e.inst === 'timpani' || e.inst === 'timpaniRoll' || e.inst === 'timpaniTrem') expect(score.timpani).toContain(e.midi);
    }
    expect(events.every((e, i) => i === 0 || events[i - 1].beat <= e.beat)).toBe(true);
    // nothing from the band: no drum kit, no synth voices
    expect(new Set(events.map((e) => e.inst)).has('kick' as Instrument)).toBe(false);
  });

  it.each(Object.values(HKUST_PIECES).filter((s) => s.id !== 'countdown'))('changes its orchestration from section to section in $title', (score) => {
    const leads = score.sections.map((s) => JSON.stringify([s.scoring.tune?.[0], s.scoring.harmony, s.scoring.figure]));
    expect(new Set(leads).size).toBeGreaterThanOrEqual(Math.min(4, score.sections.length - 1));
    expect(new Set(score.sections.map((s) => s.scoring.dyn)).size).toBeGreaterThan(1);
  });

  it('strikes the timpani only on a note of the chord', () => {
    // no ritardando in the countdown, so its score beats are its performed beats
    const score = HKUST_PIECES.countdown;
    for (const e of orchestrate(score).events.filter((e) => e.inst === 'timpani')) {
      expect(chordTones(parseChord(chordAt(score, e.beat))), `beat ${e.beat}`).toContain(e.midi % 12);
    }
  });

  it('slows down where a ritardando is marked, and only there', () => {
    const warp = timeWarp([[8, 16]], 20);
    expect(warp(8)).toBeCloseTo(8, 6);
    expect(warp(16) - warp(8)).toBeGreaterThan(9);
    expect(warp(20) - warp(16)).toBeCloseTo(4, 6);
    expect(orchestrate(HKUST_PIECES.lobby).beats).toBeGreaterThan(loopBeats(HKUST_PIECES.lobby) + 1);
    expect(orchestrate(HKUST_PIECES.countdown).beats).toBeCloseTo(loopBeats(HKUST_PIECES.countdown), 6);
  });

  it('keeps a phrase in one octave when it moves it into an instrument\'s range', () => {
    expect(fitLine([76, 78, 86], 'trumpet')).toBe(-12);
    expect(fitLine([69, 74, 78], 'violins')).toBe(0);
    expect(fitLine([45, 50], 'flute')).toBe(24);
  });

  it('taps the Morse code and lets the sea in where the score asks', () => {
    const { events } = orchestrate(HKUST_PIECES.lobby);
    expect(events.filter((e) => e.inst === 'block' || e.inst === 'blockHigh').length).toBe(MORSE_HKUST.length * 2);
    expect(events.some((e) => e.inst === 'surf')).toBe(true);
    expect(events.some((e) => e.inst === 'bells')).toBe(true);
  });

  it('quotes the anthem motifs and the HKUST cryptogram', () => {
    const melody = (id: keyof typeof HKUST_PIECES) => resolve(HKUST_PIECES[id]).flatMap((r) => r.melody.map((n) => n[1]));
    // compared by interval, so a quotation in another key (the hymn in A, the procession a step up) still counts
    const steps = (ns: number[]) => ns.slice(1).map((n, i) => n - ns[i]);
    const contains = (hay: number[], needle: number[]) => `,${steps(hay).join(',')},`.includes(`,${steps(needle).join(',')},`);
    const call = [78, 79, 69, 69, 69, 76, 76, 78, 74, 73, 74, 76]; // F# G A | A A E E F# D C# D E, as the anthem has it
    const climb = [79, 78, 79, 79, 83, 81, 78, 78, 76, 74, 74, 71, 73, 74]; // G F# G G B | A F# F# E D D B C# D
    const hkust = [71, 74, 79, 75, 77]; // B D G Eb F
    for (const id of ['lobby', 'ended'] as const) {
      expect(contains(melody(id), call), `${id}: call`).toBe(true);
      expect(contains(melody(id), climb), `${id}: climb`).toBe(true);
    }
    expect(contains(melody('lobby'), hkust)).toBe(true);
  });

  it('has an orchestral cue of its own for every sound effect', () => {
    expect(Object.keys(HKUST_CUES).sort()).toEqual(Object.keys(SFX).sort());
    for (const [id, set] of Object.entries(HKUST_CUES)) {
      expect(set.cues.length, id).toBeGreaterThan(0);
      expect(set.gain, id).toBeLessThanOrEqual(0.6);
      for (const [inst, midi, at, len] of set.cues) {
        expect(ORCHESTRA[inst], `${id} ${inst}`).toBeDefined();
        expect(at).toBeGreaterThanOrEqual(0);
        expect(len).toBeGreaterThan(0);
        const range = RANGE[inst];
        if (pitched(inst)) expect(midi >= range![0] - 5 && midi <= range![1] + 5, `${id}: ${inst} ${midi}`).toBe(true);
      }
    }
  });
});
