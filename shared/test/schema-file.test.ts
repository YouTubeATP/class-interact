import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { presentationJsonSchema } from '../src';

describe('published JSON Schema', () => {
  it('docs/presentation.schema.json is up to date (run `npm run schema`)', () => {
    const file = JSON.parse(readFileSync(resolve(__dirname, '../../docs/presentation.schema.json'), 'utf8'));
    expect(file).toEqual(JSON.parse(JSON.stringify(presentationJsonSchema())));
  });
});
