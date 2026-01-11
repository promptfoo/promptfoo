import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EvalOrchestrator } from '../../../src/util/orchestration';

describe('EvalOrchestrator', () => {
  let orchestrator: EvalOrchestrator;

  beforeEach(() => {
    orchestrator = EvalOrchestrator.getInstance();
    orchestrator.cleanup(); // Ensure clean state
    orchestrator.initialize();
  });

  afterEach(() => {
    orchestrator.cleanup();
  });

  describe('singleton pattern', () => {
    it('returns same instance on multiple calls', () => {
      const instance1 = EvalOrchestrator.getInstance();
      const instance2 = EvalOrchestrator.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('maintains state across getInstance calls', () => {
      const instance1 = EvalOrchestrator.getInstance();
      instance1.initialize();

      const instance2 = EvalOrchestrator.getInstance();
      expect(instance2.isInitialized()).toBe(true);
    });
  });

  describe('initialize()', () => {
    it('sets initialized state', () => {
      orchestrator.cleanup();
      expect(orchestrator.isInitialized()).toBe(false);

      orchestrator.initialize();
      expect(orchestrator.isInitialized()).toBe(true);
    });

    it('allows re-initialization', () => {
      orchestrator.initialize();
      orchestrator.initialize();
      expect(orchestrator.isInitialized()).toBe(true);
    });
  });

  describe('execute()', () => {
    it('executes function and returns result', async () => {
      const result = await orchestrator.execute('openai:gpt-4o', async () => {
        return 'success';
      });
      expect(result).toBe('success');
    });

    it('creates controller for new endpoint', async () => {
      await orchestrator.execute('anthropic:claude-3-5-sonnet', async () => 'ok');
      const metrics = orchestrator.getEndpointMetrics('anthropic:claude-3-5-sonnet');
      expect(metrics).toBeDefined();
      expect(metrics?.requestCount).toBe(1);
    });

    it('reuses controller for same endpoint', async () => {
      await orchestrator.execute('openai:gpt-4o', async () => 'first');
      await orchestrator.execute('openai:gpt-4o', async () => 'second');

      const metrics = orchestrator.getEndpointMetrics('openai:gpt-4o');
      expect(metrics?.requestCount).toBe(2);
      expect(orchestrator.getEndpointCount()).toBe(1);
    });

    it('creates separate controllers for different endpoints', async () => {
      await orchestrator.execute('openai:gpt-4o', async () => 'a');
      await orchestrator.execute('openai:gpt-3.5-turbo', async () => 'b');
      await orchestrator.execute('anthropic:claude', async () => 'c');

      expect(orchestrator.getEndpointCount()).toBe(3);
    });

    it('tracks errors correctly', async () => {
      try {
        await orchestrator.execute('openai:gpt-4o', async () => {
          throw new Error('API error');
        });
      } catch {
        // Expected
      }

      const metrics = orchestrator.getEndpointMetrics('openai:gpt-4o');
      expect(metrics?.errorCount).toBe(1);
      expect(metrics?.requestCount).toBe(1);
    });

    it('propagates errors from the function', async () => {
      const error = new Error('Test error');
      await expect(
        orchestrator.execute('test:endpoint', async () => {
          throw error;
        }),
      ).rejects.toThrow('Test error');
    });

    it('auto-initializes if not initialized', async () => {
      orchestrator.cleanup();
      expect(orchestrator.isInitialized()).toBe(false);

      await orchestrator.execute('test:endpoint', async () => 'ok');
      expect(orchestrator.isInitialized()).toBe(true);
    });

    it('uses default concurrency limit', async () => {
      orchestrator.cleanup();
      orchestrator.initialize();

      let concurrent = 0;
      let maxConcurrent = 0;

      // All providers use DEFAULT_MAX_CONCURRENCY (4)
      const tasks = Array.from({ length: 10 }, () =>
        orchestrator.execute('openai:gpt-4o', async () => {
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await new Promise((r) => setTimeout(r, 20));
          concurrent--;
          return 'done';
        }),
      );

      await Promise.all(tasks);
      expect(maxConcurrent).toBeLessThanOrEqual(4);
    });
  });

  describe('cleanup()', () => {
    it('clears all controllers', async () => {
      await orchestrator.execute('openai:gpt-4o', async () => 'ok');
      await orchestrator.execute('anthropic:claude', async () => 'ok');

      expect(orchestrator.getEndpointCount()).toBe(2);

      orchestrator.cleanup();

      expect(orchestrator.getEndpointCount()).toBe(0);
      expect(orchestrator.getEndpointMetrics('openai:gpt-4o')).toBeUndefined();
      expect(orchestrator.getEndpointMetrics('anthropic:claude')).toBeUndefined();
    });

    it('resets initialized state', () => {
      expect(orchestrator.isInitialized()).toBe(true);
      orchestrator.cleanup();
      expect(orchestrator.isInitialized()).toBe(false);
    });

    it('allows re-initialization after cleanup', () => {
      orchestrator.cleanup();
      expect(() => orchestrator.initialize()).not.toThrow();
      expect(orchestrator.isInitialized()).toBe(true);
    });
  });

  describe('getMetrics()', () => {
    it('returns empty metrics when no endpoints', () => {
      const metrics = orchestrator.getMetrics();
      expect(metrics.endpoints.size).toBe(0);
      expect(metrics.globalQueueDepth).toBe(0);
      expect(metrics.globalActiveRequests).toBe(0);
      expect(metrics.globalErrorRate).toBe(0);
    });

    it('aggregates metrics across endpoints', async () => {
      await orchestrator.execute('openai:gpt-4o', async () => 'ok');
      await orchestrator.execute('openai:gpt-3.5', async () => 'ok');
      await orchestrator.execute('anthropic:claude', async () => 'ok');

      const metrics = orchestrator.getMetrics();
      expect(metrics.endpoints.size).toBe(3);
    });

    it('calculates global error rate correctly', async () => {
      await orchestrator.execute('test:endpoint', async () => 'ok');
      try {
        await orchestrator.execute('test:endpoint', async () => {
          throw new Error('fail');
        });
      } catch {
        // Expected
      }

      const metrics = orchestrator.getMetrics();
      expect(metrics.globalErrorRate).toBe(0.5); // 1 error / 2 requests
    });

    it('tracks active requests', async () => {
      let resolve1: () => void;
      let resolve2: () => void;

      const promise1 = orchestrator.execute(
        'test:endpoint',
        () =>
          new Promise<string>((r) => {
            resolve1 = () => r('done');
          }),
      );
      const promise2 = orchestrator.execute(
        'test:endpoint',
        () =>
          new Promise<string>((r) => {
            resolve2 = () => r('done');
          }),
      );

      // Wait a tick for requests to start
      await new Promise((r) => setTimeout(r, 10));

      const metrics = orchestrator.getMetrics();
      expect(metrics.globalActiveRequests).toBe(2);

      resolve1!();
      resolve2!();
      await Promise.all([promise1, promise2]);

      const finalMetrics = orchestrator.getMetrics();
      expect(finalMetrics.globalActiveRequests).toBe(0);
    });
  });

  describe('getEndpointMetrics()', () => {
    it('returns undefined for unknown endpoint', () => {
      expect(orchestrator.getEndpointMetrics('unknown:endpoint')).toBeUndefined();
    });

    it('returns metrics for known endpoint', async () => {
      await orchestrator.execute('openai:gpt-4o', async () => 'ok');

      const metrics = orchestrator.getEndpointMetrics('openai:gpt-4o');
      expect(metrics).toBeDefined();
      expect(metrics?.endpointId).toBe('openai:gpt-4o');
      expect(metrics?.requestCount).toBe(1);
    });
  });
});
