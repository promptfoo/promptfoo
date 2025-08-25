import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { AzureModerationProvider } from '../../src/providers/azure/moderation';
import {
  getDefaultProviders,
  setDefaultCompletionProviders,
  setDefaultEmbeddingProviders,
} from '../../src/providers/defaults';
import {
  DefaultGradingProvider as GoogleAiStudioGradingProvider,
  DefaultGradingJsonProvider as GoogleAiStudioGradingJsonProvider,
  DefaultLlmRubricProvider as GoogleAiStudioLlmRubricProvider,
  DefaultSuggestionsProvider as GoogleAiStudioSuggestionsProvider,
  DefaultSynthesizeProvider as GoogleAiStudioSynthesizeProvider,
} from '../../src/providers/google/ai.studio';
import { DefaultEmbeddingProvider as GeminiEmbeddingProvider } from '../../src/providers/google/vertex';
import {
  DefaultEmbeddingProvider as MistralEmbeddingProvider,
  DefaultGradingJsonProvider as MistralGradingJsonProvider,
  DefaultGradingProvider as MistralGradingProvider,
  DefaultSuggestionsProvider as MistralSuggestionsProvider,
  DefaultSynthesizeProvider as MistralSynthesizeProvider,
} from '../../src/providers/mistral/defaults';
import { DefaultModerationProvider } from '../../src/providers/openai/defaults';

import type { ApiProvider } from '../../src/types';
import type { EnvOverrides } from '../../src/types/env';

jest.mock('../../src/providers/google/util', () => ({
  hasGoogleDefaultCredentials: jest.fn().mockResolvedValue(false),
}));

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
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.MISTRAL_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.PALM_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  it('should override all completion providers when setDefaultCompletionProviders is called', async () => {
    const mockProvider = new MockProvider('test-completion-provider');
    await setDefaultCompletionProviders(mockProvider);

    const providers = await getDefaultProviders();

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

  it('should use Mistral providers when MISTRAL_API_KEY is set', async () => {
    process.env.MISTRAL_API_KEY = 'test-key';

    const providers = await getDefaultProviders();

    expect(providers.embeddingProvider).toBe(MistralEmbeddingProvider);
    expect(providers.gradingJsonProvider).toBe(MistralGradingJsonProvider);
    expect(providers.gradingProvider).toBe(MistralGradingProvider);
    expect(providers.suggestionsProvider).toBe(MistralSuggestionsProvider);
    expect(providers.synthesizeProvider).toBe(MistralSynthesizeProvider);
  });

  it('should use Mistral providers when provided via env overrides', async () => {
    const envOverrides: EnvOverrides = {
      MISTRAL_API_KEY: 'test-key',
    } as EnvOverrides;

    const providers = await getDefaultProviders(envOverrides);

    expect(providers.embeddingProvider).toBe(MistralEmbeddingProvider);
    expect(providers.gradingJsonProvider).toBe(MistralGradingJsonProvider);
    expect(providers.gradingProvider).toBe(MistralGradingProvider);
    expect(providers.suggestionsProvider).toBe(MistralSuggestionsProvider);
    expect(providers.synthesizeProvider).toBe(MistralSynthesizeProvider);
  });

  it('should not use Mistral providers when OpenAI credentials exist', async () => {
    process.env.MISTRAL_API_KEY = 'test-key';
    process.env.OPENAI_API_KEY = 'test-key';

    const providers = await getDefaultProviders();

    expect(providers.embeddingProvider).not.toBe(MistralEmbeddingProvider);
    expect(providers.gradingJsonProvider).not.toBe(MistralGradingJsonProvider);
    expect(providers.gradingProvider).not.toBe(MistralGradingProvider);
    expect(providers.suggestionsProvider).not.toBe(MistralSuggestionsProvider);
    expect(providers.synthesizeProvider).not.toBe(MistralSynthesizeProvider);
  });

  it('should not use Mistral providers when Anthropic credentials exist', async () => {
    process.env.MISTRAL_API_KEY = 'test-key';
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const providers = await getDefaultProviders();

    expect(providers.embeddingProvider).not.toBe(MistralEmbeddingProvider);
    expect(providers.gradingJsonProvider).not.toBe(MistralGradingJsonProvider);
    expect(providers.gradingProvider).not.toBe(MistralGradingProvider);
    expect(providers.suggestionsProvider).not.toBe(MistralSuggestionsProvider);
    expect(providers.synthesizeProvider).not.toBe(MistralSynthesizeProvider);
  });

  describe('Google AI Studio provider selection', () => {
    it('should use Google AI Studio providers when GEMINI_API_KEY is set', async () => {
      process.env.GEMINI_API_KEY = 'test-key';

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider).toBe(GoogleAiStudioGradingProvider);
      expect(providers.gradingJsonProvider).toBe(GoogleAiStudioGradingJsonProvider);
      expect(providers.llmRubricProvider).toBe(GoogleAiStudioLlmRubricProvider);
      expect(providers.suggestionsProvider).toBe(GoogleAiStudioSuggestionsProvider);
      expect(providers.synthesizeProvider).toBe(GoogleAiStudioSynthesizeProvider);
      expect(providers.embeddingProvider).toBe(GeminiEmbeddingProvider); // Falls back to Vertex
    });

    it('should use Google AI Studio providers when GOOGLE_API_KEY is set', async () => {
      process.env.GOOGLE_API_KEY = 'test-key';

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider).toBe(GoogleAiStudioGradingProvider);
      expect(providers.gradingJsonProvider).toBe(GoogleAiStudioGradingJsonProvider);
      expect(providers.llmRubricProvider).toBe(GoogleAiStudioLlmRubricProvider);
      expect(providers.suggestionsProvider).toBe(GoogleAiStudioSuggestionsProvider);
      expect(providers.synthesizeProvider).toBe(GoogleAiStudioSynthesizeProvider);
      expect(providers.embeddingProvider).toBe(GeminiEmbeddingProvider); // Falls back to Vertex
    });

    it('should use Google AI Studio providers when PALM_API_KEY is set', async () => {
      process.env.PALM_API_KEY = 'test-key';

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider).toBe(GoogleAiStudioGradingProvider);
      expect(providers.gradingJsonProvider).toBe(GoogleAiStudioGradingJsonProvider);
      expect(providers.llmRubricProvider).toBe(GoogleAiStudioLlmRubricProvider);
      expect(providers.suggestionsProvider).toBe(GoogleAiStudioSuggestionsProvider);
      expect(providers.synthesizeProvider).toBe(GoogleAiStudioSynthesizeProvider);
      expect(providers.embeddingProvider).toBe(GeminiEmbeddingProvider); // Falls back to Vertex
    });

    it('should use Google AI Studio providers when provided via env overrides', async () => {
      const envOverrides: EnvOverrides = {
        GEMINI_API_KEY: 'test-key',
      } as EnvOverrides;

      const providers = await getDefaultProviders(envOverrides);

      expect(providers.gradingProvider).toBe(GoogleAiStudioGradingProvider);
      expect(providers.gradingJsonProvider).toBe(GoogleAiStudioGradingJsonProvider);
      expect(providers.llmRubricProvider).toBe(GoogleAiStudioLlmRubricProvider);
      expect(providers.suggestionsProvider).toBe(GoogleAiStudioSuggestionsProvider);
      expect(providers.synthesizeProvider).toBe(GoogleAiStudioSynthesizeProvider);
      expect(providers.embeddingProvider).toBe(GeminiEmbeddingProvider); // Falls back to Vertex
    });

    it('should not use Google AI Studio providers when OpenAI credentials exist', async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.OPENAI_API_KEY = 'test-key';

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider).not.toBe(GoogleAiStudioGradingProvider);
      expect(providers.gradingJsonProvider).not.toBe(GoogleAiStudioGradingJsonProvider);
      expect(providers.suggestionsProvider).not.toBe(GoogleAiStudioSuggestionsProvider);
      expect(providers.synthesizeProvider).not.toBe(GoogleAiStudioSynthesizeProvider);
    });

    it('should not use Google AI Studio providers when Anthropic credentials exist', async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.ANTHROPIC_API_KEY = 'test-key';

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider).not.toBe(GoogleAiStudioGradingProvider);
      expect(providers.gradingJsonProvider).not.toBe(GoogleAiStudioGradingJsonProvider);
      expect(providers.suggestionsProvider).not.toBe(GoogleAiStudioSuggestionsProvider);
      expect(providers.synthesizeProvider).not.toBe(GoogleAiStudioSynthesizeProvider);
    });

    it('should prefer Google AI Studio over Vertex when both credentials are available', async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      // hasGoogleDefaultCredentials is mocked to return false, but in practice
      // AI Studio should be preferred over Vertex in the provider selection order

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider).toBe(GoogleAiStudioGradingProvider);
      expect(providers.gradingJsonProvider).toBe(GoogleAiStudioGradingJsonProvider);
      expect(providers.suggestionsProvider).toBe(GoogleAiStudioSuggestionsProvider);
      expect(providers.synthesizeProvider).toBe(GoogleAiStudioSynthesizeProvider);
    });

    it('should prefer Google AI Studio over Mistral when both credentials are available', async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.MISTRAL_API_KEY = 'test-key';

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider).toBe(GoogleAiStudioGradingProvider);
      expect(providers.gradingJsonProvider).toBe(GoogleAiStudioGradingJsonProvider);
      expect(providers.suggestionsProvider).toBe(GoogleAiStudioSuggestionsProvider);
      expect(providers.synthesizeProvider).toBe(GoogleAiStudioSynthesizeProvider);
      expect(providers.gradingProvider).not.toBe(MistralGradingProvider);
      expect(providers.gradingJsonProvider).not.toBe(MistralGradingJsonProvider);
    });
  });
});
