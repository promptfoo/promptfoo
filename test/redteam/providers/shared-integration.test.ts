import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDefaultProviders, setDefaultRedteamProviders } from '../../../src/providers/defaults';
import { redteamProviderManager } from '../../../src/redteam/providers/shared';

import type { ApiProvider } from '../../../src/types';

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

describe('Redteam Provider Manager Integration with Defaults', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Clear provider manager cache
    redteamProviderManager.clearProvider();
    resetDefaultProviders();

    // Clear API keys to test defaults system
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.MISTRAL_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.PALM_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
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
    const { getDefaultProviders } = await import('../../../src/providers/defaults');
    vi.mocked(getDefaultProviders).mockResolvedValue({
      redteamProvider: mockProvider,
    });

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
    const { getDefaultProviders } = await import('../../../src/providers/defaults');
    vi.mocked(getDefaultProviders).mockResolvedValue({
      redteamProvider: customProvider,
    });

    // Clear cache to force re-fetch
    redteamProviderManager.clearProvider();

    const provider = await redteamProviderManager.getProvider({});

    expect(provider.id()).toBe('custom-redteam-provider');
  });

  it('should prefer explicit provider over defaults system', async () => {
    // Set up defaults
    const mockDefaultProvider = new MockRedteamProvider('mock-default-provider');
    const { getDefaultProviders } = await import('../../../src/providers/defaults');
    vi.mocked(getDefaultProviders).mockResolvedValue({
      redteamProvider: mockDefaultProvider,
    });

    // Clear cache to force re-fetch
    redteamProviderManager.clearProvider();

    // Request explicit provider
    const provider = await redteamProviderManager.getProvider({
      provider: 'openai:chat:gpt-3.5-turbo',
    });

    expect(provider).toBeDefined();
    expect(provider.id()).toContain('openai');
  });

  it('should handle jsonOnly configuration with defaults provider', async () => {
    const mockProvider = new MockRedteamProvider('mock-json-provider');
    const { getDefaultProviders } = await import('../../../src/providers/defaults');
    vi.mocked(getDefaultProviders).mockResolvedValue({
      redteamProvider: mockProvider,
    });

    // Clear cache to force re-fetch
    redteamProviderManager.clearProvider();

    const provider = await redteamProviderManager.getProvider({
      jsonOnly: true,
    });

    expect(provider).toBeDefined();
    expect(provider.id()).toBe('mock-json-provider');
  });

  it('should handle preferSmallModel configuration with defaults provider', async () => {
    const mockProvider = new MockRedteamProvider('mock-small-provider');
    const { getDefaultProviders } = await import('../../../src/providers/defaults');
    vi.mocked(getDefaultProviders).mockResolvedValue({
      redteamProvider: mockProvider,
    });

    // Clear cache to force re-fetch
    redteamProviderManager.clearProvider();

    const provider = await redteamProviderManager.getProvider({
      preferSmallModel: true,
    });

    expect(provider).toBeDefined();
    expect(provider.id()).toBe('mock-small-provider');
  });
});
