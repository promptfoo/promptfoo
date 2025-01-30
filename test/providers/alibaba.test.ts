import { clearCache } from '../../src/cache';
import { createAlibabaProvider } from '../../src/providers/alibaba';
import { OpenAiChatCompletionProvider, OpenAiEmbeddingProvider } from '../../src/providers/openai';
import type { ProviderOptions } from '../../src/types';

jest.mock('../../src/logger');
jest.mock('../../src/providers/openai');

describe('Alibaba Cloud Provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await clearCache();
  });

  describe('createAlibabaProvider', () => {
    it('should create OpenAiChatCompletionProvider for flagship models', async () => {
      const provider = createAlibabaProvider('alibaba:qwen-max', {});

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

    it('should create OpenAiChatCompletionProvider for visual language models', async () => {
      const provider = createAlibabaProvider('alibaba:vl:qwen-vl-max', {});

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

    it('should create OpenAiEmbeddingProvider for embedding models', async () => {
      const provider = createAlibabaProvider('alibaba:embedding:text-embedding-v3', {});

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

    it('should throw error when no model specified', async () => {
      expect(() => createAlibabaProvider('alibaba:')).toThrow(
        'Invalid Alibaba Cloud model: . Available models:',
      );
    });

    it('should use DASHSCOPE_API_KEY for dashscope prefix', async () => {
      const provider = createAlibabaProvider('dashscope:qwen-max');
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

    it('should use DASHSCOPE_API_KEY for other prefixes', async () => {
      const prefixes = ['alibaba:', 'alicloud:', 'aliyun:'];
      for (const prefix of prefixes) {
        const provider = createAlibabaProvider(`${prefix}qwen-max`);
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
      }
    });

    it('should throw error for unknown model', () => {
      expect(() => createAlibabaProvider('alibaba:unknown-model', {})).toThrow(
        'Invalid Alibaba Cloud model: unknown-model. Available models:',
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
            apiKeyEnvar: 'DASHSCOPE_API_KEY',
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
            apiKeyEnvar: 'DASHSCOPE_API_KEY',
          }),
        }),
      );
    });

    it('should pass through environment variables', () => {
      const provider = createAlibabaProvider('alibaba:qwen-max', {
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
  });
});
