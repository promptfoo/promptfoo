import { getGradingProvider } from '../../src/matchers';
import { loadApiProvider } from '../../src/providers';

jest.mock('../../src/providers', () => ({
  loadApiProvider: jest.fn(),
}));

describe('Hybrid Provider Configuration', () => {
  let mockLoadApiProvider: jest.MockedFunction<typeof loadApiProvider>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadApiProvider = loadApiProvider as jest.MockedFunction<typeof loadApiProvider>;
  });

  describe('when using hybrid provider configuration', () => {
    it('should use main provider for text operations', async () => {
      const mockTextProvider = {
        id: () => 'azure:chat:gpt-4o',
        callApi: jest.fn(),
      };
      
      mockLoadApiProvider.mockResolvedValue(mockTextProvider);

      const hybridConfig = {
        id: 'azure:chat:gpt-4o',
        config: {
          apiHost: 'text.openai.azure.com',
        },
        embedding: {
          id: 'azure:embedding:text-embedding-3-large',
          config: {
            apiHost: 'embedding.openai.azure.com',
          },
        },
      };

      const result = await getGradingProvider('text', hybridConfig, null);
      
      expect(mockLoadApiProvider).toHaveBeenCalledWith('azure:chat:gpt-4o', {
        options: {
          id: 'azure:chat:gpt-4o',
          config: {
            apiHost: 'text.openai.azure.com',
          },
          embedding: expect.any(Object),
        },
      });
      expect(result).toBe(mockTextProvider);
    });

    it('should use embedding override when available', async () => {
      const mockEmbeddingProvider = {
        id: () => 'azure:embedding:text-embedding-3-large',
        callApi: jest.fn(),
        callEmbeddingApi: jest.fn(),
      };
      
      mockLoadApiProvider.mockResolvedValue(mockEmbeddingProvider);

      const hybridConfig = {
        id: 'azure:chat:gpt-4o',
        config: {
          apiHost: 'text.openai.azure.com',
        },
        embedding: {
          id: 'azure:embedding:text-embedding-3-large',
          config: {
            apiHost: 'embedding.openai.azure.com',
          },
        },
      };

      const result = await getGradingProvider('embedding', hybridConfig, null);
      
      expect(mockLoadApiProvider).toHaveBeenCalledWith('azure:embedding:text-embedding-3-large', {
        options: {
          id: 'azure:embedding:text-embedding-3-large',
          config: {
            apiHost: 'embedding.openai.azure.com',
          },
        },
      });
      expect(result).toBe(mockEmbeddingProvider);
    });

    it('should throw error when requested type is not available in hybrid config', async () => {
      const hybridConfig = {
        id: 'azure:chat:gpt-4o',
        config: {
          apiHost: 'text.openai.azure.com',
        },
        embedding: {
          id: 'azure:embedding:text-embedding-3-large',
          config: {
            apiHost: 'embedding.openai.azure.com',
          },
        },
      };

      await expect(
        getGradingProvider('moderation', hybridConfig, null),
      ).rejects.toThrow(/Provider type mismatch/);
    });

    it('should handle nested type configurations', async () => {
      const mockProvider = {
        id: () => 'openai:gpt-4o',
        callApi: jest.fn(),
      };
      
      mockLoadApiProvider.mockResolvedValue(mockProvider);

      const nestedConfig = {
        text: {
          id: 'openai:gpt-4o',
          config: { temperature: 0.7 },
        },
        embedding: {
          id: 'openai:embedding:text-embedding-3-small',
          config: { dimensions: 512 },
        },
      };

      const result = await getGradingProvider('text', nestedConfig, null);
      
      expect(mockLoadApiProvider).toHaveBeenCalledWith('openai:gpt-4o', {
        options: {
          id: 'openai:gpt-4o',
          config: { temperature: 0.7 },
        },
      });
      expect(result).toBe(mockProvider);
    });
  });

  describe('backwards compatibility', () => {
    it('should still work with simple string provider', async () => {
      const mockProvider = {
        id: () => 'openai:gpt-4o',
        callApi: jest.fn(),
      };
      
      mockLoadApiProvider.mockResolvedValue(mockProvider);

      const result = await getGradingProvider('text', 'openai:gpt-4o', null);
      
      expect(mockLoadApiProvider).toHaveBeenCalledWith('openai:gpt-4o');
      expect(result).toBe(mockProvider);
    });

    it('should still work with ProviderOptions without type overrides', async () => {
      const mockProvider = {
        id: () => 'azure:chat:deployment',
        callApi: jest.fn(),
      };
      
      mockLoadApiProvider.mockResolvedValue(mockProvider);

      const providerOptions = {
        id: 'azure:chat:deployment',
        config: {
          apiHost: 'test.openai.azure.com',
          apiKey: 'test-key',
        },
      };

      const result = await getGradingProvider('text', providerOptions, null);
      
      expect(mockLoadApiProvider).toHaveBeenCalledWith('azure:chat:deployment', {
        options: providerOptions,
      });
      expect(result).toBe(mockProvider);
    });

    it('should still work with ProviderTypeMap', async () => {
      const mockProvider = {
        id: () => 'voyage:voyage-3',
        callApi: jest.fn(),
        callEmbeddingApi: jest.fn(),
      };
      
      mockLoadApiProvider.mockResolvedValue(mockProvider);

      const typeMap = {
        text: 'openai:gpt-4o',
        embedding: 'voyage:voyage-3',
      };

      const result = await getGradingProvider('embedding', typeMap, null);
      
      expect(mockLoadApiProvider).toHaveBeenCalledWith('voyage:voyage-3');
      expect(result).toBe(mockProvider);
    });
  });
}); 