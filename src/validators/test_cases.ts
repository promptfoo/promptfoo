import { z } from 'zod';
import { PluginConfigSchema, StrategyConfigSchema } from '../redteam/types';
import { JAVASCRIPT_EXTENSIONS } from '../util/fileExtensions';
import {
  type Assertion,
  type AssertionOrSet,
  type AssertionSet,
  AssertionOrSetSchema,
  AssertionOrSetOrRefSchema,
  type GradingResult,
} from './assertions';
import { GradingConfigSchema } from './grading';
import { PromptConfigSchema } from './prompts';
import { ApiProviderSchema, ProviderOptionsSchema } from './providers';

import type { RunEvalOptions } from '../types/index';
import type { VarValue } from '../types/shared';

// Vars represents template variables - allowing primitives, arrays, and objects
export type Vars = Record<string, VarValue>;

// Helper to check if a value is a valid VarValue (string, number, boolean, object, or array)
// Rejects null, undefined, symbols, and functions
function isValidVarValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  const type = typeof value;
  if (type === 'symbol' || type === 'function') {
    return false;
  }
  return type === 'string' || type === 'number' || type === 'boolean' || type === 'object';
}

// VarsSchema uses z.custom to match the Vars type with runtime validation
// Enforces plain objects only (no arrays, Maps, Dates, etc.)
export const VarsSchema = z.custom<Vars>((data) => {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return false;
  }
  // Ensure it's a plain object (not Map, Date, Set, etc.)
  if (Object.getPrototypeOf(data) !== Object.prototype && Object.getPrototypeOf(data) !== null) {
    return false;
  }
  return Object.values(data as Record<string, unknown>).every(isValidVarValue);
});

export const OutputConfigSchema = z.object({
  /**
   * @deprecated in > 0.38.0. Use `transform` instead.
   */
  postprocess: z.string().optional(),
  transform: z.string().optional(),
  transformVars: z.string().optional(),

  // The name of the variable to store the output of this test case
  storeOutputAs: z.string().optional(),
});

export type OutputConfig = z.infer<typeof OutputConfigSchema>;

// Metadata is a key-value store for arbitrary data
export const MetadataSchema = z.record(z.string(), z.any());

type SerializableValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: SerializableValue }
  | SerializableValue[];

const SerializableValueSchema: z.ZodType<SerializableValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(SerializableValueSchema),
    z.record(z.string(), SerializableValueSchema),
  ]),
);

export type ScoringFunction = (
  namedScores: Record<string, number>,
  context?: {
    threshold?: number;
    parentAssertionSet?: {
      index: number;
      assertionSet: AssertionSet;
    };
    componentResults?: GradingResult[];
    tokensUsed?: {
      total: number;
      prompt: number;
      completion: number;
    };
  },
) => Promise<GradingResult> | GradingResult;

// Each test case is graded pass/fail with a score.  A test case represents a unique input to the LLM after substituting `vars` in the prompt.
// HEADS UP: When you add a property here, you probably need to load it from `defaultTest` in evaluator.ts.
export const TestCaseSchema = z.object({
  // Optional description of what you're testing
  description: z.string().optional(),

  // Key-value pairs to substitute in the prompt
  vars: VarsSchema.optional(),

  // Override the provider.
  provider: z.union([z.string(), ProviderOptionsSchema, ApiProviderSchema]).optional(),

  // Output related from running values in Vars with provider. Having this value would skip running the prompt through the provider, and go straight to the assertions
  providerOutput: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),

  // Optional list of automatic checks to run on the LLM output
  // At runtime, this is Assertion or AssertionSet (no $ref - those are resolved during config loading)
  assert: z.array(AssertionOrSetSchema).optional(),

  // Optional scoring function to run on the LLM output
  assertScoringFunction: z
    .union([
      z
        .string()
        .regex(new RegExp(`^file://.*\\.(${JAVASCRIPT_EXTENSIONS?.join('|')}|py)(?::[\\w.]+)?$`)),
      z.custom<ScoringFunction>((value) => typeof value === 'function'),
    ])
    .optional(),

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
          // If true, run this without concurrency no matter what
          runSerially: z.boolean().optional(),
        }),
      ),
    )
    .optional(),

  // The required score for this test case.  If not provided, the test case is graded pass/fail.
  threshold: z.number().optional(),

  metadata: z
    .intersection(
      MetadataSchema,
      z.object({
        pluginConfig: PluginConfigSchema.optional(),
        strategyConfig: StrategyConfigSchema.optional(),
      }),
    )
    .optional(),
});

export type TestCase = z.infer<typeof TestCaseSchema>;

/**
 * Schema for config validation that includes $ref assertions.
 * $ref assertions are resolved during config loading via $RefParser.dereference().
 * Use this schema when validating raw config files before $ref resolution.
 */
export const TestCaseConfigSchema = TestCaseSchema.extend({
  assert: z.array(AssertionOrSetOrRefSchema).optional(),
});

export type TestCaseWithPlugin = TestCase & { metadata: { pluginId: string } };

export const TestCaseWithVarsFileSchema = TestCaseSchema.extend({
  vars: z.union([VarsSchema, z.string(), z.array(z.string())]).optional(),
});

export type TestCaseWithVarsFile = z.infer<typeof TestCaseWithVarsFileSchema>;

export const ScenarioSchema = z.object({
  // Optional description of what you're testing
  description: z.string().optional(),

  // Default test case config
  config: z.array(TestCaseSchema.partial()),

  // Optional list of automatic checks to run on the LLM output
  tests: z.array(TestCaseSchema),
});

export type Scenario = z.infer<typeof ScenarioSchema>;

// Same as a TestCase, except the `vars` object has been flattened into its final form.
export const AtomicTestCaseSchema = TestCaseSchema.extend({
  vars: VarsSchema.optional(),
}).strict();

export type AtomicTestCase = z.infer<typeof AtomicTestCaseSchema>;

/**
 * Configuration schema for test generators that accept parameters
 */
export const TestGeneratorConfigSchema = z.object({
  /** Path to the test generator function (e.g., file://path/to/tests.py:function_name) */
  path: z.string(),
  /**
   * Configuration object passed to the generator function
   */
  config: z.record(z.string(), SerializableValueSchema).optional(),
});

export type TestGeneratorConfig = z.infer<typeof TestGeneratorConfigSchema>;

export const DerivedMetricSchema = z.object({
  // The name of this metric
  name: z.string(),

  // The function to calculate the metric - either a mathematical expression or a function that takes the scores and returns a number
  value: z.union([
    z.string(),
    z.function({
      // We use RunEvalOptions from index here, which might cause circular dep if we aren't careful.
      // But RunEvalOptions depends on TestSuite, which depends on TestCase.
      // So RunEvalOptions should be imported from index (which re-exports everything).
      input: [z.record(z.string(), z.number()), z.custom<RunEvalOptions>()],
      output: z.number(),
    }),
  ]),
});
export type DerivedMetric = z.infer<typeof DerivedMetricSchema>;

export type VarMapping = Record<string, string>;

export interface CsvRow {
  [key: string]: string;
}
