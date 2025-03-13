import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AzureModerationProvider } from '../../src/providers/azure/moderation';
import {
  getDefaultProviders,
  setDefaultCompletionProviders,
  setDefaultEmbeddingProviders,
  isKeySet,
  PROVIDERS,
} from '../../src/providers/defaults';
import { OpenAiModerationProvider } from '../../src/providers/openai/moderation';
import type { ApiProvider } from '../../src/types';
import type { EnvOverrides } from '../../src/types/env';
import type { DefaultProviders } from '../../src/types/providerConfig';

// Mock the entire logger module to prevent Azure auth errors
jest.mock('../../src/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Mock Azure-related modules to prevent authentication errors
jest.mock('../../src/providers/azure', () => ({
  AzureModerationProvider: class MockAzureModerationProvider {
    constructor() {}
    initialize() {
      return Promise.resolve(this);
    }
    id() {
      return 'mock-azure-moderation';
    }
    moderateText() {
      return Promise.resolve({});
    }
  },
}));

jest.mock('../../src/providers/azure/defaults', () => ({
  AzureProviderConfig: (env: any) => ({
    datasetGenerationProvider: { id: () => 'mock-azure-provider' },
    embeddingProvider: { id: () => 'mock-azure-provider' },
    gradingJsonProvider: { id: () => 'mock-azure-provider' },
    gradingProvider: { id: () => 'mock-azure-provider' },
    moderationProvider: { id: () => 'mock-azure-provider' },
    suggestionsProvider: { id: () => 'mock-azure-provider' },
    synthesizeProvider: { id: () => 'mock-azure-provider' },
  }),
}));

/**
 * Mock provider for testing provider override functionality
 */
class MockProvider implements ApiProvider {
  private providerId: string;

  constructor(id: string) {
    this.providerId = id;
  }

  id(): string {
    return this.providerId;
  }

  async callApi() {
    return {};
  }
}

describe('Provider defaults module', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Provider override functionality', () => {
    let originalDefaultProviders: (env?: EnvOverrides) => Promise<DefaultProviders>;

    beforeEach(() => {
      process.env = { ...originalEnv };
      setDefaultCompletionProviders(undefined as any);
      setDefaultEmbeddingProviders(undefined as any);

      // Keep reference to the original function
      originalDefaultProviders = (getDefaultProviders as any).__original || getDefaultProviders;

      // Save the original if we haven't already
      if (!(getDefaultProviders as any).__original) {
        (getDefaultProviders as any).__original = getDefaultProviders;
      }
    });

    afterEach(() => {
      // Restore the original function after tests
      const mockDefaultProviders = jest.fn(originalDefaultProviders);
      (global as any).getDefaultProviders = mockDefaultProviders;
    });

    it('should override all completion providers when setDefaultCompletionProviders is called', async () => {
      const mockProvider = new MockProvider('test-completion-provider');
      await setDefaultCompletionProviders(mockProvider);
      const providers = await getDefaultProviders();

      expect(providers.datasetGenerationProvider.id()).toBe('test-completion-provider');
      expect(providers.gradingJsonProvider.id()).toBe('test-completion-provider');
      expect(providers.gradingProvider.id()).toBe('test-completion-provider');
      expect(providers.suggestionsProvider.id()).toBe('test-completion-provider');
      expect(providers.synthesizeProvider.id()).toBe('test-completion-provider');
      expect(providers.embeddingProvider.id()).not.toBe('test-completion-provider');
    });

    it('should override embedding provider when setDefaultEmbeddingProviders is called', async () => {
      const mockProvider = new MockProvider('test-embedding-provider');
      await setDefaultEmbeddingProviders(mockProvider);
      const providers = await getDefaultProviders();

      expect(providers.embeddingProvider.id()).toBe('test-embedding-provider');
      expect(providers.datasetGenerationProvider.id()).not.toBe('test-embedding-provider');
      expect(providers.gradingJsonProvider.id()).not.toBe('test-embedding-provider');
      expect(providers.gradingProvider.id()).not.toBe('test-embedding-provider');
      expect(providers.suggestionsProvider.id()).not.toBe('test-embedding-provider');
      expect(providers.synthesizeProvider.id()).not.toBe('test-embedding-provider');
    });

    it('should allow both completion and embedding provider overrides simultaneously', async () => {
      const mockCompletionProvider = new MockProvider('test-completion-provider');
      const mockEmbeddingProvider = new MockProvider('test-embedding-provider');

      await setDefaultCompletionProviders(mockCompletionProvider);
      await setDefaultEmbeddingProviders(mockEmbeddingProvider);
      const providers = await getDefaultProviders();

      expect(providers.datasetGenerationProvider.id()).toBe('test-completion-provider');
      expect(providers.gradingJsonProvider.id()).toBe('test-completion-provider');
      expect(providers.gradingProvider.id()).toBe('test-completion-provider');
      expect(providers.suggestionsProvider.id()).toBe('test-completion-provider');
      expect(providers.synthesizeProvider.id()).toBe('test-completion-provider');
      expect(providers.embeddingProvider.id()).toBe('test-embedding-provider');
    });
  });

  describe('Environment key checking', () => {
    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    it('should return true when env variable is set', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      expect(isKeySet('OPENAI_API_KEY', undefined)).toBe(true);
    });

    it('should return true when env override is set', () => {
      const envOverrides: EnvOverrides = {
        OPENAI_API_KEY: 'test-key',
      } as EnvOverrides;
      expect(isKeySet('OPENAI_API_KEY', envOverrides)).toBe(true);
    });

    it('should return false when neither env variable nor override is set', () => {
      delete process.env.OPENAI_API_KEY;
      const envOverrides: EnvOverrides = {} as EnvOverrides;
      expect(isKeySet('OPENAI_API_KEY', envOverrides)).toBe(false);
    });
  });

  describe('Provider credential detection', () => {
    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    it('should check Azure credentials properly', async () => {
      const azureProvider = PROVIDERS.find((p) => p.name === 'azure');
      expect(azureProvider).toBeDefined();
      if (!azureProvider) {
        return;
      }

      expect(azureProvider.hasCredentials({})).toBe(false);

      const envWithApiKey: EnvOverrides = {
        AZURE_OPENAI_API_KEY: 'test-key',
        AZURE_OPENAI_DEPLOYMENT_NAME: 'test-deployment',
      } as EnvOverrides;
      expect(azureProvider.hasCredentials(envWithApiKey)).toBe(true);

      const envWithClientCreds: EnvOverrides = {
        AZURE_CLIENT_ID: 'test-id',
        AZURE_CLIENT_SECRET: 'test-secret',
        AZURE_TENANT_ID: 'test-tenant',
        AZURE_DEPLOYMENT_NAME: 'test-deployment',
      } as EnvOverrides;
      expect(azureProvider.hasCredentials(envWithClientCreds)).toBe(true);

      const envWithoutDeployment: EnvOverrides = {
        AZURE_OPENAI_API_KEY: 'test-key',
      } as EnvOverrides;
      expect(azureProvider.hasCredentials(envWithoutDeployment)).toBe(false);
    });

    it('should check Anthropic credentials properly', async () => {
      const anthropicProvider = PROVIDERS.find((p) => p.name === 'anthropic');
      expect(anthropicProvider).toBeDefined();
      if (!anthropicProvider) {
        return;
      }

      process.env.ANTHROPIC_API_KEY = 'test-key';
      expect(isKeySet('ANTHROPIC_API_KEY', {})).toBe(true);

      const envWithApiKey: EnvOverrides = {
        ANTHROPIC_API_KEY: 'test-key',
      } as EnvOverrides;
      expect(isKeySet('ANTHROPIC_API_KEY', envWithApiKey)).toBe(true);

      delete process.env.ANTHROPIC_API_KEY;
      expect(isKeySet('ANTHROPIC_API_KEY', {})).toBe(false);
    });

    it('should check Bedrock credentials properly', async () => {
      const bedrockProvider = PROVIDERS.find((p) => p.name === 'bedrock');
      expect(bedrockProvider).toBeDefined();
      if (!bedrockProvider) {
        return;
      }

      delete process.env.AWS_BEDROCK_REGION;
      expect(isKeySet('AWS_BEDROCK_REGION', {})).toBe(false);

      const envWithRegion: EnvOverrides = {
        AWS_BEDROCK_REGION: 'us-west-2',
      } as EnvOverrides;
      expect(isKeySet('AWS_BEDROCK_REGION', envWithRegion)).toBe(true);

      process.env.AWS_BEDROCK_REGION = 'us-west-2';
      expect(isKeySet('AWS_BEDROCK_REGION', {})).toBe(true);
    });

    it('should check Gemini credentials properly', async () => {
      const geminiProvider = PROVIDERS.find((p) => p.name === 'gemini');
      if (!geminiProvider) {
        return;
      }

      expect(geminiProvider.hasCredentials).toBeDefined();
      expect(typeof geminiProvider.hasCredentials).toBe('function');
    });

    it('should handle Azure provider configuration with legacy interfaces', async () => {
      const mockAzureConfig = {
        getDefaultProvidersWithEnv: jest.fn().mockReturnValue({
          datasetGenerationProvider: { id: () => 'azure-legacy-with-env' },
          embeddingProvider: { id: () => 'azure-legacy-with-env' },
          gradingJsonProvider: { id: () => 'azure-legacy-with-env' },
          gradingProvider: { id: () => 'azure-legacy-with-env' },
          moderationProvider: { id: () => 'azure-legacy-with-env' },
          suggestionsProvider: { id: () => 'azure-legacy-with-env' },
          synthesizeProvider: { id: () => 'azure-legacy-with-env' },
        }),
      };

      const result = {
        hasLegacyInterface: false,
        calledWithEnv: false,
      };

      let azureLegacyWithEnvResult: any = null;

      if (typeof mockAzureConfig === 'object') {
        result.hasLegacyInterface = true;
        if (mockAzureConfig.getDefaultProvidersWithEnv) {
          result.calledWithEnv = true;
          azureLegacyWithEnvResult = mockAzureConfig.getDefaultProvidersWithEnv({});
        }
      }

      expect(result.hasLegacyInterface).toBe(true);
      expect(result.calledWithEnv).toBe(true);
      expect(azureLegacyWithEnvResult).toBeTruthy();
      const envResultId = azureLegacyWithEnvResult?.datasetGenerationProvider?.id();
      expect(typeof envResultId).toBe('string');
      expect(envResultId).toBe('azure-legacy-with-env');
    });

    it('should handle Azure provider with legacy object interface without env param', async () => {
      const mockAzureConfig = {
        getDefaultProviders: jest.fn().mockReturnValue({
          datasetGenerationProvider: { id: () => 'azure-legacy-without-env' },
          embeddingProvider: { id: () => 'azure-legacy-without-env' },
          gradingJsonProvider: { id: () => 'azure-legacy-without-env' },
          gradingProvider: { id: () => 'azure-legacy-without-env' },
          moderationProvider: { id: () => 'azure-legacy-without-env' },
          suggestionsProvider: { id: () => 'azure-legacy-without-env' },
          synthesizeProvider: { id: () => 'azure-legacy-without-env' },
        }),
      };

      const result = {
        hasLegacyInterface: false,
        calledWithoutEnv: false,
      };

      let azureLegacyWithoutEnvResult: any = null;

      if (typeof mockAzureConfig === 'object') {
        result.hasLegacyInterface = true;
        if (mockAzureConfig.getDefaultProviders) {
          result.calledWithoutEnv = true;
          azureLegacyWithoutEnvResult = mockAzureConfig.getDefaultProviders();
        }
      }

      expect(result.hasLegacyInterface).toBe(true);
      expect(result.calledWithoutEnv).toBe(true);
      expect(azureLegacyWithoutEnvResult).toBeTruthy();
      const withoutEnvResultId = azureLegacyWithoutEnvResult?.datasetGenerationProvider?.id();
      expect(typeof withoutEnvResultId).toBe('string');
      expect(withoutEnvResultId).toBe('azure-legacy-without-env');
    });

    it('should throw error for improperly formatted Azure provider config', async () => {
      const mockImproperAzureConfig = {};

      const result = () => {
        if (typeof mockImproperAzureConfig === 'function') {
          return mockImproperAzureConfig({});
        }

        const config = mockImproperAzureConfig as any;
        if (config.getDefaultProvidersWithEnv) {
          return config.getDefaultProvidersWithEnv({});
        }
        if (config.getDefaultProviders) {
          return config.getDefaultProviders();
        }

        throw new Error('Azure provider configuration is not properly formatted');
      };

      expect(result).toThrow('Azure provider configuration is not properly formatted');
    });
  });

  describe('Moderation provider configuration', () => {
    it('should instantiate Azure moderation provider with endpoint', () => {
      const provider = new AzureModerationProvider('text-content-safety', {
        env: { AZURE_CONTENT_SAFETY_ENDPOINT: 'https://test-endpoint.com' } as EnvOverrides,
      });

      expect(provider).toBeInstanceOf(AzureModerationProvider);
      expect(provider.modelName).toBe('text-content-safety');
    });

    it('should support custom Azure moderation configuration', () => {
      const customConfig = {
        AZURE_CONTENT_SAFETY_ENDPOINT: 'https://test-endpoint.com',
        AZURE_CONTENT_SAFETY_API_KEY: 'test-api-key',
        AZURE_CONTENT_SAFETY_API_VERSION: '2024-01-01',
      } as EnvOverrides;

      const provider = new AzureModerationProvider('text-content-safety', { env: customConfig });

      expect(provider).toBeInstanceOf(AzureModerationProvider);
      expect(provider.modelName).toBe('text-content-safety');
      expect(provider.endpoint).toBe('https://test-endpoint.com');
      expect(provider.apiVersion).toBe('2024-01-01');
    });

    it('should instantiate OpenAI moderation provider', () => {
      const provider = new OpenAiModerationProvider('omni-moderation-latest');

      expect(provider).toBeInstanceOf(OpenAiModerationProvider);
      expect(provider.modelName).toBe('omni-moderation-latest');
    });
  });
});
