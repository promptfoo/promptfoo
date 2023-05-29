export interface CommandLineOptions {
  // Shared with TestSuite
  prompts: string[];
  providers: string[];
  output: string;

  // Shared with EvaluateOptions
  maxConcurrency: string;

  // Command line only
  vars?: string;
  config?: string;
  verbose?: boolean;
  grader?: string;
  view?: string;
  tableCellMaxLength?: string;
  write?: boolean;
  cache?: boolean;

  generateSuggestions?: boolean;
  promptPrefix?: string;
  promptSuffix?: string;
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
  prompt?: string;
  provider?: string | ApiProvider;
}

export interface PromptConfig {
  prefix?: string;
  suffix?: string;
}

export interface EvaluateOptions {
  maxConcurrency?: number;
  showProgressBar?: boolean;
  generateSuggestions?: boolean;
}

export interface Prompt {
  raw: string;
  display: string;
}

export interface EvaluateResult {
  prompt: Prompt;
  vars: Record<string, string>;
  response?: ProviderResponse;
  error?: string;
  success: boolean;
}

export interface EvaluateTable {
  head: {
    prompts: string[];
    vars: string[];
  };

  body: {
    outputs: string[];
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

// TODO(ian): maybe Assertion should support {type: config} to make the yaml cleaner
export interface Assertion {
  type: 'equality' | 'is-json' | 'function' | 'similarity' | 'llm-rubric';
  value?: string;
  threshold?: number;
  provider?: ApiProvider; // Some assertions require an LLM provider
}

// Each test case is graded pass/fail.  A test case represents a unique input to the LLM after substituting `vars` in the prompt.
export interface TestCase {
  name?: string;
  vars?: Record<string, string>;
  assert?: Assertion[];

  prompt?: PromptConfig;
  grading?: GradingConfig;
}

// The test suite defines the "knobs" that we are tuning in prompt engineering: providers and prompts
export interface TestSuite {
  providers: ApiProvider[];
  prompts: string[];
  tests: TestCase[];
  defaultProperties?: Omit<TestCase, 'name'>;
}

// TestSuiteConfig = Test Suite, but before everything is parsed and resolved.  Providers are just strings, prompts are filepaths, tests can be filepath or inline.
export interface TestSuiteConfig {
  providers: string | string[];
  prompts: string | string[];
  tests: string | TestCase[];
  defaultProperties?: Omit<TestCase, 'name'>;

  outputPath?: string;
}

export type UnifiedConfig = TestSuiteConfig & {
  evaluateOptions: EvaluateOptions;
  commandLineOptions: Partial<CommandLineOptions>;
};
