// TODO(ian): Split this file into validators.ts
import { z } from 'zod';
import { CompletedPromptSchema, PromptConfigSchema } from '../validators/prompts';
import { ApiProviderSchema, ProviderOptionsSchema } from '../validators/providers';
import { MetadataSchema } from '../validators/shared';
import { AssertionSetSchema, AssertionSchema, GradingConfigSchema } from './assertions';

export const OutputConfigSchema = z.object({
  /**
   * @deprecated in > 0.38.0. Use `transform` instead.
   */
  postprocess: z.string().optional(),
  transform: z.string().optional(),

  // The name of the variable to store the output of this test case
  storeOutputAs: z.string().optional(),
});

export type OutputConfig = z.infer<typeof OutputConfigSchema>;

export const VarsSchema = z.record(
  z.union([
    z.string(),
    z.number().transform(String),
    z.boolean().transform(String),
    z.array(z.union([z.string(), z.number().transform(String), z.boolean().transform(String)])),
    z.object({}),
    z.array(z.any()),
  ]),
);

export type Vars = z.infer<typeof VarsSchema>;

// Each test case is graded pass/fail with a score.  A test case represents a unique input to the LLM after substituting `vars` in the prompt.
export const TestCaseSchema = z.object({
  // Optional description of what you're testing
  description: z.string().optional(),

  // Key-value pairs to substitute in the prompt
  vars: VarsSchema.optional(),

  // Override the provider.
  provider: z.union([z.string(), ProviderOptionsSchema, ApiProviderSchema]).optional(),

  // Output related from running values in Vars with provider. Having this value would skip running the prompt through the provider, and go straight to the assertions
  providerOutput: z.union([z.string(), z.object({})]).optional(),

  // Optional list of automatic checks to run on the LLM output
  assert: z.array(z.union([AssertionSetSchema, AssertionSchema])).optional(),

  // Additional configuration settings for the prompt
  options: z
    .intersection(
      z.intersection(PromptConfigSchema, OutputConfigSchema),
      z.intersection(
        GradingConfigSchema,
        z.object({
          // If true, do not expand arrays of variables into multiple eval cases.
          disableVarExpansion: z.boolean().optional(),
          // If true, do not include an implicit `_conversation` variable in the prompt.
          disableConversationVar: z.boolean().optional(),
        }),
      ),
    )
    .optional(),

  // The required score for this test case.  If not provided, the test case is graded pass/fail.
  threshold: z.number().optional(),

  metadata: MetadataSchema.optional(),
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type TestCase<vars = Record<string, string | string[] | object>> = z.infer<
  typeof TestCaseSchema
>;

export type TestCaseWithPlugin = TestCase & { metadata: { pluginId: string } };

export const TestCaseWithVarsFileSchema = TestCaseSchema.extend({
  vars: z.union([VarsSchema, z.string(), z.array(z.string())]).optional(),
});

export type TestCaseWithVarsFile = z.infer<typeof TestCaseWithVarsFileSchema>;

// Used when building prompts index from files.
export const TestCasesWithMetadataPromptSchema = z.object({
  prompt: CompletedPromptSchema,
  id: z.string(),
  evalId: z.string(),
});

export type TestCasesWithMetadataPrompt = z.infer<typeof TestCasesWithMetadataPromptSchema>;

export const TestCasesWithMetadataSchema = z.object({
  id: z.string(),
  testCases: z.union([z.string(), z.array(z.union([z.string(), TestCaseSchema]))]),
  recentEvalDate: z.date(),
  recentEvalId: z.string(),
  count: z.number(),
  prompts: z.array(TestCasesWithMetadataPromptSchema),
});

export type TestCasesWithMetadata = z.infer<typeof TestCasesWithMetadataSchema>;

// Same as a TestCase, except the `vars` object has been flattened into its final form.
export const AtomicTestCaseSchema = TestCaseSchema.extend({
  vars: z.record(z.union([z.string(), z.object({})])).optional(),
}).strict();

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type AtomicTestCase<vars = Record<string, string | object>> = z.infer<
  typeof AtomicTestCaseSchema
>;
