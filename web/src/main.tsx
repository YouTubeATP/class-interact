import { MotionConfig } from 'framer-motion';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Respect the OS "reduce motion" setting everywhere framer-motion is used. */}
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <App />
        <Toaster position="bottom-center" toastOptions={{ style: { borderRadius: '14px', fontWeight: 600 } }} />
      </BrowserRouter>
    </MotionConfig>
  </StrictMode>,
);
