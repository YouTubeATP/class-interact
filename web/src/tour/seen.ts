import { store } from '@/lib/storage';
import type { TourId } from './routes';

const KEY = 'ci:tours-seen';

/** Which tours this browser has finished or dismissed, so the first-visit invitation only appears once. */
export const hasSeenTour = (id: TourId) => (store.get<string[]>(KEY) ?? []).includes(id);

export function markTourSeen(id: TourId) {
  const seen = store.get<string[]>(KEY) ?? [];
  if (!seen.includes(id)) store.set(KEY, [...seen, id]);
}
