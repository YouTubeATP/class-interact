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
const r = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], { stdio: 'inherit', env: process.env, cwd: resolve(here, '..') });
process.exit(r.status ?? 1);
