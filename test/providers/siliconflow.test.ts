import { createSiliconFlowProvider } from '../../src/providers/siliconflow';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';

jest.mock('../../src/providers/openai/chat');

describe('createSiliconFlowProvider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should create chat provider when path includes chat', () => {
    const provider = createSiliconFlowProvider('siliconflow:chat:Qwen/Qwen2.5-72B-Instruct');

    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('Qwen/Qwen2.5-72B-Instruct', {
      config: {
        apiBaseUrl: 'https://api.siliconflow.cn/v1',
        apiKeyEnvar: 'SILICONFLOW_API_KEY',
        passthrough: {},
      },
    });
  });

  it('should default to chat provider when no type specified', () => {
    const provider = createSiliconFlowProvider('siliconflow:Qwen/Qwen2.5-72B-Instruct');

    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('Qwen/Qwen2.5-72B-Instruct', {
      config: {
        apiBaseUrl: 'https://api.siliconflow.cn/v1',
        apiKeyEnvar: 'SILICONFLOW_API_KEY',
        passthrough: {},
      },
    });
  });

  it('should create chat provider with Qwen3 model', () => {
    const provider = createSiliconFlowProvider('siliconflow:Qwen/Qwen3-32B');

    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('Qwen/Qwen3-32B', {
      config: {
        apiBaseUrl: 'https://api.siliconflow.cn/v1',
        apiKeyEnvar: 'SILICONFLOW_API_KEY',
        passthrough: {},
      },
    });
  });

  it('should create chat provider with GLM model', () => {
    const provider = createSiliconFlowProvider('siliconflow:THUDM/GLM-4-32B-0414');

    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('THUDM/GLM-4-32B-0414', {
      config: {
        apiBaseUrl: 'https://api.siliconflow.cn/v1',
        apiKeyEnvar: 'SILICONFLOW_API_KEY',
        passthrough: {},
      },
    });
  });

  it('should pass through additional config options', () => {
    const provider = createSiliconFlowProvider('siliconflow:chat:Qwen/Qwen2.5-72B-Instruct', {
      config: {
        config: {
          temperature: 0.7,
          max_tokens: 2000,
          top_p: 0.9,
          frequency_penalty: 0.5,
        },
      },
    });

    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('Qwen/Qwen2.5-72B-Instruct', {
      config: {
        apiBaseUrl: 'https://api.siliconflow.cn/v1',
        apiKeyEnvar: 'SILICONFLOW_API_KEY',
        passthrough: {
          temperature: 0.7,
          max_tokens: 2000,
          top_p: 0.9,
          frequency_penalty: 0.5,
        },
      },
    });
  });

  it('should pass through provider ID', () => {
    const provider = createSiliconFlowProvider('siliconflow:chat:Qwen/Qwen2.5-72B-Instruct', {
      id: 'siliconflow-qwen',
    });

    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('Qwen/Qwen2.5-72B-Instruct', {
      id: 'siliconflow-qwen',
      config: {
        apiBaseUrl: 'https://api.siliconflow.cn/v1',
        apiKeyEnvar: 'SILICONFLOW_API_KEY',
        passthrough: {},
      },
    });
  });

  it('should pass through env overrides', () => {
    const provider = createSiliconFlowProvider('siliconflow:chat:Qwen/Qwen2.5-72B-Instruct', {
      env: {
        SILICONFLOW_API_KEY: 'test-key',
      },
    });

    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('Qwen/Qwen2.5-72B-Instruct', {
      env: {
        SILICONFLOW_API_KEY: 'test-key',
      },
      config: {
        apiBaseUrl: 'https://api.siliconflow.cn/v1',
        apiKeyEnvar: 'SILICONFLOW_API_KEY',
        passthrough: {},
      },
    });
  });
}); 