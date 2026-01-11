import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EndpointController,
  SemaphoreAbortError,
} from '../../../src/util/orchestration/endpointController';

describe('EndpointController', () => {
  let controller: EndpointController;

  beforeEach(() => {
    controller = new EndpointController('test:endpoint', 3);
  });

  describe('execute()', () => {
    it('executes function and returns result', async () => {
      const result = await controller.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('tracks request count', async () => {
      await controller.execute(async () => 'a');
      await controller.execute(async () => 'b');
      await controller.execute(async () => 'c');

      const metrics = controller.getMetrics();
      expect(metrics.requestCount).toBe(3);
    });

    it('tracks error count', async () => {
      try {
        await controller.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        // Expected
      }

      const metrics = controller.getMetrics();
      expect(metrics.errorCount).toBe(1);
      expect(metrics.requestCount).toBe(1);
    });

    it('propagates errors', async () => {
      await expect(
        controller.execute(async () => {
          throw new Error('Test error');
        }),
      ).rejects.toThrow('Test error');
    });

    it('tracks latency samples', async () => {
      await controller.execute(async () => {
        await new Promise((r) => setTimeout(r, 50));
        return 'done';
      });

      const metrics = controller.getMetrics();
      expect(metrics.avgLatencyMs).toBeGreaterThanOrEqual(40);
      expect(metrics.p95LatencyMs).toBeGreaterThanOrEqual(40);
    });
  });

  describe('concurrency control', () => {
    it('limits concurrent executions', async () => {
      let concurrent = 0;
      let maxConcurrent = 0;

      const tasks = Array.from({ length: 10 }, () =>
        controller.execute(async () => {
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await new Promise((r) => setTimeout(r, 20));
          concurrent--;
          return 'done';
        }),
      );

      await Promise.all(tasks);
      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });

    it('tracks active concurrency', async () => {
      let resolve1: () => void;
      let resolve2: () => void;

      const promise1 = controller.execute(
        () =>
          new Promise<string>((r) => {
            resolve1 = () => r('done');
          }),
      );
      const promise2 = controller.execute(
        () =>
          new Promise<string>((r) => {
            resolve2 = () => r('done');
          }),
      );

      await new Promise((r) => setTimeout(r, 10));

      let metrics = controller.getMetrics();
      expect(metrics.activeConcurrency).toBe(2);

      resolve1!();
      resolve2!();
      await Promise.all([promise1, promise2]);

      metrics = controller.getMetrics();
      expect(metrics.activeConcurrency).toBe(0);
    });

    it('tracks queue depth', async () => {
      const controller2 = new EndpointController('test:limited', 1);

      const results: number[] = [];

      // Start 3 tasks with concurrency 1
      const task1 = controller2.execute(async () => {
        // While this is running, check queue depth
        await new Promise((r) => setTimeout(r, 50));
        results.push(controller2.getMetrics().queueDepth);
        return 'a';
      });

      // Give task1 time to acquire semaphore
      await new Promise((r) => setTimeout(r, 5));

      const task2 = controller2.execute(async () => 'b');
      const task3 = controller2.execute(async () => 'c');

      await Promise.all([task1, task2, task3]);

      // When task1 was running, task2 and task3 should have been queued
      expect(results[0]).toBe(2);
    });
  });

  describe('getMetrics()', () => {
    it('returns correct initial metrics', () => {
      const metrics = controller.getMetrics();

      expect(metrics.endpointId).toBe('test:endpoint');
      expect(metrics.activeConcurrency).toBe(0);
      expect(metrics.maxConcurrency).toBe(3);
      expect(metrics.queueDepth).toBe(0);
      expect(metrics.requestCount).toBe(0);
      expect(metrics.errorCount).toBe(0);
      expect(metrics.avgLatencyMs).toBe(0);
      expect(metrics.p95LatencyMs).toBe(0);
    });
  });

  describe('abort handling', () => {
    it('rejects immediately if abort signal is already aborted', async () => {
      const abortController = new AbortController();
      abortController.abort();

      await expect(
        controller.execute(async () => 'success', abortController.signal),
      ).rejects.toThrow(SemaphoreAbortError);
    });

    it('rejects queued requests when abort signal fires', async () => {
      const limitedController = new EndpointController('test:limited', 1);
      const abortController = new AbortController();

      // Start a long-running task that occupies the only slot
      const blockingTask = limitedController.execute(async () => {
        await new Promise((r) => setTimeout(r, 200));
        return 'blocking';
      });

      // This task should be queued waiting for a slot
      const queuedTask = limitedController.execute(async () => 'queued', abortController.signal);
      // Immediately attach catch to prevent unhandled rejection
      queuedTask.catch(() => {});

      // Give it time to queue
      await new Promise((r) => setTimeout(r, 10));

      // Abort while queued
      abortController.abort();

      // Queued task should reject immediately
      await expect(queuedTask).rejects.toThrow(SemaphoreAbortError);

      // Blocking task should still complete
      await expect(blockingTask).resolves.toBe('blocking');
    });

    it('cancels all waiting requests on cancelWaiting()', async () => {
      const limitedController = new EndpointController('test:limited', 1);

      // Start a blocking task
      const blockingTask = limitedController.execute(async () => {
        await new Promise((r) => setTimeout(r, 200));
        return 'blocking';
      });

      // Queue several more tasks - immediately attach catch handlers
      const queuedTask1 = limitedController.execute(async () => 'queued1');
      queuedTask1.catch(() => {});
      const queuedTask2 = limitedController.execute(async () => 'queued2');
      queuedTask2.catch(() => {});

      // Give them time to queue
      await new Promise((r) => setTimeout(r, 10));

      // Cancel all waiting
      limitedController.cancelWaiting();

      // Queued tasks should reject
      await expect(queuedTask1).rejects.toThrow(SemaphoreAbortError);
      await expect(queuedTask2).rejects.toThrow(SemaphoreAbortError);

      // Blocking task should still complete
      await expect(blockingTask).resolves.toBe('blocking');
    });

    it('counts aborted requests in request count', async () => {
      const abortController = new AbortController();
      abortController.abort();

      try {
        await controller.execute(async () => 'success', abortController.signal);
      } catch {
        // Expected
      }

      // Aborted before execution shouldn't count as a request
      const metrics = controller.getMetrics();
      expect(metrics.requestCount).toBe(0);
    });
  });

  describe('latency calculations', () => {
    it('calculates average latency', async () => {
      // Execute 3 requests with known latencies
      await controller.execute(async () => {
        await new Promise((r) => setTimeout(r, 30));
        return 'a';
      });
      await controller.execute(async () => {
        await new Promise((r) => setTimeout(r, 50));
        return 'b';
      });
      await controller.execute(async () => {
        await new Promise((r) => setTimeout(r, 70));
        return 'c';
      });

      const metrics = controller.getMetrics();
      // Average should be around 50ms (30+50+70)/3
      expect(metrics.avgLatencyMs).toBeGreaterThanOrEqual(40);
      expect(metrics.avgLatencyMs).toBeLessThanOrEqual(70);
    });

    it('calculates p95 latency', async () => {
      // Execute 20 fast requests and 1 slow one
      const tasks = [];
      for (let i = 0; i < 19; i++) {
        tasks.push(
          controller.execute(async () => {
            await new Promise((r) => setTimeout(r, 10));
            return 'fast';
          }),
        );
      }
      tasks.push(
        controller.execute(async () => {
          await new Promise((r) => setTimeout(r, 100));
          return 'slow';
        }),
      );

      await Promise.all(tasks);

      const metrics = controller.getMetrics();
      // P95 should capture the slow request
      expect(metrics.p95LatencyMs).toBeGreaterThanOrEqual(90);
    });
  });
});
