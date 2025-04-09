import { createLambdaLabsProvider } from '../../src/providers/lambdalabs';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { OpenAiCompletionProvider } from '../../src/providers/openai/completion';
import { OpenAiEmbeddingProvider } from '../../src/providers/openai/embedding';

jest.mock('../../src/providers/openai/chat');
jest.mock('../../src/providers/openai/completion');
jest.mock('../../src/providers/openai/embedding');

describe('createLambdaLabsProvider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should create chat provider when path includes chat', () => {
    const provider = createLambdaLabsProvider('lambda:chat:model-name');

    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('model-name', {
      config: {
        apiBaseUrl: 'https://api.lambda.ai/v1',
        apiKeyEnvar: 'LAMBDA_API_KEY',
        passthrough: {},
      },
    });
  });

  it('should create completion provider when path includes completion', () => {
    const provider = createLambdaLabsProvider('lambda:completion:model-name');

    expect(provider).toBeInstanceOf(OpenAiCompletionProvider);
    expect(OpenAiCompletionProvider).toHaveBeenCalledWith('model-name', {
      config: {
        apiBaseUrl: 'https://api.lambda.ai/v1',
        apiKeyEnvar: 'LAMBDA_API_KEY',
        passthrough: {},
      },
    });
  });

  it('should create embedding provider when path includes embedding', () => {
    const provider = createLambdaLabsProvider('lambda:embedding:model-name');

    expect(provider).toBeInstanceOf(OpenAiEmbeddingProvider);
    expect(OpenAiEmbeddingProvider).toHaveBeenCalledWith('model-name', {
      config: {
        apiBaseUrl: 'https://api.lambda.ai/v1',
        apiKeyEnvar: 'LAMBDA_API_KEY',
        passthrough: {},
      },
    });
  });

  it('should create embedding provider when path includes embeddings', () => {
    const provider = createLambdaLabsProvider('lambda:embeddings:model-name');

    expect(provider).toBeInstanceOf(OpenAiEmbeddingProvider);
    expect(OpenAiEmbeddingProvider).toHaveBeenCalledWith('model-name', {
      config: {
        apiBaseUrl: 'https://api.lambda.ai/v1',
        apiKeyEnvar: 'LAMBDA_API_KEY',
        passthrough: {},
      },
    });
  });

  it('should default to chat provider when no type specified', () => {
    const provider = createLambdaLabsProvider('lambda:model-name');

    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('model-name', {
      config: {
        apiBaseUrl: 'https://api.lambda.ai/v1',
        apiKeyEnvar: 'LAMBDA_API_KEY',
        passthrough: {},
      },
    });
  });

  it('should pass through additional config options', () => {
    const provider = createLambdaLabsProvider('lambda:chat:model-name', {
      config: {
        config: {
          temperature: 0.7,
          maxTokens: 100,
        },
      },
    });

    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('model-name', {
      config: {
        apiBaseUrl: 'https://api.lambda.ai/v1',
        apiKeyEnvar: 'LAMBDA_API_KEY',
        passthrough: {
          temperature: 0.7,
          maxTokens: 100,
        },
      },
    });
  });

  it('should pass through provider ID', () => {
    const provider = createLambdaLabsProvider('lambda:chat:model-name', {
      id: 'my-provider',
    });

    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('model-name', {
      id: 'my-provider',
      config: {
        apiBaseUrl: 'https://api.lambda.ai/v1',
        apiKeyEnvar: 'LAMBDA_API_KEY',
        passthrough: {},
      },
    });
  });

  it('should pass through env overrides', () => {
    const provider = createLambdaLabsProvider('lambda:chat:model-name', {
      env: {
        LAMBDA_API_KEY: 'test-key',
      },
    });

    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('model-name', {
      env: {
        LAMBDA_API_KEY: 'test-key',
      },
      config: {
        apiBaseUrl: 'https://api.lambda.ai/v1',
        apiKeyEnvar: 'LAMBDA_API_KEY',
        passthrough: {},
      },
    });
  });
});
