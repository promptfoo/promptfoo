import { EventEmitter } from 'events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiProvider } from '../../src/types/providers';

// Track constructor calls and instances
const mockProviderRateLimitStateConstructor = vi.fn();
const mockGetRateLimitKey = vi.fn();
const mockGetEnvInt = vi.fn();
const mockGetEnvBool = vi.fn();

let mockStateToReturn: any = null;
const mockStateQueue: any[] = [];

// Mock dependencies before imports
vi.mock('../../src/scheduler/providerRateLimitState', () => ({
  ProviderRateLimitState: class extends EventEmitter {
    executeWithRetry: any;
    getMetrics: any;
    getQueueDepth: any;
    dispose: any;

    constructor(options: any) {
      super();
      mockProviderRateLimitStateConstructor(options);

      // Check if we have a queued mock state
      const queuedState = mockStateQueue.shift();
      if (queuedState) {
        this.executeWithRetry = queuedState.executeWithRetry;
        this.getMetrics = queuedState.getMetrics;
        this.getQueueDepth = queuedState.getQueueDepth || vi.fn().mockReturnValue(0);
        this.dispose = queuedState.dispose;
      } else if (mockStateToReturn) {
        // If we have a specific mock state to return, copy its methods
        this.executeWithRetry = mockStateToReturn.executeWithRetry;
        this.getMetrics = mockStateToReturn.getMetrics;
        this.getQueueDepth = mockStateToReturn.getQueueDepth || vi.fn().mockReturnValue(0);
        this.dispose = mockStateToReturn.dispose;
      } else {
        // Default mocks
        this.executeWithRetry = vi.fn().mockResolvedValue('result');
        this.getMetrics = vi.fn().mockReturnValue({
          rateLimitKey: 'test-provider',
          activeRequests: 0,
          maxConcurrency: 10,
          queueDepth: 0,
          totalRequests: 0,
          completedRequests: 0,
          failedRequests: 0,
          rateLimitHits: 0,
          retriedRequests: 0,
          avgLatencyMs: 0,
          p50LatencyMs: 0,
          p99LatencyMs: 0,
        });
        this.getQueueDepth = vi.fn().mockReturnValue(0);
        this.dispose = vi.fn();
      }
    }
  },
}));

vi.mock('../../src/scheduler/rateLimitKey', () => ({
  getRateLimitKey: mockGetRateLimitKey,
}));

vi.mock('../../src/envars', () => ({
  getEnvInt: mockGetEnvInt,
  getEnvBool: mockGetEnvBool,
}));

// Import after mocks are set up
const { RateLimitRegistry, createRateLimitRegistry } = await import(
  '../../src/scheduler/rateLimitRegistry'
);

describe('RateLimitRegistry', () => {
  let mockProvider: ApiProvider;
  let mockState: any;

  beforeEach(() => {
    // Reset mocks with mockReset() to clear both call history AND implementations
    // This ensures test isolation when tests use mockReturnValueOnce
    mockProviderRateLimitStateConstructor.mockReset();
    mockGetRateLimitKey.mockReset();
    mockGetEnvInt.mockReset();
    mockGetEnvBool.mockReset();

    // Clear the queue
    mockStateQueue.length = 0;

    // Setup mock provider
    mockProvider = {
      id: () => 'test-provider',
      config: {},
      callApi: vi.fn(),
    } as unknown as ApiProvider;

    // Setup mock state
    mockState = {
      executeWithRetry: vi.fn().mockResolvedValue('result'),
      getMetrics: vi.fn().mockReturnValue({
        rateLimitKey: 'test-provider',
        activeRequests: 0,
        maxConcurrency: 10,
        queueDepth: 0,
        totalRequests: 0,
        completedRequests: 0,
        failedRequests: 0,
        rateLimitHits: 0,
        retriedRequests: 0,
        avgLatencyMs: 0,
        p50LatencyMs: 0,
        p99LatencyMs: 0,
      }),
      dispose: vi.fn(),
      emit: vi.fn(),
      on: vi.fn(),
      listenerCount: vi.fn().mockReturnValue(1),
    };

    // Set this as the mock to be returned by the constructor
    mockStateToReturn = mockState;

    // Mock getRateLimitKey
    mockGetRateLimitKey.mockReturnValue('test-provider');

    // Mock envars with defaults
    mockGetEnvInt.mockReturnValue(1);
    mockGetEnvBool.mockReturnValue(false);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('createRateLimitRegistry - factory function', () => {
    it('should create a new RateLimitRegistry instance', () => {
      const registry = createRateLimitRegistry({ maxConcurrency: 10 });
      expect(registry).toBeInstanceOf(RateLimitRegistry);
    });

    it('should pass options to constructor', () => {
      const registry = createRateLimitRegistry({ maxConcurrency: 20, minConcurrency: 2 });
      expect(registry).toBeInstanceOf(RateLimitRegistry);
    });
  });

  describe('Constructor - options handling', () => {
    it('should initialize with maxConcurrency from options', () => {
      const registry = new RateLimitRegistry({ maxConcurrency: 15 });
      expect(registry).toBeDefined();
    });

    it('should use minConcurrency from options if provided', () => {
      mockGetEnvInt.mockReturnValue(1);
      const registry = new RateLimitRegistry({ maxConcurrency: 10, minConcurrency: 3 });

      // Execute to trigger state creation
      const callFn = vi.fn().mockResolvedValue('result');
      registry.execute(mockProvider, callFn);

      // Check ProviderRateLimitState was created with correct minConcurrency
      // queueTimeoutMs is 1 because mockGetEnvInt returns 1 for all calls
      expect(mockProviderRateLimitStateConstructor).toHaveBeenCalledWith({
        rateLimitKey: 'test-provider',
        maxConcurrency: 10,
        minConcurrency: 3,
        queueTimeoutMs: 1,
      });
    });

    it('should use default minConcurrency from env when not provided', () => {
      mockGetEnvInt.mockReturnValue(2);
      const registry = new RateLimitRegistry({ maxConcurrency: 10 });

      // Execute to trigger state creation
      const callFn = vi.fn().mockResolvedValue('result');
      registry.execute(mockProvider, callFn);

      expect(mockGetEnvInt).toHaveBeenCalledWith('PROMPTFOO_MIN_CONCURRENCY', 1);
      expect(mockProviderRateLimitStateConstructor).toHaveBeenCalledWith({
        rateLimitKey: 'test-provider',
        maxConcurrency: 10,
        minConcurrency: 2,
        queueTimeoutMs: 2,
      });
    });

    it('should enable scheduler by default', async () => {
      mockGetEnvBool.mockReturnValue(false);
      const registry = new RateLimitRegistry({ maxConcurrency: 10 });

      const callFn = vi.fn().mockResolvedValue('result');
      await registry.execute(mockProvider, callFn);

      // Should create state and use scheduler
      expect(mockProviderRateLimitStateConstructor).toHaveBeenCalled();
    });

    it('should disable scheduler when env var is true', async () => {
      mockGetEnvBool.mockReturnValue(true);
      const registry = new RateLimitRegistry({ maxConcurrency: 10 });

      const callFn = vi.fn().mockResolvedValue('result');
      const result = await registry.execute(mockProvider, callFn);

      expect(mockGetEnvBool).toHaveBeenCalledWith('PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER', false);
      expect(callFn).toHaveBeenCalled();
      expect(mockProviderRateLimitStateConstructor).not.toHaveBeenCalled();
      expect(result).toBe('result');
    });
  });

  describe('execute - calls function directly when disabled', () => {
    it('should bypass rate limiting when disabled', async () => {
      mockGetEnvBool.mockReturnValue(true);
      const registry = new RateLimitRegistry({ maxConcurrency: 10 });

      const callFn = vi.fn().mockResolvedValue('direct-result');
      const result = await registry.execute(mockProvider, callFn);

      expect(result).toBe('direct-result');
      expect(callFn).toHaveBeenCalledTimes(1);
      expect(mockProviderRateLimitStateConstructor).not.toHaveBeenCalled();
    });

    it('should propagate errors when disabled', async () => {
      mockGetEnvBool.mockReturnValue(true);
      const registry = new RateLimitRegistry({ maxConcurrency: 10 });

      const error = new Error('Test error');
      const callFn = vi.fn().mockRejectedValue(error);

      await expect(registry.execute(mockProvider, callFn)).rejects.toThrow('Test error');
    });
  });

  describe('execute - wraps calls through ProviderRateLimitState', () => {
    it('should call executeWithRetry on state', async () => {
      mockState.executeWithRetry.mockResolvedValue('state-result');
      const registry = new RateLimitRegistry({ maxConcurrency: 10 });

      const callFn = vi.fn().mockResolvedValue('call-result');
      const result = await registry.execute(mockProvider, callFn);

      expect(mockState.executeWithRetry).toHaveBeenCalledWith(
        expect.stringContaining('test-provider-'),
        callFn,
        {
          getHeaders: undefined,
          isRateLimited: undefined,
          getRetryAfter: undefined,
        },
      );
      expect(result).toBe('state-result');
    });

    it('should pass options to executeWithRetry', async () => {
      mockState.executeWithRetry.mockResolvedValue('result');
      const registry = new RateLimitRegistry({ maxConcurrency: 10 });

      const callFn = vi.fn();
      const getHeaders = vi.fn();
      const isRateLimited = vi.fn();
      const getRetryAfter = vi.fn();

      await registry.execute(mockProvider, callFn, {
        getHeaders,
        isRateLimited,
        getRetryAfter,
      });

      expect(mockState.executeWithRetry).toHaveBeenCalledWith(expect.any(String), callFn, {
        getHeaders,
        isRateLimited,
        getRetryAfter,
      });
    });

    it('should generate unique request IDs', async () => {
      mockState.executeWithRetry.mockResolvedValue('result');
      const registry = new RateLimitRegistry({ maxConcurrency: 10 });

      const callFn = vi.fn();
      const requestIds: string[] = [];

      // Capture request IDs from executeWithRetry calls
      mockState.executeWithRetry.mockImplementation(async (requestId: string) => {
        requestIds.push(requestId);
        return 'result';
      });

      await registry.execute(mockProvider, callFn);
      await registry.execute(mockProvider, callFn);

      expect(requestIds).toHaveLength(2);
      expect(requestIds[0]).not.toBe(requestIds[1]);
      expect(requestIds[0]).toMatch(/^test-provider-\d+-[a-z0-9]+$/);
    });
  });

  describe('execute - creates new state for new providers', () => {
    it('should create state on first call', async () => {
      mockState.executeWithRetry.mockResolvedValue('result');
      const registry = new RateLimitRegistry({ maxConcurrency: 10 });

      const callFn = vi.fn();
      await registry.execute(mockProvider, callFn);

      expect(mockProviderRateLimitStateConstructor).toHaveBeenCalledTimes(1);
      expect(mockProviderRateLimitStateConstructor).toHaveBeenCalledWith({
        rateLimitKey: 'test-provider',
        maxConcurrency: 10,
        minConcurrency: 1,
        queueTimeoutMs: 1,
      });
    });

    it('should setup event forwarding for new state', async () => {
      mockState.executeWithRetry.mockResolvedValue('result');
      const registry = new RateLimitRegistry({ maxConcurrency: 10 });

      const callFn = vi.fn();
      await registry.execute(mockProvider, callFn);

      // Verify state was created with event forwarding capability
      // Note: Full event forwarding is tested in the "Event forwarding" describe block
      expect(mockProviderRateLimitStateConstructor).toHaveBeenCalledTimes(1);
    });
  });

  describe('execute - reuses state for same provider', () => {
    it('should reuse existing state for same provider', async () => {
      mockState.executeWithRetry.mockResolvedValue('result');
      const registry = new RateLimitRegistry({ maxConcurrency: 10 });

      const callFn = vi.fn();
      await registry.execute(mockProvider, callFn);
      await registry.execute(mockProvider, callFn);
      await registry.execute(mockProvider, callFn);

      // State should only be created once
      expect(mockProviderRateLimitStateConstructor).toHaveBeenCalledTimes(1);
      expect(mockState.executeWithRetry).toHaveBeenCalledTimes(3);
    });
  });

  describe('execute - different API keys get different states (via rateLimitKey)', () => {
    it('should create separate states for different rate limit keys', async () => {
      mockState.executeWithRetry.mockResolvedValue('result');

      const provider1 = { id: () => 'provider-1', config: { apiKey: 'key1' } } as ApiProvider;
      const provider2 = { id: () => 'provider-2', config: { apiKey: 'key2' } } as ApiProvider;

      // Mock different rate limit keys
      mockGetRateLimitKey
        .mockReturnValueOnce('provider-1[abc123]')
        .mockReturnValueOnce('provider-2[def456]');

      // Create mock states for each provider
      const state1 = {
        executeWithRetry: vi.fn().mockResolvedValue('result1'),
        getMetrics: vi.fn().mockReturnValue({ queueDepth: 0 }),
        dispose: vi.fn(),
      };

      const state2 = {
        executeWithRetry: vi.fn().mockResolvedValue('result2'),
        getMetrics: vi.fn().mockReturnValue({ queueDepth: 0 }),
        dispose: vi.fn(),
      };

      // Queue the states to be returned by constructor
      mockStateQueue.push(state1, state2);

      const registry = new RateLimitRegistry({ maxConcurrency: 10 });

      const callFn = vi.fn();
      await registry.execute(provider1, callFn);
      await registry.execute(provider2, callFn);

      // Two different states should be created
      expect(mockProviderRateLimitStateConstructor).toHaveBeenCalledTimes(2);
      expect(mockProviderRateLimitStateConstructor).toHaveBeenNthCalledWith(1, {
        rateLimitKey: 'provider-1[abc123]',
        maxConcurrency: 10,
        minConcurrency: 1,
        queueTimeoutMs: 1,
      });
      expect(mockProviderRateLimitStateConstructor).toHaveBeenNthCalledWith(2, {
        rateLimitKey: 'provider-2[def456]',
        maxConcurrency: 10,
        minConcurrency: 1,
        queueTimeoutMs: 1,
      });
    });
  });

  describe('Event forwarding', () => {
    it('should emit request:started event', async () => {
      mockState.executeWithRetry.mockResolvedValue('result');
      const registry = new RateLimitRegistry({ maxConcurrency: 10 });

      const startedListener = vi.fn();
      registry.on('request:started', startedListener);

      const callFn = vi.fn();
      await registry.execute(mockProvider, callFn);

      expect(startedListener).toHaveBeenCalledWith({
        rateLimitKey: 'test-provider',
        requestId: expect.stringContaining('test-provider-'),
        queueDepth: 0,
      });
    });

    it('should emit request:completed event on success', async () => {
      mockState.executeWithRetry.mockResolvedValue('result');
      const registry = new RateLimitRegistry({ maxConcurrency: 10 });

      const completedListener = vi.fn();
      registry.on('request:completed', completedListener);

      const callFn = vi.fn();
      await registry.execute(mockProvider, callFn);

      expect(completedListener).toHaveBeenCalledWith({
        rateLimitKey: 'test-provider',
        requestId: expect.stringContaining('test-provider-'),
      });
    });

    it('should emit request:failed event on error', async () => {
      const error = new Error('Test failure');
      mockState.executeWithRetry.mockRejectedValue(error);
      const registry = new RateLimitRegistry({ maxConcurrency: 10 });

      const failedListener = vi.fn();
      registry.on('request:failed', failedListener);

      const callFn = vi.fn();
      await expect(registry.execute(mockProvider, callFn)).rejects.toThrow('Test failure');

      expect(failedListener).toHaveBeenCalledWith({
        rateLimitKey: 'test-provider',
        requestId: expect.stringContaining('test-provider-'),
        error: 'Error: Test failure',
      });
    });

    it('should forward ratelimit:hit events from state', async () => {
      mockState.executeWithRetry.mockImplementation(async function (this: any) {
        this.emit('ratelimit:hit', {
          rateLimitKey: 'test-provider',
          retryAfterMs: 1000,
          resetAt: Date.now() + 1000,
          concurrencyChange: { changed: true, previous: 10, current: 5, reason: 'ratelimit' },
        });
        return 'result';
      });

      const registry = new RateLimitRegistry({ maxConcurrency: 10 });
      const hitListener = vi.fn();
      registry.on('ratelimit:hit', hitListener);

      const callFn = vi.fn();
      await registry.execute(mockProvider, callFn);

      expect(hitListener).toHaveBeenCalledWith({
        rateLimitKey: 'test-provider',
        retryAfterMs: 1000,
        resetAt: expect.any(Number),
        concurrencyChange: { changed: true, previous: 10, current: 5, reason: 'ratelimit' },
      });
    });

    it('should forward concurrency:decreased events from state', async () => {
      mockState.executeWithRetry.mockImplementation(async function (this: any) {
        this.emit('concurrency:decreased', {
          rateLimitKey: 'test-provider',
          changed: true,
          previous: 10,
          current: 5,
          reason: 'ratelimit',
        });
        return 'result';
      });

      const registry = new RateLimitRegistry({ maxConcurrency: 10 });
      const decreasedListener = vi.fn();
      registry.on('concurrency:decreased', decreasedListener);

      const callFn = vi.fn();
      await registry.execute(mockProvider, callFn);

      expect(decreasedListener).toHaveBeenCalledWith({
        rateLimitKey: 'test-provider',
        changed: true,
        previous: 10,
        current: 5,
        reason: 'ratelimit',
      });
    });

    it('should forward concurrency:increased events from state', async () => {
      mockState.executeWithRetry.mockImplementation(async function (this: any) {
        this.emit('concurrency:increased', {
          rateLimitKey: 'test-provider',
          changed: true,
          previous: 5,
          current: 8,
          reason: 'recovery',
        });
        return 'result';
      });

      const registry = new RateLimitRegistry({ maxConcurrency: 10 });
      const increasedListener = vi.fn();
      registry.on('concurrency:increased', increasedListener);

      const callFn = vi.fn();
      await registry.execute(mockProvider, callFn);

      expect(increasedListener).toHaveBeenCalledWith({
        rateLimitKey: 'test-provider',
        changed: true,
        previous: 5,
        current: 8,
        reason: 'recovery',
      });
    });

    it('should forward ratelimit:warning events from state', async () => {
      mockState.executeWithRetry.mockImplementation(async function (this: any) {
        this.emit('ratelimit:warning', {
          rateLimitKey: 'test-provider',
          requestRatio: 0.05,
          tokenRatio: 0.08,
        });
        return 'result';
      });

      const registry = new RateLimitRegistry({ maxConcurrency: 10 });
      const warningListener = vi.fn();
      registry.on('ratelimit:warning', warningListener);

      const callFn = vi.fn();
      await registry.execute(mockProvider, callFn);

      expect(warningListener).toHaveBeenCalledWith({
        rateLimitKey: 'test-provider',
        requestRatio: 0.05,
        tokenRatio: 0.08,
      });
    });

    it('should forward ratelimit:learned events from state', async () => {
      mockState.executeWithRetry.mockImplementation(async function (this: any) {
        this.emit('ratelimit:learned', {
          rateLimitKey: 'test-provider',
          requestLimit: 100,
          tokenLimit: 50000,
        });
        return 'result';
      });

      const registry = new RateLimitRegistry({ maxConcurrency: 10 });
      const learnedListener = vi.fn();
      registry.on('ratelimit:learned', learnedListener);

      const callFn = vi.fn();
      await registry.execute(mockProvider, callFn);

      expect(learnedListener).toHaveBeenCalledWith({
        rateLimitKey: 'test-provider',
        requestLimit: 100,
        tokenLimit: 50000,
      });
    });

    it('should forward request:retrying events from state', async () => {
      mockState.executeWithRetry.mockImplementation(async function (this: any) {
        this.emit('request:retrying', {
          rateLimitKey: 'test-provider',
          attempt: 1,
          delayMs: 2000,
          reason: 'ratelimit',
        });
        return 'result';
      });

      const registry = new RateLimitRegistry({ maxConcurrency: 10 });
      const retryingListener = vi.fn();
      registry.on('request:retrying', retryingListener);

      const callFn = vi.fn();
      await registry.execute(mockProvider, callFn);

      expect(retryingListener).toHaveBeenCalledWith({
        rateLimitKey: 'test-provider',
        attempt: 1,
        delayMs: 2000,
        reason: 'ratelimit',
      });
    });
  });

  describe('getMetrics - returns metrics for all providers', () => {
    it('should return empty metrics when no providers have been used', () => {
      const registry = new RateLimitRegistry({ maxConcurrency: 10 });
      const metrics = registry.getMetrics();

      expect(metrics).toEqual({});
    });

    it('should return metrics for single provider', async () => {
      mockState.executeWithRetry.mockResolvedValue('result');
      vi.mocked(mockState.getMetrics).mockReturnValue({
        rateLimitKey: 'test-provider',
        activeRequests: 2,
        maxConcurrency: 10,
        queueDepth: 1,
        totalRequests: 5,
        completedRequests: 3,
        failedRequests: 0,
        rateLimitHits: 1,
        retriedRequests: 2,
        avgLatencyMs: 150,
        p50LatencyMs: 140,
        p99LatencyMs: 200,
      });

      const registry = new RateLimitRegistry({ maxConcurrency: 10 });

      const callFn = vi.fn();
      await registry.execute(mockProvider, callFn);

      const metrics = registry.getMetrics();
      expect(metrics).toEqual({
        'test-provider': {
          rateLimitKey: 'test-provider',
          activeRequests: 2,
          maxConcurrency: 10,
          queueDepth: 1,
          totalRequests: 5,
          completedRequests: 3,
          failedRequests: 0,
          rateLimitHits: 1,
          retriedRequests: 2,
          avgLatencyMs: 150,
          p50LatencyMs: 140,
          p99LatencyMs: 200,
        },
      });
    });

    it('should return metrics for multiple providers', async () => {
      const provider1 = { id: () => 'provider-1', config: {} } as ApiProvider;
      const provider2 = { id: () => 'provider-2', config: {} } as ApiProvider;

      // Mock different rate limit keys
      mockGetRateLimitKey
        .mockReturnValueOnce('provider-1')
        .mockReturnValueOnce('provider-2')
        .mockReturnValue('provider-1'); // For getMetrics calls

      // Create separate mock states
      const state1 = {
        executeWithRetry: vi.fn().mockResolvedValue('result1'),
        getMetrics: vi.fn().mockReturnValue({
          rateLimitKey: 'provider-1',
          activeRequests: 1,
          maxConcurrency: 10,
          queueDepth: 0,
          totalRequests: 10,
          completedRequests: 10,
          failedRequests: 0,
          rateLimitHits: 0,
          retriedRequests: 0,
          avgLatencyMs: 100,
          p50LatencyMs: 95,
          p99LatencyMs: 150,
        }),
        dispose: vi.fn(),
      };

      const state2 = {
        executeWithRetry: vi.fn().mockResolvedValue('result2'),
        getMetrics: vi.fn().mockReturnValue({
          rateLimitKey: 'provider-2',
          activeRequests: 3,
          maxConcurrency: 5,
          queueDepth: 2,
          totalRequests: 20,
          completedRequests: 15,
          failedRequests: 2,
          rateLimitHits: 3,
          retriedRequests: 5,
          avgLatencyMs: 200,
          p50LatencyMs: 180,
          p99LatencyMs: 300,
        }),
        dispose: vi.fn(),
      };

      mockStateQueue.push(state1, state2);

      const registry = new RateLimitRegistry({ maxConcurrency: 10 });

      const callFn = vi.fn();
      await registry.execute(provider1, callFn);
      await registry.execute(provider2, callFn);

      const metrics = registry.getMetrics();
      expect(Object.keys(metrics)).toHaveLength(2);
      expect(metrics['provider-1']).toBeDefined();
      expect(metrics['provider-2']).toBeDefined();
      expect(metrics['provider-1'].totalRequests).toBe(10);
      expect(metrics['provider-2'].totalRequests).toBe(20);
    });
  });

  describe('dispose - cleans up all states', () => {
    it('should dispose all states', async () => {
      mockState.executeWithRetry.mockResolvedValue('result');
      const registry = new RateLimitRegistry({ maxConcurrency: 10 });

      const callFn = vi.fn();
      await registry.execute(mockProvider, callFn);

      registry.dispose();

      expect(mockState.dispose).toHaveBeenCalledTimes(1);
    });

    it('should clear all states map', async () => {
      mockState.executeWithRetry.mockResolvedValue('result');
      const registry = new RateLimitRegistry({ maxConcurrency: 10 });

      const callFn = vi.fn();
      await registry.execute(mockProvider, callFn);

      expect(registry.getMetrics()).not.toEqual({});

      registry.dispose();

      expect(registry.getMetrics()).toEqual({});
    });

    it('should remove all event listeners', async () => {
      mockState.executeWithRetry.mockResolvedValue('result');
      const registry = new RateLimitRegistry({ maxConcurrency: 10 });

      const listener = vi.fn();
      registry.on('request:started', listener);
      registry.on('request:completed', listener);

      const callFn = vi.fn();
      await registry.execute(mockProvider, callFn);

      expect(registry.listenerCount('request:started')).toBe(1);
      expect(registry.listenerCount('request:completed')).toBe(1);

      registry.dispose();

      expect(registry.listenerCount('request:started')).toBe(0);
      expect(registry.listenerCount('request:completed')).toBe(0);
    });

    it('should dispose multiple states', async () => {
      const provider1 = { id: () => 'provider-1', config: {} } as ApiProvider;
      const provider2 = { id: () => 'provider-2', config: {} } as ApiProvider;

      mockGetRateLimitKey.mockReturnValueOnce('provider-1').mockReturnValueOnce('provider-2');

      const state1 = new EventEmitter() as any;
      state1.executeWithRetry = vi.fn().mockResolvedValue('result');
      state1.getMetrics = vi.fn().mockReturnValue({ queueDepth: 0 });
      state1.dispose = vi.fn();

      const state2 = new EventEmitter() as any;
      state2.executeWithRetry = vi.fn().mockResolvedValue('result');
      state2.getMetrics = vi.fn().mockReturnValue({ queueDepth: 0 });
      state2.dispose = vi.fn();

      mockStateQueue.push(state1, state2);

      const registry = new RateLimitRegistry({ maxConcurrency: 10 });

      const callFn = vi.fn();
      await registry.execute(provider1, callFn);
      await registry.execute(provider2, callFn);

      registry.dispose();

      expect(state1.dispose).toHaveBeenCalledTimes(1);
      expect(state2.dispose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error handling - propagates errors from callFn', () => {
    it('should propagate errors from executeWithRetry', async () => {
      const error = new Error('Execution failed');
      mockState.executeWithRetry.mockRejectedValue(error);
      const registry = new RateLimitRegistry({ maxConcurrency: 10 });

      const callFn = vi.fn();
      await expect(registry.execute(mockProvider, callFn)).rejects.toThrow('Execution failed');
    });

    it('should emit failed event before throwing', async () => {
      const error = new Error('Test error');
      mockState.executeWithRetry.mockRejectedValue(error);
      const registry = new RateLimitRegistry({ maxConcurrency: 10 });

      const failedListener = vi.fn();
      registry.on('request:failed', failedListener);

      const callFn = vi.fn();

      try {
        await registry.execute(mockProvider, callFn);
      } catch {
        // Expected
      }

      expect(failedListener).toHaveBeenCalledWith({
        rateLimitKey: 'test-provider',
        requestId: expect.any(String),
        error: 'Error: Test error',
      });
    });

    it('should not emit completed event on error', async () => {
      const error = new Error('Test error');
      mockState.executeWithRetry.mockRejectedValue(error);
      const registry = new RateLimitRegistry({ maxConcurrency: 10 });

      const completedListener = vi.fn();
      registry.on('request:completed', completedListener);

      const callFn = vi.fn();

      try {
        await registry.execute(mockProvider, callFn);
      } catch {
        // Expected
      }

      expect(completedListener).not.toHaveBeenCalled();
    });
  });

  describe('Multi-provider isolation - providers do not interfere', () => {
    it('should isolate execution between different providers', async () => {
      const provider1 = { id: () => 'provider-1', config: {} } as ApiProvider;
      const provider2 = { id: () => 'provider-2', config: {} } as ApiProvider;

      mockGetRateLimitKey
        .mockReturnValueOnce('provider-1')
        .mockReturnValueOnce('provider-2')
        .mockReturnValueOnce('provider-1')
        .mockReturnValueOnce('provider-2');

      const state1 = new EventEmitter() as any;
      state1.executeWithRetry = vi.fn().mockResolvedValue('result1');
      state1.getMetrics = vi.fn().mockReturnValue({ queueDepth: 0 });
      state1.dispose = vi.fn();

      const state2 = new EventEmitter() as any;
      state2.executeWithRetry = vi.fn().mockResolvedValue('result2');
      state2.getMetrics = vi.fn().mockReturnValue({ queueDepth: 0 });
      state2.dispose = vi.fn();

      mockStateQueue.push(state1, state2);

      const registry = new RateLimitRegistry({ maxConcurrency: 10 });

      const callFn1 = vi.fn();
      const callFn2 = vi.fn();

      await registry.execute(provider1, callFn1);
      await registry.execute(provider2, callFn2);
      await registry.execute(provider1, callFn1);
      await registry.execute(provider2, callFn2);

      // Each state should be called twice
      expect(state1.executeWithRetry).toHaveBeenCalledTimes(2);
      expect(state2.executeWithRetry).toHaveBeenCalledTimes(2);
    });

    it('should handle errors in one provider without affecting others', async () => {
      const provider1 = { id: () => 'provider-1', config: {} } as ApiProvider;
      const provider2 = { id: () => 'provider-2', config: {} } as ApiProvider;

      mockGetRateLimitKey
        .mockReturnValueOnce('provider-1')
        .mockReturnValueOnce('provider-2')
        .mockReturnValueOnce('provider-1');

      const state1 = new EventEmitter() as any;
      state1.executeWithRetry = vi.fn().mockRejectedValue(new Error('Provider 1 error'));
      state1.getMetrics = vi.fn().mockReturnValue({ queueDepth: 0 });
      state1.dispose = vi.fn();

      const state2 = new EventEmitter() as any;
      state2.executeWithRetry = vi.fn().mockResolvedValue('result2');
      state2.getMetrics = vi.fn().mockReturnValue({ queueDepth: 0 });
      state2.dispose = vi.fn();

      mockStateQueue.push(state1, state2);

      const registry = new RateLimitRegistry({ maxConcurrency: 10 });

      const callFn = vi.fn();

      // Provider 1 fails
      await expect(registry.execute(provider1, callFn)).rejects.toThrow('Provider 1 error');

      // Provider 2 succeeds
      const result2 = await registry.execute(provider2, callFn);
      expect(result2).toBe('result2');

      // Provider 1 still fails
      await expect(registry.execute(provider1, callFn)).rejects.toThrow('Provider 1 error');
    });
  });
});
