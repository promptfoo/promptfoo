/**
 * Metrics types for evaluation performance analysis.
 *
 * These metrics are computed once after an evaluation completes and serve dual purposes:
 * 1. Exposed to users via the Eval object for visibility into evaluation performance
 * 2. Sent to telemetry for product analytics
 */

import type { GradingResult, ProviderResponse } from '../types';

/**
 * Minimal result interface for metrics computation.
 *
 * This interface captures the subset of fields needed to compute metrics.
 * It is satisfied by both EvalResult (database model) and EvaluateResult (interface).
 */
export interface MetricableResult {
  success: boolean;
  latencyMs: number;
  error?: string | null;
  response?: Pick<ProviderResponse, 'cached'>;
  provider?: { id?: string };
  gradingResult?: Pick<GradingResult, 'componentResults'> | null;
}

/**
 * Latency distribution metrics with percentiles.
 */
export interface LatencyMetrics {
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
 * Cache effectiveness metrics.
 */
export interface CacheMetrics {
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
 * Per-provider performance metrics.
 */
export interface ProviderMetrics {
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
 * Per-assertion-type effectiveness metrics.
 */
export interface AssertionTypeMetrics {
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
 * Token usage metrics for assertions (model-graded).
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
 * Complete evaluation metrics.
 *
 * This is the main interface exposed to users via Eval.metrics
 * and sent to telemetry.
 */
export interface EvalMetrics {
  /** Latency distribution */
  latency: LatencyMetrics;

  /** Cache effectiveness */
  cache: CacheMetrics;

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
  providers: ProviderMetrics[];

  /** Assertion metrics */
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
    breakdown: AssertionTypeMetrics[];
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
