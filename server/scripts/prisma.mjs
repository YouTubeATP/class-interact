#!/usr/bin/env node
// Runs the Prisma CLI with the repo's .env loaded and a default DATABASE_URL, so
// `npm run db:migrate` works with or without a .env file.
import { existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const envFile = resolve(here, '../../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
process.env.DATABASE_URL ??= 'file:../data/classinteract.db';

const url = process.env.DATABASE_URL;
if (url.startsWith('file:')) {
  const rel = url.slice(5).split('?')[0];
  const abs = rel.startsWith('/') ? rel : resolve(here, '../prisma', rel);
  mkdirSync(dirname(abs), { recursive: true });
}

const bin = resolve(here, '../../node_modules/prisma/build/index.js');
if (!existsSync(bin)) {
  // a half-installed Prisma: usually an install that could not replace its files because the server was running
  console.error(`
The Prisma command-line tool is missing or incomplete (${bin} does not exist).
This usually happens when an install ran while the server was running, so Windows could not replace Prisma's files.
To fix it:
  1. Stop any running server (Ctrl+C in its terminal).
  2. Delete the broken copies:
       Windows (PowerShell):  Remove-Item -Recurse -Force node_modules\\prisma, node_modules\\@prisma, node_modules\\.prisma
       macOS / Linux:         rm -rf node_modules/prisma node_modules/@prisma node_modules/.prisma
  3. Run: npm install
`);
  process.exit(1);
}
const r = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], { stdio: 'inherit', env: process.env, cwd: resolve(here, '..') });
process.exit(r.status ?? 1);
