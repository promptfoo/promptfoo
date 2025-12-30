import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { disableCache, enableCache, fetchWithCache } from '../../../src/cache';
import { OpenAiEmbeddingProvider } from '../../../src/providers/openai/embedding';

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
    const provider = new OpenAiEmbeddingProvider('text-embedding-3-large', {
      config: {
        apiKey: 'test-key',
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
      expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
      expect(result.tokenUsage).toEqual({
        total: 10,
        prompt: 0,
        completion: 0,
        numRequests: 1,
      });
    });

    it('should handle API errors', async () => {
      vi.mocked(fetchWithCache).mockRejectedValue(new Error('API error'));

      const result = await provider.callEmbeddingApi('test text');
      expect(result.error).toBe('API call error: Error: API error');
      expect(result.embedding).toBeUndefined();
    });

    it('should validate input type', async () => {
      const result = await provider.callEmbeddingApi({ message: 'test' } as any);
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
      // Clear any environment variables that might provide an API key
      const originalEnv = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      try {
        const providerNoKey = new OpenAiEmbeddingProvider('text-embedding-3-large', {
          config: {},
        });

        const result = await providerNoKey.callEmbeddingApi('test text');
        expect(result.error).toBe(
          'API key is not set. Set the OPENAI_API_KEY environment variable or add `apiKey` to the provider config.',
        );
        expect(result.embedding).toBeUndefined();
      } finally {
        // Always restore original environment state
        if (originalEnv !== undefined) {
          process.env.OPENAI_API_KEY = originalEnv;
        } else {
          delete process.env.OPENAI_API_KEY;
        }
      }
    });
  });
});
