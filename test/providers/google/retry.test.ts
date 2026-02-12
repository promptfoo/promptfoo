import * as fs from 'fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as cache from '../../../src/cache';
import { GoogleProvider } from '../../../src/providers/google/provider';
import * as util from '../../../src/providers/google/util';
import * as fetchUtil from '../../../src/util/fetch/index';
import { getNunjucksEngineForFilePath } from '../../../src/util/file';
import * as templates from '../../../src/util/templates';
import * as timeUtil from '../../../src/util/time';

vi.mock('../../../src/cache', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    fetchWithCache: vi.fn(),
  };
});

vi.mock('../../../src/util/fetch/index', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    fetchWithProxy: vi.fn(),
  };
});

vi.mock('../../../src/providers/google/util', async () => ({
  ...(await vi.importActual('../../../src/providers/google/util')),
  maybeCoerceToGeminiFormat: vi.fn(),
  getGoogleClient: vi.fn().mockResolvedValue({
    client: {
      request: vi.fn().mockResolvedValue({
        data: {
          candidates: [{ content: { parts: [{ text: 'test response' }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
        },
      }),
    },
    credentials: {},
  }),
  loadCredentials: vi.fn().mockReturnValue({}),
  createAuthCacheDiscriminator: vi.fn().mockReturnValue(''),
}));

vi.mock('../../../src/util/templates', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    getNunjucksEngine: vi.fn(() => ({
      renderString: vi.fn((str: string) => str),
    })),
  };
});

const mockMaybeLoadToolsFromExternalFile = vi.hoisted(() => vi.fn((input: any) => input));
const mockMaybeLoadFromExternalFile = vi.hoisted(() => vi.fn((input: any) => input));

vi.mock('../../../src/util/file', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    getNunjucksEngineForFilePath: vi.fn(),
    maybeLoadToolsFromExternalFile: mockMaybeLoadToolsFromExternalFile,
    maybeLoadFromExternalFile: mockMaybeLoadFromExternalFile,
  };
});

vi.mock('../../../src/util/index', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    maybeLoadToolsFromExternalFile: mockMaybeLoadToolsFromExternalFile,
  };
});

vi.mock('glob', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    globSync: vi.fn().mockReturnValue([]),
  };
});

vi.mock('../../../src/envars', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    getEnvString: vi.fn().mockReturnValue(undefined),
  };
});

vi.mock('fs', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    statSync: vi.fn(),
  };
});

// Mock sleep to avoid actual delays in tests
vi.mock('../../../src/util/time', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    sleep: vi.fn().mockResolvedValue(undefined),
  };
});

const successResponse = {
  data: {
    candidates: [
      {
        content: { parts: [{ text: 'test response' }] },
        finishReason: 'STOP',
      },
    ],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
  },
  cached: false,
};

describe('GoogleProvider retry logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMaybeLoadToolsFromExternalFile.mockReset().mockImplementation((input: any) => input);
    mockMaybeLoadFromExternalFile.mockReset().mockImplementation((input: any) => input);
    vi.mocked(templates.getNunjucksEngine).mockImplementation(function () {
      return {
        renderString: vi.fn((str: string) => str),
      } as any;
    });
    vi.mocked(fs.existsSync).mockReset();
    vi.mocked(fs.readFileSync).mockReset();
    vi.mocked(fs.writeFileSync).mockReset();
    vi.mocked(fs.statSync).mockReset();
    vi.mocked(getNunjucksEngineForFilePath).mockImplementation(function () {
      return {
        renderString: vi.fn((str: string) => str),
      } as any;
    });
  });

  describe('AI Studio mode retries', () => {
    it('should retry on HTTP 503 and eventually succeed', async () => {
      const provider = new GoogleProvider('gemini-pro', {
        config: { apiKey: 'test-key', maxRetries: 2, baseRetryDelay: 10 },
      });

      const error503 = new Error('Service Unavailable');
      (error503 as any).response = { status: 503 };

      vi.mocked(cache.fetchWithCache)
        .mockRejectedValueOnce(error503)
        .mockResolvedValueOnce(successResponse as any);

      const result = await provider.callApi('test prompt');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('test response');
      expect(cache.fetchWithCache).toHaveBeenCalledTimes(2);
      expect(timeUtil.sleep).toHaveBeenCalledTimes(1);
    });

    it('should retry on HTTP 429 rate limit errors', async () => {
      const provider = new GoogleProvider('gemini-pro', {
        config: { apiKey: 'test-key', maxRetries: 2, baseRetryDelay: 10 },
      });

      const error429 = new Error('Rate limit exceeded');
      (error429 as any).response = { status: 429 };

      vi.mocked(cache.fetchWithCache)
        .mockRejectedValueOnce(error429)
        .mockResolvedValueOnce(successResponse as any);

      const result = await provider.callApi('test prompt');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('test response');
      expect(cache.fetchWithCache).toHaveBeenCalledTimes(2);
    });

    it('should retry on ECONNRESET network errors', async () => {
      const provider = new GoogleProvider('gemini-pro', {
        config: { apiKey: 'test-key', maxRetries: 2, baseRetryDelay: 10 },
      });

      const networkError = new Error('Connection reset');
      (networkError as any).code = 'ECONNRESET';

      vi.mocked(cache.fetchWithCache)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(successResponse as any);

      const result = await provider.callApi('test prompt');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('test response');
      expect(cache.fetchWithCache).toHaveBeenCalledTimes(2);
    });

    it('should retry on ETIMEDOUT network errors', async () => {
      const provider = new GoogleProvider('gemini-pro', {
        config: { apiKey: 'test-key', maxRetries: 2, baseRetryDelay: 10 },
      });

      const networkError = new Error('Connection timed out');
      (networkError as any).code = 'ETIMEDOUT';

      vi.mocked(cache.fetchWithCache)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(successResponse as any);

      const result = await provider.callApi('test prompt');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('test response');
      expect(cache.fetchWithCache).toHaveBeenCalledTimes(2);
    });

    it('should retry on "overloaded" error messages', async () => {
      const provider = new GoogleProvider('gemini-pro', {
        config: { apiKey: 'test-key', maxRetries: 2, baseRetryDelay: 10 },
      });

      const overloadedError = new Error('The model is overloaded. Please try again later.');

      vi.mocked(cache.fetchWithCache)
        .mockRejectedValueOnce(overloadedError)
        .mockResolvedValueOnce(successResponse as any);

      const result = await provider.callApi('test prompt');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('test response');
    });

    it('should NOT retry on HTTP 400 client errors', async () => {
      const provider = new GoogleProvider('gemini-pro', {
        config: { apiKey: 'test-key', maxRetries: 2, baseRetryDelay: 10 },
      });

      const error400 = new Error('Bad Request');
      (error400 as any).response = { status: 400 };

      vi.mocked(cache.fetchWithCache).mockRejectedValueOnce(error400);

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('API call error');
      expect(cache.fetchWithCache).toHaveBeenCalledTimes(1);
      expect(timeUtil.sleep).not.toHaveBeenCalled();
    });

    it('should NOT retry on HTTP 401 auth errors', async () => {
      const provider = new GoogleProvider('gemini-pro', {
        config: { apiKey: 'test-key', maxRetries: 2, baseRetryDelay: 10 },
      });

      const error401 = new Error('Unauthorized');
      (error401 as any).response = { status: 401 };

      vi.mocked(cache.fetchWithCache).mockRejectedValueOnce(error401);

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('API call error');
      expect(cache.fetchWithCache).toHaveBeenCalledTimes(1);
    });

    it('should exhaust all retries and return error on persistent failures', async () => {
      const provider = new GoogleProvider('gemini-pro', {
        config: { apiKey: 'test-key', maxRetries: 2, baseRetryDelay: 10 },
      });

      const error503 = new Error('Service Unavailable');
      (error503 as any).response = { status: 503 };

      vi.mocked(cache.fetchWithCache)
        .mockRejectedValueOnce(error503)
        .mockRejectedValueOnce(error503)
        .mockRejectedValueOnce(error503);

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('API call error');
      // 1 initial + 2 retries = 3 total attempts
      expect(cache.fetchWithCache).toHaveBeenCalledTimes(3);
      expect(timeUtil.sleep).toHaveBeenCalledTimes(2);
    });

    it('should disable retries when maxRetries is 0', async () => {
      const provider = new GoogleProvider('gemini-pro', {
        config: { apiKey: 'test-key', maxRetries: 0 },
      });

      const error503 = new Error('Service Unavailable');
      (error503 as any).response = { status: 503 };

      vi.mocked(cache.fetchWithCache).mockRejectedValueOnce(error503);

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('API call error');
      expect(cache.fetchWithCache).toHaveBeenCalledTimes(1);
      expect(timeUtil.sleep).not.toHaveBeenCalled();
    });

    it('should default to 3 retries when maxRetries is not specified', async () => {
      const provider = new GoogleProvider('gemini-pro', {
        config: { apiKey: 'test-key' },
      });

      const error503 = new Error('Service Unavailable');
      (error503 as any).response = { status: 503 };

      vi.mocked(cache.fetchWithCache)
        .mockRejectedValueOnce(error503)
        .mockRejectedValueOnce(error503)
        .mockRejectedValueOnce(error503)
        .mockRejectedValueOnce(error503);

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('API call error');
      // 1 initial + 3 retries = 4 total attempts
      expect(cache.fetchWithCache).toHaveBeenCalledTimes(4);
      expect(timeUtil.sleep).toHaveBeenCalledTimes(3);
    });
  });

  describe('Vertex AI Express mode retries', () => {
    it('should retry on HTTP 503 in express mode', async () => {
      const provider = new GoogleProvider('gemini-pro', {
        config: {
          vertexai: true,
          apiKey: 'test-vertex-key',
          maxRetries: 2,
          baseRetryDelay: 10,
        },
      });

      // First call returns 503, second succeeds
      vi.mocked(fetchUtil.fetchWithProxy)
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          json: vi.fn().mockResolvedValue({ error: { message: 'overloaded' } }),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            candidates: [
              {
                content: { parts: [{ text: 'retry success' }] },
                finishReason: 'STOP',
              },
            ],
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 20,
              totalTokenCount: 30,
            },
          }),
        } as any);

      const result = await provider.callApi('test prompt');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('retry success');
      expect(fetchUtil.fetchWithProxy).toHaveBeenCalledTimes(2);
    });

    it('should retry on HTTP 429 in express mode', async () => {
      const provider = new GoogleProvider('gemini-pro', {
        config: {
          vertexai: true,
          apiKey: 'test-vertex-key',
          maxRetries: 1,
          baseRetryDelay: 10,
        },
      });

      vi.mocked(fetchUtil.fetchWithProxy)
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          json: vi.fn().mockResolvedValue({ error: { message: 'rate limited' } }),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            candidates: [
              {
                content: { parts: [{ text: 'after rate limit' }] },
                finishReason: 'STOP',
              },
            ],
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 20,
              totalTokenCount: 30,
            },
          }),
        } as any);

      const result = await provider.callApi('test prompt');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('after rate limit');
    });

    it('should NOT retry on HTTP 400 in express mode', async () => {
      const provider = new GoogleProvider('gemini-pro', {
        config: {
          vertexai: true,
          apiKey: 'test-vertex-key',
          maxRetries: 2,
          baseRetryDelay: 10,
        },
      });

      vi.mocked(fetchUtil.fetchWithProxy).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: vi.fn().mockResolvedValue({ error: { message: 'invalid request' } }),
      } as any);

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('API call error');
      expect(fetchUtil.fetchWithProxy).toHaveBeenCalledTimes(1);
      expect(timeUtil.sleep).not.toHaveBeenCalled();
    });
  });

  describe('Vertex AI OAuth mode retries', () => {
    it('should retry on HTTP 503 in OAuth mode', async () => {
      const error503 = new Error('Service Unavailable');
      (error503 as any).response = { status: 503 };

      const mockRequest = vi
        .fn()
        .mockRejectedValueOnce(error503)
        .mockResolvedValueOnce({
          data: {
            candidates: [
              {
                content: { parts: [{ text: 'oauth retry success' }] },
                finishReason: 'STOP',
              },
            ],
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 20,
              totalTokenCount: 30,
            },
          },
        });

      vi.mocked(util.getGoogleClient).mockResolvedValue({
        client: { request: mockRequest },
        credentials: {},
      } as any);

      const provider = new GoogleProvider('gemini-pro', {
        config: {
          vertexai: true,
          projectId: 'test-project',
          maxRetries: 2,
          baseRetryDelay: 10,
        },
      });

      const result = await provider.callApi('test prompt');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('oauth retry success');
      expect(mockRequest).toHaveBeenCalledTimes(2);
    });
  });

  describe('exponential backoff', () => {
    it('should use increasing delays between retries', async () => {
      const provider = new GoogleProvider('gemini-pro', {
        config: { apiKey: 'test-key', maxRetries: 3, baseRetryDelay: 100 },
      });

      const error503 = new Error('Service Unavailable');
      (error503 as any).response = { status: 503 };

      vi.mocked(cache.fetchWithCache)
        .mockRejectedValueOnce(error503)
        .mockRejectedValueOnce(error503)
        .mockRejectedValueOnce(error503)
        .mockResolvedValueOnce(successResponse as any);

      // Mock Math.random to make jitter deterministic
      const mockRandom = vi.spyOn(Math, 'random').mockReturnValue(0.5);

      await provider.callApi('test prompt');

      // Check that sleep was called with increasing delays
      // attempt 0: 100 * 2^0 + 0.5 * 100 = 150
      // attempt 1: 100 * 2^1 + 0.5 * 100 = 250
      // attempt 2: 100 * 2^2 + 0.5 * 100 = 450
      expect(timeUtil.sleep).toHaveBeenCalledTimes(3);
      expect(timeUtil.sleep).toHaveBeenNthCalledWith(1, 150);
      expect(timeUtil.sleep).toHaveBeenNthCalledWith(2, 250);
      expect(timeUtil.sleep).toHaveBeenNthCalledWith(3, 450);

      mockRandom.mockRestore();
    });
  });

  describe('error detection', () => {
    it('should detect retryable errors from cause.code', async () => {
      const provider = new GoogleProvider('gemini-pro', {
        config: { apiKey: 'test-key', maxRetries: 1, baseRetryDelay: 10 },
      });

      const networkError = new Error('fetch failed');
      (networkError as any).cause = { code: 'ECONNRESET' };

      vi.mocked(cache.fetchWithCache)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(successResponse as any);

      const result = await provider.callApi('test prompt');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('test response');
      expect(cache.fetchWithCache).toHaveBeenCalledTimes(2);
    });

    it('should detect retryable errors from "service unavailable" message', async () => {
      const provider = new GoogleProvider('gemini-pro', {
        config: { apiKey: 'test-key', maxRetries: 1, baseRetryDelay: 10 },
      });

      const error = new Error('503 Service Unavailable - the service is temporarily unavailable');

      vi.mocked(cache.fetchWithCache)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(successResponse as any);

      const result = await provider.callApi('test prompt');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('test response');
    });

    it('should detect retryable errors from ECONNREFUSED', async () => {
      const provider = new GoogleProvider('gemini-pro', {
        config: { apiKey: 'test-key', maxRetries: 1, baseRetryDelay: 10 },
      });

      const networkError = new Error('Connection refused');
      (networkError as any).code = 'ECONNREFUSED';

      vi.mocked(cache.fetchWithCache)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(successResponse as any);

      const result = await provider.callApi('test prompt');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('test response');
    });
  });
});
