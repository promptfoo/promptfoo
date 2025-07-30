import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { OpenAiCompletionProvider } from '../../src/providers/openai/completion';
import { OpenAiEmbeddingProvider } from '../../src/providers/openai/embedding';
import { createTogetherAiProvider } from '../../src/providers/togetherai';

import type { ProviderOptions } from '../../src/types';
import type { EnvOverrides } from '../../src/types/env';

jest.mock('../../src/providers/openai');

describe('createTogetherAiProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a chat completion provider when type is chat', () => {
    const provider = createTogetherAiProvider('togetherai:chat:model-name');
    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('model-name', expect.any(Object));
  });

  it('should create a completion provider when type is completion', () => {
    const provider = createTogetherAiProvider('togetherai:completion:model-name');
    expect(provider).toBeInstanceOf(OpenAiCompletionProvider);
    expect(OpenAiCompletionProvider).toHaveBeenCalledWith('model-name', expect.any(Object));
  });

  it('should create an embedding provider when type is embedding', () => {
    const provider = createTogetherAiProvider('togetherai:embedding:model-name');
    expect(provider).toBeInstanceOf(OpenAiEmbeddingProvider);
    expect(OpenAiEmbeddingProvider).toHaveBeenCalledWith('model-name', expect.any(Object));
  });

  it('should create an embedding provider when type is embeddings', () => {
    const provider = createTogetherAiProvider('togetherai:embeddings:model-name');
    expect(provider).toBeInstanceOf(OpenAiEmbeddingProvider);
    expect(OpenAiEmbeddingProvider).toHaveBeenCalledWith('model-name', expect.any(Object));
  });

  it('should default to chat completion provider when no type is specified', () => {
    const provider = createTogetherAiProvider('togetherai:model-name');
    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('model-name', expect.any(Object));
  });

  it('should pass correct configuration to the provider', () => {
    const options: {
      config?: ProviderOptions;
      id?: string;
      env?: EnvOverrides;
    } = {
      id: 'custom-id',
    };
    createTogetherAiProvider('togetherai:chat:model-name', options);

    // Verify that the OpenAI provider was called with the correct parameters
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('model-name', {
      config: {
        apiBaseUrl: 'https://api.together.xyz/v1',
        apiKeyEnvar: 'TOGETHER_API_KEY',
        passthrough: {},
      },
      id: 'custom-id',
    });
  });

  it('should handle model names with colons', () => {
    createTogetherAiProvider('togetherai:chat:org:model:name');
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('org:model:name', expect.any(Object));
  });

  describe('parameter handling', () => {
    it('should add all parameters to passthrough', () => {
      const options = {
        config: {
          config: {
            max_tokens: 4096,
            temperature: 0.7,
            top_p: 0.9,
            repetition_penalty: 1.1,
            custom_param: 'value',
          },
        },
      };

      createTogetherAiProvider('togetherai:chat:model-name', options);

      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'model-name',
        expect.objectContaining({
          config: expect.objectContaining({
            apiBaseUrl: 'https://api.together.xyz/v1',
            apiKeyEnvar: 'TOGETHER_API_KEY',
            passthrough: expect.objectContaining({
              max_tokens: 4096,
              temperature: 0.7,
              top_p: 0.9,
              repetition_penalty: 1.1,
              custom_param: 'value',
            }),
          }),
        }),
      );
    });

    it('should handle TogetherAI-specific parameters correctly', () => {
      const options = {
        config: {
          config: {
            stop_sequences: ['END'],
            top_k: 50,
            safety_model: 'safety-model',
          },
        },
      };

      createTogetherAiProvider('togetherai:chat:model-name', options);

      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'model-name',
        expect.objectContaining({
          config: expect.objectContaining({
            passthrough: expect.objectContaining({
              stop_sequences: ['END'],
              top_k: 50,
              safety_model: 'safety-model',
            }),
          }),
        }),
      );
    });

    it('should handle passthrough correctly', () => {
      const options = {
        config: {
          config: {
            temperature: 0.7,
            passthrough: {
              custom_param: 'value',
            },
          },
        },
      };

      createTogetherAiProvider('togetherai:chat:model-name', options);

      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'model-name',
        expect.objectContaining({
          config: expect.objectContaining({
            passthrough: expect.objectContaining({
              temperature: 0.7,
              passthrough: {
                custom_param: 'value',
              },
            }),
          }),
        }),
      );
    });
  });
});
