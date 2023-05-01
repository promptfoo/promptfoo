export interface CommandLineOptions {
  prompt: string[];
  provider: string[];
  output?: string;
  vars?: string;
  config?: string;
  verbose?: boolean;
  maxConcurrency?: number;
}

export interface ApiProvider {
  id: () => string;
  callApi: (prompt: string) => Promise<ProviderResponse>;
}

interface TokenUsage {
  total: number;
  prompt: number;
  completion: number;
}

export interface ProviderResponse {
  output: string;
  tokenUsage?: TokenUsage;
}

export interface CsvRow {
  [key: string]: string;
}

export type VarMapping = Record<string, string>;

export interface EvaluateOptions {
  providers: ApiProvider[];
  prompts: string[];
  vars?: VarMapping[];

  maxConcurrency?: number;
  showProgressBar?: boolean;
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
}

export interface EvaluateSummary {
  results: EvaluateResult[];
  table: string[][];
  stats: {
    successes: number;
    failures: number;
    tokenUsage: TokenUsage;
  };
}
