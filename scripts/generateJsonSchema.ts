import { type ZodType, z } from 'zod';
import { UnifiedConfigSchema } from '../src/types';

// NOTE: This script accesses Zod's internal _def property to extract the input schema
// from pipe/transform wrappers. This is necessary because UnifiedConfigSchema uses
// .pipe() for transforms, and we need the input schema for JSON Schema generation.
// This may need updating if Zod's internal structure changes.

// UnifiedConfigSchema is wrapped in a .pipe() transform, so we need to extract
// the inner schema to generate JSON schema properly
function getInnerSchema(schema: ZodType): ZodType {
  const def = schema._def as { in?: ZodType };
  if (def?.in) {
    return def.in;
  }
  return schema;
}

// Recursively unwrap to get the base schema (unwrapping optional, nullable, pipe, transform)
function getBaseSchema(schema: ZodType): ZodType {
  const def = schema._def as { type?: string; in?: ZodType; innerType?: ZodType };

  if (def?.type === 'optional' && def?.innerType) {
    return getBaseSchema(def.innerType);
  }
  if (def?.type === 'nullable' && def?.innerType) {
    return getBaseSchema(def.innerType);
  }
  if (def?.type === 'pipe' && def?.in) {
    return getBaseSchema(def.in);
  }
  if (def?.type === 'transform' && def?.in) {
    return getBaseSchema(def.in);
  }

  return schema;
}

const innerSchema = getInnerSchema(UnifiedConfigSchema);

// Options for nested toJSONSchema calls (without reused:'ref' to avoid orphaned definitions)
const nestedOptions = {
  target: 'draft-07' as const,
  unrepresentable: 'any' as const,
};

// Generate JSON Schema using Zod v4's native toJSONSchema
// - target: 'draft-07' for compatibility with most tooling
// - unrepresentable: 'any' converts z.custom() functions to {} (accepts any)
// - reused: 'ref' extracts duplicate schemas to definitions, reducing size significantly
// - override: handles nested pipe/transform schemas that Zod doesn't convert automatically
const schemaContent = z.toJSONSchema(innerSchema, {
  ...nestedOptions,
  reused: 'ref' as const,
  // biome-ignore lint/suspicious/noExplicitAny: Zod v4 internal types are not publicly exported
  override: (ctx: any) => {
    const zodSchema = ctx.zodSchema as ZodType;
    const def = zodSchema._def as { type?: string; in?: ZodType; innerType?: ZodType };

    // Handle optional/nullable wrapping a pipe/transform
    if ((def?.type === 'optional' || def?.type === 'nullable') && def?.innerType) {
      const innerDef = def.innerType._def as { type?: string };
      if (innerDef?.type === 'pipe' || innerDef?.type === 'transform') {
        if (Object.keys(ctx.jsonSchema).length === 0) {
          const baseSchema = getBaseSchema(zodSchema);
          const result = z.toJSONSchema(baseSchema, nestedOptions);
          const { $schema: _, ...rest } = result as Record<string, unknown>;
          Object.assign(ctx.jsonSchema, rest);
        }
      }
    }

    // Handle pipe/transform directly
    if ((def?.type === 'pipe' || def?.type === 'transform') && def?.in) {
      if (Object.keys(ctx.jsonSchema).length === 0) {
        const baseSchema = getBaseSchema(zodSchema);
        const result = z.toJSONSchema(baseSchema, nestedOptions);
        const { $schema: _, ...rest } = result as Record<string, unknown>;
        Object.assign(ctx.jsonSchema, rest);
      }
    }
  },
});

// Extract the main schema parts
const {
  $schema: _,
  definitions: zodDefinitions,
  ...mainSchema
} = schemaContent as Record<string, unknown>;

const allDefinitions = {
  PromptfooConfigSchema: mainSchema,
  ...(zodDefinitions as Record<string, unknown>),
};

// JSON Reference schema to allow YAML $ref syntax in assertion arrays.
// @apidevtools/json-schema-ref-parser resolves these at runtime before Zod validation,
// so they never appear in validated configs — but editors need to accept them.
const jsonRefSchema = {
  type: 'object',
  required: ['$ref'],
  properties: { $ref: { type: 'string' } },
  additionalProperties: false,
};

/**
 * Recursively walks the JSON Schema object and adds a JSON Reference alternative
 * to every assertion array's `items.anyOf`. This allows YAML users to write
 *   assert:
 *     - $ref: '#/assertionTemplates/myTemplate'
 * without editors showing "Property $ref is not allowed" errors.
 *
 * Detection heuristic: an array's items has `anyOf` containing an object whose
 * `required` array includes both "type" and "assert" (AssertionSet pattern) or
 * a $ref to a definition that has required: ["type"] (Assertion pattern).
 */
function addJsonRefToAssertionArrays(
  obj: unknown,
  defs: Record<string, unknown>,
  visited = new WeakSet<object>(),
): void {
  if (typeof obj !== 'object' || obj === null) {
    return;
  }
  if (visited.has(obj as object)) {
    return;
  }
  visited.add(obj as object);

  const o = obj as Record<string, unknown>;

  if (o.type === 'array' && typeof o.items === 'object' && o.items !== null) {
    const items = o.items as Record<string, unknown>;
    if (Array.isArray(items.anyOf)) {
      const anyOf = items.anyOf as Record<string, unknown>[];
      const isAssertionArray = anyOf.some((opt) => {
        // AssertionSet: inline object with required ["type", "assert"]
        if (
          Array.isArray(opt.required) &&
          (opt.required as string[]).includes('type') &&
          (opt.required as string[]).includes('assert')
        ) {
          return true;
        }
        // Assertion: $ref to a definition that has required: ["type"]
        if (typeof opt.$ref === 'string') {
          const defName = (opt.$ref as string).split('/').pop()!;
          const def = defs[defName] as Record<string, unknown> | undefined;
          if (Array.isArray(def?.required) && (def!.required as string[]).includes('type')) {
            return true;
          }
        }
        return false;
      });

      if (isAssertionArray) {
        const alreadyHasRef = anyOf.some(
          (opt) =>
            opt.type === 'object' &&
            Array.isArray(opt.required) &&
            (opt.required as string[])[0] === '$ref',
        );
        if (!alreadyHasRef) {
          anyOf.push(jsonRefSchema);
        }
      }
    }
  }

  for (const value of Object.values(o)) {
    addJsonRefToAssertionArrays(value, defs, visited);
  }
}

addJsonRefToAssertionArrays(allDefinitions, allDefinitions);

// Build final schema with proper structure and metadata
const jsonSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://promptfoo.dev/config-schema.json',
  title: 'Promptfoo Configuration Schema',
  $ref: '#/definitions/PromptfooConfigSchema',
  definitions: allDefinitions,
};

console.log(JSON.stringify(jsonSchema, null, 2));
