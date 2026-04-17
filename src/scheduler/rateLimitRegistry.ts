import { EventEmitter } from 'events';

import { getEnvBool, getEnvInt } from '../envars';
import { type ProviderMetrics, ProviderRateLimitState } from './providerRateLimitState';
import { getRateLimitKey } from './rateLimitKey';

import type { ApiProvider } from '../types/providers';

export interface RateLimitRegistryOptions {
  maxConcurrency: number;
  minConcurrency?: number;
  queueTimeoutMs?: number; // Timeout for queued requests (default: 5 minutes)
}

/**
 * Per-eval registry that manages rate limit state for all providers.
 * NOT a singleton - create one per evaluation context.
 */
export class RateLimitRegistry extends EventEmitter {
  private states: Map<string, ProviderRateLimitState> = new Map();
  private maxConcurrency: number;
  private minConcurrency: number;
  private queueTimeoutMs: number;
  private enabled: boolean;

  constructor(options: RateLimitRegistryOptions) {
    super();
    this.maxConcurrency = options.maxConcurrency;
    this.minConcurrency = options.minConcurrency ?? getEnvInt('PROMPTFOO_MIN_CONCURRENCY', 1);
    // Queue timeout: 0 means disabled, default is 5 minutes
    this.queueTimeoutMs =
      options.queueTimeoutMs ?? getEnvInt('PROMPTFOO_SCHEDULER_QUEUE_TIMEOUT_MS', 5 * 60 * 1000);
    this.enabled = !getEnvBool('PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER', false);
  }

  /**
   * Execute a provider call with rate limiting and retries.
   *
   * Note: No idempotency tracking. Each call is independent.
   * The single integration point (evaluator) ensures no double-wrapping.
   */
  async execute<T>(
    provider: ApiProvider,
    callFn: () => Promise<T>,
    options?: {
      getHeaders?: (result: T) => Record<string, string> | undefined;
      isRateLimited?: (result: T | undefined, error?: Error) => boolean;
      getRetryAfter?: (result: T | undefined, error?: Error) => number | undefined;
    },
  ): Promise<T> {
    // If disabled, just call directly
    if (!this.enabled) {
      return callFn();
    }

    const rateLimitKey = getRateLimitKey(provider);
    const state = this.getOrCreateState(rateLimitKey);

    // Generate unique request ID for metrics/logging
    const requestId = `${rateLimitKey}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    this.emit('request:started', {
      rateLimitKey,
      requestId,
      queueDepth: state.getQueueDepth(),
    });

    try {
      const result = await state.executeWithRetry(requestId, callFn, {
        getHeaders: options?.getHeaders,
        isRateLimited: options?.isRateLimited,
        getRetryAfter: options?.getRetryAfter,
      });

      this.emit('request:completed', {
        rateLimitKey,
        requestId,
      });

      return result;
    } catch (error) {
      this.emit('request:failed', {
        rateLimitKey,
        requestId,
        error: String(error),
      });
      throw error;
    }
  }

  /**
   * Get or create provider rate limit state for a given rate limit key.
   */
  private getOrCreateState(rateLimitKey: string): ProviderRateLimitState {
    if (!this.states.has(rateLimitKey)) {
      const state = new ProviderRateLimitState({
        rateLimitKey,
        maxConcurrency: this.maxConcurrency,
        minConcurrency: this.minConcurrency,
        queueTimeoutMs: this.queueTimeoutMs,
      });

      // Forward events
      state.on('ratelimit:hit', (data) => this.emit('ratelimit:hit', data));
      state.on('ratelimit:warning', (data) => this.emit('ratelimit:warning', data));
      state.on('ratelimit:learned', (data) => this.emit('ratelimit:learned', data));
      state.on('concurrency:increased', (data) => this.emit('concurrency:increased', data));
      state.on('concurrency:decreased', (data) => this.emit('concurrency:decreased', data));
      state.on('request:retrying', (data) => this.emit('request:retrying', data));

      this.states.set(rateLimitKey, state);
    }

    return this.states.get(rateLimitKey)!;
  }

  /**
   * Get metrics for all tracked providers.
   */
  getMetrics(): Record<string, ProviderMetrics> {
    const metrics: Record<string, ProviderMetrics> = {};
    for (const [key, state] of this.states) {
      metrics[key] = state.getMetrics();
    }
    return metrics;
  }

  /**
   * Cleanup all resources.
   */
  dispose(): void {
    for (const state of this.states.values()) {
      state.dispose();
    }
    this.states.clear();
    this.removeAllListeners();
  }
}

/**
 * Factory function to create a registry for an evaluation.
 */
export function createRateLimitRegistry(options: RateLimitRegistryOptions): RateLimitRegistry {
  return new RateLimitRegistry(options);
}
