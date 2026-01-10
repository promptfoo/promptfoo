import { type ZodType, z } from 'zod';
import { UnifiedConfigSchema } from '../src/types';

// UnifiedConfigSchema is wrapped in a .pipe() transform, so we need to extract
// the inner schema to generate JSON schema properly
function getInnerSchema(schema: ZodType): ZodType {
  const def = schema._def as { in?: ZodType };
  if (def?.in) {
    return def.in;
  }
  return schema;
}

const innerSchema = getInnerSchema(UnifiedConfigSchema);

// Use Zod v4's native toJSONSchema
const schemaContent = z.toJSONSchema(innerSchema, {
  unrepresentable: 'any',
});

// Remove the $schema from the inner schema (we'll add it at the top level)
const { $schema: _, ...schemaWithoutMeta } = schemaContent as Record<string, unknown>;

// Wrap in the expected format with $ref
const jsonSchema = {
  $ref: '#/definitions/PromptfooConfigSchema',
  definitions: {
    PromptfooConfigSchema: schemaWithoutMeta,
  },
  $schema: 'http://json-schema.org/draft-07/schema#',
};

console.log(JSON.stringify(jsonSchema, null, 2));
