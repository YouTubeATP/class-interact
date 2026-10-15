import { LogOut, Presentation } from 'lucide-react';
import { Suspense, lazy, useEffect, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { Notice, Spinner } from '@/components/Status';
import { Button } from '@/components/ui/button';
import { useClientConfig } from '@/lib/joinUrl';
import { STUDIO_TOKEN_KEY, store } from '@/lib/storage';
import LoginPage from './Login';
import LibraryPage from './Library';

const EditorPage = lazy(() => import('./Editor'));
const DashboardPage = lazy(() => import('./Dashboard'));
const ResultsPage = lazy(() => import('./Results'));

/** Studio pages require sign-in only when the server has STUDIO_PASSWORD set. */
function RequireStudio({ children }: { children: ReactNode }) {
  const cfg = useClientConfig();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const onUnauthorized = () => {
      store.remove(STUDIO_TOKEN_KEY);
      navigate(`/login?next=${encodeURIComponent(location.pathname)}`, { replace: true });
    };
    window.addEventListener('ci:unauthorized', onUnauthorized);
    return () => window.removeEventListener('ci:unauthorized', onUnauthorized);
  }, [navigate, location.pathname]);

  if (!cfg) return <div className="grid min-h-dvh place-items-center"><Spinner className="size-7" /></div>;
  if (cfg.authRequired && !store.get<string>(STUDIO_TOKEN_KEY)) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  return <>{children}</>;
}

export function StudioHeader({ children }: { children?: ReactNode }) {
  const cfg = useClientConfig();
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-line bg-paper/90 px-4 backdrop-blur sm:px-6">
      <Link to="/studio" className="rounded-lg" aria-label="ClassInteract Studio home"><Logo /></Link>
      <span className="hidden h-5 w-px bg-line-2 sm:block" aria-hidden />
      <nav className="hidden items-center gap-1 sm:flex" aria-label="Studio">
        <Link to="/studio" className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-ink-2 hover:bg-ink/6 hover:text-ink"><Presentation className="size-4" aria-hidden /> Presentations</Link>
      </nav>
      <div className="ml-auto flex items-center gap-2">
        {children}
        {cfg?.authRequired && (
          <Button variant="ghost" size="sm" onClick={() => { store.remove(STUDIO_TOKEN_KEY); navigate('/login'); }}><LogOut className="size-4" aria-hidden /> Sign out</Button>
        )}
      </div>
    </header>
  );
}

function NotFound() {
  return <div className="grid min-h-dvh place-items-center"><Notice title="Page not found" action={<Button asChild variant="primary"><Link to="/studio">Back to the Studio</Link></Button>}>That address does not match anything here.</Notice></div>;
}

export default function StudioRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/studio" element={<RequireStudio><LibraryPage /></RequireStudio>} />
      <Route path="/studio/:id" element={<RequireStudio><Suspense fallback={<Loading />}><EditorPage /></Suspense></RequireStudio>} />
      <Route path="/session/:id" element={<RequireStudio><Suspense fallback={<Loading />}><DashboardPage /></Suspense></RequireStudio>} />
      <Route path="/results/:id" element={<RequireStudio><Suspense fallback={<Loading />}><ResultsPage /></Suspense></RequireStudio>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const Loading = () => <div className="grid min-h-dvh place-items-center"><Spinner className="size-7" /></div>;
