import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getEnvString } from '../../../src/envars';
import { getDefaultProviders } from '../../../src/providers/defaults';

vi.mock('../../../src/envars');
vi.mock('../../../src/logger', () => ({
  __esModule: true,
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('../../../src/providers/google/util', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    hasGoogleDefaultCredentials: vi.fn().mockResolvedValue(false),
  };
});

const mockedGetEnvString = vi.mocked(getEnvString);

describe('GitHub Models Default Providers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should use GitHub token for github: model when only GITHUB_TOKEN is available', async () => {
    // Mock environment where only GITHUB_TOKEN is set
    mockedGetEnvString.mockImplementation(function (key: string, defaultValue = '') {
      if (key === 'GITHUB_TOKEN') {
        return 'test-github-token';
      }
      return defaultValue;
    });

    const providers = await getDefaultProviders();

    // Should use GitHub Models for grading and suggestions
    expect(providers.gradingProvider.id()).toBe('openai/gpt-5');
    expect(providers.gradingJsonProvider.id()).toBe('openai/gpt-5');
    expect(providers.suggestionsProvider.id()).toBe('openai/gpt-5');

    // Should fall back to OpenAI for embeddings and moderation (not supported by GitHub)
    expect(providers.embeddingProvider.id()).toBe('openai:text-embedding-3-large');
    expect(providers.moderationProvider.id()).toBe('openai:omni-moderation-latest');
  });

  it('should prefer OpenAI over GitHub when both tokens are available', async () => {
    mockedGetEnvString.mockImplementation(function (key: string, defaultValue = '') {
      if (key === 'OPENAI_API_KEY') {
        return 'test-openai-key';
      }
      if (key === 'GITHUB_TOKEN') {
        return 'test-github-token';
      }
      return defaultValue;
    });

    const providers = await getDefaultProviders();

    // Should use OpenAI, not GitHub
    expect(providers.gradingProvider.id()).toBe('openai:gpt-5-2025-08-07');
  });

  it('should prefer Anthropic over GitHub when Anthropic is available', async () => {
    mockedGetEnvString.mockImplementation(function (key: string, defaultValue = '') {
      if (key === 'ANTHROPIC_API_KEY') {
        return 'test-anthropic-key';
      }
      if (key === 'GITHUB_TOKEN') {
        return 'test-github-token';
      }
      return defaultValue;
    });

    const providers = await getDefaultProviders();

    // Should use Anthropic
    expect(providers.gradingProvider.id()).toContain('claude');
  });

  it('should use GitHub with env overrides', async () => {
    mockedGetEnvString.mockImplementation(function (_key: string, defaultValue = '') {
      return defaultValue;
    });

    const providers = await getDefaultProviders({
      GITHUB_TOKEN: 'override-github-token',
    });

    // Should use GitHub Models
    expect(providers.gradingProvider.id()).toBe('openai/gpt-5');
    expect(providers.suggestionsProvider.id()).toBe('openai/gpt-5');
  });
});
