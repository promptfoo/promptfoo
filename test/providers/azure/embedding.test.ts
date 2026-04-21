import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { AzureEmbeddingProvider } from '../../../src/providers/azure/embedding';

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
      tokenUsage: {
        cached: 10,
        total: 10,
        numRequests: 1,
      },
    });
  });

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

  it('should handle API response error with cached true and missing usage fields', async () => {
    const mockResponse = {
      data: {
        data: [{}],
        // usage is missing
      },
      cached: true,
    };

    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse as any);

    await expect(provider.callEmbeddingApi('test text')).rejects.toThrow(
      /Cannot read (?:properties|property) of undefined/,
    );
  });
});
