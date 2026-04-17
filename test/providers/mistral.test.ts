import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache, getCache, isCacheEnabled } from '../../src/cache';
import {
  MistralChatCompletionProvider,
  MistralEmbeddingProvider,
} from '../../src/providers/mistral';

vi.mock('../../src/cache', async () => ({
  ...(await vi.importActual('../../src/cache')),
  fetchWithCache: vi.fn(),
  getCache: vi.fn(),
  isCacheEnabled: vi.fn(),
}));

vi.mock('../../src/util');

describe('Mistral', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchWithCache).mockReset();
    vi.mocked(isCacheEnabled).mockReturnValue(false);
    vi.mocked(getCache).mockReturnValue({
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
      wrap: vi.fn(),
      del: vi.fn(),
      clear: vi.fn(),
      stores: [
        {
          get: vi.fn(),
          set: vi.fn(),
        },
      ] as any,
      mget: vi.fn(),
      mset: vi.fn(),
      mdel: vi.fn(),
      reset: vi.fn(),
      ttl: vi.fn(),
      on: vi.fn(),
      removeAllListeners: vi.fn(),
    } as any);
  });

  describe('MistralChatCompletionProvider', () => {
    let provider: MistralChatCompletionProvider;

    beforeEach(() => {
      provider = new MistralChatCompletionProvider('mistral-tiny');
      vi.spyOn(provider, 'getApiKey').mockReturnValue('fake-api-key');
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

    it('should support new Magistral reasoning models', () => {
      const magistralSmallProvider = new MistralChatCompletionProvider('magistral-small-2506');
      expect(magistralSmallProvider.modelName).toBe('magistral-small-2506');
      expect(magistralSmallProvider.config).toEqual({});

      const magistralMediumProvider = new MistralChatCompletionProvider('magistral-medium-latest', {
        config: { temperature: 0.7, max_tokens: 40960 },
      });
      expect(magistralMediumProvider.modelName).toBe('magistral-medium-latest');
      expect(magistralMediumProvider.config).toEqual({ temperature: 0.7, max_tokens: 40960 });
    });

    it('should support Pixtral multimodal model', () => {
      const pixtralProvider = new MistralChatCompletionProvider('pixtral-12b', {
        config: { temperature: 0.8, max_tokens: 2048 },
      });
      expect(pixtralProvider.modelName).toBe('pixtral-12b');
      expect(pixtralProvider.config).toEqual({ temperature: 0.8, max_tokens: 2048 });
    });

    it('should calculate cost correctly for Pixtral model', async () => {
      const pixtralProvider = new MistralChatCompletionProvider('pixtral-12b');
      vi.spyOn(pixtralProvider, 'getApiKey').mockReturnValue('fake-api-key');

      const mockResponse = {
        choices: [{ message: { content: 'Image analysis response' } }],
        usage: { total_tokens: 2000, prompt_tokens: 800, completion_tokens: 1200 },
      };
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: mockResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await pixtralProvider.callApi('Analyze this image: <image_url>');

      // Pixtral: $0.15/M tokens for both input and output
      // 800 prompt tokens * 0.15/1M + 1200 completion tokens * 0.15/1M = 0.00012 + 0.00018 = 0.0003
      expect(result.cost).toBeCloseTo(0.0003, 6);
    });

    it('should call Mistral API and return output with correct structure', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Test output' } }],
        usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
      };
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: mockResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callApi('Test prompt');

      expect(vi.mocked(fetchWithCache)).toHaveBeenCalledWith(
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
          numRequests: 1,
        },
        cached: false,
        cost: expect.any(Number),
      });
    });

    it('should calculate cost correctly for Magistral models', async () => {
      const magistralSmallProvider = new MistralChatCompletionProvider('magistral-small-2506');
      vi.spyOn(magistralSmallProvider, 'getApiKey').mockReturnValue('fake-api-key');

      const mockResponse = {
        choices: [{ message: { content: 'Reasoning response' } }],
        usage: { total_tokens: 1000, prompt_tokens: 100, completion_tokens: 900 },
      };
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: mockResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await magistralSmallProvider.callApi('Test reasoning prompt');

      // Magistral Small: $0.5/M input, $1.5/M output
      // 100 prompt tokens * 0.5/1M + 900 completion tokens * 1.5/1M = 0.00005 + 0.00135 = 0.0014
      expect(result.cost).toBeCloseTo(0.0014, 6);
    });

    it('should use cache when enabled', async () => {
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      vi.mocked(getCache).mockReturnValue({
        get: vi.fn().mockResolvedValue({
          output: 'Cached output',
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
          cost: 0.000005,
        }),
        set: vi.fn(),
        wrap: vi.fn(),
        del: vi.fn(),
        clear: vi.fn(),
        stores: [
          {
            get: vi.fn(),
            set: vi.fn(),
          },
        ] as any,
        mget: vi.fn(),
        mset: vi.fn(),
        mdel: vi.fn(),
        reset: vi.fn(),
        ttl: vi.fn(),
        on: vi.fn(),
        removeAllListeners: vi.fn(),
      } as any);
      const result = await provider.callApi('Test prompt');

      expect(result.cached).toBe(true);
      expect(result).toEqual({
        output: 'Cached output',
        tokenUsage: {
          total: 10,
          prompt: 5,
          completion: 5,
          cached: 10,
        },
        cached: true,
        cost: 0.000005,
      });
      expect(vi.mocked(fetchWithCache)).not.toHaveBeenCalled();
    });

    it('should not use cache when disabled', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Fresh output' } }],
        usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
      };
      vi.mocked(isCacheEnabled).mockImplementation(function () {
        return false;
      });
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: mockResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callApi('Test prompt');

      expect(result).toEqual({
        output: 'Fresh output',
        tokenUsage: {
          total: 10,
          prompt: 5,
          completion: 5,
          numRequests: 1,
        },
        cached: false,
        cost: expect.any(Number),
      });
      expect(vi.mocked(fetchWithCache)).toHaveBeenCalledWith(
        expect.stringContaining('/chat/completions'),
        expect.any(Object),
        expect.any(Number),
      );
    });

    it('should handle API errors', async () => {
      vi.mocked(isCacheEnabled).mockImplementation(function () {
        return false;
      });
      const mockError = new Error('API Error');
      vi.mocked(fetchWithCache).mockRejectedValueOnce(mockError);

      const result = await provider.callApi('Test prompt');

      expect(result).toEqual({
        error: 'API call error: Error: API Error',
      });
    });

    it('should use custom API base URL if provided', async () => {
      const customProvider = new MistralChatCompletionProvider('mistral-tiny', {
        config: { apiBaseUrl: 'https://custom.mistral.ai/v1' },
      });
      vi.spyOn(customProvider, 'getApiKey').mockReturnValue('fake-api-key');
      const mockResponse = {
        choices: [{ message: { content: 'Custom API response' } }],
        usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
      };
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: mockResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      await customProvider.callApi('Test prompt');

      expect(vi.mocked(fetchWithCache)).toHaveBeenCalledWith(
        'https://custom.mistral.ai/v1/chat/completions',
        expect.any(Object),
        expect.any(Number),
      );
    });

    it('should use API host if provided', async () => {
      const customProvider = new MistralChatCompletionProvider('mistral-tiny', {
        config: { apiHost: 'custom.mistral.ai' },
      });
      vi.spyOn(customProvider, 'getApiKey').mockReturnValue('fake-api-key');
      const mockResponse = {
        choices: [{ message: { content: 'Custom API response' } }],
        usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
      };
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: mockResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      await customProvider.callApi('Test prompt');

      expect(vi.mocked(fetchWithCache)).toHaveBeenCalledWith(
        'https://custom.mistral.ai/v1/chat/completions',
        expect.any(Object),
        expect.any(Number),
      );
    });
  });

  describe('MistralEmbeddingProvider', () => {
    let provider: MistralEmbeddingProvider;

    beforeEach(() => {
      provider = new MistralEmbeddingProvider();
      vi.spyOn(provider, 'getApiKey').mockReturnValue('fake-api-key');
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
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: mockResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callEmbeddingApi('Test text');

      expect(vi.mocked(fetchWithCache)).toHaveBeenCalledWith(
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
          completion: 0,
          numRequests: 1,
        },
        cost: expect.closeTo(0.0000005, 0.0000001), // Approximately 5 tokens * 0.1 / 1000000
      });
    });

    it('should use cache for embedding when enabled', async () => {
      const mockResponse = {
        model: 'mistral-embed',
        data: [{ embedding: [0.1, 0.2, 0.3] }],
        usage: { total_tokens: 5, prompt_tokens: 5 },
      };
      vi.mocked(isCacheEnabled).mockImplementation(function () {
        return true;
      });
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: mockResponse,
        cached: true,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callEmbeddingApi('Test text');

      expect(result).toEqual({
        embedding: [0.1, 0.2, 0.3],
        tokenUsage: {
          total: 5,
          completion: 0,
          cached: 5,
          numRequests: 1,
        },
        cost: expect.closeTo(0.0000005, 0.0000001),
      });
      expect(vi.mocked(fetchWithCache)).toHaveBeenCalledWith(
        expect.stringContaining('/embeddings'),
        expect.any(Object),
        expect.any(Number),
      );
    });

    it('should not use cache for embedding when disabled', async () => {
      const mockResponse = {
        model: 'mistral-embed',
        data: [{ embedding: [0.1, 0.2, 0.3] }],
        usage: { total_tokens: 5, prompt_tokens: 5 },
      };
      vi.mocked(isCacheEnabled).mockImplementation(function () {
        return false;
      });
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: mockResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callEmbeddingApi('Test text');

      expect(result).toEqual({
        embedding: [0.1, 0.2, 0.3],
        tokenUsage: {
          total: 5,
          prompt: 5,
          completion: 0,
          numRequests: 1,
        },
        cost: expect.any(Number),
      });
      expect(vi.mocked(fetchWithCache)).toHaveBeenCalledWith(
        expect.stringContaining('/embeddings'),
        expect.any(Object),
        expect.any(Number),
      );
    });

    it('should handle API errors', async () => {
      const mockError = new Error('API Error');
      vi.mocked(fetchWithCache).mockRejectedValue(mockError);

      await expect(provider.callEmbeddingApi('Test text')).rejects.toThrow('API Error');
    });

    it('should return provider id and string representation', () => {
      expect(provider.id()).toBe('mistral:embedding:mistral-embed');
      expect(provider.toString()).toBe('[Mistral Embedding Provider mistral-embed]');
    });

    it('should use custom API base URL if provided', async () => {
      const customProvider = new MistralEmbeddingProvider({
        config: { apiBaseUrl: 'https://custom.mistral.ai/v1' },
      });
      vi.spyOn(customProvider, 'getApiKey').mockReturnValue('fake-api-key');
      const mockResponse = {
        model: 'mistral-embed',
        data: [{ embedding: [0.1, 0.2, 0.3] }],
        usage: { total_tokens: 5, prompt_tokens: 5 },
      };
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: mockResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      await customProvider.callEmbeddingApi('Test text');

      expect(vi.mocked(fetchWithCache)).toHaveBeenCalledWith(
        'https://custom.mistral.ai/v1/embeddings',
        expect.any(Object),
        expect.any(Number),
      );
    });
  });
});
