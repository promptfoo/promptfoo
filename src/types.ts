import { z } from 'zod';
import { RedteamAssertionTypes, RedteamConfig } from './redteam/types';

export const CommandLineOptionsSchema = z.object({
  // Shared with TestSuite
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
  interactiveProviders: z.boolean().optional(),
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

export const EnvOverridesSchema = z.object({
  ANTHROPIC_API_KEY: z.string().optional(),
  BAM_API_KEY: z.string().optional(),
  BAM_API_HOST: z.string().optional(),
  AZURE_OPENAI_API_HOST: z.string().optional(),
  AZURE_OPENAI_API_KEY: z.string().optional(),
  AZURE_OPENAI_API_BASE_URL: z.string().optional(),
  AZURE_OPENAI_BASE_URL: z.string().optional(),
  AWS_BEDROCK_REGION: z.string().optional(),
  COHERE_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_API_HOST: z.string().optional(),
  OPENAI_API_BASE_URL: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional(),
  OPENAI_ORGANIZATION: z.string().optional(),
  REPLICATE_API_KEY: z.string().optional(),
  REPLICATE_API_TOKEN: z.string().optional(),
  LOCALAI_BASE_URL: z.string().optional(),
  MISTRAL_API_HOST: z.string().optional(),
  MISTRAL_API_BASE_URL: z.string().optional(),
  PALM_API_KEY: z.string().optional(),
  PALM_API_HOST: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  GOOGLE_API_HOST: z.string().optional(),
  VERTEX_API_KEY: z.string().optional(),
  VERTEX_API_HOST: z.string().optional(),
  VERTEX_PROJECT_ID: z.string().optional(),
  VERTEX_REGION: z.string().optional(),
  VERTEX_PUBLISHER: z.string().optional(),
  MISTRAL_API_KEY: z.string().optional(),
  CLOUDFLARE_API_KEY: z.string().optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
});

export const ProviderOptionsSchema = z
  .object({
    id: z.custom<ProviderId>().optional(),
    label: z.custom<ProviderLabel>().optional(),
    config: z.any().optional(),
    // List of prompt display strings
    prompts: z.array(z.string()).optional(),
    transform: z.string().optional(),
    delay: z.number().optional(),
    env: EnvOverridesSchema.optional(),
  })
  .strict();

export const CallApiContextParamsSchema = z.object({
  fetchWithCache: z.optional(z.any()),
  filters: z.custom<NunjucksFilterMap>().optional(),
  getCache: z.optional(z.any()),
  logger: z.optional(z.any()),
  originalProvider: z.optional(z.any()), // Assuming ApiProvider is not a zod schema, using z.any()
  prompt: z.custom<Prompt>(),
  vars: z.record(z.union([z.string(), z.object({})])),
});

export const CallApiOptionsParamsSchema = z.object({
  includeLogProbs: z.optional(z.boolean()),
});

const CallApiFunctionSchema = z
  .function()
  .args(
    z.string().describe('prompt'),
    CallApiContextParamsSchema.optional(),
    CallApiOptionsParamsSchema.optional(),
  )
  .returns(z.promise(z.custom<ProviderResponse>()))
  .and(z.object({ label: z.string().optional() }));

export const ApiProviderSchema = z.object({
  id: z.function().returns(z.string()),

  callApi: z.custom<CallApiFunction>(),

  callEmbeddingApi: z
    .function()
    .args(z.string())
    .returns(z.promise(z.custom<ProviderEmbeddingResponse>()))
    .optional(),

  callClassificationApi: z
    .function()
    .args(z.string())
    .returns(z.promise(z.custom<ProviderClassificationResponse>()))
    .optional(),

  label: z.custom<ProviderLabel>().optional(),

  transform: z.string().optional(),

  delay: z.number().optional(),
});

export function isApiProvider(provider: any): provider is ApiProvider {
  return typeof provider === 'object' && 'id' in provider && typeof provider.id === 'function';
}

export function isProviderOptions(provider: any): provider is ProviderOptions {
  return !isApiProvider(provider) && typeof provider === 'object';
}

export interface ApiEmbeddingProvider extends ApiProvider {
  callEmbeddingApi: (input: string) => Promise<ProviderEmbeddingResponse>;
}

export interface ApiSimilarityProvider extends ApiProvider {
  callSimilarityApi: (reference: string, input: string) => Promise<ProviderSimilarityResponse>;
}

export interface ApiClassificationProvider extends ApiProvider {
  callClassificationApi: (prompt: string) => Promise<ProviderClassificationResponse>;
}

export interface ApiModerationProvider extends ApiProvider {
  callModerationApi: (prompt: string, response: string) => Promise<ProviderModerationResponse>;
}

const TokenUsageSchema = z.object({
  cached: z.number().optional(),
  completion: z.number().optional(),
  prompt: z.number().optional(),
  total: z.number().optional(),
});

const ProviderResponseSchema = z.object({
  cached: z.boolean().optional(),
  cost: z.number().optional(),
  error: z.string().optional(),
  logProbs: z.array(z.number()).optional(),
  metadata: z
    .object({
      redteamFinalPrompt: z.string().optional(),
    })
    .catchall(z.any())
    .optional(),
  output: z.union([z.string(), z.any()]).optional(),
  tokenUsage: TokenUsageSchema.optional(),
});

const ProviderEmbeddingResponseSchema = z.object({
  error: z.string().optional(),
  embedding: z.array(z.number()).optional(),
  tokenUsage: TokenUsageSchema.partial().optional(),
});

const ProviderSimilarityResponseSchema = z.object({
  error: z.string().optional(),
  similarity: z.number().optional(),
  tokenUsage: TokenUsageSchema.partial().optional(),
});

const ProviderClassificationResponseSchema = z.object({
  error: z.string().optional(),
  classification: z.record(z.number()).optional(),
});

export type ApiProvider = z.infer<typeof ApiProviderSchema>;
export type CallApiContextParams = z.infer<typeof CallApiContextParamsSchema>;
export type CallApiOptionsParams = z.infer<typeof CallApiOptionsParamsSchema>;
export type CommandLineOptions = z.infer<typeof CommandLineOptionsSchema>;
export type EnvOverrides = z.infer<typeof EnvOverridesSchema>;
export type FilePath = string;
export type ProviderClassificationResponse = z.infer<typeof ProviderClassificationResponseSchema>;
export type ProviderEmbeddingResponse = z.infer<typeof ProviderEmbeddingResponseSchema>;
export type ProviderOptions = z.infer<typeof ProviderOptionsSchema>;
export type ProviderResponse = z.infer<typeof ProviderResponseSchema>;
export type ProviderSimilarityResponse = z.infer<typeof ProviderSimilarityResponseSchema>;
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

// The z.infer type is not as good as a manually created type
type CallApiFunction = {
  (
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse>;
  label?: string;
};
// Confirm that manually created type is equivalent to z.infer type
function assert<T extends never>() {}
type TypeEqualityGuard<A, B> = Exclude<A, B> | Exclude<B, A>;
assert<TypeEqualityGuard<CallApiFunction, z.infer<typeof CallApiFunctionSchema>>>();

export interface ModerationFlag {
  code: string;
  description: string;
  confidence: number;
}

export interface ProviderModerationResponse {
  error?: string;
  flags?: ModerationFlag[];
}

export interface CsvRow {
  [key: string]: string;
}

export type VarMapping = Record<string, string>;

export type ProviderType = 'embedding' | 'classification' | 'text' | 'moderation';

export type ProviderTypeMap = Partial<Record<ProviderType, string | ProviderOptions | ApiProvider>>;

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

export const PromptConfigSchema = z.object({
  prefix: z.string().optional(),
  suffix: z.string().optional(),
});

export type PromptConfig = z.infer<typeof PromptConfigSchema>;

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

export type PromptFunctionContext = {
  vars: Record<string, string | object>;
  provider: {
    id: string;
    label?: string;
  };
};

export const PromptFunctionSchema = z
  .function()
  .args(
    z.object({
      vars: z.record(z.union([z.string(), z.any()])),
      provider: z.custom<ApiProvider>().optional(),
    }),
  )
  .returns(z.promise(z.union([z.string(), z.any()])));

export type PromptFunction = z.infer<typeof PromptFunctionSchema>;

export const PromptSchema = z.object({
  id: z.string().optional(),
  raw: z.string(),
  /**
   * @deprecated in > 0.59.0. Use `label` instead.
   */
  display: z.string().optional(),
  label: z.string(),
  function: PromptFunctionSchema.optional(),
});

export type Prompt = z.infer<typeof PromptSchema>;

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

type progressCallback = (
  progress: number,
  total: number,
  index: number,
  evalStep: RunEvalOptions,
) => void;

const EvaluateOptionsSchema = z.object({
  maxConcurrency: z.number().optional(),
  showProgressBar: z.boolean().optional(),
  progressCallback: z
    .function(z.tuple([z.number(), z.number(), z.number(), z.custom<RunEvalOptions>()]), z.void())
    .optional(),
  generateSuggestions: z.boolean().optional(),
  repeat: z.number().optional(),
  delay: z.number().optional(),
  cache: z.boolean().optional(),
  eventSource: z.string().optional(),
  interactiveProviders: z.boolean().optional(),
});
export type EvaluateOptions = z.infer<typeof EvaluateOptionsSchema>;

// Used for final prompt display
export const CompletedPromptSchema = PromptSchema.extend({
  provider: z.string(),
  metrics: z
    .object({
      score: z.number(),
      testPassCount: z.number(),
      testFailCount: z.number(),
      assertPassCount: z.number(),
      assertFailCount: z.number(),
      totalLatencyMs: z.number(),
      tokenUsage: TokenUsageSchema,
      namedScores: z.record(z.string(), z.number()),
      cost: z.number(),
    })
    .optional(),
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
  'human',
  'icontains-all',
  'icontains-any',
  'icontains',
  'is-json',
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
  'rouge-l',
  'rouge-n',
  'rouge-s',
  'select-best',
  'similar',
  'starts-with',
  'webhook',
]);

export type BaseAssertionTypes = z.infer<typeof BaseAssertionTypesSchema>;

type NotPrefixed<T extends string> = `not-${T}`;

export type AssertionType =
  | BaseAssertionTypes
  | NotPrefixed<BaseAssertionTypes>
  | RedteamAssertionTypes;

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
});

export type AssertionSet = z.infer<typeof AssertionSetSchema>;

// TODO(ian): maybe Assertion should support {type: config} to make the yaml cleaner
export const AssertionSchema = z.object({
  // Type of assertion
  type: z.custom<AssertionType>(),

  // The expected value, if applicable
  value: z.custom<AssertionValue>().optional(),

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
}

export type AssertionValueFunction = (
  output: string,
  context: AssertionValueFunctionContext,
) => AssertionValueFunctionResult | Promise<AssertionValueFunctionResult>;

export type AssertionValue = string | string[] | object | AssertionValueFunction;

export type AssertionValueFunctionResult = boolean | number | GradingResult;

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

export const ProviderSchema = z.union([z.string(), ProviderOptionsSchema, ApiProviderSchema]);
export type Provider = z.infer<typeof ProviderSchema>;

// Metadata is a key-value store for arbitrary data
const MetadataSchema = z.record(z.string(), z.any());

const VarsSchema = z.record(
  z.union([
    z.string(),
    z.number().transform(String),
    z.array(z.union([z.string(), z.number().transform(String)])),
    z.object({}),
    z.array(z.any()),
  ]),
);
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

export type TestCase<Vars = Record<string, string | string[] | object>> = z.infer<
  typeof TestCaseSchema
>;

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

export type AtomicTestCase<Vars = Record<string, string | object>> = z.infer<
  typeof AtomicTestCaseSchema
>;

export const NunjucksFilterMapSchema = z.record(
  z.string(),
  z.function(z.tuple([z.any()]).rest(z.any()), z.string()),
);
// Define the type using the schema
export type NunjucksFilterMap = z.infer<typeof NunjucksFilterMapSchema>;

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
  env: EnvOverridesSchema.optional(),

  // Metrics to calculate after the eval has been completed
  derivedMetrics: z.array(DerivedMetricSchema).optional(),

  // Redteam configuration - used only when generating redteam tests
  redteam: z.custom<RedteamConfig>().optional(),
});

export type TestSuite = z.infer<typeof TestSuiteSchema>;

export type ProviderId = string;

export type ProviderLabel = string;

export type ProviderFunction = ApiProvider['callApi'];

export type ProviderOptionsMap = Record<ProviderId, ProviderOptions>;

// TestSuiteConfig = Test Suite, but before everything is parsed and resolved.  Providers are just strings, prompts are filepaths, tests can be filepath or inline.
export const TestSuiteConfigSchema = z.object({
  // Optional description of what you're trying to test
  description: z.string().optional(),

  // One or more LLM APIs to use, for example: openai:gpt-3.5-turbo, openai:gpt-4, localai:chat:vicuna
  providers: z.union([
    z.string(),
    CallApiFunctionSchema,
    z.array(
      z.union([
        z.string(),
        z.record(z.string(), ProviderOptionsSchema),
        ProviderOptionsSchema,
        CallApiFunctionSchema,
      ]),
    ),
  ]),

  // One or more prompt files to load
  prompts: z.union([
    z.string(),
    z.array(z.union([z.string(), PromptSchema])),
    z.record(z.string(), z.string()),
  ]),

  // Path to a test file, OR list of LLM prompt variations (aka "test case")
  tests: z.union([z.string(), z.array(z.union([z.string(), TestCaseSchema]))]),

  // Scenarios, groupings of data and tests to be evaluated
  scenarios: z.array(ScenarioSchema).optional(),

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

  // Envar overrides
  env: EnvOverridesSchema.optional(),

  // Metrics to calculate after the eval has been completed
  derivedMetrics: z.array(DerivedMetricSchema).optional(),

  // Any other information about this configuration.
  metadata: MetadataSchema.optional(),

  // Redteam configuration - used only when generating redteam tests
  redteam: z.custom<RedteamConfig>().optional(),
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
