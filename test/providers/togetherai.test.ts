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
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
      'model-name',
      expect.objectContaining({
        config: {
          apiBaseUrl: 'https://api.together.xyz/v1',
          apiKeyEnvar: 'TOGETHER_API_KEY',
        },
        id: 'custom-id',
      }),
    );
  });

  it('should handle model names with colons', () => {
    createTogetherAiProvider('togetherai:chat:org:model:name');
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('org:model:name', expect.any(Object));
  });
});
