import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { createApp } from './app';
import { loadConfig } from './config';
import { loadDotEnv } from './dotenv';
import { seedDemo } from './seed';

async function main() {
  loadDotEnv();
  const config = loadConfig();
  process.env.DATABASE_URL ||= `file:${resolve(config.dataDir, 'classinteract.db')}`;
  const prisma = new PrismaClient();

  try {
    await prisma.presentation.count();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/does not exist|no such table|P2021/i.test(msg)) {
      console.error('\nThe database has not been set up yet. Run:\n\n    npm run db:migrate\n');
    } else {
      console.error(`\nCould not open the database (${process.env.DATABASE_URL}).\n${msg}\n`);
    }
    process.exit(1);
  }

  if (config.autoSeed && (await prisma.presentation.count()) === 0) {
    const r = await seedDemo(prisma);
    for (const t of r.created) console.log(`Imported demo presentation “${t}”`);
  }

  const ctx = createApp({ prisma, config });
  await ctx.sessions.recover();

  await new Promise<void>((ok) => ctx.server.listen(config.port, config.host, ok));
  console.log(`ClassInteract listening on http://localhost:${config.port}`);
  if (config.publicUrl) console.log(`Participants join at ${config.publicUrl}`);
  if (!config.studioPassword) {
    console.warn(
      config.production
        ? '⚠  STUDIO_PASSWORD is not set: anyone who can reach this server can use the Presenter Studio. Set it before exposing the app publicly.'
        : 'Tip: set STUDIO_PASSWORD to protect the Presenter Studio when the app is reachable by others.',
    );
  }

  // A lesson must not end because one request hit an unexpected error somewhere. Nothing restarts this process on a
  // teacher's laptop, so log what happened and keep serving; the session state is safely in the database either way.
  process.on('unhandledRejection', (reason) => console.error('[process] unhandled rejection (continuing)', reason));
  process.on('uncaughtException', (err) => console.error('[process] uncaught exception (continuing)', err));

  const stop = async () => {
    await ctx.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
