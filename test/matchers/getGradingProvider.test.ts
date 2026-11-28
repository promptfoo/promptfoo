import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { getAndCheckProvider, getGradingProvider } from '../../src/matchers/providers';
import { loadApiProvider } from '../../src/providers/index';
import { createMockProvider } from '../factories/provider';

const createAzureDefaultGrader = () => ({
  defaultTest: {
    options: {
      provider: 'azureopenai:chat:gpt-4',
    },
  },
});

const createSimulatedUserProvider = () => ({
  id: 'promptfoo:simulated-user',
  config: {
    maxTurns: 3,
  },
});

vi.mock('../../src/providers', () => ({
  loadApiProvider: vi.fn(),
}));

describe('getGradingProvider', () => {
  const mockProvider = createMockProvider();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    (cliState as any).config = {};
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('explicit provider parameter', () => {
    it('should use provider when specified as string', async () => {
      vi.mocked(loadApiProvider).mockResolvedValue(mockProvider);

      const result = await getGradingProvider('text', 'openai:gpt-4', null);

      expect(loadApiProvider).toHaveBeenCalledWith('openai:gpt-4', { basePath: undefined });
      expect(result).toBe(mockProvider);
    });

    it('should use provider when specified as ApiProvider object', async () => {
      const result = await getGradingProvider('text', mockProvider, null);

      expect(result).toBe(mockProvider);
      expect(loadApiProvider).not.toHaveBeenCalled();
    });

    it('should treat null provider as unspecified', async () => {
      const result = await getGradingProvider('text', null as any, mockProvider);

      expect(result).toBe(mockProvider);
      expect(loadApiProvider).not.toHaveBeenCalled();
    });

    it('should use provider when specified as ProviderOptions', async () => {
      const providerOptions = {
        id: 'openai:gpt-4',
        config: {
          temperature: 0.5,
        },
      };
      vi.mocked(loadApiProvider).mockResolvedValue(mockProvider);

      const result = await getGradingProvider('text', providerOptions, null);

      expect(loadApiProvider).toHaveBeenCalledWith('openai:gpt-4', {
        options: providerOptions,
        basePath: undefined,
      });
      expect(result).toBe(mockProvider);
    });
  });

  describe('ProviderTypeMap (embedding/classification/text record)', () => {
    it('should handle embedding provider from ProviderTypeMap', async () => {
      const providerMap = {
        embedding: 'openai:embedding',
      };
      vi.mocked(loadApiProvider).mockResolvedValue(mockProvider);

      const result = await getGradingProvider('embedding', providerMap, null);

      expect(loadApiProvider).toHaveBeenCalledWith('openai:embedding', { basePath: undefined });
      expect(result).toBe(mockProvider);
    });

    it('should handle classification provider from ProviderTypeMap', async () => {
      const providerMap = {
        classification: 'openai:gpt-4',
      };
      vi.mocked(loadApiProvider).mockResolvedValue(mockProvider);

      const result = await getGradingProvider('classification', providerMap, null);

      expect(loadApiProvider).toHaveBeenCalledWith('openai:gpt-4', { basePath: undefined });
      expect(result).toBe(mockProvider);
    });

    it('should handle text provider from ProviderTypeMap', async () => {
      const providerMap = {
        text: 'anthropic:claude-3-sonnet',
      };
      vi.mocked(loadApiProvider).mockResolvedValue(mockProvider);

      const result = await getGradingProvider('text', providerMap, null);

      expect(loadApiProvider).toHaveBeenCalledWith('anthropic:claude-3-sonnet', {
        basePath: undefined,
      });
      expect(result).toBe(mockProvider);
    });
  });

  describe('defaultTest.options.provider fallback', () => {
    it('should use defaultTest.options.provider when no provider specified', async () => {
      const azureProvider = createMockProvider({ id: 'azureopenai:chat:gpt-4' });

      (cliState as any).config = createAzureDefaultGrader();

      vi.mocked(loadApiProvider).mockResolvedValue(azureProvider);

      const result = await getGradingProvider('text', undefined, null);

      expect(loadApiProvider).toHaveBeenCalledWith('azureopenai:chat:gpt-4', {
        basePath: undefined,
      });
      expect(result).toBe(azureProvider);
    });

    it('should use defaultTest.provider when options.provider not specified', async () => {
      const azureProvider = createMockProvider({ id: 'azureopenai:chat:gpt-4' });

      (cliState as any).config = {
        defaultTest: {
          provider: 'azureopenai:chat:gpt-4',
        },
      };

      vi.mocked(loadApiProvider).mockResolvedValue(azureProvider);

      const result = await getGradingProvider('text', undefined, null);

      expect(loadApiProvider).toHaveBeenCalledWith('azureopenai:chat:gpt-4', {
        basePath: undefined,
      });
      expect(result).toBe(azureProvider);
    });

    it('should skip defaultTest.provider when it is promptfoo:simulated-user', async () => {
      const defaultProvider = createMockProvider({ id: 'default-provider' });

      (cliState as any).config = {
        defaultTest: {
          provider: createSimulatedUserProvider(),
        },
      };

      const result = await getGradingProvider('text', undefined, defaultProvider);

      expect(loadApiProvider).not.toHaveBeenCalled();
      expect(result).toBe(defaultProvider);
    });

    it('should fall back to defaultTest.options.provider when defaultTest.provider is promptfoo:simulated-user', async () => {
      const azureProvider = createMockProvider({ id: 'azureopenai:chat:gpt-4' });

      (cliState as any).config = {
        defaultTest: {
          provider: createSimulatedUserProvider(),
          options: {
            provider: 'azureopenai:chat:gpt-4',
          },
        },
      };

      vi.mocked(loadApiProvider).mockResolvedValue(azureProvider);

      const result = await getGradingProvider('text', undefined, null);

      expect(loadApiProvider).toHaveBeenCalledWith('azureopenai:chat:gpt-4', {
        basePath: undefined,
      });
      expect(result).toBe(azureProvider);
    });

    it('should use defaultTest.options.provider.text when specified', async () => {
      const azureProvider = createMockProvider({ id: 'azureopenai:chat:gpt-4' });

      (cliState as any).config = {
        defaultTest: {
          options: {
            provider: {
              text: 'azureopenai:chat:gpt-4',
            },
          },
        },
      };

      vi.mocked(loadApiProvider).mockResolvedValue(azureProvider);

      const result = await getGradingProvider('text', undefined, null);

      expect(loadApiProvider).toHaveBeenCalledWith('azureopenai:chat:gpt-4', {
        basePath: undefined,
      });
      expect(result).toBe(azureProvider);
    });

    it('should prefer defaultTest.provider over defaultTest.options.provider', async () => {
      const azureProvider = createMockProvider({ id: 'azureopenai:chat:gpt-4' });

      (cliState as any).config = {
        defaultTest: {
          provider: 'azureopenai:chat:gpt-4',
          options: {
            provider: 'openai:gpt-4',
          },
        },
      };

      vi.mocked(loadApiProvider).mockResolvedValue(azureProvider);

      const result = await getGradingProvider('text', undefined, null);

      expect(loadApiProvider).toHaveBeenCalledWith('azureopenai:chat:gpt-4', {
        basePath: undefined,
      });
      expect(result).toBe(azureProvider);
    });

    it('should fall back to defaultProvider when no defaultTest provider configured', async () => {
      const defaultProvider = createMockProvider({ id: 'default-provider' });

      (cliState as any).config = {
        defaultTest: {},
      };

      const result = await getGradingProvider('text', undefined, defaultProvider);

      expect(loadApiProvider).not.toHaveBeenCalled();
      expect(result).toBe(defaultProvider);
    });

    it('should fall back to defaultProvider when cliState.config is undefined', async () => {
      const defaultProvider = createMockProvider({ id: 'default-provider' });

      (cliState as any).config = undefined;

      const result = await getGradingProvider('text', undefined, defaultProvider);

      expect(loadApiProvider).not.toHaveBeenCalled();
      expect(result).toBe(defaultProvider);
    });

    it('should return null when no provider and no defaultProvider specified', async () => {
      (cliState as any).config = {};

      const result = await getGradingProvider('text', undefined, null);

      expect(result).toBeNull();
    });

    it('should work with full Azure provider configuration', async () => {
      const azureProvider = createMockProvider({ id: 'azureopenai:chat:gpt-4o' });

      (cliState as any).config = {
        defaultTest: {
          options: {
            provider: {
              id: 'azureopenai:chat:gpt-4o',
              config: {
                apiHost: 'https://my-resource.openai.azure.com',
                apiKey: 'my-api-key',
                deploymentName: 'gpt-4o',
              },
            },
          },
        },
      };

      vi.mocked(loadApiProvider).mockResolvedValue(azureProvider);

      const result = await getGradingProvider('text', undefined, null);

      // Since we recursively call getGradingProvider, it delegates to loadFromProviderOptions
      // which calls loadApiProvider with the id and options structure
      expect(loadApiProvider).toHaveBeenCalledWith('azureopenai:chat:gpt-4o', {
        options: {
          id: 'azureopenai:chat:gpt-4o',
          config: {
            apiHost: 'https://my-resource.openai.azure.com',
            apiKey: 'my-api-key',
            deploymentName: 'gpt-4o',
          },
        },
        basePath: undefined,
      });
      expect(result).toBe(azureProvider);
    });

    it('should select defaultTest.options.provider.embedding when embedding type is requested', async () => {
      const azureEmbeddingProvider = createMockProvider({
        id: 'azureopenai:embedding:text-embedding-3-large',
      });
      (azureEmbeddingProvider as any).callEmbeddingApi = vi.fn();

      const embeddingConfig = {
        id: 'azureopenai:embedding:text-embedding-3-large',
        config: {
          apiHost: 'my-resource.openai.azure.com',
          azureClientId: 'client-id',
          azureClientSecret: 'client-secret',
          azureTenantId: 'tenant-id',
        },
      };

      (cliState as any).config = {
        defaultTest: {
          options: {
            provider: {
              text: {
                id: 'azureopenai:chat:gpt-4o',
                config: {
                  apiHost: 'my-resource.openai.azure.com',
                  azureClientId: 'client-id',
                  azureClientSecret: 'client-secret',
                  azureTenantId: 'tenant-id',
                },
              },
              embedding: embeddingConfig,
            },
          },
        },
      };

      vi.mocked(loadApiProvider).mockResolvedValue(azureEmbeddingProvider);

      const defaultEmbedding = createMockProvider({ id: 'openai:embedding:default' });
      const result = await getGradingProvider('embedding', undefined, defaultEmbedding);
      const checked = await getAndCheckProvider(
        'embedding',
        undefined,
        defaultEmbedding,
        'similarity check',
      );

      expect(loadApiProvider).toHaveBeenCalledWith('azureopenai:embedding:text-embedding-3-large', {
        options: embeddingConfig,
        basePath: undefined,
      });
      expect(result).toBe(azureEmbeddingProvider);
      expect(checked).toBe(azureEmbeddingProvider);
    });

    it('should select classification and moderation providers from defaultTest.options.provider', async () => {
      const classificationProvider = createMockProvider({ id: 'openai:classification' });
      const moderationProvider = createMockProvider({ id: 'openai:moderation' });

      (cliState as any).config = {
        defaultTest: {
          options: {
            provider: {
              classification: 'openai:classification',
              moderation: 'openai:moderation',
            },
          },
        },
      };

      vi.mocked(loadApiProvider)
        .mockResolvedValueOnce(classificationProvider)
        .mockResolvedValueOnce(moderationProvider);

      expect(await getGradingProvider('classification', undefined, null)).toBe(
        classificationProvider,
      );
      expect(await getGradingProvider('moderation', undefined, null)).toBe(moderationProvider);
    });

    it('should fall back to defaultProvider when defaultTest.options.provider omits the requested type', async () => {
      const defaultTextProvider = createMockProvider({ id: 'default-text-provider' });
      const defaultEmbeddingProvider = createMockProvider({ id: 'default-embedding-provider' });

      (cliState as any).config = {
        defaultTest: {
          options: {
            provider: {
              embedding: 'openai:embedding:text-embedding-3-small',
            },
          },
        },
      };

      await expect(getGradingProvider('text', undefined, defaultTextProvider)).resolves.toBe(
        defaultTextProvider,
      );
      expect(loadApiProvider).not.toHaveBeenCalled();

      (cliState as any).config = {
        defaultTest: {
          options: {
            provider: {
              text: 'azureopenai:chat:gpt-4',
            },
          },
        },
      };

      await expect(
        getGradingProvider('embedding', undefined, defaultEmbeddingProvider),
      ).resolves.toBe(defaultEmbeddingProvider);
      expect(loadApiProvider).not.toHaveBeenCalled();
    });

    it('should skip simulated-user on text without blocking embedding in defaultTest.options.provider', async () => {
      const embeddingProvider = createMockProvider({
        id: 'openai:embedding:text-embedding-3-small',
      });
      const defaultTextProvider = createMockProvider({ id: 'default-text-provider' });

      (cliState as any).config = {
        defaultTest: {
          options: {
            provider: {
              text: createSimulatedUserProvider(),
              embedding: 'openai:embedding:text-embedding-3-small',
            },
          },
        },
      };

      vi.mocked(loadApiProvider).mockResolvedValue(embeddingProvider);

      await expect(getGradingProvider('text', undefined, defaultTextProvider)).resolves.toBe(
        defaultTextProvider,
      );
      await expect(getGradingProvider('embedding', undefined, null)).resolves.toBe(
        embeddingProvider,
      );
      expect(loadApiProvider).toHaveBeenCalledTimes(1);
    });
  });

  describe('explicit provider takes precedence over defaultTest', () => {
    it('should use explicit provider over defaultTest.options.provider', async () => {
      const explicitProvider = createMockProvider({ id: 'explicit-provider' });

      (cliState as any).config = createAzureDefaultGrader();

      vi.mocked(loadApiProvider).mockResolvedValue(explicitProvider);

      const result = await getGradingProvider('text', 'openai:gpt-4o', null);

      expect(loadApiProvider).toHaveBeenCalledWith('openai:gpt-4o', { basePath: undefined });
      expect(result).toBe(explicitProvider);
    });

    it('should use explicit provider object over defaultTest', async () => {
      const explicitProvider = createMockProvider({ id: 'explicit-provider' });

      (cliState as any).config = createAzureDefaultGrader();

      const result = await getGradingProvider('text', explicitProvider, null);

      expect(loadApiProvider).not.toHaveBeenCalled();
      expect(result).toBe(explicitProvider);
    });
  });

  describe('error handling', () => {
    it('reports a nested array without copying the provider configuration', async () => {
      const grader = { id: 'openai:chat:grader', config: { apiKey: 'synthetic-grader-secret' } };
      const result = getGradingProvider('text', [grader] as any, null);
      await expect(result).rejects.toThrow('received an array');
      await expect(result).rejects.not.toThrow(grader.config.apiKey);
    });

    it('should throw error for invalid provider definition', async () => {
      const invalidProvider = { foo: 'bar' };

      await expect(getGradingProvider('text', invalidProvider as any, null)).rejects.toThrow(
        "Invalid provider definition for output type 'text'",
      );
    });
  });

  describe('backwards compatibility', () => {
    it('should maintain existing behavior when defaultTest not configured', async () => {
      const defaultProvider = createMockProvider({ id: 'default-provider' });

      // No defaultTest in config
      (cliState as any).config = {};

      const result = await getGradingProvider('text', undefined, defaultProvider);

      expect(result).toBe(defaultProvider);
      expect(loadApiProvider).not.toHaveBeenCalled();
    });

    it('should maintain existing behavior with explicit provider', async () => {
      const explicitProvider = createMockProvider({ id: 'explicit-provider' });

      (cliState as any).config = {
        defaultTest: {
          options: {
            provider: 'should-be-ignored',
          },
        },
      };

      vi.mocked(loadApiProvider).mockResolvedValue(explicitProvider);

      const result = await getGradingProvider('text', 'openai:gpt-4', null);

      expect(loadApiProvider).toHaveBeenCalledWith('openai:gpt-4', { basePath: undefined });
      expect(result).toBe(explicitProvider);
    });
  });
});
