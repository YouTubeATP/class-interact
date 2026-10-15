import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Loads `.env` (repo root, then the working directory) without overriding variables that are already set,
 * so real environment variables and Docker settings always win. Needs Node 20.12+.
 */
export function loadDotEnv(): void {
  for (const file of [resolve(process.cwd(), '../.env'), resolve(process.cwd(), '.env')]) {
    if (!existsSync(file)) continue;
    try {
      process.loadEnvFile(file);
    } catch (e) {
      console.warn(`Could not read ${file}: ${(e as Error).message}`);
    }
  }
}
