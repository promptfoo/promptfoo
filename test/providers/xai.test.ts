import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { createXAIProvider } from '../../src/providers/xai';
import type { ProviderOptions } from '../../src/types/providers';

jest.mock('../../src/providers/openai');

describe('xAI Provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws an error if no model name is provided', () => {
    expect(() => createXAIProvider('xai:')).toThrow('Model name is required');
  });

  it('creates an xAI provider with specified model', () => {
    const provider = createXAIProvider('xai:grok-2');
    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('grok-2', expect.any(Object));
  });

  it('sets the correct API base URL and API key environment variable', () => {
    createXAIProvider('xai:grok-2');
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        config: expect.objectContaining({
          apiBaseUrl: 'https://api.x.ai/v1',
          apiKeyEnvar: 'XAI_API_KEY',
        }),
      }),
    );
  });

  it('merges provided options with xAI-specific config', () => {
    const options: ProviderOptions = {
      config: {
        temperature: 0.7,
        max_tokens: 100,
      },
      id: 'custom-id',
    };
    createXAIProvider('xai:grok-2', options);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
      'grok-2',
      expect.objectContaining({
        config: expect.objectContaining({
          apiBaseUrl: 'https://api.x.ai/v1',
          apiKeyEnvar: 'XAI_API_KEY',
          temperature: 0.7,
          max_tokens: 100,
        }),
        id: 'custom-id',
      }),
    );
  });
});
