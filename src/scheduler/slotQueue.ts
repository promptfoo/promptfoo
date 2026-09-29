import type { ParsedRateLimitHeaders } from './headerParser';

interface QueuedRequest {
  id: string;
  resolve: () => void;
  reject: (error: Error) => void;
  queuedAt: number;
}

export interface SlotQueueOptions {
  maxConcurrency: number;
  minConcurrency: number;
  queueTimeoutMs?: number; // Optional timeout for queued requests
  onSlotAcquired?: (queueDepth: number) => void;
  onSlotReleased?: (queueDepth: number) => void;
}

const DEFAULT_QUEUE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Manages concurrency slots with FIFO queue for waiting requests.
 *
 * Race condition prevention:
 * - All slot allocation goes through the queue
 * - processQueue() is synchronous and runs atomically
 * - No await between capacity check and increment
 */
export class SlotQueue {
  private activeCount = 0;
  private maxConcurrency: number;
  private minConcurrency: number;
  private waiting: QueuedRequest[] = [];
  private resetTimer: NodeJS.Timeout | null = null;
  private queueTimeoutMs: number;

  // Rate limit state
  private resetAt: number | null = null;
  private remainingRequests: number | null = null;
  private remainingTokens: number | null = null;
  private requestLimit: number | null = null;
  private tokenLimit: number | null = null;

  private onSlotAcquired?: (queueDepth: number) => void;
  private onSlotReleased?: (queueDepth: number) => void;

  constructor(options: SlotQueueOptions) {
    this.maxConcurrency = options.maxConcurrency;
    this.minConcurrency = options.minConcurrency;
    this.queueTimeoutMs = options.queueTimeoutMs ?? DEFAULT_QUEUE_TIMEOUT_MS;
    this.onSlotAcquired = options.onSlotAcquired;
    this.onSlotReleased = options.onSlotReleased;
  }

  /**
   * Acquire a slot. All requests go through the queue to prevent race conditions.
   * Returns when a slot is available and quota is not exhausted.
   */
  async acquire(requestId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const queuedAt = Date.now();

      // Set up timeout for queued request
      let timeoutId: NodeJS.Timeout | null = null;
      if (this.queueTimeoutMs > 0) {
        timeoutId = setTimeout(() => {
          // Remove from queue
          const idx = this.waiting.findIndex((r) => r.id === requestId);
          if (idx !== -1) {
            this.waiting.splice(idx, 1);
            reject(
              new Error(`Request ${requestId} timed out after ${this.queueTimeoutMs}ms in queue`),
            );
          }
        }, this.queueTimeoutMs);
      }

      const wrappedResolve = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        this.activeCount++;
        this.onSlotAcquired?.(this.waiting.length);
        resolve();
      };

      const wrappedReject = (error: Error) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        reject(error);
      };

      // Always queue the request
      this.waiting.push({
        id: requestId,
        resolve: wrappedResolve,
        reject: wrappedReject,
        queuedAt,
      });

      // Immediately try to process queue (synchronous, no race)
      this.processQueue();
    });
  }

  /**
   * Release a slot and process next queued request.
   */
  release(): void {
    if (this.activeCount <= 0) {
      // Prevent negative activeCount from unpaired release() calls
      return;
    }
    this.activeCount--;
    this.onSlotReleased?.(this.waiting.length);
    this.processQueue();
  }

  /**
   * Update rate limit state from parsed headers.
   */
  updateRateLimitState(parsed: ParsedRateLimitHeaders): void {
    if (parsed.remainingRequests !== undefined) {
      this.remainingRequests = parsed.remainingRequests;
    }
    if (parsed.limitRequests !== undefined) {
      this.requestLimit = parsed.limitRequests;
    }
    if (parsed.remainingTokens !== undefined) {
      this.remainingTokens = parsed.remainingTokens;
    }
    if (parsed.limitTokens !== undefined) {
      this.tokenLimit = parsed.limitTokens;
    }
    if (parsed.resetAt !== undefined) {
      this.resetAt = parsed.resetAt;
      this.scheduleResetProcessing();
    }
  }

  /**
   * Mark that a rate limit was hit.
   * Only updates resetAt if we don't already have a later reset time.
   */
  markRateLimited(retryAfterMs?: number): void {
    this.remainingRequests = 0;
    this.remainingTokens = 0;

    // Only update resetAt if:
    // 1. We have a retryAfterMs >= 0, OR
    // 2. We don't have an existing resetAt
    if (retryAfterMs !== undefined && retryAfterMs >= 0) {
      // retryAfterMs = 0 means "retry immediately", so resetAt = now
      const newResetAt = Date.now() + retryAfterMs;
      // Use the later of existing or new reset time
      this.resetAt = this.resetAt ? Math.max(this.resetAt, newResetAt) : newResetAt;
    } else if (!this.resetAt) {
      // No retryAfter provided and no existing reset - use conservative default
      this.resetAt = Date.now() + 60000;
    }
    // If we have an existing resetAt and no retryAfterMs, keep existing

    this.scheduleResetProcessing();
  }

  /**
   * Adjust max concurrency (called by adaptive algorithm).
   */
  setMaxConcurrency(value: number): void {
    this.maxConcurrency = Math.max(this.minConcurrency, value);
    // If we now have capacity, process queue
    this.processQueue();
  }

  getMaxConcurrency(): number {
    return this.maxConcurrency;
  }

  getActiveCount(): number {
    return this.activeCount;
  }

  getQueueDepth(): number {
    return this.waiting.length;
  }

  getResetAt(): number | null {
    return this.resetAt;
  }

  /**
   * Check if quota is exhausted (should wait for reset).
   * Checks BOTH request AND token quotas.
   *
   * NOTE: This method has intentional side effects - it clears stale quota state
   * when the reset time has passed. This ensures we don't block indefinitely on
   * outdated rate limit info.
   */
  private isQuotaExhausted(): boolean {
    const now = Date.now();

    // Check if reset time has passed - clear stale state if so
    if (this.resetAt && now >= this.resetAt) {
      this.remainingRequests = null;
      this.remainingTokens = null;
      this.resetAt = null;
      return false;
    }

    // Request quota exhausted
    if (this.remainingRequests !== null && this.remainingRequests <= 0) {
      if (this.resetAt && now < this.resetAt) {
        return true;
      }
    }

    // Token quota exhausted
    if (this.remainingTokens !== null && this.remainingTokens <= 0) {
      if (this.resetAt && now < this.resetAt) {
        return true;
      }
    }

    return false;
  }

  /**
   * Schedule queue processing when rate limit window resets.
   */
  private scheduleResetProcessing(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }

    if (this.resetAt && this.waiting.length > 0) {
      const delay = Math.max(0, this.resetAt - Date.now());
      this.resetTimer = setTimeout(() => {
        // Clear exhausted state
        this.remainingRequests = null;
        this.remainingTokens = null;
        this.resetAt = null;
        this.processQueue();
      }, delay);
    }
  }

  /**
   * Process queued requests up to available capacity.
   * SYNCHRONOUS - no awaits, prevents race conditions.
   */
  private processQueue(): void {
    while (
      this.waiting.length > 0 &&
      this.activeCount < this.maxConcurrency &&
      !this.isQuotaExhausted()
    ) {
      const request = this.waiting.shift()!;
      request.resolve();
    }

    // If queue still has items and we're quota exhausted, ensure reset is scheduled
    if (this.waiting.length > 0 && this.isQuotaExhausted()) {
      this.scheduleResetProcessing();
    }
  }

  /**
   * Check if approaching rate limit (for proactive throttling).
   * Returns ratio of remaining/limit, or null if unknown.
   */
  getRemainingRatio(): { requests: number | null; tokens: number | null } {
    let requestRatio: number | null = null;
    let tokenRatio: number | null = null;

    if (this.remainingRequests !== null && this.requestLimit !== null && this.requestLimit > 0) {
      requestRatio = this.remainingRequests / this.requestLimit;
    }

    if (this.remainingTokens !== null && this.tokenLimit !== null && this.tokenLimit > 0) {
      tokenRatio = this.remainingTokens / this.tokenLimit;
    }

    return { requests: requestRatio, tokens: tokenRatio };
  }

  /**
   * Cleanup resources.
   *
   * Rejects any pending acquire() promises with 'Queue disposed' error.
   * Callers should handle these rejections (e.g., via .catch() on acquire promises).
   */
  dispose(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
    // Reject any waiting requests
    const waiting = this.waiting;
    this.waiting = [];
    for (const request of waiting) {
      request.reject(new Error('Queue disposed'));
    }
  }
}
