import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AzureModerationProvider } from '../../src/providers/azure/moderation';
import {
  getDefaultProviders,
  setDefaultCompletionProviders,
  setDefaultEmbeddingProviders,
} from '../../src/providers/defaults';
import { OpenAiModerationProvider } from '../../src/providers/openai/moderation';
import type { ApiProvider } from '../../src/types';
import type { EnvOverrides } from '../../src/types/env';
import type { DefaultProviders } from '../../src/types/providerConfig';

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

describe('Provider override tests', () => {
  const originalEnv = process.env;
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
    process.env = originalEnv;
    jest.clearAllMocks();

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

// Create a separate describe block for moderation provider tests
describe('Moderation provider tests', () => {
  // These tests are more focused on the functionality than on the implementation details

  it('Azure moderation provider should be instantiatable with endpoint', () => {
    const provider = new AzureModerationProvider('text-content-safety', {
      env: { AZURE_CONTENT_SAFETY_ENDPOINT: 'https://test-endpoint.com' } as EnvOverrides,
    });

    expect(provider).toBeInstanceOf(AzureModerationProvider);
    expect(provider.modelName).toBe('text-content-safety');
  });

  it('Azure moderation provider should support custom configuration', () => {
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

  it('OpenAI moderation provider should be instantiatable', () => {
    const provider = new OpenAiModerationProvider('omni-moderation-latest');
    expect(provider).toBeInstanceOf(OpenAiModerationProvider);
    expect(provider.modelName).toBe('omni-moderation-latest');
  });
});
