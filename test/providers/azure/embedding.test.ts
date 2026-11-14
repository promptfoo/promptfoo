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
    [{ bustCache: true }, true],
    [{ debug: true }, true],
    [{ bustCache: false, debug: true }, false],
  ] as const)('forwards cache settings %j', async (settings, expected) => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce(
      createMockFetchResponse({ data: [{ embedding: [0.1] }] }),
    );
    await provider.callEmbeddingApi('test text', {
      prompt: { raw: 'test text', label: 'test' },
      vars: {},
      ...settings,
    });

    expect(vi.mocked(fetchWithCache).mock.calls[0].slice(3)).toEqual(['json', expected]);
  });

  it('reports the HTTP status and Azure error body when a request is rejected', async () => {
    const data = {
      error: { code: '401', message: 'Access denied due to invalid subscription key' },
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(
      createMockFetchResponse(data, { status: 401, statusText: 'Unauthorized' }),
    );

    expect(await provider.callEmbeddingApi('test text')).toEqual({
      error: `API error: 401 Unauthorized\n${JSON.stringify(data)}`,
      tokenUsage: { total: 0, prompt: 0, completion: 0, numRequests: 1 },
    });
  });

  it.each([
    [false, { total: 7, prompt: 7, completion: 0, numRequests: 1 }],
    [true, { cached: 7, total: 7, numRequests: 1 }],
  ] as const)(
    'evicts a successful response missing its embedding (cached=%s)',
    async (cached, tokenUsage) => {
      const deleteFromCache = vi.fn().mockResolvedValue(undefined);
      const data = { data: [], usage: { total_tokens: 7, prompt_tokens: 7, completion_tokens: 0 } };
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        ...createMockFetchResponse(data, { cached }),
        deleteFromCache,
      });

      expect(await provider.callEmbeddingApi('test text')).toEqual({
        error: expect.stringContaining('No embedding returned'),
        tokenUsage,
      });
      expect(deleteFromCache).toHaveBeenCalledOnce();
    },
  );
});
