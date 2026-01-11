import type { EndpointId, EndpointMetrics } from './types';

/**
 * Error thrown when a semaphore acquisition is aborted.
 */
export class SemaphoreAbortError extends Error {
  constructor() {
    super('Semaphore acquisition aborted');
    this.name = 'SemaphoreAbortError';
  }
}

interface WaitQueueEntry {
  resolve: () => void;
  reject: (error: Error) => void;
}

/**
 * Semaphore for concurrency control with abort support.
 */
class Semaphore {
  private permits: number;
  private waitQueue: WaitQueueEntry[] = [];

  constructor(private readonly maxPermits: number) {
    this.permits = maxPermits;
  }

  async acquire(abortSignal?: AbortSignal): Promise<void> {
    // Check if already aborted
    if (abortSignal?.aborted) {
      throw new SemaphoreAbortError();
    }

    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise<void>((resolve, reject) => {
      const entry: WaitQueueEntry = { resolve, reject };
      this.waitQueue.push(entry);

      // Handle abort while waiting
      if (abortSignal) {
        const onAbort = () => {
          const index = this.waitQueue.indexOf(entry);
          if (index !== -1) {
            this.waitQueue.splice(index, 1);
            reject(new SemaphoreAbortError());
          }
        };
        abortSignal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }

  release(): void {
    const entry = this.waitQueue.shift();
    if (entry) {
      entry.resolve();
    } else {
      this.permits = Math.min(this.permits + 1, this.maxPermits);
    }
  }

  /**
   * Cancel all waiting acquisitions (for graceful shutdown).
   */
  cancelAll(): void {
    const waiting = this.waitQueue.splice(0);
    for (const entry of waiting) {
      entry.reject(new SemaphoreAbortError());
    }
  }

  getWaiting(): number {
    return this.waitQueue.length;
  }
}

interface LatencySample {
  duration: number;
  timestamp: number;
}

/**
 * Controller for a single API endpoint.
 * Manages concurrency and tracks metrics.
 */
export class EndpointController {
  private readonly semaphore: Semaphore;
  private activeConcurrency = 0;
  private requestCount = 0;
  private errorCount = 0;
  private latencySamples: LatencySample[] = [];
  private readonly windowMs = 60000; // 1 minute sliding window

  constructor(
    private readonly endpointId: EndpointId,
    private readonly maxConcurrency: number,
  ) {
    this.semaphore = new Semaphore(maxConcurrency);
  }

  /**
   * Execute a function with concurrency control
   * @param fn The function to execute
   * @param abortSignal Optional abort signal to cancel waiting for a slot
   */
  async execute<T>(fn: () => Promise<T>, abortSignal?: AbortSignal): Promise<T> {
    await this.semaphore.acquire(abortSignal);
    this.activeConcurrency++;
    this.requestCount++;

    const startTime = Date.now();

    try {
      const result = await fn();
      this.latencySamples.push({
        duration: Date.now() - startTime,
        timestamp: Date.now(),
      });
      return result;
    } catch (error) {
      this.errorCount++;
      throw error;
    } finally {
      this.activeConcurrency--;
      this.semaphore.release();
    }
  }

  /**
   * Cancel all waiting requests (for graceful shutdown).
   * In-flight requests will complete, but queued requests will be rejected.
   */
  cancelWaiting(): void {
    this.semaphore.cancelAll();
  }

  /**
   * Get current metrics for this endpoint
   */
  getMetrics(): EndpointMetrics {
    this.pruneOldSamples();

    return {
      endpointId: this.endpointId,
      activeConcurrency: this.activeConcurrency,
      maxConcurrency: this.maxConcurrency,
      queueDepth: this.semaphore.getWaiting(),
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      avgLatencyMs: this.calculateAvgLatency(),
      p95LatencyMs: this.calculateP95Latency(),
    };
  }

  private pruneOldSamples(): void {
    const cutoff = Date.now() - this.windowMs;
    this.latencySamples = this.latencySamples.filter((s) => s.timestamp >= cutoff);
  }

  private calculateAvgLatency(): number {
    if (this.latencySamples.length === 0) {
      return 0;
    }
    const sum = this.latencySamples.reduce((acc, s) => acc + s.duration, 0);
    return Math.round(sum / this.latencySamples.length);
  }

  private calculateP95Latency(): number {
    if (this.latencySamples.length === 0) {
      return 0;
    }
    const sorted = [...this.latencySamples].sort((a, b) => a.duration - b.duration);
    const p95Index = Math.floor(sorted.length * 0.95);
    return sorted[Math.min(p95Index, sorted.length - 1)]?.duration ?? 0;
  }
}
