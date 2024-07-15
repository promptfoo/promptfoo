import { z } from 'zod';

export type FilePath = string;

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

export type CommandLineOptions = z.infer<typeof CommandLineOptionsSchema>;

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

export type EnvOverrides = z.infer<typeof EnvOverridesSchema>;

export const ProviderOptionsSchema = z
  .object({
    id: z.custom<ProviderId>().optional(),
    label: z.custom<ProviderLabel>().optional(),
    config: z.any().optional(),
    prompts: z.array(z.string()).optional(), // List of prompt display strings
    transform: z.string().optional(),
    delay: z.number().optional(),
    env: EnvOverridesSchema.optional(),
  })
  .strict();

export type ProviderOptions = z.infer<typeof ProviderOptionsSchema>;

export const CallApiContextParamsSchema = z.object({
  vars: z.record(z.union([z.string(), z.object({})])),
  logger: z.optional(z.any()),
  fetchWithCache: z.optional(z.any()),
  getCache: z.optional(z.any()),
});

export type CallApiContextParams = z.infer<typeof CallApiContextParamsSchema>;

export const CallApiOptionsParamsSchema = z.object({
  includeLogProbs: z.optional(z.boolean()),
  originalProvider: z.optional(z.any()), // Assuming ApiProvider is not a zod schema, using z.any()
});

export type CallApiOptionsParams = z.infer<typeof CallApiOptionsParamsSchema>;

type CallApiFunction = {
  (
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse>;
  label?: string;
};

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

export type ApiProvider = z.infer<typeof ApiProviderSchema>;

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

export type TokenUsage = z.infer<typeof TokenUsageSchema>;

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

export type ProviderResponse = z.infer<typeof ProviderResponseSchema>;

const ProviderEmbeddingResponseSchema = z.object({
  error: z.string().optional(),
  embedding: z.array(z.number()).optional(),
  tokenUsage: TokenUsageSchema.partial().optional(),
});

export type ProviderEmbeddingResponse = z.infer<typeof ProviderEmbeddingResponseSchema>;

const ProviderSimilarityResponseSchema = z.object({
  error: z.string().optional(),
  similarity: z.number().optional(),
  tokenUsage: TokenUsageSchema.partial().optional(),
});

export type ProviderSimilarityResponse = z.infer<typeof ProviderSimilarityResponseSchema>;

const ProviderClassificationResponseSchema = z.object({
  error: z.string().optional(),
  classification: z.record(z.number()).optional(),
});

export type ProviderClassificationResponse = z.infer<typeof ProviderClassificationResponseSchema>;

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
  rubricPrompt: z.union([z.string(), z.array(z.string())]).optional(),
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

export interface PromptConfig {
  prefix?: string;
  suffix?: string;
}

export interface OutputConfig {
  /**
   * @deprecated in > 0.38.0. Use `transform` instead.
   */
  postprocess?: string;
  transform?: string;

  // The name of the variable to store the output of this test case
  storeOutputAs?: string;
}

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

export interface EvaluateOptions {
  maxConcurrency?: number;
  showProgressBar?: boolean;
  progressCallback?: (
    progress: number,
    total: number,
    index: number,
    evalStep: RunEvalOptions,
  ) => void;
  generateSuggestions?: boolean;
  repeat?: number;
  delay?: number;
  cache?: boolean;
  eventSource?: string;
  interactiveProviders?: boolean;
}

export type PromptFunctionContext = {
  vars: Record<string, string | object>;
  provider: {
    id: string;
    label?: string;
  };
};

export type PromptFunction = (context: {
  vars: Record<string, string | object>;
  provider?: ApiProvider;
}) => Promise<string | object>;

export interface Prompt {
  id?: string;
  raw: string;
  /**
   * @deprecated in > 0.59.0. Use `label` instead.
   */
  display?: string;
  label: string;
  function?: PromptFunction;
}

// Used for final prompt display
export type CompletedPrompt = Prompt & {
  provider: string;
  metrics?: {
    score: number;
    testPassCount: number;
    testFailCount: number;
    assertPassCount: number;
    assertFailCount: number;
    totalLatencyMs: number;
    tokenUsage: TokenUsage;
    namedScores: Record<string, number>;
    cost: number;
  };
};

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

export type AssertionType = BaseAssertionTypes | NotPrefixed<BaseAssertionTypes>;

export interface AssertionSet {
  type: 'assert-set';

  // Sub assertions to be run for this assertion set
  assert: Assertion[];

  // The weight of this assertion compared to other assertions in the test case. Defaults to 1.
  weight?: number;

  // Tag this assertion result as a named metric
  metric?: string;

  // The required score for this assert set. If not provided, the test case is graded pass/fail.
  threshold?: number;
}

// TODO(ian): maybe Assertion should support {type: config} to make the yaml cleaner
export interface Assertion {
  // Type of assertion
  type: AssertionType;

  // The expected value, if applicable
  value?: AssertionValue;

  // The threshold value, only applicable for similarity (cosine distance)
  threshold?: number;

  // The weight of this assertion compared to other assertions in the test case. Defaults to 1.
  weight?: number;

  // Some assertions (similarity, llm-rubric) require an LLM provider
  provider?: GradingConfig['provider'];

  // Override the grading rubric
  rubricPrompt?: GradingConfig['rubricPrompt'];

  // Tag this assertion result as a named metric
  metric?: string;

  // Process the output before running the assertion
  transform?: string;
}

export type AssertionValue = string | string[] | object | AssertionValueFunction;

export type AssertionValueFunction = (
  output: string,
  context: AssertionValueFunctionContext,
) => AssertionValueFunctionResult | Promise<AssertionValueFunctionResult>;

export interface AssertionValueFunctionContext {
  prompt: string | undefined;
  vars: Record<string, string | object>;
  test: AtomicTestCase<Record<string, string | object>>;
}

export type AssertionValueFunctionResult = boolean | number | GradingResult;

// Used when building prompts index from files.
export interface TestCasesWithMetadataPrompt {
  prompt: CompletedPrompt;
  id: string;
  evalId: string;
}

export interface TestCasesWithMetadata {
  id: string;
  testCases: FilePath | (FilePath | TestCase)[];
  recentEvalDate: Date;
  recentEvalId: string;
  count: number;
  prompts: TestCasesWithMetadataPrompt[];
}

export const ProviderSchema = z.union([z.string(), ProviderOptionsSchema, ApiProviderSchema]);
export type Provider = z.infer<typeof ProviderSchema>;

// Each test case is graded pass/fail with a score.  A test case represents a unique input to the LLM after substituting `vars` in the prompt.
export interface TestCase<Vars = Record<string, string | string[] | object>> {
  // Optional description of what you're testing
  description?: string;

  // Key-value pairs to substitute in the prompt
  vars?: Vars;

  // Override the provider.
  provider?: Provider;

  // Output related from running values in Vars with provider. Having this value would skip running the prompt through the provider, and go straight to the assertions
  providerOutput?: string | object;

  // Optional list of automatic checks to run on the LLM output
  assert?: (AssertionSet | Assertion)[];

  // Additional configuration settings for the prompt
  options?: PromptConfig &
    OutputConfig &
    GradingConfig & {
      // If true, do not expand arrays of variables into multiple eval cases.
      disableVarExpansion?: boolean;
      // If true, do not include an implicit `_conversation` variable in the prompt.
      disableConversationVar?: boolean;
    };

  // The required score for this test case.  If not provided, the test case is graded pass/fail.
  threshold?: number;
}

export interface Scenario {
  // Optional description of what you're testing
  description?: string;

  // Default test case config
  config: Partial<TestCase>[];

  // Optional list of automatic checks to run on the LLM output
  tests: TestCase[];
}

// Same as a TestCase, except the `vars` object has been flattened into its final form.
export interface AtomicTestCase<Vars = Record<string, string | object>> extends TestCase {
  vars?: Record<string, string | object>;
}

export type NunjucksFilterMap = Record<string, (...args: any[]) => string>;

export type DerivedMetric = {
  // The name of this metric
  name: string;
  // The function to calculate the metric - either a mathematical expression or a function that takes the results and returns a number
  value: string | ((scores: Record<string, number>, context: RunEvalOptions) => number);
};

// The test suite defines the "knobs" that we are tuning in prompt engineering: providers and prompts
export interface TestSuite {
  // Optional description of what your LLM is trying to do
  description?: string;

  // One or more LLM APIs to use
  providers: ApiProvider[];

  // One or more prompt strings
  prompts: Prompt[];

  // Optional mapping of provider to prompt display strings.  If not provided,
  // all prompts are used for all providers.
  providerPromptMap?: Record<string, string[]>;

  // Test cases
  tests?: TestCase[];

  // scenarios
  scenarios?: Scenario[];

  // Default test case config
  defaultTest?: Partial<TestCase>;

  // Nunjucks filters
  nunjucksFilters?: NunjucksFilterMap;

  // Envar overrides
  env?: EnvOverrides;

  // Metrics to calculate after the eval has been completed
  derivedMetrics?: DerivedMetric[];
}

export type ProviderId = string;

export type ProviderLabel = string;

export type ProviderFunction = ApiProvider['callApi'];

export type ProviderOptionsMap = Record<ProviderId, ProviderOptions>;

// TestSuiteConfig = Test Suite, but before everything is parsed and resolved.  Providers are just strings, prompts are filepaths, tests can be filepath or inline.
export interface TestSuiteConfig {
  // Optional description of what you're trying to test
  description?: string;

  // One or more LLM APIs to use, for example: openai:gpt-3.5-turbo, openai:gpt-4, localai:chat:vicuna
  providers:
    | ProviderId
    | ProviderFunction
    | (ProviderId | ProviderOptionsMap | ProviderOptions | ProviderFunction)[];

  // One or more prompt files to load
  prompts: FilePath | (FilePath | Prompt)[] | Record<FilePath, string>;

  // Path to a test file, OR list of LLM prompt variations (aka "test case")
  tests: FilePath | (FilePath | TestCase)[];

  // Scenarios, groupings of data and tests to be evaluated
  scenarios?: Scenario[];

  // Sets the default properties for each test case. Useful for setting an assertion, on all test cases, for example.
  defaultTest?: Omit<TestCase, 'description'>;

  // Path to write output. Writes to console/web viewer if not set.
  outputPath?: FilePath | FilePath[];

  // Determines whether or not sharing is enabled.
  sharing?:
    | boolean
    | {
        apiBaseUrl?: string;
        appBaseUrl?: string;
      };

  // Nunjucks filters
  nunjucksFilters?: Record<string, FilePath>;

  // Envar overrides
  env?: EnvOverrides;

  // Metrics to calculate after the eval has been completed
  derivedMetrics?: DerivedMetric[];

  // Any other information about this configuration.
  metadata?: Record<string, any>;
}

export type UnifiedConfig = TestSuiteConfig & {
  evaluateOptions: EvaluateOptions;
  commandLineOptions: Partial<CommandLineOptions>;
};

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
}

// The eval results list returned by the server and used for the eval picker
export interface ResultLightweight {
  evalId: string;
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
