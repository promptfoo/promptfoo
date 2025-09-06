import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { resetDefaultProviders, setDefaultRedteamProviders } from '../../../src/providers/defaults';
import { redteamProviderManager } from '../../../src/redteam/providers/shared';

import type { ApiProvider } from '../../../src/types';

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
    // Clear any existing providers
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
    jest.resetAllMocks();
  });

  it('should use default redteam provider when no explicit provider is configured', async () => {
    // Set up an environment where defaults system will be used
    const provider = await redteamProviderManager.getProvider({});

    expect(provider).toBeDefined();
    expect(provider.id()).toBeDefined();
  });

  it('should use Anthropic default redteam provider when ANTHROPIC_API_KEY is set', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const provider = await redteamProviderManager.getProvider({});

    expect(provider).toBeDefined();
    expect(provider.id()).toContain('claude');
  });

  it('should override default redteam provider when setDefaultRedteamProviders is called', async () => {
    const customProvider = new MockRedteamProvider('custom-redteam-provider');
    await setDefaultRedteamProviders(customProvider);

    const provider = await redteamProviderManager.getProvider({});

    expect(provider.id()).toBe('custom-redteam-provider');
  });

  it('should prefer explicit provider over defaults system', async () => {
    // Set up defaults
    process.env.ANTHROPIC_API_KEY = 'test-key';

    // Request explicit provider
    const provider = await redteamProviderManager.getProvider({
      provider: 'openai:chat:gpt-3.5-turbo',
    });

    expect(provider).toBeDefined();
    expect(provider.id()).toContain('openai');
  });

  it('should handle jsonOnly configuration with defaults provider', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const provider = await redteamProviderManager.getProvider({
      jsonOnly: true,
    });

    expect(provider).toBeDefined();
    expect(provider.id()).toContain('claude');
  });

  it('should handle preferSmallModel configuration with defaults provider', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const provider = await redteamProviderManager.getProvider({
      preferSmallModel: true,
    });

    expect(provider).toBeDefined();
    expect(provider.id()).toContain('claude');
  });
});
