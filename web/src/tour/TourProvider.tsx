import { Suspense, createContext, lazy, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { TOUR_ROUTES, type TourId } from './routes';
import { markTourSeen } from './seen';

// The steps and the overlay are only downloaded when a tour actually starts.
const TourOverlay = lazy(() => import('./TourOverlay'));

interface TourApi {
  /** Starts a tour. From another page it first goes to the tour's own page (when that has a fixed address). */
  start: (id: TourId) => void;
  stop: () => void;
  active: TourId | null;
}

const TourContext = createContext<TourApi>({ start: () => {}, stop: () => {}, active: null });
export const useTour = () => useContext(TourContext);

export function TourProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [active, setActive] = useState<TourId | null>(null);
  const pending = useRef<{ id: TourId; at: number } | null>(null);
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  const start = useCallback((id: TourId) => {
    const route = TOUR_ROUTES[id];
    if (route.match.test(pathRef.current)) { setActive(id); return; }
    if (!route.entry) return;
    pending.current = { id, at: Date.now() };
    navigate(route.entry);
  }, [navigate]);

  const stop = useCallback(() => setActive(null), []);

  useEffect(() => {
    // a tour asked for from another page begins once that page has arrived (not if sign-in intervened for long)
    const p = pending.current;
    if (p && TOUR_ROUTES[p.id].match.test(pathname)) {
      pending.current = null;
      if (Date.now() - p.at < 10_000) setActive(p.id);
    }
    // a tour never outlives its page
    setActive((cur) => (cur && !TOUR_ROUTES[cur].match.test(pathname) ? null : cur));
  }, [pathname]);

  const api = useMemo(() => ({ start, stop, active }), [start, stop, active]);

  return (
    <TourContext.Provider value={api}>
      {children}
      {active && (
        <Suspense fallback={null}>
          <TourOverlay key={active} id={active} onClose={(finished) => { if (finished) markTourSeen(active); setActive(null); }} />
        </Suspense>
      )}
    </TourContext.Provider>
  );
}
