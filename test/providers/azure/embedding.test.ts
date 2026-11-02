import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { AzureEmbeddingProvider } from '../../../src/providers/azure/embedding';
import { createMockFetchResponse } from '../mockProviderResponses';

vi.mock('../../../src/cache');

describe('AzureEmbeddingProvider', () => {
  let provider: AzureEmbeddingProvider;

  beforeEach(() => {
    provider = new AzureEmbeddingProvider('test-deployment', {
      endpoint: 'https://test.openai.azure.com',
      apiKey: 'test-key',
      headers: {
        'Custom-Header': 'custom-value',
      },
    } as any);

    (provider as any).getApiBaseUrl = () => 'https://test.openai.azure.com';
    (provider as any).authHeaders = {
      'api-key': 'test-key',
    };
    vi.spyOn(provider as any, 'ensureInitialized').mockImplementation(function () {
      return Promise.resolve();
    });

    vi.mocked(fetchWithCache).mockReset();
  });

  it('should handle cached response', async () => {
    const mockResponse = {
      data: {
        data: [
          {
            embedding: [0.1, 0.2, 0.3],
          },
        ],
        usage: {
          total_tokens: 10,
        },
      },
      cached: true,
    };

    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse as any);

    const result = await provider.callEmbeddingApi('test text');

    expect(result).toEqual({
      embedding: [0.1, 0.2, 0.3],
      cached: true,
      tokenUsage: {
        cached: 10,
        total: 10,
        numRequests: 1,
      },
    });
  });

  it.each([undefined, 256])(
    'preserves the deployment and forwards dimensions %s',
    async (dimensions) => {
      provider.config.dimensions = dimensions;
      vi.mocked(fetchWithCache).mockResolvedValueOnce(
        createMockFetchResponse({ data: [{ embedding: [0.1, 0.2] }], usage: { total_tokens: 2 } }),
      );

      const result = await provider.callEmbeddingApi('A small sample');

      const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
      expect(url).toContain('/deployments/test-deployment/embeddings?api-version=');
      expect(JSON.parse(request?.body as string)).toEqual({
        input: 'A small sample',
        model: 'test-deployment',
        ...(dimensions === undefined ? {} : { dimensions }),
      });
      expect(result.embedding).toEqual([0.1, 0.2]);
      expect(result.cached).toBe(false);
    },
  );

  it('should handle API call errors', async () => {
    vi.mocked(fetchWithCache).mockRejectedValueOnce(new Error('API error'));

    const result = await provider.callEmbeddingApi('test text');

    expect(result).toEqual({
      error: 'API call error: Error: API error',
      tokenUsage: {
        total: 0,
        prompt: 0,
        completion: 0,
        numRequests: 1,
      },
    });
  });

  it('should handle missing embedding in response', async () => {
    const mockResponse = {
      data: {
        data: [{}],
        usage: {
          total_tokens: 10,
          prompt_tokens: 5,
          completion_tokens: 5,
        },
      },
      cached: false,
    };

    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse as any);

    const result = await provider.callEmbeddingApi('test text');

    expect(result).toEqual({
      error: expect.stringContaining('No embedding returned'),
      tokenUsage: {
        total: 10,
        prompt: 5,
        completion: 5,
        numRequests: 1,
      },
    });
  });

  it('should handle missing API host', async () => {
    (provider as any).getApiBaseUrl = () => undefined;

    await expect(provider.callEmbeddingApi('test text')).rejects.toThrow(
      'Azure API host must be set.',
    );
  });

  it('should handle API response error with missing usage fields', async () => {
    const mockResponse = {
      data: {
        data: [{}],
        // usage is missing
      },
      cached: false,
    };

    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse as any);

    const result = await provider.callEmbeddingApi('test text');

    expect(result).toEqual({
      error: expect.stringContaining('No embedding returned'),
      tokenUsage: {
        total: undefined,
        prompt: undefined,
        completion: undefined,
        numRequests: 1,
      },
    });
  });

  it('handles a cached response with missing usage fields gracefully (no throw)', async () => {
    const mockResponse = {
      data: {
        data: [{}],
        // usage is missing
      },
      cached: true,
    };

    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse as any);

    // Previously the cached error path dereferenced data.usage.total_tokens and threw a
    // TypeError; it must now degrade to a clean error object.
    const result = await provider.callEmbeddingApi('test text');
    expect(result).toEqual({
      error: expect.stringContaining('No embedding returned'),
      tokenUsage: {
        cached: undefined,
        total: undefined,
        numRequests: 1,
      },
    });
  });
  it.each([
    { label: 'bustCache: true', context: { bustCache: true }, expected: true },
    { label: 'legacy debug: true', context: { debug: true }, expected: true },
    {
      label: 'explicit bustCache: false takes precedence over debug',
      context: { bustCache: false, debug: true },
      expected: false,
    },
  ])(
    'forwards the cache-bust context to fetchWithCache ($label)',
    async ({ context, expected }) => {
      const mockResponse = {
        data: { data: [{ embedding: [0.1, 0.2, 0.3] }], usage: { total_tokens: 10 } },
        cached: false,
        status: 200,
        statusText: 'OK',
      };

      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse as any);

      await provider.callEmbeddingApi('test text', context as any);

      // shouldBustProviderCache precedence is `bustCache ?? debug ?? false`.
      const [, , , format, bustCache] = vi.mocked(fetchWithCache).mock.calls[0];
      expect(format).toBe('json');
      expect(bustCache).toBe(expected);
    },
  );

  it('reports the HTTP status and keeps the Azure message when the request is rejected', async () => {
    const mockResponse = {
      data: {
        error: { code: '401', message: 'Access denied due to invalid subscription key' },
      },
      cached: false,
      status: 401,
      statusText: 'Unauthorized',
    };

    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse as any);

    const result = await provider.callEmbeddingApi('test text');

    expect(result).toEqual({
      error: expect.stringContaining('API error: 401 Unauthorized'),
      tokenUsage: {
        total: 0,
        prompt: 0,
        completion: 0,
        numRequests: 1,
      },
    });
    // The provider's own message must survive alongside the status line.
    expect(result.error).toContain('Access denied due to invalid subscription key');
  });

  it('evicts a freshly fetched 200 that carried no embedding', async () => {
    const deleteFromCache = vi.fn();
    const mockResponse = {
      data: { data: [], usage: { total_tokens: 7, prompt_tokens: 7, completion_tokens: 0 } },
      cached: false,
      status: 200,
      statusText: 'OK',
      deleteFromCache,
    };

    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse as any);

    // fetchWithCache stores a 200 that carries no `error` key, so without the eviction
    // this response is replayed for the full TTL.
    const result = await provider.callEmbeddingApi('test text');

    expect(deleteFromCache).toHaveBeenCalled();
    expect(result.error).toContain('No embedding returned');
    expect(result.tokenUsage).toEqual({
      total: 7,
      prompt: 7,
      completion: 0,
      numRequests: 1,
    });
  });

  it('evicts a cache hit that carried no embedding', async () => {
    const deleteFromCache = vi.fn();
    const mockResponse = {
      data: { data: [], usage: { total_tokens: 7 } },
      cached: true,
      status: 200,
      statusText: 'OK',
      deleteFromCache,
    };

    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse as any);

    const result = await provider.callEmbeddingApi('test text');

    expect(deleteFromCache).toHaveBeenCalled();
    expect(result.error).toContain('No embedding returned');
    // A cache hit reports its tokens under `cached`, so the two eviction paths differ in
    // what they report even though both evict.
    expect(result.tokenUsage).toEqual({
      cached: 7,
      total: 7,
      numRequests: 1,
    });
  });
});
