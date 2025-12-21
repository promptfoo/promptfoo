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

export interface ProviderLaneStats {
  providerKey: string;
  queueDepth: number;
  maxQueueDepth: number;
  inFlight: number;
  maxConcurrent: number;
  maxConcurrentDynamic: number;
  rpm?: number;
  tpm?: number;
  totalStarted: number;
  totalCompleted: number;
  totalEstimatedTokens: number;
  rateLimitEvents: number;
  elapsedMs: number;
  effectiveRpm: number;
  effectiveTpm: number;
}

export interface OrchestratorStats {
  laneCount: number;
  totalStarted: number;
  totalCompleted: number;
  totalEstimatedTokens: number;
  rateLimitEvents: number;
  maxQueueDepth: number;
  elapsedMs: number;
  effectiveRpm: number;
  effectiveTpm: number;
  lanes: ProviderLaneStats[];
}

export interface OrchestratorOptions {
  maxConcurrency: number;
  abortSignal?: AbortSignal;
}
