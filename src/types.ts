export interface CommandLineOptions {
  prompt: string[];
  provider: string[];
  output?: string;
  vars?: string;
  config?: string;
}

export interface ApiProvider {
  id: () => string;
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
  providers: ApiProvider[];
  prompts: string[];
  vars?: VarMapping[];
}

export interface EvaluateResult {
  prompt: string;
  output: string;
  vars: Record<string, string>;
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
