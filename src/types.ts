export interface CommandLineOptions {
  prompts: string[];
  output: string;
  provider: string;
  vars?: string;
  config?: string;
}

export interface ApiProvider {
  callApi: (prompt: string) => Promise<ProviderResult>;
}

interface TokenUsage {
  total: number;
  prompt: number;
  completion: number;
}

export interface ProviderResult {
  output: string;
  tokenUsage?: TokenUsage;
}

export interface CsvRow {
  [key: string]: string;
}

export type VarMapping = Record<string, string>;

export interface EvaluateOptions {
  prompts: string[];
  vars?: VarMapping[];
}

export interface EvaluateResult {
  prompt: string;
  output: string;
  [key: string]: string;
}

export interface EvaluateSummary {
  results: EvaluateResult[];
  stats: {
    successes: number;
    failures: number;
    tokenUsage: TokenUsage;
  };
}
