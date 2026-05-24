import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AzureModerationProvider } from '../../src/providers/azure/moderation';
import { AwsBedrockConverseProvider } from '../../src/providers/bedrock/converse';
import { DeepSeekProvider } from '../../src/providers/deepseek';
import {
  getDefaultProviders,
  setDefaultCompletionProviders,
  setDefaultEmbeddingProviders,
} from '../../src/providers/defaults';
import {
  AIStudioChatProvider,
  AIStudioEmbeddingProvider,
} from '../../src/providers/google/ai.studio';
import { hasGoogleDefaultCredentials } from '../../src/providers/google/util';
import { VertexEmbeddingProvider } from '../../src/providers/google/vertex';
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
import { VoyageEmbeddingProvider } from '../../src/providers/voyage';
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
    mockProcessEnv({ AWS_SESSION_TOKEN: undefined });
    mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: undefined });
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
    mockProcessEnv({ AZURE_EMBEDDING_DEPLOYMENT_NAME: undefined });
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
    await (providers.moderationProvider as AzureModerationProvider).ensureInitialized();
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
    mockProcessEnv({ AWS_SECRET_ACCESS_KEY: 'test-secret' });
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

      expect(providers.gradingProvider).toBeInstanceOf(AIStudioChatProvider);
      expect(providers.gradingJsonProvider).toBeInstanceOf(AIStudioChatProvider);
      expect(providers.llmRubricProvider).toBeInstanceOf(AIStudioChatProvider);
      expect(providers.suggestionsProvider).toBeInstanceOf(AIStudioChatProvider);
      expect(providers.synthesizeProvider).toBeInstanceOf(AIStudioChatProvider);
      expect(providers.embeddingProvider.id()).toBe('google:embedding:gemini-embedding-001');
      expect(providers.embeddingProvider).toBeInstanceOf(AIStudioEmbeddingProvider);
      expect((providers.embeddingProvider as AIStudioEmbeddingProvider).getApiKey()).toBe(
        'test-key',
      );
    });

    it('should use Google AI Studio providers when GOOGLE_API_KEY is set', async () => {
      mockProcessEnv({ GOOGLE_API_KEY: 'test-key' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider).toBeInstanceOf(AIStudioChatProvider);
      expect(providers.gradingJsonProvider).toBeInstanceOf(AIStudioChatProvider);
      expect(providers.llmRubricProvider).toBeInstanceOf(AIStudioChatProvider);
      expect(providers.suggestionsProvider).toBeInstanceOf(AIStudioChatProvider);
      expect(providers.synthesizeProvider).toBeInstanceOf(AIStudioChatProvider);
      expect(providers.embeddingProvider.id()).toBe('google:embedding:gemini-embedding-001');
      expect(providers.embeddingProvider).toBeInstanceOf(AIStudioEmbeddingProvider);
      expect((providers.embeddingProvider as AIStudioEmbeddingProvider).getApiKey()).toBe(
        'test-key',
      );
    });

    it('should use Google AI Studio providers when PALM_API_KEY is set', async () => {
      mockProcessEnv({ PALM_API_KEY: 'test-key' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider).toBeInstanceOf(AIStudioChatProvider);
      expect(providers.gradingJsonProvider).toBeInstanceOf(AIStudioChatProvider);
      expect(providers.llmRubricProvider).toBeInstanceOf(AIStudioChatProvider);
      expect(providers.suggestionsProvider).toBeInstanceOf(AIStudioChatProvider);
      expect(providers.synthesizeProvider).toBeInstanceOf(AIStudioChatProvider);
      expect(providers.embeddingProvider.id()).toBe('google:embedding:gemini-embedding-001');
    });

    it('should use Google AI Studio providers when provided via env overrides', async () => {
      const envOverrides: EnvOverrides = {
        GEMINI_API_KEY: 'test-key',
      } as EnvOverrides;

      const providers = await getDefaultProviders(envOverrides);

      expect(providers.gradingProvider).toBeInstanceOf(AIStudioChatProvider);
      expect(providers.gradingJsonProvider).toBeInstanceOf(AIStudioChatProvider);
      expect(providers.llmRubricProvider).toBeInstanceOf(AIStudioChatProvider);
      expect(providers.suggestionsProvider).toBeInstanceOf(AIStudioChatProvider);
      expect(providers.synthesizeProvider).toBeInstanceOf(AIStudioChatProvider);
      expect(providers.embeddingProvider.id()).toBe('google:embedding:gemini-embedding-001');
      expect(providers.embeddingProvider).toBeInstanceOf(AIStudioEmbeddingProvider);
      expect((providers.embeddingProvider as AIStudioEmbeddingProvider).getApiKey()).toBe(
        'test-key',
      );
    });

    it('should not use Google AI Studio providers when OpenAI credentials exist', async () => {
      mockProcessEnv({ GEMINI_API_KEY: 'test-key' });
      mockProcessEnv({ OPENAI_API_KEY: 'test-key' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider).not.toBeInstanceOf(AIStudioChatProvider);
      expect(providers.gradingJsonProvider).not.toBeInstanceOf(AIStudioChatProvider);
      expect(providers.suggestionsProvider).not.toBeInstanceOf(AIStudioChatProvider);
      expect(providers.synthesizeProvider).not.toBeInstanceOf(AIStudioChatProvider);
    });

    it('should not use Google AI Studio providers when Anthropic credentials exist', async () => {
      mockProcessEnv({ GEMINI_API_KEY: 'test-key' });
      mockProcessEnv({ ANTHROPIC_API_KEY: 'test-key' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider).not.toBeInstanceOf(AIStudioChatProvider);
      expect(providers.gradingJsonProvider).not.toBeInstanceOf(AIStudioChatProvider);
      expect(providers.suggestionsProvider).not.toBeInstanceOf(AIStudioChatProvider);
      expect(providers.synthesizeProvider).not.toBeInstanceOf(AIStudioChatProvider);
    });

    it('should prefer Google AI Studio over Vertex when both credentials are available', async () => {
      mockProcessEnv({ GEMINI_API_KEY: 'test-key' });
      // hasGoogleDefaultCredentials is mocked to return false, but in practice
      // AI Studio should be preferred over Vertex in the provider selection order

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider).toBeInstanceOf(AIStudioChatProvider);
      expect(providers.gradingJsonProvider).toBeInstanceOf(AIStudioChatProvider);
      expect(providers.suggestionsProvider).toBeInstanceOf(AIStudioChatProvider);
      expect(providers.synthesizeProvider).toBeInstanceOf(AIStudioChatProvider);
    });

    it('should prefer Google AI Studio over Mistral when both credentials are available', async () => {
      mockProcessEnv({ GEMINI_API_KEY: 'test-key' });
      mockProcessEnv({ MISTRAL_API_KEY: 'test-key' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider).toBeInstanceOf(AIStudioChatProvider);
      expect(providers.gradingJsonProvider).toBeInstanceOf(AIStudioChatProvider);
      expect(providers.suggestionsProvider).toBeInstanceOf(AIStudioChatProvider);
      expect(providers.synthesizeProvider).toBeInstanceOf(AIStudioChatProvider);
      expect(providers.gradingProvider).not.toBe(MistralGradingProvider);
      expect(providers.gradingJsonProvider).not.toBe(MistralGradingJsonProvider);
    });
  });

  describe('AWS Bedrock provider selection', () => {
    it('should use Bedrock providers when AWS static credentials are set', async () => {
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

    it('should use Bedrock providers when AWS bearer token authentication is set', async () => {
      mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: 'test-bedrock-bearer' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider.id()).toBe('bedrock:converse:amazon.nova-pro-v1:0');
    });

    it('should prefer Bedrock bearer tokens over ambient credentials', async () => {
      mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: 'test-bedrock-bearer' });
      mockProcessEnv({ GITHUB_TOKEN: 'test-github' });
      vi.mocked(hasCodexDefaultCredentials).mockReturnValue(true);

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider.id()).toBe('bedrock:converse:amazon.nova-pro-v1:0');
    });

    it('should pass temporary AWS credentials supplied through env overrides to Bedrock', async () => {
      const providers = await getDefaultProviders({
        AWS_ACCESS_KEY_ID: 'override-access',
        AWS_SECRET_ACCESS_KEY: 'override-secret',
        AWS_SESSION_TOKEN: 'override-session',
      });

      const credentials = await (
        providers.gradingProvider as AwsBedrockConverseProvider
      ).getCredentials();
      expect(credentials).toEqual({
        accessKeyId: 'override-access',
        secretAccessKey: 'override-secret',
        sessionToken: 'override-session',
      });
    });

    it('should pass AWS bearer tokens supplied through env overrides to Bedrock', async () => {
      const providers = await getDefaultProviders({
        AWS_BEARER_TOKEN_BEDROCK: 'override-bedrock-bearer',
      });

      expect((providers.gradingProvider as AwsBedrockConverseProvider).config.apiKey).toBe(
        'override-bedrock-bearer',
      );
    });

    it('should pass AWS profiles supplied through env overrides to Bedrock', async () => {
      const providers = await getDefaultProviders({
        AWS_PROFILE: 'override-profile',
      });

      expect((providers.gradingProvider as AwsBedrockConverseProvider).config.profile).toBe(
        'override-profile',
      );
    });

    it('should not select Bedrock for an incomplete static AWS credential pair', async () => {
      mockProcessEnv({ AWS_ACCESS_KEY_ID: 'access-key-without-secret' });
      mockProcessEnv({ GITHUB_TOKEN: 'github-token' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider.id()).toBe('openai/gpt-5');
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

      expect(providers.gradingProvider.id()).toBe('xai:grok-4.3');
      expect(providers.webSearchProvider?.id()).toBe('xai:responses:grok-4.3');
    });

    it('should not use xAI providers when higher priority credentials exist', async () => {
      mockProcessEnv({ XAI_API_KEY: 'test-key' });
      mockProcessEnv({ GEMINI_API_KEY: 'test-key' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider.id()).not.toBe('xai:grok-4.3');
    });
  });

  describe('DeepSeek provider selection', () => {
    it('should use DeepSeek providers when DEEPSEEK_API_KEY is set', async () => {
      mockProcessEnv({ DEEPSEEK_API_KEY: 'test-key' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider.id()).toBe('deepseek:deepseek-v4-flash');
    });

    it('should pass DeepSeek credentials supplied through env overrides to the provider', async () => {
      const providers = await getDefaultProviders({ DEEPSEEK_API_KEY: 'override-deepseek' });

      expect((providers.gradingProvider as DeepSeekProvider).getApiKey()).toBe('override-deepseek');
    });

    it('should not use DeepSeek providers when xAI credentials exist', async () => {
      mockProcessEnv({ DEEPSEEK_API_KEY: 'test-key' });
      mockProcessEnv({ XAI_API_KEY: 'test-key' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider.id()).not.toBe('deepseek:deepseek-v4-flash');
    });
  });

  describe('GitHub Models provider selection', () => {
    it('should use GitHub providers when GITHUB_TOKEN is set and no other credentials', async () => {
      mockProcessEnv({ GITHUB_TOKEN: 'ghp_test-token' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider.id()).toContain('gpt-5');
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

      expect(providers.gradingProvider.id()).toContain('gpt-5');
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
      mockProcessEnv({ AWS_SECRET_ACCESS_KEY: 'test-secret' });
      mockProcessEnv({ GITHUB_TOKEN: 'test-github' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider.id()).toContain('gpt-5.5');
    });

    it('should use Anthropic when OpenAI is missing but all others are set', async () => {
      mockProcessEnv({ ANTHROPIC_API_KEY: 'test-anthropic' });
      mockProcessEnv({ GEMINI_API_KEY: 'test-gemini' });
      mockProcessEnv({ XAI_API_KEY: 'test-xai' });
      mockProcessEnv({ DEEPSEEK_API_KEY: 'test-deepseek' });
      mockProcessEnv({ MISTRAL_API_KEY: 'test-mistral' });
      mockProcessEnv({ AWS_ACCESS_KEY_ID: 'test-aws' });
      mockProcessEnv({ AWS_SECRET_ACCESS_KEY: 'test-secret' });
      mockProcessEnv({ GITHUB_TOKEN: 'test-github' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider.id()).toContain('claude');
    });

    it('should prefer explicit credentials over ambient credentials', async () => {
      // Only ambient credentials
      mockProcessEnv({ AWS_ACCESS_KEY_ID: 'test-aws' });
      mockProcessEnv({ AWS_SECRET_ACCESS_KEY: 'test-secret' });
      mockProcessEnv({ GITHUB_TOKEN: 'test-github' });

      const providers = await getDefaultProviders();

      // Should use Bedrock (ambient but before GitHub in priority)
      expect(providers.gradingProvider.id()).toContain('bedrock');
    });
  });

  describe('Fallback behavior', () => {
    it('should fallback to OpenAI when no credentials are set', async () => {
      const providers = await getDefaultProviders();

      expect(providers.gradingProvider.id()).toContain('gpt-5.5');
      expect(providers.embeddingProvider.id()).toContain('text-embedding');
    });

    it('should fallback to OpenAI when only invalid/unrecognized credentials are set', async () => {
      // Set credentials for providers we don't check
      mockProcessEnv({ SOME_RANDOM_API_KEY: 'test-key' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider.id()).toContain('gpt-5.5');
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

      expect(providers.llmRubricProvider).toBeInstanceOf(AIStudioChatProvider);
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
      expect(providers.gradingProvider.id()).toContain('gpt-5.5');
    });

    it('should work with env overrides when process.env is empty', async () => {
      const envOverrides: EnvOverrides = {
        XAI_API_KEY: 'override-key',
      } as EnvOverrides;

      const providers = await getDefaultProviders(envOverrides);

      expect(providers.gradingProvider.id()).toBe('xai:grok-4.3');
    });

    it('should check both process.env and overrides for credential presence', async () => {
      mockProcessEnv({ DEEPSEEK_API_KEY: 'env-key' });

      const envOverrides: EnvOverrides = {
        XAI_API_KEY: 'override-key',
      } as EnvOverrides;

      const providers = await getDefaultProviders(envOverrides);

      // xAI has higher priority than DeepSeek
      expect(providers.gradingProvider.id()).toBe('xai:grok-4.3');
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
      expect(providers.gradingProvider.id()).toContain('gpt-5.5');
    });

    it('should NOT use Azure when only deployment name is set (no credentials)', async () => {
      mockProcessEnv({ AZURE_OPENAI_DEPLOYMENT_NAME: 'my-deployment' });
      // No AZURE_OPENAI_API_KEY

      const providers = await getDefaultProviders();

      // Should fallback to OpenAI
      expect(providers.gradingProvider.id()).toContain('gpt-5.5');
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
      expect(providers.gradingProvider.id()).toContain('gpt-5.5');
    });

    it('should use embedding deployment name when specified', async () => {
      mockProcessEnv({ AZURE_OPENAI_API_KEY: 'test-key' });
      mockProcessEnv({ AZURE_OPENAI_DEPLOYMENT_NAME: 'chat-deployment' });
      mockProcessEnv({ AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME: 'embedding-deployment' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider.id()).toContain('chat-deployment');
      expect(providers.embeddingProvider.id()).toContain('embedding-deployment');
    });

    it('should use Azure embeddings when only an embedding deployment is configured', async () => {
      mockProcessEnv({ ANTHROPIC_API_KEY: 'test-anthropic' });
      mockProcessEnv({ AZURE_OPENAI_API_KEY: 'test-azure' });
      mockProcessEnv({ AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME: 'embedding-deployment' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider.id()).toContain('claude');
      expect(providers.embeddingProvider.id()).toContain('embedding-deployment');
    });

    it('should use legacy Azure embedding deployment env var without a chat deployment', async () => {
      mockProcessEnv({ ANTHROPIC_API_KEY: 'test-anthropic' });
      mockProcessEnv({ AZURE_OPENAI_API_KEY: 'test-azure' });
      mockProcessEnv({ AZURE_EMBEDDING_DEPLOYMENT_NAME: 'legacy-embedding-deployment' });

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider.id()).toContain('claude');
      expect(providers.embeddingProvider.id()).toContain('legacy-embedding-deployment');
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
      expect(providers.gradingProvider.id()).toContain('gpt-5.5');
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
      expect(providers.gradingProvider.id()).toContain('gpt-5.5');
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
      mockProcessEnv({ AWS_SECRET_ACCESS_KEY: 'test-secret' });
      mockProcessEnv({ GITHUB_TOKEN: 'test-github' });

      const providers = await getDefaultProviders();

      // Bedrock static credentials (ambient priority 11) beat GitHub (priority 12)
      expect(providers.gradingProvider.id()).toContain('bedrock');
    });

    it('should skip ambient credentials when explicit credentials exist', async () => {
      mockProcessEnv({ MISTRAL_API_KEY: 'test-mistral' }); // explicit, priority 7
      mockProcessEnv({ AWS_ACCESS_KEY_ID: 'test-aws' }); // ambient, priority 11
      mockProcessEnv({ AWS_SECRET_ACCESS_KEY: 'test-secret' });
      mockProcessEnv({ GITHUB_TOKEN: 'test-github' }); // ambient, priority 12

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider).toBe(MistralGradingProvider);
    });

    it('should prefer Codex over ambient static Bedrock credentials', async () => {
      mockProcessEnv({ AWS_ACCESS_KEY_ID: 'test-aws' });
      mockProcessEnv({ AWS_SECRET_ACCESS_KEY: 'test-secret' });
      vi.mocked(hasCodexDefaultCredentials).mockReturnValue(true);

      const providers = await getDefaultProviders();

      expect(providers.gradingProvider.id()).toBe('openai:codex-sdk');
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
      expect(providers.gradingProvider.id()).toBe('xai:grok-4.3');

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
      expect(providers.gradingProvider.id()).toBe('deepseek:deepseek-v4-flash');

      // Embedding should use Vertex (Google ADC is available)
      expect(providers.embeddingProvider).toBeInstanceOf(VertexEmbeddingProvider);
    });

    it('should fall back to OpenAI for embeddings when no embedding provider has credentials', async () => {
      // GitHub for completions (doesn't support embeddings)
      // No embedding-capable provider has credentials
      mockProcessEnv({ GITHUB_TOKEN: 'test-github' });

      const providers = await getDefaultProviders();

      // Completion should use GitHub
      expect(providers.gradingProvider.id()).toContain('gpt-5');

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
      mockProcessEnv({ AWS_SECRET_ACCESS_KEY: 'test-secret' });
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
      expect(providers.gradingProvider.id()).toContain('gpt-5.5');
      expect(providers.embeddingProvider).toBe(OpenAiEmbeddingProvider);
    });

    it('should use Voyage for embeddings with any non-embedding completion provider', async () => {
      // xAI for completions (doesn't support embeddings)
      // Voyage for embeddings
      mockProcessEnv({ XAI_API_KEY: 'test-xai' });
      mockProcessEnv({ VOYAGE_API_KEY: 'test-voyage' });

      const providers = await getDefaultProviders();

      // Completion should use xAI
      expect(providers.gradingProvider.id()).toBe('xai:grok-4.3');

      // Embedding should use Voyage
      expect(providers.embeddingProvider.id()).toBe('voyage:voyage-3.5');
    });

    it('should pass Voyage credentials supplied through env overrides to the provider', async () => {
      const providers = await getDefaultProviders({
        ANTHROPIC_API_KEY: 'override-anthropic',
        VOYAGE_API_KEY: 'override-voyage',
      });

      expect(providers.embeddingProvider).toBeInstanceOf(VoyageEmbeddingProvider);
      expect((providers.embeddingProvider as VoyageEmbeddingProvider).getApiKey()).toBe(
        'override-voyage',
      );
    });
  });
});
