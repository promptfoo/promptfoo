import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AzureModerationProvider } from '../../src/providers/azure/moderation';
import {
  getDefaultProviders,
  setDefaultCompletionProviders,
  setDefaultEmbeddingProviders,
} from '../../src/providers/defaults';
import type { ApiProvider } from '../../src/types';

// Create a mock provider for testing
class MockProvider implements ApiProvider {
  id() {
    return 'mock';
  }

  toString() {
    return 'MockProvider';
  }

  // Implement callApi required by ApiProvider interface
  async callApi() {
    return {};
  }
}

// Save original environment
const originalEnv = process.env;

// Mock dependencies
jest.mock('../../src/logger', () => ({
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Interface for Bedrock exports
interface BedrockExports {
  getBedrockProviders: Function;
  resolveAwsRegion: Function;
  hasAwsCredentials: Function;
}

// Mock hasAwsCredentials
const mockHasAwsCredentials = jest.fn().mockReturnValue(false);
jest.mock('../../src/providers/bedrock/defaults', () => {
  // Cast to the interface we defined
  const actual = jest.requireActual('../../src/providers/bedrock/defaults') as BedrockExports;
  return {
    getBedrockProviders: actual.getBedrockProviders,
    resolveAwsRegion: actual.resolveAwsRegion,
    hasAwsCredentials: mockHasAwsCredentials,
  };
});

// Mock Google credentials check
jest.mock('../../src/providers/google/util', () => ({
  hasGoogleDefaultCredentials: () => Promise.resolve(false),
}));

describe('Provider override tests', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    setDefaultCompletionProviders(undefined as any);
    setDefaultEmbeddingProviders(undefined as any);
    jest.clearAllMocks();
    mockHasAwsCredentials.mockReturnValue(false);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should allow overriding default providers', async () => {
    const mockCompletionProvider = new MockProvider();
    const mockEmbeddingProvider = new MockProvider();

    setDefaultCompletionProviders({
      gradingProvider: mockCompletionProvider,
      suggestionsProvider: mockCompletionProvider,
      synthesizeProvider: mockCompletionProvider,
      moderationProvider: mockCompletionProvider,
      gradingJsonProvider: mockCompletionProvider,
    } as any);

    setDefaultEmbeddingProviders({
      embeddingProvider: mockEmbeddingProvider,
    } as any);

    const providers = await getDefaultProviders();

    expect(providers.gradingProvider).toBe(mockCompletionProvider);
    expect(providers.suggestionsProvider).toBe(mockCompletionProvider);
    expect(providers.synthesizeProvider).toBe(mockCompletionProvider);
    expect(providers.moderationProvider).toBe(mockCompletionProvider);
    expect(providers.gradingJsonProvider).toBe(mockCompletionProvider);
    expect(providers.embeddingProvider).toBe(mockEmbeddingProvider);
  });

  it('should allow overriding individual providers', async () => {
    const mockCompletionProvider = new MockProvider();
    const mockEmbeddingProvider = new MockProvider();

    setDefaultCompletionProviders({
      gradingProvider: mockCompletionProvider,
      moderationProvider: mockCompletionProvider,
    } as any);

    setDefaultEmbeddingProviders({
      embeddingProvider: mockEmbeddingProvider,
    } as any);

    const providers = await getDefaultProviders();

    expect(providers.gradingProvider).toBe(mockCompletionProvider);
    expect(providers.moderationProvider).toBe(mockCompletionProvider);
    expect(providers.embeddingProvider).toBe(mockEmbeddingProvider);
  });

  it('should use specified API version for Azure providers', async () => {
    // Set Azure specific environment variables
    process.env.AZURE_OPENAI_API_KEY = 'test-key';
    process.env.AZURE_OPENAI_ENDPOINT = 'https://test-endpoint.openai.azure.com';
    process.env.AZURE_OPENAI_API_VERSION = '2024-01-01';
    process.env.OPENAI_MODEL_NAME = 'gpt-35-turbo';
    process.env.OPENAI_EMBEDDING_MODEL = 'text-embedding-ada-002';

    const providers = await getDefaultProviders();

    // Use type assertion to access apiVersion
    const moderationProvider = providers.moderationProvider as AzureModerationProvider;
    expect(moderationProvider).toBeInstanceOf(AzureModerationProvider);
    expect(moderationProvider.apiVersion).toBe('2024-01-01');
  });
});

describe('Default provider selection', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    jest.clearAllMocks();
    mockHasAwsCredentials.mockReturnValue(false);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  it('should use OpenAI providers by default when OpenAI credentials are present', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const providers = await getDefaultProviders();

    Object.values(providers).forEach((provider) => {
      expect(provider.id()).not.toContain('bedrock');
    });

    const nonModerationProviders = Object.values(providers).filter(
      (provider) => provider.id() !== 'moderation:openai:omni-moderation-latest',
    );

    nonModerationProviders.forEach((provider) => {
      expect(provider.id()).toContain('openai');
    });
  });

  it('should use OpenAI before Bedrock even if both credentials are present', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    mockHasAwsCredentials.mockReturnValue(true);

    const providers = await getDefaultProviders();

    Object.values(providers).forEach((provider) => {
      expect(provider.id()).not.toContain('bedrock');
    });

    const nonModerationProviders = Object.values(providers).filter(
      (provider) => provider.id() !== 'moderation:openai:omni-moderation-latest',
    );

    nonModerationProviders.forEach((provider) => {
      expect(provider.id()).toContain('openai');
    });
  });
});
