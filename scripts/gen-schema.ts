// Regenerates docs/presentation.schema.json from the Zod schema the app validates with.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { presentationJsonSchema } from '../shared/src/index';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/presentation.schema.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(presentationJsonSchema(), null, 2) + '\n');
console.log(`Wrote ${out}`);
