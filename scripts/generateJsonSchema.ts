import { z } from 'zod';

// Create a simplified schema for JSON Schema generation
// This removes complex features like functions, transforms, etc.
const SimpleConfigSchema = z.object({
  description: z.string().optional(),
  tags: z.record(z.string(), z.string()).optional(),
  providers: z
    .array(
      z.union([
        z.string(),
        z.object({
          id: z.string().optional(),
          label: z.string().optional(),
          config: z.record(z.string(), z.any()).optional(),
        }),
      ]),
    )
    .optional(),
  prompts: z
    .array(
      z.union([
        z.string(),
        z.object({
          raw: z.string().optional(),
          label: z.string().optional(),
          config: z.record(z.string(), z.any()).optional(),
        }),
      ]),
    )
    .optional(),
  tests: z
    .array(
      z.object({
        vars: z.record(z.string(), z.any()).optional(),
        assert: z
          .array(
            z.object({
              type: z.string(),
              value: z.any().optional(),
              threshold: z.number().optional(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
  outputPath: z.string().optional(),
  writeLatestResults: z.boolean().optional(),
  sharing: z.boolean().optional(),
  defaultTest: z
    .object({
      vars: z.record(z.string(), z.any()).optional(),
      assert: z
        .array(
          z.object({
            type: z.string(),
            value: z.any().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
  nunjucksFilters: z.record(z.string(), z.any()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  evaluateOptions: z
    .object({
      maxConcurrency: z.number().optional(),
      showProgressBar: z.boolean().optional(),
      generateSuggestions: z.boolean().optional(),
      repeat: z.number().optional(),
    })
    .optional(),
  commandLineOptions: z
    .object({
      cache: z.boolean().optional(),
      delay: z.number().optional(),
      verbose: z.boolean().optional(),
    })
    .optional(),
});

const jsonSchema = z.toJSONSchema(SimpleConfigSchema, {
  name: 'PromptfooConfigSchema',
});

console.log(JSON.stringify(jsonSchema, null, 2));
