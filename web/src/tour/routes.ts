/**
 * Which page each tour belongs to. Kept apart from the step text so the provider (loaded on every page, phones included)
 * stays tiny; the steps themselves ship in the overlay's own chunk.
 */
export type TourId = 'join' | 'library' | 'editor' | 'dashboard';

export interface TourRoute {
  /** Pages the tour runs on */
  match: RegExp;
  /** Where to go first when the tour is started from somewhere else. Absent when the page needs an id (editor, dashboard). */
  entry?: string;
  /** Short name for menus and buttons */
  label: string;
}

export const TOUR_ROUTES: Record<TourId, TourRoute> = {
  join: { match: /^\/(join(\/.*)?)?$/, entry: '/join', label: 'Joining a session' },
  library: { match: /^\/studio\/?$/, entry: '/studio', label: 'The Studio' },
  editor: { match: /^\/studio\/(?!help\/?$)[^/]+\/?$/, label: 'The editor' },
  dashboard: { match: /^\/session\/[^/]+\/?$/, label: 'Running a session' },
};

export function tourForPath(pathname: string): TourId | null {
  for (const id of Object.keys(TOUR_ROUTES) as TourId[]) if (TOUR_ROUTES[id].match.test(pathname)) return id;
  return null;
}
