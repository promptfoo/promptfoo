import { EventEmitter } from 'events';

import {
  createResponseHeadersObserver,
  isResponseHeadersObserverError,
  isResponseHeadersObserverErrorResponse,
  type ResponseHeadersObserver,
} from '../util/fetch/responseHeadersObserver';
import {
  AdaptiveConcurrency,
  type ConcurrencyChangeResult,
  WARNING_THRESHOLD,
} from './adaptiveConcurrency';
import { sleepWithAbort, throwIfAborted } from './cancellation';
import { parseRateLimitHeaders } from './headerParser';
import { DEFAULT_RETRY_POLICY, getRetryDelay, type RetryPolicy, shouldRetry } from './retryPolicy';
import { SlotQueue } from './slotQueue';

import type { RateLimitExecuteOptions } from './types';

export class RateLimitExhaustedError extends Error {
  constructor(
    message: string,
    readonly result: unknown,
  ) {
    super(message);
    this.name = 'RateLimitExhaustedError';
  }
}

/**
 * Wraps a finalizeResult throw so the retry classifier below skips it: a
 * finalizer failure is not provider work and must never trigger another call.
 */
class ResultFinalizationError extends Error {
  constructor(readonly original: unknown) {
    super('finalizeResult failed');
    this.name = 'ResultFinalizationError';
  }
}

export interface ProviderStateOptions {
  rateLimitKey: string;
  maxConcurrency: number;
  minConcurrency: number;
  queueTimeoutMs?: number;
  retryPolicy?: RetryPolicy;
}

export interface ProviderMetrics {
  rateLimitKey: string;
  activeRequests: number;
  maxConcurrency: number;
  queueDepth: number;
  totalRequests: number;
  completedRequests: number;
  failedRequests: number;
  rateLimitHits: number;
  retriedRequests: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p99LatencyMs: number;
}

type ProviderExecuteOptions<T> = RateLimitExecuteOptions<T> & {
  /**
   * Per-call override for `maxRetries` only. Preserves the state's other
   * policy fields (backoff, jitter) so provider config cannot silently
   * reset them.
   */
  maxRetriesOverride?: number;
};

/**
 * Manages rate limit state and retry logic for a single rate limit key.
 */
export class ProviderRateLimitState extends EventEmitter {
  readonly rateLimitKey: string;
  private slotQueue: SlotQueue;
  private adaptiveConcurrency: AdaptiveConcurrency;
  private retryPolicy: RetryPolicy;

  // Metrics
  private totalRequests = 0;
  private completedRequests = 0;
  private failedRequests = 0;
  private rateLimitHits = 0;
  private retriedRequests = 0;
  /** Keep the latest 100 latency measurements for bounded metric sorting and storage. */
  private latencies: number[] = [];

  // Track if we've emitted ratelimit:learned for this provider
  private hasLearnedLimits = false;

  constructor(options: ProviderStateOptions) {
    super();
    this.rateLimitKey = options.rateLimitKey;
    this.retryPolicy = options.retryPolicy ?? DEFAULT_RETRY_POLICY;

    this.adaptiveConcurrency = new AdaptiveConcurrency(
      options.maxConcurrency,
      options.minConcurrency,
    );

    this.slotQueue = new SlotQueue({
      maxConcurrency: options.maxConcurrency,
      minConcurrency: options.minConcurrency,
      queueTimeoutMs: options.queueTimeoutMs,
      onSlotAcquired: (queueDepth) => {
        this.emit('slot:acquired', { rateLimitKey: this.rateLimitKey, queueDepth });
      },
      onSlotReleased: (queueDepth) => {
        this.emit('slot:released', { rateLimitKey: this.rateLimitKey, queueDepth });
      },
    });
  }

  /**
   * Execute a call with rate limiting and retry logic.
   */
  async executeWithRetry<T>(
    requestId: string,
    callFn: (onResponseHeaders?: ResponseHeadersObserver) => Promise<T>,
    options: ProviderExecuteOptions<T>,
  ): Promise<T> {
    this.totalRequests++;
    let attempt = 0;
    const retryResults: T[] = [];
    const retryPolicy =
      options.maxRetriesOverride === undefined
        ? this.retryPolicy
        : { ...this.retryPolicy, maxRetries: options.maxRetriesOverride };

    try {
      while (true) {
        try {
          await this.slotQueue.acquire(`${requestId}-${attempt}`, options.abortSignal);
        } catch (acquireError) {
          this.emit(options.abortSignal?.aborted ? 'queue:cancelled' : 'queue:timeout', {
            rateLimitKey: this.rateLimitKey,
            requestId,
            error: String(acquireError),
          });
          throw acquireError;
        }

        // A result can release its slot before retry backoff. Only this owner may
        // release it, including aborts between the grant and callFn invocation.
        let ownsSlot = true;
        let observedHeaders: Record<string, string> | undefined;
        const onResponseHeaders = createResponseHeadersObserver(
          this,
          ([headers, backoff], alreadyObserved) => {
            if (ownsSlot) {
              if (backoff) {
                if (!alreadyObserved) {
                  // The lower target fetch selected this deadline before its wait.
                  // Replaying relative headers when a consumer joins would extend it.
                  this.updateFromHeaders(headers, false, backoff.resetAt);
                  this.handleRateLimit(undefined, backoff.resetAt);
                }
              } else {
                observedHeaders = headers;
                if (!alreadyObserved) {
                  this.updateFromHeaders(headers, false);
                }
              }
              return true;
            }
            return alreadyObserved;
          },
        );
        const releaseSlot = () => {
          if (ownsSlot) {
            ownsSlot = false;
            this.slotQueue.release();
          }
        };
        const startTime = Date.now();
        let retryError: Error | undefined;
        let retryResult: T | undefined;
        let isRateLimited: boolean;
        let isRetryableResult = false;
        let retryAfterMs: number | undefined;

        try {
          throwIfAborted(options.abortSignal);
          const result = await callFn(onResponseHeaders);
          retryResult = result;
          const hasErrorResponse =
            result !== null &&
            typeof result === 'object' &&
            'error' in result &&
            typeof result.error === 'string' &&
            result.error.length > 0;
          const hasRefusalResponse =
            result !== null &&
            typeof result === 'object' &&
            'isRefusal' in result &&
            result.isRefusal === true;
          const headers = options.getHeaders?.(result);
          const isObserverError = isResponseHeadersObserverErrorResponse(result);
          isRateLimited =
            options.canRetry?.() !== false &&
            !isObserverError &&
            (options.isRateLimited?.(result, undefined) ?? false);
          isRetryableResult =
            options.canRetry?.() !== false &&
            !isObserverError &&
            (options.isRetryableResult?.(result) ?? false);
          retryAfterMs = options.getRetryAfter?.(result, undefined);

          // Observer diagnostics may carry another service's headers. Keep the
          // actual wire quota already learned by onResponseHeaders instead.
          if (!isObserverError && headers && (headers !== observedHeaders || isRateLimited)) {
            this.updateFromHeaders(headers, isRateLimited);
          }
          if (isRateLimited) {
            this.handleRateLimit(retryAfterMs);
          }
          // Completed calls retain their result and quota even if cancellation arrived
          // during completion. Cancellation still prevents another attempt.
          if (this.latencies.push(Date.now() - startTime) > 100) {
            this.latencies.shift();
          }
          releaseSlot();

          // Keep an independent failure's diagnostic and metadata intact, but
          // never retry it once the caller has cancelled.
          if (options.abortSignal?.aborted && hasErrorResponse) {
            this.failedRequests++;
            return result;
          }

          if (
            (!isRateLimited && !isRetryableResult) ||
            (options.abortSignal?.aborted && hasRefusalResponse)
          ) {
            let finalizedResult: T;
            try {
              finalizedResult = options.finalizeResult?.(result, retryResults) ?? result;
            } catch (finalizerError) {
              throw new ResultFinalizationError(finalizerError);
            }
            this.applyConcurrencyChange(this.adaptiveConcurrency.recordSuccess());
            this.completedRequests++;
            return finalizedResult;
          }
        } catch (error) {
          if (ownsSlot) {
            if (this.latencies.push(Date.now() - startTime) > 100) {
              this.latencies.shift();
            }
          }

          if (isResponseHeadersObserverError(onResponseHeaders, error)) {
            throw error;
          }

          if (error instanceof ResultFinalizationError) {
            throw error.original;
          }

          // Cancellation is final, even for a custom reason or a message that
          // resembles a retryable error. Preserve unrelated provider errors.
          if (
            (options.abortSignal?.aborted &&
              (error === options.abortSignal.reason || !(error instanceof Error))) ||
            (error instanceof Error &&
              (error.name === 'AbortError' || error.name === 'AbortException'))
          ) {
            throw error;
          }

          retryError = error as Error;
          isRateLimited =
            options.canRetry?.() !== false &&
            (options.isRateLimited?.(undefined, retryError) ?? this.isRateLimitError(retryError));
          retryAfterMs = options.getRetryAfter?.(undefined, retryError);
          if (isRateLimited) {
            this.handleRateLimit(retryAfterMs);
          }
          if (options.abortSignal?.aborted) {
            throw error;
          }
        } finally {
          releaseSlot();
        }

        if (
          options.canRetry?.() === false ||
          !shouldRetry(attempt, retryError, isRateLimited || isRetryableResult, retryPolicy)
        ) {
          if (retryError) {
            throw retryError;
          }
          if (isRetryableResult) {
            // Transient-availability exhaustion returns the terminal result with
            // bounded retry usage merged, not the rate-limit sentinel.
            const finalizedResult =
              options.finalizeResult?.(retryResult as T, retryResults) ?? (retryResult as T);
            this.failedRequests++;
            return finalizedResult;
          }
          if (!options.onRateLimitExhausted && options.finalizeResult) {
            // A bare finalizeResult keeps the older structured-return behavior;
            // the registry's onRateLimitExhausted contract throws to convert.
            const finalizedResult = options.finalizeResult(retryResult as T, retryResults);
            this.failedRequests++;
            return finalizedResult;
          }
          throw new RateLimitExhaustedError(
            `Rate limit exceeded for ${this.rateLimitKey} after ${attempt + 1} attempts`,
            retryResult,
          );
        }

        // Only transient-availability retries feed the terminal merge; a
        // rate-limited retry must surface the last raw result as-is.
        if (isRetryableResult && retryResult !== undefined) {
          retryResults.push(retryResult);
        }

        attempt++;
        const delay = this.recordRetry(
          attempt,
          retryPolicy,
          retryAfterMs,
          isRateLimited ? 'ratelimit' : 'error',
        );

        // Both result and exception retries wait after their slot is released.
        await sleepWithAbort(delay, options.abortSignal);
      }
    } catch (error) {
      this.failedRequests++;
      throw error;
    }
  }

  private recordRetry(
    attempt: number,
    retryPolicy: RetryPolicy,
    retryAfterMs: number | undefined,
    reason: 'ratelimit' | 'error',
  ): number {
    this.retriedRequests++;
    const delayMs = getRetryDelay(attempt, retryPolicy, retryAfterMs);
    this.emit('request:retrying', {
      rateLimitKey: this.rateLimitKey,
      attempt,
      delayMs,
      reason,
    });
    return delayMs;
  }

  /**
   * Update state from response headers.
   * @param headers - Response headers
   * @param isRateLimited - Whether the response indicates a rate limit (e.g., HTTP 429).
   *   When false, retry-after headers are ignored to prevent incorrectly blocking the
   *   queue on successful responses from providers/proxies that include these headers.
   */
  private updateFromHeaders(
    headers: Record<string, string>,
    isRateLimited: boolean,
    selectedResetAt?: number,
  ): void {
    const parsed = parseRateLimitHeaders(headers);
    if (selectedResetAt !== undefined) {
      const existingResetAt = this.slotQueue.getResetAt();
      // A selected backoff must not shorten quota learned by a concurrent call.
      // Fresh successful responses still replace quota through the normal path.
      parsed.resetAt =
        existingResetAt !== null && existingResetAt > Date.now()
          ? Math.max(existingResetAt, selectedResetAt)
          : selectedResetAt;
    }

    // Emit ratelimit:learned only once per provider when we first see limit headers
    if (
      !this.hasLearnedLimits &&
      (parsed.limitRequests !== undefined || parsed.limitTokens !== undefined)
    ) {
      this.hasLearnedLimits = true;
      this.emit('ratelimit:learned', {
        rateLimitKey: this.rateLimitKey,
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
      this.emit('ratelimit:warning', {
        rateLimitKey: this.rateLimitKey,
        requestRatio: ratios.requests,
        tokenRatio: ratios.tokens,
      });

      // Proactive concurrency reduction
      this.applyConcurrencyChange(this.adaptiveConcurrency.recordApproachingLimit(minRatio));
    }
  }

  /**
   * Handle rate limit hit.
   * Delegates to SlotQueue which preserves existing resetAt from headers.
   */
  private handleRateLimit(retryAfterMs?: number, selectedResetAt?: number): void {
    this.rateLimitHits++;

    // Proactive queue processing may already have cleared an elapsed deadline.
    // Keep the selected timestamp explicit so it cannot become unknown quota.
    this.slotQueue.markRateLimited(retryAfterMs, selectedResetAt);

    const change = this.adaptiveConcurrency.recordRateLimit();
    this.applyConcurrencyChange(change);

    this.emit('ratelimit:hit', {
      rateLimitKey: this.rateLimitKey,
      retryAfterMs,
      resetAt: this.slotQueue.getResetAt(),
      concurrencyChange: change,
    });
  }

  /**
   * Apply concurrency change and emit appropriate event.
   */
  private applyConcurrencyChange(change: ConcurrencyChangeResult): void {
    if (change.changed) {
      this.slotQueue.setMaxConcurrency(change.current);
      this.emit(change.reason === 'recovery' ? 'concurrency:increased' : 'concurrency:decreased', {
        rateLimitKey: this.rateLimitKey,
        ...change,
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

  /**
   * Get current queue depth without sorting latencies.
   * Use this for frequent checks instead of getMetrics().
   */
  getQueueDepth(): number {
    return this.slotQueue.getQueueDepth();
  }

  getMetrics(): ProviderMetrics {
    const sorted = [...this.latencies].sort((a, b) => a - b);

    return {
      rateLimitKey: this.rateLimitKey,
      activeRequests: this.slotQueue.getActiveCount(),
      maxConcurrency: this.slotQueue.getMaxConcurrency(),
      queueDepth: this.slotQueue.getQueueDepth(),
      totalRequests: this.totalRequests,
      completedRequests: this.completedRequests,
      failedRequests: this.failedRequests,
      rateLimitHits: this.rateLimitHits,
      retriedRequests: this.retriedRequests,
      avgLatencyMs: sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0,
      // Percentiles: for n elements, pX is at index floor((n-1) * X/100)
      p50LatencyMs: sorted[Math.floor((sorted.length - 1) * 0.5)] ?? 0,
      p99LatencyMs: sorted[Math.floor((sorted.length - 1) * 0.99)] ?? 0,
    };
  }

  dispose(): void {
    this.slotQueue.dispose();
    this.removeAllListeners();
  }
}
