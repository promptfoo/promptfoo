import { type ZodType, z } from 'zod';
import { UnifiedConfigSchema } from '../src/types';
import { TRANSFORM_KEYS } from '../src/util/transform';
import { StringOrFunctionSchema } from '../src/validators/shared';

// NOTE: This script accesses Zod's internal _def property to extract the input schema
// from pipe/transform wrappers. This is necessary because UnifiedConfigSchema uses
// .pipe() for transforms, and we need the input schema for JSON Schema generation.
// This may need updating if Zod's internal structure changes.

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

// UnifiedConfigSchema is wrapped in a .pipe() transform, so generate JSON Schema from its input.
const innerSchema = getBaseSchema(UnifiedConfigSchema);

const transformSchemaKeys: Set<string> = new Set(TRANSFORM_KEYS);

/**
 * Strips every key from `target` and reassigns it to `{ type: 'string', description? }`,
 * preserving an optional description so generated docs stay useful. Used by both the
 * `override` hook (for inline `StringOrFunctionSchema` nodes) and the post-pass walker
 * (for nodes Zod rewrites after `override` runs).
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

function forceStringTransformSchemas(node: unknown): void {
  if (!node || typeof node !== 'object') {
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      forceStringTransformSchemas(item);
    }
    return;
  }

  const schemaObject = node as Record<string, unknown>;

  for (const [key, value] of Object.entries(schemaObject)) {
    if (
      transformSchemaKeys.has(key) &&
      value &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      rewriteNodeToStringSchema(value as Record<string, unknown>);
      // Recursing into the just-rewritten `{type, description}` stub is pointless
      // and could accidentally re-match if a future rewrite leaves nested junk.
      continue;
    }

    forceStringTransformSchemas(value);
  }
}

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
    const baseSchema = getBaseSchema(zodSchema);

    // Config files can only represent string transforms. Preserve runtime support for function
    // transforms in the Zod schema, but keep generated JSON Schema string-only for editor/Ajv use.
    if (baseSchema === StringOrFunctionSchema) {
      rewriteNodeToStringSchema(ctx.jsonSchema as Record<string, unknown>);
      return;
    }

    // Handle optional/nullable wrapping a pipe/transform
    if ((def?.type === 'optional' || def?.type === 'nullable') && def?.innerType) {
      const innerDef = def.innerType._def as { type?: string };
      if (innerDef?.type === 'pipe' || innerDef?.type === 'transform') {
        if (Object.keys(ctx.jsonSchema).length === 0) {
          const result = z.toJSONSchema(baseSchema, nestedOptions);
          const { $schema: _, ...rest } = result as Record<string, unknown>;
          Object.assign(ctx.jsonSchema, rest);
        }
      }
    }

    // Handle pipe/transform directly
    if ((def?.type === 'pipe' || def?.type === 'transform') && def?.in) {
      if (Object.keys(ctx.jsonSchema).length === 0) {
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
// so they never appear in validated configs, but editors need to accept them.
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

// Zod may rewrite reused StringOrFunctionSchema nodes after `override` runs. Do a final pass to keep
// transform-like fields string-only in JSON Schema while runtime Zod still accepts functions.
forceStringTransformSchemas(jsonSchema);

console.log(JSON.stringify(jsonSchema, null, 2));
