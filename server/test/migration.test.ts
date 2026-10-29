import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';

/**
 * A database created by the previous release, with a finished session in it, is upgraded by `prisma migrate deploy`
 * and keeps everything: the session, its participants and their answers, now attached to run #1 of each activity.
 */
const root = resolve(__dirname, '..');
const prismaBin = resolve(root, '../node_modules/prisma/build/index.js');
const dir = mkdtempSync(join(tmpdir(), 'ci-migrate-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function deploy(migrationsDir: string, db: string) {
  const schemaDir = join(dir, `schema-${Math.random().toString(36).slice(2)}`);
  cpSync(migrationsDir, join(schemaDir, 'migrations'), { recursive: true });
  // the CLI only needs a datasource to apply SQL migrations
  writeFileSync(join(schemaDir, 'schema.prisma'), 'datasource db {\n  provider = "sqlite"\n  url = env("DATABASE_URL")\n}\n');
  const r = spawnSync(process.execPath, [prismaBin, 'migrate', 'deploy', '--schema', join(schemaDir, 'schema.prisma')], { env: { ...process.env, DATABASE_URL: `file:${db}` }, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${r.stdout}\n${r.stderr}`);
}

describe('upgrading an existing database', () => {
  it('keeps old sessions, participants and answers, and attaches them to run #1', async () => {
    const all = resolve(root, 'prisma/migrations');
    const names = readdirSync(all).filter((n) => /^\d+_/.test(n)).sort();
    const old = join(dir, 'old-migrations');
    for (const n of names.filter((n) => n < '20261028120000')) cpSync(join(all, n), join(old, n), { recursive: true });
    cpSync(join(all, 'migration_lock.toml'), join(old, 'migration_lock.toml'));

    const db = join(dir, 'legacy.db');
    deploy(old, db);
    const prisma = new PrismaClient({ datasources: { db: { url: `file:${db}` } }, log: [] });
    const state = JSON.stringify({ phase: 'ended', activityIndex: 0, resultsVisible: true, correctVisible: true, leaderboardVisible: false, openedAt: null, deadlineAt: null, version: 7 });
    const quiz = JSON.stringify({ notes: '', question: 'Pick B', kind: 'single', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctOptionId: 'b', correctOptionIds: [], pairs: [], items: [], partialCredit: true, explanation: '', scored: true, points: 1000, speedBonus: false, showResultsToParticipants: true, timeLimitSec: null, autoOpen: true });
    // raw SQL, exactly the columns the old release had
    await prisma.$executeRawUnsafe(`INSERT INTO "Session" (id, title, theme, mode, collectNames, status, pin, livePin, state, createdAt, endedAt, lastActivityAt) VALUES ('s1', 'Old lesson', '{"palette":"azure","background":"soft"}', 'standalone', 1, 'ended', '123456', NULL, '${state}', 1700000000000, 1700000600000, 1700000600000)`);
    await prisma.$executeRawUnsafe(`INSERT INTO "SessionActivity" (id, sessionId, key, position, type, config, completed, answerRevealed, seed) VALUES ('a1', 's1', 'q1', 0, 'quiz', '${quiz}', 1, 1, 'seed')`);
    await prisma.$executeRawUnsafe(`INSERT INTO "Participant" (id, sessionId, name, nameKey, tokenHash, removed, joinedAt) VALUES ('p1', 's1', 'Ann', 'ann', 'h1', 0, 1700000000000), ('p2', 's1', 'Bo', 'bo', 'h2', 0, 1700000000000)`);
    await prisma.$executeRawUnsafe(`INSERT INTO "Submission" (id, sessionId, sessionActivityId, participantId, slot, payload, key, status, correct, score, responseMs, createdAt) VALUES ('x1', 's1', 'a1', 'p1', 0, '{"optionId":"b"}', NULL, 'visible', 1, 1000, 2100, 1700000100000), ('x2', 's1', 'a1', 'p2', 0, '{"optionId":"a"}', NULL, 'visible', 0, 0, 3000, 1700000100000)`);
    await prisma.$disconnect();

    deploy(all, db); // the new release starts: migrations run on the existing file

    const after = new PrismaClient({ datasources: { db: { url: `file:${db}` } }, log: [] });
    const runs = await after.activityRun.findMany();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ sessionActivityId: 'a1', number: 1, scoring: 'counted', answerRevealed: true, completed: true });
    const subs = await after.submission.findMany({ orderBy: { id: 'asc' } });
    expect(subs.map((s) => [s.id, s.runId, s.score])).toEqual([['x1', runs[0].id, 1000], ['x2', runs[0].id, 0]]);
    expect((await after.session.findUnique({ where: { id: 's1' } }))).toMatchObject({ title: 'Old lesson', features: '{}', rehearsal: false });

    // and the app reads it: results, standings and CSV are exactly what they were
    const config = loadConfig({}, { dataDir: dir, uploadDir: join(dir, 'uploads'), rateLimit: false, secret: 'x', webDist: join(dir, 'none') });
    const app = createApp({ prisma: after, config });
    const results = await app.reports.results('s1');
    expect(results.activities[0].results).toMatchObject({ type: 'quiz', total: 2, counts: { a: 1, b: 1 } });
    expect(results.activities[0].runs).toHaveLength(1);
    expect(results.standings.map((s) => [s.name, s.score])).toEqual([['Ann', 1000], ['Bo', 0]]);
    const csv = await app.reports.csv('s1');
    expect(csv.csv).toContain('Ann');
    await app.close();
    await after.$disconnect();
  });
});
