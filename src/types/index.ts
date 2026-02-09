// Note: This file is in the process of being deconstructed into `types/` and `validators/`
// Right now Zod and pure types are mixed together!
import { z } from 'zod';
import { ProviderEnvOverridesSchema } from '../types/env';
import { BaseTokenUsageSchema } from '../types/shared';
import { isJavascriptFile, JAVASCRIPT_EXTENSIONS } from '../util/fileExtensions';
import { PromptConfigSchema, PromptSchema } from '../validators/prompts';
import { ApiProviderSchema, ProviderOptionsSchema, ProvidersSchema } from '../validators/providers';
export { ProvidersSchema };

import { RedteamConfigSchema } from '../validators/redteam';
import { NunjucksFilterMapSchema } from '../validators/shared';

import type { BlobRef } from '../blobs/types';
import type {
  PluginConfig,
  RedteamAssertionTypes,
  RedteamFileConfig,
  StrategyConfig,
} from '../redteam/types';
import type { EnvOverrides } from '../types/env';
import type { Prompt, PromptFunction } from './prompts';
import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
} from './providers';
import type { NunjucksFilterMap, TokenUsage, VarValue } from './shared';

export type { VarValue } from './shared';

import type { TraceData } from './tracing';

/**
 * Minimal interface for RateLimitRegistry to avoid circular dependency.
 * The actual implementation is in scheduler/rateLimitRegistry.ts.
 */
export interface RateLimitRegistryRef {
  execute: <T>(
    provider: ApiProvider,
    callFn: () => Promise<T>,
    options?: {
      getHeaders?: (result: T) => Record<string, string> | undefined;
      isRateLimited?: (result: T | undefined, error?: Error) => boolean;
      getRetryAfter?: (result: T | undefined, error?: Error) => number | undefined;
    },
  ) => Promise<T>;
  dispose: () => void;
}

export * from '../redteam/types';
export * from './prompts';
export * from './providers';
export * from './shared';
export * from './tracing';

export type { EnvOverrides };

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
  filterFirstN: z.coerce.number().int().positive().optional(),
  filterMetadata: z.union([z.string(), z.array(z.string())]).optional(),
  filterPattern: z.string().optional(),
  filterPrompts: z.string().optional(),
  filterProviders: z.string().optional(),
  filterSample: z.coerce.number().int().positive().optional(),
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

export interface CsvRow {
  [key: string]: string;
}

export type VarMapping = Record<string, string>;

// Exported for:
// 1. Testing key overlap in merged schemas (see test/types/index.test.ts)
// 2. External consumers who need to validate grading config independently
export const GradingConfigSchema = z.object({
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
  { prompt: string | object; input: string; output: string | object; metadata?: object }[]
>;

export type EvalRegisters = Record<string, VarValue>;

export interface RunEvalOptions {
  provider: ApiProvider;
  prompt: Prompt;
  delay: number;

  test: AtomicTestCase;
  testSuite?: TestSuite;
  nunjucksFilters?: NunjucksFilterMap;
  evaluateOptions?: EvaluateOptions;

  testIdx: number;
  promptIdx: number;
  repeatIndex: number;

  conversations?: EvalConversations;
  registers?: EvalRegisters;
  isRedteam: boolean;

  concurrency?: number;

  /**
   * Evaluation ID for tracking blob references in the database.
   * When set, allows blob storage to record references for access control.
   */
  evalId?: string;

  /**
   * AbortSignal that can be used to cancel the evaluation
   * This is passed to the provider's callApi function
   */
  abortSignal?: AbortSignal;

  /**
   * Rate limit registry for adaptive concurrency control.
   * When provided, provider calls are wrapped with rate limiting and retry logic.
   */
  rateLimitRegistry?: RateLimitRegistryRef;
}

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

const PromptMetricsSchema = z.object({
  score: z.number(),
  testPassCount: z.number(),
  testFailCount: z.number(),
  testErrorCount: z.number(),
  assertPassCount: z.number(),
  assertFailCount: z.number(),
  totalLatencyMs: z.number(),
  tokenUsage: BaseTokenUsageSchema,
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

// The server returns ISO formatted strings for dates, so we need to adjust the type here
export type ServerPromptWithMetadata = Omit<PromptWithMetadata, 'recentEvalDate'> & {
  recentEvalDate: string;
};

export const ResultFailureReason = {
  // The test passed, or we don't know exactly why the test case failed.
  NONE: 0,
  // The test case failed because an assertion rejected it.
  ASSERT: 1,
  // Test case failed due to some other error.
  ERROR: 2,
} as const;
export type ResultFailureReason = (typeof ResultFailureReason)[keyof typeof ResultFailureReason];

const validResultFailureReasons = new Set<number>(Object.values(ResultFailureReason));

export function isResultFailureReason(value: number): value is ResultFailureReason {
  return validResultFailureReasons.has(value);
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
  error?: string | null;
  audio?: {
    id?: string;
    expiresAt?: number;
    data?: string; // base64 encoded audio data
    blobRef?: BlobRef;
    transcript?: string;
    format?: string;
    sampleRate?: number;
    channels?: number;
    duration?: number;
  };
  video?: {
    id?: string; // Provider video ID (e.g., Sora job ID, Veo operation name)
    blobRef?: BlobRef; // Blob storage reference for video data (Veo)
    storageRef?: { key?: string }; // Storage reference for video file (Sora)
    url?: string; // Storage ref URL (e.g., storageRef:video/abc123.mp4) or blob URI
    format?: string; // 'mp4'
    size?: string; // '1280x720' or '720x1280'
    duration?: number; // Seconds
    thumbnail?: string; // Storage ref URL for thumbnail (Sora)
    spritesheet?: string; // Storage ref URL for spritesheet (Sora)
    model?: string; // Model used (e.g., 'sora-2', 'veo-3.1-generate-preview')
    aspectRatio?: string; // '16:9' or '9:16' (Veo)
    resolution?: string; // '720p' or '1080p' (Veo)
  };
}

export interface EvaluateTableRow {
  description?: string;
  outputs: EvaluateTableOutput[];
  vars: string[];
  test: AtomicTestCase;
  testIdx: number;
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
  durationMs?: number;
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

export type EvalTableDTO = {
  table: EvaluateTable;
  totalCount: number;
  filteredCount: number;
  filteredMetrics: PromptMetrics[] | null;
  config: Partial<UnifiedConfig>;
  author: string | null;
  version: number;
  id: string;
  stats?: EvaluateStats;
};

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
  // TODO(Will): Can we move to this being required?
  assertion?: Assertion;

  // User comment
  comment?: string;

  // Actions for the user to take
  suggestions?: ResultSuggestion[];

  // Additional info
  metadata?: {
    pluginId?: string;
    strategyId?: string;
    // Context value for context-related assertions (context-faithfulness, context-recall, context-relevance)
    context?: string | string[];
    contextUnits?: string[];
    // Rendered assertion value with substituted variables (for display in UI)
    renderedAssertionValue?: string;
    // Full grading prompt sent to the grading LLM (for debugging)
    renderedGradingPrompt?: string;
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
  'contains',
  'contains-all',
  'contains-any',
  'contains-html',
  'contains-json',
  'contains-sql',
  'contains-xml',
  'context-faithfulness',
  'context-recall',
  'context-relevance',
  'conversation-relevance',
  'cost',
  'equals',
  'factuality',
  'finish-reason',
  'g-eval',
  'gleu',
  'guardrails',
  'icontains',
  'icontains-all',
  'icontains-any',
  'is-html',
  'is-json',
  'is-refusal',
  'is-sql',
  'is-valid-function-call',
  'is-valid-openai-function-call',
  'is-valid-openai-tools-call',
  'is-xml',
  'javascript',
  'latency',
  'levenshtein',
  'llm-rubric',
  'pi',
  'meteor',
  'model-graded-closedqa',
  'model-graded-factuality',
  'moderation',
  'perplexity',
  'perplexity-score',
  'python',
  'regex',
  'rouge-n',
  'ruby',
  'similar',
  'similar:cosine',
  'similar:dot',
  'similar:euclidean',
  'starts-with',
  'tool-call-f1',
  'trace-error-spans',
  'trace-span-count',
  'trace-span-duration',
  'search-rubric',
  'webhook',
  'word-count',
]);

export type BaseAssertionTypes = z.infer<typeof BaseAssertionTypesSchema>;

type NotPrefixed<T extends string> = `not-${T}`;

// The 'human' assertion type is added via the web UI to allow manual grading.
// The 'select-best' assertion type compares all variations for a given test case
// and selects the highest scoring one after all other assertions have completed.
// The 'max-score' assertion type selects the output with the highest aggregate score
// from other assertions.
export type SpecialAssertionTypes = 'select-best' | 'human' | 'max-score';

export const SpecialAssertionTypesSchema = z.enum(['select-best', 'human', 'max-score']);

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

export const AssertionSetSchema = z.object({
  type: z.literal('assert-set'),
  // Sub assertions to be run for this assertion set
  assert: z.array(z.lazy(() => AssertionSchema)),
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

  // Extract context from the output using a transform
  contextTransform: z.string().optional(),
});

export type Assertion = z.infer<typeof AssertionSchema>;

/**
 * Schema for validating individual assertions (regular or assert-set).
 * Used for runtime validation of user-provided config.
 */
export const AssertionOrSetSchema = z.union([AssertionSetSchema, AssertionSchema]);
export type AssertionOrSet = z.infer<typeof AssertionOrSetSchema>;

export interface AssertionValueFunctionContext {
  prompt: string | undefined;
  vars: Record<string, VarValue>;
  test: AtomicTestCase;
  logProbs: number[] | undefined;
  config?: Record<string, any>;
  provider: ApiProvider | undefined;
  providerResponse: ProviderResponse | undefined;
  trace?: TraceData;
}

export type AssertionValueFunction = (
  output: string,
  context: AssertionValueFunctionContext,
) => AssertionValueFunctionResult | Promise<AssertionValueFunctionResult>;

export type AssertionValue = string | string[] | number | object | AssertionValueFunction;

export type AssertionValueFunctionResult = boolean | number | GradingResult;

export interface AssertionParams {
  assertion: Assertion;
  baseType: AssertionType;
  /** Context passed to provider.callApi() for model-graded assertions */
  providerCallContext?: CallApiContextParams;
  /** Context passed to assertion value functions */
  assertionValueContext: AssertionValueFunctionContext;
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

  // Filter which providers this test runs against. Array of provider labels or IDs. Supports wildcards (e.g., 'openai:*').
  providers: z.array(z.string()).optional(),

  // Filter to specific prompts by label or ID. If not provided, test runs against all prompts.
  prompts: z.array(z.string()).optional(),

  // Output related from running values in Vars with provider. Having this value would skip running the prompt through the provider, and go straight to the assertions
  providerOutput: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),

  // Optional list of automatic checks to run on the LLM output
  assert: z.array(z.union([AssertionSetSchema, AssertionSchema])).optional(),

  // Optional scoring function to run on the LLM output
  assertScoringFunction: z
    .union([
      z
        .string()
        .regex(new RegExp(`^file://.*\\.(${JAVASCRIPT_EXTENSIONS?.join('|')}|py)(?::[\\w.]+)?$`)),
      z.custom<ScoringFunction>(),
    ])
    .optional(),

  // Additional configuration settings for the prompt
  // Use object spread instead of z.intersection() to generate a flat JSON Schema.
  // z.intersection() generates allOf with additionalProperties:false in each sub-schema,
  // causing validation errors for properties defined in other sub-schemas.
  // See: https://github.com/colinhacks/zod/issues/4564
  // Use catchall(z.any()) to allow provider-specific options (like response_format, temperature)
  options: z
    .object({
      ...PromptConfigSchema.shape,
      ...OutputConfigSchema.shape,
      ...GradingConfigSchema.shape,
      // If true, do not expand arrays of variables into multiple eval cases.
      disableVarExpansion: z.boolean().optional(),
      // If true, do not include an implicit `_conversation` variable in the prompt.
      disableConversationVar: z.boolean().optional(),
      // If true, run this without concurrency no matter what
      runSerially: z.boolean().optional(),
    })
    .catchall(z.any())
    .optional(),

  // The required score for this test case.  If not provided, the test case is graded pass/fail.
  threshold: z.number().optional(),

  // Use catchall(z.any()) to allow arbitrary metadata keys while still typing known internal properties.
  // Don't use z.intersection() here as it generates allOf with additionalProperties:false
  // which would reject custom metadata keys. See: https://github.com/colinhacks/zod/issues/4564
  metadata: z
    .object({
      pluginConfig: z.custom<PluginConfig>().optional(),
      strategyConfig: z.custom<StrategyConfig>().optional(),
    })
    .catchall(z.any())
    .optional(),
});

export type TestCase = z.infer<typeof TestCaseSchema>;

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
  vars: VarsSchema.optional(),
}).strict();

export type AtomicTestCase = z.infer<typeof AtomicTestCaseSchema>;

/**
 * Configuration schema for test generators that accept parameters
 *
 * @example
 * ```yaml
 * tests:
 *   - path: file://test_cases.py:generate_tests
 *     config:
 *       dataset: truthfulqa
 *       split: validation
 *       max_rows: 100
 * ```
 */
export const TestGeneratorConfigSchema = z.object({
  /** Path to the test generator function (e.g., file://path/to/tests.py:function_name) */
  path: z.string(),
  /**
   * Configuration object passed to the generator function
   * Common configuration options include:
   * - dataset: string - Dataset identifier
   * - split: string - Dataset split (train/validation/test)
   * - max_rows: number - Maximum number of test cases to generate
   * - languages: string[] - Array of target languages
   * - difficulty: string - Difficulty level (basic/intermediate/advanced)
   * - categories: string[] - Array of test categories
   * - data: object - Custom data configuration
   *
   * Values can reference external files using file:// paths
   */
  config: z
    .record(
      z.string(),
      z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.array(z.union([z.string(), z.number(), z.boolean()])),
        z.record(z.string(), z.any()),
        z.any(), // Allow for complex nested structures and file:// references
      ]),
    )
    .optional(),
});

export type TestGeneratorConfig = z.infer<typeof TestGeneratorConfigSchema>;

export const DerivedMetricSchema = z.object({
  // The name of this metric
  name: z.string(),

  // The function to calculate the metric - either a mathematical expression or a function that takes the scores and returns a number
  value: z.union([
    z.string(),
    z.function({
      input: [z.record(z.string(), z.number()), z.custom<RunEvalOptions>()],
      output: z.number(),
    }),
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

export const UnifiedConfigSchema = TestSuiteConfigSchema.extend({
  evaluateOptions: EvaluateOptionsSchema.optional(),
  commandLineOptions: CommandLineOptionsSchema.partial().optional(),
  providers: ProvidersSchema.optional(),
  targets: ProvidersSchema.optional(),
})
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

export type EvalSummary = ResultLightweightWithLabel & {
  isRedteam: boolean;
  passRate: number;
  label: string;
  providers: {
    id: string;
    label: string | null;
  }[];
  attackSuccessRate?: number;
};

export interface OutputMetadata {
  promptfooVersion: string;
  nodeVersion: string;
  platform: string;
  arch: string;
  exportedAt: string;
  evaluationCreatedAt?: string;
  author?: string;
}

// File exported as --output option
export interface OutputFile {
  evalId: string | null;
  results: EvaluateSummaryV3 | EvaluateSummaryV2;
  config: Partial<UnifiedConfig>;
  shareableUrl: string | null;
  metadata?: OutputMetadata;
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
export const OutputFileExtension = z.enum([
  'csv',
  'html',
  'json',
  'jsonl',
  'txt',
  'xml',
  'yaml',
  'yml',
]);
export type OutputFileExtension = z.infer<typeof OutputFileExtension>;

export interface LoadApiProviderContext {
  options?: ProviderOptions;
  basePath?: string;
  env?: EnvOverrides;
}

export const EvalResultsFilterMode = z.enum([
  'all',
  'failures',
  'different',
  'highlights',
  'errors',
  'passes',
  'user-rated',
]);

export type EvalResultsFilterMode = z.infer<typeof EvalResultsFilterMode>;
