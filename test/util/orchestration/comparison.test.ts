import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EvalOrchestrator, SemaphoreAbortError } from '../../../src/util/orchestration';

/**
 * This test suite demonstrates the value of per-endpoint concurrency control
 * by comparing it to the behavior of a simulated global concurrency approach.
 */
describe('Per-Endpoint vs Global Concurrency Comparison', () => {
  let orchestrator: EvalOrchestrator;

  beforeEach(() => {
    orchestrator = EvalOrchestrator.getInstance();
    orchestrator.cleanup();
    orchestrator.initialize();
  });

  afterEach(() => {
    orchestrator.cleanup();
  });

  /**
   * Simulates global concurrency (the old approach):
   * All API calls share a single concurrency pool, so a slow endpoint
   * blocks slots that fast endpoints could use.
   */
  class GlobalConcurrencySimulator {
    private activeCount = 0;
    private readonly maxConcurrency: number;
    private readonly waitQueue: Array<() => void> = [];

    constructor(maxConcurrency: number) {
      this.maxConcurrency = maxConcurrency;
    }

    async execute<T>(fn: () => Promise<T>): Promise<T> {
      if (this.activeCount < this.maxConcurrency) {
        this.activeCount++;
      } else {
        await new Promise<void>((resolve) => {
          this.waitQueue.push(resolve);
        });
        this.activeCount++;
      }

      try {
        return await fn();
      } finally {
        this.activeCount--;
        const next = this.waitQueue.shift();
        if (next) next();
      }
    }
  }

  describe('fast endpoint not blocked by slow endpoint', () => {
    /**
     * Scenario:
     * - 4 "slow" API calls (200ms each) from provider A
     * - 4 "fast" API calls (50ms each) from provider B
     *
     * With global concurrency (4 total):
     * - Slow calls occupy all 4 slots initially
     * - Fast calls must wait until slow calls complete
     * - Total time: ~200ms (slow) + ~50ms (fast waiting) = ~250ms+
     *
     * With per-endpoint concurrency (4 per endpoint):
     * - Slow and fast calls run independently
     * - Fast calls complete while slow calls are still running
     * - Total time: ~200ms (limited by slow calls)
     */
    it('per-endpoint concurrency allows fast endpoints to run independently', async () => {
      const slowLatency = 150; // ms
      const fastLatency = 30; // ms
      const callsPerEndpoint = 4;

      // Track when each endpoint's calls complete
      const results: { endpoint: string; completedAt: number }[] = [];
      const startTime = Date.now();

      // Start slow provider calls
      const slowCalls = Array.from({ length: callsPerEndpoint }, () =>
        orchestrator.execute('provider:slow', async () => {
          await new Promise((r) => setTimeout(r, slowLatency));
          results.push({ endpoint: 'slow', completedAt: Date.now() - startTime });
          return 'slow';
        }),
      );

      // Start fast provider calls (slightly delayed to ensure ordering)
      await new Promise((r) => setTimeout(r, 5));

      const fastCalls = Array.from({ length: callsPerEndpoint }, () =>
        orchestrator.execute('provider:fast', async () => {
          await new Promise((r) => setTimeout(r, fastLatency));
          results.push({ endpoint: 'fast', completedAt: Date.now() - startTime });
          return 'fast';
        }),
      );

      await Promise.all([...slowCalls, ...fastCalls]);

      // Verify: Fast calls should complete well before slow calls
      const fastCompletionTimes = results.filter((r) => r.endpoint === 'fast').map((r) => r.completedAt);
      const slowCompletionTimes = results.filter((r) => r.endpoint === 'slow').map((r) => r.completedAt);

      const maxFastTime = Math.max(...fastCompletionTimes);
      const minSlowTime = Math.min(...slowCompletionTimes);

      // Fast should complete in ~50ms (1 batch with concurrency 4)
      // Slow should complete in ~150ms
      expect(maxFastTime).toBeLessThan(slowLatency); // Fast finishes before slow's latency
      expect(maxFastTime).toBeLessThan(minSlowTime); // Fast finishes before first slow

      // Verify metrics show independent tracking
      expect(orchestrator.getEndpointMetrics('provider:slow')?.requestCount).toBe(callsPerEndpoint);
      expect(orchestrator.getEndpointMetrics('provider:fast')?.requestCount).toBe(callsPerEndpoint);
    });

    it('global concurrency would block fast endpoints (simulated comparison)', async () => {
      const globalPool = new GlobalConcurrencySimulator(4);
      const slowLatency = 150;
      const fastLatency = 30;
      const callsPerEndpoint = 4;

      const results: { endpoint: string; completedAt: number }[] = [];
      const startTime = Date.now();

      // Start slow calls (they will occupy all 4 slots)
      const slowCalls = Array.from({ length: callsPerEndpoint }, () =>
        globalPool.execute(async () => {
          await new Promise((r) => setTimeout(r, slowLatency));
          results.push({ endpoint: 'slow', completedAt: Date.now() - startTime });
          return 'slow';
        }),
      );

      // Start fast calls (they have to wait for slow calls)
      await new Promise((r) => setTimeout(r, 5));

      const fastCalls = Array.from({ length: callsPerEndpoint }, () =>
        globalPool.execute(async () => {
          await new Promise((r) => setTimeout(r, fastLatency));
          results.push({ endpoint: 'fast', completedAt: Date.now() - startTime });
          return 'fast';
        }),
      );

      await Promise.all([...slowCalls, ...fastCalls]);

      // With global concurrency, fast calls are blocked until slow calls complete
      const fastCompletionTimes = results.filter((r) => r.endpoint === 'fast').map((r) => r.completedAt);
      const maxFastTime = Math.max(...fastCompletionTimes);

      // Fast calls complete AFTER slow calls (they had to wait)
      expect(maxFastTime).toBeGreaterThan(slowLatency);
    });
  });

  describe('total throughput improvement', () => {
    it('per-endpoint concurrency achieves higher total throughput', async () => {
      const latency = 50; // ms per call
      const callsPerEndpoint = 8;
      const numEndpoints = 3;

      const startTime = Date.now();

      // Run calls to multiple endpoints with per-endpoint concurrency
      const allCalls: Promise<string>[] = [];
      for (let ep = 0; ep < numEndpoints; ep++) {
        for (let i = 0; i < callsPerEndpoint; i++) {
          allCalls.push(
            orchestrator.execute(`provider:endpoint-${ep}`, async () => {
              await new Promise((r) => setTimeout(r, latency));
              return `ep${ep}-${i}`;
            }),
          );
        }
      }

      await Promise.all(allCalls);
      const perEndpointDuration = Date.now() - startTime;

      // With per-endpoint (4 concurrency each):
      // 8 calls / 4 concurrency = 2 batches per endpoint
      // 2 batches * 50ms = 100ms per endpoint (running in parallel)
      // Expected: ~100-150ms total

      // With global (4 concurrency shared):
      // 24 total calls / 4 concurrency = 6 batches
      // 6 batches * 50ms = 300ms total

      // Per-endpoint should be significantly faster
      expect(perEndpointDuration).toBeLessThan(200); // Much faster than 300ms
    });
  });

  describe('abort signal propagation', () => {
    it('abort signal cancels queued requests without affecting in-flight', async () => {
      const abortController = new AbortController();
      const inFlightResults: string[] = [];
      const queuedResults: string[] = [];

      // Start tasks that will occupy all slots
      const inFlightTasks = Array.from({ length: 4 }, (_, i) =>
        orchestrator.execute('provider:test', async () => {
          await new Promise((r) => setTimeout(r, 100));
          inFlightResults.push(`in-flight-${i}`);
          return `in-flight-${i}`;
        }),
      );

      // Queue more tasks with abort signal - immediately attach catch handlers
      await new Promise((r) => setTimeout(r, 5)); // Ensure above tasks start first

      const queuedTasks = Array.from({ length: 4 }, (_, i) => {
        const task = orchestrator.execute(
          'provider:test',
          async () => {
            queuedResults.push(`queued-${i}`);
            return `queued-${i}`;
          },
          abortController.signal,
        );
        // Immediately handle rejection to prevent unhandled rejection warning
        task.catch(() => {});
        return task;
      });

      // Let tasks queue
      await new Promise((r) => setTimeout(r, 10));

      // Abort queued tasks
      abortController.abort();

      // In-flight should complete
      await Promise.all(inFlightTasks);

      // Queued should be rejected
      for (const task of queuedTasks) {
        await expect(task).rejects.toThrow(SemaphoreAbortError);
      }

      // Verify results
      expect(inFlightResults).toHaveLength(4);
      expect(queuedResults).toHaveLength(0); // None executed
    });

    it('cleanup() cancels all pending requests', async () => {
      // Fill up the slots
      const blockingTasks = Array.from({ length: 4 }, () =>
        orchestrator.execute('provider:test', async () => {
          await new Promise((r) => setTimeout(r, 200));
          return 'blocking';
        }),
      );

      // Queue more tasks - immediately attach catch handlers
      await new Promise((r) => setTimeout(r, 5));

      const pendingTasks = Array.from({ length: 4 }, (_, i) => {
        const task = orchestrator.execute('provider:test', async () => `pending-${i}`);
        // Immediately handle rejection to prevent unhandled rejection warning
        task.catch(() => {});
        return task;
      });

      // Wait for tasks to queue
      await new Promise((r) => setTimeout(r, 10));

      // Cleanup should cancel pending
      orchestrator.cleanup();

      // Pending tasks should be rejected
      for (const task of pendingTasks) {
        await expect(task).rejects.toThrow(SemaphoreAbortError);
      }

      // Blocking tasks will still complete (in-flight)
      await Promise.all(blockingTasks);
    });
  });

  describe('metrics isolation', () => {
    it('error rates are tracked per endpoint', async () => {
      // Endpoint A: 2 success, 2 errors (50% error rate)
      await orchestrator.execute('provider:error-prone', async () => 'ok');
      await orchestrator.execute('provider:error-prone', async () => 'ok');
      try {
        await orchestrator.execute('provider:error-prone', async () => {
          throw new Error('fail');
        });
      } catch {}
      try {
        await orchestrator.execute('provider:error-prone', async () => {
          throw new Error('fail');
        });
      } catch {}

      // Endpoint B: 4 success, 0 errors (0% error rate)
      for (let i = 0; i < 4; i++) {
        await orchestrator.execute('provider:reliable', async () => 'ok');
      }

      const errorProneMetrics = orchestrator.getEndpointMetrics('provider:error-prone');
      const reliableMetrics = orchestrator.getEndpointMetrics('provider:reliable');

      expect(errorProneMetrics?.errorCount).toBe(2);
      expect(errorProneMetrics?.requestCount).toBe(4);
      expect(reliableMetrics?.errorCount).toBe(0);
      expect(reliableMetrics?.requestCount).toBe(4);

      // Global error rate should be 2/8 = 25%
      const globalMetrics = orchestrator.getMetrics();
      expect(globalMetrics.globalErrorRate).toBe(0.25);
    });
  });
});
