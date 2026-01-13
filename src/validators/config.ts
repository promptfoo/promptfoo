import { z } from 'zod';
import { ProviderEnvOverridesSchema } from '../types/env';
import { PromptSchema, type PromptFunction } from './prompts';
import { ApiProviderSchema, ProvidersSchema } from './providers';
import {
  TestCaseSchema,
  TestGeneratorConfigSchema,
  DerivedMetricSchema,
  ScenarioSchema,
  MetadataSchema,
} from './test_cases';
import { NunjucksFilterMapSchema } from './shared';
import { RedteamConfigSchema } from './redteam';
import type { RedteamFileConfig } from '../redteam/types';
import type { RunEvalOptions } from '../types/eval';
import type { PromptMetrics } from './results';
import { isJavascriptFile } from '../util/fileExtensions';

// Type synchronization helper
type AssertEqual<T, U> = T extends U ? (U extends T ? true : false) : false;
function assert<_T extends true>() {}

export const CommandLineOptionsSchema = z.object({
  // Shared with TestSuite
  description: z.string().optional(),
  prompts: z.array(z.string()).optional(),
  providers: z.array(z.string()),
  output: z.array(z.string()),

  // Shared with EvaluateOptions
  maxConcurrency: z.coerce.number().int().positive().optional(),
  repeat: z.coerce.number().int().positive().optional(),
  delay: z.coerce.number().int().nonnegative().prefault(0),

  // Command line only
  vars: z.string().optional(),
  tests: z.string().optional(),
  config: z.array(z.string()).optional(),
  assertions: z.string().optional(),
  modelOutputs: z.string().optional(),
  verbose: z.boolean().optional(),
  grader: z.string().optional(),
  tableCellMaxLength: z.coerce.number().int().positive().optional(),
  write: z.boolean().optional(),
  cache: z.boolean().optional(),
  table: z.boolean().optional(),
  share: z.boolean().optional(),
  noShare: z.boolean().optional(),
  progressBar: z.boolean().optional(),
  watch: z.boolean().optional(),
  filterErrorsOnly: z.string().optional(),
  filterFailing: z.string().optional(),
  filterFailingOnly: z.string().optional(),
  filterFirstN: z.coerce.number().int().nonnegative().optional(),
  filterMetadata: z.string().optional(),
  filterPattern: z.string().optional(),
  filterProviders: z.string().optional(),
  filterSample: z.coerce.number().int().nonnegative().optional(),
  filterTargets: z.string().optional(),
  var: z.record(z.string(), z.string()).optional(),

  generateSuggestions: z.boolean().optional(),
  promptPrefix: z.string().optional(),
  promptSuffix: z.string().optional(),
  retryErrors: z.boolean().optional(),

  envPath: z.union([z.string(), z.array(z.string())]).optional(),

  // Extension hooks
  extension: z.array(z.string()).optional(),
});

export type CommandLineOptions = z.infer<typeof CommandLineOptionsSchema>;

assert<AssertEqual<CommandLineOptions, z.infer<typeof CommandLineOptionsSchema>>>();

export const EvaluateOptionsSchema = z.object({
  cache: z.boolean().optional(),
  delay: z.number().optional(),
  eventSource: z.string().optional(),
  generateSuggestions: z.boolean().optional(),
  /**
   * @deprecated This option has been removed as of 2024-08-21.
   * @description Use `maxConcurrency: 1` or the CLI option `-j 1` instead to run evaluations serially.
   * @author mldangelo
   */
  interactiveProviders: z.boolean().optional(),
  maxConcurrency: z.number().optional(),
  progressCallback: z
    .custom<
      (
        completed: number,
        total: number,
        index: number,
        evalStep: RunEvalOptions,
        metrics: PromptMetrics,
      ) => void
    >((v) => typeof v === 'function')
    .optional(),
  repeat: z.number().optional(),
  showProgressBar: z.boolean().optional(),
  /**
   * Timeout in milliseconds for each individual test case/provider API call.
   * When reached, that specific test is marked as an error.
   * Default is 0 (no timeout).
   */
  timeoutMs: z.number().optional(),
  /**
   * Maximum total runtime in milliseconds for the entire evaluation process.
   * When reached, all remaining tests are marked as errors and the evaluation ends.
   * Default is 0 (no limit).
   */
  maxEvalTimeMs: z.number().optional(),
  isRedteam: z.boolean().optional(),
  /**
   * When true, suppresses informational output like "Starting evaluation" messages.
   * Useful for internal evaluations like provider validation.
   */
  silent: z.boolean().optional(),
});
export type EvaluateOptions = z.infer<typeof EvaluateOptionsSchema> & { abortSignal?: AbortSignal };

const ProviderPromptMapSchema = z.record(
  z.string(),
  z.union([z.string().transform((value) => [value]), z.array(z.string())]),
);

// The test suite defines the "knobs" that we are tuning in prompt engineering: providers and prompts
export const TestSuiteSchema = z.object({
  // Optional tags to describe the test suite
  tags: z.record(z.string(), z.string()).optional(),

  // Optional description of what your LLM is trying to do
  description: z.string().optional(),

  // One or more LLM APIs to use
  providers: z.array(ApiProviderSchema),

  // One or more prompt strings
  prompts: z.array(PromptSchema),

  // Optional mapping of provider to prompt display strings.  If not provided,
  // all prompts are used for all providers.
  providerPromptMap: ProviderPromptMapSchema.optional(),
  // Test cases
  tests: z.array(TestCaseSchema).optional(),

  // scenarios
  scenarios: z.array(ScenarioSchema).optional(),

  // Sets the default properties for each test case. Useful for setting an assertion, on all test cases, for example.
  defaultTest: z
    .union([
      z.string().refine((val) => val.startsWith('file://'), {
        error: 'defaultTest string must start with file://',
      }),
      TestCaseSchema.omit({ description: true }),
    ])
    .optional(),

  // Nunjucks filters
  nunjucksFilters: NunjucksFilterMapSchema.optional(),

  // Envar overrides
  env: ProviderEnvOverridesSchema.optional(),

  // Metrics to calculate after the eval has been completed
  derivedMetrics: z.array(DerivedMetricSchema).optional(),

  // Extensions that are called at various plugin points
  extensions: z
    .array(
      z
        .string()
        .refine((value) => value.startsWith('file://'), {
          error: 'Extension must start with file://',
        })
        .refine(
          (value) => {
            const parts = value.split(':');
            return parts.length === 3 && parts.every((part) => part.trim() !== '');
          },
          {
            error: 'Extension must be of the form file://path/to/file.py:function_name',
          },
        )
        .refine(
          (value) => {
            const parts = value.split(':');
            return (
              (parts[1].endsWith('.py') || isJavascriptFile(parts[1])) &&
              (parts.length === 3 || parts.length === 2)
            );
          },
          {
            error:
              'Extension must be a python (.py) or javascript (.js, .ts, .mjs, .cjs, etc.) file followed by a colon and function name',
          },
        ),
    )
    .nullable()
    .optional(),

  // Redteam configuration - used only when generating redteam tests
  redteam: z.custom<RedteamFileConfig>().optional(),

  // Tracing configuration (simplified version for parsed TestSuite)
  tracing: z
    .object({
      enabled: z.boolean(),
      otlp: z
        .object({
          http: z
            .object({
              enabled: z.boolean(),
              port: z.number(),
              host: z.string().optional(),
              acceptFormats: z.array(z.string()),
            })
            .optional(),
          grpc: z
            .object({
              enabled: z.boolean(),
              port: z.number(),
            })
            .optional(),
        })
        .optional(),
      storage: z
        .object({
          type: z.string(),
          retentionDays: z.number(),
        })
        .optional(),
      forwarding: z
        .object({
          enabled: z.boolean(),
          endpoint: z.string(),
          headers: z.record(z.string(), z.string()).optional(),
        })
        .optional(),
    })
    .optional(),
});

export type TestSuite = z.infer<typeof TestSuiteSchema>;

// TestSuiteConfig = Test Suite, but before everything is parsed and resolved.  Providers are just strings, prompts are filepaths, tests can be filepath or inline.
export const TestSuiteConfigSchema = z.object({
  // Optional tags to describe the test suite
  tags: z.record(z.string(), z.string()).optional(),

  // Optional description of what you're trying to test
  description: z.string().optional(),

  // One or more LLM APIs to use, for example: openai:gpt-4o-mini, openai:gpt-4o, localai:chat:vicuna
  providers: ProvidersSchema,

  // One or more prompt files to load
  prompts: z.union([
    z.string(),
    z.array(
      z.union([
        z.string(),
        z.object({
          id: z.string(),
          label: z.string().optional(),
          raw: z.string().optional(),
        }),
        PromptSchema,
      ]),
    ),
    z.record(z.string(), z.string()),
  ]),

  // Path to a test file, OR list of LLM prompt variations (aka "test case")
  tests: z
    .union([
      z.string(),
      z.array(z.union([z.string(), TestCaseSchema, TestGeneratorConfigSchema])),
      TestGeneratorConfigSchema,
    ])
    .optional(),

  // Scenarios, groupings of data and tests to be evaluated
  scenarios: z.array(z.union([z.string(), ScenarioSchema])).optional(),

  // Sets the default properties for each test case. Useful for setting an assertion, on all test cases, for example.
  defaultTest: z
    .union([
      z.string().refine((val) => val.startsWith('file://'), {
        error: 'defaultTest string must start with file://',
      }),
      TestCaseSchema.omit({ description: true }),
    ])
    .optional(),

  // Path to write output. Writes to console/web viewer if not set.
  outputPath: z.union([z.string(), z.array(z.string())]).optional(),

  // Determines whether or not sharing is enabled.
  sharing: z
    .union([
      z.boolean(),
      z.object({
        apiBaseUrl: z.string().optional(),
        appBaseUrl: z.string().optional(),
      }),
    ])
    .optional(),

  // Nunjucks filters
  nunjucksFilters: z.record(z.string(), z.string()).optional(),

  // Envvar overrides
  env: z
    .union([
      ProviderEnvOverridesSchema,
      z.record(
        z.string(),
        z.union([
          z.string(),
          z.number().transform((n) => String(n)),
          z.boolean().transform((b) => String(b)),
        ]),
      ),
    ])
    .optional(),

  // Metrics to calculate after the eval has been completed
  derivedMetrics: z.array(DerivedMetricSchema).optional(),

  // Extension that is called at various plugin points
  extensions: z.array(z.string()).nullable().optional(),

  // Any other information about this configuration.
  metadata: MetadataSchema.optional(),

  // Redteam configuration - used only when generating redteam tests
  redteam: RedteamConfigSchema.optional(),

  // Write results to disk so they can be viewed in web viewer
  writeLatestResults: z.boolean().optional(),

  // Tracing configuration
  tracing: z
    .object({
      enabled: z.boolean().prefault(false),

      // OTLP receiver configuration
      otlp: z
        .object({
          http: z
            .object({
              enabled: z.boolean().prefault(true),
              port: z.number().prefault(4318),
              host: z.string().prefault('0.0.0.0'),
              acceptFormats: z.array(z.enum(['protobuf', 'json'])).prefault(['json']),
            })
            .optional(),
          grpc: z
            .object({
              enabled: z.boolean().prefault(false),
              port: z.number().prefault(4317),
            })
            .optional(),
        })
        .optional(),

      // Storage configuration
      storage: z
        .object({
          type: z.enum(['sqlite']).prefault('sqlite'),
          retentionDays: z.number().prefault(30),
        })
        .optional(),

      // Optional: Forward traces to another collector
      forwarding: z
        .object({
          enabled: z.boolean().prefault(false),
          endpoint: z.string(),
          headers: z.record(z.string(), z.string()).optional(),
        })
        .optional(),
    })
    .optional(),
});

export type TestSuiteConfig = z.infer<typeof TestSuiteConfigSchema>;
assert<AssertEqual<TestSuiteConfig, z.infer<typeof TestSuiteConfigSchema>>>();

const BaseUnifiedConfigSchema = TestSuiteConfigSchema.extend({
  evaluateOptions: EvaluateOptionsSchema.optional(),
  commandLineOptions: CommandLineOptionsSchema.partial().optional(),
  providers: ProvidersSchema.optional(),
  targets: ProvidersSchema.optional(),
  // Top level redteam options to be transformed
  plugins: z.any().optional(), // Transformed to redteam.plugins
  strategies: z.any().optional(), // Transformed to redteam.strategies
});

export interface UnifiedConfig extends Omit<TestSuiteConfig, 'providers'> {
  providers?: TestSuiteConfig['providers'];
  evaluateOptions?: EvaluateOptions;
  commandLineOptions?: Partial<CommandLineOptions>;
  targets?: TestSuiteConfig['providers'];
  plugins?: any;
  strategies?: any;
}

export const UnifiedConfigSchema: z.ZodType<UnifiedConfig> = BaseUnifiedConfigSchema
  .refine(
    (data) => {
      const hasTargets = data.targets !== undefined;
      const hasProviders = data.providers !== undefined;
      return (hasTargets && !hasProviders) || (!hasTargets && hasProviders);
    },
    {
      message: "Exactly one of 'targets' or 'providers' must be provided, but not both",
    },
  )
  .transform((data) => {
    if (data.targets && !data.providers) {
      data.providers = data.targets;
      delete data.targets;
    }

    // Handle null extensions, undefined extensions, or empty arrays by deleting the field
    if (
      data.extensions === null ||
      data.extensions === undefined ||
      (Array.isArray(data.extensions) && data.extensions.length === 0)
    ) {
      delete data.extensions;
    }

    if (data.plugins) {
      data.redteam = data.redteam || {};
      data.redteam.plugins = data.plugins as any;
      delete data.plugins;
    }
    if (data.strategies) {
      data.redteam = data.redteam || {};
      data.redteam.strategies = data.strategies as any;
      delete data.strategies;
    }

    return data;
  });

assert<AssertEqual<UnifiedConfig, z.infer<typeof UnifiedConfigSchema>>>();

// node.js package interface
export type EvaluateTestSuite = {
  prompts: (string | object | PromptFunction)[];
  writeLatestResults?: boolean;
} & Omit<TestSuiteConfig, 'prompts'>;

export type EvaluateTestSuiteWithEvaluateOptions = EvaluateTestSuite & {
  evaluateOptions: EvaluateOptions;
};