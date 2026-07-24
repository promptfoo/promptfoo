import {
  AdaptiveConcurrency,
  type ConcurrencyChangeResult,
  WARNING_THRESHOLD,
} from './adaptiveConcurrency';
import { parseRateLimitHeaders } from './headerParser';
import { DEFAULT_RETRY_POLICY, getRetryDelay, type RetryPolicy, shouldRetry } from './retryPolicy';
import { SlotQueue } from './slotQueue';

/**
 * Sentinel error for rate limit exhaustion.
 * Used to short-circuit the catch block and prevent double-release/double-count.
 */
class RateLimitExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitExhaustedError';
  }
}

export interface ProviderStateOptions {
  rateLimitKey: string;
  maxConcurrency: number;
  minConcurrency: number;
  queueTimeoutMs?: number;
  retryPolicy?: RetryPolicy;
  onDebug?: (message: string, context: Record<string, unknown>) => void;
}

/**
 * Manages rate limit state and retry logic for a single rate limit key.
 */
export class ProviderRateLimitState {
  readonly rateLimitKey: string;
  private slotQueue: SlotQueue;
  private adaptiveConcurrency: AdaptiveConcurrency;
  private retryPolicy: RetryPolicy;
  private onDebug: ProviderStateOptions['onDebug'];

  private hasLearnedLimits = false;

  constructor(options: ProviderStateOptions) {
    this.rateLimitKey = options.rateLimitKey;
    this.retryPolicy = options.retryPolicy ?? DEFAULT_RETRY_POLICY;
    this.onDebug = options.onDebug;

    this.adaptiveConcurrency = new AdaptiveConcurrency(
      options.maxConcurrency,
      options.minConcurrency,
    );

    this.slotQueue = new SlotQueue({
      maxConcurrency: options.maxConcurrency,
      minConcurrency: options.minConcurrency,
      queueTimeoutMs: options.queueTimeoutMs,
    });
  }

  /**
   * Execute a call with rate limiting and retry logic.
   */
  async executeWithRetry<T>(
    requestId: string,
    callFn: () => Promise<T>,
    options: {
      getHeaders?: (result: T) => Record<string, string> | undefined;
      isRateLimited?: (result: T | undefined, error?: Error) => boolean;
      getRetryAfter?: (result: T | undefined, error?: Error) => number | undefined;
      /**
       * Per-call override for `maxRetries` only. Preserves the state's other
       * policy fields (backoff, jitter) so provider config cannot silently
       * reset them.
       */
      maxRetriesOverride?: number;
    },
  ): Promise<T> {
    let attempt = 0;
    const retryPolicy =
      options.maxRetriesOverride === undefined
        ? this.retryPolicy
        : { ...this.retryPolicy, maxRetries: options.maxRetriesOverride };

    while (true) {
      await this.slotQueue.acquire(`${requestId}-${attempt}`);

      try {
        const result = await callFn();

        // Extract headers and check for rate limit
        const headers = options.getHeaders?.(result);
        const isRateLimited = options.isRateLimited?.(result, undefined) ?? false;
        const retryAfterMs = options.getRetryAfter?.(result, undefined);

        // Update state from headers BEFORE releasing slot
        if (headers) {
          this.updateFromHeaders(headers, isRateLimited);
        }

        // Release slot
        this.slotQueue.release();

        if (isRateLimited) {
          this.handleRateLimit(retryAfterMs);

          // Check if we should retry
          if (shouldRetry(attempt, undefined, true, retryPolicy)) {
            attempt++;
            const delay = getRetryDelay(attempt, retryPolicy, retryAfterMs);

            await this.sleep(delay);
            continue;
          }

          // The sentinel prevents the catch block from releasing the same slot twice.
          throw new RateLimitExhaustedError(
            `Rate limit exceeded for ${this.rateLimitKey} after ${attempt + 1} attempts`,
          );
        }

        // Success
        this.handleSuccess();
        return result;
      } catch (error) {
        // Re-throw sentinel error immediately to prevent double-release/double-count
        if (error instanceof RateLimitExhaustedError) {
          throw error;
        }

        const lastError = error as Error;

        // Release slot
        this.slotQueue.release();

        // Check if rate limited (from error, not result)
        const isRateLimited =
          options.isRateLimited?.(undefined, lastError) ?? this.isRateLimitError(lastError);
        const retryAfterMs = options.getRetryAfter?.(undefined, lastError);

        if (isRateLimited) {
          this.handleRateLimit(retryAfterMs);
        }

        // Check if we should retry
        if (shouldRetry(attempt, lastError, isRateLimited, retryPolicy)) {
          attempt++;
          const delay = getRetryDelay(attempt, retryPolicy, retryAfterMs);

          await this.sleep(delay);
          continue;
        }

        // No more retries
        throw lastError;
      }
    }
  }

  /**
   * Update state from response headers.
   * @param headers - Response headers
   * @param isRateLimited - Whether the response indicates a rate limit (e.g., HTTP 429).
   *   When false, retry-after headers are ignored to prevent incorrectly blocking the
   *   queue on successful responses from providers/proxies that include these headers.
   */
  private updateFromHeaders(headers: Record<string, string>, isRateLimited: boolean): void {
    const parsed = parseRateLimitHeaders(headers);

    if (
      !this.hasLearnedLimits &&
      (parsed.limitRequests !== undefined || parsed.limitTokens !== undefined)
    ) {
      this.hasLearnedLimits = true;
      this.onDebug?.(`[Scheduler] Learned rate limits for ${this.rateLimitKey}`, {
        requestLimit: parsed.limitRequests,
        tokenLimit: parsed.limitTokens,
      });
    }

    // Update slot queue with new state (remaining counts, limits, reset times)
    this.slotQueue.updateRateLimitState(parsed);

    // Only apply retry-after as a rate limit enforcement when the response is actually
    // rate-limited. This prevents incorrectly blocking the queue if a provider or proxy
    // includes retry-after headers in successful (200) responses.
    if (isRateLimited && parsed.retryAfterMs !== undefined) {
      this.slotQueue.markRateLimited(parsed.retryAfterMs);
    }

    // Check for proactive throttling
    const ratios = this.slotQueue.getRemainingRatio();
    const minRatio = Math.min(ratios.requests ?? 1, ratios.tokens ?? 1);

    if (minRatio < WARNING_THRESHOLD) {
      this.applyConcurrencyChange(this.adaptiveConcurrency.recordApproachingLimit(minRatio));
    }
  }

  /**
   * Handle rate limit hit.
   * Delegates to SlotQueue which preserves existing resetAt from headers.
   */
  private handleRateLimit(retryAfterMs?: number): void {
    this.slotQueue.markRateLimited(retryAfterMs);

    const change = this.adaptiveConcurrency.recordRateLimit();
    this.applyConcurrencyChange(change);

    this.onDebug?.(`[Scheduler] Rate limit hit for ${this.rateLimitKey}`, {
      retryAfterMs,
      resetAt: this.slotQueue.getResetAt(),
      concurrencyChange: change,
    });
  }

  /**
   * Handle successful request.
   */
  private handleSuccess(): void {
    this.applyConcurrencyChange(this.adaptiveConcurrency.recordSuccess());
  }

  /**
   * Apply and log concurrency changes.
   */
  private applyConcurrencyChange(change: ConcurrencyChangeResult): void {
    if (change.changed) {
      this.slotQueue.setMaxConcurrency(change.current);
      const direction = change.reason === 'recovery' ? 'increased' : 'decreased';
      this.onDebug?.(`[Scheduler] Concurrency ${direction} for ${this.rateLimitKey}`, {
        previous: change.previous,
        current: change.current,
      });
    }
  }

  /**
   * Check if error is a rate limit error.
   */
  private isRateLimitError(error: Error): boolean {
    const message = (error.message ?? '').toLowerCase();
    return (
      message.includes('429') ||
      message.includes('rate limit') ||
      message.includes('too many requests')
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  dispose(): void {
    this.slotQueue.dispose();
  }
}
