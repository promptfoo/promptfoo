export interface CommandLineOptions {
  prompts: string[];
  providers: string[];
  output?: string;
  vars?: string;
  config?: string;
  verbose?: boolean;
  maxConcurrency?: string;
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
  generateSuggestions?: boolean;
}

export interface EvaluateOptions {
  providers: ApiProvider[];
  prompts: string[];
  vars?: VarMapping[];

  maxConcurrency?: number;
  showProgressBar?: boolean;

  grading?: GradingConfig;

  prompt?: PromptConfig;
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
