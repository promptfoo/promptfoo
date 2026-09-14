import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withProviderCallExecutionContext } from '../../src/scheduler/providerCallExecutionContext';
import {
  isRateLimitWrapped,
  wrapProvidersWithRateLimiting,
  wrapProviderWithRateLimiting,
} from '../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { createMockProvider } from '../factories/provider';
import { mockProcessEnv } from '../util/utils';

import type { ApiProvider, ProviderResponse } from '../../src/types/providers';

describe('providerWrapper', () => {
  let mockProvider: ApiProvider;
  let mockRegistry: RateLimitRegistry;
  let mockExecute: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockExecute = vi.fn();

    mockProvider = createMockProvider({
      response: { output: 'test output' },
      config: { apiKey: 'test-key' },
    });

    // Create a mock registry with the execute method
    mockRegistry = {
      execute: mockExecute,
    } as unknown as RateLimitRegistry;
  });

  describe('wrapProviderWithRateLimiting', () => {
    it.each(['call', 'call-with-context', 'context'])(
      'cancels a queued provider through its %s signal',
      async (source) => {
        const restoreEnv = mockProcessEnv({ PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: 'false' });
        const registry = new RateLimitRegistry({ maxConcurrency: 1, queueTimeoutMs: 0 });
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => {
          markStarted = resolve;
        });
        let finishActive!: (response: ProviderResponse) => void;
        const active = new Promise<ProviderResponse>((resolve) => {
          finishActive = resolve;
        });
        const provider = createMockProvider({
          config: { maxRetries: 0 },
          callApi: async (prompt) => {
            if (prompt === 'active') {
              markStarted();
              return active;
            }
            return { output: 'queued' };
          },
        });
        const wrapped = wrapProviderWithRateLimiting(provider, registry);
        const first = wrapped.callApi('active');
        await started;
        const callController = new AbortController();
        const contextController = new AbortController();
        const queued = withProviderCallExecutionContext(
          source === 'call' ? {} : { queuedCallAbortSignal: contextController.signal },
          () => wrapped.callApi('queued', undefined, { abortSignal: callController.signal }),
        ).catch((error: unknown) => error);
        const reason = new Error('queued call cancelled');
        try {
          expect(Object.values(registry.getMetrics())[0].queueDepth).toBe(1);
          (source === 'context' ? contextController : callController).abort(reason);
          expect(Object.values(registry.getMetrics())[0].queueDepth).toBe(0);
          expect(await queued).toBe(reason);
          expect(provider.callApi).toHaveBeenCalledTimes(1);
        } finally {
          finishActive({ output: 'active' });
          await first;
          await queued;
          registry.dispose();
          restoreEnv();
        }
      },
    );

    it('should wrap provider callApi with registry.execute', async () => {
      mockExecute.mockImplementation(async (_provider, callFn) => callFn());

      const wrappedProvider = wrapProviderWithRateLimiting(mockProvider, mockRegistry);
      await wrappedProvider.callApi('test prompt');

      expect(mockExecute).toHaveBeenCalledTimes(1);
      expect(mockExecute).toHaveBeenCalledWith(
        mockProvider,
        expect.any(Function),
        expect.objectContaining({
          getHeaders: expect.any(Function),
          isRateLimited: expect.any(Function),
          getRetryAfter: expect.any(Function),
        }),
      );
    });

    it('should preserve other provider properties', () => {
      const wrappedProvider = wrapProviderWithRateLimiting(mockProvider, mockRegistry);

      expect(wrappedProvider.id()).toBe('test-provider');
      expect(wrappedProvider.config).toEqual({ apiKey: 'test-key' });
    });

    it('should preserve id() method from class prototype', () => {
      // This tests the specific bug where spread operator doesn't copy prototype methods.
      // When a provider is a class instance, id() is on the prototype, not an own property.
      class TestProvider implements ApiProvider {
        callApi = vi.fn().mockResolvedValue({ output: 'test' });

        id(): string {
          return 'class-based-provider';
        }
      }

      const classProvider = new TestProvider();
      const wrappedProvider = wrapProviderWithRateLimiting(classProvider, mockRegistry);

      // Verify that id() works on the wrapped provider
      expect(wrappedProvider.id()).toBe('class-based-provider');
    });

    it('should not double-wrap already wrapped providers', () => {
      const wrappedOnce = wrapProviderWithRateLimiting(mockProvider, mockRegistry);
      const wrappedTwice = wrapProviderWithRateLimiting(wrappedOnce, mockRegistry);

      expect(wrappedOnce).toBe(wrappedTwice);
    });

    it('should mark wrapped provider with symbol', () => {
      const wrappedProvider = wrapProviderWithRateLimiting(mockProvider, mockRegistry);

      expect(isRateLimitWrapped(wrappedProvider)).toBe(true);
      expect(isRateLimitWrapped(mockProvider)).toBe(false);
    });
  });

  describe('wrapProvidersWithRateLimiting', () => {
    it('should wrap multiple providers', () => {
      const provider1 = createMockProvider({ id: 'provider-1' });
      const provider2 = createMockProvider({ id: 'provider-2' });

      const wrappedProviders = wrapProvidersWithRateLimiting([provider1, provider2], mockRegistry);

      expect(wrappedProviders).toHaveLength(2);
      expect(isRateLimitWrapped(wrappedProviders[0])).toBe(true);
      expect(isRateLimitWrapped(wrappedProviders[1])).toBe(true);
    });
  });

  describe('rate limit detection callbacks', () => {
    it('should detect rate limit from HTTP 429 status', async () => {
      let capturedOptions: any;
      mockExecute.mockImplementation(async (_provider, callFn, options) => {
        capturedOptions = options;
        return callFn();
      });

      const wrappedProvider = wrapProviderWithRateLimiting(mockProvider, mockRegistry);
      await wrappedProvider.callApi('test');

      const result: ProviderResponse = {
        output: 'test',
        metadata: { http: { status: 429, statusText: 'Too Many Requests', headers: {} } },
      };
      expect(capturedOptions.isRateLimited(result, undefined)).toBe(true);
    });

    it('should detect explicit transient rate limit metadata without error text parsing', async () => {
      let capturedOptions: any;
      mockExecute.mockImplementation(async (_provider, callFn, options) => {
        capturedOptions = options;
        return callFn();
      });

      const wrappedProvider = wrapProviderWithRateLimiting(mockProvider, mockRegistry);
      await wrappedProvider.callApi('test');

      const result: ProviderResponse = {
        error: 'SDK throttle',
        metadata: { rateLimitKind: 'rate_limit' },
      };
      expect(capturedOptions.isRateLimited(result, undefined)).toBe(true);
    });

    it('should detect rate limit from error message', async () => {
      let capturedOptions: any;
      mockExecute.mockImplementation(async (_provider, callFn, options) => {
        capturedOptions = options;
        return callFn();
      });

      const wrappedProvider = wrapProviderWithRateLimiting(mockProvider, mockRegistry);
      await wrappedProvider.callApi('test');

      const error = new Error('Error 429: rate limit exceeded');
      expect(capturedOptions.isRateLimited(undefined, error)).toBe(true);
    });

    it('should extract headers from metadata.http.headers', async () => {
      let capturedOptions: any;
      mockExecute.mockImplementation(async (_provider, callFn, options) => {
        capturedOptions = options;
        return callFn();
      });

      const wrappedProvider = wrapProviderWithRateLimiting(mockProvider, mockRegistry);
      await wrappedProvider.callApi('test');

      const result: ProviderResponse = {
        output: 'test',
        metadata: {
          http: {
            status: 200,
            statusText: 'OK',
            headers: { 'retry-after': '60' },
          },
        },
      };

      const headers = capturedOptions.getHeaders(result);
      expect(headers).toEqual({ 'retry-after': '60' });
    });

    it('should parse retry-after header', async () => {
      let capturedOptions: any;
      mockExecute.mockImplementation(async (_provider, callFn, options) => {
        capturedOptions = options;
        return callFn();
      });

      const wrappedProvider = wrapProviderWithRateLimiting(mockProvider, mockRegistry);
      await wrappedProvider.callApi('test');

      const result: ProviderResponse = {
        output: 'test',
        metadata: {
          http: {
            status: 429,
            statusText: 'Too Many Requests',
            headers: { 'Retry-After': '30' },
          },
        },
      };

      // Headers are normalized to lowercase in getRetryAfter
      const retryAfter = capturedOptions.getRetryAfter(result, undefined);
      expect(retryAfter).toBe(30000); // 30 seconds in ms
    });

    it('should ignore non-finite retry-after-ms and fall back to retry-after', async () => {
      let capturedOptions: any;
      mockExecute.mockImplementation(async (_provider, callFn, options) => {
        capturedOptions = options;
        return callFn();
      });

      const wrappedProvider = wrapProviderWithRateLimiting(mockProvider, mockRegistry);
      await wrappedProvider.callApi('test');

      const result: ProviderResponse = {
        output: 'test',
        metadata: {
          http: {
            status: 429,
            statusText: 'Too Many Requests',
            headers: { 'retry-after-ms': '9'.repeat(400), 'retry-after': '30' },
          },
        },
      };

      expect(capturedOptions.getRetryAfter(result, undefined)).toBe(30000);
    });

    it('should ignore a non-finite retry-after parsed from the error message', async () => {
      let capturedOptions: any;
      mockExecute.mockImplementation(async (_provider, callFn, options) => {
        capturedOptions = options;
        return callFn();
      });

      const wrappedProvider = wrapProviderWithRateLimiting(mockProvider, mockRegistry);
      await wrappedProvider.callApi('test');

      const overflowingRetryAfter = `retry after ${'9'.repeat(400)}`;
      const error = new Error(overflowingRetryAfter);
      expect(capturedOptions.getRetryAfter(undefined, error)).toBeUndefined();
    });
  });
});
