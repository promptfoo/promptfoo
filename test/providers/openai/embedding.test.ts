import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { disableCache, enableCache, fetchWithCache } from '../../../src/cache';
import { OpenAiEmbeddingProvider } from '../../../src/providers/openai/embedding';
import { mockProcessEnv } from '../../util/utils';
import { getOpenAiMissingApiKeyMessage } from './shared';

vi.mock('../../../src/cache');

describe('OpenAI Provider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    disableCache();
  });

  afterEach(() => {
    enableCache();
  });

  describe('OpenAiEmbeddingProvider', () => {
    const configuredEmbeddingCostPerToken = 0.42 / 1e6;
    const provider = new OpenAiEmbeddingProvider('text-embedding-3-large', {
      config: {
        apiKey: 'test-key',
        cost: configuredEmbeddingCostPerToken,
      },
    });

    it('should call embedding API successfully', async () => {
      const mockResponse = {
        data: [
          {
            embedding: [0.1, 0.2, 0.3],
          },
        ],
        usage: {
          total_tokens: 10,
          prompt_tokens: 0,
          completion_tokens: 0,
        },
      };

      vi.mocked(fetchWithCache).mockResolvedValue({
        data: mockResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callEmbeddingApi('test text');
      const expectedCost = 10 * provider.config.cost!;
      expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
      expect(result.tokenUsage).toEqual({
        total: 10,
        prompt: 0,
        completion: 0,
        numRequests: 1,
      });
      expect(result.cost).toBeCloseTo(expectedCost, 12);
    });

    it('should pass through embedding request fields', async () => {
      const passthroughProvider = new OpenAiEmbeddingProvider('text-embedding-3-small', {
        config: {
          apiKey: 'test-key',
          passthrough: {
            dimensions: 8,
            encoding_format: 'float',
          },
        },
      });

      const mockEmbeddingResponse = {
        data: [{ embedding: [0.1, 0.2, 0.3] }],
        usage: {
          total_tokens: 10,
          prompt_tokens: 10,
          completion_tokens: 0,
        },
      };

      vi.mocked(fetchWithCache).mockResolvedValue({
        data: mockEmbeddingResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      await passthroughProvider.callEmbeddingApi('test text');

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.stringContaining('/embeddings'),
        expect.objectContaining({
          body: JSON.stringify({
            input: 'test text',
            model: 'text-embedding-3-small',
            dimensions: 8,
            encoding_format: 'float',
          }),
        }),
        expect.any(Number),
        'json',
        false,
        undefined,
      );
      expect(mockEmbeddingResponse.usage.completion_tokens).toBe(0);
    });

    it('should handle API errors', async () => {
      vi.mocked(fetchWithCache).mockRejectedValue(new Error('API error'));

      const result = await provider.callEmbeddingApi('test text');
      expect(result.error).toBe('API call error: Error: API error');
      expect(result.embedding).toBeUndefined();
    });

    it('should validate input type', async () => {
      const result = await provider.callEmbeddingApi({ message: 'test' } as unknown as string);
      expect(result.error).toBe(
        'Invalid input type for embedding API. Expected string, got object. Input: {"message":"test"}',
      );
      expect(result.embedding).toBeUndefined();
    });

    it('should handle HTTP error status', async () => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: { error: { message: 'Unauthorized' } },
        cached: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const result = await provider.callEmbeddingApi('test text');
      expect(result.error).toBe(
        'API error: 401 Unauthorized\n{"error":{"message":"Unauthorized"}}',
      );
      expect(result.embedding).toBeUndefined();
    });

    it('should validate API key', async () => {
      const restoreEnv = mockProcessEnv({ OPENAI_API_KEY: undefined });

      try {
        const providerNoKey = new OpenAiEmbeddingProvider('text-embedding-3-large', {
          config: {},
        });

        const result = await providerNoKey.callEmbeddingApi('test text');
        expect(result.error).toBe(getOpenAiMissingApiKeyMessage());
        expect(result.embedding).toBeUndefined();
      } finally {
        restoreEnv();
      }
    });
  });
});
