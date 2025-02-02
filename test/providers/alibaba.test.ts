import { clearCache } from '../../src/cache';
import {
  AlibabaChatCompletionProvider,
  AlibabaEmbeddingProvider,
} from '../../src/providers/alibaba';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { OpenAiEmbeddingProvider } from '../../src/providers/openai/embedding';
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
      expect(() => new AlibabaChatCompletionProvider('')).toThrow(
        'Invalid Alibaba Cloud model: . Available models:',
      );
    });

    it('should throw error for unknown model', () => {
      expect(() => new AlibabaChatCompletionProvider('unknown-model', {})).toThrow(
        'Invalid Alibaba Cloud model: unknown-model. Available models:',
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
      expect(() => new AlibabaEmbeddingProvider('')).toThrow(
        'Invalid Alibaba Cloud model: . Available models:',
      );
    });

    it('should throw error for unknown model', () => {
      expect(() => new AlibabaEmbeddingProvider('unknown-model', {})).toThrow(
        'Invalid Alibaba Cloud model: unknown-model. Available models:',
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
  });
});
