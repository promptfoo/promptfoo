import { z } from 'zod';
import { AssertionSetSchema, TestCaseSchema, UnifiedConfigSchema } from '../src/types';
import { CONFIG_PROVIDER_INPUT_KEYS } from '../src/types/configAliases';
import { TRANSFORM_KEYS } from '../src/util/transform';
import { StringOrFunctionSchema } from '../src/validators/shared';

const assertionArraySchemas = new Set<object>([
  TestCaseSchema.shape.assert.unwrap(),
  AssertionSetSchema.shape.assert,
]);

const jsonReferenceSchema: z.core.JSONSchema.JSONSchema = {
  type: 'object',
  required: ['$ref'],
  properties: { $ref: { type: 'string' } },
  additionalProperties: false,
};

const transformSchemaKeys: Set<string> = new Set(TRANSFORM_KEYS);

/**
 * Strips every key from `target` and reassigns it to `{ type: 'string', description? }`,
 * preserving an optional description so generated docs stay useful.
 */
function rewriteNodeToStringSchema(target: Record<string, unknown>): void {
  const description = target.description;
  for (const key of Object.keys(target)) {
    delete target[key];
  }
  if (typeof description === 'string') {
    target.description = description;
  }
  target.type = 'string';
}

// Zod can emit references for transform fields after the override runs. Apply their
// string-only representation as JSON.stringify visits the finished schema.
// Zod deep-clones the output. Keep added transform nodes distinct from other fields.
function serializeTransformField(key: string, value: unknown): unknown {
  if (transformSchemaKeys.has(key) && value && typeof value === 'object' && !Array.isArray(value)) {
    rewriteNodeToStringSchema(value as Record<string, unknown>);
  }
  return value;
}

// Convert the entire input in one pass so defaults stay optional and recursive references
// share a single root. Draft 7 remains compatible with YAML editors and Ajv.
const schemaContent = z.toJSONSchema(UnifiedConfigSchema, {
  target: 'draft-07',
  io: 'input',
  unrepresentable: 'any',
  reused: 'ref',
  override: ({ zodSchema, jsonSchema }) => {
    // Config files can only represent string transforms. Preserve runtime support for function
    // transforms in the Zod schema, but keep generated JSON Schema string-only for editor/Ajv use.
    if (zodSchema === StringOrFunctionSchema) {
      rewriteNodeToStringSchema(jsonSchema as Record<string, unknown>);
    }
    const items = jsonSchema.items;
    if (assertionArraySchemas.has(zodSchema) && typeof items === 'object' && !Array.isArray(items)) {
      jsonSchema.items = { anyOf: [...(items.anyOf ?? [items]), jsonReferenceSchema] };
    }
  },
});

// Extract the main schema parts
const {
  $schema: _,
  definitions: zodDefinitions,
  ...mainSchema
} = schemaContent as Record<string, unknown>;

// Build final schema with proper structure and metadata
const jsonSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://promptfoo.dev/config-schema.json',
  title: 'Promptfoo Configuration Schema',
  $ref: '#/definitions/PromptfooConfigSchema',
  definitions: {
    PromptfooConfigSchema: {
      ...mainSchema,
      // Zod refinements are not converted; authoring also serves non-evaluation configurations.
      not: { required: [...CONFIG_PROVIDER_INPUT_KEYS] },
    },
    ...(zodDefinitions as Record<string, unknown>),
  },
};

console.log(JSON.stringify(jsonSchema, serializeTransformField, 2));
