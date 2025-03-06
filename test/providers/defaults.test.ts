import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { AzureModerationProvider } from '../../src/providers/azure/moderation';
import {
  getDefaultProviders,
  setDefaultCompletionProviders,
  setDefaultEmbeddingProviders,
} from '../../src/providers/defaults';
import { DefaultModerationProvider } from '../../src/providers/openai/defaults';
import type { ApiProvider } from '../../src/types';
import type { EnvOverrides } from '../../src/types/env';

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
    process.env = { ...originalEnv };
    setDefaultCompletionProviders(undefined as any);
    setDefaultEmbeddingProviders(undefined as any);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
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

  it('should use AzureModerationProvider when AZURE_CONTENT_SAFETY_ENDPOINT is set', async () => {
    process.env.AZURE_CONTENT_SAFETY_ENDPOINT = 'https://test-endpoint.com';

    const providers = await getDefaultProviders();

    expect(providers.moderationProvider).toBeInstanceOf(AzureModerationProvider);
    expect((providers.moderationProvider as AzureModerationProvider).modelName).toBe(
      'text-content-safety',
    );
  });

  it('should use DefaultModerationProvider when AZURE_CONTENT_SAFETY_ENDPOINT is not set', async () => {
    delete process.env.AZURE_CONTENT_SAFETY_ENDPOINT;

    const providers = await getDefaultProviders();
    expect(providers.moderationProvider).toBe(DefaultModerationProvider);
  });

  it('should use AzureModerationProvider when AZURE_CONTENT_SAFETY_ENDPOINT is provided via env overrides', async () => {
    const envOverrides: EnvOverrides = {
      AZURE_CONTENT_SAFETY_ENDPOINT: 'https://test-endpoint.com',
    } as EnvOverrides;

    const providers = await getDefaultProviders(envOverrides);

    expect(providers.moderationProvider).toBeInstanceOf(AzureModerationProvider);
    expect((providers.moderationProvider as AzureModerationProvider).modelName).toBe(
      'text-content-safety',
    );
  });

  it('should use Azure moderation provider with custom configuration', async () => {
    const envOverrides: EnvOverrides = {
      AZURE_CONTENT_SAFETY_ENDPOINT: 'https://test-endpoint.com',
      AZURE_CONTENT_SAFETY_API_KEY: 'test-api-key',
      AZURE_CONTENT_SAFETY_API_VERSION: '2024-01-01',
    } as EnvOverrides;

    const providers = await getDefaultProviders(envOverrides);

    expect(providers.moderationProvider).toBeInstanceOf(AzureModerationProvider);
    const moderationProvider = providers.moderationProvider as AzureModerationProvider;
    expect(moderationProvider.modelName).toBe('text-content-safety');
    expect(moderationProvider.endpoint).toBe('https://test-endpoint.com');
    expect(moderationProvider.apiVersion).toBe('2024-01-01');
  });
});
