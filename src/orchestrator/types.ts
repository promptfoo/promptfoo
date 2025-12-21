export interface Task {
  id: string;
  providerKey: string;
  run: () => Promise<TaskRunResult | void>;
  estimatedTokens?: number;
  notBefore?: number;
  limits?: LaneLimits;
}

export interface LaneLimits {
  maxConcurrent?: number;
  rpm?: number;
  tpm?: number;
  minGapMs?: number;
}

export interface TaskRunResult {
  rateLimit?: {
    retryAfterMs?: number;
  };
}

export interface OrchestratorOptions {
  maxConcurrency: number;
  abortSignal?: AbortSignal;
}
