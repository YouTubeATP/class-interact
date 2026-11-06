#!/usr/bin/env node
// Runs the Prisma CLI with the repo's .env loaded and a default DATABASE_URL, so
// `npm run db:migrate` works with or without a .env file.
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
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

/**
 * Where npm installed the Prisma CLI. Asked of Node's own module resolution from the server package, so it is found
 * whether npm put it at the root (node_modules/prisma) or inside the workspace (server/node_modules/prisma).
 */
function findPrisma() {
  const require = createRequire(resolve(here, '../package.json'));
  try {
    const pkgFile = require.resolve('prisma/package.json');
    const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
    const entry = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.prisma ?? 'build/index.js';
    return { dir: dirname(pkgFile), bin: resolve(dirname(pkgFile), entry), version: pkg.version };
  } catch {
    return null;
  }
}

const found = findPrisma();
const bin = found?.bin;
if (!bin || !existsSync(bin)) {
  // not installed, or half-installed: usually an install that could not replace its files because the server was running
  const what = found
    ? `Prisma ${found.version} is installed at ${found.dir}, but its program file ${bin} is missing.`
    : 'The Prisma package is not installed (no node_modules/prisma for the server).';
  const listing = found && existsSync(found.dir) ? `\nThat folder contains: ${readdirSync(found.dir).join(', ')}` : '';
  console.error(`
${what}${listing}
This usually happens when an install ran while the server was running, so Windows could not replace Prisma's files,
or when antivirus software removed the file.
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
