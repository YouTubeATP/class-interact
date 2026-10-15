import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Dev-server ports and hosts come from the repo's .env (or the real environment), so nothing is pinned to 5173/3001:
 *   WEB_PORT        where this dev server listens (default 5173)
 *   PORT            where the API listens (default 3001); the proxy follows it. BACKEND_URL overrides the whole URL.
 *   PUBLIC_URL      the address people use (e.g. https://class.example.com behind a Cloudflare Tunnel)
 *   ALLOWED_HOSTS   extra Host headers Vite should accept, comma separated, or * for any
 *   HMR_CLIENT_PORT port the browser uses for hot reload when it is not the dev server's own (443 behind an https tunnel)
 */
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, fileURLToPath(new URL('..', import.meta.url)), ''), ...process.env };
  const webPort = Number(env.WEB_PORT) || 5173;
  const apiPort = Number(env.PORT) || 3001;
  const backend = env.BACKEND_URL || `http://localhost:${apiPort}`;

  // Vite refuses unknown Host headers (DNS-rebinding protection). A tunnel or domain has to be allowed explicitly.
  const extra = (env.ALLOWED_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean);
  let publicHost: string | null = null;
  try { publicHost = env.PUBLIC_URL ? new URL(env.PUBLIC_URL).hostname : null; } catch { /* ignore a malformed PUBLIC_URL */ }
  const allowedHosts: true | string[] = extra.includes('*') ? true : [...extra, ...(publicHost ? [publicHost] : [])];

  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      host: true,
      port: webPort,
      // fail loudly instead of drifting to another port: the tunnel, QR code and bookmarks all point at this one
      strictPort: true,
      allowedHosts,
      ...(env.HMR_CLIENT_PORT ? { hmr: { clientPort: Number(env.HMR_CLIENT_PORT) } } : {}),
      proxy: {
        '/api': backend,
        '/uploads': backend,
        '/socket.io': { target: backend, ws: true },
      },
    },
    build: { sourcemap: false, chunkSizeWarningLimit: 900 },
    test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'] },
  };
});
