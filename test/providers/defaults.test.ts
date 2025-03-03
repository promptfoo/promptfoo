import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  getDefaultProviders,
  setDefaultCompletionProviders,
  setDefaultEmbeddingProviders,
  getAvailableProviders,
  getProviderPriority,
} from '../../src/providers/defaults';
import type { ApiProvider } from '../../src/types';

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

describe('Provider management tests', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    setDefaultCompletionProviders(undefined as any);
    setDefaultEmbeddingProviders(undefined as any);
    jest.resetAllMocks();
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.AZURE_OPENAI_API_KEY;
    delete process.env.AZURE_API_KEY;
    delete process.env.GOOGLE_PROJECT_ID;
    delete process.env.GOOGLE_LOCATION;
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('Provider override tests', () => {
    beforeEach(() => {
      process.env.OPENAI_API_KEY = 'test-key';
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

  describe('Provider availability tests', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should detect OpenAI availability', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const providers = await getAvailableProviders();
      expect(providers).toContain('openai');
    });

    it('should detect Anthropic availability', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      const providers = await getAvailableProviders();
      expect(providers).toContain('anthropic');
    });

    it('should detect Azure availability', async () => {
      process.env.AZURE_OPENAI_API_KEY = 'test-key';
      process.env.AZURE_OPENAI_DEPLOYMENT_NAME = 'test-deployment';
      const providers = await getAvailableProviders();
      expect(providers).toContain('azure');
    });

    it('should handle no available providers', async () => {
      process.env = {};
      await expect(getDefaultProviders()).rejects.toThrow('No valid provider configuration found');
    });
  });

  describe('Provider priority tests', () => {
    it('should return correct priority order', () => {
      expect(getProviderPriority('openai')).toBe(0);
      expect(getProviderPriority('anthropic')).toBe(1);
      expect(getProviderPriority('vertex')).toBe(2);
      expect(getProviderPriority('azure')).toBe(3);
    });

    it('should prefer OpenAI over other providers when multiple are available', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.ANTHROPIC_API_KEY = 'test-key';
      const providers = await getAvailableProviders();
      expect(providers[0]).toBe('openai');
    });
  });

  describe('Azure provider specific tests', () => {
    it('should handle alternative Azure API key env var', async () => {
      process.env.AZURE_API_KEY = 'test-key';
      process.env.AZURE_OPENAI_DEPLOYMENT_NAME = 'test-deployment';
      const providers = await getAvailableProviders();
      expect(providers).toContain('azure');
    });

    it('should require deployment name for Azure', async () => {
      process.env.AZURE_OPENAI_API_KEY = 'test-key';
      const providers = await getAvailableProviders();
      expect(providers).not.toContain('azure');
    });

    it('should use default deployment name for embedding if not specified', async () => {
      process.env.AZURE_OPENAI_API_KEY = 'test-key';
      process.env.AZURE_OPENAI_DEPLOYMENT_NAME = 'test-deployment';
      const providers = await getDefaultProviders();
      expect(providers.embeddingProvider).toBeDefined();
    });
  });

  describe('Environment variable handling', () => {
    it('should handle missing optional environment variables', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      await expect(getDefaultProviders()).resolves.toBeDefined();
    });

    it('should handle environment variable overrides', async () => {
      const env = { OPENAI_API_KEY: 'override-key' };
      const providers = await getAvailableProviders(env);
      expect(providers).toContain('openai');
    });
  });

  describe('Error handling', () => {
    it('should handle undefined environment', async () => {
      process.env = {};
      await expect(getAvailableProviders(undefined)).resolves.toEqual([]);
    });

    it('should handle empty environment', async () => {
      process.env = {};
      await expect(getAvailableProviders({})).resolves.toEqual([]);
    });
  });
});
