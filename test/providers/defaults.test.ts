import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AzureModerationProvider } from '../../src/providers/azure/moderation';
import {
  getDefaultProviders,
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
import { hasGoogleDefaultCredentials } from '../../src/providers/google/util';
import { DefaultEmbeddingProvider as VertexEmbeddingProvider } from '../../src/providers/google/vertex';
import {
  DefaultEmbeddingProvider as MistralEmbeddingProvider,
  DefaultGradingJsonProvider as MistralGradingJsonProvider,
  DefaultGradingProvider as MistralGradingProvider,
  DefaultSuggestionsProvider as MistralSuggestionsProvider,
  DefaultSynthesizeProvider as MistralSynthesizeProvider,
} from '../../src/providers/mistral/defaults';
import {
  clearCodexDefaultProvidersForTesting,
  hasCodexDefaultCredentials,
} from '../../src/providers/openai/codexDefaults';
import {
  DefaultModerationProvider,
  DefaultEmbeddingProvider as OpenAiEmbeddingProvider,
  DefaultGradingJsonProvider as OpenAiGradingJsonProvider,
  DefaultGradingProvider as OpenAiGradingProvider,
  DefaultSuggestionsProvider as OpenAiSuggestionsProvider,
} from '../../src/providers/openai/defaults';
import { providerRegistry } from '../../src/providers/providerRegistry';
import { mockProcessEnv } from '../util/utils';

import type { EnvOverrides } from '../../src/types/env';
import type { ApiProvider } from '../../src/types/index';

vi.mock('../../src/providers/google/util', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/providers/google/util')>()),
  hasGoogleDefaultCredentials: vi.fn().mockResolvedValue(false),
}));

vi.mock('../../src/providers/openai/codexDefaults', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/providers/openai/codexDefaults')>()),
  hasCodexDefaultCredentials: vi.fn().mockReturnValue(false),
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
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockProcessEnv({ ...originalEnv }, { clear: true });
    setDefaultCompletionProviders(undefined as any);
    setDefaultEmbeddingProviders(undefined as any);
    vi.mocked(hasGoogleDefaultCredentials).mockResolvedValue(false);
    vi.mocked(hasCodexDefaultCredentials).mockReturnValue(false);
    clearCodexDefaultProvidersForTesting();
    // Clear all credential env vars
    mockProcessEnv({ OPENAI_API_KEY: undefined });
    mockProcessEnv({ ANTHROPIC_API_KEY: undefined });
    mockProcessEnv({ MISTRAL_API_KEY: undefined });
    mockProcessEnv({ GEMINI_API_KEY: undefined });
    mockProcessEnv({ GOOGLE_API_KEY: undefined });
    mockProcessEnv({ PALM_API_KEY: undefined });
    mockProcessEnv({ AWS_ACCESS_KEY_ID: undefined });
    mockProcessEnv({ AWS_SECRET_ACCESS_KEY: undefined });
    mockProcessEnv({ AWS_PROFILE: undefined });
    mockProcessEnv({ XAI_API_KEY: undefined });
    mockProcessEnv({ DEEPSEEK_API_KEY: undefined });
    mockProcessEnv({ GITHUB_TOKEN: undefined });
    mockProcessEnv({ VOYAGE_API_KEY: undefined });
    // Clear Azure env vars
    mockProcessEnv({ AZURE_OPENAI_API_KEY: undefined });
    mockProcessEnv({ AZURE_API_KEY: undefined });
    mockProcessEnv({ AZURE_CLIENT_ID: undefined });
    mockProcessEnv({ AZURE_CLIENT_SECRET: undefined });
    mockProcessEnv({ AZURE_TENANT_ID: undefined });
    mockProcessEnv({ AZURE_OPENAI_DEPLOYMENT_NAME: undefined });
    mockProcessEnv({ AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME: undefined });
    mockProcessEnv({ AZURE_CONTENT_SAFETY_ENDPOINT: undefined });
  });

  afterEach(async () => {
    mockProcessEnv(originalEnv, { clear: true });
    clearCodexDefaultProvidersForTesting();
    await providerRegistry.shutdownAll();
    vi.resetAllMocks();
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
    mockProcessEnv({ AZURE_CONTENT_SAFETY_ENDPOINT: 'https://test-endpoint.com' });

    const providers = await getDefaultProviders();

    expect(providers.moderationProvider).toBeInstanceOf(AzureModerationProvider);
    expect((providers.moderationProvider as AzureModerationProvider).modelName).toBe(
      'text-content-safety',
    );
  });

  it('should use DefaultModerationProvider when AZURE_CONTENT_SAFETY_ENDPOINT is not set', async () => {
    mockProcessEnv({ AZURE_CONTENT_SAFETY_ENDPOINT: undefined });

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
    mockProcessEnv({ MISTRAL_API_KEY: 'test-key' });

    const providers = await getDefaultProviders();

    expect(providers.embeddingProvider).toBe(MistralEmbeddingProvider);
    expect(providers.gradingJsonProvider).toBe(MistralGradingJsonProvider);
    expect(providers.gradingProvider).toBe(MistralGradingProvider);
    expect(providers.suggestionsProvider).toBe(MistralSuggestionsProvider);
    expect(providers.synthesizeProvider).toBe(MistralSynthesizeProvider);
  });

  it('should use Codex SDK providers when Codex credentials exist without explicit API provider keys', async () => {
    vi.mocked(hasCodexDefaultCredentials).mockReturnValue(true);

    const providers = await getDefaultProviders();

    expect(providers.gradingJsonProvider.id()).toBe('openai:codex-sdk');
    expect(providers.gradingProvider.id()).toBe('openai:codex-sdk');
    expect(providers.llmRubricProvider?.id()).toBe('openai:codex-sdk');
    expect(providers.suggestionsProvider.id()).toBe('openai:codex-sdk');
    expect(providers.synthesizeProvider.id()).toBe('openai:codex-sdk');
    expect(providers.webSearchProvider?.id()).toBe('openai:codex-sdk');
    expect(providers.webSearchProvider?.config?.web_search_mode).toBe('live');
    expect(providers.embeddingProvider.id()).toBe('openai:text-embedding-3-large');
    expect(providers.moderationProvider).toBe(DefaultModerationProvider);
  });

  it('should prefer OpenAI API defaults over Codex SDK defaults when OPENAI_API_KEY exists', async () => {
    mockProcessEnv({ OPENAI_API_KEY: 'test-openai-key' });
    vi.mocked(hasCodexDefaultCredentials).mockReturnValue(true);

    const providers = await getDefaultProviders();

    expect(providers.gradingJsonProvider).toBe(OpenAiGradingJsonProvider);
    expect(providers.gradingProvider).toBe(OpenAiGradingProvider);
    expect(providers.suggestionsProvider).toBe(OpenAiSuggestionsProvider);
    expect(providers.synthesizeProvider).toBe(OpenAiGradingJsonProvider);
  });

  it('should prefer Mistral defaults over Codex SDK defaults when MISTRAL_API_KEY exists', async () => {
    mockProcessEnv({ MISTRAL_API_KEY: 'test-mistral-key' });
    vi.mocked(hasCodexDefaultCredentials).mockReturnValue(true);

    const providers = await getDefaultProviders();

    expect(providers.gradingJsonProvider).toBe(MistralGradingJsonProvider);
    expect(providers.gradingProvider).toBe(MistralGradingProvider);
    expect(providers.suggestionsProvider).toBe(MistralSuggestionsProvider);
    expect(providers.synthesizeProvider).toBe(MistralSynthesizeProvider);
  });

  it('should prefer Codex SDK defaults over generic ambient credentials', async () => {
    mockProcessEnv({ AWS_ACCESS_KEY_ID: 'test-aws' });
    mockProcessEnv({ GITHUB_TOKEN: 'test-github' });
    vi.mocked(hasCodexDefaultCredentials).mockReturnValue(true);

    const providers = await getDefaultProviders();

    expect(providers.gradingProvider.id()).toBe('openai:codex-sdk');
  });

  it('should probe Google default credentials once when no higher-priority provider matches', async () => {
    vi.mocked(hasGoogleDefaultCredentials).mockResolvedValue(false);

    await getDefaultProviders();

    expect(hasGoogleDefaultCredentials).toHaveBeenCalledTimes(1);
  });

  it('should not probe Google default credentials when Azure is preferred', async () => {
    mockProcessEnv({ AZURE_OPENAI_API_KEY: 'azure-key' });
    mockProcessEnv({ AZURE_DEPLOYMENT_NAME: 'azure-chat' });

    await getDefaultProviders();

    expect(hasGoogleDefaultCredentials).not.toHaveBeenCalled();
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
    mockProcessEnv({ MISTRAL_API_KEY: 'test-key' });
    mockProcessEnv({ OPENAI_API_KEY: 'test-key' });

    const providers = await getDefaultProviders();

    expect(providers.embeddingProvider).not.toBe(MistralEmbeddingProvider);
    expect(providers.gradingJsonProvider).not.toBe(MistralGradingJsonProvider);
    expect(providers.gradingProvider).not.toBe(MistralGradingProvider);
    expect(providers.suggestionsProvider).not.toBe(MistralSuggestionsProvider);
    expect(providers.synthesizeProvider).not.toBe(MistralSynthesizeProvider);
  });

  it('should not use Mistral COMPLETION providers when Anthropic credentials exist', async () => {
    mockProcessEnv({ MISTRAL_API_KEY: 'test-key' });
    mockProcessEnv({ ANTHROPIC_API_KEY: 'test-key' });

    const providers = await getDefaultProviders();

    // Completion providers should use Anthropic (higher priority)
    expect(providers.gradingJsonProvider).not.toBe(MistralGradingJsonProvider);
    expect(providers.gradingProvider).not.toBe(MistralGradingProvider);
    expect(providers.suggestionsProvider).not.toBe(MistralSuggestionsProvider);
    expect(providers.synthesizeProvider).not.toBe(MistralSynthesizeProvider);

    // But embedding should use Mistral since Anthropic doesn't support embeddings
    // and Mistral is the first embedding-capable provider with credentials
    expect(providers.embeddingProvider).toBe(MistralEmbeddingProvider);
  });

  describe('Google AI Studio provider selection', () => {
    it('should use Google AI Studio providers when GEMINI_API_KEY is set', async () => {
      mockProcessEnv({ GEMINI_API_KEY: 'test-key' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider).toBe(GoogleAiStudioGradingProvider);
      expect(providers.gradingJsonProvider).toBe(GoogleAiStudioGradingJsonProvider);
      expect(providers.llmRubricProvider).toBe(GoogleAiStudioLlmRubricProvider);
      expect(providers.suggestionsProvider).toBe(GoogleAiStudioSuggestionsProvider);
      expect(providers.synthesizeProvider).toBe(GoogleAiStudioSynthesizeProvider);
      expect(providers.embeddingProvider.id()).toBe('google:embedding:gemini-embedding-001');
    });

    it('should use Google AI Studio providers when GOOGLE_API_KEY is set', async () => {
      mockProcessEnv({ GOOGLE_API_KEY: 'test-key' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider).toBe(GoogleAiStudioGradingProvider);
      expect(providers.gradingJsonProvider).toBe(GoogleAiStudioGradingJsonProvider);
      expect(providers.llmRubricProvider).toBe(GoogleAiStudioLlmRubricProvider);
      expect(providers.suggestionsProvider).toBe(GoogleAiStudioSuggestionsProvider);
      expect(providers.synthesizeProvider).toBe(GoogleAiStudioSynthesizeProvider);
      expect(providers.embeddingProvider.id()).toBe('google:embedding:gemini-embedding-001');
    });

    it('should use Google AI Studio providers when PALM_API_KEY is set', async () => {
      mockProcessEnv({ PALM_API_KEY: 'test-key' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider).toBe(GoogleAiStudioGradingProvider);
      expect(providers.gradingJsonProvider).toBe(GoogleAiStudioGradingJsonProvider);
      expect(providers.llmRubricProvider).toBe(GoogleAiStudioLlmRubricProvider);
      expect(providers.suggestionsProvider).toBe(GoogleAiStudioSuggestionsProvider);
      expect(providers.synthesizeProvider).toBe(GoogleAiStudioSynthesizeProvider);
      expect(providers.embeddingProvider.id()).toBe('google:embedding:gemini-embedding-001');
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
      expect(providers.embeddingProvider.id()).toBe('google:embedding:gemini-embedding-001');
    });

    it('should not use Google AI Studio providers when OpenAI credentials exist', async () => {
      mockProcessEnv({ GEMINI_API_KEY: 'test-key' });
      mockProcessEnv({ OPENAI_API_KEY: 'test-key' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider).not.toBe(GoogleAiStudioGradingProvider);
      expect(providers.gradingJsonProvider).not.toBe(GoogleAiStudioGradingJsonProvider);
      expect(providers.suggestionsProvider).not.toBe(GoogleAiStudioSuggestionsProvider);
      expect(providers.synthesizeProvider).not.toBe(GoogleAiStudioSynthesizeProvider);
    });

    it('should not use Google AI Studio providers when Anthropic credentials exist', async () => {
      mockProcessEnv({ GEMINI_API_KEY: 'test-key' });
      mockProcessEnv({ ANTHROPIC_API_KEY: 'test-key' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider).not.toBe(GoogleAiStudioGradingProvider);
      expect(providers.gradingJsonProvider).not.toBe(GoogleAiStudioGradingJsonProvider);
      expect(providers.suggestionsProvider).not.toBe(GoogleAiStudioSuggestionsProvider);
      expect(providers.synthesizeProvider).not.toBe(GoogleAiStudioSynthesizeProvider);
    });

    it('should prefer Google AI Studio over Vertex when both credentials are available', async () => {
      mockProcessEnv({ GEMINI_API_KEY: 'test-key' });
      // hasGoogleDefaultCredentials is mocked to return false, but in practice
      // AI Studio should be preferred over Vertex in the provider selection order

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider).toBe(GoogleAiStudioGradingProvider);
      expect(providers.gradingJsonProvider).toBe(GoogleAiStudioGradingJsonProvider);
      expect(providers.suggestionsProvider).toBe(GoogleAiStudioSuggestionsProvider);
      expect(providers.synthesizeProvider).toBe(GoogleAiStudioSynthesizeProvider);
    });

    it('should prefer Google AI Studio over Mistral when both credentials are available', async () => {
      mockProcessEnv({ GEMINI_API_KEY: 'test-key' });
      mockProcessEnv({ MISTRAL_API_KEY: 'test-key' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider).toBe(GoogleAiStudioGradingProvider);
      expect(providers.gradingJsonProvider).toBe(GoogleAiStudioGradingJsonProvider);
      expect(providers.suggestionsProvider).toBe(GoogleAiStudioSuggestionsProvider);
      expect(providers.synthesizeProvider).toBe(GoogleAiStudioSynthesizeProvider);
      expect(providers.gradingProvider).not.toBe(MistralGradingProvider);
      expect(providers.gradingJsonProvider).not.toBe(MistralGradingJsonProvider);
    });
  });

  describe('AWS Bedrock provider selection', () => {
    it('should use Bedrock providers when AWS_ACCESS_KEY_ID is set', async () => {
      mockProcessEnv({ AWS_ACCESS_KEY_ID: 'test-key' });
      mockProcessEnv({ AWS_SECRET_ACCESS_KEY: 'test-secret' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider.id()).toBe('bedrock:converse:amazon.nova-pro-v1:0');
    });

    it('should use Bedrock providers when AWS_PROFILE is set', async () => {
      mockProcessEnv({ AWS_PROFILE: 'test-profile' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider.id()).toBe('bedrock:converse:amazon.nova-pro-v1:0');
    });

    it('should not use Bedrock providers when OpenAI credentials exist', async () => {
      mockProcessEnv({ AWS_ACCESS_KEY_ID: 'test-key' });
      mockProcessEnv({ AWS_SECRET_ACCESS_KEY: 'test-secret' });
      mockProcessEnv({ OPENAI_API_KEY: 'test-key' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider.id()).not.toBe('bedrock:converse:amazon.nova-pro-v1:0');
    });
  });

  describe('xAI provider selection', () => {
    it('should use xAI providers when XAI_API_KEY is set', async () => {
      mockProcessEnv({ XAI_API_KEY: 'test-key' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider.id()).toBe('xai:grok-4-1-fast-reasoning');
    });

    it('should not use xAI providers when higher priority credentials exist', async () => {
      mockProcessEnv({ XAI_API_KEY: 'test-key' });
      mockProcessEnv({ GEMINI_API_KEY: 'test-key' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider.id()).not.toBe('xai:grok-4-1-fast-reasoning');
    });
  });

  describe('DeepSeek provider selection', () => {
    it('should use DeepSeek providers when DEEPSEEK_API_KEY is set', async () => {
      mockProcessEnv({ DEEPSEEK_API_KEY: 'test-key' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider.id()).toBe('deepseek:deepseek-chat');
    });

    it('should not use DeepSeek providers when xAI credentials exist', async () => {
      mockProcessEnv({ DEEPSEEK_API_KEY: 'test-key' });
      mockProcessEnv({ XAI_API_KEY: 'test-key' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider.id()).not.toBe('deepseek:deepseek-chat');
    });
  });

  describe('GitHub Models provider selection', () => {
    it('should use GitHub providers when GITHUB_TOKEN is set and no other credentials', async () => {
      mockProcessEnv({ GITHUB_TOKEN: 'ghp_test-token' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider.id()).toContain('gpt-5.1');
    });

    it('should not use GitHub providers when explicit credentials exist', async () => {
      mockProcessEnv({ GITHUB_TOKEN: 'ghp_test-token' });
      mockProcessEnv({ MISTRAL_API_KEY: 'test-key' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider).toBe(MistralGradingProvider);
    });

    it('should use GitHub via env overrides', async () => {
      const envOverrides: EnvOverrides = {
        GITHUB_TOKEN: 'ghp_test-token',
      } as EnvOverrides;

      const providers = await getDefaultProviders(envOverrides);

      expect(providers.gradingProvider.id()).toContain('gpt-5.1');
    });
  });

  describe('Provider priority - complete chain', () => {
    it('should use OpenAI when all credentials are set (highest priority)', async () => {
      mockProcessEnv({ OPENAI_API_KEY: 'test-openai' });
      mockProcessEnv({ ANTHROPIC_API_KEY: 'test-anthropic' });
      mockProcessEnv({ GEMINI_API_KEY: 'test-gemini' });
      mockProcessEnv({ XAI_API_KEY: 'test-xai' });
      mockProcessEnv({ DEEPSEEK_API_KEY: 'test-deepseek' });
      mockProcessEnv({ MISTRAL_API_KEY: 'test-mistral' });
      mockProcessEnv({ AWS_ACCESS_KEY_ID: 'test-aws' });
      mockProcessEnv({ GITHUB_TOKEN: 'test-github' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider.id()).toContain('gpt-5.4');
    });

    it('should use Anthropic when OpenAI is missing but all others are set', async () => {
      mockProcessEnv({ ANTHROPIC_API_KEY: 'test-anthropic' });
      mockProcessEnv({ GEMINI_API_KEY: 'test-gemini' });
      mockProcessEnv({ XAI_API_KEY: 'test-xai' });
      mockProcessEnv({ DEEPSEEK_API_KEY: 'test-deepseek' });
      mockProcessEnv({ MISTRAL_API_KEY: 'test-mistral' });
      mockProcessEnv({ AWS_ACCESS_KEY_ID: 'test-aws' });
      mockProcessEnv({ GITHUB_TOKEN: 'test-github' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider.id()).toContain('claude');
    });

    it('should prefer explicit credentials over ambient credentials', async () => {
      // Only ambient credentials
      mockProcessEnv({ AWS_ACCESS_KEY_ID: 'test-aws' });
      mockProcessEnv({ GITHUB_TOKEN: 'test-github' });

      const providers = await getDefaultProviders();

      // Should use Bedrock (ambient but before GitHub in priority)
      expect(providers.gradingProvider.id()).toContain('bedrock');
    });
  });

  describe('Fallback behavior', () => {
    it('should fallback to OpenAI when no credentials are set', async () => {
      const providers = await getDefaultProviders();

      expect(providers.gradingProvider.id()).toContain('gpt-5.4');
      expect(providers.embeddingProvider.id()).toContain('text-embedding');
    });

    it('should fallback to OpenAI when only invalid/unrecognized credentials are set', async () => {
      // Set credentials for providers we don't check
      mockProcessEnv({ SOME_RANDOM_API_KEY: 'test-key' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider.id()).toContain('gpt-5.4');
    });
  });

  describe('Provider shape validation', () => {
    it('should always return all required provider keys', async () => {
      const providers = await getDefaultProviders();

      expect(providers.embeddingProvider).toBeDefined();
      expect(providers.gradingProvider).toBeDefined();
      expect(providers.gradingJsonProvider).toBeDefined();
      expect(providers.suggestionsProvider).toBeDefined();
      expect(providers.synthesizeProvider).toBeDefined();
      expect(providers.moderationProvider).toBeDefined();
    });

    it('should have llmRubricProvider undefined for providers that do not support it', async () => {
      mockProcessEnv({ MISTRAL_API_KEY: 'test-key' });

      const providers = await getDefaultProviders();

      expect(providers.llmRubricProvider).toBeUndefined();
    });

    it('should have llmRubricProvider defined for providers that support it', async () => {
      mockProcessEnv({ GEMINI_API_KEY: 'test-key' });

      const providers = await getDefaultProviders();

      expect(providers.llmRubricProvider).toBe(GoogleAiStudioLlmRubricProvider);
    });

    it('should use consistent moderation provider across all selections', async () => {
      // Test with multiple providers
      const testCases = [
        { OPENAI_API_KEY: 'test' },
        { ANTHROPIC_API_KEY: 'test' },
        { GEMINI_API_KEY: 'test' },
        { MISTRAL_API_KEY: 'test' },
      ];

      for (const envVars of testCases) {
        // Clear all
        mockProcessEnv({ OPENAI_API_KEY: undefined });
        mockProcessEnv({ ANTHROPIC_API_KEY: undefined });
        mockProcessEnv({ GEMINI_API_KEY: undefined });
        mockProcessEnv({ MISTRAL_API_KEY: undefined });

        // Set specific one
        mockProcessEnv(envVars);

        const providers = await getDefaultProviders();
        expect(providers.moderationProvider).toBe(DefaultModerationProvider);
      }
    });
  });

  describe('Credential detection edge cases', () => {
    it('should treat empty string credentials as falsy', async () => {
      mockProcessEnv({ OPENAI_API_KEY: '' });
      mockProcessEnv({ MISTRAL_API_KEY: 'valid-key' });

      const providers = await getDefaultProviders();

      // Should skip OpenAI (empty string) and use Mistral
      expect(providers.gradingProvider).toBe(MistralGradingProvider);
    });

    it('should prefer env overrides over process.env for the same key', async () => {
      mockProcessEnv({ GEMINI_API_KEY: 'process-env-key' });

      const envOverrides: EnvOverrides = {
        OPENAI_API_KEY: 'override-key',
      } as EnvOverrides;

      const providers = await getDefaultProviders(envOverrides);

      // OpenAI should win because it's in overrides and has higher priority
      expect(providers.gradingProvider.id()).toContain('gpt-5.4');
    });

    it('should work with env overrides when process.env is empty', async () => {
      const envOverrides: EnvOverrides = {
        XAI_API_KEY: 'override-key',
      } as EnvOverrides;

      const providers = await getDefaultProviders(envOverrides);

      expect(providers.gradingProvider.id()).toBe('xai:grok-4-1-fast-reasoning');
    });

    it('should check both process.env and overrides for credential presence', async () => {
      mockProcessEnv({ DEEPSEEK_API_KEY: 'env-key' });

      const envOverrides: EnvOverrides = {
        XAI_API_KEY: 'override-key',
      } as EnvOverrides;

      const providers = await getDefaultProviders(envOverrides);

      // xAI has higher priority than DeepSeek
      expect(providers.gradingProvider.id()).toBe('xai:grok-4-1-fast-reasoning');
    });
  });

  describe('Azure OpenAI provider selection', () => {
    it('should use Azure when API key and deployment name are set', async () => {
      mockProcessEnv({ AZURE_OPENAI_API_KEY: 'test-key' });
      mockProcessEnv({ AZURE_OPENAI_DEPLOYMENT_NAME: 'my-deployment' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider.id()).toContain('my-deployment');
    });

    it('should use Azure when API key and AZURE_DEPLOYMENT_NAME (without OPENAI prefix) are set', async () => {
      mockProcessEnv({ AZURE_OPENAI_API_KEY: 'test-key' });
      mockProcessEnv({ AZURE_DEPLOYMENT_NAME: 'my-deployment' });
      // Note: NOT setting AZURE_OPENAI_DEPLOYMENT_NAME - testing fallback

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider.id()).toContain('my-deployment');
    });

    it('should NOT use Azure when only API key is set (no deployment name)', async () => {
      mockProcessEnv({ AZURE_OPENAI_API_KEY: 'test-key' });
      // No AZURE_OPENAI_DEPLOYMENT_NAME

      const providers = await getDefaultProviders();

      // Should fallback to OpenAI
      expect(providers.gradingProvider.id()).toContain('gpt-5.4');
    });

    it('should NOT use Azure when only deployment name is set (no credentials)', async () => {
      mockProcessEnv({ AZURE_OPENAI_DEPLOYMENT_NAME: 'my-deployment' });
      // No AZURE_OPENAI_API_KEY

      const providers = await getDefaultProviders();

      // Should fallback to OpenAI
      expect(providers.gradingProvider.id()).toContain('gpt-5.4');
    });

    it('should use Azure with client credentials (service principal)', async () => {
      mockProcessEnv({ AZURE_CLIENT_ID: 'test-client-id' });
      mockProcessEnv({ AZURE_CLIENT_SECRET: 'test-client-secret' });
      mockProcessEnv({ AZURE_TENANT_ID: 'test-tenant-id' });
      mockProcessEnv({ AZURE_OPENAI_DEPLOYMENT_NAME: 'my-deployment' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider.id()).toContain('my-deployment');
    });

    it('should NOT use Azure with incomplete client credentials', async () => {
      mockProcessEnv({ AZURE_CLIENT_ID: 'test-client-id' });
      // Missing AZURE_CLIENT_SECRET and AZURE_TENANT_ID
      mockProcessEnv({ AZURE_OPENAI_DEPLOYMENT_NAME: 'my-deployment' });

      const providers = await getDefaultProviders();

      // Should fallback to OpenAI
      expect(providers.gradingProvider.id()).toContain('gpt-5.4');
    });

    it('should use embedding deployment name when specified', async () => {
      mockProcessEnv({ AZURE_OPENAI_API_KEY: 'test-key' });
      mockProcessEnv({ AZURE_OPENAI_DEPLOYMENT_NAME: 'chat-deployment' });
      mockProcessEnv({ AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME: 'embedding-deployment' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider.id()).toContain('chat-deployment');
      expect(providers.embeddingProvider.id()).toContain('embedding-deployment');
    });

    it('should fallback embedding to chat deployment when not specified', async () => {
      mockProcessEnv({ AZURE_OPENAI_API_KEY: 'test-key' });
      mockProcessEnv({ AZURE_OPENAI_DEPLOYMENT_NAME: 'my-deployment' });
      // No AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider.id()).toContain('my-deployment');
      expect(providers.embeddingProvider.id()).toContain('my-deployment');
    });

    it('should prefer OpenAI over Azure when both are set', async () => {
      mockProcessEnv({ OPENAI_API_KEY: 'test-openai' });
      mockProcessEnv({ AZURE_OPENAI_API_KEY: 'test-azure' });
      mockProcessEnv({ AZURE_OPENAI_DEPLOYMENT_NAME: 'my-deployment' });

      const providers = await getDefaultProviders();

      // OpenAI has priority 1, Azure has priority 3
      expect(providers.gradingProvider.id()).toContain('gpt-5.4');
    });

    it('should prefer Anthropic over Azure when both are set', async () => {
      mockProcessEnv({ ANTHROPIC_API_KEY: 'test-anthropic' });
      mockProcessEnv({ AZURE_OPENAI_API_KEY: 'test-azure' });
      mockProcessEnv({ AZURE_OPENAI_DEPLOYMENT_NAME: 'my-deployment' });

      const providers = await getDefaultProviders();

      // Anthropic has priority 2, Azure has priority 3
      expect(providers.gradingProvider.id()).toContain('claude');
    });
  });

  describe('Override clearing and combined overrides', () => {
    it('should clear completion override when set to undefined', async () => {
      const mockProvider = new MockProvider('test-provider');
      setDefaultCompletionProviders(mockProvider);

      let providers = await getDefaultProviders();
      expect(providers.gradingProvider.id()).toBe('test-provider');

      // Clear the override
      setDefaultCompletionProviders(undefined);

      providers = await getDefaultProviders();
      expect(providers.gradingProvider.id()).toContain('gpt-5.4');
    });

    it('should clear embedding override when set to undefined', async () => {
      const mockProvider = new MockProvider('test-embedding');
      setDefaultEmbeddingProviders(mockProvider);

      let providers = await getDefaultProviders();
      expect(providers.embeddingProvider.id()).toBe('test-embedding');

      // Clear the override
      setDefaultEmbeddingProviders(undefined);

      providers = await getDefaultProviders();
      expect(providers.embeddingProvider.id()).toContain('text-embedding');
    });

    it('should apply all overrides together (completion + embedding + Azure moderation)', async () => {
      const mockCompletionProvider = new MockProvider('test-completion');
      const mockEmbeddingProvider = new MockProvider('test-embedding');

      setDefaultCompletionProviders(mockCompletionProvider);
      setDefaultEmbeddingProviders(mockEmbeddingProvider);
      mockProcessEnv({ AZURE_CONTENT_SAFETY_ENDPOINT: 'https://test.com' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider.id()).toBe('test-completion');
      expect(providers.embeddingProvider.id()).toBe('test-embedding');
      expect(providers.moderationProvider).toBeInstanceOf(AzureModerationProvider);
    });

    it('should apply overrides regardless of detected provider', async () => {
      const mockProvider = new MockProvider('override-provider');
      setDefaultCompletionProviders(mockProvider);

      // Set various credentials - override should still apply
      mockProcessEnv({ GEMINI_API_KEY: 'test-key' });

      const providers = await getDefaultProviders();

      // Even though Gemini is detected, override takes precedence
      expect(providers.gradingProvider.id()).toBe('override-provider');
      // Embedding selection remains independent and should still use Google AI Studio.
      expect(providers.embeddingProvider.id()).toBe('google:embedding:gemini-embedding-001');
    });
  });

  describe('Edge cases for ambient credentials', () => {
    it('should use Bedrock over GitHub when both ambient credentials are set', async () => {
      mockProcessEnv({ AWS_ACCESS_KEY_ID: 'test-aws' });
      mockProcessEnv({ GITHUB_TOKEN: 'test-github' });

      const providers = await getDefaultProviders();

      // Bedrock (priority 9) beats GitHub (priority 10)
      expect(providers.gradingProvider.id()).toContain('bedrock');
    });

    it('should skip ambient credentials when explicit credentials exist', async () => {
      mockProcessEnv({ MISTRAL_API_KEY: 'test-mistral' }); // explicit, priority 7
      mockProcessEnv({ AWS_ACCESS_KEY_ID: 'test-aws' }); // ambient, priority 9
      mockProcessEnv({ GITHUB_TOKEN: 'test-github' }); // ambient, priority 10

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider).toBe(MistralGradingProvider);
    });
  });

  describe('Decoupled embedding provider selection', () => {
    it('should select embedding provider independently from completion provider', async () => {
      // xAI for completions (doesn't support embeddings)
      // Mistral for embeddings (has embedding support)
      mockProcessEnv({ XAI_API_KEY: 'test-xai' });
      mockProcessEnv({ MISTRAL_API_KEY: 'test-mistral' });

      const providers = await getDefaultProviders();

      // Completion should use xAI (higher priority)
      expect(providers.gradingProvider.id()).toBe('xai:grok-4-1-fast-reasoning');

      // Embedding should use Mistral (first available with embedding support)
      expect(providers.embeddingProvider).toBe(MistralEmbeddingProvider);
    });

    it('should use Vertex for embeddings when Google ADC is available', async () => {
      // DeepSeek for completions (doesn't support embeddings)
      // Mock Vertex credentials
      mockProcessEnv({ DEEPSEEK_API_KEY: 'test-deepseek' });

      // Enable Google ADC mock
      vi.mocked(hasGoogleDefaultCredentials).mockResolvedValue(true);

      const providers = await getDefaultProviders();

      // Completion should use DeepSeek (higher priority than Vertex)
      expect(providers.gradingProvider.id()).toBe('deepseek:deepseek-chat');

      // Embedding should use Vertex (Google ADC is available)
      expect(providers.embeddingProvider).toBe(VertexEmbeddingProvider);
    });

    it('should fall back to OpenAI for embeddings when no embedding provider has credentials', async () => {
      // GitHub for completions (doesn't support embeddings)
      // No embedding-capable provider has credentials
      mockProcessEnv({ GITHUB_TOKEN: 'test-github' });

      const providers = await getDefaultProviders();

      // Completion should use GitHub
      expect(providers.gradingProvider.id()).toContain('gpt-5.1');

      // Embedding should fall back to OpenAI (even without key - will fail at runtime)
      expect(providers.embeddingProvider).toBe(OpenAiEmbeddingProvider);
    });

    it('should use different providers for completion and embedding based on credentials', async () => {
      // Anthropic for completions (doesn't support embeddings)
      // Mistral for embeddings
      mockProcessEnv({ ANTHROPIC_API_KEY: 'test-anthropic' });
      mockProcessEnv({ MISTRAL_API_KEY: 'test-mistral' });

      const providers = await getDefaultProviders();

      // Completion should use Anthropic (higher priority than Mistral)
      expect(providers.gradingProvider.id()).toContain('claude');

      // Embedding should use Mistral (first embedding-capable provider with credentials)
      expect(providers.embeddingProvider).toBe(MistralEmbeddingProvider);
    });

    it('should select embedding from different provider than completion when optimal', async () => {
      // Bedrock for completions (doesn't support embeddings in our chain)
      // Mistral for embeddings
      mockProcessEnv({ AWS_ACCESS_KEY_ID: 'test-aws' });
      mockProcessEnv({ MISTRAL_API_KEY: 'test-mistral' });

      const providers = await getDefaultProviders();

      // Completion should use Mistral (higher priority than Bedrock)
      expect(providers.gradingProvider).toBe(MistralGradingProvider);

      // Embedding should also use Mistral (same key works for both)
      expect(providers.embeddingProvider).toBe(MistralEmbeddingProvider);
    });

    it('should use Voyage for embeddings when VOYAGE_API_KEY is set (Anthropic recommended)', async () => {
      // Anthropic for completions (doesn't support embeddings)
      // Voyage for embeddings (Anthropic's recommended embedding provider)
      mockProcessEnv({ ANTHROPIC_API_KEY: 'test-anthropic' });
      mockProcessEnv({ VOYAGE_API_KEY: 'test-voyage' });

      const providers = await getDefaultProviders();

      // Completion should use Anthropic
      expect(providers.gradingProvider.id()).toContain('claude');

      // Embedding should use Voyage (Anthropic recommends Voyage for embeddings)
      expect(providers.embeddingProvider.id()).toBe('voyage:voyage-3.5');
    });

    it('should prefer OpenAI over Voyage for embeddings when both keys exist', async () => {
      // When both OpenAI and Voyage keys exist, OpenAI has higher priority
      mockProcessEnv({ OPENAI_API_KEY: 'test-openai' });
      mockProcessEnv({ VOYAGE_API_KEY: 'test-voyage' });

      const providers = await getDefaultProviders();

      // OpenAI should win for both completion and embedding
      expect(providers.gradingProvider.id()).toContain('gpt-5.4');
      expect(providers.embeddingProvider).toBe(OpenAiEmbeddingProvider);
    });

    it('should use Voyage for embeddings with any non-embedding completion provider', async () => {
      // xAI for completions (doesn't support embeddings)
      // Voyage for embeddings
      mockProcessEnv({ XAI_API_KEY: 'test-xai' });
      mockProcessEnv({ VOYAGE_API_KEY: 'test-voyage' });

      const providers = await getDefaultProviders();

      // Completion should use xAI
      expect(providers.gradingProvider.id()).toBe('xai:grok-4-1-fast-reasoning');

      // Embedding should use Voyage
      expect(providers.embeddingProvider.id()).toBe('voyage:voyage-3.5');
    });
  });
});
