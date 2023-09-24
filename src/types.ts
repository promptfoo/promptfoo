export interface CommandLineOptions {
  // Shared with TestSuite
  prompts: string[];
  providers: string[];
  output: string;

  // Shared with EvaluateOptions
  maxConcurrency: string;
  repeat: string;
  delay: string;

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

export interface EnvOverrides {
  ANTHROPIC_API_KEY?: string;
  AZURE_OPENAI_API_HOST?: string;
  AZURE_OPENAI_API_KEY?: string;
  OPENAI_API_KEY?: string;
  OPENAI_API_HOST?: string;
  OPENAI_API_BASE_URL?: string;
  OPENAI_ORGANIZATION?: string;
  REPLICATE_API_KEY?: string;
  REPLICATE_API_TOKEN?: string;
  LOCALAI_BASE_URL?: string;
  PALM_API_KEY?: string;
  PALM_API_HOST?: string;
  VERTEX_API_KEY?: string;
  VERTEX_API_HOST?: string;
  VERTEX_PROJECT_ID?: string;
  VERTEX_REGION?: string;
  VERTEX_PUBLISHER?: string;
}

export interface ProviderOptions {
  id?: ProviderId;
  config?: any;
  prompts?: string[]; // List of prompt display strings
}

export interface ApiProvider {
  id: () => string;
  callApi: (
    prompt: string,
    context?: {
      vars: Record<string, string | object>;
    },
  ) => Promise<ProviderResponse>;
  callEmbeddingApi?: (prompt: string) => Promise<ProviderEmbeddingResponse>;
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
  cached?: boolean;
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
  provider?: string | ProviderOptions | ApiProvider;
  closedQa?: {
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
  postprocess?: string;
}

export interface EvaluateOptions {
  maxConcurrency?: number;
  showProgressBar?: boolean;
  progressCallback?: (progress: number, total: number) => void;
  generateSuggestions?: boolean;
  repeat?: number;
  delay?: number;
  cache?: boolean;
}

export interface Prompt {
  raw: string;
  display: string;
  function?: (context: { vars: Record<string, string | object> }) => Promise<string | object>;
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
}

export interface EvaluateTableOutput {
  pass: boolean;
  score: number;
  text: string;
  prompt: string;
  latencyMs: number;
  tokenUsage?: Partial<TokenUsage>;
  gradingResult?: GradingResult;
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
  componentResults?: GradingResult[];
  assertion: Assertion | null;
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
  | 'python'
  | 'similar'
  | 'llm-rubric'
  | 'model-graded-closedqa'
  | 'model-graded-factuality'
  | 'webhook'
  | 'rouge-n'
  | 'rouge-s'
  | 'rouge-l'
  | 'levenshtein';

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
    | ((output: string, testCase: AtomicTestCase, assertion: Assertion) => Promise<GradingResult>);

  // The threshold value, only applicable for similarity (cosine distance)
  threshold?: number;

  // The weight of this assertion compared to other assertions in the test case. Defaults to 1.
  weight?: number;

  // Some assertions (similarity, llm-rubric) require an LLM provider
  provider?: GradingConfig['provider'];

  rubricPrompt?: GradingConfig['rubricPrompt'];
}

// Each test case is graded pass/fail.  A test case represents a unique input to the LLM after substituting `vars` in the prompt.
export interface TestCase<Vars = Record<string, string | string[] | object>> {
  // Optional description of what you're testing
  description?: string;

  // Key-value pairs to substitute in the prompt
  vars?: Vars;

  // Optional list of automatic checks to run on the LLM output
  assert?: Assertion[];

  // Additional configuration settings for the prompt
  options?: PromptConfig & OutputConfig & GradingConfig;

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
  providers:
    | ProviderId
    | ProviderId[]
    | ProviderOptionsMap[]
    | ProviderOptions[]
    | ProviderFunction;

  // One or more prompt files to load
  prompts: string | string[];

  // Path to a test file, OR list of LLM prompt variations (aka "test case")
  tests: string | string[] | TestCase[];

  // Scenarios, groupings of data and tests to be evaluated
  scenarios?: Scenario[];

  // Sets the default properties for each test case. Useful for setting an assertion, on all test cases, for example.
  defaultTest?: Omit<TestCase, 'description'>;

  // Path to write output. Writes to console/web viewer if not set.
  outputPath?: string;

  // Determines whether or not sharing is enabled.
  sharing?: boolean;

  // Envar overrides
  env?: EnvOverrides;
}

export type UnifiedConfig = TestSuiteConfig & {
  evaluateOptions: EvaluateOptions;
  commandLineOptions: Partial<CommandLineOptions>;
};

// node.js package interface
export interface EvaluateTestSuite extends TestSuiteConfig {
  prompts: string[];
  writeLatestResults?: boolean;
}

export interface SharedResults {
  data: {
    version: number;
    results: EvaluateSummary;
    config: Partial<UnifiedConfig>;
  };
}
