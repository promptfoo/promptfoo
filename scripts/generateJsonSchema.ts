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

// Common options for toJSONSchema calls
const toJSONSchemaOptions = {
  target: 'draft-07' as const,
  unrepresentable: 'any' as const,
};

// Use Zod v4's native toJSONSchema with override to handle nested ZodPipe schemas
const schemaContent = z.toJSONSchema(innerSchema, {
  ...toJSONSchemaOptions,
  // biome-ignore lint/suspicious/noExplicitAny: Zod v4 internal types are not publicly exported
  override: (ctx: any) => {
    const zodSchema = ctx.zodSchema as ZodType;
    const def = zodSchema._def as { type?: string; in?: ZodType; innerType?: ZodType };

    // Handle optional/nullable wrapping a pipe/transform
    if ((def?.type === 'optional' || def?.type === 'nullable') && def?.innerType) {
      const innerDef = def.innerType._def as { type?: string };
      if (innerDef?.type === 'pipe' || innerDef?.type === 'transform') {
        // Check if the current jsonSchema is empty (meaning the pipe wasn't handled)
        if (Object.keys(ctx.jsonSchema).length === 0) {
          const baseSchema = getBaseSchema(zodSchema);
          const result = z.toJSONSchema(baseSchema, toJSONSchemaOptions);
          const { $schema: _, ...rest } = result as Record<string, unknown>;
          // Mutate the jsonSchema in place
          Object.assign(ctx.jsonSchema, rest);
        }
      }
    }

    // Handle pipe/transform directly
    if ((def?.type === 'pipe' || def?.type === 'transform') && def?.in) {
      // Check if the current jsonSchema is empty
      if (Object.keys(ctx.jsonSchema).length === 0) {
        const baseSchema = getBaseSchema(zodSchema);
        const result = z.toJSONSchema(baseSchema, toJSONSchemaOptions);
        const { $schema: _, ...rest } = result as Record<string, unknown>;
        // Mutate the jsonSchema in place
        Object.assign(ctx.jsonSchema, rest);
      }
    }
  },
});

// Remove the $schema from the inner schema (we'll add it at the top level)
const { $schema: _, ...schemaWithoutMeta } = schemaContent as Record<string, unknown>;

// Post-process to filter out empty {} from anyOf arrays
// This handles z.custom() function types that serialize as {} (unrepresentable)
// which would otherwise make anyOf accept anything
function filterEmptySchemas(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(filterEmptySchemas);
  }
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'anyOf' && Array.isArray(value)) {
        // Filter out empty {} schemas from anyOf
        const filtered = value.filter(
          (item) => !(item && typeof item === 'object' && Object.keys(item).length === 0),
        );
        // If only one item remains, unwrap the anyOf
        if (filtered.length === 1) {
          const unwrapped = filterEmptySchemas(filtered[0]);
          if (unwrapped && typeof unwrapped === 'object') {
            Object.assign(result, unwrapped);
          }
        } else if (filtered.length > 1) {
          result[key] = filtered.map(filterEmptySchemas);
        }
        // If no items remain, skip the anyOf entirely
      } else {
        result[key] = filterEmptySchemas(value);
      }
    }
    return result;
  }
  return obj;
}

const cleanedSchema = filterEmptySchemas(schemaWithoutMeta);

// Wrap in the expected format with $ref
const jsonSchema = {
  $ref: '#/definitions/PromptfooConfigSchema',
  definitions: {
    PromptfooConfigSchema: cleanedSchema,
  },
  $schema: 'http://json-schema.org/draft-07/schema#',
};

console.log(JSON.stringify(jsonSchema, null, 2));
