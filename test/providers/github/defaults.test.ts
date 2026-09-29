import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import {
  DefaultGitHubGradingJsonProvider,
  DefaultGitHubGradingProvider,
  DefaultGitHubSuggestionsProvider,
} from '../../../src/providers/github/defaults';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';

vi.mock('../../../src/cache', () => ({ fetchWithCache: vi.fn() }));

afterEach(() => vi.resetAllMocks());

describe('retained GitHub Models default exports', () => {
  it.each([
    ['grading', DefaultGitHubGradingProvider],
    ['JSON grading', DefaultGitHubGradingJsonProvider],
    ['suggestions', DefaultGitHubSuggestionsProvider],
  ] as const)('%s returns a retirement diagnostic without inference', async (_role, provider) => {
    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(provider.id()).toBe('openai/gpt-5');
    expect(provider.config.apiBaseUrl).toBe('https://models.github.ai/inference');
    expect(await provider.callApi('Hello')).toEqual({
      error: expect.stringContaining('GitHub Models was retired on July 30, 2026'),
    });
    expect(fetchWithCache).not.toHaveBeenCalled();
  });
});
