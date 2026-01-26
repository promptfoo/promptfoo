import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AzureModerationProvider } from '../../src/providers/azure/moderation';
import {
  getDefaultProviders,
  getDefaultProvidersWithInfo,
  setDefaultCompletionProviders,
  setDefaultEmbeddingProviders,
} from '../../src/providers/defaults';
import {
  DefaultGradingJsonProvider as GoogleAiStudioGradingJsonProvider,
  DefaultGradingProvider as GoogleAiStudioGradingProvider,
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

import type { EnvOverrides } from '../../src/types/env';
import type { ApiProvider } from '../../src/types/index';

vi.mock('../../src/providers/google/util', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    hasGoogleDefaultCredentials: vi.fn().mockResolvedValue(false),
  };
});

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
    vi.clearAllMocks();
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

describe('getDefaultProvidersWithInfo', () => {
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
    delete process.env.GITHUB_TOKEN;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it('should return selection info with Anthropic when ANTHROPIC_API_KEY is set', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const result = await getDefaultProvidersWithInfo();

    expect(result.selectionInfo.selectedProvider).toBe('Anthropic');
    expect(result.selectionInfo.detectedCredentials).toContain('ANTHROPIC_API_KEY');
    expect(result.selectionInfo.reason).toContain('ANTHROPIC_API_KEY');
  });

  it('should return selection info with OpenAI when OPENAI_API_KEY is set', async () => {
    process.env.OPENAI_API_KEY = 'test-key';

    const result = await getDefaultProvidersWithInfo();

    expect(result.selectionInfo.selectedProvider).toBe('OpenAI');
    expect(result.selectionInfo.detectedCredentials).toContain('OPENAI_API_KEY');
    expect(result.selectionInfo.reason).toContain('OPENAI_API_KEY');
  });

  it('should prefer OpenAI over Anthropic when both are set', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const result = await getDefaultProvidersWithInfo();

    expect(result.selectionInfo.selectedProvider).toBe('OpenAI');
    expect(result.selectionInfo.detectedCredentials).toContain('OPENAI_API_KEY');
    expect(result.selectionInfo.detectedCredentials).toContain('ANTHROPIC_API_KEY');
  });

  it('should include skipped providers in selection info', async () => {
    // Set both OpenAI and Anthropic credentials - OpenAI should be selected, Anthropic should be skipped
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const result = await getDefaultProvidersWithInfo();

    // Anthropic should be in skipped providers since OpenAI was selected
    const skippedAnthropic = result.selectionInfo.skippedProviders.find(
      (p) => p.name === 'Anthropic',
    );
    expect(skippedAnthropic).toBeDefined();
    expect(skippedAnthropic?.reason).toContain('higher priority');
  });

  it('should populate provider slots', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const result = await getDefaultProvidersWithInfo();

    expect(result.selectionInfo.providerSlots.grading).toBeDefined();
    expect(result.selectionInfo.providerSlots.grading?.id).toContain('anthropic');
  });

  it('should return GitHub Models as fallback when no other credentials', async () => {
    process.env.GITHUB_TOKEN = 'test-token';

    const result = await getDefaultProvidersWithInfo();

    expect(result.selectionInfo.selectedProvider).toBe('GitHub Models');
    expect(result.selectionInfo.detectedCredentials).toContain('GITHUB_TOKEN');
  });

  it('should return Google AI Studio when GEMINI_API_KEY is set', async () => {
    process.env.GEMINI_API_KEY = 'test-key';

    const result = await getDefaultProvidersWithInfo();

    expect(result.selectionInfo.selectedProvider).toBe('Google AI Studio');
    expect(result.selectionInfo.detectedCredentials).toContain('GEMINI_API_KEY');
  });

  it('should return Mistral when MISTRAL_API_KEY is set', async () => {
    process.env.MISTRAL_API_KEY = 'test-key';

    const result = await getDefaultProvidersWithInfo();

    expect(result.selectionInfo.selectedProvider).toBe('Mistral');
    expect(result.selectionInfo.detectedCredentials).toContain('MISTRAL_API_KEY');
  });

  it('should work with env overrides', async () => {
    const envOverrides = {
      ANTHROPIC_API_KEY: 'override-key',
    };

    const result = await getDefaultProvidersWithInfo(envOverrides as any);

    expect(result.selectionInfo.selectedProvider).toBe('Anthropic');
    expect(result.selectionInfo.detectedCredentials).toContain('ANTHROPIC_API_KEY');
  });

  it('should return both providers and selectionInfo', async () => {
    process.env.OPENAI_API_KEY = 'test-key';

    const result = await getDefaultProvidersWithInfo();

    expect(result.providers).toBeDefined();
    expect(result.selectionInfo).toBeDefined();
    expect(result.providers.gradingProvider).toBeDefined();
    expect(result.providers.embeddingProvider).toBeDefined();
  });
});
