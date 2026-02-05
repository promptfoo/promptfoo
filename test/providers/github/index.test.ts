import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGitHubProvider } from '../../../src/providers/github/index';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';

const mockOpenAiChatCompletionProvider = vi.hoisted(() =>
  vi.fn(function (this: unknown) {
    return {};
  }),
);

vi.mock('../../../src/providers/openai/chat', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    OpenAiChatCompletionProvider: mockOpenAiChatCompletionProvider,
  };
});

describe('createGitHubProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpenAiChatCompletionProvider.mockReset();
  });

  it('should create provider with default model when no model specified', () => {
    const mockProvider = { id: vi.fn().mockReturnValue('github:openai/gpt-5') };
    mockOpenAiChatCompletionProvider.mockImplementation(function () {
      return mockProvider as any;
    });

    const result = createGitHubProvider('github:', {}, {} as any);

    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('openai/gpt-5', {
      config: {
        apiBaseUrl: 'https://models.github.ai/inference',
        apiKeyEnvar: 'GITHUB_TOKEN',
      },
    });
    expect(result).toBe(mockProvider);
  });

  it('should create provider with specified model', () => {
    const mockProvider = { id: vi.fn().mockReturnValue('github:openai/gpt-4.1-mini') };
    mockOpenAiChatCompletionProvider.mockImplementation(function () {
      return mockProvider as any;
    });

    const result = createGitHubProvider('github:openai/gpt-4.1-mini', {}, {} as any);

    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('openai/gpt-4.1-mini', {
      config: {
        apiBaseUrl: 'https://models.github.ai/inference',
        apiKeyEnvar: 'GITHUB_TOKEN',
      },
    });
    expect(result).toBe(mockProvider);
  });

  it('should handle models with colons in their names', () => {
    const mockProvider = { id: vi.fn().mockReturnValue('github:anthropic/claude-3.5:sonnet') };
    mockOpenAiChatCompletionProvider.mockImplementation(function () {
      return mockProvider as any;
    });

    const result = createGitHubProvider('github:anthropic/claude-3.5:sonnet', {}, {} as any);

    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('anthropic/claude-3.5:sonnet', {
      config: {
        apiBaseUrl: 'https://models.github.ai/inference',
        apiKeyEnvar: 'GITHUB_TOKEN',
      },
    });
    expect(result).toBe(mockProvider);
  });

  it('should merge existing config with GitHub-specific config', () => {
    const mockProvider = { id: vi.fn().mockReturnValue('github:openai/gpt-4.1') };
    mockOpenAiChatCompletionProvider.mockImplementation(function () {
      return mockProvider as any;
    });

    const existingConfig = {
      temperature: 0.7,
      max_tokens: 2048,
      apiKey: 'custom-key',
    };

    const result = createGitHubProvider(
      'github:openai/gpt-4.1',
      { config: existingConfig },
      {} as any,
    );

    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('openai/gpt-4.1', {
      config: {
        temperature: 0.7,
        max_tokens: 2048,
        apiKey: 'custom-key',
        apiBaseUrl: 'https://models.github.ai/inference',
        apiKeyEnvar: 'GITHUB_TOKEN',
      },
    });
    expect(result).toBe(mockProvider);
  });

  it('should pass through all provider options', () => {
    const mockProvider = { id: vi.fn().mockReturnValue('github:openai/gpt-4.1') };
    mockOpenAiChatCompletionProvider.mockImplementation(function () {
      return mockProvider as any;
    });

    const providerOptions = {
      id: 'custom-id',
      label: 'Custom Label',
      config: { temperature: 0.5 },
      transform: 'output.trim()',
      delay: 1000,
    };

    const result = createGitHubProvider('github:openai/gpt-4.1', providerOptions, {} as any);

    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('openai/gpt-4.1', {
      id: 'custom-id',
      label: 'Custom Label',
      transform: 'output.trim()',
      delay: 1000,
      config: {
        temperature: 0.5,
        apiBaseUrl: 'https://models.github.ai/inference',
        apiKeyEnvar: 'GITHUB_TOKEN',
      },
    });
    expect(result).toBe(mockProvider);
  });
});
