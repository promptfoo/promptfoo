import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isRateLimitWrapped,
  wrapProvidersWithRateLimiting,
  wrapProviderWithRateLimiting,
} from '../../src/scheduler/providerWrapper';

import type { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import type { ApiProvider, ProviderResponse } from '../../src/types/providers';

describe('providerWrapper', () => {
  let mockProvider: ApiProvider;
  let mockRegistry: RateLimitRegistry;
  let mockExecute: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockExecute = vi.fn();

    mockProvider = {
      id: () => 'test-provider',
      callApi: vi.fn().mockResolvedValue({ output: 'test output' }),
      config: { apiKey: 'test-key' },
    } as unknown as ApiProvider;

    // Create a mock registry with the execute method
    mockRegistry = {
      execute: mockExecute,
    } as unknown as RateLimitRegistry;
  });

  describe('wrapProviderWithRateLimiting', () => {
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
      const provider1 = { ...mockProvider, id: () => 'provider-1' } as ApiProvider;
      const provider2 = { ...mockProvider, id: () => 'provider-2' } as ApiProvider;

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
  });
});
