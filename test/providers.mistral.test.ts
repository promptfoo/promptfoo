import { disableCache, enableCache } from '../src/cache';
import { fetchWithCache } from '../src/cache';
import { MistralChatCompletionProvider, MistralEmbeddingProvider } from '../src/providers/mistral';

jest.mock('../src/cache', () => ({
  ...jest.requireActual('../src/cache'),
  fetchWithCache: jest.fn(),
}));

jest.mock('../src/util');

describe('Mistral', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(fetchWithCache).mockReset();
  });

  describe('MistralChatCompletionProvider', () => {
    let provider: MistralChatCompletionProvider;

    beforeEach(() => {
      provider = new MistralChatCompletionProvider('mistral-tiny');
    });

    it('should create a provider with default options', () => {
      expect(provider.modelName).toBe('mistral-tiny');
      expect(provider.config).toEqual({});
    });

    it('should create a provider with custom options', () => {
      const customProvider = new MistralChatCompletionProvider('mistral-medium', {
        config: { temperature: 0.7 },
      });
      expect(customProvider.modelName).toBe('mistral-medium');
      expect(customProvider.config).toEqual({ temperature: 0.7 });
    });

    it('should call Mistral API and return output with correct structure', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Test output' } }],
        usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
      };
      jest.mocked(fetchWithCache).mockResolvedValue({ data: mockResponse, cached: false });

      const result = await provider.callApi('Test prompt');

      expect(jest.mocked(fetchWithCache)).toHaveBeenCalledWith(
        expect.stringContaining('/chat/completions'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: expect.stringContaining('Bearer '),
          }),
          body: expect.stringContaining('"messages":[{"role":"user","content":"Test prompt"}]'),
        }),
        expect.any(Number),
      );

      expect(result).toEqual({
        output: 'Test output',
        tokenUsage: {
          total: 10,
          prompt: 5,
          completion: 5,
        },
        cached: false,
        cost: expect.any(Number),
      });
    });

    it('should use cache by default', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Cached output' } }],
        usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
      };
      jest.mocked(fetchWithCache).mockResolvedValue({ data: mockResponse, cached: true });

      const result = await provider.callApi('Test prompt');

      expect(result).toEqual({
        output: 'Cached output',
        tokenUsage: {
          total: 10,
          prompt: 5,
          completion: 5,
          cached: 10,
        },
        cached: true,
        cost: expect.any(Number),
      });
    });

    it('should not use cache if caching is disabled', async () => {
      disableCache();

      const mockResponse = {
        choices: [{ message: { content: 'Fresh output' } }],
        usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
      };
      jest.mocked(fetchWithCache).mockResolvedValue({ data: mockResponse, cached: false });

      const result = await provider.callApi('Test prompt');

      expect(result.cached).toBe(false);
      expect(result.tokenUsage).not.toHaveProperty('cached');

      enableCache();
    });

    it('should handle API errors', async () => {
      const mockError = new Error('API Error');
      jest.mocked(fetchWithCache).mockRejectedValue(mockError);

      const result = await provider.callApi('Test prompt');

      expect(result).toEqual({
        error: 'API call error: Error: API Error',
      });
    });
  });

  describe('MistralEmbeddingProvider', () => {
    let provider: MistralEmbeddingProvider;

    beforeEach(() => {
      provider = new MistralEmbeddingProvider();
    });

    it('should create a provider with default options', () => {
      expect(provider.modelName).toBe('mistral-embed');
      expect(provider.config).toEqual({});
    });

    it('should call Mistral Embedding API and return embedding with correct structure', async () => {
      const mockResponse = {
        model: 'mistral-embed',
        data: [{ embedding: [0.1, 0.2, 0.3] }],
        usage: { total_tokens: 5, prompt_tokens: 5 },
      };
      jest.mocked(fetchWithCache).mockResolvedValue({ data: mockResponse, cached: false });

      const result = await provider.callEmbeddingApi('Test text');

      expect(jest.mocked(fetchWithCache)).toHaveBeenCalledWith(
        expect.stringContaining('/embeddings'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: expect.stringContaining('Bearer '),
          }),
          body: expect.stringContaining('"input":"Test text"'),
        }),
        expect.any(Number),
      );

      expect(result).toEqual({
        embedding: [0.1, 0.2, 0.3],
        tokenUsage: {
          total: 5,
          prompt: 5,
        },
        cost: expect.any(Number),
      });
    });

    it('should handle API errors', async () => {
      const mockError = new Error('API Error');
      jest.mocked(fetchWithCache).mockRejectedValue(mockError);

      await expect(provider.callEmbeddingApi('Test text')).rejects.toThrow('API Error');
    });

    it('should return provider id and string representation', () => {
      expect(provider.id()).toBe('mistral:embedding:mistral-embed');
      expect(provider.toString()).toBe('[Mistral Embedding Provider mistral-embed]');
    });
  });
});
