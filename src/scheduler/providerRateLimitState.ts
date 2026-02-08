import { EventEmitter } from 'events';

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

/**
 * Circular buffer for latency tracking.
 * O(1) insertions instead of O(n) shift().
 */
class CircularBuffer {
  private buffer: number[];
  private head = 0;
  private count = 0;

  constructor(private capacity: number) {
    this.buffer = new Array(capacity);
  }

  push(value: number): void {
    this.buffer[this.head] = value;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  toSortedArray(): number[] {
    const result: number[] = [];
    for (let i = 0; i < this.count; i++) {
      const idx = (this.head - this.count + i + this.capacity) % this.capacity;
      result.push(this.buffer[idx]);
    }
    return result.sort((a, b) => a - b);
  }

  get length(): number {
    return this.count;
  }
}

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
  private latencies = new CircularBuffer(100);

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
    callFn: () => Promise<T>,
    options: {
      getHeaders?: (result: T) => Record<string, string> | undefined;
      isRateLimited?: (result: T | undefined, error?: Error) => boolean;
      getRetryAfter?: (result: T | undefined, error?: Error) => number | undefined;
    },
  ): Promise<T> {
    this.totalRequests++;
    let attempt = 0;
    let lastError: Error | undefined;

    while (true) {
      // Acquire slot (may wait for rate limit window via queue)
      // Queue timeout failures are counted as failed requests
      try {
        await this.slotQueue.acquire(`${requestId}-${attempt}`);
      } catch (acquireError) {
        // Queue timeout or other acquire failures
        this.failedRequests++;
        this.emit('queue:timeout', {
          rateLimitKey: this.rateLimitKey,
          requestId,
          error: String(acquireError),
        });
        throw acquireError;
      }

      const startTime = Date.now();

      try {
        const result = await callFn();
        const latencyMs = Date.now() - startTime;
        this.latencies.push(latencyMs);

        // Extract headers and check for rate limit
        const headers = options.getHeaders?.(result);
        const isRateLimited = options.isRateLimited?.(result, undefined) ?? false;
        const retryAfterMs = options.getRetryAfter?.(result, undefined);

        // Update state from headers BEFORE releasing slot
        if (headers) {
          this.updateFromHeaders(headers);
        }

        // Release slot
        this.slotQueue.release();

        if (isRateLimited) {
          this.handleRateLimit(retryAfterMs);

          // Check if we should retry
          if (shouldRetry(attempt, undefined, true, this.retryPolicy)) {
            attempt++;
            this.retriedRequests++;
            const delay = getRetryDelay(attempt, this.retryPolicy, retryAfterMs);

            this.emit('request:retrying', {
              rateLimitKey: this.rateLimitKey,
              attempt,
              delayMs: delay,
              reason: 'ratelimit',
            });

            await this.sleep(delay);
            continue;
          }

          // Rate limited and no more retries - count as FAILED, throw sentinel error
          // Using sentinel error to prevent catch block from double-releasing/double-counting
          this.failedRequests++;
          throw new RateLimitExhaustedError(
            `Rate limit exceeded for ${this.rateLimitKey} after ${attempt + 1} attempts`,
          );
        }

        // Success
        this.handleSuccess();
        this.completedRequests++;
        return result;
      } catch (error) {
        // Re-throw sentinel error immediately to prevent double-release/double-count
        if (error instanceof RateLimitExhaustedError) {
          throw error;
        }

        const latencyMs = Date.now() - startTime;
        this.latencies.push(latencyMs);

        lastError = error as Error;

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
        if (shouldRetry(attempt, lastError, isRateLimited, this.retryPolicy)) {
          attempt++;
          this.retriedRequests++;
          const delay = getRetryDelay(attempt, this.retryPolicy, retryAfterMs);

          this.emit('request:retrying', {
            rateLimitKey: this.rateLimitKey,
            attempt,
            delayMs: delay,
            reason: isRateLimited ? 'ratelimit' : 'error',
          });

          await this.sleep(delay);
          continue;
        }

        // No more retries
        this.failedRequests++;
        throw lastError;
      }
    }
  }

  /**
   * Update state from response headers.
   */
  private updateFromHeaders(headers: Record<string, string>): void {
    const parsed = parseRateLimitHeaders(headers);

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

    // Update slot queue with new state
    this.slotQueue.updateRateLimitState(parsed);

    // If headers include retry-after-ms, apply it immediately
    if (parsed.retryAfterMs !== undefined) {
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
  private handleRateLimit(retryAfterMs?: number): void {
    this.rateLimitHits++;

    // Pass retryAfterMs to queue (may be undefined)
    // SlotQueue.markRateLimited preserves existing resetAt from headers if no retryAfter provided
    this.slotQueue.markRateLimited(retryAfterMs);

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
   * Handle successful request.
   */
  private handleSuccess(): void {
    this.applyConcurrencyChange(this.adaptiveConcurrency.recordSuccess());
  }

  /**
   * Apply concurrency change and emit appropriate event.
   */
  private applyConcurrencyChange(change: ConcurrencyChangeResult): void {
    if (change.changed) {
      this.slotQueue.setMaxConcurrency(change.current);
      const eventName =
        change.reason === 'recovery' ? 'concurrency:increased' : 'concurrency:decreased';
      this.emit(eventName, {
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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current queue depth without sorting latencies.
   * Use this for frequent checks instead of getMetrics().
   */
  getQueueDepth(): number {
    return this.slotQueue.getQueueDepth();
  }

  getMetrics(): ProviderMetrics {
    const sorted = this.latencies.toSortedArray();
    const avgLatency = sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;

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
      avgLatencyMs: avgLatency,
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
