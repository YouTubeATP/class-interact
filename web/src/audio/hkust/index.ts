/**
 * The HKUST sound set. Unlike the five band styles, which arrange one shared set of compositions with different
 * instruments (styles.ts), HKUST is self-contained: its own music (pieces.ts), scored and performed by its own
 * orchestrator (score.ts) on its own instruments (instruments.ts), seated on a stage in a concert hall (hall.ts),
 * with its own sound effects (sfx.ts). The engine only asks it for a piece's events and how to play them.
 */
import type { Ctx } from '../instruments';
import type { MusicId } from '../engine';
import { stage, type Stage } from './hall';
import { ORCHESTRA } from './instruments';
import { HKUST_PIECES } from './pieces';
import { orchestrate, type OrchEvent } from './score';

export { playCue } from './sfx';

export const HKUST_SET = {
  label: 'HKUST',
  hint: 'A set of its own: an orchestra in a concert hall playing pieces on the HKUST anthem, its bell and the sea at Clear Water Bay.',
  /** Overall music level, matched to the band styles' loudness by measurement. */
  level: 1,
};

const cache = new Map<MusicId, { events: OrchEvent[]; beats: number; bpm: number }>();

/** One full pass of a piece, performed: events in beats, the pass's length in beats (ritardandos included) and tempo. */
export function hkustTrack(id: MusicId) {
  let t = cache.get(id);
  if (!t) {
    const score = HKUST_PIECES[id];
    t = { ...orchestrate(score), bpm: score.bpm };
    cache.set(id, t);
  }
  return t;
}

/** A stage for the music in its hall, playing into `dest`. */
export const hkustStage = (ctx: Ctx, dest: AudioNode): Stage => stage(ctx, dest);

export function playOrch(ctx: Ctx, s: Stage, e: OrchEvent, t: number, spb: number) {
  ORCHESTRA[e.inst](ctx, s.seat(e.inst), t, e.midi, e.beats * spb, e.vel);
}
