// Note: This file is in the process of being deconstructed into `types/` and `validators/`
// Right now Zod and pure types are mixed together!
import { z } from 'zod';
import { ProviderEnvOverridesSchema } from '../types/env';
import { BaseTokenUsageSchema } from '../types/shared';
import { isJavascriptFile, JAVASCRIPT_EXTENSIONS } from '../util/fileExtensions';
import { parseFilterRange } from '../util/filterRange';
import { PromptConfigSchema, PromptSchema } from '../validators/prompts';
import { ApiProviderSchema, ProviderOptionsSchema, ProvidersSchema } from '../validators/providers';

export { ProvidersSchema };

import { RedteamConfigSchema } from '../validators/redteam';
import { NunjucksFilterMapSchema, StringOrFunctionSchema } from '../validators/shared';

export {
  EVENT_SOURCES,
  type EventSource,
  EventSourceSchema,
  isCliEventSource,
} from './eventSource';

import type {
  PluginConfig,
  RedteamAssertionTypes,
  RedteamFileConfig,
  StrategyConfig,
} from '../redteam/types';
import type { EnvOverrides } from '../types/env';
import type { Prompt, PromptConfig, PromptFunction } from './prompts';
import type {
  ApiProvider,
  AudioOutput,
  CallApiContextParams,
  ImageOutput,
  ProviderOptions,
  ProviderResponse,
  ProvidersConfig,
  VideoOutput,
} from './providers';
import type { BaseTokenUsage, NunjucksFilterMap, TokenUsage, VarValue } from './shared';

export type { VarValue } from './shared';

import type { TraceData } from './tracing';
import type { TransformFunction } from './transform';

type AssertEqual<T, U> = T extends U ? (U extends T ? true : false) : false;
function assert<_T extends true>() {}

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

/**
 * Minimal interface for deferred provider-call queues used by serial grading orchestration.
 */
export interface ProviderCallQueueRef {
  enqueue: <T>(providerId: string, call: () => Promise<T>) => Promise<T>;
}

export * from '../redteam/types';
export * from './agent';
export * from './prompts';
export * from './providers';
export * from './shared';
export * from './tracing';

export type { EnvOverrides };

const FilterRangeSchema = z
  .string()
  .superRefine((value, ctx) => {
    try {
      parseFilterRange(value);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          error instanceof Error
            ? error.message
            : '--filter-range must be specified in start:end format using zero-based indices',
      });
    }
  })
  .optional();

export const MAX_SUGGESTIONS_COUNT = 50;

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
  filterRange: FilterRangeSchema,
  filterSample: z.coerce.number().int().positive().optional(),
  filterTargets: z.string().optional(),
  var: z.record(z.string(), z.string()).optional(),

  generateSuggestions: z.boolean().optional(),
  suggestionsCount: z.coerce.number().int().positive().max(MAX_SUGGESTIONS_COUNT).optional(),
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
  /** Rubric prompt override used by model-graded assertions. */
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
  /** Provider override used by model-graded assertions. */
  provider: z
    .union([z.string(), z.any(), z.record(z.string(), z.union([z.string(), z.any()])).optional()])
    .optional(),
  /** Score mapping used by factuality-oriented graders. */
  factuality: z
    .object({
      /** Score awarded when the answer is a factual subset of the expected answer. */
      subset: z.number().optional(),
      /** Score awarded when the answer is a factual superset of the expected answer. */
      superset: z.number().optional(),
      /** Score awarded when answer and reference agree factually. */
      agree: z.number().optional(),
      /** Score awarded when answer and reference disagree factually. */
      disagree: z.number().optional(),
      /** Score awarded when wording differs but remains factual. */
      differButFactual: z.number().optional(),
    })
    .optional(),
});

export type GradingConfig = z.infer<typeof GradingConfigSchema>;

export const OutputConfigSchema = z.object({
  /**
   * @deprecated in > 0.38.0. Use `transform` instead.
   */
  postprocess: StringOrFunctionSchema.optional(),
  /** Transform provider output before assertions run. */
  transform: StringOrFunctionSchema.optional(),
  /** Transform vars before prompt rendering. */
  transformVars: StringOrFunctionSchema.optional(),

  /** Name of the variable that should receive this test case's output. */
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

  /**
   * Defers assertion grading so the evaluator can group model-graded provider
   * calls across rows. Intended for serial evaluation orchestration.
   */
  deferGrading?: boolean;

  /**
   * Queue used while deferred grading is active to group grader provider calls.
   */
  providerCallQueue?: ProviderCallQueueRef;
}

export const EvaluateOptionsSchema = z.object({
  /**
   * Whether to reuse cached provider responses during the eval.
   */
  cache: z.boolean().optional(),
  /**
   * Delay in milliseconds between provider calls.
   */
  delay: z.number().optional(),
  /**
   * Whether promptfoo should generate follow-up prompt improvement suggestions
   * after the eval completes.
   */
  generateSuggestions: z.boolean().optional(),
  /**
   * Maximum number of prompt improvement suggestions to generate.
   */
  suggestionsCount: z.coerce.number().int().positive().max(MAX_SUGGESTIONS_COUNT).optional(),
  /**
   * @deprecated This option has been removed as of 2024-08-21.
   * @remarks Use `maxConcurrency: 1` or the CLI option `-j 1` instead to run evaluations serially.
   * @author mldangelo
   */
  interactiveProviders: z.boolean().optional(),
  /**
   * Maximum number of provider calls to run concurrently.
   */
  maxConcurrency: z.number().optional(),
  /**
   * Callback invoked as rows finish during evaluation.
   *
   * Arguments are completed-row count, total-row count, zero-based row index,
   * the current eval step, and aggregate metrics so far.
   */
  progressCallback: z.custom<EvaluateProgressCallback>((v) => typeof v === 'function').optional(),
  /**
   * Number of times to repeat each test case.
   */
  repeat: z.number().optional(),
  /**
   * Whether CLI-oriented callers should render a progress bar.
   */
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
  /**
   * Marks the eval as a red team run for downstream behavior and reporting.
   */
  isRedteam: z.boolean().optional(),
  /**
   * When true, suppresses informational output like "Starting evaluation" messages.
   * Useful for internal evaluations like provider validation.
   */
  silent: z.boolean().optional(),
  /**
   * Zero-based test index range in start:end format (end exclusive).
   * Persisted on the eval record so resume runs reproduce the original slice.
   */
  filterRange: FilterRangeSchema,
});
/**
 * Runtime-only options accepted by `evaluate()`.
 *
 * @example
 * ```ts
 * const options: EvaluateOptions = {
 *   cache: false,
 *   maxConcurrency: 2,
 *   timeoutMs: 30_000,
 * };
 * ```
 *
 * @interface
 * @public
 */
export type EvaluateOptions = z.infer<typeof EvaluateOptionsSchema> & {
  /**
   * Signal used to cancel the eval and pass cancellation through to providers.
   */
  abortSignal?: AbortSignal;
};

const PromptMetricsSchema = z.object({
  /** Aggregate normalized score across outputs for this prompt. */
  score: z.number(),
  /** Number of test rows that passed for this prompt. */
  testPassCount: z.number(),
  /** Number of test rows that failed assertions for this prompt. */
  testFailCount: z.number(),
  /** Number of test rows that errored before normal grading completed. */
  testErrorCount: z.number(),
  /** Number of individual assertions that passed. */
  assertPassCount: z.number(),
  /** Number of individual assertions that failed. */
  assertFailCount: z.number(),
  /** Sum of provider latency for this prompt in milliseconds. */
  totalLatencyMs: z.number(),
  /** Token usage accumulated across provider calls for this prompt. */
  tokenUsage: BaseTokenUsageSchema,
  /** Aggregate values for named assertion metrics. */
  namedScores: z.record(z.string(), z.number()),
  /** Number of contributions included in each named score. */
  namedScoresCount: z.record(z.string(), z.number()),
  /** Sum of assertion weights contributing to each named score. */
  namedScoreWeights: z.record(z.string(), z.number()).optional(),
  /** Red-team pass/fail counts grouped by plugin and strategy. */
  redteam: z
    .object({
      /** Passing result counts by red-team plugin id. */
      pluginPassCount: z.record(z.string(), z.number()),
      /** Failing result counts by red-team plugin id. */
      pluginFailCount: z.record(z.string(), z.number()),
      /** Passing result counts by red-team strategy id. */
      strategyPassCount: z.record(z.string(), z.number()),
      /** Failing result counts by red-team strategy id. */
      strategyFailCount: z.record(z.string(), z.number()),
    })
    .optional(),
  /** Estimated cost accumulated across provider calls for this prompt. */
  cost: z.number(),
});
/**
 * Aggregate metrics tracked for one completed prompt.
 *
 * @example
 * ```ts
 * const metrics: PromptMetrics = {
 *   score: 1,
 *   testPassCount: 1,
 *   testFailCount: 0,
 *   testErrorCount: 0,
 *   assertPassCount: 1,
 *   assertFailCount: 0,
 *   totalLatencyMs: 120,
 *   tokenUsage: { total: 12 },
 *   namedScores: {},
 *   namedScoresCount: {},
 *   cost: 0,
 * };
 * ```
 *
 * @public
 */
export interface PromptMetrics {
  /** Aggregate normalized score across outputs for this prompt. */
  score: number;
  /** Number of test rows that passed for this prompt. */
  testPassCount: number;
  /** Number of test rows that failed assertions for this prompt. */
  testFailCount: number;
  /** Number of test rows that errored before normal grading completed. */
  testErrorCount: number;
  /** Number of individual assertions that passed. */
  assertPassCount: number;
  /** Number of individual assertions that failed. */
  assertFailCount: number;
  /** Sum of provider latency for this prompt in milliseconds. */
  totalLatencyMs: number;
  /** Token usage accumulated across provider calls for this prompt. */
  tokenUsage: BaseTokenUsage;
  /** Aggregate values for named assertion metrics. */
  namedScores: Record<string, number>;
  /** Number of contributions included in each named score. */
  namedScoresCount: Record<string, number>;
  /** Sum of assertion weights contributing to each named score. */
  namedScoreWeights?: Record<string, number>;
  /** Red-team pass/fail counts grouped by plugin and strategy. */
  redteam?: {
    /** Passing result counts by red-team plugin id. */
    pluginPassCount: Record<string, number>;
    /** Failing result counts by red-team plugin id. */
    pluginFailCount: Record<string, number>;
    /** Passing result counts by red-team strategy id. */
    strategyPassCount: Record<string, number>;
    /** Failing result counts by red-team strategy id. */
    strategyFailCount: Record<string, number>;
  };
  /** Estimated cost accumulated across provider calls for this prompt. */
  cost: number;
}

// Used for final prompt display
export const CompletedPromptSchema = PromptSchema.extend({
  provider: z.string(),
  metrics: PromptMetricsSchema.optional(),
});

/**
 * Prompt metadata attached to completed eval results.
 *
 * @example
 * ```ts
 * const prompt: CompletedPrompt = {
 *   raw: 'Hello {{name}}',
 *   label: 'Greeting',
 *   provider: 'custom:echo',
 * };
 * ```
 *
 * @public
 */
export interface CompletedPrompt extends Prompt {
  /** Provider id associated with the completed prompt column. */
  provider: string;
  /** Aggregate metrics accumulated for this prompt. */
  metrics?: PromptMetrics;
}

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

/**
 * One provider output cell in an eval table.
 *
 * @example
 * ```ts
 * const output: EvaluateTableOutput = {
 *   cost: 0,
 *   failureReason: ResultFailureReason.NONE,
 *   id: 'result-1',
 *   latencyMs: 120,
 *   namedScores: {},
 *   pass: true,
 *   prompt: 'Hello {{name}}',
 *   score: 1,
 *   testCase: { vars: { name: 'Ada' } },
 *   text: 'Hello Ada',
 * };
 * ```
 *
 * @public
 */
export interface EvaluateTableOutput {
  /** Estimated cost attributed to this provider result. */
  cost: number;
  /** Failure category used when rendering an error or failed assertion. */
  failureReason: ResultFailureReason;
  /** Assertion result for this provider output, when grading has run. */
  gradingResult?: GradingResult | null;
  /** Stable result id. */
  id: string;
  /** Provider latency in milliseconds. */
  latencyMs: number;
  /** Additional result metadata preserved for advanced consumers. */
  metadata?: Record<string, any>;
  /** Named metric scores emitted by assertions for this output. */
  namedScores: Record<string, number>;
  /** Whether this output passed all configured assertions. */
  pass: boolean;
  /** Rendered prompt associated with this provider output. */
  prompt: string;
  /** Provider id or label shown for this output. */
  provider?: string;
  /** Raw provider response returned before table normalization. */
  response?: ProviderResponse;
  /** Aggregate score for this output. */
  score: number;
  /** Test case associated with this output. */
  testCase: AtomicTestCase;
  /** Rendered output text shown in table views. */
  text: string;
  /** Token usage attributed to this output. */
  tokenUsage?: Partial<TokenUsage>;
  /** Error message when this output failed before normal grading. */
  error?: string | null;
  /** Audio attachment associated with this output, when present. */
  audio?: AudioOutput;
  /** Video attachment associated with this output, when present. */
  video?: VideoOutput;
  /** Image attachments associated with this output, when present. */
  images?: ImageOutput[];
}

/**
 * One row in an eval table.
 *
 * @example
 * ```ts
 * const row: EvaluateTableRow = {
 *   outputs: [],
 *   vars: ['Ada'],
 *   test: { vars: { name: 'Ada' } },
 *   testIdx: 0,
 * };
 * ```
 *
 * @public
 */
export interface EvaluateTableRow {
  /** Optional human-readable description for the row's test case. */
  description?: string;
  /** Provider outputs rendered across this row. */
  outputs: EvaluateTableOutput[];
  /** Rendered variable values shown in the table row. */
  vars: string[];
  /** Test case represented by this row. */
  test: AtomicTestCase;
  /** Zero-based index of the test case in the eval. */
  testIdx: number;
}

/**
 * Header metadata for an eval table.
 *
 * `prompts` and `vars` define the visible column order used by rows in the
 * matching `EvaluateTable.body`.
 *
 * @example
 * ```ts
 * const head: EvaluateTableHead = {
 *   prompts: [],
 *   vars: ['name'],
 * };
 * ```
 *
 * @public
 */
export interface EvaluateTableHead {
  /** Completed prompts rendered as provider columns. */
  prompts: CompletedPrompt[];
  /** Variable names rendered before provider columns. */
  vars: string[];
}

/**
 * Table-shaped eval output used by `generateTable()` and the web UI.
 *
 * Read this when you need the presentation-oriented table model. Use the eval
 * record summary APIs instead when you need per-result analysis rather than
 * terminal or UI rendering.
 *
 * @example
 * ```ts
 * const table: EvaluateTable = {
 *   head: { prompts: [], vars: ['name'] },
 *   body: [],
 * };
 * ```
 *
 * @public
 */
export interface EvaluateTable {
  /** Prompt and variable headers rendered above the table body. */
  head: EvaluateTableHead;
  /** Ordered table rows, one per evaluated test case. */
  body: EvaluateTableRow[];
}

export interface EvaluateStats {
  successes: number;
  failures: number;
  errors: number;
  tokenUsage: Required<TokenUsage>;
  durationMs?: number;
  generationDurationMs?: number;
  evaluationDurationMs?: number;
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

/**
 * Result returned by assertions and matcher helpers.
 *
 * @example
 * ```ts
 * const result: GradingResult = {
 *   pass: true,
 *   score: 1,
 *   reason: 'Matched expected text',
 * };
 * ```
 *
 * @public
 */
export interface GradingResult {
  /** Whether the test passed or failed. */
  pass: boolean;

  /** Test score, typically between 0 and 1. */
  score: number;

  /** Plain-text explanation suitable for logs and reports. */
  reason: string;

  /** Map of named metric values emitted by the assertion. */
  namedScores?: Record<string, number>;

  /** Total weight contributing to each named score. */
  namedScoreWeights?: Record<string, number>;

  /** Token usage attributed to the assertion or grader. */
  tokensUsed?: TokenUsage;

  /** Component results for compound assertions such as assertion sets. */
  componentResults?: GradingResult[];

  /** Assertion that produced this result, when retained by the caller. */
  assertion?: Assertion;

  /** Optional user-authored comment attached to the result. */
  comment?: string;

  /** Follow-up suggestions produced by some graders. */
  suggestions?: ResultSuggestion[];

  /** Additional assertion-specific metadata. */
  metadata?: {
    /** Red-team plugin id associated with the result, when applicable. */
    pluginId?: string;
    /** Red-team strategy id associated with the result, when applicable. */
    strategyId?: string;
    /** Context value used by context-related assertions. */
    context?: string | string[];
    /** Normalized context fragments used by context-related assertions. */
    contextUnits?: string[];
    /** Raw textual responses returned by one or more LLM grader phases. */
    graderOutputs?: Record<string, string>;
    /** Rendered assertion value after variable substitution. */
    renderedAssertionValue?: string;
    /** Full prompt sent to the grading LLM, retained for debugging. */
    renderedGradingPrompt?: string;
    /**
     * Set when a grader transport or parse failure prevented a real eval.
     * Inverse assertions must not flip this into a pass; the field is only
     * meaningful when present.
     */
    graderError?: true;
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
    (typeof result.namedScoreWeights === 'undefined' ||
      typeof result.namedScoreWeights === 'object') &&
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
  'skill-used',
  'trajectory:goal-success',
  'trajectory:tool-args-match',
  'trajectory:step-count',
  'trajectory:tool-sequence',
  'trajectory:tool-used',
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
  /** Sub-assertions to run as one grouped assertion set. */
  assert: z.array(z.lazy(() => AssertionSchema)),
  /** Weight of this assertion set relative to other assertions. Defaults to `1`. */
  weight: z.number().optional(),
  /** Optional metric name used to expose the grouped score. */
  metric: z.string().optional(),
  /** Required score for the set; without one, the set is graded pass/fail. */
  threshold: z.number().optional(),

  /** Shared custom config passed into every assertion in the set. */
  config: z.record(z.string(), z.any()).optional(),
});

/**
 * Grouped assertions evaluated under one shared threshold.
 *
 * @example
 * ```ts
 * const assertionSet: AssertionSet = {
 *   type: 'assert-set',
 *   threshold: 0.8,
 *   assert: [
 *     { type: 'contains', value: 'Ada' },
 *     { type: 'llm-rubric', value: 'Answer is concise' },
 *   ],
 * };
 * ```
 *
 * @public
 */
export interface AssertionSet {
  /** Assertion-set discriminator. */
  type: 'assert-set';
  /** Sub-assertions to run as one grouped assertion set. */
  assert: Assertion[];
  /** Weight of this assertion set relative to other assertions. Defaults to `1`. */
  weight?: number;
  /** Optional metric name used to expose the grouped score. */
  metric?: string;
  /** Required score for the set; without one, the set is graded pass/fail. */
  threshold?: number;
  /** Shared custom config passed into every assertion in the set. */
  config?: Record<string, any>;
}

// TODO(ian): maybe Assertion should support {type: config} to make the yaml cleaner
export const AssertionSchema = z.object({
  /** Assertion kind to run, such as `contains`, `javascript`, or `llm-rubric`. */
  type: AssertionTypeSchema,

  /** Expected value or callback consumed by assertion types that need one. */
  value: z.custom<AssertionValue>().optional(),

  /** Arbitrary custom config exposed to assertion callbacks through `context.config`. */
  config: z.record(z.string(), z.any()).optional(),

  /** Minimum score required by threshold-aware assertions such as `similar`. */
  threshold: z.number().optional(),

  /** Weight of this assertion relative to the rest of the test case. Defaults to `1`. */
  weight: z.number().optional(),

  /** Provider override used by model-graded assertions that need one. */
  provider: z.custom<GradingConfig['provider']>().optional(),

  /** Rubric override used by model-graded assertions. */
  rubricPrompt: z.custom<GradingConfig['rubricPrompt']>().optional(),

  /** Optional metric name used when the assertion contributes a named score. */
  metric: z.string().optional(),

  /** Transform provider output before this assertion runs. */
  transform: StringOrFunctionSchema.optional(),

  /** Extract assertion-specific context from output before grading. */
  contextTransform: StringOrFunctionSchema.optional(),
});

/**
 * Assertion configuration accepted by eval tests and low-level assertion APIs.
 *
 * @example
 * ```ts
 * const assertion: Assertion = {
 *   type: 'contains',
 *   value: 'Ada',
 *   metric: 'mentions_name',
 * };
 * ```
 *
 * @public
 */
export interface Assertion {
  /** Assertion kind to run, such as `contains`, `javascript`, or `llm-rubric`. */
  type: AssertionType;
  /** Expected value or callback consumed by assertion types that need one. */
  value?: AssertionValue;
  /** Arbitrary custom config exposed to assertion callbacks through `context.config`. */
  config?: Record<string, any>;
  /** Minimum score required by threshold-aware assertions such as `similar`. */
  threshold?: number;
  /** Weight of this assertion relative to the rest of the test case. Defaults to `1`. */
  weight?: number;
  /** Provider override used by model-graded assertions that need one. */
  provider?: GradingConfig['provider'];
  /** Rubric override used by model-graded assertions. */
  rubricPrompt?: GradingConfig['rubricPrompt'];
  /** Optional metric name used when the assertion contributes a named score. */
  metric?: string;
  /** Transform provider output before this assertion runs. */
  transform?: string | TransformFunction;
  /** Extract assertion-specific context from output before grading. */
  contextTransform?: string | TransformFunction;
}

/**
 * Schema for validating individual assertions (regular or assert-set).
 * Used for runtime validation of user-provided config.
 */
export const AssertionOrSetSchema = z.union([AssertionSetSchema, AssertionSchema]);
/**
 * Assertion entry accepted by test cases.
 *
 * Use a plain `Assertion` for one check or an `assert-set` when several checks
 * should be grouped under one threshold.
 *
 * @example
 * ```ts
 * const assertion: AssertionOrSet = {
 *   type: 'contains',
 *   value: 'Ada',
 * };
 * ```
 *
 * @public
 */
export type AssertionOrSet = AssertionSet | Assertion;

/**
 * Runtime context passed to function-valued assertions.
 *
 * @example
 * ```ts
 * const assertion: AssertionValueFunction = (output, context) => ({
 *   pass: output.includes(String(context.vars.name)),
 *   score: output.includes(String(context.vars.name)) ? 1 : 0,
 *   reason: 'Checked rendered test vars',
 * });
 * ```
 *
 * @public
 */
export interface AssertionValueFunctionContext {
  /** Rendered prompt for the current result, when available. */
  prompt: string | undefined;
  /** Rendered variables for the current test case. */
  vars: Record<string, VarValue>;
  /** Test case currently being graded. */
  test: AtomicTestCase;
  /** Provider log probabilities, when available. */
  logProbs: number[] | undefined;
  /** Assertion-specific config copied from `assert[].config`. */
  config?: Record<string, any>;
  /** Provider used for the current result, when available. */
  provider: ApiProvider | undefined;
  /** Full provider response for the current result. */
  providerResponse: ProviderResponse | undefined;
  /** Trace data for trace-aware assertions when tracing is enabled. */
  trace?: TraceData;
}

/**
 * Function form accepted by JavaScript assertions.
 *
 * Return `true`/`false`, a numeric score, or a full `GradingResult` when you
 * need to provide a custom score or reason.
 *
 * @example
 * ```ts
 * const containsName: AssertionValueFunction = (output) => ({
 *   pass: output.includes('Ada'),
 *   score: output.includes('Ada') ? 1 : 0,
 *   reason: output.includes('Ada') ? 'Name present' : 'Name missing',
 * });
 * ```
 *
 * @param output - Provider output after any assertion-local transform.
 * @param context - Prompt, vars, provider, and trace context for the current result.
 *
 * @public
 */
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

/**
 * Custom scorer used to aggregate named assertion scores for one test case.
 *
 * @param namedScores - Named assertion scores keyed by each assertion's `metric` value.
 * @param context - Optional aggregation metadata for the surrounding assertion set.
 *
 * @example
 * ```ts
 * const scoreAssertions: ScoringFunction = async (namedScores, context) => ({
 *   pass: Object.values(namedScores).every((score) => score >= 0.8),
 *   score: Math.min(...Object.values(namedScores)),
 *   reason: `Checked ${context?.componentResults?.length ?? 0} assertions`,
 * });
 * ```
 *
 * @public
 */
export type ScoringFunction = (
  /** Named assertion scores keyed by each assertion's `metric` value. */
  namedScores: Record<string, number>,
  context?: {
    /** Threshold applied by the surrounding assertion set, when configured. */
    threshold?: number;
    /** Parent assertion-set metadata when this scorer runs inside one. */
    parentAssertionSet?: {
      /** Zero-based position of the parent assertion set in the test case. */
      index: number;
      /** Assertion set being aggregated. */
      assertionSet: AssertionSet;
    };
    /** Individual assertion results available for custom aggregation. */
    componentResults?: GradingResult[];
    /** Token totals accumulated across component results. */
    tokensUsed?: {
      /** Total tokens used by all component results. */
      total: number;
      /** Prompt tokens used by all component results. */
      prompt: number;
      /** Completion tokens used by all component results. */
      completion: number;
    };
  },
) => Promise<GradingResult> | GradingResult;

/**
 * Progress callback invoked as rows finish during evaluation.
 *
 * @param completed - Number of rows completed so far.
 * @param total - Total number of rows scheduled for the eval.
 * @param index - Zero-based index of the row that just completed.
 * @param evalStep - Current evaluator step for the completed row.
 * @param metrics - Aggregate prompt metrics accumulated so far.
 *
 * @example
 * ```ts
 * const onProgress: EvaluateProgressCallback = (completed, total) => {
 *   console.log(`${completed}/${total}`);
 * };
 * ```
 *
 * @public
 */
export type EvaluateProgressCallback = (
  completed: number,
  total: number,
  index: number,
  evalStep: RunEvalOptions,
  metrics: PromptMetrics,
) => void;

// Each test case is graded pass/fail with a score.  A test case represents a unique input to the LLM after substituting `vars` in the prompt.
// HEADS UP: When you add a property here, you probably need to load it from `defaultTest` in evaluator.ts.
export const TestCaseSchema = z.object({
  /** Optional human-readable description of what the test covers. */
  description: z.string().optional(),

  /** Key-value pairs substituted into prompts for this test case. */
  vars: VarsSchema.optional(),

  /** Provider override for this specific test case. */
  provider: z.union([z.string(), ProviderOptionsSchema, ApiProviderSchema]).optional(),

  /** Provider labels or ids this test should run against; supports wildcards such as `openai:*`. */
  providers: z.array(z.string()).optional(),

  /** Prompt labels or ids this test should run against; omitted means all prompts. */
  prompts: z.array(z.string()).optional(),

  /** Precomputed provider output; when set, promptfoo skips the provider call and grades this output directly. */
  providerOutput: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),

  /** Assertions to run against the provider output. */
  assert: z.array(z.union([AssertionSetSchema, AssertionSchema])).optional(),

  /** Optional custom scoring function for aggregating assertion results. */
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
      /** Do not expand array-valued vars into multiple eval cases. */
      disableVarExpansion: z.boolean().optional(),
      /** Do not include the implicit `_conversation` variable. */
      disableConversationVar: z.boolean().optional(),
      /** Skip `defaultTest` assertions while still inheriting other defaults. */
      disableDefaultAsserts: z.boolean().optional(),
      /** Run this test serially even when the eval otherwise uses concurrency. */
      runSerially: z.boolean().optional(),
    })
    .catchall(z.any())
    .optional(),

  /** Required aggregate score for the test case; without one, the case is graded pass/fail. */
  threshold: z.number().optional(),

  /**
   * Arbitrary metadata attached to the test case. Known red-team fields are
   * typed, and extra keys are preserved for custom integrations.
   */
  // Use catchall(z.any()) to allow arbitrary metadata keys while still typing known internal properties.
  // Don't use z.intersection() here as it generates allOf with additionalProperties:false
  // which would reject custom metadata keys. See: https://github.com/colinhacks/zod/issues/4564
  metadata: z
    .object({
      /** Advanced red-team plugin config carried on generated test cases. */
      pluginConfig: z.custom<PluginConfig>().optional(),
      /** Advanced red-team strategy config carried on generated test cases. */
      strategyConfig: z.custom<StrategyConfig>().optional(),
    })
    .catchall(z.any())
    .optional(),
});

/**
 * Additional per-test options merged with prompt, output, and grading behavior.
 *
 * Unknown keys are preserved so provider-specific config can travel with a test.
 *
 * @example
 * ```ts
 * const options: TestCaseOptions = {
 *   prefix: 'System: ',
 *   transform: (output) => output.trim(),
 *   disableVarExpansion: true,
 * };
 * ```
 *
 * @public
 */
export interface TestCaseOptions extends PromptConfig, OutputConfig, GradingConfig {
  /** Do not expand array-valued vars into multiple eval cases. */
  disableVarExpansion?: boolean;
  /** Do not include the implicit `_conversation` variable. */
  disableConversationVar?: boolean;
  /** Skip `defaultTest` assertions while still inheriting other defaults. */
  disableDefaultAsserts?: boolean;
  /** Run this test serially even when the eval otherwise uses concurrency. */
  runSerially?: boolean;
  [key: string]: any;
}

/**
 * Arbitrary metadata attached to a test case.
 *
 * Known red-team fields are typed, and additional keys are preserved for custom
 * integrations.
 *
 * @example
 * ```ts
 * const metadata: TestCaseMetadata = {
 *   source: 'golden-set',
 *   pluginConfig: { language: 'Spanish' },
 * };
 * ```
 *
 * @public
 */
export interface TestCaseMetadata {
  /** Advanced red-team plugin config carried on generated test cases. */
  pluginConfig?: PluginConfig;
  /** Advanced red-team strategy config carried on generated test cases. */
  strategyConfig?: StrategyConfig;
  [key: string]: any;
}

/**
 * Author-facing test case configuration accepted by eval suites.
 *
 * @example
 * ```ts
 * const test: TestCase = {
 *   description: 'Greets the named user',
 *   vars: { name: 'Ada' },
 *   assert: [{ type: 'contains', value: 'Ada' }],
 * };
 * ```
 *
 * @public
 */
export interface TestCase {
  /** Optional human-readable description of what the test covers. */
  description?: string;
  /** Key-value pairs substituted into prompts for this test case. */
  vars?: Vars;
  /** Provider override for this specific test case. */
  provider?: string | ProviderOptions | ApiProvider;
  /** Provider labels or ids this test should run against; supports wildcards such as `openai:*`. */
  providers?: string[];
  /** Prompt labels or ids this test should run against; omitted means all prompts. */
  prompts?: string[];
  /** Precomputed provider output; when set, promptfoo skips the provider call and grades this output directly. */
  providerOutput?: string | Record<string, unknown>;
  /** Assertions to run against the provider output. */
  assert?: AssertionOrSet[];
  /** Optional custom scoring function for aggregating assertion results. */
  assertScoringFunction?: string | ScoringFunction;
  /** Additional configuration settings for the prompt and grader. */
  options?: TestCaseOptions;
  /** Required aggregate score for the test case; without one, the case is graded pass/fail. */
  threshold?: number;
  /** Arbitrary metadata attached to the test case. */
  metadata?: TestCaseMetadata;
}

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

export const AtomicTestCaseSchema = TestCaseSchema.extend({
  /** Flattened variables used for this exact eval row. */
  vars: VarsSchema.optional(),
}).strict();

/**
 * Fully materialized test case used during evaluation.
 *
 * `AtomicTestCase` has the same author-facing fields as `TestCase`, but `vars`
 * has already been flattened into the exact values used for one eval row.
 *
 * @example
 * ```ts
 * const test: AtomicTestCase = {
 *   description: 'Greets the named user',
 *   vars: { name: 'Ada' },
 *   assert: [{ type: 'contains', value: 'Ada' }],
 * };
 * ```
 *
 * @public
 */
export interface AtomicTestCase extends TestCase {
  /** Flattened variables used for this exact eval row. */
  vars?: Vars;
}

assert<AssertEqual<PromptMetrics, z.infer<typeof PromptMetricsSchema>>>();
assert<AssertEqual<CompletedPrompt, z.infer<typeof CompletedPromptSchema>>>();
assert<AssertEqual<AssertionSet, z.infer<typeof AssertionSetSchema>>>();
assert<AssertEqual<Assertion, z.infer<typeof AssertionSchema>>>();
assert<AssertEqual<TestCase, z.infer<typeof TestCaseSchema>>>();
assert<AssertEqual<AtomicTestCase, z.infer<typeof AtomicTestCaseSchema>>>();

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
              acceptFormats: z.array(z.enum(['protobuf', 'json'])).optional(),
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
              acceptFormats: z.array(z.enum(['protobuf', 'json'])).prefault(['json', 'protobuf']),
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

/**
 * Test-suite shape accepted by the Node.js `evaluate()` API.
 *
 * In addition to the Node-specific `prompts`, `providers`, `author`, and
 * `writeLatestResults` fields listed below, this type accepts the same shared
 * suite fields as the YAML config model, including `tests`, `defaultTest`,
 * `env`, and scenarios.
 *
 * @example
 * ```ts
 * const suite: EvaluateTestSuite = {
 *   prompts: ['Say hello to {{name}}'],
 *   providers: ['openai:chat:gpt-5.5'],
 *   tests: [{ vars: { name: 'Ada' } }],
 * };
 * ```
 *
 * @public
 */
export type EvaluateTestSuite = {
  /**
   * Prompt strings, prompt objects, or inline prompt functions to evaluate.
   */
  prompts: (string | object | PromptFunction)[];
  /**
   * Provider ids, provider functions, provider objects, or arrays of those forms.
   */
  providers: ProvidersConfig;
  /**
   * Persist the eval so it is available to local result storage and the web UI.
   */
  writeLatestResults?: boolean;
  /**
   * Author to attribute the evaluation to.
   * When the user is logged into cloud with a stored email, that identity
   * takes precedence and this option is ignored. Otherwise resolution is:
   * this option > stored user email > PROMPTFOO_AUTHOR env var > null.
   */
  author?: string;
} & Omit<TestSuiteConfig, 'prompts' | 'providers'>;

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

/**
 * Optional context accepted by `loadApiProvider()`.
 *
 * Prefer passing per-load overrides here instead of mutating global process
 * state when a library needs to load providers on behalf of a caller.
 *
 * @example
 * ```ts
 * const context: LoadApiProviderContext = {
 *   basePath: process.cwd(),
 *   env: { OPENAI_API_KEY: process.env.OPENAI_API_KEY },
 * };
 * ```
 *
 * @public
 */
export interface LoadApiProviderContext {
  /**
   * Provider-specific options to merge into the resolved provider.
   */
  options?: ProviderOptions;
  /**
   * Base path used to resolve relative config-file references.
   */
  basePath?: string;
  /**
   * Environment overrides available while loading the provider.
   */
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
