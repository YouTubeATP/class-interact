import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { loadConfig } from '../src/config';
import { seedDemo } from '../src/seed';

// Same default database location as the server and `npm run db:migrate`.
process.env.DATABASE_URL ||= `file:${resolve(loadConfig().dataDir, 'classinteract.db')}`;
const prisma = new PrismaClient();
seedDemo(prisma)
  .then(({ created, skipped }) => {
    for (const t of created) console.log(`✔ Imported “${t}”`);
    for (const t of skipped) console.log(`• “${t}” already exists — skipped`);
  })
  .catch((e) => {
    console.error('Seeding failed:', e instanceof Error ? e.message : e);
    if (e?.details?.issues) for (const i of e.details.issues) console.error(`  ${i.path}: ${i.message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
