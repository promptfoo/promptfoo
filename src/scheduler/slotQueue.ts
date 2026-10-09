import type { ParsedRateLimitHeaders } from './headerParser';

interface QueuedRequest {
  id: string;
  resolve: () => void;
  reject: (error: unknown) => void;
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
  private resetAtRequests: number | null = null;
  private resetAtTokens: number | null = null;
  private rateLimitedUntil: number | null = null;
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
   * Returns when a slot is available and quota is not exhausted. An aborted signal stops
   * the request from waiting, but a slot that is free immediately is still granted.
   */
  async acquire(requestId: string, abortSignal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const queuedAt = Date.now();
      let timeoutId: NodeJS.Timeout | null = null;
      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        abortSignal?.removeEventListener('abort', onAbort);
      };
      const removeAndReject = (error: unknown) => {
        const index = this.waiting.indexOf(request);
        if (index !== -1) {
          this.waiting.splice(index, 1);
          request.reject(error);
          this.processQueue();
        }
      };
      const onAbort = () => removeAndReject(abortSignal?.reason);
      const request: QueuedRequest = {
        id: requestId,
        queuedAt,
        resolve: () => {
          cleanup();
          this.activeCount++;
          this.onSlotAcquired?.(this.waiting.length);
          resolve();
        },
        reject: (error) => {
          cleanup();
          reject(error);
        },
      };

      if (this.queueTimeoutMs > 0) {
        timeoutId = setTimeout(
          () =>
            removeAndReject(
              new Error(`Request ${requestId} timed out after ${this.queueTimeoutMs}ms in queue`),
            ),
          this.queueTimeoutMs,
        );
      }
      this.waiting.push(request);
      abortSignal?.addEventListener('abort', onAbort, { once: true });

      // Immediately try to process queue (synchronous, no race)
      this.processQueue();
      if (abortSignal?.aborted) {
        onAbort();
      }
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
  updateRateLimitState(parsed: ParsedRateLimitHeaders, isRateLimited = false): void {
    if (parsed.remainingRequests !== undefined) {
      this.remainingRequests = parsed.remainingRequests;
    } else if (isRateLimited && parsed.resetAtRequests !== undefined) {
      // A reset-only 429 describes unknown current quota, not the earlier positive count.
      this.remainingRequests = null;
    }
    if (parsed.limitRequests !== undefined) {
      this.requestLimit = parsed.limitRequests;
    }
    if (parsed.remainingTokens !== undefined) {
      this.remainingTokens = parsed.remainingTokens;
    } else if (isRateLimited && parsed.resetAtTokens !== undefined) {
      this.remainingTokens = null;
    }
    if (parsed.limitTokens !== undefined) {
      this.tokenLimit = parsed.limitTokens;
    }
    if (parsed.resetAt !== undefined) {
      this.resetAt = parsed.resetAt;
    }
    if (parsed.resetAtRequests !== undefined) {
      this.resetAtRequests = parsed.resetAtRequests;
    }
    if (parsed.resetAtTokens !== undefined) {
      this.resetAtTokens = parsed.resetAtTokens;
    }
    if (isRateLimited) {
      // The caller applies the response-wide backoff after updating its headers.
      this.scheduleResetProcessing();
    } else {
      this.processQueue();
    }
  }

  /** Apply request-wide backoff without inventing exhaustion of an available quota. */
  markRateLimited(retryAfterMs?: number, selectedResetAt?: number): void {
    const now = Date.now();
    this.clearExpiredQuotaState(now);
    const quotaResets = this.getQuotaResetTimes();
    // A generic reset has no dimension and remains a conservative backoff boundary.
    // A reset-only 429 leaves exhaustion unknown, so preserve that explicit
    // deadline without treating a known-positive quota as exhausted.
    const unknownQuotaResets = [
      this.remainingRequests === null ? this.resetAtRequests : null,
      this.remainingTokens === null ? this.resetAtTokens : null,
    ].filter((resetAt): resetAt is number => resetAt !== null);
    quotaResets.push(...unknownQuotaResets);
    const genericReset =
      this.resetAtRequests === null && this.resetAtTokens === null ? this.resetAt : null;
    const deadline =
      selectedResetAt ??
      (retryAfterMs !== undefined && Number.isFinite(retryAfterMs) && retryAfterMs >= 0
        ? now + retryAfterMs
        : (this.rateLimitedUntil ??
          (quotaResets.length > 0 ? Math.max(...quotaResets) : genericReset) ??
          now + 60000));
    this.rateLimitedUntil = Math.max(
      this.rateLimitedUntil ?? 0,
      genericReset ?? 0,
      ...unknownQuotaResets,
      deadline,
    );
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
    const deadlines = [this.rateLimitedUntil, ...this.getQuotaResetTimes()].filter(
      (deadline): deadline is number => deadline !== null,
    );
    return deadlines.length > 0 ? Math.max(...deadlines) : null;
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
    this.clearExpiredQuotaState(Date.now());
    return this.rateLimitedUntil !== null || this.getQuotaResetTimes().length > 0;
  }

  private clearExpiredQuotaState(now: number): void {
    const requestResetAt = this.resetAtRequests ?? this.resetAt;
    if (requestResetAt !== null && now >= requestResetAt) {
      this.remainingRequests = null;
      this.resetAtRequests = null;
    }
    const tokenResetAt = this.resetAtTokens ?? this.resetAt;
    if (tokenResetAt !== null && now >= tokenResetAt) {
      this.remainingTokens = null;
      this.resetAtTokens = null;
    }
    if (this.resetAt !== null && now >= this.resetAt) {
      this.resetAt = null;
    }
    if (this.rateLimitedUntil !== null && now >= this.rateLimitedUntil) {
      this.rateLimitedUntil = null;
    }
  }

  /**
   * Schedule queue processing when rate limit window resets.
   */
  private scheduleResetProcessing(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }

    const nextResetAt = this.getNextQuotaResetAt();
    if (nextResetAt && this.waiting.length > 0) {
      const delay = Math.max(0, nextResetAt - Date.now());
      this.resetTimer = setTimeout(() => {
        this.resetTimer = null;
        this.processQueue();
      }, delay);
    }
  }

  private getQuotaResetTimes(): number[] {
    const resetTimes: number[] = [];
    if (this.remainingRequests !== null && this.remainingRequests <= 0) {
      const resetAt = this.resetAtRequests ?? this.resetAt;
      if (resetAt) {
        resetTimes.push(resetAt);
      }
    }
    if (this.remainingTokens !== null && this.remainingTokens <= 0) {
      const resetAt = this.resetAtTokens ?? this.resetAt;
      if (resetAt) {
        resetTimes.push(resetAt);
      }
    }
    return resetTimes;
  }

  private getNextQuotaResetAt(): number | null {
    const resetTimes = this.getQuotaResetTimes();
    if (this.rateLimitedUntil !== null) {
      resetTimes.push(this.rateLimitedUntil);
    }
    return resetTimes.length > 0 ? Math.min(...resetTimes) : null;
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
    } else if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
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
