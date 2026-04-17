import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { getGradingProvider } from '../../src/matchers';
import { loadApiProvider } from '../../src/providers/index';

vi.mock('../../src/providers', () => ({
  loadApiProvider: vi.fn(),
}));

vi.mock('../../src/cliState');

describe('getGradingProvider', () => {
  const mockProvider = {
    id: () => 'test-provider',
    callApi: vi.fn(),
  };

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
      const azureProvider = {
        id: () => 'azureopenai:chat:gpt-4',
        callApi: vi.fn(),
      };

      (cliState as any).config = {
        defaultTest: {
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

    it('should use defaultTest.provider when options.provider not specified', async () => {
      const azureProvider = {
        id: () => 'azureopenai:chat:gpt-4',
        callApi: vi.fn(),
      };

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

    it('should use defaultTest.options.provider.text when specified', async () => {
      const azureProvider = {
        id: () => 'azureopenai:chat:gpt-4',
        callApi: vi.fn(),
      };

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
      const azureProvider = {
        id: () => 'azureopenai:chat:gpt-4',
        callApi: vi.fn(),
      };

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
      const defaultProvider = {
        id: () => 'default-provider',
        callApi: vi.fn(),
      };

      (cliState as any).config = {
        defaultTest: {},
      };

      const result = await getGradingProvider('text', undefined, defaultProvider);

      expect(loadApiProvider).not.toHaveBeenCalled();
      expect(result).toBe(defaultProvider);
    });

    it('should fall back to defaultProvider when cliState.config is undefined', async () => {
      const defaultProvider = {
        id: () => 'default-provider',
        callApi: vi.fn(),
      };

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
      const azureProvider = {
        id: () => 'azureopenai:chat:gpt-4o',
        callApi: vi.fn(),
      };

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
  });

  describe('explicit provider takes precedence over defaultTest', () => {
    it('should use explicit provider over defaultTest.options.provider', async () => {
      const explicitProvider = {
        id: () => 'explicit-provider',
        callApi: vi.fn(),
      };

      (cliState as any).config = {
        defaultTest: {
          options: {
            provider: 'azureopenai:chat:gpt-4',
          },
        },
      };

      vi.mocked(loadApiProvider).mockResolvedValue(explicitProvider);

      const result = await getGradingProvider('text', 'openai:gpt-4o', null);

      expect(loadApiProvider).toHaveBeenCalledWith('openai:gpt-4o', { basePath: undefined });
      expect(result).toBe(explicitProvider);
    });

    it('should use explicit provider object over defaultTest', async () => {
      const explicitProvider = {
        id: () => 'explicit-provider',
        callApi: vi.fn(),
      };

      (cliState as any).config = {
        defaultTest: {
          options: {
            provider: 'azureopenai:chat:gpt-4',
          },
        },
      };

      const result = await getGradingProvider('text', explicitProvider, null);

      expect(loadApiProvider).not.toHaveBeenCalled();
      expect(result).toBe(explicitProvider);
    });
  });

  describe('error handling', () => {
    it('should throw error when provider is an array', async () => {
      const providerArray = ['openai:gpt-4'];

      await expect(getGradingProvider('text', providerArray as any, null)).rejects.toThrow(
        'Provider must be an object or string, but received an array',
      );
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
      const defaultProvider = {
        id: () => 'default-provider',
        callApi: vi.fn(),
      };

      // No defaultTest in config
      (cliState as any).config = {};

      const result = await getGradingProvider('text', undefined, defaultProvider);

      expect(result).toBe(defaultProvider);
      expect(loadApiProvider).not.toHaveBeenCalled();
    });

    it('should maintain existing behavior with explicit provider', async () => {
      const explicitProvider = {
        id: () => 'explicit-provider',
        callApi: vi.fn(),
      };

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
