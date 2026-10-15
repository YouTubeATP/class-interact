import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const TEMPLATE_DB = join(tmpdir(), 'classinteract-test-template.db');

/** Builds one migrated SQLite database; every test file copies it, so each gets an isolated, fully migrated DB. */
export default function setup() {
  rmSync(TEMPLATE_DB, { force: true });
  const r = spawnSync(process.execPath, [resolve(__dirname, '../scripts/prisma.mjs'), 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: `file:${TEMPLATE_DB}` },
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`Could not migrate the test database:\n${r.stdout}\n${r.stderr}`);
}
