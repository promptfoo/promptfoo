import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache } from '../../src/cache';
import logger from '../../src/logger';
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

    it('uses Alibaba as its telemetry provider independently of the configured provider ID', () => {
      const provider = new AlibabaChatCompletionProvider('qwen-max', {
        id: 'custom:customer-label',
      } as ProviderOptions);

      expect((provider as any).getGenAISystem()).toBe('alibaba');
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

    it.each([
      'qwen3.8-max',
      'qwen3.8-max-0902',
      'qwen3.8-flash',
      'qwen3.8-omni-flash',
      'qwen3.7-max-2026-06-08',
      'qwen3.7-plus',
      'qwen3.7-plus-2026-05-26',
      'qwen3.7-flash',
      'qwen3.7-flash-2026-07-15',
      'qwen3.6-plus',
      'qwen3.5-flash',
      'qwen3-coder-next',
      'deepseek-v4.1-flash',
      'deepseek-v4-pro-0813',
      'deepseek-v3.2',
      'kimi-k3',
      'glm-5.2',
      'ZHIPU/GLM-5.3',
    ])('should recognize refreshed model id %s', (modelName) => {
      new AlibabaChatCompletionProvider(modelName, {});

      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should throw error when no model specified', () => {
      expect(() => new AlibabaChatCompletionProvider('')).toThrow('Alibaba modelName is required');
    });

    it('should warn but not throw for unknown model', () => {
      // Unknown models now only warn, they don't throw errors
      const provider = new AlibabaChatCompletionProvider('unknown-model', {});
      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Unknown Alibaba Cloud model: unknown-model.'),
      );
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
    it('recognizes the Qwen3.7 text embedding model', () => {
      new AlibabaEmbeddingProvider('qwen3.7-text-embedding');
      expect(logger.warn).not.toHaveBeenCalled();
      expect(OpenAiEmbeddingProvider).toHaveBeenCalledWith(
        'qwen3.7-text-embedding',
        expect.objectContaining({
          config: expect.objectContaining({ apiKeyEnvar: 'DASHSCOPE_API_KEY' }),
        }),
      );
    });

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
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Unknown Alibaba Cloud model: unknown-model.'),
      );
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
