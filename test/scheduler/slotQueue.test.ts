import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SlotQueue } from '../../src/scheduler/slotQueue';

import type { ParsedRateLimitHeaders } from '../../src/scheduler/headerParser';

describe('SlotQueue', () => {
  // Scoped unhandledRejection handler - saves and restores original listeners
  // Note: Vitest may still report these as "unhandled errors" but they won't fail tests
  let originalListeners: NodeJS.UnhandledRejectionListener[];

  beforeAll(() => {
    originalListeners = process.listeners(
      'unhandledRejection',
    ) as NodeJS.UnhandledRejectionListener[];
    process.removeAllListeners('unhandledRejection');
    process.on('unhandledRejection', (reason: unknown) => {
      if (reason instanceof Error && reason.message === 'Queue disposed') {
        return; // Suppress expected dispose errors
      }
      throw reason;
    });
  });

  afterAll(() => {
    process.removeAllListeners('unhandledRejection');
    for (const listener of originalListeners) {
      process.on('unhandledRejection', listener);
    }
  });

  let queue: SlotQueue;
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Dispose queue - waiting requests will be rejected with "Queue disposed"
    // These rejections are expected and handled by trackAcquire() below
    queue?.dispose();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // Helper to track acquire promises that may be pending at cleanup
  // Adds a no-op catch handler to prevent unhandled rejection warnings
  function trackAcquire(promise: Promise<void>): Promise<void> {
    promise.catch(() => {
      // Expected rejection on dispose - ignore
    });
    return promise;
  }

  describe('Constructor - initial state', () => {
    it('should initialize with correct default values', () => {
      queue = new SlotQueue({
        maxConcurrency: 5,
        minConcurrency: 1,
      });

      expect(queue.getMaxConcurrency()).toBe(5);
      expect(queue.getActiveCount()).toBe(0);
      expect(queue.getQueueDepth()).toBe(0);
      expect(queue.getResetAt()).toBeNull();
    });

    it('should use default queue timeout when not specified', async () => {
      queue = new SlotQueue({
        maxConcurrency: 0, // No capacity - force queuing
        minConcurrency: 0,
      });

      // Default timeout is 5 minutes (300000ms), we'll verify this indirectly
      // by checking that a request doesn't timeout before 5 minutes
      const _promise = queue.acquire('test-1').catch(() => {}); // Handle rejection on dispose
      vi.advanceTimersByTime(4 * 60 * 1000); // 4 minutes
      expect(queue.getQueueDepth()).toBe(1); // Still waiting
    });

    it('should use custom queue timeout when specified', async () => {
      queue = new SlotQueue({
        maxConcurrency: 1,
        minConcurrency: 1,
        queueTimeoutMs: 1000,
      });

      // Fill capacity
      await queue.acquire('test-1');
      expect(queue.getActiveCount()).toBe(1);

      // Second request should timeout
      const promise2 = queue.acquire('test-2');
      expect(queue.getQueueDepth()).toBe(1);

      vi.advanceTimersByTime(1001);

      await expect(promise2).rejects.toThrow('timed out after 1000ms in queue');
    });
  });

  describe('acquire/release - basic slot allocation', () => {
    beforeEach(() => {
      queue = new SlotQueue({
        maxConcurrency: 3,
        minConcurrency: 1,
      });
    });

    it('should immediately acquire slot when capacity available', async () => {
      const promise = queue.acquire('test-1');
      await expect(promise).resolves.toBeUndefined();
      expect(queue.getActiveCount()).toBe(1);
      expect(queue.getQueueDepth()).toBe(0);
    });

    it('should release slot and decrement active count', async () => {
      await queue.acquire('test-1');
      expect(queue.getActiveCount()).toBe(1);

      queue.release();
      expect(queue.getActiveCount()).toBe(0);
    });

    it('should acquire multiple slots up to max concurrency', async () => {
      await queue.acquire('test-1');
      await queue.acquire('test-2');
      await queue.acquire('test-3');

      expect(queue.getActiveCount()).toBe(3);
      expect(queue.getQueueDepth()).toBe(0);
    });

    it('should call onSlotAcquired callback with queue depth', async () => {
      const onSlotAcquired = vi.fn();
      queue = new SlotQueue({
        maxConcurrency: 2,
        minConcurrency: 1,
        onSlotAcquired,
      });

      await queue.acquire('test-1');
      expect(onSlotAcquired).toHaveBeenCalledWith(0);

      await queue.acquire('test-2');
      expect(onSlotAcquired).toHaveBeenCalledWith(0); // No queue yet

      trackAcquire(queue.acquire('test-3')); // This will queue
      queue.release(); // Process queued request

      await vi.runAllTimersAsync();
      expect(onSlotAcquired).toHaveBeenCalledWith(0); // Queue depth after test-3 was dequeued
    });

    it('should call onSlotReleased callback with queue depth', async () => {
      const onSlotReleased = vi.fn();
      queue = new SlotQueue({
        maxConcurrency: 1,
        minConcurrency: 1,
        onSlotReleased,
      });

      await queue.acquire('test-1');
      trackAcquire(queue.acquire('test-2')); // Queue this
      trackAcquire(queue.acquire('test-3')); // Queue this too
      expect(queue.getQueueDepth()).toBe(2);

      queue.release();
      // Callback is called with queue depth BEFORE processing
      expect(onSlotReleased).toHaveBeenCalledWith(2);
    });
  });

  describe('acquire - concurrent requests respect maxConcurrency', () => {
    it('should queue requests beyond max concurrency', async () => {
      queue = new SlotQueue({
        maxConcurrency: 2,
        minConcurrency: 1,
      });

      await queue.acquire('test-1');
      await queue.acquire('test-2');
      expect(queue.getActiveCount()).toBe(2);

      trackAcquire(queue.acquire('test-3'));
      trackAcquire(queue.acquire('test-4'));

      expect(queue.getActiveCount()).toBe(2);
      expect(queue.getQueueDepth()).toBe(2);
    });

    it('should not exceed max concurrency even with rapid concurrent requests', async () => {
      queue = new SlotQueue({
        maxConcurrency: 3,
        minConcurrency: 1,
      });

      const _promises = Array.from({ length: 10 }, (_, i) =>
        trackAcquire(queue.acquire(`test-${i}`)),
      );

      expect(queue.getActiveCount()).toBe(3);
      expect(queue.getQueueDepth()).toBe(7);
    });
  });

  describe('acquire - queued requests are FIFO', () => {
    it('should process queued requests in FIFO order', async () => {
      queue = new SlotQueue({
        maxConcurrency: 1,
        minConcurrency: 1,
      });

      const order: string[] = [];

      await queue.acquire('test-1');

      const p2 = queue.acquire('test-2').then(() => order.push('test-2'));
      const p3 = queue.acquire('test-3').then(() => order.push('test-3'));
      const p4 = queue.acquire('test-4').then(() => order.push('test-4'));

      expect(queue.getQueueDepth()).toBe(3);

      queue.release();
      await p2;
      expect(order[0]).toBe('test-2');

      queue.release();
      await p3;
      expect(order[1]).toBe('test-3');

      queue.release();
      await p4;
      expect(order[2]).toBe('test-4');
    });
  });

  describe('acquire - race condition prevention', () => {
    it('should not over-allocate slots under concurrent load', async () => {
      queue = new SlotQueue({
        maxConcurrency: 5,
        minConcurrency: 1,
      });

      // Launch 100 concurrent requests
      const _promises = Array.from({ length: 100 }, (_, i) =>
        trackAcquire(queue.acquire(`test-${i}`)),
      );

      // Should have exactly max concurrency active, rest queued
      expect(queue.getActiveCount()).toBe(5);
      expect(queue.getQueueDepth()).toBe(95);

      // Release one and verify only one more is acquired
      queue.release();
      expect(queue.getActiveCount()).toBe(5);
      expect(queue.getQueueDepth()).toBe(94);
    });

    it('should maintain exact capacity during rapid acquire/release cycles', async () => {
      queue = new SlotQueue({
        maxConcurrency: 3,
        minConcurrency: 1,
      });

      // Fill initial capacity
      await queue.acquire('initial-1');
      await queue.acquire('initial-2');
      await queue.acquire('initial-3');
      expect(queue.getActiveCount()).toBe(3);

      // Queue many requests
      const _promises = Array.from({ length: 20 }, (_, i) =>
        trackAcquire(queue.acquire(`queued-${i}`)),
      );
      expect(queue.getQueueDepth()).toBe(20);

      // Rapid release/verify cycle
      for (let i = 0; i < 10; i++) {
        queue.release();
        expect(queue.getActiveCount()).toBe(3); // Should always maintain max
      }
    });
  });

  describe('updateRateLimitState - updates internal state', () => {
    beforeEach(() => {
      queue = new SlotQueue({
        maxConcurrency: 5,
        minConcurrency: 1,
      });
    });

    it('should update remaining requests and limit', () => {
      const parsed: ParsedRateLimitHeaders = {
        remainingRequests: 100,
        limitRequests: 500,
      };

      queue.updateRateLimitState(parsed);

      const ratio = queue.getRemainingRatio();
      expect(ratio.requests).toBe(0.2); // 100/500
    });

    it('should update remaining tokens and limit', () => {
      const parsed: ParsedRateLimitHeaders = {
        remainingTokens: 50000,
        limitTokens: 100000,
      };

      queue.updateRateLimitState(parsed);

      const ratio = queue.getRemainingRatio();
      expect(ratio.tokens).toBe(0.5); // 50000/100000
    });

    it('should update resetAt timestamp', () => {
      const resetTime = Date.now() + 60000;
      const parsed: ParsedRateLimitHeaders = {
        resetAt: resetTime,
      };

      queue.updateRateLimitState(parsed);

      expect(queue.getResetAt()).toBe(resetTime);
    });

    it('should update all fields together', () => {
      const resetTime = Date.now() + 120000;
      const parsed: ParsedRateLimitHeaders = {
        remainingRequests: 45,
        limitRequests: 50,
        remainingTokens: 80000,
        limitTokens: 100000,
        resetAt: resetTime,
      };

      queue.updateRateLimitState(parsed);

      const ratio = queue.getRemainingRatio();
      expect(ratio.requests).toBe(0.9);
      expect(ratio.tokens).toBe(0.8);
      expect(queue.getResetAt()).toBe(resetTime);
    });
  });

  describe('markRateLimited - sets quota to 0, schedules reset', () => {
    beforeEach(() => {
      queue = new SlotQueue({
        maxConcurrency: 5,
        minConcurrency: 1,
      });
    });

    it('should set remaining requests and tokens to 0', () => {
      queue.markRateLimited(60000);

      const _ratio = queue.getRemainingRatio();
      // ratios will be null since we don't have limits set
      // but we can verify through behavior - requests should be blocked
      expect(queue.getResetAt()).toBe(Date.now() + 60000);
    });

    it('should schedule reset with retryAfterMs', () => {
      const retryAfter = 5000;
      queue.markRateLimited(retryAfter);

      expect(queue.getResetAt()).toBe(Date.now() + retryAfter);
    });

    it('should use default 60s reset when no retryAfterMs provided and no existing resetAt', () => {
      queue.markRateLimited();

      expect(queue.getResetAt()).toBe(Date.now() + 60000);
    });

    it('should use later reset time when new retryAfterMs is longer', () => {
      queue.updateRateLimitState({ resetAt: Date.now() + 30000 });

      queue.markRateLimited(60000);

      expect(queue.getResetAt()).toBe(Date.now() + 60000);
    });

    it('should block new acquisitions until reset time', async () => {
      // Set up initial state with limits
      queue.updateRateLimitState({
        remainingRequests: 10,
        limitRequests: 100,
      });

      await queue.acquire('test-1');
      expect(queue.getActiveCount()).toBe(1);

      // Mark rate limited
      queue.markRateLimited(5000);

      // Try to acquire - should be blocked
      trackAcquire(queue.acquire('test-2'));
      expect(queue.getQueueDepth()).toBe(1);
      expect(queue.getActiveCount()).toBe(1);

      // Advance past reset time
      vi.advanceTimersByTime(5001);

      // Now should be acquired
      expect(queue.getActiveCount()).toBe(2);
      expect(queue.getQueueDepth()).toBe(0);
    });
  });

  describe('markRateLimited - preserves existing resetAt if no retryAfterMs', () => {
    beforeEach(() => {
      queue = new SlotQueue({
        maxConcurrency: 5,
        minConcurrency: 1,
      });
    });

    it('should preserve existing resetAt when retryAfterMs not provided', () => {
      const existingResetAt = Date.now() + 120000;
      queue.updateRateLimitState({ resetAt: existingResetAt });

      queue.markRateLimited(); // No retryAfterMs

      expect(queue.getResetAt()).toBe(existingResetAt);
    });

    it('should keep existing resetAt when retryAfterMs is 0', () => {
      const existingResetAt = Date.now() + 90000;
      queue.updateRateLimitState({ resetAt: existingResetAt });

      queue.markRateLimited(0); // Zero retryAfterMs

      expect(queue.getResetAt()).toBe(existingResetAt);
    });

    it('should prefer existing resetAt when new retryAfterMs is shorter', () => {
      const existingResetAt = Date.now() + 120000;
      queue.updateRateLimitState({ resetAt: existingResetAt });

      queue.markRateLimited(30000); // Shorter than existing

      expect(queue.getResetAt()).toBe(existingResetAt);
    });
  });

  describe('isQuotaExhausted - blocks when requests exhausted', () => {
    beforeEach(() => {
      queue = new SlotQueue({
        maxConcurrency: 5,
        minConcurrency: 1,
      });
    });

    it('should block acquisitions when remaining requests is 0', async () => {
      queue.updateRateLimitState({
        remainingRequests: 0,
        limitRequests: 100,
        resetAt: Date.now() + 60000,
      });

      trackAcquire(queue.acquire('test-1'));

      expect(queue.getActiveCount()).toBe(0);
      expect(queue.getQueueDepth()).toBe(1);
    });

    it('should allow acquisitions when remaining requests > 0', async () => {
      queue.updateRateLimitState({
        remainingRequests: 10,
        limitRequests: 100,
      });

      await queue.acquire('test-1');

      expect(queue.getActiveCount()).toBe(1);
      expect(queue.getQueueDepth()).toBe(0);
    });
  });

  describe('isQuotaExhausted - blocks when tokens exhausted', () => {
    beforeEach(() => {
      queue = new SlotQueue({
        maxConcurrency: 5,
        minConcurrency: 1,
      });
    });

    it('should block acquisitions when remaining tokens is 0', async () => {
      queue.updateRateLimitState({
        remainingTokens: 0,
        limitTokens: 100000,
        resetAt: Date.now() + 60000,
      });

      trackAcquire(queue.acquire('test-1'));

      expect(queue.getActiveCount()).toBe(0);
      expect(queue.getQueueDepth()).toBe(1);
    });

    it('should allow acquisitions when remaining tokens > 0', async () => {
      queue.updateRateLimitState({
        remainingTokens: 50000,
        limitTokens: 100000,
      });

      await queue.acquire('test-1');

      expect(queue.getActiveCount()).toBe(1);
      expect(queue.getQueueDepth()).toBe(0);
    });

    it('should block when either requests OR tokens exhausted', async () => {
      queue.updateRateLimitState({
        remainingRequests: 10,
        limitRequests: 100,
        remainingTokens: 0,
        limitTokens: 100000,
        resetAt: Date.now() + 60000,
      });

      trackAcquire(queue.acquire('test-1'));

      expect(queue.getActiveCount()).toBe(0);
      expect(queue.getQueueDepth()).toBe(1);
    });
  });

  describe('isQuotaExhausted - clears stale state after reset time', () => {
    beforeEach(() => {
      queue = new SlotQueue({
        maxConcurrency: 5,
        minConcurrency: 1,
      });
    });

    it('should clear quota state when reset time has passed', async () => {
      const resetAt = Date.now() + 5000;
      queue.updateRateLimitState({
        remainingRequests: 0,
        limitRequests: 100,
        resetAt,
      });

      // Should be blocked initially
      trackAcquire(queue.acquire('test-1'));
      expect(queue.getQueueDepth()).toBe(1);

      // Advance past reset time - timer fires and processes queue
      vi.advanceTimersByTime(5001);

      // Queue should be processed
      expect(queue.getActiveCount()).toBe(1);
      expect(queue.getQueueDepth()).toBe(0);
      expect(queue.getResetAt()).toBeNull();
    });

    it('should allow acquisition immediately after reset time without waiting for timer', async () => {
      const resetAt = Date.now() + 3000;
      queue.updateRateLimitState({
        remainingRequests: 0,
        resetAt,
      });

      // Advance past reset
      vi.advanceTimersByTime(3001);

      // Should acquire immediately
      await queue.acquire('test-1');
      expect(queue.getActiveCount()).toBe(1);
    });
  });

  describe('scheduleResetProcessing - processes queue after reset', () => {
    beforeEach(() => {
      queue = new SlotQueue({
        maxConcurrency: 5,
        minConcurrency: 1,
      });
    });

    it('should process queued requests after reset timer fires', async () => {
      queue.updateRateLimitState({
        remainingRequests: 0,
        resetAt: Date.now() + 5000,
      });

      trackAcquire(queue.acquire('test-1'));
      trackAcquire(queue.acquire('test-2'));

      expect(queue.getQueueDepth()).toBe(2);
      expect(queue.getActiveCount()).toBe(0);

      // Advance to reset time
      vi.advanceTimersByTime(5000);

      // Should process queue
      expect(queue.getActiveCount()).toBe(2);
      expect(queue.getQueueDepth()).toBe(0);
      expect(queue.getResetAt()).toBeNull();
    });

    it('should cancel existing reset timer when new reset is scheduled', async () => {
      const now = Date.now();
      queue.updateRateLimitState({
        remainingRequests: 0,
        resetAt: now + 10000,
      });

      trackAcquire(queue.acquire('test-1'));
      expect(queue.getQueueDepth()).toBe(1);

      // Advance time a bit
      vi.advanceTimersByTime(1000);

      // Schedule new reset with shorter time from current point
      queue.updateRateLimitState({
        resetAt: Date.now() + 2000,
      });

      // Old timer would fire at 10000ms total, we're at 1000ms
      // New timer should fire at 1000 + 2000 = 3000ms total
      vi.advanceTimersByTime(1999);
      expect(queue.getQueueDepth()).toBe(1);

      // New timer should fire now (total 3000ms)
      vi.advanceTimersByTime(1);
      expect(queue.getActiveCount()).toBe(1);
    });

    it('should not schedule reset if queue is empty', () => {
      queue.updateRateLimitState({
        remainingRequests: 0,
        resetAt: Date.now() + 5000,
      });

      // No requests queued, so no timer should be set
      // This is verified indirectly - we can't inspect private resetTimer
      // but we can verify that advancing time doesn't cause issues
      vi.advanceTimersByTime(10000);
      expect(queue.getQueueDepth()).toBe(0);
    });
  });

  describe('Queue timeout - rejects after timeout', () => {
    it('should reject queued request after timeout expires', async () => {
      queue = new SlotQueue({
        maxConcurrency: 1,
        minConcurrency: 1,
        queueTimeoutMs: 5000,
      });

      await queue.acquire('test-1'); // Fill capacity
      const promise2 = queue.acquire('test-2'); // Queue this

      vi.advanceTimersByTime(5001);

      await expect(promise2).rejects.toThrow('timed out after 5000ms in queue');
      expect(queue.getQueueDepth()).toBe(0);
    });

    it('should clear timeout when request is processed', async () => {
      queue = new SlotQueue({
        maxConcurrency: 1,
        minConcurrency: 1,
        queueTimeoutMs: 10000,
      });

      await queue.acquire('test-1');
      const promise2 = queue.acquire('test-2');

      expect(queue.getQueueDepth()).toBe(1);

      // Release before timeout
      queue.release();

      // Should be processed, not rejected
      await expect(promise2).resolves.toBeUndefined();
      expect(queue.getActiveCount()).toBe(1);
    });

    it('should handle timeout value of 0 as disabled', async () => {
      queue = new SlotQueue({
        maxConcurrency: 1,
        minConcurrency: 1,
        queueTimeoutMs: 0,
      });

      await queue.acquire('test-1');
      trackAcquire(queue.acquire('test-2'));

      // Advance a very long time - should not timeout
      vi.advanceTimersByTime(1000000);

      expect(queue.getQueueDepth()).toBe(1);
    });
  });

  describe('getRemainingRatio - returns correct ratios', () => {
    beforeEach(() => {
      queue = new SlotQueue({
        maxConcurrency: 5,
        minConcurrency: 1,
      });
    });

    it('should return null ratios when no limits set', () => {
      const ratio = queue.getRemainingRatio();

      expect(ratio.requests).toBeNull();
      expect(ratio.tokens).toBeNull();
    });

    it('should calculate request ratio correctly', () => {
      queue.updateRateLimitState({
        remainingRequests: 25,
        limitRequests: 100,
      });

      const ratio = queue.getRemainingRatio();

      expect(ratio.requests).toBe(0.25);
      expect(ratio.tokens).toBeNull();
    });

    it('should calculate token ratio correctly', () => {
      queue.updateRateLimitState({
        remainingTokens: 75000,
        limitTokens: 100000,
      });

      const ratio = queue.getRemainingRatio();

      expect(ratio.requests).toBeNull();
      expect(ratio.tokens).toBe(0.75);
    });

    it('should calculate both ratios when both are set', () => {
      queue.updateRateLimitState({
        remainingRequests: 40,
        limitRequests: 50,
        remainingTokens: 30000,
        limitTokens: 100000,
      });

      const ratio = queue.getRemainingRatio();

      expect(ratio.requests).toBe(0.8);
      expect(ratio.tokens).toBe(0.3);
    });

    it('should return null when limit is 0', () => {
      queue.updateRateLimitState({
        remainingRequests: 10,
        limitRequests: 0,
      });

      const ratio = queue.getRemainingRatio();

      expect(ratio.requests).toBeNull();
    });

    it('should handle 0 remaining correctly', () => {
      queue.updateRateLimitState({
        remainingRequests: 0,
        limitRequests: 100,
      });

      const ratio = queue.getRemainingRatio();

      expect(ratio.requests).toBe(0);
    });
  });

  describe('dispose - clears timers and rejects waiting', () => {
    beforeEach(() => {
      queue = new SlotQueue({
        maxConcurrency: 1,
        minConcurrency: 1,
      });
    });

    it('should reject all waiting requests on dispose', async () => {
      await queue.acquire('test-1');
      const promise2 = queue.acquire('test-2');
      const promise3 = queue.acquire('test-3');

      expect(queue.getQueueDepth()).toBe(2);

      queue.dispose();

      await expect(promise2).rejects.toThrow('Queue disposed');
      await expect(promise3).rejects.toThrow('Queue disposed');
      expect(queue.getQueueDepth()).toBe(0);
    });

    it('should clear reset timer on dispose', async () => {
      queue.updateRateLimitState({
        remainingRequests: 0,
        resetAt: Date.now() + 60000,
      });
      const promise = queue.acquire('test-1');

      queue.dispose();

      // Handle the expected rejection
      await expect(promise).rejects.toThrow('Queue disposed');

      // Advancing time should not cause any timer to fire
      vi.advanceTimersByTime(100000);
      // No assertion needed - just verifying no errors thrown
    });

    it('should clear queue timeout timers on dispose', async () => {
      queue = new SlotQueue({
        maxConcurrency: 1,
        minConcurrency: 1,
        queueTimeoutMs: 5000,
      });

      await queue.acquire('test-1');
      const promise2 = queue.acquire('test-2');

      queue.dispose();

      // Timeout timer should be cleared, so advancing time won't cause timeout error
      vi.advanceTimersByTime(10000);
      await expect(promise2).rejects.toThrow('Queue disposed'); // Not timeout error
    });
  });

  describe('setMaxConcurrency - adjust concurrency limit', () => {
    beforeEach(() => {
      queue = new SlotQueue({
        maxConcurrency: 5,
        minConcurrency: 2,
      });
    });

    it('should update max concurrency', () => {
      queue.setMaxConcurrency(10);
      expect(queue.getMaxConcurrency()).toBe(10);
    });

    it('should enforce minimum concurrency', () => {
      queue.setMaxConcurrency(1);
      expect(queue.getMaxConcurrency()).toBe(2); // Min is 2
    });

    it('should process queue when concurrency is increased', async () => {
      // Fill to capacity (5)
      await queue.acquire('test-1');
      await queue.acquire('test-2');
      await queue.acquire('test-3');
      await queue.acquire('test-4');
      await queue.acquire('test-5');

      // Queue more
      trackAcquire(queue.acquire('test-6'));
      trackAcquire(queue.acquire('test-7'));

      expect(queue.getActiveCount()).toBe(5);
      expect(queue.getQueueDepth()).toBe(2);

      // Increase concurrency
      queue.setMaxConcurrency(7);

      expect(queue.getActiveCount()).toBe(7);
      expect(queue.getQueueDepth()).toBe(0);
    });

    it('should not process queue when concurrency is decreased', async () => {
      await queue.acquire('test-1');
      await queue.acquire('test-2');
      expect(queue.getActiveCount()).toBe(2);

      queue.setMaxConcurrency(3); // Lower than current capacity (5)

      await queue.acquire('test-3');

      expect(queue.getActiveCount()).toBe(3);
    });
  });

  describe('release - edge cases', () => {
    beforeEach(() => {
      queue = new SlotQueue({
        maxConcurrency: 5,
        minConcurrency: 1,
      });
    });

    it('should not go negative when release() called without acquire()', () => {
      // Call release without any acquire
      queue.release();
      queue.release();
      queue.release();

      // Should still be 0, not negative
      expect(queue.getActiveCount()).toBe(0);

      // Should still be able to acquire normally
      queue.acquire('test-1');
      expect(queue.getActiveCount()).toBe(1);
    });

    it('should handle unbalanced release calls gracefully', async () => {
      await queue.acquire('test-1');
      expect(queue.getActiveCount()).toBe(1);

      queue.release();
      queue.release(); // Extra release
      queue.release(); // Extra release

      expect(queue.getActiveCount()).toBe(0);
    });
  });
});
