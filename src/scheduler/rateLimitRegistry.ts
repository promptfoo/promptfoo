import { getEnvBool, getEnvInt } from '../envars';
import logger from '../logger';
import { withFetchRetryContext } from '../util/fetch/retryContext';
import { sanitizeProviderIdForLog } from '../util/provider';
import { ProviderRateLimitState } from './providerRateLimitState';
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
export class RateLimitRegistry {
  private states: Map<string, ProviderRateLimitState> = new Map();
  private maxConcurrency: number;
  private minConcurrency: number;
  private queueTimeoutMs: number;
  private enabled: boolean;
  private nextRequestId = 0;

  constructor(options: RateLimitRegistryOptions) {
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
    const providerMaxRetries = getProviderMaxRetries(provider);

    // Even when the scheduler is disabled, propagate the retry context so
    // `fetchWithRetries` picks up the provider's `maxRetries` as its default
    // and `fetchWithProxy` disables transient retries when `maxRetries: 0`.
    if (!this.enabled) {
      return withFetchRetryContext(providerMaxRetries, callFn);
    }

    const rateLimitKey = getRateLimitKey(provider);
    const state = this.getOrCreateState(rateLimitKey);

    const requestId = `${rateLimitKey}-${++this.nextRequestId}`;

    const run = () =>
      state.executeWithRetry(requestId, callFn, {
        getHeaders: options?.getHeaders,
        isRateLimited: options?.isRateLimited,
        getRetryAfter: options?.getRetryAfter,
        maxRetriesOverride: providerMaxRetries,
      });

    return withFetchRetryContext(providerMaxRetries, run);
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
        onDebug: (message, context) => logger.debug(message, context),
      });

      this.states.set(rateLimitKey, state);
    }

    return this.states.get(rateLimitKey)!;
  }

  /**
   * Cleanup all resources.
   */
  dispose(): void {
    for (const state of this.states.values()) {
      state.dispose();
    }
    this.states.clear();
  }
}

/**
 * Factory function to create a registry for an evaluation.
 */
export function createRateLimitRegistry(options: RateLimitRegistryOptions): RateLimitRegistry {
  return new RateLimitRegistry(options);
}

/**
 * Read the provider's configured maxRetries value, tolerating numeric strings
 * (e.g. from environment overrides) and rejecting invalid values.
 *
 * Returning `undefined` means "fall back to defaults" — distinct from `0`, which
 * means "disable retries". Invalid user-supplied values (negatives, floats,
 * non-numeric strings) are logged so config typos aren't silently ignored.
 */
function getProviderMaxRetries(provider: ApiProvider): number | undefined {
  const raw: unknown =
    provider.config && typeof provider.config === 'object'
      ? (provider.config as { maxRetries?: unknown }).maxRetries
      : undefined;

  if (raw === undefined) {
    return undefined;
  }

  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0) {
    return raw;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (/^\d+$/.test(trimmed)) {
      // Reject digit strings that overflow to Infinity or lose precision past
      // Number.MAX_SAFE_INTEGER — otherwise the retry loops would never
      // terminate (attempt < Infinity is always true).
      const parsed = Number(trimmed);
      if (Number.isSafeInteger(parsed)) {
        return parsed;
      }
    }
  }

  logger.warn(
    '[RateLimit] Ignoring invalid provider.config.maxRetries; expected a non-negative integer.',
    {
      maxRetries: raw,
      providerId: sanitizeProviderIdForLog(provider.id()),
    },
  );
  return undefined;
}
