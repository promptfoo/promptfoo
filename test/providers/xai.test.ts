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

  it('uses region-specific API base URL when region is provided', () => {
    createXAIProvider('xai:grok-2', {
      config: {
        config: {
          region: 'us-west-1',
        },
      },
    });
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        config: expect.objectContaining({
          apiBaseUrl: 'https://us-west-1.api.x.ai/v1',
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

  describe('Grok-3 Models', () => {
    it('identifies reasoning models correctly', () => {
      const miniProvider = createXAIProvider(
        'xai:grok-3-mini-beta',
      ) as OpenAiChatCompletionProvider;
      const fastMiniProvider = createXAIProvider(
        'xai:grok-3-mini-fast-beta',
      ) as OpenAiChatCompletionProvider;
      const standardProvider = createXAIProvider('xai:grok-3-beta') as OpenAiChatCompletionProvider;
      const fastProvider = createXAIProvider(
        'xai:grok-3-fast-beta',
      ) as OpenAiChatCompletionProvider;

      expect(miniProvider['isReasoningModel']()).toBe(true);
      expect(fastMiniProvider['isReasoningModel']()).toBe(true);
      expect(standardProvider['isReasoningModel']()).toBe(false);
      expect(fastProvider['isReasoningModel']()).toBe(false);
    });

    it('supports reasoning effort parameter for mini models', () => {
      createXAIProvider('xai:grok-3-mini-beta', {
        config: {
          config: {
            reasoning_effort: 'high',
          },
        },
      });

      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'grok-3-mini-beta',
        expect.objectContaining({
          config: expect.objectContaining({
            reasoning_effort: 'high',
          }),
        }),
      );
    });

    it('supports temperature for all models', () => {
      const provider = createXAIProvider('xai:grok-3-beta') as OpenAiChatCompletionProvider;
      expect(provider['supportsTemperature']()).toBe(true);
    });
  });
});
