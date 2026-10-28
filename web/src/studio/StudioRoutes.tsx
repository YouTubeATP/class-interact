import { BookOpen, CircleHelp, Compass, LogOut, Presentation, Settings2, Smartphone, UsersRound } from 'lucide-react';
import { AppearanceToggle, MuteButton } from '@/components/Preferences';
import { Suspense, lazy, useEffect, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { Notice, Spinner } from '@/components/Status';
import { Button } from '@/components/ui/button';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/dropdown';
import { tourForPath } from '@/tour/routes';
import { useTour } from '@/tour/TourProvider';
import { useClientConfig } from '@/lib/joinUrl';
import { STUDIO_TOKEN_KEY, store } from '@/lib/storage';
import LoginPage from './Login';
import LibraryPage from './Library';

const EditorPage = lazy(() => import('./Editor'));
const DashboardPage = lazy(() => import('./Dashboard'));
const ResultsPage = lazy(() => import('./Results'));
const StudioHelp = lazy(() => import('@/help/StudioHelp'));
const RemotePage = lazy(() => import('./Remote'));
const LearnersPage = lazy(() => import('./Learners'));
const SettingsPage = lazy(() => import('./Settings'));

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

/** Help menu: replay the tour for this page, or open the help centre. */
function HelpMenu() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { start } = useTour();
  const tour = tourForPath(pathname);
  return (
    <Menu>
      <MenuTrigger asChild><Button variant="ghost" size="sm" aria-label="Help" data-testid="help-menu" data-tour="help"><CircleHelp className="size-4" aria-hidden /> <span className="max-sm:sr-only">Help</span></Button></MenuTrigger>
      <MenuContent>
        {tour && <MenuItem icon={<Compass className="size-4" />} onSelect={() => setTimeout(() => start(tour), 150)} data-testid="help-tour">Tour of this page</MenuItem>}
        <MenuItem icon={<BookOpen className="size-4" />} onSelect={() => navigate('/studio/help')} data-testid="help-centre">Help centre</MenuItem>
        <MenuItem icon={<Smartphone className="size-4" />} onSelect={() => navigate('/help')} data-testid="help-participants">What participants see</MenuItem>
      </MenuContent>
    </Menu>
  );
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
        <Link to="/learners" className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-ink-2 hover:bg-ink/6 hover:text-ink" data-testid="nav-learners"><UsersRound className="size-4" aria-hidden /> Across sessions</Link>
      </nav>
      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        {children}
        <MuteButton scope="studio" />
        <AppearanceToggle scope="studio" compact />
        <Button asChild variant="ghost" size="icon-sm" aria-label="Settings"><Link to="/settings" data-testid="nav-settings"><Settings2 className="size-4" aria-hidden /></Link></Button>
        <HelpMenu />
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
      <Route path="/studio/help" element={<RequireStudio><Suspense fallback={<Loading />}><StudioHelp /></Suspense></RequireStudio>} />
      <Route path="/studio/:id" element={<RequireStudio><Suspense fallback={<Loading />}><EditorPage /></Suspense></RequireStudio>} />
      <Route path="/session/:id" element={<RequireStudio><Suspense fallback={<Loading />}><DashboardPage /></Suspense></RequireStudio>} />
      <Route path="/results/:id" element={<RequireStudio><Suspense fallback={<Loading />}><ResultsPage /></Suspense></RequireStudio>} />
      <Route path="/learners" element={<RequireStudio><Suspense fallback={<Loading />}><LearnersPage /></Suspense></RequireStudio>} />
      <Route path="/settings" element={<RequireStudio><Suspense fallback={<Loading />}><SettingsPage /></Suspense></RequireStudio>} />
      {/* not behind the Studio password: a co-presenter's link carries its own revocable token */}
      <Route path="/remote/:id" element={<Suspense fallback={<Loading />}><RemotePage /></Suspense>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const Loading = () => <div className="grid min-h-dvh place-items-center"><Spinner className="size-7" /></div>;
