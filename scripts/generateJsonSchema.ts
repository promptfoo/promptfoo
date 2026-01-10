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

// Use Zod v4's native toJSONSchema with override to handle nested ZodPipe schemas
const schemaContent = z.toJSONSchema(innerSchema, {
  unrepresentable: 'any',
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
          const result = z.toJSONSchema(baseSchema, { unrepresentable: 'any' });
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
        const result = z.toJSONSchema(baseSchema, { unrepresentable: 'any' });
        const { $schema: _, ...rest } = result as Record<string, unknown>;
        // Mutate the jsonSchema in place
        Object.assign(ctx.jsonSchema, rest);
      }
    }
  },
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
