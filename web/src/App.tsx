import { Suspense, lazy } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { useAppearanceSync } from '@/lib/appearance';
import { Spinner } from '@/components/Status';
import JoinPage from '@/pages/Join';
import PlayPage from '@/pages/Play';

// The studio is only for presenters; keep it out of the bundle phones download.
const StudioRoutes = lazy(() => import('@/studio/StudioRoutes'));
const ProjectPage = lazy(() => import('@/pages/Project'));
const HelpPage = lazy(() => import('@/help/ParticipantHelp'));

export default function App() {
  const { pathname } = useLocation();
  useAppearanceSync(pathname);
  return (
    <Suspense fallback={<div className="grid min-h-dvh place-items-center"><Spinner className="size-7" /></div>}>
      <Routes>
        <Route path="/" element={<JoinPage />} />
        <Route path="/join" element={<JoinPage />} />
        <Route path="/join/:pin" element={<JoinPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/play/:sessionId" element={<PlayPage />} />
        <Route path="/project/:sessionId" element={<ProjectPage />} />
        <Route path="/*" element={<StudioRoutes />} />
      </Routes>
    </Suspense>
  );
}
