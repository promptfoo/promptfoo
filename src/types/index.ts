// Note: This file is in the process of being deconstructed into `types/` and `validators/`
// Right now Zod and pure types are mixed together!
import { z } from 'zod';
import { PromptSchema } from '../validators/prompts';
import {
  ApiProviderSchema,
  ProviderEnvOverridesSchema,
  ProvidersSchema,
} from '../validators/providers';
import { MetadataSchema, NunjucksFilterMapSchema } from '../validators/shared';
import type { GradingResult } from './assertions';
import type { CompletedPrompt, Prompt, PromptFunction } from './prompts';
import type { ApiProvider, ProviderOptions, ProviderResponse } from './providers';
import type { RedteamFileConfig } from './redteam';
import type { NunjucksFilterMap, TokenUsage } from './shared';
import { TestCaseSchema, type AtomicTestCase } from './testCases';

export * from './assertions';
export * from './prompts';
export * from './providers';
export * from './redteam';
export * from './shared';
export * from './testCases';

export const CommandLineOptionsSchema = z.object({
  // Shared with TestSuite
  description: z.string().optional(),
  prompts: z.array(z.string()).optional(),
  providers: z.array(z.string()),
  output: z.array(z.string()),

  // Shared with EvaluateOptions
  maxConcurrency: z.string(),
  repeat: z.string(),
  delay: z.string(),

  // Command line only
  vars: z.string().optional(),
  tests: z.string().optional(),
  config: z.array(z.string()).optional(),
  assertions: z.string().optional(),
  modelOutputs: z.string().optional(),
  verbose: z.boolean().optional(),
  grader: z.string().optional(),
  tableCellMaxLength: z.string().optional(),
  write: z.boolean().optional(),
  cache: z.boolean().optional(),
  table: z.boolean().optional(),
  share: z.boolean().optional(),
  progressBar: z.boolean().optional(),
  watch: z.boolean().optional(),
  filterFailing: z.string().optional(),
  filterFirstN: z.string().optional(),
  filterPattern: z.string().optional(),
  filterProviders: z.string().optional(),
  var: z.record(z.string()).optional(),

  generateSuggestions: z.boolean().optional(),
  promptPrefix: z.string().optional(),
  promptSuffix: z.string().optional(),

  envFile: z.string().optional(),
});

export type CommandLineOptions = z.infer<typeof CommandLineOptionsSchema>;

export interface CsvRow {
  [key: string]: string;
}

export type VarMapping = Record<string, string>;

export interface RunEvalOptions {
  provider: ApiProvider;
  prompt: Prompt;
  delay: number;

  test: AtomicTestCase;
  nunjucksFilters?: NunjucksFilterMap;
  evaluateOptions: EvaluateOptions;

  rowIndex: number;
  colIndex: number;
  repeatIndex: number;
}

const EvaluateOptionsSchema = z.object({
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
    .function(z.tuple([z.number(), z.number(), z.number(), z.custom<RunEvalOptions>()]), z.void())
    .optional(),
  repeat: z.number().optional(),
  showProgressBar: z.boolean().optional(),
});
export type EvaluateOptions = z.infer<typeof EvaluateOptionsSchema>;

// Used when building prompts index from files.
export interface PromptWithMetadata {
  id: string;
  prompt: Prompt;
  recentEvalDate: Date;
  recentEvalId: string;
  evals: {
    id: string;
    datasetId: string;
    metrics: CompletedPrompt['metrics'];
  }[];
  count: number;
}

export interface EvaluateResult {
  provider: Pick<ProviderOptions, 'id' | 'label'>;
  prompt: Prompt;
  vars: Record<string, string | object>;
  response?: ProviderResponse;
  error?: string;
  success: boolean;
  score: number;
  latencyMs: number;
  gradingResult?: GradingResult;
  namedScores: Record<string, number>;
  cost?: number;
  metadata?: Record<string, any>;
}

export interface EvaluateTableOutput {
  pass: boolean;
  score: number;
  namedScores: Record<string, number>;
  text: string;
  prompt: string;
  latencyMs: number;
  provider?: string;
  tokenUsage?: Partial<TokenUsage>;
  gradingResult?: GradingResult;
  cost: number;
  metadata?: Record<string, any>;
}

export interface EvaluateTableRow {
  description?: string;
  outputs: EvaluateTableOutput[];
  vars: string[];
  test: AtomicTestCase;
}

export interface EvaluateTable {
  head: {
    prompts: CompletedPrompt[];
    vars: string[];
  };
  body: EvaluateTableRow[];
}

export interface EvaluateStats {
  successes: number;
  failures: number;
  tokenUsage: Required<TokenUsage>;
}

export interface EvaluateSummary {
  version: number;
  timestamp: string;
  results: EvaluateResult[];
  table: EvaluateTable;
  stats: EvaluateStats;
}

const ProviderPromptMapSchema = z.record(
  z.string(),
  z.union([z.string().transform((value) => [value]), z.array(z.string())]),
);

export const ScenarioSchema = z.object({
  // Optional description of what you're testing
  description: z.string().optional(),

  // Default test case config
  config: z.array(TestCaseSchema.partial()),

  // Optional list of automatic checks to run on the LLM output
  tests: z.array(TestCaseSchema),
});

export type Scenario = z.infer<typeof ScenarioSchema>;

export const DerivedMetricSchema = z.object({
  // The name of this metric
  name: z.string(),

  // The function to calculate the metric - either a mathematical expression or a function that takes the scores and returns a number
  value: z.union([
    z.string(),
    z
      .function()
      .args(z.record(z.string(), z.number()), z.custom<RunEvalOptions>())
      .returns(z.number()),
  ]),
});
export type DerivedMetric = z.infer<typeof DerivedMetricSchema>;

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

  // Default test case config
  defaultTest: TestCaseSchema.partial().optional(),

  // Nunjucks filters
  nunjucksFilters: NunjucksFilterMapSchema.optional(),

  // Envar overrides
  env: ProviderEnvOverridesSchema.optional(),

  // Metrics to calculate after the eval has been completed
  derivedMetrics: z.array(DerivedMetricSchema).optional(),

  // Extensions that are called at various plugin points
  extensions: z.array(z.string()).optional(),

  // Redteam configuration - used only when generating redteam tests
  redteam: z.custom<RedteamFileConfig>().optional(),
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
  tests: z.union([z.string(), z.array(z.union([z.string(), TestCaseSchema]))]).optional(),

  // Scenarios, groupings of data and tests to be evaluated
  scenarios: z.array(z.union([z.string(), ScenarioSchema])).optional(),

  // Sets the default properties for each test case. Useful for setting an assertion, on all test cases, for example.
  defaultTest: TestCaseSchema.partial().omit({ description: true }).optional(),

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
  env: ProviderEnvOverridesSchema.optional(),

  // Metrics to calculate after the eval has been completed
  derivedMetrics: z.array(DerivedMetricSchema).optional(),

  // Extension that is called at various plugin points
  extensions: z.array(z.string()).optional(),

  // Any other information about this configuration.
  metadata: MetadataSchema.optional(),

  // Redteam configuration - used only when generating redteam tests
  redteam: z.custom<RedteamFileConfig>().optional(),

  // Write results to disk so they can be viewed in web viewer
  writeLatestResults: z.boolean().optional(),
});

export type TestSuiteConfig = z.infer<typeof TestSuiteConfigSchema>;
export const UnifiedConfigSchema = TestSuiteConfigSchema.extend({
  evaluateOptions: EvaluateOptionsSchema.optional(),
  commandLineOptions: CommandLineOptionsSchema.partial().optional(),
});

export type UnifiedConfig = z.infer<typeof UnifiedConfigSchema>;

export interface EvalWithMetadata {
  id: string;
  date: Date;
  config: Partial<UnifiedConfig>;
  results: EvaluateSummary;
  description?: string;
}

// node.js package interface
export type EvaluateTestSuite = {
  prompts: (string | object | PromptFunction)[];
  writeLatestResults?: boolean;
} & Omit<TestSuiteConfig, 'prompts'>;

export type EvaluateTestSuiteWithEvaluateOptions = EvaluateTestSuite & {
  evaluateOptions: EvaluateOptions;
};

export interface SharedResults {
  data: ResultsFile;
}

// promptfoo's internal results format
export interface ResultsFile {
  version: number;
  createdAt: string;
  results: EvaluateSummary;
  config: Partial<UnifiedConfig>;
  author: string | null;

  // Included by readResult() in util.
  datasetId?: string | null;
}

// The eval results list returned by the server and used for the eval picker
export interface ResultLightweight {
  evalId: string;
  datasetId: string | null;
  createdAt: number;
  description: string | null;
  numTests: number;
}

export type ResultLightweightWithLabel = ResultLightweight & { label: string };

// File exported as --output option
export interface OutputFile {
  evalId: string | null;
  results: EvaluateSummary;
  config: Partial<UnifiedConfig>;
  shareableUrl: string | null;
}

// Live eval job state
export interface Job {
  status: 'in-progress' | 'complete';
  progress: number;
  total: number;
  result: EvaluateSummary | null;
}

// used for writing eval results
export const OutputFileExtension = z.enum(['csv', 'html', 'json', 'txt', 'yaml', 'yml']);
export type OutputFileExtension = z.infer<typeof OutputFileExtension>;
