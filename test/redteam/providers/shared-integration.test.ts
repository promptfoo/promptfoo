import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getDefaultProviders,
  resetDefaultProviders,
  setDefaultRedteamProviders,
} from '../../../src/providers/defaults';
import { redteamProviderManager } from '../../../src/redteam/providers/shared';
import { mockProcessEnv } from '../../util/utils';

import type { ApiProvider, DefaultProviders } from '../../../src/types';

// Mock the defaults module to control its behavior in tests
vi.mock('../../../src/providers/defaults', async (importOriginal) => {
  const original = (await importOriginal()) as typeof import('../../../src/providers/defaults');
  return {
    ...original,
    getDefaultProviders: vi.fn().mockResolvedValue({}),
  };
});

// Mock the provider
class MockRedteamProvider implements ApiProvider {
  private providerId: string;

  constructor(id: string) {
    this.providerId = id;
  }

  id(): string {
    return this.providerId;
  }

  async callApi() {
    return { output: 'test response' };
  }
}

function createDefaultProviders(redteamProvider?: ApiProvider): DefaultProviders {
  const requiredProvider = new MockRedteamProvider('mock-required-provider');
  return {
    embeddingProvider: requiredProvider,
    gradingJsonProvider: requiredProvider,
    gradingProvider: requiredProvider,
    moderationProvider: requiredProvider,
    suggestionsProvider: requiredProvider,
    synthesizeProvider: requiredProvider,
    redteamProvider,
  };
}

describe('Redteam Provider Manager Integration with Defaults', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockProcessEnv({ ...originalEnv }, { clear: true });
    vi.mocked(getDefaultProviders).mockResolvedValue(createDefaultProviders());
    // Clear provider manager cache
    redteamProviderManager.clearProvider();
    resetDefaultProviders();

    // Clear API keys to test defaults system
    mockProcessEnv({
      OPENAI_API_KEY: undefined,
      ANTHROPIC_API_KEY: undefined,
      MISTRAL_API_KEY: undefined,
      GEMINI_API_KEY: undefined,
      GOOGLE_API_KEY: undefined,
      PALM_API_KEY: undefined,
    });
  });

  afterEach(() => {
    mockProcessEnv(originalEnv, { clear: true });
    redteamProviderManager.clearProvider();
    resetDefaultProviders();
    vi.resetAllMocks();
  });

  it('should use default redteam provider when no explicit provider is configured', async () => {
    // Set up an environment where defaults system will be used
    const provider = await redteamProviderManager.getProvider({});

    expect(provider).toBeDefined();
    expect(provider.id()).toBeDefined();
  });

  it('should use provider from defaults when getDefaultProviders returns one', async () => {
    const mockProvider = new MockRedteamProvider('mock-default-provider');

    // Mock getDefaultProviders to return our mock provider
    vi.mocked(getDefaultProviders).mockResolvedValue(createDefaultProviders(mockProvider));

    // Clear cache to force re-fetch
    redteamProviderManager.clearProvider();

    const provider = await redteamProviderManager.getProvider({});

    expect(provider).toBeDefined();
    expect(provider.id()).toBe('mock-default-provider');
  });

  it('should override default redteam provider when setDefaultRedteamProviders is called', async () => {
    const customProvider = new MockRedteamProvider('custom-redteam-provider');
    await setDefaultRedteamProviders(customProvider);

    // Mock getDefaultProviders to return our custom provider
    vi.mocked(getDefaultProviders).mockResolvedValue(createDefaultProviders(customProvider));

    // Clear cache to force re-fetch
    redteamProviderManager.clearProvider();

    const provider = await redteamProviderManager.getProvider({});

    expect(provider.id()).toBe('custom-redteam-provider');
  });

  it('should prefer explicit provider over defaults system', async () => {
    // Set up defaults
    const mockDefaultProvider = new MockRedteamProvider('mock-default-provider');
    vi.mocked(getDefaultProviders).mockResolvedValue(createDefaultProviders(mockDefaultProvider));

    // Clear cache to force re-fetch
    redteamProviderManager.clearProvider();

    // Request explicit provider
    const provider = await redteamProviderManager.getProvider({
      provider: 'openai:chat:gpt-3.5-turbo',
    });

    expect(provider).toBeDefined();
    expect(provider.id()).toContain('openai');
  });

  it('should bypass defaults and use OpenAI when jsonOnly is requested', async () => {
    // When jsonOnly is requested, we bypass the defaults system to ensure
    // the JSON response_format is properly applied (defaults providers don't
    // have JSON mode enabled by default)
    const mockProvider = new MockRedteamProvider('mock-json-provider');
    vi.mocked(getDefaultProviders).mockResolvedValue(createDefaultProviders(mockProvider));

    // Clear cache to force re-fetch
    redteamProviderManager.clearProvider();

    const provider = await redteamProviderManager.getProvider({
      jsonOnly: true,
    });

    expect(provider).toBeDefined();
    // Should use OpenAI with JSON mode, not the defaults provider
    expect(provider.id()).toContain('openai');
  });

  it('should bypass defaults and use OpenAI when preferSmallModel is requested', async () => {
    // When preferSmallModel is requested, we bypass the defaults system to ensure
    // the small model variant is used (defaults providers use a single model)
    const mockProvider = new MockRedteamProvider('mock-small-provider');
    vi.mocked(getDefaultProviders).mockResolvedValue(createDefaultProviders(mockProvider));

    // Clear cache to force re-fetch
    redteamProviderManager.clearProvider();

    const provider = await redteamProviderManager.getProvider({
      preferSmallModel: true,
    });

    expect(provider).toBeDefined();
    // Should use OpenAI small model, not the defaults provider
    expect(provider.id()).toContain('openai');
    expect(provider.id()).toContain('mini');
  });
});
