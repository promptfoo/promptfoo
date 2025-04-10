import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { createXAIProvider } from '../../src/providers/xai';
import type { ProviderOptions } from '../../src/types/providers';

jest.mock('../../src/providers/openai/chat', () => {
  return {
    OpenAiChatCompletionProvider: jest.fn().mockImplementation((modelName, options) => {
      return {
        modelName,
        config: options?.config,
        id: () => `xai:${modelName}`,
        toString: () => `[xAI Provider ${modelName}]`,
        toJSON: () => ({
          provider: 'xai',
          model: modelName,
          config: options?.config,
        }),
      };
    }),
  };
});

describe('xAI Provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws an error if no model name is provided', () => {
    expect(() => createXAIProvider('xai:')).toThrow('Model name is required');
  });

  it('creates an xAI provider with specified model', () => {
    const provider = createXAIProvider('xai:grok-2');
    expect(provider).toBeDefined();
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
        }),
        id: 'custom-id',
      }),
    );
  });

  describe('Grok-3 Models', () => {
    const _provider = createXAIProvider('xai:grok-3-mini-beta');
    const _provider2 = createXAIProvider('xai:grok-3-mini-fast-beta');
    const _provider3 = createXAIProvider('xai:grok-3-beta');
    const _provider4 = createXAIProvider('xai:grok-3-fast-beta');

    it('supports reasoning effort parameter for mini models', () => {
      const provider = createXAIProvider('xai:grok-3-mini-beta', {
        config: {
          config: {
            reasoning_effort: 'high',
          },
        },
      });

      expect(provider.config).toEqual(
        expect.objectContaining({
          config: expect.objectContaining({
            reasoning_effort: 'high',
          }),
        }),
      );
    });
  });

  describe('XAIProvider class', () => {
    it('returns correct id', () => {
      const provider = createXAIProvider('xai:test-model');
      expect(provider.id()).toBe('xai:test-model');
    });

    it('returns correct string representation', () => {
      const provider = createXAIProvider('xai:test-model');
      expect(provider.toString()).toBe('[xAI Provider test-model]');
    });

    it('returns correct JSON representation', () => {
      const provider = createXAIProvider('xai:test-model', {
        config: {
          config: {
            temperature: 0.7,
          },
        },
      });

      // @ts-ignore
      expect(provider.toJSON()).toEqual({
        provider: 'xai',
        model: 'test-model',
        config: {
          apiBaseUrl: 'https://api.x.ai/v1',
          apiKeyEnvar: 'XAI_API_KEY',
          config: {
            temperature: 0.7,
          },
        },
      });
    });
  });
});
