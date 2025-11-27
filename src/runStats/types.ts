/**
 * Run statistics types for evaluation performance analysis.
 *
 * These stats are computed once after an evaluation completes and provide
 * visibility into evaluation performance - latency, cache effectiveness,
 * error breakdowns, and per-provider performance.
 */

import type { GradingResult, ProviderResponse } from '../types/index';

/**
 * Minimal result interface for stats computation.
 *
 * This interface captures the subset of fields needed to compute run stats.
 * It is satisfied by both EvalResult (database model) and EvaluateResult (interface).
 */
export interface StatableResult {
  success: boolean;
  latencyMs: number;
  error?: string | null;
  response?: Pick<ProviderResponse, 'cached'>;
  provider?: { id?: string };
  gradingResult?: Pick<GradingResult, 'componentResults'> | null;
}

/**
 * Latency distribution statistics with percentiles.
 */
export interface LatencyStats {
  /** Average latency in milliseconds */
  avgMs: number;
  /** 50th percentile (median) latency in milliseconds */
  p50Ms: number;
  /** 95th percentile latency in milliseconds */
  p95Ms: number;
  /** 99th percentile latency in milliseconds */
  p99Ms: number;
}

/**
 * Cache effectiveness statistics.
 */
export interface CacheStats {
  /** Number of cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Cache hit rate (0-1), null if no requests */
  hitRate: number | null;
}

/**
 * Error categorization breakdown.
 * Note: Uses snake_case to maintain compatibility with existing telemetry data.
 */
export interface ErrorBreakdown {
  timeout: number;
  rate_limit: number;
  auth: number;
  server_error: number;
  network: number;
  other: number;
}

/**
 * Per-provider performance statistics.
 */
export interface ProviderStats {
  /** Provider identifier */
  provider: string;
  /** Total number of requests */
  requests: number;
  /** Number of successful requests */
  successes: number;
  /** Number of failed requests */
  failures: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Average latency in milliseconds */
  avgLatencyMs: number;
  /** Total tokens used */
  totalTokens: number;
  /** Prompt/input tokens */
  promptTokens: number;
  /** Completion/output tokens */
  completionTokens: number;
  /** Cached tokens */
  cachedTokens: number;
  /** Average tokens per request */
  tokensPerRequest: number;
  /** Token cache rate (0-1) */
  cacheRate: number;
}

/**
 * Per-assertion-type effectiveness statistics.
 */
export interface AssertionTypeStats {
  /** Assertion type identifier */
  type: string;
  /** Number of passes */
  pass: number;
  /** Number of failures */
  fail: number;
  /** Total assertions of this type */
  total: number;
  /** Pass rate (0-1) */
  passRate: number;
}

/**
 * Token usage for assertions (model-graded).
 */
export interface AssertionTokenUsage {
  /** Total tokens used for assertions */
  totalTokens: number;
  /** Prompt tokens used for assertions */
  promptTokens: number;
  /** Completion tokens used for assertions */
  completionTokens: number;
  /** Cached tokens used for assertions */
  cachedTokens: number;
  /** Number of assertion API requests */
  numRequests: number;
  /** Reasoning tokens (for models with extended thinking) */
  reasoningTokens: number;
}

/**
 * Complete evaluation run statistics.
 *
 * This is the main interface exposed to users via Eval.runStats.
 * Contains operational data about the evaluation run - performance,
 * cache effectiveness, errors, and per-provider breakdowns.
 */
export interface EvalRunStats {
  /** Latency distribution */
  latency: LatencyStats;

  /** Cache effectiveness */
  cache: CacheStats;

  /** Error information */
  errors: {
    /** Total number of errors */
    total: number;
    /** List of error types encountered */
    types: string[];
    /** Breakdown by error category */
    breakdown: ErrorBreakdown;
  };

  /** Per-provider performance (sorted by request count, top 10) */
  providers: ProviderStats[];

  /** Assertion statistics */
  assertions: {
    /** Total number of assertions */
    total: number;
    /** Number of passed assertions */
    passed: number;
    /** Overall pass rate (0-1) */
    passRate: number;
    /** Number of model-graded assertions */
    modelGraded: number;
    /** Breakdown by assertion type (sorted by volume, top 20) */
    breakdown: AssertionTypeStats[];
    /** Token usage for model-graded assertions */
    tokenUsage: AssertionTokenUsage;
  };

  /** Model/provider identification */
  models: {
    /** List of model identifiers used */
    ids: string[];
    /** Whether this is an A/B comparison (multiple different models) */
    isComparison: boolean;
    /** Whether any custom/non-standard providers were used */
    hasCustom: boolean;
  };
}
