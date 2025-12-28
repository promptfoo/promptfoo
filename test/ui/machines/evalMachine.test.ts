import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import {
  evalMachine,
  getEvalPhase,
  getProgressPercent,
  getSessionPhase,
  isComplete,
  isRunning,
} from '../../../src/ui/machines/evalMachine';

describe('evalMachine', () => {
  describe('initial state', () => {
    it('should start in idle state', () => {
      const actor = createActor(evalMachine);
      actor.start();
      expect(actor.getSnapshot().value).toBe('idle');
      actor.stop();
    });

    it('should have empty initial context', () => {
      const actor = createActor(evalMachine);
      actor.start();
      const ctx = actor.getSnapshot().context;
      expect(ctx.totalTests).toBe(0);
      expect(ctx.completedTests).toBe(0);
      expect(ctx.providerOrder).toEqual([]);
      actor.stop();
    });
  });

  describe('INIT event', () => {
    it('should transition to initialized state', () => {
      const actor = createActor(evalMachine);
      actor.start();
      actor.send({ type: 'INIT', providers: ['gpt-4', 'claude-3'], totalTests: 10 });

      expect(actor.getSnapshot().value).toBe('initialized');
      actor.stop();
    });

    it('should set up providers and test counts', () => {
      const actor = createActor(evalMachine);
      actor.start();
      actor.send({ type: 'INIT', providers: ['gpt-4', 'claude-3'], totalTests: 10 });

      const ctx = actor.getSnapshot().context;
      expect(ctx.totalTests).toBe(10);
      expect(ctx.providerOrder).toEqual(['gpt-4', 'claude-3']);
      expect(ctx.providers['gpt-4']).toBeDefined();
      expect(ctx.providers['claude-3']).toBeDefined();
      expect(ctx.providers['gpt-4'].testCases.total).toBe(10);
      actor.stop();
    });

    it('should set custom concurrency', () => {
      const actor = createActor(evalMachine);
      actor.start();
      actor.send({ type: 'INIT', providers: ['gpt-4'], totalTests: 5, concurrency: 8 });

      expect(actor.getSnapshot().context.concurrency).toBe(8);
      actor.stop();
    });
  });

  describe('START event', () => {
    it('should transition from initialized to evaluating', () => {
      const actor = createActor(evalMachine);
      actor.start();
      actor.send({ type: 'INIT', providers: ['gpt-4'], totalTests: 5 });
      actor.send({ type: 'START' });

      expect(actor.getSnapshot().value).toEqual({ evaluating: 'running' });
      actor.stop();
    });

    it('should record start time', () => {
      const actor = createActor(evalMachine);
      actor.start();
      actor.send({ type: 'INIT', providers: ['gpt-4'], totalTests: 5 });

      const beforeStart = Date.now();
      actor.send({ type: 'START' });
      const afterStart = Date.now();

      const startTime = actor.getSnapshot().context.startTime;
      expect(startTime).toBeDefined();
      expect(startTime).toBeGreaterThanOrEqual(beforeStart);
      expect(startTime).toBeLessThanOrEqual(afterStart);
      actor.stop();
    });

    it('should not transition from idle to evaluating', () => {
      const actor = createActor(evalMachine);
      actor.start();
      actor.send({ type: 'START' }); // Try to start without init

      expect(actor.getSnapshot().value).toBe('idle');
      actor.stop();
    });
  });

  describe('PROGRESS event', () => {
    it('should update completed and total tests', () => {
      const actor = createActor(evalMachine);
      actor.start();
      actor.send({ type: 'INIT', providers: ['gpt-4'], totalTests: 10 });
      actor.send({ type: 'START' });
      actor.send({ type: 'PROGRESS', completed: 3, total: 10 });

      expect(actor.getSnapshot().context.completedTests).toBe(3);
      expect(actor.getSnapshot().context.totalTests).toBe(10);
      actor.stop();
    });

    it('should update pass/fail/error counts via deltas', () => {
      const actor = createActor(evalMachine);
      actor.start();
      actor.send({ type: 'INIT', providers: ['gpt-4'], totalTests: 10 });
      actor.send({ type: 'START' });

      // Pass
      actor.send({ type: 'PROGRESS', completed: 1, total: 10, passedDelta: 1 });
      expect(actor.getSnapshot().context.passedTests).toBe(1);

      // Fail
      actor.send({ type: 'PROGRESS', completed: 2, total: 10, failedDelta: 1 });
      expect(actor.getSnapshot().context.failedTests).toBe(1);

      // Error
      actor.send({ type: 'PROGRESS', completed: 3, total: 10, errorDelta: 1 });
      expect(actor.getSnapshot().context.errorCount).toBe(1);
      actor.stop();
    });

    it('should update current provider and prompt', () => {
      const actor = createActor(evalMachine);
      actor.start();
      actor.send({ type: 'INIT', providers: ['gpt-4'], totalTests: 10 });
      actor.send({ type: 'START' });
      actor.send({
        type: 'PROGRESS',
        completed: 1,
        total: 10,
        provider: 'gpt-4',
        prompt: 'test prompt',
        vars: 'question=hello',
      });

      const ctx = actor.getSnapshot().context;
      expect(ctx.currentProvider).toBe('gpt-4');
      expect(ctx.currentPrompt).toBe('test prompt');
      expect(ctx.currentVars).toBe('question=hello');
      actor.stop();
    });
  });

  describe('COMPLETE event', () => {
    it('should transition to completed state', () => {
      const actor = createActor(evalMachine);
      actor.start();
      actor.send({ type: 'INIT', providers: ['gpt-4'], totalTests: 5 });
      actor.send({ type: 'START' });
      actor.send({ type: 'COMPLETE', passed: 4, failed: 1, errors: 0 });

      expect(actor.getSnapshot().value).toBe('completed');
      actor.stop();
    });

    it('should set final counts', () => {
      const actor = createActor(evalMachine);
      actor.start();
      actor.send({ type: 'INIT', providers: ['gpt-4'], totalTests: 5 });
      actor.send({ type: 'START' });
      actor.send({ type: 'COMPLETE', passed: 4, failed: 1, errors: 0 });

      const ctx = actor.getSnapshot().context;
      expect(ctx.passedTests).toBe(4);
      expect(ctx.failedTests).toBe(1);
      expect(ctx.errorCount).toBe(0);
      expect(ctx.endTime).toBeDefined();
      actor.stop();
    });

    it('should mark all providers as completed', () => {
      const actor = createActor(evalMachine);
      actor.start();
      actor.send({ type: 'INIT', providers: ['gpt-4', 'claude-3'], totalTests: 5 });
      actor.send({ type: 'START' });
      actor.send({ type: 'COMPLETE', passed: 10, failed: 0, errors: 0 });

      const ctx = actor.getSnapshot().context;
      expect(ctx.providers['gpt-4'].status).toBe('completed');
      expect(ctx.providers['claude-3'].status).toBe('completed');
      actor.stop();
    });
  });

  describe('SHOW_RESULTS event', () => {
    it('should transition from completed to results', () => {
      const actor = createActor(evalMachine);
      actor.start();
      actor.send({ type: 'INIT', providers: ['gpt-4'], totalTests: 5 });
      actor.send({ type: 'START' });
      actor.send({ type: 'COMPLETE', passed: 5, failed: 0, errors: 0 });
      actor.send({
        type: 'SHOW_RESULTS',
        tableData: { head: { prompts: [], vars: [] }, body: [] },
      });

      expect(actor.getSnapshot().value).toBe('results');
      actor.stop();
    });

    it('should set table data', () => {
      const tableData = { head: { prompts: [], vars: [] }, body: [] };
      const actor = createActor(evalMachine);
      actor.start();
      actor.send({ type: 'INIT', providers: ['gpt-4'], totalTests: 5 });
      actor.send({ type: 'START' });
      actor.send({ type: 'COMPLETE', passed: 5, failed: 0, errors: 0 });
      actor.send({ type: 'SHOW_RESULTS', tableData });

      expect(actor.getSnapshot().context.tableData).toBe(tableData);
      actor.stop();
    });
  });

  describe('TOGGLE_VERBOSE event', () => {
    it('should toggle verbose mode', () => {
      const actor = createActor(evalMachine);
      actor.start();
      actor.send({ type: 'INIT', providers: ['gpt-4'], totalTests: 5 });
      actor.send({ type: 'START' });

      expect(actor.getSnapshot().context.showVerbose).toBe(false);
      actor.send({ type: 'TOGGLE_VERBOSE' });
      expect(actor.getSnapshot().context.showVerbose).toBe(true);
      actor.send({ type: 'TOGGLE_VERBOSE' });
      expect(actor.getSnapshot().context.showVerbose).toBe(false);
      actor.stop();
    });
  });

  describe('ADD_ERROR event', () => {
    it('should add errors to the ring buffer', () => {
      const actor = createActor(evalMachine);
      actor.start();
      actor.send({ type: 'INIT', providers: ['gpt-4'], totalTests: 5 });
      actor.send({ type: 'START' });
      actor.send({
        type: 'ADD_ERROR',
        error: {
          id: '1',
          provider: 'gpt-4',
          prompt: 'test',
          message: 'API error',
          timestamp: Date.now(),
        },
      });

      const errors = actor.getSnapshot().context.errors.toArray();
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe('API error');
      actor.stop();
    });
  });

  describe('ADD_LOG event', () => {
    it('should add logs to the ring buffer', () => {
      const actor = createActor(evalMachine);
      actor.start();
      actor.send({ type: 'INIT', providers: ['gpt-4'], totalTests: 5 });
      actor.send({ type: 'START' });
      actor.send({
        type: 'ADD_LOG',
        entry: {
          id: 'test-log-1',
          timestamp: Date.now(),
          level: 'info',
          message: 'Test log message',
        },
      });

      const logs = actor.getSnapshot().context.logs.toArray();
      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('Test log message');
      actor.stop();
    });
  });

  describe('UPDATE_TOKENS event', () => {
    it('should update token counts for a provider', () => {
      const actor = createActor(evalMachine);
      actor.start();
      actor.send({ type: 'INIT', providers: ['gpt-4'], totalTests: 5 });
      actor.send({ type: 'START' });
      actor.send({
        type: 'UPDATE_TOKENS',
        providerId: 'gpt-4',
        tokens: {
          prompt: 100,
          completion: 50,
          cached: 10,
          total: 150,
          numRequests: 5,
          reasoning: 0,
        },
      });

      const ctx = actor.getSnapshot().context;
      expect(ctx.providers['gpt-4'].tokens.prompt).toBe(100);
      expect(ctx.providers['gpt-4'].tokens.completion).toBe(50);
      expect(ctx.totalTokens).toBe(150);
      expect(ctx.totalRequests).toBe(5);
      actor.stop();
    });
  });

  describe('BATCH_PROGRESS event', () => {
    it('should process multiple progress items in a single update', () => {
      const actor = createActor(evalMachine);
      actor.start();
      actor.send({ type: 'INIT', providers: ['gpt-4', 'claude'], totalTests: 10 });
      actor.send({ type: 'START' });

      // Send a batch of progress items
      actor.send({
        type: 'BATCH_PROGRESS',
        items: [
          {
            provider: 'gpt-4',
            passedDelta: 1,
            failedDelta: 0,
            errorDelta: 0,
            latencyMs: 100,
            cost: 0.001,
            completed: 1,
            total: 10,
          },
          {
            provider: 'claude',
            passedDelta: 0,
            failedDelta: 1,
            errorDelta: 0,
            latencyMs: 200,
            cost: 0.002,
            completed: 2,
            total: 10,
          },
          {
            provider: 'gpt-4',
            passedDelta: 0,
            failedDelta: 0,
            errorDelta: 1,
            latencyMs: 50,
            cost: 0.0005,
            completed: 3,
            total: 10,
          },
        ],
      });

      const ctx = actor.getSnapshot().context;

      // Verify aggregates
      expect(ctx.passedTests).toBe(1);
      expect(ctx.failedTests).toBe(1);
      expect(ctx.errorCount).toBe(1);
      expect(ctx.totalCost).toBeCloseTo(0.0035, 6);
      expect(ctx.completedTests).toBe(3);

      // Verify per-provider stats
      expect(ctx.providers['gpt-4'].testCases.passed).toBe(1);
      expect(ctx.providers['gpt-4'].testCases.errors).toBe(1);
      expect(ctx.providers['gpt-4'].cost).toBeCloseTo(0.0015, 6);
      expect(ctx.providers['gpt-4'].latency.count).toBe(2);

      expect(ctx.providers['claude'].testCases.failed).toBe(1);
      expect(ctx.providers['claude'].cost).toBeCloseTo(0.002, 6);
      expect(ctx.providers['claude'].latency.count).toBe(1);
      expect(ctx.providers['claude'].latency.totalMs).toBe(200);

      actor.stop();
    });

    it('should accumulate cost correctly across multiple batches', () => {
      const actor = createActor(evalMachine);
      actor.start();
      actor.send({ type: 'INIT', providers: ['gpt-4'], totalTests: 5 });
      actor.send({ type: 'START' });

      // First batch
      actor.send({
        type: 'BATCH_PROGRESS',
        items: [
          {
            provider: 'gpt-4',
            passedDelta: 1,
            failedDelta: 0,
            errorDelta: 0,
            latencyMs: 100,
            cost: 0.01,
            completed: 1,
            total: 5,
          },
        ],
      });

      // Second batch
      actor.send({
        type: 'BATCH_PROGRESS',
        items: [
          {
            provider: 'gpt-4',
            passedDelta: 1,
            failedDelta: 0,
            errorDelta: 0,
            latencyMs: 150,
            cost: 0.02,
            completed: 2,
            total: 5,
          },
        ],
      });

      const ctx = actor.getSnapshot().context;
      expect(ctx.totalCost).toBeCloseTo(0.03, 6);
      expect(ctx.providers['gpt-4'].cost).toBeCloseTo(0.03, 6);
      expect(ctx.providers['gpt-4'].latency.totalMs).toBe(250);
      expect(ctx.providers['gpt-4'].latency.count).toBe(2);
      expect(ctx.providers['gpt-4'].latency.minMs).toBe(100);
      expect(ctx.providers['gpt-4'].latency.maxMs).toBe(150);

      actor.stop();
    });

    it('should handle empty batch gracefully', () => {
      const actor = createActor(evalMachine);
      actor.start();
      actor.send({ type: 'INIT', providers: ['gpt-4'], totalTests: 5 });
      actor.send({ type: 'START' });

      const beforeCtx = actor.getSnapshot().context;
      actor.send({ type: 'BATCH_PROGRESS', items: [] });
      const afterCtx = actor.getSnapshot().context;

      expect(afterCtx.passedTests).toBe(beforeCtx.passedTests);
      expect(afterCtx.totalCost).toBe(beforeCtx.totalCost);

      actor.stop();
    });
  });

  describe('TICK event', () => {
    it('should update elapsed time', () => {
      const actor = createActor(evalMachine);
      actor.start();
      actor.send({ type: 'INIT', providers: ['gpt-4'], totalTests: 5 });
      actor.send({ type: 'START' });

      // Wait a bit then tick
      const startTime = actor.getSnapshot().context.startTime;
      expect(startTime).toBeDefined();

      actor.send({ type: 'TICK' });
      const elapsed = actor.getSnapshot().context.elapsedMs;
      expect(elapsed).toBeGreaterThanOrEqual(0);
      actor.stop();
    });
  });

  describe('FATAL_ERROR event', () => {
    it('should transition to error state', () => {
      const actor = createActor(evalMachine);
      actor.start();
      actor.send({ type: 'INIT', providers: ['gpt-4'], totalTests: 5 });
      actor.send({ type: 'START' });
      actor.send({ type: 'FATAL_ERROR', message: 'Something went wrong' });

      expect(actor.getSnapshot().value).toBe('error');
      actor.stop();
    });
  });
});

describe('helper functions', () => {
  describe('getEvalPhase', () => {
    it('should return initializing for idle state', () => {
      expect(getEvalPhase('idle')).toBe('initializing');
    });

    it('should return initializing for initialized state', () => {
      expect(getEvalPhase('initialized')).toBe('initializing');
    });

    it('should return evaluating for evaluating state', () => {
      expect(getEvalPhase('evaluating')).toBe('evaluating');
    });

    it('should return evaluating for nested evaluating state', () => {
      expect(getEvalPhase({ evaluating: 'running' })).toBe('evaluating');
      expect(getEvalPhase({ evaluating: 'sharing' })).toBe('evaluating');
    });

    it('should return completed for completed state', () => {
      expect(getEvalPhase('completed')).toBe('completed');
    });

    it('should return completed for results state', () => {
      expect(getEvalPhase('results')).toBe('completed');
    });

    it('should return error for error state', () => {
      expect(getEvalPhase('error')).toBe('error');
    });
  });

  describe('getSessionPhase', () => {
    it('should return eval for non-results states', () => {
      expect(getSessionPhase('idle')).toBe('eval');
      expect(getSessionPhase('evaluating')).toBe('eval');
      expect(getSessionPhase('completed')).toBe('eval');
    });

    it('should return results for results state', () => {
      expect(getSessionPhase('results')).toBe('results');
    });
  });

  describe('getProgressPercent', () => {
    it('should return 0 for empty state', () => {
      expect(getProgressPercent({ totalTests: 0, completedTests: 0 } as any)).toBe(0);
    });

    it('should calculate correct percentage', () => {
      expect(getProgressPercent({ totalTests: 100, completedTests: 50 } as any)).toBe(50);
      expect(getProgressPercent({ totalTests: 10, completedTests: 3 } as any)).toBe(30);
    });

    it('should cap at 100%', () => {
      expect(getProgressPercent({ totalTests: 10, completedTests: 15 } as any)).toBe(100);
    });
  });

  describe('isRunning', () => {
    it('should return true for evaluating state', () => {
      expect(isRunning('evaluating')).toBe(true);
      expect(isRunning({ evaluating: 'running' })).toBe(true);
      expect(isRunning({ evaluating: 'sharing' })).toBe(true);
    });

    it('should return false for other states', () => {
      expect(isRunning('idle')).toBe(false);
      expect(isRunning('completed')).toBe(false);
      expect(isRunning('error')).toBe(false);
    });
  });

  describe('isComplete', () => {
    it('should return true for completed and results states', () => {
      expect(isComplete('completed')).toBe(true);
      expect(isComplete('results')).toBe(true);
    });

    it('should return false for other states', () => {
      expect(isComplete('idle')).toBe(false);
      expect(isComplete('evaluating')).toBe(false);
      expect(isComplete({ evaluating: 'running' })).toBe(false);
    });
  });
});
