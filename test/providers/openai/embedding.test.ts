import { disableCache, enableCache, fetchWithCache } from '../../../src/cache';
import { OpenAiEmbeddingProvider } from '../../../src/providers/openai/embedding';

jest.mock('../../../src/cache');

describe('OpenAI Provider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
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

      jest.mocked(fetchWithCache).mockResolvedValue({
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
      });
    });

    it('should handle API errors', async () => {
      jest.mocked(fetchWithCache).mockRejectedValue(new Error('API error'));

      await expect(provider.callEmbeddingApi('test text')).rejects.toThrow('API error');
    });
  });
});
