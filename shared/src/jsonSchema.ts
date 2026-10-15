import { zodToJsonSchema } from 'zod-to-json-schema';
import { DOCUMENT_FORMAT, SCHEMA_VERSION, presentationDocSchema } from './schema';

/**
 * JSON Schema (draft-07) for presentation documents, generated from the same Zod schema the
 * app validates with. Useful for editor autocompletion and for generating presentations programmatically.
 * Note: cross-field rules (e.g. "correctOptionId must match an option") are enforced on import, not by JSON Schema.
 */
export function presentationJsonSchema(): Record<string, unknown> {
  const schema = zodToJsonSchema(presentationDocSchema, { name: 'ClassInteractPresentation', $refStrategy: 'none', target: 'jsonSchema7' }) as Record<string, any>;
  const definition = schema.definitions?.ClassInteractPresentation ?? schema;
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'ClassInteract presentation',
    description: `Format "${DOCUMENT_FORMAT}", schema version ${SCHEMA_VERSION}.`,
    ...definition,
  };
}
