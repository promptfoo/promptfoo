import { clearCache } from '../../src/cache';
import logger from '../../src/logger';
import { createAlibabaProvider } from '../../src/providers/alibaba';
import { OpenAiChatCompletionProvider, OpenAiEmbeddingProvider } from '../../src/providers/openai';
import type { ProviderOptions } from '../../src/types';

jest.mock('../../src/logger');
jest.mock('../../src/providers/openai');

describe('Alibaba Cloud Provider', () => {
  afterEach(async () => {
    jest.clearAllMocks();
    await clearCache();
  });

  describe('createAlibabaProvider', () => {
    it('should create OpenAiChatCompletionProvider for flagship models', () => {
      const provider = createAlibabaProvider('alibaba:qwen-max', {
        config: {
          temperature: 0.7,
        },
      } as ProviderOptions);

      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'qwen-max',
        expect.objectContaining({
          config: expect.objectContaining({
            temperature: 0.7,
            apiBaseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
            apiKeyEnvar: 'ALICLOUD_API_KEY',
          }),
        }),
      );
    });

    it('should create OpenAiChatCompletionProvider for visual language models', () => {
      const provider = createAlibabaProvider('alibaba:vl:qwen-vl-max', {
        config: {
          temperature: 0.7,
        },
      } as ProviderOptions);

      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'qwen-vl-max',
        expect.objectContaining({
          config: expect.objectContaining({
            temperature: 0.7,
            apiBaseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
            apiKeyEnvar: 'ALICLOUD_API_KEY',
          }),
        }),
      );
    });

    it('should create OpenAiEmbeddingProvider for embedding models', () => {
      const provider = createAlibabaProvider('alibaba:embedding:text-embedding-v3', {
        config: {
          temperature: 0.7,
        },
      } as ProviderOptions);

      expect(provider).toBeInstanceOf(OpenAiEmbeddingProvider);
      expect(OpenAiEmbeddingProvider).toHaveBeenCalledWith(
        'text-embedding-v3',
        expect.objectContaining({
          config: expect.objectContaining({
            temperature: 0.7,
            apiBaseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
            apiKeyEnvar: 'ALICLOUD_API_KEY',
          }),
        }),
      );
    });

    it('should use default model qwen-plus when no model specified', () => {
      const provider = createAlibabaProvider('alibaba:', {});

      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'qwen-plus',
        expect.objectContaining({
          config: expect.objectContaining({
            apiBaseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
            apiKeyEnvar: 'ALICLOUD_API_KEY',
          }),
        }),
      );
    });

    it('should log warning for unknown model', () => {
      const provider = createAlibabaProvider('alibaba:unknown-model', {});

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Unknown Alibaba Cloud model: unknown-model'),
      );
      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    });

    it('should support alicloud alias', () => {
      const provider = createAlibabaProvider('alicloud:qwen-max', {});

      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'qwen-max',
        expect.objectContaining({
          config: expect.objectContaining({
            apiBaseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
            apiKeyEnvar: 'ALICLOUD_API_KEY',
          }),
        }),
      );
    });

    it('should support aliyun alias', () => {
      const provider = createAlibabaProvider('aliyun:qwen-max', {});

      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'qwen-max',
        expect.objectContaining({
          config: expect.objectContaining({
            apiBaseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
            apiKeyEnvar: 'ALICLOUD_API_KEY',
          }),
        }),
      );
    });

    it('should support dashscope alias', () => {
      const provider = createAlibabaProvider('dashscope:qwen-max', {});

      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'qwen-max',
        expect.objectContaining({
          config: expect.objectContaining({
            apiBaseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
            apiKeyEnvar: 'ALICLOUD_API_KEY',
          }),
        }),
      );
    });

    it('should handle chat type explicitly', () => {
      const provider = createAlibabaProvider('alibaba:chat:qwen-max', {});

      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'qwen-max',
        expect.objectContaining({
          config: expect.objectContaining({
            apiBaseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
            apiKeyEnvar: 'ALICLOUD_API_KEY',
          }),
        }),
      );
    });

    it('should handle completion type explicitly', () => {
      const provider = createAlibabaProvider('alibaba:completion:qwen-max', {});

      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'qwen-max',
        expect.objectContaining({
          config: expect.objectContaining({
            apiBaseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
            apiKeyEnvar: 'ALICLOUD_API_KEY',
          }),
        }),
      );
    });

    it('should pass through environment variables', () => {
      const provider = createAlibabaProvider('alibaba:qwen-max', {
        env: {
          ALICLOUD_API_KEY: 'test-key',
        },
      } as ProviderOptions);

      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'qwen-max',
        expect.objectContaining({
          env: expect.objectContaining({
            ALICLOUD_API_KEY: 'test-key',
          }),
        }),
      );
    });
  });
});
