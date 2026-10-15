#!/usr/bin/env node
// Starts the *built* app (server/dist + web/dist) on a throwaway SQLite database for Playwright.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'ci-e2e-'));
const port = process.env.E2E_PORT ?? '4173';
const env = {
  ...process.env,
  NODE_ENV: 'production',
  PORT: port,
  DATA_DIR: dir,
  DATABASE_URL: `file:${join(dir, 'e2e.db')}`,
  WEB_DIST: join(root, 'web/dist'),
  PUBLIC_URL: `http://localhost:${port}`,
  AUTO_SEED: 'true',
  RATE_LIMIT: 'false',
  STUDIO_PASSWORD: '',
};

const mig = spawnSync(process.execPath, [join(root, 'server/scripts/prisma.mjs'), 'migrate', 'deploy'], { env, stdio: 'inherit' });
if (mig.status !== 0) process.exit(mig.status ?? 1);

const child = spawn(process.execPath, [join(root, 'server/dist/index.js')], { env, stdio: 'inherit', cwd: join(root, 'server') });
const stop = () => { child.kill('SIGTERM'); try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code) => process.exit(code ?? 0));
