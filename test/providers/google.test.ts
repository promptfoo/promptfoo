import * as cache from '../../src/cache';
import logger from '../../src/logger';
import { GoogleChatProvider, GoogleEmbeddingProvider } from '../../src/providers/google';

jest.mock('../../src/cache', () => ({
  fetchWithCache: jest.fn(),
}));

jest.mock('../../src/providers/vertexUtil', () => ({
  maybeCoerceToGeminiFormat: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
  debug: jest.fn(),
  error: jest.fn(),
}));

describe('GoogleChatProvider', () => {
  let _provider: GoogleChatProvider;

  beforeEach(() => {
    _provider = new GoogleChatProvider('gemini-pro', {
      config: {
        temperature: 0.7,
        maxOutputTokens: 100,
        topP: 0.9,
        topK: 40,
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor and configuration', () => {
    it('should handle API key from different sources', () => {
      const providerWithConfigKey = new GoogleChatProvider('gemini-pro', {
        config: { apiKey: 'config-key' },
      });
      expect(providerWithConfigKey.getApiKey()).toBe('config-key');

      const providerWithEnvOverride = new GoogleChatProvider('gemini-pro', {
        env: { GOOGLE_API_KEY: 'env-key' },
      });
      expect(providerWithEnvOverride.getApiKey()).toBe('env-key');
    });

    it('should handle API host from different sources', () => {
      const providerWithConfigHost = new GoogleChatProvider('gemini-pro', {
        config: { apiHost: 'custom.host.com' },
      });
      expect(providerWithConfigHost.getApiHost()).toBe('custom.host.com');

      const providerWithEnvOverride = new GoogleChatProvider('gemini-pro', {
        env: { GOOGLE_API_HOST: 'env.host.com' },
      });
      expect(providerWithEnvOverride.getApiHost()).toBe('env.host.com');
    });

    it('should handle custom provider ID', () => {
      const customId = 'custom-google-provider';
      const providerWithCustomId = new GoogleChatProvider('gemini-pro', {
        id: customId,
      });
      expect(providerWithCustomId.id()).toBe(customId);
    });

    it('should handle default configuration', () => {
      const defaultProvider = new GoogleChatProvider('gemini-pro');
      expect(defaultProvider.getApiHost()).toBe('generativelanguage.googleapis.com');
      expect(defaultProvider.id()).toBe('google:gemini-pro');
    });

    it('should handle configuration with safety settings', () => {
      const providerWithSafety = new GoogleChatProvider('gemini-pro', {
        config: {
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', probability: 'BLOCK_MEDIUM_AND_ABOVE' },
          ],
        },
      });
      expect(providerWithSafety).toBeDefined();
    });
  });
});

describe('GoogleEmbeddingProvider', () => {
  let provider: GoogleEmbeddingProvider;

  beforeEach(() => {
    provider = new GoogleEmbeddingProvider('embedding-model', {
      config: {
        apiKey: 'test-key',
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor and configuration', () => {
    it('should handle API key from different sources', () => {
      const providerWithConfigKey = new GoogleEmbeddingProvider('embedding-model', {
        config: { apiKey: 'config-key' },
      });
      expect(providerWithConfigKey.getApiKey()).toBe('config-key');

      const providerWithEnvOverride = new GoogleEmbeddingProvider('embedding-model', {
        env: { GOOGLE_API_KEY: 'env-key' },
      });
      expect(providerWithEnvOverride.getApiKey()).toBe('env-key');
    });

    it('should handle API host from different sources', () => {
      const providerWithConfigHost = new GoogleEmbeddingProvider('embedding-model', {
        config: { apiHost: 'custom.host.com' },
      });
      expect(providerWithConfigHost.getApiHost()).toBe('custom.host.com');

      const providerWithEnvOverride = new GoogleEmbeddingProvider('embedding-model', {
        env: { GOOGLE_API_HOST: 'env.host.com' },
      });
      expect(providerWithEnvOverride.getApiHost()).toBe('env.host.com');
    });
  });

  describe('callEmbeddingApi', () => {
    it('should throw error when API key is not set', async () => {
      provider = new GoogleEmbeddingProvider('embedding-model', {});
      await expect(provider.callEmbeddingApi('test')).rejects.toThrow('Google API key is not set');
    });

    it('should call API with correct request format', async () => {
      const mockResponse = {
        data: {
          embedding: {
            values: [0.1, 0.2, 0.3],
          },
        },
        cached: false,
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);

      await provider.callEmbeddingApi('test text');

      expect(cache.fetchWithCache).toHaveBeenCalledWith(
        expect.stringContaining('/v1/models/embedding-model:embedContent'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'models/embedding-model',
            content: {
              parts: [{ text: 'test text' }],
            },
          }),
        }),
        expect.any(Number),
        'json',
        false,
      );
    });

    it('should return embedding response with token usage', async () => {
      const mockResponse = {
        data: {
          embedding: {
            values: [0.1, 0.2, 0.3],
          },
        },
        cached: false,
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);

      const result = await provider.callEmbeddingApi('test text');

      expect(result).toEqual({
        embedding: [0.1, 0.2, 0.3],
        tokenUsage: {
          prompt: 0,
          completion: 0,
          total: 0,
          numRequests: 1,
        },
      });
    });

    it('should handle API errors', async () => {
      jest.mocked(cache.fetchWithCache).mockRejectedValue(new Error('API error'));

      await expect(provider.callEmbeddingApi('test')).rejects.toThrow('API error');
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('API error'));
    });

    it('should handle missing embedding values in response', async () => {
      const mockResponse = {
        data: {
          embedding: {},
        },
        cached: false,
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);

      await expect(provider.callEmbeddingApi('test')).rejects.toThrow(
        'No embedding values found in Google Embedding API response',
      );
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error processing'));
    });

    it('should log debug information', async () => {
      const mockResponse = {
        data: {
          embedding: {
            values: [0.1, 0.2, 0.3],
          },
        },
        cached: false,
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);

      await provider.callEmbeddingApi('test text');

      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Calling Google Embedding API'),
      );
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Google Embedding API response'),
      );
    });
  });
});
