import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// E2E_DEV=1 runs the suite against `npm run dev` (Vite + API with hot reload) instead of the production build.
const dev = process.env.E2E_DEV === '1';
const port = process.env.E2E_PORT ?? (dev ? '5173' : '4173');
const apiPort = process.env.E2E_API_PORT ?? '3001'; // dev mode only: where the API behind Vite listens
const devData = dev ? mkdtempSync(join(tmpdir(), 'ci-e2e-dev-')) : '';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  // No retries: a test that only passes on the second try is a bug report, not a pass.
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // No glyph hinting: text then scales linearly, so layout checks give the same answer on every machine
    launchOptions: {
      args: ['--font-render-hinting=none'],
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: dev
    ? {
        // predev migrates and seeds this throwaway database, then Vite (E2E_PORT, default 5173) proxies to the API (E2E_API_PORT, default 3001)
        command: 'npm run dev',
        url: `http://localhost:${port}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: 'pipe',
        env: { DATABASE_URL: `file:${join(devData, 'dev.db')}`, DATA_DIR: devData, RATE_LIMIT: 'false', WEB_PORT: port, PORT: apiPort },
      }
    : {
        command: 'node scripts/e2e-server.mjs',
        url: `http://localhost:${port}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
        stdout: 'pipe',
      },
});
