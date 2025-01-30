import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  getDefaultProviders,
  setDefaultCompletionProviders,
  setDefaultEmbeddingProviders,
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

describe('Provider override tests', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
    // Clear any previous provider settings
    setDefaultCompletionProviders(undefined as any);
    setDefaultEmbeddingProviders(undefined as any);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  it('should override all completion providers when setDefaultCompletionProviders is called', async () => {
    // Setup a mock provider
    const mockProvider = new MockProvider('test-completion-provider');
    await setDefaultCompletionProviders(mockProvider);

    const providers = await getDefaultProviders();

    // Check that all completion providers were overridden
    expect(providers.datasetGenerationProvider.id()).toBe('test-completion-provider');
    expect(providers.gradingJsonProvider.id()).toBe('test-completion-provider');
    expect(providers.gradingProvider.id()).toBe('test-completion-provider');
    expect(providers.suggestionsProvider.id()).toBe('test-completion-provider');
    expect(providers.synthesizeProvider.id()).toBe('test-completion-provider');

    // Verify embedding provider was not affected
    expect(providers.embeddingProvider.id()).not.toBe('test-completion-provider');
  });

  it('should override embedding provider when setDefaultEmbeddingProviders is called', async () => {
    // Setup a mock provider
    const mockProvider = new MockProvider('test-embedding-provider');
    await setDefaultEmbeddingProviders(mockProvider);

    const providers = await getDefaultProviders();

    // Check that embedding provider was overridden
    expect(providers.embeddingProvider.id()).toBe('test-embedding-provider');

    // Verify completion providers were not affected
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

    // Check completion providers
    expect(providers.datasetGenerationProvider.id()).toBe('test-completion-provider');
    expect(providers.gradingJsonProvider.id()).toBe('test-completion-provider');
    expect(providers.gradingProvider.id()).toBe('test-completion-provider');
    expect(providers.suggestionsProvider.id()).toBe('test-completion-provider');
    expect(providers.synthesizeProvider.id()).toBe('test-completion-provider');

    // Check embedding provider
    expect(providers.embeddingProvider.id()).toBe('test-embedding-provider');
  });
});
