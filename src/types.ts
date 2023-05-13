export interface CommandLineOptions {
  prompts: string[];
  providers: string[];
  output?: string;
  vars?: string;
  config?: string;
  verbose?: boolean;
  maxConcurrency?: number;
  grader?: string;
  view?: boolean;
}

export interface ApiProvider {
  id: () => string;
  callApi: (prompt: string) => Promise<ProviderResponse>;
}

export interface TokenUsage {
  total: number;
  prompt: number;
  completion: number;
}

export interface ProviderResponse {
  error?: string;
  output?: string;
  tokenUsage?: TokenUsage;
}

export interface CsvRow {
  [key: string]: string;
}

export type VarMapping = Record<string, string>;

export interface GradingConfig {
  prompt?: string;
  provider: ApiProvider;
}

export interface EvaluateOptions {
  providers: ApiProvider[];
  prompts: string[];
  vars?: VarMapping[];

  maxConcurrency?: number;
  showProgressBar?: boolean;

  grading?: GradingConfig;
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
  tokenUsage: TokenUsage;
}

export interface EvaluateSummary {
  version: number;
  results: EvaluateResult[];
  table: EvaluateTable;
  stats: EvaluateStats;
}
