import * as fs from 'fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as cache from '../../../src/cache';
import { AIStudioChatProvider } from '../../../src/providers/google/ai.studio';
import * as util from '../../../src/providers/google/util';
import { VertexChatProvider } from '../../../src/providers/google/vertex';
import { createProviderRateLimitOptions } from '../../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../../src/scheduler/rateLimitRegistry';
import { HttpRateLimitError } from '../../../src/util/fetch/errors';
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

vi.mock('../../../src/providers/google/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/providers/google/auth')>();
  return {
    ...actual,
    GoogleAuthManager: {
      ...actual.GoogleAuthManager,
      determineVertexMode: actual.GoogleAuthManager.determineVertexMode.bind(
        actual.GoogleAuthManager,
      ),
      validateAndWarn: vi.fn(),
      resolveProjectId: vi.fn().mockImplementation(async (config: any) => {
        return config?.projectId || 'test-project';
      }),
      resolveRegion: actual.GoogleAuthManager.resolveRegion.bind(actual.GoogleAuthManager),
      getApiKey: actual.GoogleAuthManager.getApiKey.bind(actual.GoogleAuthManager),
    },
    loadCredentials: vi.fn().mockReturnValue(undefined),
    resolveProjectId: vi.fn().mockImplementation(async (config: any) => {
      return config?.projectId || 'test-project';
    }),
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
  const sleep = vi.fn().mockResolvedValue(undefined);
  return {
    ...(await importOriginal()),
    sleep,
    sleepWithAbort: vi.fn((ms: number) => sleep(ms)),
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

function mockGoogleClientRequest(
  request = vi.fn().mockResolvedValue({ data: successResponse.data }),
) {
  vi.mocked(util.getGoogleClient).mockResolvedValue({
    client: { request },
    credentials: {},
  } as any);
}

describe('Google Gemini provider retry logic', () => {
  beforeEach(() => {
    cache.disableCache();
    vi.resetAllMocks();
    vi.mocked(cache.fetchWithCache).mockReset();
    vi.mocked(fetchUtil.fetchWithProxy).mockReset();
    vi.mocked(timeUtil.sleep).mockReset().mockResolvedValue(undefined);
    vi.mocked(timeUtil.sleepWithAbort)
      .mockReset()
      .mockImplementation(async (ms: number) => {
        await timeUtil.sleep(ms);
      });
    mockGoogleClientRequest();
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

  afterEach(() => {
    cache.enableCache();
  });

  describe('AI Studio mode retries', () => {
    it('should retry on returned HTTP 503 responses and eventually succeed', async () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
        config: { apiKey: 'test-key', maxRetries: 2, baseRetryDelay: 10 },
      });

      vi.mocked(cache.fetchWithCache)
        .mockResolvedValueOnce({
          data: { error: { code: 503, message: 'Service Unavailable' } },
          cached: false,
          status: 503,
          statusText: 'Service Unavailable',
        } as any)
        .mockResolvedValueOnce(successResponse as any);

      const result = await provider.callApi('test prompt');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('test response');
      expect(cache.fetchWithCache).toHaveBeenCalledTimes(2);
      expect(timeUtil.sleep).toHaveBeenCalledTimes(1);
      expect(vi.mocked(cache.fetchWithCache).mock.calls[0][5]).toBe(0);
      expect(vi.mocked(cache.fetchWithCache).mock.calls[0][1]).not.toHaveProperty('signal');
      expect(vi.mocked(cache.fetchWithCache).mock.calls[0][2]).toBeGreaterThan(0);
      expect(vi.mocked(cache.fetchWithCache).mock.calls[0][2]).toBeLessThanOrEqual(300_000);
    });

    it('should return HTTP metadata when returned 503 responses exhaust retries', async () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
        config: { apiKey: 'test-key', maxRetries: 1, baseRetryDelay: 0 },
      });
      const deleteFromCache = vi.fn().mockResolvedValue(undefined);
      vi.mocked(cache.fetchWithCache).mockResolvedValue({
        data: { error: { code: 503, message: 'temporarily unavailable' } },
        cached: false,
        status: 503,
        statusText: 'Service Unavailable',
        headers: new Headers({ 'retry-after': '0', 'set-cookie': 'secret=value' }),
        deleteFromCache,
      } as any);

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('503 Service Unavailable');
      expect(result.metadata).toEqual({
        http: {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'retry-after': '0' },
        },
      });
      expect(cache.fetchWithCache).toHaveBeenCalledTimes(2);
      expect(deleteFromCache).toHaveBeenCalledOnce();
    });

    it('should retry empty candidates and evict the invalid cached response', async () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
        config: { apiKey: 'test-key', maxRetries: 1, baseRetryDelay: 10 },
      });
      const deleteFromCache = vi.fn().mockResolvedValue(undefined);

      vi.mocked(cache.fetchWithCache)
        .mockResolvedValueOnce({
          data: { candidates: [] },
          cached: false,
          status: 200,
          deleteFromCache,
        } as any)
        .mockResolvedValueOnce(successResponse as any);

      const result = await provider.callApi('test prompt');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('test response');
      expect(cache.fetchWithCache).toHaveBeenCalledTimes(2);
      expect(deleteFromCache).toHaveBeenCalledOnce();
      expect(timeUtil.sleep).toHaveBeenCalledTimes(1);
    });

    it('should aggregate request, token, and cost accounting across responses', async () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
        config: {
          apiKey: 'test-key',
          maxRetries: 1,
          baseRetryDelay: 0,
          inputCost: 0.01,
          outputCost: 0.02,
        },
      });

      vi.mocked(cache.fetchWithCache)
        .mockResolvedValueOnce({
          data: {
            candidates: [],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 1, totalTokenCount: 11 },
          },
          cached: false,
          status: 200,
          statusText: 'OK',
        } as any)
        .mockResolvedValueOnce({
          data: {
            candidates: [{ content: { parts: [{ text: 'accounted' }] }, finishReason: 'STOP' }],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2, totalTokenCount: 12 },
          },
          cached: false,
          status: 200,
          statusText: 'OK',
        } as any);

      const result = await provider.callApi('test prompt');

      expect(result.output).toBe('accounted');
      expect(result.tokenUsage).toMatchObject({
        prompt: 20,
        completion: 3,
        total: 23,
        numRequests: 2,
      });
      expect(result.cost).toBeCloseTo(0.26);
    });

    it('should honor Retry-After from structured rate-limit errors', async () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
        config: { apiKey: 'test-key', maxRetries: 1, baseRetryDelay: 1 },
      });
      const rateLimitError = new HttpRateLimitError({
        status: 429,
        retryAfterMs: 2500,
      });
      vi.mocked(cache.fetchWithCache)
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(successResponse as any);
      const random = vi.spyOn(Math, 'random').mockReturnValue(0);

      const result = await provider.callApi('test prompt');

      expect(result.output).toBe('test response');
      expect(timeUtil.sleep).toHaveBeenCalledWith(2500);
      random.mockRestore();
    });

    it('should fail fast on structured hard quota errors', async () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
        config: { apiKey: 'test-key', maxRetries: 3, baseRetryDelay: 0 },
      });
      vi.mocked(cache.fetchWithCache).mockRejectedValueOnce(
        new HttpRateLimitError({
          status: 429,
          code: 'insufficient_quota',
          retryAfterMs: 1000,
        }),
      );

      const result = await provider.callApi('test prompt');

      expect(cache.fetchWithCache).toHaveBeenCalledOnce();
      expect(timeUtil.sleep).not.toHaveBeenCalled();
      expect(result.metadata?.rateLimitKind).toBe('quota');
    });

    it('should fail fast on Google daily quota details', async () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
        config: { apiKey: 'test-key', maxRetries: 3, baseRetryDelay: 0 },
      });
      vi.mocked(cache.fetchWithCache).mockRejectedValueOnce(
        new HttpRateLimitError({
          status: 429,
          body: {
            error: {
              details: [
                {
                  violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }],
                },
              ],
            },
          },
        }),
      );

      const result = await provider.callApi('test prompt');

      expect(cache.fetchWithCache).toHaveBeenCalledOnce();
      expect(timeUtil.sleep).not.toHaveBeenCalled();
      expect(result.metadata?.rateLimitKind).toBe('quota');
    });

    it('should stop before a second request when cancelled during backoff', async () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
        config: { apiKey: 'test-key', maxRetries: 2, baseRetryDelay: 1000 },
      });
      const controller = new AbortController();
      const error503 = Object.assign(new Error('Service Unavailable'), {
        response: { status: 503 },
      });
      vi.mocked(cache.fetchWithCache).mockRejectedValue(error503);
      vi.mocked(timeUtil.sleepWithAbort).mockImplementationOnce(
        (_ms: number, signal: AbortSignal) =>
          new Promise((_, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), { once: true });
          }),
      );

      const pending = provider.callApi('test prompt', undefined, {
        abortSignal: controller.signal,
      });
      await vi.waitFor(() => expect(cache.fetchWithCache).toHaveBeenCalledOnce());
      expect(vi.mocked(cache.fetchWithCache).mock.calls[0][1]).toEqual(
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      controller.abort(new DOMException('cancelled', 'AbortError'));

      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      expect(cache.fetchWithCache).toHaveBeenCalledOnce();
    });

    it('should not multiply provider retries through the scheduler', async () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
        config: { apiKey: 'test-key', maxRetries: 1, baseRetryDelay: 0 },
      });
      const registry = new RateLimitRegistry({ maxConcurrency: 1 });
      const rateLimitError = new HttpRateLimitError({ status: 429, retryAfterMs: 0 });
      vi.mocked(cache.fetchWithCache).mockRejectedValue(rateLimitError);

      const result = await registry.execute(
        provider,
        () => provider.callApi('test prompt'),
        createProviderRateLimitOptions(),
      );

      expect(result.error).toContain('429');
      expect(cache.fetchWithCache).toHaveBeenCalledTimes(2);
      expect(result.tokenUsage?.numRequests).toBe(2);
      expect(Object.values(registry.getMetrics())[0]?.rateLimitHits).toBe(1);
      registry.dispose();
    });

    it('should retry candidates that contain no output', async () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
        config: { apiKey: 'test-key', maxRetries: 1, baseRetryDelay: 10 },
      });
      const deleteFromCache = vi.fn().mockResolvedValue(undefined);

      vi.mocked(cache.fetchWithCache)
        .mockResolvedValueOnce({
          data: { candidates: [{ finishReason: 'STOP' }] },
          cached: false,
          status: 200,
          deleteFromCache,
        } as any)
        .mockResolvedValueOnce(successResponse as any);

      const result = await provider.callApi('test prompt');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('test response');
      expect(cache.fetchWithCache).toHaveBeenCalledTimes(2);
      expect(deleteFromCache).toHaveBeenCalledOnce();
    });

    it('should not retry safety-blocked empty candidates', async () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
        config: { apiKey: 'test-key', maxRetries: 1, baseRetryDelay: 10 },
      });

      vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
        data: {
          candidates: [],
          promptFeedback: {
            blockReason: 'SAFETY',
            safetyRatings: [{ category: 'HARM_CATEGORY_DANGEROUS', probability: 'HIGH' }],
          },
        },
        cached: false,
        status: 200,
      } as any);

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('Response blocked: SAFETY');
      expect(cache.fetchWithCache).toHaveBeenCalledTimes(1);
      expect(timeUtil.sleep).not.toHaveBeenCalled();
    });

    it('should retry on HTTP 503 and eventually succeed', async () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
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

    it('should use prompt-level retry config overrides', async () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
        config: { apiKey: 'test-key', maxRetries: 0 },
      });

      const error503 = new Error('Service Unavailable');
      (error503 as any).response = { status: 503 };

      vi.mocked(cache.fetchWithCache)
        .mockRejectedValueOnce(error503)
        .mockResolvedValueOnce(successResponse as any);

      const result = await provider.callApi('test prompt', {
        prompt: {
          raw: 'test prompt',
          label: 'test prompt',
          config: { maxRetries: 1, baseRetryDelay: 10 },
        },
        vars: {},
      });

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('test response');
      expect(cache.fetchWithCache).toHaveBeenCalledTimes(2);
      expect(timeUtil.sleep).toHaveBeenCalledTimes(1);
    });

    it('should retry on HTTP 429 rate limit errors', async () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
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
      const provider = new AIStudioChatProvider('gemini-pro', {
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
      const provider = new AIStudioChatProvider('gemini-pro', {
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

    it('should retry wrapped fetchWithCache network errors', async () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
        config: { apiKey: 'test-key', maxRetries: 1, baseRetryDelay: 10 },
      });

      vi.mocked(cache.fetchWithCache)
        .mockRejectedValueOnce(
          new Error(
            'Request failed after 0 retries: TypeError: fetch failed (Cause: read ECONNRESET) (Code: ECONNRESET)',
          ),
        )
        .mockResolvedValueOnce(successResponse as any);

      const result = await provider.callApi('test prompt');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('test response');
      expect(cache.fetchWithCache).toHaveBeenCalledTimes(2);
    });

    it('should retry the wrapped Undici connect-timeout error form', async () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
        config: { apiKey: 'test-key', maxRetries: 1, baseRetryDelay: 10 },
      });

      vi.mocked(cache.fetchWithCache)
        .mockRejectedValueOnce(
          new Error(
            'Request failed after 0 retries: TypeError: fetch failed (Cause: ConnectTimeoutError: Connect Timeout Error)',
          ),
        )
        .mockResolvedValueOnce(successResponse as any);

      const result = await provider.callApi('test prompt');

      expect(result.output).toBe('test response');
      expect(cache.fetchWithCache).toHaveBeenCalledTimes(2);
    });

    it('should return a provider error when the total AI Studio deadline expires', async () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
        config: { apiKey: 'test-key', maxRetries: 1 },
      });
      const now = vi
        .spyOn(Date, 'now')
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(0)
        .mockReturnValue(300_000);

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('TimeoutError');
      expect(cache.fetchWithCache).not.toHaveBeenCalled();
      now.mockRestore();
    });

    it('should retry wrapped fetchWithCache 500 errors', async () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
        config: { apiKey: 'test-key', maxRetries: 1, baseRetryDelay: 10 },
      });

      vi.mocked(cache.fetchWithCache)
        .mockRejectedValueOnce(
          new Error('Request failed after 0 retries: Error: Internal Server Error: 500 Internal'),
        )
        .mockResolvedValueOnce(successResponse as any);

      const result = await provider.callApi('test prompt');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('test response');
      expect(cache.fetchWithCache).toHaveBeenCalledTimes(2);
    });

    it('should retry on "overloaded" error messages', async () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
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
      const provider = new AIStudioChatProvider('gemini-pro', {
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

    it('should NOT retry non-retryable HTTP statuses even when the message mentions quota', async () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
        config: { apiKey: 'test-key', maxRetries: 2, baseRetryDelay: 10 },
      });

      const error400 = new Error('Bad Request: quota project is invalid');
      (error400 as any).response = { status: 400 };

      vi.mocked(cache.fetchWithCache).mockRejectedValueOnce(error400);

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('API call error');
      expect(cache.fetchWithCache).toHaveBeenCalledTimes(1);
      expect(timeUtil.sleep).not.toHaveBeenCalled();
    });

    it('should NOT retry unstructured quota configuration errors', async () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
        config: { apiKey: 'test-key', maxRetries: 2, baseRetryDelay: 10 },
      });

      vi.mocked(cache.fetchWithCache).mockRejectedValueOnce(
        new Error('Bad Request: quota project is invalid'),
      );

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('API call error');
      expect(cache.fetchWithCache).toHaveBeenCalledTimes(1);
      expect(timeUtil.sleep).not.toHaveBeenCalled();
    });

    it('should NOT retry on HTTP 401 auth errors', async () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
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
      const provider = new AIStudioChatProvider('gemini-pro', {
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
      const provider = new AIStudioChatProvider('gemini-pro', {
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

    it('should use the safe default for invalid negative maxRetries', async () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
        config: { apiKey: 'test-key', maxRetries: -1 },
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
      expect(cache.fetchWithCache).toHaveBeenCalledTimes(4);
      expect(timeUtil.sleep).toHaveBeenCalledTimes(3);
    });

    it('should default to 3 retries when maxRetries is not specified', async () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
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
      const provider = new VertexChatProvider('gemini-pro', {
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
      expect(vi.mocked(fetchUtil.fetchWithProxy).mock.calls[0][1]).toEqual(
        expect.objectContaining({ disableTransientRetries: true }),
      );
    });

    it('should retry empty candidates in express mode', async () => {
      const provider = new VertexChatProvider('gemini-pro', {
        config: {
          vertexai: true,
          apiKey: 'test-vertex-key',
          maxRetries: 1,
          baseRetryDelay: 10,
        },
      });

      vi.mocked(fetchUtil.fetchWithProxy)
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ candidates: [] }),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue(successResponse.data),
        } as any);

      const result = await provider.callApi('test prompt');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('test response');
      expect(fetchUtil.fetchWithProxy).toHaveBeenCalledTimes(2);
      expect(timeUtil.sleep).toHaveBeenCalledTimes(1);
    });

    it('should retry on HTTP 429 in express mode', async () => {
      const provider = new VertexChatProvider('gemini-pro', {
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
      const provider = new VertexChatProvider('gemini-pro', {
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
      expect(result.error).toContain('invalid request');
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

      mockGoogleClientRequest(mockRequest);

      const provider = new VertexChatProvider('gemini-pro', {
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
      expect(mockRequest).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          retry: false,
          retryConfig: { retry: 0 },
          signal: expect.any(AbortSignal),
        }),
      );
      expect(mockRequest.mock.calls[1][0].signal).toBe(mockRequest.mock.calls[0][0].signal);
    });

    it('should return a provider error when the total OAuth deadline expires', async () => {
      const mockRequest = vi.fn();
      mockGoogleClientRequest(mockRequest);
      const provider = new VertexChatProvider('gemini-pro', {
        config: { vertexai: true, projectId: 'test-project', maxRetries: 1 },
      });
      const now = vi
        .spyOn(Date, 'now')
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(0)
        .mockReturnValue(300_000);

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('TimeoutError');
      expect(mockRequest).not.toHaveBeenCalled();
      now.mockRestore();
    });

    it('should stop before dispatch when cancelled during OAuth setup', async () => {
      const request = vi.fn();
      let resolveClient!: (value: unknown) => void;
      vi.mocked(util.getGoogleClient).mockReturnValueOnce(
        new Promise((resolve) => {
          resolveClient = resolve;
        }) as any,
      );
      const provider = new VertexChatProvider('gemini-pro', {
        config: { vertexai: true, projectId: 'test-project', maxRetries: 1 },
      });
      const controller = new AbortController();

      const pending = provider.callApi('test prompt', undefined, {
        abortSignal: controller.signal,
      });
      await vi.waitFor(() => expect(util.getGoogleClient).toHaveBeenCalledOnce());
      controller.abort(new DOMException('cancelled', 'AbortError'));
      resolveClient({ client: { request }, credentials: {} });

      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      expect(request).not.toHaveBeenCalled();
    });

    it('should fail fast on array-wrapped OAuth daily quota errors', async () => {
      const quotaError = Object.assign(new Error('daily quota exceeded'), {
        response: {
          status: 429,
          statusText: 'Too Many Requests',
          data: [
            {
              error: {
                code: 429,
                status: 'RESOURCE_EXHAUSTED',
                message: 'daily quota exceeded',
                details: [
                  {
                    violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }],
                  },
                ],
              },
            },
          ],
        },
      });
      const mockRequest = vi.fn().mockRejectedValue(quotaError);
      mockGoogleClientRequest(mockRequest);
      const provider = new VertexChatProvider('gemini-pro', {
        config: { vertexai: true, projectId: 'test-project', maxRetries: 3 },
      });

      const result = await provider.callApi('test prompt');

      expect(mockRequest).toHaveBeenCalledOnce();
      expect(result.metadata?.rateLimitKind).toBe('quota');
      expect(result.metadata?.http?.status).toBe(429);
    });

    it('should retain known usage and cost when a later OAuth attempt fails', async () => {
      const terminalError = Object.assign(new Error('Bad Request'), {
        response: { status: 400, statusText: 'Bad Request' },
      });
      const mockRequest = vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            candidates: [],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 1, totalTokenCount: 11 },
          },
        })
        .mockRejectedValueOnce(terminalError);
      mockGoogleClientRequest(mockRequest);
      const provider = new VertexChatProvider('gemini-pro', {
        config: {
          vertexai: true,
          projectId: 'test-project',
          maxRetries: 1,
          baseRetryDelay: 0,
          inputCost: 0.01,
          outputCost: 0.02,
        },
      });

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('Bad Request');
      expect(result.tokenUsage).toMatchObject({
        prompt: 10,
        completion: 1,
        total: 11,
        numRequests: 2,
      });
      expect(result.cost).toBeCloseTo(0.12);
    });

    it('should retry empty candidate responses in OAuth mode', async () => {
      const mockRequest = vi
        .fn()
        .mockResolvedValueOnce({ data: { candidates: [] } })
        .mockResolvedValueOnce({ data: successResponse.data });

      mockGoogleClientRequest(mockRequest);

      const provider = new VertexChatProvider('gemini-pro', {
        config: {
          vertexai: true,
          projectId: 'test-project',
          maxRetries: 1,
          baseRetryDelay: 10,
        },
      });

      const result = await provider.callApi('test prompt');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('test response');
      expect(mockRequest).toHaveBeenCalledTimes(2);
      expect(timeUtil.sleep).toHaveBeenCalledTimes(1);
    });

    it('should consume a complete stream before classifying an empty leading chunk', async () => {
      const mockRequest = vi.fn().mockResolvedValue({
        data: [
          { candidates: [], usageMetadata: { promptTokenCount: 10, totalTokenCount: 10 } },
          {
            candidates: [
              { content: { parts: [{ text: 'stream complete' }] }, finishReason: 'STOP' },
            ],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4, totalTokenCount: 14 },
          },
        ],
      });
      mockGoogleClientRequest(mockRequest);
      const provider = new VertexChatProvider('gemini-pro', {
        config: {
          vertexai: true,
          projectId: 'test-project',
          streaming: true,
          maxRetries: 1,
          baseRetryDelay: 0,
        },
      });

      const result = await provider.callApi('test prompt');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('stream complete');
      expect(mockRequest).toHaveBeenCalledOnce();
      expect(timeUtil.sleep).not.toHaveBeenCalled();
    });
  });

  describe('exponential backoff', () => {
    it('should use increasing delays between retries', async () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
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
      // Jitter is 20% of the exponential delay, with Math.random() fixed at 0.5.
      expect(timeUtil.sleep).toHaveBeenCalledTimes(3);
      expect(timeUtil.sleep).toHaveBeenNthCalledWith(1, 110);
      expect(timeUtil.sleep).toHaveBeenNthCalledWith(2, 220);
      expect(timeUtil.sleep).toHaveBeenNthCalledWith(3, 440);

      mockRandom.mockRestore();
    });
  });

  describe('error detection', () => {
    it('should detect retryable errors from cause.code', async () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
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
      const provider = new AIStudioChatProvider('gemini-pro', {
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
      const provider = new AIStudioChatProvider('gemini-pro', {
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
