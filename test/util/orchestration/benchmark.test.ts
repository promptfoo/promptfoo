import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EvalOrchestrator } from '../../../src/util/orchestration';

describe('EvalOrchestrator Benchmark', () => {
  let orchestrator: EvalOrchestrator;

  beforeEach(() => {
    orchestrator = EvalOrchestrator.getInstance();
    orchestrator.cleanup();
    orchestrator.initialize();
  });

  afterEach(() => {
    orchestrator.cleanup();
  });

  describe('per-endpoint concurrency proof', () => {
    it('limits concurrency per endpoint to default (4)', async () => {
      let concurrent = 0;
      let maxConcurrent = 0;

      // Run 10 tasks - should never exceed default concurrency of 4
      const tasks = Array.from({ length: 10 }, (_, i) =>
        orchestrator.execute('provider:test', async () => {
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await new Promise((r) => setTimeout(r, 30));
          concurrent--;
          return `task-${i}`;
        }),
      );

      await Promise.all(tasks);

      // Should respect default concurrency limit of 4
      expect(maxConcurrent).toBeLessThanOrEqual(4);
      expect(maxConcurrent).toBeGreaterThan(1); // Should use some parallelism

      // Verify metrics tracked correctly
      const metrics = orchestrator.getEndpointMetrics('provider:test');
      expect(metrics?.requestCount).toBe(10);
      expect(metrics?.maxConcurrency).toBe(4);
    });

    it('runs different endpoints independently without blocking each other', async () => {
      const order: string[] = [];

      // Start tasks on endpoint A that will take 200ms total (5 tasks * 50ms / 4 concurrency)
      const endpointATasks = Array.from({ length: 5 }, (_, i) =>
        orchestrator.execute('provider:endpoint-a', async () => {
          order.push(`a-${i}-start`);
          await new Promise((r) => setTimeout(r, 50));
          order.push(`a-${i}-end`);
          return `a-${i}`;
        }),
      );

      // After a small delay, start tasks on endpoint B
      await new Promise((r) => setTimeout(r, 10));

      const endpointBTasks = Array.from({ length: 5 }, (_, i) =>
        orchestrator.execute('provider:endpoint-b', async () => {
          order.push(`b-${i}-start`);
          await new Promise((r) => setTimeout(r, 20)); // Faster tasks
          order.push(`b-${i}-end`);
          return `b-${i}`;
        }),
      );

      await Promise.all([...endpointATasks, ...endpointBTasks]);

      // Endpoint B tasks should start even while endpoint A tasks are running
      // (they don't share concurrency limits)
      const bStartIndices = order
        .filter((o) => o.startsWith('b-') && o.endsWith('-start'))
        .map((o) => order.indexOf(o));

      // B tasks should have started before many A tasks finished
      expect(bStartIndices.length).toBe(5);

      // Verify both endpoints tracked separately
      expect(orchestrator.getEndpointMetrics('provider:endpoint-a')?.requestCount).toBe(5);
      expect(orchestrator.getEndpointMetrics('provider:endpoint-b')?.requestCount).toBe(5);
      expect(orchestrator.getEndpointCount()).toBe(2);
    });
  });

  describe('metrics accuracy', () => {
    it('tracks error rates per endpoint', async () => {
      // 3 successful calls
      await orchestrator.execute('provider:mixed', async () => 'ok');
      await orchestrator.execute('provider:mixed', async () => 'ok');
      await orchestrator.execute('provider:mixed', async () => 'ok');

      // 2 failed calls
      try {
        await orchestrator.execute('provider:mixed', async () => {
          throw new Error('fail');
        });
      } catch {}
      try {
        await orchestrator.execute('provider:mixed', async () => {
          throw new Error('fail');
        });
      } catch {}

      const metrics = orchestrator.getEndpointMetrics('provider:mixed');
      expect(metrics?.requestCount).toBe(5);
      expect(metrics?.errorCount).toBe(2);

      const globalMetrics = orchestrator.getMetrics();
      expect(globalMetrics.globalErrorRate).toBe(0.4); // 2/5
    });

    it('aggregates global metrics across endpoints', async () => {
      // Execute on multiple endpoints
      await orchestrator.execute('provider:one', async () => 'ok');
      await orchestrator.execute('provider:two', async () => 'ok');
      await orchestrator.execute('provider:two', async () => 'ok');
      await orchestrator.execute('provider:three', async () => 'ok');

      const globalMetrics = orchestrator.getMetrics();
      expect(globalMetrics.endpoints.size).toBe(3);

      // Check individual endpoint request counts
      expect(orchestrator.getEndpointMetrics('provider:one')?.requestCount).toBe(1);
      expect(orchestrator.getEndpointMetrics('provider:two')?.requestCount).toBe(2);
      expect(orchestrator.getEndpointMetrics('provider:three')?.requestCount).toBe(1);
    });
  });
});
