export type FilePath = string;

export interface CommandLineOptions {
  // Shared with TestSuite
  prompts?: FilePath[];
  providers: FilePath[];
  output: FilePath[];

  // Shared with EvaluateOptions
  maxConcurrency: string;
  repeat: string;
  delay: string;

  // Command line only
  vars?: FilePath;
  tests?: FilePath;
  config?: FilePath[];
  assertions?: FilePath;
  modelOutputs?: FilePath;
  verbose?: boolean;
  grader?: string;
  tableCellMaxLength?: string;
  write?: boolean;
  cache?: boolean;
  table?: boolean;
  share?: boolean;
  progressBar?: boolean;
  watch?: boolean;

  generateSuggestions?: boolean;
  promptPrefix?: string;
  promptSuffix?: string;
}

export interface EnvOverrides {
  ANTHROPIC_API_KEY?: string;
  AZURE_OPENAI_API_HOST?: string;
  AZURE_OPENAI_API_KEY?: string;
  AZURE_OPENAI_API_BASE_URL?: string;
  AWS_BEDROCK_REGION?: string;
  COHERE_API_KEY?: string;
  OPENAI_API_KEY?: string;
  OPENAI_API_HOST?: string;
  OPENAI_API_BASE_URL?: string;
  OPENAI_ORGANIZATION?: string;
  REPLICATE_API_KEY?: string;
  REPLICATE_API_TOKEN?: string;
  LOCALAI_BASE_URL?: string;
  PALM_API_KEY?: string;
  PALM_API_HOST?: string;
  GOOGLE_API_KEY?: string;
  GOOGLE_API_HOST?: string;
  VERTEX_API_KEY?: string;
  VERTEX_API_HOST?: string;
  VERTEX_PROJECT_ID?: string;
  VERTEX_REGION?: string;
  VERTEX_PUBLISHER?: string;
  MISTRAL_API_KEY?: string;
}

export interface ProviderOptions {
  id?: ProviderId;
  config?: any;
  prompts?: string[]; // List of prompt display strings
}

export interface CallApiContextParams {
  vars: Record<string, string | object>;
}

export interface CallApiOptionsParams {
  includeLogProbs?: boolean;
}

export interface ApiProvider {
  id: () => string;
  callApi: (
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ) => Promise<ProviderResponse>;
  callEmbeddingApi?: (prompt: string) => Promise<ProviderEmbeddingResponse>;
  callClassificationApi?: (prompt: string) => Promise<ProviderClassificationResponse>;
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

export interface TokenUsage {
  total: number;
  prompt: number;
  completion: number;
  cached?: number;
}

export interface ProviderResponse {
  error?: string;
  output?: string | object;
  tokenUsage?: Partial<TokenUsage>;
  cost?: number;
  cached?: boolean;
  logProbs?: number[];
}

export interface ProviderEmbeddingResponse {
  error?: string;
  embedding?: number[];
  tokenUsage?: Partial<TokenUsage>;
}

export interface ProviderSimilarityResponse {
  error?: string;
  similarity?: number;
  tokenUsage?: Partial<TokenUsage>;
}

export interface ProviderClassificationResponse {
  error?: string;
  classification?: Record<string, number>;
}

export interface CsvRow {
  [key: string]: string;
}

export type VarMapping = Record<string, string>;

export type ProviderTypeMap = Partial<Record<
  'embedding' | 'classification' | 'text',
  string | ProviderOptions | ApiProvider
>>;

export interface GradingConfig {
  rubricPrompt?: string;
  provider?: string | ProviderOptions | ApiProvider | ProviderTypeMap;
  factuality?: {
    subset?: number;
    superset?: number;
    agree?: number;
    disagree?: number;
    differButFactual?: number;
  };
}

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
}

export interface EvaluateOptions {
  maxConcurrency?: number;
  showProgressBar?: boolean;
  progressCallback?: (progress: number, total: number) => void;
  generateSuggestions?: boolean;
  repeat?: number;
  delay?: number;
  cache?: boolean;
  eventSource?: string;
  basePath?: string;
}

export interface Prompt {
  id?: string;
  raw: string;
  display: string;
  function?: (context: { vars: Record<string, string | object> }) => Promise<string | object>;
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
  recentEvalFilepath: string;
  evals: {
    id: string;
    filePath: FilePath;
    datasetId: string;
    metrics: CompletedPrompt['metrics'];
  }[];
  count: number;
}

export interface EvaluateResult {
  provider: Pick<ProviderOptions, 'id'>;
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
  assertion: Assertion | null;

  // User comment
  comment?: string;
}

type BaseAssertionTypes =
  | 'equals'
  | 'contains'
  | 'icontains'
  | 'contains-all'
  | 'contains-any'
  | 'icontains-all'
  | 'icontains-any'
  | 'starts-with'
  | 'regex'
  | 'is-json'
  | 'contains-json'
  | 'javascript'
  | 'python'
  | 'similar'
  | 'answer-relevance'
  | 'context-faithfulness'
  | 'context-recall'
  | 'context-relevance'
  | 'llm-rubric'
  | 'model-graded-closedqa'
  | 'factuality'
  | 'model-graded-factuality'
  | 'webhook'
  | 'rouge-n'
  | 'rouge-s'
  | 'rouge-l'
  | 'levenshtein'
  | 'is-valid-openai-function-call'
  | 'is-valid-openai-tools-call'
  | 'latency'
  | 'perplexity'
  | 'perplexity-score'
  | 'cost'
  | 'select-best';
  
type NotPrefixed<T extends string> = `not-${T}`;

export type AssertionType = BaseAssertionTypes | NotPrefixed<BaseAssertionTypes>;

// TODO(ian): maybe Assertion should support {type: config} to make the yaml cleaner
export interface Assertion {
  // Type of assertion
  type: AssertionType;

  // The expected value, if applicable
  value?:
    | string
    | string[]
    | object
    | ((
        output: string | object,
        testCase: AtomicTestCase,
        assertion: Assertion,
      ) => Promise<GradingResult>);

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

// Used when building prompts index from files.
export interface TestCasesWithMetadataPrompt {
  prompt: CompletedPrompt;
  id: string;
  evalId: string;
  evalFilepath: FilePath;
}

export interface TestCasesWithMetadata {
  id: string;
  testCases: FilePath | (FilePath | TestCase)[];
  recentEvalDate: Date;
  recentEvalId: string;
  recentEvalFilepath: FilePath;
  count: number;
  prompts: TestCasesWithMetadataPrompt[];
}

// Each test case is graded pass/fail with a score.  A test case represents a unique input to the LLM after substituting `vars` in the prompt.
export interface TestCase<Vars = Record<string, string | string[] | object>> {
  // Optional description of what you're testing
  description?: string;

  // Key-value pairs to substitute in the prompt
  vars?: Vars;

  // Optional list of automatic checks to run on the LLM output
  assert?: Assertion[];

  // Additional configuration settings for the prompt
  options?: PromptConfig & OutputConfig & GradingConfig & {
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
}

export type ProviderId = string;

export type ProviderFunction = ApiProvider['callApi'];

export type ProviderOptionsMap = Record<ProviderId, ProviderOptions>;

// TestSuiteConfig = Test Suite, but before everything is parsed and resolved.  Providers are just strings, prompts are filepaths, tests can be filepath or inline.
export interface TestSuiteConfig {
  // Optional description of what your LLM is trying to do
  description?: string;

  // One or more LLM APIs to use, for example: openai:gpt-3.5-turbo, openai:gpt-4, localai:chat:vicuna
  providers: ProviderId | ProviderFunction | (ProviderId | ProviderOptionsMap | ProviderOptions)[];

  // One or more prompt files to load
  prompts: FilePath | FilePath[] | Record<FilePath, string>;

  // Path to a test file, OR list of LLM prompt variations (aka "test case")
  tests: FilePath | (FilePath | TestCase)[];

  // Scenarios, groupings of data and tests to be evaluated
  scenarios?: Scenario[];

  // Sets the default properties for each test case. Useful for setting an assertion, on all test cases, for example.
  defaultTest?: Omit<TestCase, 'description'>;

  // Path to write output. Writes to console/web viewer if not set.
  outputPath?: FilePath | FilePath[];

  // Determines whether or not sharing is enabled.
  sharing?: boolean | {
    apiBaseUrl?: string;
    appBaseUrl?: string;
  };

  // Nunjucks filters
  nunjucksFilters?: Record<string, FilePath>;

  // Envar overrides
  env?: EnvOverrides;
}

export type UnifiedConfig = TestSuiteConfig & {
  evaluateOptions: EvaluateOptions;
  commandLineOptions: Partial<CommandLineOptions>;
};

export interface EvalWithMetadata {
  id: string;
  filePath: FilePath;
  date: Date;
  config: Partial<UnifiedConfig>;
  results: EvaluateSummary;
}

export type PromptFunction = (context: { vars: Record<string, string | object> }) => Promise<string | object>

// node.js package interface
export type EvaluateTestSuite = {
  prompts: (string | object | PromptFunction)[];
  writeLatestResults?: boolean;
} & TestSuiteConfig;

export interface SharedResults {
  data: ResultsFile;
}

// promptfoo's internal results format
export interface ResultsFile {
  version: number;
  createdAt: string;
  results: EvaluateSummary;
  config: Partial<UnifiedConfig>;
}

// File exported as --output option
export interface OutputFile {
  results: EvaluateSummary;
  config: Partial<UnifiedConfig>;
  shareableUrl: string | null;
}
