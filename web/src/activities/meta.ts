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
export const OPTION_COLORS = [
  { bg: '#ffd9e0', strong: '#d93a55', ink: '#7a1428' },
  { bg: '#d6e6ff', strong: '#2c6fe0', ink: '#10346b' },
  { bg: '#ffefb8', strong: '#c48500', ink: '#5d4100' },
  { bg: '#cff0df', strong: '#17935d', ink: '#0b4a30' },
  { bg: '#e4deff', strong: '#6b4ff0', ink: '#2f1d8f' },
  { bg: '#ffe0cc', strong: '#e0560c', ink: '#7a2d00' },
] as const;

export const letter = (i: number) => String.fromCharCode(65 + i);

/** Vivid but legible colours for word-cloud terms. */
export const CLOUD_COLORS = ['#3347ff', '#d6336c', '#0e8f63', '#dd5a14', '#6c4bff', '#0f7fb8', '#b8860b', '#c2255c'];
export function colorFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return CLOUD_COLORS[h % CLOUD_COLORS.length];
}
