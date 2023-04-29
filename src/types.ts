export interface EvaluationOptions {
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

export interface EvaluateResult {
  successes: number;
  failures: number;
  tokenUsage: TokenUsage;
}
