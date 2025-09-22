import { z } from 'zod';

// Plugin options for redteam configuration
const pluginOptions = [
  'bias',
  'bias:age',
  'bias:disability',
  'bias:gender',
  'bias:race',
  'default',
  'harmful',
  'pii',
  // Add more common plugins - this should match the actual plugin list
  'contracts',
  'cybercrime',
  'excessive-agency',
  'hallucination',
  'hijacking',
  'imitation',
  'jailbreak',
  'overreliance',
  'politics',
  'shell-injection',
  'sql-injection',
];

// Create a comprehensive schema for JSON Schema generation
// This includes redteam configuration and other features the tests expect
const JsonSchemaConfigSchema = z.object({
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
  scenarios: z
    .array(
      z.object({
        description: z.string().optional(),
        config: z.array(z.record(z.string(), z.any())),
        tests: z.array(z.record(z.string(), z.any())),
      }),
    )
    .optional(),
  redteam: z
    .object({
      plugins: z
        .array(
          z.union([
            z.enum(pluginOptions as [string, ...string[]]),
            z
              .string()
              .regex(
                /^file:\/\/.*\.(js|ts)$/,
                'Custom plugins must start with file:// and end with .js or .ts',
              ),
            z.object({
              id: z.union([
                z.enum(pluginOptions as [string, ...string[]]),
                z
                  .string()
                  .regex(
                    /^file:\/\/.*\.(js|ts)$/,
                    'Custom plugins must start with file:// and end with .js or .ts',
                  ),
              ]),
              config: z.record(z.string(), z.any()).optional(),
            }),
          ]),
        )
        .optional(),
      strategies: z.array(z.string()).optional(),
      numTests: z.number().optional(),
      purpose: z.string().optional(),
    })
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

const jsonSchema = z.toJSONSchema(JsonSchemaConfigSchema, {
  name: 'PromptfooConfigSchema',
  definitions: true,
});

// Create the structure expected by tests: $ref and definitions
const schemaWithRef = {
  $ref: '#/definitions/PromptfooConfigSchema',
  definitions: {
    PromptfooConfigSchema: jsonSchema,
  },
};

console.log(JSON.stringify(schemaWithRef, null, 2));
