/**
 * Presenter phones: who presents which slides, and when their phone should nudge them.
 *
 * Each slide may name a `presenter`. Consecutive slides with the same name form one turn. The roster is never stored:
 * it is derived from the slides, so renaming a presenter is just editing the slides.
 */

/** Compare names the way people type them: case, accents and spacing do not matter. */
export function normalizeName(name: string | undefined | null): string {
  return (name ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function sameName(a: string | undefined | null, b: string | undefined | null): boolean {
  const na = normalizeName(a);
  return na !== '' && na === normalizeName(b);
}

/** Distinct presenter names in slide order, keeping the first spelling used. */
export function rosterOf(slides: readonly { presenter?: string }[]): string[] {
  const seen = new Map<string, string>();
  for (const s of slides) {
    const n = normalizeName(s.presenter);
    if (n && !seen.has(n)) seen.set(n, s.presenter!.trim());
  }
  return [...seen.values()];
}

export interface Turn {
  presenter: string;
  /** First and last slide index of the turn, inclusive. */
  from: number;
  to: number;
}

/** Contiguous runs of slides with the same presenter. Unassigned slides are not part of any turn. */
export function turnsOf(slides: readonly { presenter?: string }[]): Turn[] {
  const turns: Turn[] = [];
  slides.forEach((s, i) => {
    const name = s.presenter?.trim() ?? '';
    if (!normalizeName(name)) return;
    const last = turns[turns.length - 1];
    if (last && last.to === i - 1 && sameName(last.presenter, name)) last.to = i;
    else turns.push({ presenter: name, from: i, to: i });
  });
  return turns;
}

/** Who presents the slide at `index`, if anyone. */
export function presenterAt(index: number, turns: readonly Turn[]): string | null {
  return turns.find((t) => index >= t.from && index <= t.to)?.presenter ?? null;
}

export function isMine(index: number, name: string, turns: readonly Turn[]): boolean {
  return sameName(presenterAt(index, turns), name);
}

export type Cue = 'ready' | 'start' | 'end';

/**
 * What a presenter's phone should signal when the room moves from slide `prev` to slide `index`.
 * - `start`: your turn has just begun.
 * - `end`: your turn has just finished (you handed over).
 * - `ready`: the room is now on the last slide before your next turn.
 * Going backwards never signals `ready`: you are not about to be on.
 */
export function cueFor(prev: number | null, index: number, name: string, turns: readonly Turn[]): Cue | null {
  if (!normalizeName(name) || prev === index) return null;
  const wasMine = prev !== null && prev >= 0 && isMine(prev, name, turns);
  const nowMine = index >= 0 && isMine(index, name, turns);
  if (nowMine && !wasMine) return 'start';
  if (wasMine && !nowMine) return 'end';
  if (nowMine) return null;
  const forward = prev === null || index > prev;
  if (forward && index >= 0 && isMine(index + 1, name, turns)) return 'ready';
  return null;
}

/** A cue that reads as a sentence. Phones show cues at a glance, so the editor nudges these towards keywords. */
export function cueLooksLikeALine(cue: string): boolean {
  return cue.trim().split(/\s+/).filter(Boolean).length > 8;
}
