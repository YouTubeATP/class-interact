import { SOUND_STYLES } from '@classinteract/shared';
import { describe, expect, it } from 'vitest';
import { barLengths, chordAt, COMPOSITIONS, loopBeats, parseChordBars, resolve } from './compositions';
import { SFX } from './sfx';
import { arrange, STYLES } from './styles';
import { chordTones, parseChord, voiceChord } from './theory';

const pieces = Object.values(COMPOSITIONS);

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
    expect(c.sections.length).toBeGreaterThanOrEqual(c.id === 'countdown' ? 4 : 6);
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

describe('styles', () => {
  for (const style of SOUND_STYLES) {
    it.each(pieces)(`${style} arranges $title`, (c) => {
      const events = arrange(c, STYLES[style]);
      const total = loopBeats(c);
      expect(events.filter((e) => e.part === 'lead')).toHaveLength(resolve(c).reduce((n, r) => n + r.melody.length, 0));
      expect(events.some((e) => e.part === 'bass')).toBe(true);
      for (const e of events) {
        expect(Number.isFinite(e.beat) && e.beat >= 0 && e.beat < total, `${e.part} at ${e.beat}`).toBe(true);
        expect(e.vel).toBeGreaterThan(0);
        if (e.part === 'bass') expect(e.midi).toBeGreaterThanOrEqual(28);
        if (e.part === 'bass') expect(e.midi).toBeLessThanOrEqual(60);
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
