// Note: This file is in the process of being deconstructed into `types/` and `validators/`
// Right now Zod and pure types are mixed together!
import { z } from 'zod';
import type {
  PluginConfig,
  RedteamAssertionTypes,
  RedteamFileConfig,
  StrategyConfig,
} from '../redteam/types';
import { isJavascriptFile } from '../util/file';
import { PromptConfigSchema, PromptSchema } from '../validators/prompts';
import {
  ApiProviderSchema,
  ProviderEnvOverridesSchema,
  ProviderOptionsSchema,
  ProvidersSchema,
} from '../validators/providers';
import { RedteamConfigSchema } from '../validators/redteam';
import { NunjucksFilterMapSchema, TokenUsageSchema } from '../validators/shared';
import type { EnvOverrides } from './env';
import type { Prompt, PromptFunction } from './prompts';
import type { ApiProvider, ProviderOptions, ProviderResponse } from './providers';
import type { NunjucksFilterMap, TokenUsage } from './shared';

export * from './prompts';
export * from './providers';
export * from '../redteam/types';
export * from './shared';

export type { EnvOverrides } from './env';

export const CommandLineOptionsSchema = z.object({
  // Shared with TestSuite
  description: z.string().optional(),
  prompts: z.array(z.string()).optional(),
  providers: z.array(z.string()),
  output: z.array(z.string()),

  // Shared with EvaluateOptions
  maxConcurrency: z.coerce.number().int().positive().optional(),
  repeat: z.coerce.number().int().positive().optional(),
  delay: z.coerce.number().int().nonnegative().default(0),

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
  progressBar: z.boolean().optional(),
  watch: z.boolean().optional(),
  filterFailing: z.string().optional(),
  filterFirstN: z.coerce.number().int().positive().optional(),
  filterMetadata: z.string().optional(),
  filterPattern: z.string().optional(),
  filterProviders: z.string().optional(),
  filterSample: z.coerce.number().int().positive().optional(),
  filterTargets: z.string().optional(),
  var: z.record(z.string()).optional(),

  generateSuggestions: z.boolean().optional(),
  promptPrefix: z.string().optional(),
  promptSuffix: z.string().optional(),

  envPath: z.string().optional(),
});

export type CommandLineOptions = z.infer<typeof CommandLineOptionsSchema>;

export interface CsvRow {
  [key: string]: string;
}

export type VarMapping = Record<string, string>;

const GradingConfigSchema = z.object({
  rubricPrompt: z
    .union([
      z.string(),
      z.array(z.string()),
      z.array(
        z.object({
          role: z.string(),
          content: z.string(),
        }),
      ),
    ])
    .optional(),
  provider: z
    .union([z.string(), z.any(), z.record(z.string(), z.union([z.string(), z.any()])).optional()])
    .optional(),
  factuality: z
    .object({
      subset: z.number().optional(),
      superset: z.number().optional(),
      agree: z.number().optional(),
      disagree: z.number().optional(),
      differButFactual: z.number().optional(),
    })
    .optional(),
});

export type GradingConfig = z.infer<typeof GradingConfigSchema>;

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

export type EvalConversations = Record<
  string,
  { prompt: string | object; input: string; output: string | object }[]
>;

export type EvalRegisters = Record<string, string | object>;

export interface RunEvalOptions {
  provider: ApiProvider;
  prompt: Prompt;
  delay: number;

  test: AtomicTestCase;
  nunjucksFilters?: NunjucksFilterMap;
  evaluateOptions?: EvaluateOptions;

  testIdx: number;
  promptIdx: number;
  repeatIndex: number;

  conversations?: EvalConversations;
  registers?: EvalRegisters;
  isRedteam: boolean;
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
export type EvaluateOptions = z.infer<typeof EvaluateOptionsSchema> & { abortSignal?: AbortSignal };

const PromptMetricsSchema = z.object({
  score: z.number(),
  testPassCount: z.number(),
  testFailCount: z.number(),
  testErrorCount: z.number(),
  assertPassCount: z.number(),
  assertFailCount: z.number(),
  totalLatencyMs: z.number(),
  tokenUsage: TokenUsageSchema,
  namedScores: z.record(z.string(), z.number()),
  namedScoresCount: z.record(z.string(), z.number()),
  redteam: z
    .object({
      pluginPassCount: z.record(z.string(), z.number()),
      pluginFailCount: z.record(z.string(), z.number()),
      strategyPassCount: z.record(z.string(), z.number()),
      strategyFailCount: z.record(z.string(), z.number()),
    })
    .optional(),
  cost: z.number(),
});
export type PromptMetrics = z.infer<typeof PromptMetricsSchema>;

// Used for final prompt display
export const CompletedPromptSchema = PromptSchema.extend({
  provider: z.string(),
  metrics: PromptMetricsSchema.optional(),
});

export type CompletedPrompt = z.infer<typeof CompletedPromptSchema>;

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

export enum ResultFailureReason {
  // The test passed, or we don't know exactly why the test case failed.
  NONE = 0,
  // The test case failed because an assertion rejected it.
  ASSERT = 1,
  // Test case failed due to some other error.
  ERROR = 2,
}

export interface EvaluateResult {
  id?: string; // on the new version 2, this is stored per-result
  description?: string; // on the new version 2, this is stored per-result // FIXME(ian): The EvalResult model doesn't pass this through, but that's ok since we can use testCase.description?
  promptIdx: number; // on the new version 2, this is stored per-result
  testIdx: number; // on the new version 2, this is stored per-result
  testCase: AtomicTestCase; // on the new version 2, this is stored per-result
  promptId: string; // on the new version 2, this is stored per-result
  provider: Pick<ProviderOptions, 'id' | 'label'>;
  prompt: Prompt;
  vars: Vars;
  response?: ProviderResponse;
  error?: string | null;
  failureReason: ResultFailureReason;
  success: boolean;
  score: number;
  latencyMs: number;
  gradingResult?: GradingResult | null;
  namedScores: Record<string, number>;
  cost?: number;
  metadata?: Record<string, any>;
  tokenUsage?: Required<TokenUsage>;
}

export interface EvaluateTableOutput {
  cost: number;
  failureReason: ResultFailureReason;
  gradingResult?: GradingResult | null;
  id: string;
  latencyMs: number;
  metadata?: Record<string, any>;
  namedScores: Record<string, number>;
  pass: boolean;
  prompt: string;
  provider?: string;
  response?: ProviderResponse;
  score: number;
  testCase: AtomicTestCase;
  text: string;
  tokenUsage?: Partial<TokenUsage>;
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
  errors: number;
  tokenUsage: Required<TokenUsage>;
}

export interface EvaluateSummaryV3 {
  version: 3;
  timestamp: string;
  results: EvaluateResult[];
  prompts: CompletedPrompt[];
  stats: EvaluateStats;
}

export interface EvaluateSummaryV2 {
  version: number;
  timestamp: string;
  results: EvaluateResult[];
  table: EvaluateTable;
  stats: EvaluateStats;
}

export interface ResultSuggestion {
  type: string;
  action: 'replace-prompt' | 'pre-filter' | 'post-filter' | 'note';
  value: string;
}

export interface GradingResult {
  // Whether the test passed or failed
  pass: boolean;

  // Test score, typically between 0 and 1
  score: number;

  // Plain text reason for the result
  reason: string;

  // Map of labeled metrics to values
  namedScores?: Record<string, number>;

  // Record of tokens usage for this assertion
  tokensUsed?: TokenUsage;

  // List of results for each component of the assertion
  componentResults?: GradingResult[];

  // The assertion that was evaluated
  assertion?: Assertion | null;

  // User comment
  comment?: string;

  // Actions for the user to take
  suggestions?: ResultSuggestion[];

  // Additional info
  metadata?: {
    pluginId?: string;
    strategyId?: string;
    [key: string]: any;
  };
}

export function isGradingResult(result: any): result is GradingResult {
  return (
    typeof result === 'object' &&
    result !== null &&
    typeof result.pass === 'boolean' &&
    typeof result.score === 'number' &&
    typeof result.reason === 'string' &&
    (typeof result.namedScores === 'undefined' || typeof result.namedScores === 'object') &&
    (typeof result.tokensUsed === 'undefined' || typeof result.tokensUsed === 'object') &&
    (typeof result.componentResults === 'undefined' || Array.isArray(result.componentResults)) &&
    (typeof result.assertion === 'undefined' ||
      result.assertion === null ||
      typeof result.assertion === 'object') &&
    (typeof result.comment === 'undefined' || typeof result.comment === 'string')
  );
}

export const BaseAssertionTypesSchema = z.enum([
  'answer-relevance',
  'bleu',
  'classifier',
  'contains-all',
  'contains-any',
  'contains-json',
  'contains-sql',
  'contains-xml',
  'contains',
  'context-faithfulness',
  'context-recall',
  'context-relevance',
  'cost',
  'equals',
  'factuality',
  'g-eval',
  'guardrails',
  'icontains-all',
  'icontains-any',
  'icontains',
  'is-json',
  'is-refusal',
  'is-sql',
  'is-valid-openai-function-call',
  'is-valid-openai-tools-call',
  'is-xml',
  'javascript',
  'latency',
  'levenshtein',
  'llm-rubric',
  'model-graded-closedqa',
  'model-graded-factuality',
  'moderation',
  'perplexity-score',
  'perplexity',
  'python',
  'regex',
  'rouge-n',
  'similar',
  'starts-with',
  'webhook',
]);

export type BaseAssertionTypes = z.infer<typeof BaseAssertionTypesSchema>;

type NotPrefixed<T extends string> = `not-${T}`;

// The 'human' assertion type is added via the web UI to allow manual grading.
// The 'select-best' assertion type compares all variations for a given test case
// and selects the highest scoring one after all other assertions have completed.
export type SpecialAssertionTypes = 'select-best' | 'human';

export const SpecialAssertionTypesSchema = z.enum(['select-best', 'human']);

export const NotPrefixedAssertionTypesSchema = BaseAssertionTypesSchema.transform(
  (baseType) => `not-${baseType}` as NotPrefixed<BaseAssertionTypes>,
);

export const AssertionTypeSchema = z.union([
  BaseAssertionTypesSchema,
  NotPrefixedAssertionTypesSchema,
  SpecialAssertionTypesSchema,
  z.custom<RedteamAssertionTypes>(),
]);

export type AssertionType = z.infer<typeof AssertionTypeSchema>;

const AssertionSetSchema = z.object({
  type: z.literal('assert-set'),
  // Sub assertions to be run for this assertion set
  assert: z.array(z.lazy(() => AssertionSchema)), // eslint-disable-line @typescript-eslint/no-use-before-define
  // The weight of this assertion compared to other assertions in the test case. Defaults to 1.
  weight: z.number().optional(),
  // Tag this assertion result as a named metric
  metric: z.string().optional(),
  // The required score for this assert set. If not provided, the test case is graded pass/fail.
  threshold: z.number().optional(),

  // An external mapping of arbitrary strings to values that is defined
  // for every assertion in the set and passed into each assert
  config: z.record(z.string(), z.any()).optional(),
});

export type AssertionSet = z.infer<typeof AssertionSetSchema>;

// TODO(ian): maybe Assertion should support {type: config} to make the yaml cleaner
export const AssertionSchema = z.object({
  // Type of assertion
  type: AssertionTypeSchema,

  // The expected value, if applicable
  value: z.custom<AssertionValue>().optional(),

  // An external mapping of arbitrary strings to values that is passed
  // to the assertion for custom asserts
  config: z.record(z.string(), z.any()).optional(),

  // The threshold value, only applicable for similarity (cosine distance)
  threshold: z.number().optional(),

  // The weight of this assertion compared to other assertions in the test case. Defaults to 1.
  weight: z.number().optional(),

  // Some assertions (similarity, llm-rubric) require an LLM provider
  provider: z.custom<GradingConfig['provider']>().optional(),

  // Override the grading rubric
  rubricPrompt: z.custom<GradingConfig['rubricPrompt']>().optional(),

  // Tag this assertion result as a named metric
  metric: z.string().optional(),

  // Process the output before running the assertion
  transform: z.string().optional(),
});

export type Assertion = z.infer<typeof AssertionSchema>;

export interface AssertionValueFunctionContext {
  prompt: string | undefined;
  vars: Record<string, string | object>;
  test: AtomicTestCase<Record<string, string | object>>;
  logProbs: number[] | undefined;
  config?: Record<string, any>;
  provider: ApiProvider | undefined;
  providerResponse: ProviderResponse | undefined;
}

export type AssertionValueFunction = (
  output: string,
  context: AssertionValueFunctionContext,
) => AssertionValueFunctionResult | Promise<AssertionValueFunctionResult>;

export type AssertionValue = string | string[] | object | AssertionValueFunction;

export type AssertionValueFunctionResult = boolean | number | GradingResult;

export interface AssertionParams {
  assertion: Assertion;
  baseType: AssertionType;
  context: AssertionValueFunctionContext;
  cost?: number;
  inverse: boolean;
  logProbs?: number[];
  latencyMs?: number;
  output: string | object;
  outputString: string;
  prompt?: string;
  provider?: ApiProvider;
  providerResponse: ProviderResponse;
  renderedValue?: AssertionValue;
  test: AtomicTestCase;
  valueFromScript?: string | boolean | number | GradingResult | object;
}

// Used when building prompts index from files.
export const TestCasesWithMetadataPromptSchema = z.object({
  prompt: CompletedPromptSchema,
  id: z.string(),
  evalId: z.string(),
});

export type TestCasesWithMetadataPrompt = z.infer<typeof TestCasesWithMetadataPromptSchema>;

const ProviderPromptMapSchema = z.record(
  z.string(),
  z.union([z.string().transform((value) => [value]), z.array(z.string())]),
);

// Metadata is a key-value store for arbitrary data
const MetadataSchema = z.record(z.string(), z.any());

export const VarsSchema = z.record(
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.union([z.string(), z.number(), z.boolean()])),
    z.record(z.string(), z.any()),
    z.array(z.any()),
  ]),
);

export type Vars = z.infer<typeof VarsSchema>;

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
        pluginConfig: z.custom<PluginConfig>().optional(),
        strategyConfig: z.custom<StrategyConfig>().optional(),
      }),
    )
    .optional(),
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

export const TestCasesWithMetadataSchema = z.object({
  id: z.string(),
  testCases: z.union([z.string(), z.array(z.union([z.string(), TestCaseSchema]))]),
  recentEvalDate: z.date(),
  recentEvalId: z.string(),
  count: z.number(),
  prompts: z.array(TestCasesWithMetadataPromptSchema),
});

export type TestCasesWithMetadata = z.infer<typeof TestCasesWithMetadataSchema>;

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
  vars: z.record(z.union([z.string(), z.object({})])).optional(),
}).strict();

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type AtomicTestCase<vars = Record<string, string | object>> = z.infer<
  typeof AtomicTestCaseSchema
>;

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
  extensions: z
    .array(
      z
        .string()
        .refine((value) => value.startsWith('file://'), {
          message: 'Extension must start with file://',
        })
        .refine(
          (value) => {
            const parts = value.split(':');
            return parts.length === 3 && parts.every((part) => part.trim() !== '');
          },
          {
            message: 'Extension must be of the form file://path/to/file.py:function_name',
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
            message:
              'Extension must be a python (.py) or javascript (.js, .ts, .mjs, .cjs, etc.) file followed by a colon and function name',
          },
        ),
    )
    .optional(),

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
  redteam: RedteamConfigSchema.optional(),

  // Write results to disk so they can be viewed in web viewer
  writeLatestResults: z.boolean().optional(),
});

export type TestSuiteConfig = z.infer<typeof TestSuiteConfigSchema>;
export const UnifiedConfigSchema = TestSuiteConfigSchema.extend({
  evaluateOptions: EvaluateOptionsSchema.optional(),
  commandLineOptions: CommandLineOptionsSchema.partial().optional(),
  providers: ProvidersSchema.optional(),
  targets: ProvidersSchema.optional(),
})
  .refine(
    (data) => {
      const hasTargets = Boolean(data.targets);
      const hasProviders = Boolean(data.providers);
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
    return data;
  });

export type UnifiedConfig = z.infer<typeof UnifiedConfigSchema>;

export interface EvalWithMetadata {
  id: string;
  date: Date;
  config: Partial<UnifiedConfig>;
  results: EvaluateSummaryV3;
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
  results: EvaluateSummaryV3 | EvaluateSummaryV2;
  config: Partial<UnifiedConfig>;
  author: string | null;
  prompts?: CompletedPrompt[];
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
  isRedteam?: boolean;
}

export type ResultLightweightWithLabel = ResultLightweight & { label: string };

// File exported as --output option
export interface OutputFile {
  evalId: string | null;
  results: EvaluateSummaryV3 | EvaluateSummaryV2;
  config: Partial<UnifiedConfig>;
  shareableUrl: string | null;
}

// Live eval job state
export interface Job {
  evalId: string | null;
  status: 'in-progress' | 'complete' | 'error';
  progress: number;
  total: number;
  result: EvaluateSummaryV3 | EvaluateSummaryV2 | null;
  logs: string[];
}

// used for writing eval results
export const OutputFileExtension = z.enum(['csv', 'html', 'json', 'jsonl', 'txt', 'yaml', 'yml']);
export type OutputFileExtension = z.infer<typeof OutputFileExtension>;

export interface LoadApiProviderContext {
  options?: ProviderOptions;
  basePath?: string;
  env?: EnvOverrides;
}
