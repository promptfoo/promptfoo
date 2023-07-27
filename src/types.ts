export interface CommandLineOptions {
  // Shared with TestSuite
  prompts: string[];
  providers: string[];
  output: string;

  // Shared with EvaluateOptions
  maxConcurrency: string;
  repeat: string;

  // Command line only
  vars?: string;
  tests?: string;
  config?: string;
  verbose?: boolean;
  grader?: string;
  view?: string;
  tableCellMaxLength?: string;
  write?: boolean;
  cache?: boolean;
  table?: boolean;
  share?: boolean;
  progressBar?: boolean;

  generateSuggestions?: boolean;
  promptPrefix?: string;
  promptSuffix?: string;
}

export interface ProviderConfig {
  id: ProviderId;
  config?: any;
  prompts?: string[]; // List of prompt display strings
}

export interface ApiProvider {
  id: () => string;
  callApi: (prompt: string) => Promise<ProviderResponse>;
}

export interface TokenUsage {
  total: number;
  prompt: number;
  completion: number;
  cached?: number;
}

export interface ProviderResponse {
  error?: string;
  output?: string;
  tokenUsage?: Partial<TokenUsage>;
}

export interface ProviderEmbeddingResponse {
  error?: string;
  embedding?: number[];
  tokenUsage?: Partial<TokenUsage>;
}

export interface CsvRow {
  [key: string]: string;
}

export type VarMapping = Record<string, string>;

export interface GradingConfig {
  rubricPrompt?: string;
  provider?: string | ApiProvider;
}

export interface PromptConfig {
  prefix?: string;
  suffix?: string;
}

export interface OutputConfig {
  postprocess?: string;
}

export interface EvaluateOptions {
  maxConcurrency?: number;
  showProgressBar?: boolean;
  generateSuggestions?: boolean;
  repeat?: number;
}

export interface Prompt {
  raw: string;
  display: string;
}

export interface EvaluateResult {
  prompt: Prompt;
  vars: Record<string, string | object>;
  response?: ProviderResponse;
  error?: string;
  success: boolean;
  score: number;
  latencyMs: number;
}

export interface EvaluateTableOutput {
  pass: boolean;
  score: number;
  text: string;
  prompt: string;
  latencyMs: number;
  tokenUsage?: Partial<TokenUsage>;
}

export interface EvaluateTable {
  head: {
    prompts: Prompt[];
    vars: string[];
  };

  body: {
    outputs: EvaluateTableOutput[];
    vars: string[];
  }[];
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
  pass: boolean;
  score: number;
  reason: string;
  tokensUsed?: TokenUsage;
}

type BaseAssertionTypes =
  | 'equals'
  | 'contains'
  | 'icontains'
  | 'contains-all'
  | 'contains-any'
  | 'starts-with'
  | 'regex'
  | 'is-json'
  | 'contains-json'
  | 'javascript'
  | 'similar'
  | 'llm-rubric'
  | 'webhook'
  | 'rouge-n'
  | 'rouge-s'
  | 'rouge-l';

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
    | ((output: string, testCase: AtomicTestCase, assertion: Assertion) => Promise<GradingResult>);

  // The threshold value, only applicable for similarity (cosine distance)
  threshold?: number;

  // The weight of this assertion compared to other assertions in the test case. Defaults to 1.
  weight?: number;

  // Some assertions (similarity, llm-rubric) require an LLM provider
  provider?: ApiProvider;
}

// Each test case is graded pass/fail.  A test case represents a unique input to the LLM after substituting `vars` in the prompt.
export interface TestCase {
  // Optional description of what you're testing
  description?: string;

  // Key-value pairs to substitute in the prompt
  vars?: Record<string, string | string[] | object>;

  // Optional filepath or glob pattern to load vars from
  loadVars?: string | string[];

  // Optional list of automatic checks to run on the LLM output
  assert?: Assertion[];

  // Additional configuration settings for the prompt
  options?: PromptConfig & OutputConfig & GradingConfig;
}

// Same as a TestCase, except the `vars` object has been flattened into its final form.
export interface AtomicTestCase extends TestCase {
  vars?: Record<string, string | object>;
}

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

  // Default test case config
  defaultTest?: Partial<TestCase>;
}

export type ProviderId = string;

export type ProviderFunction = (prompt: string) => Promise<ProviderResponse>;

export type RawProviderConfig = Record<ProviderId, Omit<ProviderConfig, 'id'>>;

// TestSuiteConfig = Test Suite, but before everything is parsed and resolved.  Providers are just strings, prompts are filepaths, tests can be filepath or inline.
export interface TestSuiteConfig {
  // Optional description of what your LLM is trying to do
  description?: string;

  // One or more LLM APIs to use, for example: openai:gpt-3.5-turbo, openai:gpt-4, localai:chat:vicuna
  providers: ProviderId | ProviderId[] | RawProviderConfig[] | ProviderFunction;

  // One or more prompt files to load
  prompts: string | string[];

  // Path to a test file, OR list of LLM prompt variations (aka "test case")
  tests: string | string[] | TestCase[];

  // Sets the default properties for each test case. Useful for setting an assertion, on all test cases, for example.
  defaultTest?: Omit<TestCase, 'description'>;

  // Path to write output. Writes to console/web viewer if not set.
  outputPath?: string;

  // Determines whether or not sharing is enabled.
  sharing?: boolean;
}

export type UnifiedConfig = TestSuiteConfig & {
  evaluateOptions: EvaluateOptions;
  commandLineOptions: Partial<CommandLineOptions>;
};
