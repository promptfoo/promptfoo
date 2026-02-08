import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { evalMachine } from '../../src/ui/machines/evalMachine';

describe('EvalContext with Real XState Machine', () => {
  it('should have correct initial state', () => {
    const actor = createActor(evalMachine);
    actor.start();
    const snapshot = actor.getSnapshot();

    expect(snapshot.value).toBe('idle');
    expect(snapshot.context.totalTests).toBe(0);
    expect(snapshot.context.completedTests).toBe(0);
    expect(snapshot.context.passedTests).toBe(0);
    expect(snapshot.context.failedTests).toBe(0);
    actor.stop();
  });

  it('should initialize with providers and total tests', () => {
    const actor = createActor(evalMachine);
    actor.start();

    actor.send({
      type: 'INIT',
      providers: ['openai:gpt-4', 'anthropic:claude-3'],
      totalTests: 100,
    });

    const snapshot = actor.getSnapshot();
    expect(snapshot.context.totalTests).toBe(100);
    expect(snapshot.context.providerOrder).toHaveLength(2);
    expect(snapshot.value).toBe('initialized');
    expect(snapshot.context.providers['openai:gpt-4']).toBeDefined();
    expect(snapshot.context.providers['anthropic:claude-3']).toBeDefined();
    actor.stop();
  });

  it('should start evaluation', () => {
    const actor = createActor(evalMachine);
    actor.start();

    actor.send({
      type: 'INIT',
      providers: ['openai:gpt-4'],
      totalTests: 100,
    });

    actor.send({ type: 'START' });

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toEqual({ evaluating: 'running' });
    expect(snapshot.context.startTime).toBeDefined();
    actor.stop();
  });

  it('should update progress', () => {
    const actor = createActor(evalMachine);
    actor.start();

    actor.send({
      type: 'INIT',
      providers: ['openai:gpt-4'],
      totalTests: 100,
    });

    actor.send({ type: 'START' });

    actor.send({
      type: 'PROGRESS',
      completed: 50,
      total: 100,
      passedDelta: 1,
    });

    const snapshot = actor.getSnapshot();
    expect(snapshot.context.completedTests).toBe(50);
    expect(snapshot.context.passedTests).toBe(1);
    actor.stop();
  });

  it('should track failures', () => {
    const actor = createActor(evalMachine);
    actor.start();

    actor.send({
      type: 'INIT',
      providers: ['openai:gpt-4'],
      totalTests: 100,
    });

    actor.send({ type: 'START' });

    actor.send({
      type: 'PROGRESS',
      completed: 1,
      total: 100,
      failedDelta: 1,
    });

    const snapshot = actor.getSnapshot();
    expect(snapshot.context.failedTests).toBe(1);
    actor.stop();
  });

  it('should add errors', () => {
    const actor = createActor(evalMachine);
    actor.start();

    actor.send({
      type: 'INIT',
      providers: ['openai:gpt-4'],
      totalTests: 100,
    });

    actor.send({ type: 'START' });

    actor.send({
      type: 'ADD_ERROR',
      error: {
        id: 'test-error-1',
        provider: 'openai:gpt-4',
        prompt: 'test prompt',
        message: 'API error',
        timestamp: Date.now(),
      },
    });

    const snapshot = actor.getSnapshot();
    const errors = snapshot.context.errors.toArray();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('API error');
    actor.stop();
  });

  it('should complete evaluation', () => {
    const actor = createActor(evalMachine);
    actor.start();

    actor.send({
      type: 'INIT',
      providers: ['openai:gpt-4'],
      totalTests: 100,
    });

    actor.send({ type: 'START' });

    actor.send({
      type: 'COMPLETE',
      passed: 90,
      failed: 10,
      errors: 0,
    });

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe('completed');
    expect(snapshot.context.passedTests).toBe(90);
    expect(snapshot.context.failedTests).toBe(10);
    expect(snapshot.context.endTime).toBeDefined();
    actor.stop();
  });

  it('should limit errors to maxErrorsToShow', () => {
    const actor = createActor(evalMachine);
    actor.start();

    actor.send({
      type: 'INIT',
      providers: ['openai:gpt-4'],
      totalTests: 100,
    });

    // Add more errors than maxErrorsToShow (default is 5)
    for (let i = 0; i < 10; i++) {
      actor.send({
        type: 'ADD_ERROR',
        error: {
          id: `error-${i}`,
          provider: 'openai:gpt-4',
          prompt: `prompt ${i}`,
          message: `error ${i}`,
          timestamp: Date.now(),
        },
      });
    }

    const snapshot = actor.getSnapshot();
    const errors = snapshot.context.errors.toArray();
    // Ring buffer should limit to maxErrorsToShow
    expect(errors.length).toBeLessThanOrEqual(snapshot.context.maxErrorsToShow);
    actor.stop();
  });
});

// Test the enhanced reducer with TEST_RESULT and UPDATE_TOKEN_METRICS actions
describe('Enhanced EvalContext with Real XState Machine', () => {
  describe('TEST_RESULT action', () => {
    it('should update provider metrics on test pass', () => {
      const actor = createActor(evalMachine);
      actor.start();

      actor.send({
        type: 'INIT',
        providers: ['openai:gpt-4'],
        totalTests: 100,
      });

      actor.send({ type: 'START' });

      actor.send({
        type: 'PROGRESS',
        completed: 1,
        total: 100,
        provider: 'openai:gpt-4',
        passedDelta: 1,
        latencyMs: 500,
        cost: 0.05,
      });

      const snapshot = actor.getSnapshot();
      expect(snapshot.context.passedTests).toBe(1);
      expect(snapshot.context.completedTests).toBe(1);
      expect(snapshot.context.totalCost).toBe(0.05);

      const provider = snapshot.context.providers['openai:gpt-4'];
      expect(provider.testCases.passed).toBe(1);
      expect(provider.testCases.completed).toBe(1);
      expect(provider.cost).toBe(0.05);
      expect(provider.latency.totalMs).toBe(500);
      expect(provider.latency.count).toBe(1);
      actor.stop();
    });

    it('should update provider metrics on test fail', () => {
      const actor = createActor(evalMachine);
      actor.start();

      actor.send({
        type: 'INIT',
        providers: ['openai:gpt-4'],
        totalTests: 100,
      });

      actor.send({ type: 'START' });

      actor.send({
        type: 'PROGRESS',
        completed: 1,
        total: 100,
        provider: 'openai:gpt-4',
        failedDelta: 1,
        latencyMs: 300,
        cost: 0.02,
      });

      const snapshot = actor.getSnapshot();
      expect(snapshot.context.failedTests).toBe(1);
      expect(snapshot.context.providers['openai:gpt-4'].testCases.failed).toBe(1);
      actor.stop();
    });

    it('should track min/max latency', () => {
      const actor = createActor(evalMachine);
      actor.start();

      actor.send({
        type: 'INIT',
        providers: ['openai:gpt-4'],
        totalTests: 100,
      });

      actor.send({ type: 'START' });

      // First test with 500ms latency
      actor.send({
        type: 'PROGRESS',
        completed: 1,
        total: 100,
        provider: 'openai:gpt-4',
        passedDelta: 1,
        latencyMs: 500,
        cost: 0.01,
      });

      // Second test with 200ms latency
      actor.send({
        type: 'PROGRESS',
        completed: 2,
        total: 100,
        provider: 'openai:gpt-4',
        passedDelta: 1,
        latencyMs: 200,
        cost: 0.01,
      });

      // Third test with 800ms latency
      actor.send({
        type: 'PROGRESS',
        completed: 3,
        total: 100,
        provider: 'openai:gpt-4',
        passedDelta: 1,
        latencyMs: 800,
        cost: 0.01,
      });

      const snapshot = actor.getSnapshot();
      const provider = snapshot.context.providers['openai:gpt-4'];
      expect(provider.latency.minMs).toBe(200);
      expect(provider.latency.maxMs).toBe(800);
      expect(provider.latency.totalMs).toBe(1500);
      expect(provider.latency.count).toBe(3);
      actor.stop();
    });

    it('should create provider if it does not exist on PROGRESS', () => {
      const actor = createActor(evalMachine);
      actor.start();

      // Start with no providers initialized
      actor.send({ type: 'INIT', providers: [], totalTests: 10 });

      // PROGRESS event with a provider that wasn't in INIT
      actor.send({
        type: 'PROGRESS',
        completed: 1,
        total: 10,
        provider: 'new-provider',
        passedDelta: 1,
        latencyMs: 100,
        cost: 0.01,
      });

      const snapshot = actor.getSnapshot();
      // In the real machine, PROGRESS only updates existing providers
      // It doesn't create new ones like the fake reducer did
      expect(snapshot.context.providers['new-provider']).toBeUndefined();
      actor.stop();
    });
  });

  describe('UPDATE_TOKENS action', () => {
    it('should update provider token metrics', () => {
      const actor = createActor(evalMachine);
      actor.start();

      actor.send({
        type: 'INIT',
        providers: ['openai:gpt-4'],
        totalTests: 100,
      });

      actor.send({ type: 'START' });

      actor.send({
        type: 'UPDATE_TOKENS',
        providerId: 'openai:gpt-4',
        tokens: {
          prompt: 1000,
          completion: 500,
          cached: 200,
          total: 1500,
          numRequests: 10,
        },
      });

      const snapshot = actor.getSnapshot();
      const provider = snapshot.context.providers['openai:gpt-4'];
      expect(provider.tokens.prompt).toBe(1000);
      expect(provider.tokens.completion).toBe(500);
      expect(provider.tokens.cached).toBe(200);
      expect(provider.tokens.total).toBe(1500);
      expect(provider.requests.total).toBe(10);
      actor.stop();
    });

    it('should update aggregate token metrics across providers', () => {
      const actor = createActor(evalMachine);
      actor.start();

      actor.send({
        type: 'INIT',
        providers: ['openai:gpt-4', 'anthropic:claude-3'],
        totalTests: 100,
      });

      actor.send({ type: 'START' });

      // Update first provider
      actor.send({
        type: 'UPDATE_TOKENS',
        providerId: 'openai:gpt-4',
        tokens: {
          prompt: 1000,
          completion: 500,
          cached: 0,
          total: 1500,
          numRequests: 10,
        },
      });

      // Update second provider
      actor.send({
        type: 'UPDATE_TOKENS',
        providerId: 'anthropic:claude-3',
        tokens: {
          prompt: 2000,
          completion: 1000,
          cached: 500,
          total: 3000,
          numRequests: 15,
        },
      });

      const snapshot = actor.getSnapshot();
      // Check aggregates
      expect(snapshot.context.totalTokens).toBe(4500);
      expect(snapshot.context.promptTokens).toBe(3000);
      expect(snapshot.context.completionTokens).toBe(1500);
      expect(snapshot.context.cachedTokens).toBe(500);
      expect(snapshot.context.totalRequests).toBe(25);
      actor.stop();
    });

    it('should ignore update for non-existent provider', () => {
      const actor = createActor(evalMachine);
      actor.start();

      actor.send({ type: 'INIT', providers: [], totalTests: 10 });

      actor.send({
        type: 'UPDATE_TOKENS',
        providerId: 'non-existent',
        tokens: {
          prompt: 1000,
          completion: 500,
          cached: 0,
          total: 1500,
          numRequests: 10,
        },
      });

      const snapshot = actor.getSnapshot();
      // State should remain unchanged
      expect(snapshot.context.totalTokens).toBe(0);
      expect(snapshot.context.totalRequests).toBe(0);
      actor.stop();
    });
  });

  describe('BATCH_PROGRESS action', () => {
    it('should process multiple progress items in a single update', () => {
      const actor = createActor(evalMachine);
      actor.start();

      actor.send({
        type: 'INIT',
        providers: ['openai:gpt-4', 'anthropic:claude'],
        totalTests: 100,
      });

      actor.send({ type: 'START' });

      // Send a batch of progress items
      actor.send({
        type: 'BATCH_PROGRESS',
        items: [
          {
            provider: 'openai:gpt-4',
            passedDelta: 1,
            failedDelta: 0,
            errorDelta: 0,
            latencyMs: 100,
            cost: 0.001,
            completed: 1,
            total: 100,
          },
          {
            provider: 'anthropic:claude',
            passedDelta: 0,
            failedDelta: 1,
            errorDelta: 0,
            latencyMs: 200,
            cost: 0.002,
            completed: 2,
            total: 100,
          },
          {
            provider: 'openai:gpt-4',
            passedDelta: 0,
            failedDelta: 0,
            errorDelta: 1,
            latencyMs: 50,
            cost: 0.0005,
            completed: 3,
            total: 100,
          },
        ],
      });

      const snapshot = actor.getSnapshot();

      // Verify aggregates
      expect(snapshot.context.passedTests).toBe(1);
      expect(snapshot.context.failedTests).toBe(1);
      expect(snapshot.context.errorCount).toBe(1);
      expect(snapshot.context.totalCost).toBeCloseTo(0.0035, 6);
      expect(snapshot.context.completedTests).toBe(3);

      // Verify per-provider stats
      expect(snapshot.context.providers['openai:gpt-4'].testCases.passed).toBe(1);
      expect(snapshot.context.providers['openai:gpt-4'].testCases.errors).toBe(1);
      expect(snapshot.context.providers['openai:gpt-4'].cost).toBeCloseTo(0.0015, 6);
      expect(snapshot.context.providers['openai:gpt-4'].latency.count).toBe(2);

      expect(snapshot.context.providers['anthropic:claude'].testCases.failed).toBe(1);
      expect(snapshot.context.providers['anthropic:claude'].cost).toBeCloseTo(0.002, 6);
      expect(snapshot.context.providers['anthropic:claude'].latency.count).toBe(1);
      expect(snapshot.context.providers['anthropic:claude'].latency.totalMs).toBe(200);

      actor.stop();
    });

    it('should accumulate cost correctly across multiple batches', () => {
      const actor = createActor(evalMachine);
      actor.start();

      actor.send({
        type: 'INIT',
        providers: ['openai:gpt-4'],
        totalTests: 50,
      });

      actor.send({ type: 'START' });

      // First batch
      actor.send({
        type: 'BATCH_PROGRESS',
        items: [
          {
            provider: 'openai:gpt-4',
            passedDelta: 1,
            failedDelta: 0,
            errorDelta: 0,
            latencyMs: 100,
            cost: 0.01,
            completed: 1,
            total: 50,
          },
        ],
      });

      // Second batch
      actor.send({
        type: 'BATCH_PROGRESS',
        items: [
          {
            provider: 'openai:gpt-4',
            passedDelta: 1,
            failedDelta: 0,
            errorDelta: 0,
            latencyMs: 150,
            cost: 0.02,
            completed: 2,
            total: 50,
          },
        ],
      });

      const snapshot = actor.getSnapshot();
      expect(snapshot.context.totalCost).toBeCloseTo(0.03, 6);
      expect(snapshot.context.providers['openai:gpt-4'].cost).toBeCloseTo(0.03, 6);
      expect(snapshot.context.providers['openai:gpt-4'].latency.totalMs).toBe(250);
      expect(snapshot.context.providers['openai:gpt-4'].latency.count).toBe(2);
      expect(snapshot.context.providers['openai:gpt-4'].latency.minMs).toBe(100);
      expect(snapshot.context.providers['openai:gpt-4'].latency.maxMs).toBe(150);

      actor.stop();
    });

    it('should handle empty batch gracefully', () => {
      const actor = createActor(evalMachine);
      actor.start();

      actor.send({
        type: 'INIT',
        providers: ['openai:gpt-4'],
        totalTests: 50,
      });

      actor.send({ type: 'START' });

      const beforeSnapshot = actor.getSnapshot();
      actor.send({ type: 'BATCH_PROGRESS', items: [] });
      const afterSnapshot = actor.getSnapshot();

      expect(afterSnapshot.context.passedTests).toBe(beforeSnapshot.context.passedTests);
      expect(afterSnapshot.context.totalCost).toBe(beforeSnapshot.context.totalCost);

      actor.stop();
    });
  });

  describe('SET_GRADING_TOKENS action', () => {
    it('should update grading token metrics', () => {
      const actor = createActor(evalMachine);
      actor.start();

      actor.send({
        type: 'INIT',
        providers: ['openai:gpt-4'],
        totalTests: 50,
      });

      actor.send({ type: 'START' });

      actor.send({
        type: 'SET_GRADING_TOKENS',
        providerId: 'openai:gpt-4',
        tokens: {
          prompt: 100,
          completion: 50,
          cached: 10,
          total: 150,
          reasoning: 20,
        },
      });

      const snapshot = actor.getSnapshot();
      const provider = snapshot.context.providers['openai:gpt-4'];
      expect(provider.gradingTokens.prompt).toBe(100);
      expect(provider.gradingTokens.completion).toBe(50);
      expect(provider.gradingTokens.cached).toBe(10);
      expect(provider.gradingTokens.total).toBe(150);
      expect(provider.gradingTokens.reasoning).toBe(20);

      // Check aggregates
      expect(snapshot.context.gradingTokens.prompt).toBe(100);
      expect(snapshot.context.gradingTokens.completion).toBe(50);
      expect(snapshot.context.gradingTokens.total).toBe(150);
      actor.stop();
    });
  });
});
