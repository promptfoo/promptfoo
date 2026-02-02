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

// Find the assertion union schema key dynamically
// This is AssertionOrSetSchema which has assert-set in its anyOf
function findAssertionUnionKey(defs: Record<string, unknown>): string | null {
  for (const [key, def] of Object.entries(defs)) {
    const defObj = def as Record<string, unknown>;
    if (defObj?.anyOf && Array.isArray(defObj.anyOf)) {
      const anyOfArray = defObj.anyOf as Record<string, unknown>[];
      const hasAssertSet = anyOfArray.some((item) => {
        const props = item?.properties as Record<string, unknown>;
        const typeField = props?.type as Record<string, unknown>;
        return typeField?.const === 'assert-set';
      });
      if (hasAssertSet) {
        return key;
      }
    }
  }
  return null;
}

// CombinatorAssertion definition for 'and'/'or' assertion types
// This is added manually because the recursive z.ZodType<T> annotation
// prevents Zod's JSON schema generator from seeing the structure.
// Note: assertionUnionRef is set after we find the actual schema key
function createCombinatorAssertionDefinition(assertionUnionRef: string) {
  return {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['and', 'or'],
        description:
          "Combinator type: 'and' requires all sub-assertions to pass, 'or' requires any to pass",
      },
      assert: {
        type: 'array',
        description: 'Array of sub-assertions to evaluate',
        items: {
          anyOf: [{ $ref: '#/definitions/CombinatorAssertion' }, { $ref: assertionUnionRef }],
        },
      },
      shortCircuit: {
        type: 'boolean',
        description:
          "Stop evaluation early when result is determined. For 'or': stop on first pass. For 'and': stop on first fail. Defaults to true. Note: Automatically disabled when threshold is set.",
      },
      weight: {
        type: 'number',
        description: 'Weight of this combinator relative to other assertions. Defaults to 1.',
      },
      metric: {
        type: 'string',
        description: 'Tag this assertion result as a named metric',
      },
      threshold: {
        type: 'number',
        description: 'Minimum score threshold for the combinator to pass',
      },
      config: {
        type: 'object',
        additionalProperties: true,
        description:
          'Configuration passed to all sub-assertions. Child assertion config takes precedence.',
      },
    },
    required: ['type', 'assert'],
    additionalProperties: false,
  };
}

// Find the assertion union key dynamically from Zod output
const assertionUnionKey = findAssertionUnionKey(zodDefinitions as Record<string, unknown>);
const assertionUnionRef = assertionUnionKey
  ? `#/definitions/${assertionUnionKey}`
  : '#/definitions/__schema18'; // Fallback, but warn
if (!assertionUnionKey) {
  console.warn(
    'Warning: Could not find assertion union schema dynamically. Using fallback __schema18.',
  );
}
const CombinatorAssertionDefinition = createCombinatorAssertionDefinition(assertionUnionRef);

// Build final schema with proper structure and metadata
const jsonSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://promptfoo.dev/config-schema.json',
  title: 'Promptfoo Configuration Schema',
  $ref: '#/definitions/PromptfooConfigSchema',
  definitions: {
    PromptfooConfigSchema: mainSchema,
    CombinatorAssertion: CombinatorAssertionDefinition,
    ...(zodDefinitions as Record<string, unknown>),
  },
};

// Post-process: Update assertion union schemas to include CombinatorAssertion
// AssertionOrSetSchema becomes __schema18 which is an anyOf union of assertion types
const definitions = jsonSchema.definitions as Record<string, unknown>;

// Find the assertion union schema (__schema18 has anyOf with assert-set type)
// This is AssertionOrSetSchema which should include CombinatorAssertion
for (const [_key, def] of Object.entries(definitions)) {
  const defObj = def as Record<string, unknown>;

  // Look for anyOf schemas that look like assertion unions
  if (defObj?.anyOf && Array.isArray(defObj.anyOf)) {
    const anyOfArray = defObj.anyOf as Record<string, unknown>[];

    // Check if this is the assertion union by looking for assert-set type
    const hasAssertSet = anyOfArray.some((item) => {
      const props = item?.properties as Record<string, unknown>;
      const typeField = props?.type as Record<string, unknown>;
      return typeField?.const === 'assert-set';
    });

    if (hasAssertSet) {
      // This is the assertion union schema, add CombinatorAssertion reference
      const hasCombinatorRef = anyOfArray.some(
        (item) => item?.$ref === '#/definitions/CombinatorAssertion',
      );
      if (!hasCombinatorRef) {
        anyOfArray.unshift({ $ref: '#/definitions/CombinatorAssertion' });
      }
    }
  }
}

console.log(JSON.stringify(jsonSchema, null, 2));
