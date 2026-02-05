import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache } from '../../src/cache';
import {
  AlibabaChatCompletionProvider,
  AlibabaEmbeddingProvider,
} from '../../src/providers/alibaba';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { OpenAiEmbeddingProvider } from '../../src/providers/openai/embedding';

import type { ProviderOptions } from '../../src/types/index';

vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));
vi.mock('../../src/providers/openai/chat', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    OpenAiChatCompletionProvider: vi.fn(),
  };
});
vi.mock('../../src/providers/openai/completion', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    OpenAiCompletionProvider: vi.fn(),
  };
});
vi.mock('../../src/providers/openai/embedding', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    OpenAiEmbeddingProvider: vi.fn(),
  };
});

describe('Alibaba Cloud Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await clearCache();
  });

  describe('AlibabaChatCompletionProvider', () => {
    it('should create provider for flagship models', () => {
      const provider = new AlibabaChatCompletionProvider('qwen-max', {});

      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'qwen-max',
        expect.objectContaining({
          config: expect.objectContaining({
            apiBaseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
            apiKeyEnvar: 'DASHSCOPE_API_KEY',
          }),
        }),
      );
    });

    it('should create provider for visual language models', () => {
      const provider = new AlibabaChatCompletionProvider('qwen-vl-max', {});

      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'qwen-vl-max',
        expect.objectContaining({
          config: expect.objectContaining({
            apiBaseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
            apiKeyEnvar: 'DASHSCOPE_API_KEY',
          }),
        }),
      );
    });

    it('should throw error when no model specified', () => {
      expect(() => new AlibabaChatCompletionProvider('')).toThrow('Alibaba modelName is required');
    });

    it('should warn but not throw for unknown model', () => {
      // Unknown models now only warn, they don't throw errors
      const provider = new AlibabaChatCompletionProvider('unknown-model', {});
      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    });

    it('should pass through environment variables', () => {
      const provider = new AlibabaChatCompletionProvider('qwen-max', {
        env: {
          DASHSCOPE_API_KEY: 'test-key',
        },
      } as ProviderOptions);

      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'qwen-max',
        expect.objectContaining({
          env: expect.objectContaining({
            DASHSCOPE_API_KEY: 'test-key',
          }),
        }),
      );
    });

    it('should allow custom API base URL', () => {
      const customBaseUrl = 'https://dashscope.aliyuncs.com/api/v1';
      const provider = new AlibabaChatCompletionProvider('qwen-max', {
        config: {
          apiBaseUrl: customBaseUrl,
        },
      });

      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'qwen-max',
        expect.objectContaining({
          config: expect.objectContaining({
            apiBaseUrl: customBaseUrl,
          }),
        }),
      );
    });
  });

  describe('AlibabaEmbeddingProvider', () => {
    it('should create provider for embedding models', () => {
      const provider = new AlibabaEmbeddingProvider('text-embedding-v3', {});

      expect(provider).toBeInstanceOf(OpenAiEmbeddingProvider);
      expect(OpenAiEmbeddingProvider).toHaveBeenCalledWith(
        'text-embedding-v3',
        expect.objectContaining({
          config: expect.objectContaining({
            apiBaseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
            apiKeyEnvar: 'DASHSCOPE_API_KEY',
          }),
        }),
      );
    });

    it('should throw error when no model specified', () => {
      expect(() => new AlibabaEmbeddingProvider('')).toThrow('Alibaba modelName is required');
    });

    it('should warn but not throw for unknown model', () => {
      // Unknown models now only warn, they don't throw errors
      const provider = new AlibabaEmbeddingProvider('unknown-model', {});
      expect(provider).toBeInstanceOf(OpenAiEmbeddingProvider);
    });

    it('should pass through environment variables', () => {
      const provider = new AlibabaEmbeddingProvider('text-embedding-v3', {
        env: {
          DASHSCOPE_API_KEY: 'test-key',
        },
      } as ProviderOptions);

      expect(provider).toBeInstanceOf(OpenAiEmbeddingProvider);
      expect(OpenAiEmbeddingProvider).toHaveBeenCalledWith(
        'text-embedding-v3',
        expect.objectContaining({
          env: expect.objectContaining({
            DASHSCOPE_API_KEY: 'test-key',
          }),
        }),
      );
    });

    it('should allow custom API base URL', () => {
      const customBaseUrl = 'https://dashscope.aliyuncs.com/api/v1';
      const provider = new AlibabaEmbeddingProvider('text-embedding-v3', {
        config: {
          apiBaseUrl: customBaseUrl,
        },
      });

      expect(provider).toBeInstanceOf(OpenAiEmbeddingProvider);
      expect(OpenAiEmbeddingProvider).toHaveBeenCalledWith(
        'text-embedding-v3',
        expect.objectContaining({
          config: expect.objectContaining({
            apiBaseUrl: customBaseUrl,
          }),
        }),
      );
    });
  });
});
