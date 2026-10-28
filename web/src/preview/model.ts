import { DEFAULT_FEATURES, definitions, type ParticipantSnapshot, type PresentationDoc, type Slide, type SessionState } from '@classinteract/shared';
import type { StageModel } from '@/render/model';
import { sampleResults } from './sample';

export type PreviewView = 'prompt' | 'results' | 'answer';

const noop = () => Date.now();

function stateFor(slide: Slide, index: number, view: PreviewView): SessionState {
  const def = definitions[slide.type] as any;
  const b = def.behavior(slide);
  const t = Date.now();
  const interactive = b.interactive;
  return {
    phase: !interactive ? 'ready' : view === 'prompt' ? 'open' : 'revealed',
    activityIndex: index,
    resultsVisible: interactive && view !== 'prompt',
    correctVisible: interactive && b.hasCorrectAnswer && view === 'answer',
    leaderboardVisible: false,
    openedAt: view === 'prompt' && b.timeLimitSec ? t : null,
    deadlineAt: view === 'prompt' && b.timeLimitSec ? t + b.timeLimitSec * 1000 : null,
    version: 0,
  };
}

function publicActivity(slide: Slide, index: number, view: PreviewView) {
  const def = definitions[slide.type] as any;
  const { id, type, ...config } = slide;
  return {
    id, key: id, index, type, interactive: def.behavior(config).interactive,
    config: def.publicConfig(config, { revealCorrect: view === 'answer' }),
  };
}

/** The same model the live projector uses, filled with sample data. */
export function previewStageModel(doc: PresentationDoc, index: number, view: PreviewView, join: { url: string; host: string }): StageModel {
  const slide = doc.slides[index];
  const base = { id: 'preview', title: doc.title, pin: '123456', mode: 'standalone' as const, status: 'live' as const, theme: doc.theme, collectNames: true, activityCount: doc.slides.length, features: DEFAULT_FEATURES };
  if (!slide) {
    return { session: base, state: { phase: 'lobby', activityIndex: -1, resultsVisible: false, correctVisible: false, leaderboardVisible: false, openedAt: null, deadlineAt: null, version: 0 }, activity: null, counts: { participants: 12, online: 12, responses: 0, respondents: 0 }, results: null, leaderboard: null, recentNames: ['Ada', 'Grace', 'Alan', 'Katherine'], now: noop, join, appearance: doc.theme.appearance ?? 'light' };
  }
  const { id, type, ...config } = slide;
  const interactive = (definitions[type] as any).behavior(config).interactive;
  const state = stateFor(slide, index, view);
  const results = interactive ? sampleResults(type, config as never) : null;
  return {
    session: base,
    state,
    activity: publicActivity(slide, index, view) as StageModel['activity'],
    counts: { participants: 14, online: 14, responses: results && 'total' in results ? results.total : 0, respondents: results && 'total' in results ? results.total : 0 },
    results: state.resultsVisible ? results : null,
    leaderboard: null,
    recentNames: [],
    now: noop,
    join,
    appearance: doc.theme.appearance ?? 'light',
  };
}

/** Snapshot for the phone preview — rendered by the real ParticipantApp. */
export function previewParticipantSnapshot(doc: PresentationDoc, index: number, view: PreviewView): ParticipantSnapshot {
  const slide = doc.slides[index];
  const m = previewStageModel(doc, index, view, { url: '', host: '' });
  return {
    role: 'participant',
    session: m.session,
    state: slide ? m.state : { ...m.state, phase: 'lobby' },
    serverNow: Date.now(),
    activity: m.activity,
    counts: m.counts,
    results: m.results && slide && (definitions[slide.type] as any).behavior(slide).shareResults ? m.results : null,
    leaderboard: null,
    recentNames: [],
    me: { id: 'me', name: 'You', submissions: [], totalScore: 0, standing: null, team: null, pulse: null, linked: false },
    run: null,
    teamBoard: null,
    questions: null,
    highlight: null,
    pulse: null,
    selfPaced: null,
  };
}
