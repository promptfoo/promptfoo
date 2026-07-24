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
      'qwen3.7-max',
      'qwen3.7-max-us',
      'qwen3.7-max-preview',
      'qwen3.7-max-2026-06-08',
      'qwen3.7-max-2026-05-20',
      'qwen3.7-max-2026-05-17',
      'qwen3.7-plus',
      'qwen3.7-plus-us',
      'qwen3.7-plus-2026-05-26',
      'qwen3.6-plus',
      'qwen3.6-27b',
      'qwen3.6-35b-a3b',
      'qwen3.5-flash',
      'qwen3.5-plus-2026-04-20',
      'qwen3.5-ocr',
      'qwen-plus-us',
      'qwen-flash-us',
      'qwen3-vl-plus-2025-12-19',
      'qwen3-vl-flash-us',
      'qwen3-coder-next',
      'deepseek-v4-flash',
      'deepseek-v4-pro',
      'deepseek-v3.2',
      'vanchin/deepseek-v4-pro',
      'vanchin/deepseek-v3.2-think',
      'vanchin/deepseek-v3.1-terminus',
      'vanchin/deepseek-r1',
      'vanchin/deepseek-v3',
      'vanchin/deepseek-ocr',
      'kimi-k2.7-code',
      'kimi-k2.6',
      'kimi-k2.5',
      'kimi/kimi-k3',
      'kimi/kimi-k2.7-code-highspeed',
      'kimi/kimi-k2.7-code',
      'kimi/kimi-k2.6',
      'kimi/kimi-k2.5',
      'glm-5.2',
      'glm-5.2-us',
      'glm-5.2-fast-preview',
      'glm-5.1',
      'glm-5',
      'ZHIPU/GLM-5.2',
      'ZHIPU/GLM-5.1',
      'ZHIPU/GLM-5',
      'MiniMax-M2.5',
      'MiniMax/MiniMax-M3',
      'MiniMax/MiniMax-M2.7',
      'MiniMax/MiniMax-M2.5',
      'xiaomi/mimo-v2.5-pro',
      'stepfun/step-3.7-flash',
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
