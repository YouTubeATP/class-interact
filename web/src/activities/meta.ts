import { BarChart3, Cloud, ClipboardList, FileText, MessageSquareText, SlidersHorizontal, Trophy, type LucideIcon } from 'lucide-react';
import type { SlideType } from '@classinteract/shared';

export interface TypeMeta {
  label: string;
  short: string;
  icon: LucideIcon;
  description: string;
}

export const typeMeta: Record<SlideType, TypeMeta> = {
  content: { label: 'Content slide', short: 'Slide', icon: FileText, description: 'Title, text, steps or an image. Nothing to submit.' },
  quiz: { label: 'Quiz', short: 'Quiz', icon: Trophy, description: 'Timed multiple choice with points and a leaderboard.' },
  poll: { label: 'Poll', short: 'Poll', icon: BarChart3, description: 'Single or multiple choice with live bars.' },
  wordcloud: { label: 'Word cloud', short: 'Word cloud', icon: Cloud, description: 'Short answers grouped by how often they appear.' },
  open: { label: 'Open-ended', short: 'Open', icon: MessageSquareText, description: 'Short or paragraph answers shown as cards.' },
  rating: { label: 'Rating scale', short: 'Rating', icon: SlidersHorizontal, description: 'A numeric scale with labelled ends and an average.' },
  survey: { label: 'Survey', short: 'Survey', icon: ClipboardList, description: 'Several questions answered together.' },
};

/** Colours for answer options A–F: pastel fill, strong accent for the letter chip. */
/** Colours for answer options A–F: a soft fill and ink that follow the appearance (CSS tokens), and a strong hue for the letter chip. */
export const OPTION_COLORS = [
  { bg: 'var(--opt-0-bg)', strong: '#d93a55', ink: 'var(--opt-0-ink)' },
  { bg: 'var(--opt-1-bg)', strong: '#2c6fe0', ink: 'var(--opt-1-ink)' },
  { bg: 'var(--opt-2-bg)', strong: '#b07800', ink: 'var(--opt-2-ink)' },
  { bg: 'var(--opt-3-bg)', strong: '#17935d', ink: 'var(--opt-3-ink)' },
  { bg: 'var(--opt-4-bg)', strong: '#6b4ff0', ink: 'var(--opt-4-ink)' },
  { bg: 'var(--opt-5-bg)', strong: '#d4520b', ink: 'var(--opt-5-ink)' },
] as const;

export const letter = (i: number) => String.fromCharCode(65 + i);

/** Vivid but legible colours for word-cloud terms. */
export const CLOUD_COLORS = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `var(--cloud-${i})`);
export function colorFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return CLOUD_COLORS[h % CLOUD_COLORS.length];
}
