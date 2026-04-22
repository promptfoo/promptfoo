import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { createNscaleProvider } from '../../src/providers/nscale';
import { NscaleImageProvider } from '../../src/providers/nscale/image';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { OpenAiCompletionProvider } from '../../src/providers/openai/completion';
import { OpenAiEmbeddingProvider } from '../../src/providers/openai/embedding';

import type { EnvOverrides } from '../../src/types/env';
import type { ProviderOptions } from '../../src/types/index';

vi.mock('../../src/providers/openai');
vi.mock('../../src/envars', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    getEnvString: vi.fn(),
    getEnvBool: vi.fn((_key: string, defaultValue: boolean) => defaultValue),
    getEnvInt: vi.fn((_key: string, defaultValue: number) => defaultValue),
    getEnvFloat: vi.fn((_key: string, defaultValue: number) => defaultValue),
    getEvalTimeoutMs: vi.fn((defaultValue: number) => defaultValue),
    getMaxEvalTimeMs: vi.fn((defaultValue: number) => defaultValue),
    isCI: vi.fn(() => false),
  };
});

import { getEnvString } from '../../src/envars';

describe('createNscaleProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getEnvString as Mock).mockReturnValue(undefined);
  });

  it('should create a chat completion provider when type is chat', () => {
    const provider = createNscaleProvider('nscale:chat:openai/gpt-oss-120b');
    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
      'openai/gpt-oss-120b',
      expect.any(Object),
    );
  });

  it('should create a completion provider when type is completion', () => {
    const provider = createNscaleProvider('nscale:completion:openai/gpt-oss-120b');
    expect(provider).toBeInstanceOf(OpenAiCompletionProvider);
    expect(OpenAiCompletionProvider).toHaveBeenCalledWith(
      'openai/gpt-oss-120b',
      expect.any(Object),
    );
  });

  it('should create an embedding provider when type is embedding', () => {
    const provider = createNscaleProvider('nscale:embedding:qwen3-embedding-8b');
    expect(provider).toBeInstanceOf(OpenAiEmbeddingProvider);
    expect(OpenAiEmbeddingProvider).toHaveBeenCalledWith('qwen3-embedding-8b', expect.any(Object));
  });

  it('should create an embedding provider when type is embeddings', () => {
    const provider = createNscaleProvider('nscale:embeddings:qwen3-embedding-8b');
    expect(provider).toBeInstanceOf(OpenAiEmbeddingProvider);
    expect(OpenAiEmbeddingProvider).toHaveBeenCalledWith('qwen3-embedding-8b', expect.any(Object));
  });

  it('should create an image provider when type is image', () => {
    const provider = createNscaleProvider('nscale:image:flux/flux.1-schnell');
    expect(provider).toBeInstanceOf(NscaleImageProvider);
  });

  it('should default to chat completion provider when no type is specified', () => {
    const provider = createNscaleProvider('nscale:openai/gpt-oss-120b');
    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
      'openai/gpt-oss-120b',
      expect.any(Object),
    );
  });

  it('should pass correct configuration to the provider', () => {
    const options: {
      config?: ProviderOptions;
      id?: string;
      env?: EnvOverrides;
    } = {
      id: 'custom-id',
    };
    createNscaleProvider('nscale:chat:openai/gpt-oss-120b', options);

    // Verify that the OpenAI provider was called with the correct parameters
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('openai/gpt-oss-120b', {
      config: {
        apiBaseUrl: 'https://inference.api.nscale.com/v1',
        apiKey: undefined, // No API key or service token set
        passthrough: {},
      },
      id: 'custom-id',
    });
  });

  it('should prefer service tokens over API keys', () => {
    (getEnvString as Mock).mockReturnValue(undefined);
    const options = {
      env: {
        NSCALE_SERVICE_TOKEN: 'service-token-123',
        NSCALE_API_KEY: 'api-key-456',
      },
    };
    createNscaleProvider('nscale:chat:openai/gpt-oss-120b', options);

    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
      'openai/gpt-oss-120b',
      expect.objectContaining({
        config: expect.objectContaining({
          apiKey: 'service-token-123',
        }),
      }),
    );
  });

  it('should fall back to API key if no service token is provided', () => {
    (getEnvString as Mock).mockReturnValue(undefined);
    const options = {
      env: {
        NSCALE_API_KEY: 'api-key-456',
      },
    };
    createNscaleProvider('nscale:chat:openai/gpt-oss-120b', options);

    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
      'openai/gpt-oss-120b',
      expect.objectContaining({
        config: expect.objectContaining({
          apiKey: 'api-key-456',
        }),
      }),
    );
  });

  it('should use explicit config apiKey over environment variables', () => {
    (getEnvString as Mock).mockReturnValue(undefined);
    const options = {
      config: {
        config: {
          apiKey: 'explicit-key-789',
        },
      },
      env: {
        NSCALE_SERVICE_TOKEN: 'service-token-123',
        NSCALE_API_KEY: 'api-key-456',
      },
    };
    createNscaleProvider('nscale:chat:openai/gpt-oss-120b', options);

    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
      'openai/gpt-oss-120b',
      expect.objectContaining({
        config: expect.objectContaining({
          apiKey: 'explicit-key-789',
        }),
      }),
    );
  });

  it('should handle model names with slashes', () => {
    createNscaleProvider('nscale:chat:openai/gpt-oss-120b');
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
      'openai/gpt-oss-120b',
      expect.any(Object),
    );
  });

  it('should handle model names with colons', () => {
    createNscaleProvider('nscale:chat:meta:llama:3.3:70b:instruct');
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
      'meta:llama:3.3:70b:instruct',
      expect.any(Object),
    );
  });

  describe('parameter handling', () => {
    it('should add all parameters to passthrough', () => {
      const options = {
        config: {
          config: {
            max_tokens: 4096,
            temperature: 0.7,
            top_p: 0.9,
            stream: true,
            custom_param: 'value',
          },
        },
      };

      createNscaleProvider('nscale:chat:openai/gpt-oss-120b', options);

      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'openai/gpt-oss-120b',
        expect.objectContaining({
          config: expect.objectContaining({
            apiBaseUrl: 'https://inference.api.nscale.com/v1',
            apiKey: undefined, // No API key or service token set
            passthrough: expect.objectContaining({
              max_tokens: 4096,
              temperature: 0.7,
              top_p: 0.9,
              stream: true,
              custom_param: 'value',
            }),
          }),
        }),
      );
    });

    it('should handle Nscale-specific parameters correctly', () => {
      const options = {
        config: {
          config: {
            stop: ['END', 'STOP'],
            frequency_penalty: 0.1,
            presence_penalty: 0.2,
          },
        },
      };

      createNscaleProvider('nscale:chat:openai/gpt-oss-120b', options);

      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'openai/gpt-oss-120b',
        expect.objectContaining({
          config: expect.objectContaining({
            apiBaseUrl: 'https://inference.api.nscale.com/v1',
            apiKey: undefined, // No API key or service token set
            passthrough: expect.objectContaining({
              stop: ['END', 'STOP'],
              frequency_penalty: 0.1,
              presence_penalty: 0.2,
            }),
          }),
        }),
      );
    });
  });

  describe('error handling', () => {
    it('should handle malformed provider string gracefully', () => {
      expect(() => createNscaleProvider('nscale:')).not.toThrow();
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('', expect.any(Object));
    });

    it('should work without API key or service token (provider will handle auth errors)', () => {
      expect(() => createNscaleProvider('nscale:openai/gpt-oss-120b')).not.toThrow();
      const provider = createNscaleProvider('nscale:openai/gpt-oss-120b');
      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    });
  });

  describe('integration behavior', () => {
    it('should create provider with correct base URL and authentication', () => {
      const options = {
        env: {
          NSCALE_SERVICE_TOKEN: 'test-service-token',
        },
      };
      createNscaleProvider('nscale:openai/gpt-oss-120b', options);

      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'openai/gpt-oss-120b',
        expect.objectContaining({
          config: expect.objectContaining({
            apiBaseUrl: 'https://inference.api.nscale.com/v1',
            apiKey: 'test-service-token',
          }),
        }),
      );
    });
  });
});
