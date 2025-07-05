import { clearCache } from '../../src/cache';
import { DatabricksMosaicAiChatCompletionProvider } from '../../src/providers/databricks';
import type { DatabricksMosaicAiProviderOptions } from '../../src/providers/databricks';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';

jest.mock('../../src/logger');
jest.mock('../../src/providers/openai');

describe('Databricks Mosaic AI Provider', () => {
  const originalEnv = process.env;
  const workspaceUrl = 'https://test-workspace.cloud.databricks.com';
  const defaultOptions: DatabricksMosaicAiProviderOptions = {
    config: {
      workspaceUrl,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.DATABRICKS_WORKSPACE_URL;
    delete process.env.DATABRICKS_TOKEN;
  });

  afterEach(async () => {
    await clearCache();
    process.env = originalEnv;
  });

  describe('DatabricksMosaicAiChatCompletionProvider', () => {
    it('should create provider for a specific model', () => {
      const provider = new DatabricksMosaicAiChatCompletionProvider(
        'meta-llama-3.3-70b-instruct',
        defaultOptions,
      );

      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'meta-llama-3.3-70b-instruct',
        expect.objectContaining({
          config: expect.objectContaining({
            apiBaseUrl: `${workspaceUrl}/serving-endpoints`,
            apiKeyEnvar: 'DATABRICKS_TOKEN',
          }),
        }),
      );
    });

    it('should create provider with workspace URL from config', () => {
      const options: DatabricksMosaicAiProviderOptions = {
        config: {
          workspaceUrl,
        },
      };
      const provider = new DatabricksMosaicAiChatCompletionProvider(
        'meta-llama-3.3-70b-instruct',
        options,
      );

      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'meta-llama-3.3-70b-instruct',
        expect.objectContaining({
          config: expect.objectContaining({
            apiBaseUrl: `${workspaceUrl}/serving-endpoints`,
            apiKeyEnvar: 'DATABRICKS_TOKEN',
          }),
        }),
      );
    });

    it('should create provider with workspace URL from environment variable', () => {
      process.env.DATABRICKS_WORKSPACE_URL = workspaceUrl;

      const options: DatabricksMosaicAiProviderOptions = {
        config: {},
      };
      const provider = new DatabricksMosaicAiChatCompletionProvider(
        'meta-llama-3.3-70b-instruct',
        options,
      );

      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'meta-llama-3.3-70b-instruct',
        expect.objectContaining({
          config: expect.objectContaining({
            apiBaseUrl: `${workspaceUrl}/serving-endpoints`,
            apiKeyEnvar: 'DATABRICKS_TOKEN',
          }),
        }),
      );
    });

    it('should throw error when no workspace URL is provided', () => {
      const options: DatabricksMosaicAiProviderOptions = {
        config: {},
      };
      expect(
        () => new DatabricksMosaicAiChatCompletionProvider('meta-llama-3.3-70b-instruct', options),
      ).toThrow(
        'Databricks workspace URL is required. Set it in the config or DATABRICKS_WORKSPACE_URL environment variable.',
      );
    });

    it('should pass through environment variables', () => {
      const options: DatabricksMosaicAiProviderOptions = {
        config: {
          workspaceUrl,
        },
        env: {
          DATABRICKS_TOKEN: 'test-token',
        },
      };
      const provider = new DatabricksMosaicAiChatCompletionProvider(
        'meta-llama-3.3-70b-instruct',
        options,
      );

      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'meta-llama-3.3-70b-instruct',
        expect.objectContaining({
          env: expect.objectContaining({
            DATABRICKS_TOKEN: 'test-token',
          }),
        }),
      );
    });

    it('should pass through OpenAI configuration options', () => {
      const options: DatabricksMosaicAiProviderOptions = {
        config: {
          workspaceUrl,
          temperature: 0.7,
          max_tokens: 100,
          top_p: 0.9,
        },
      };
      const provider = new DatabricksMosaicAiChatCompletionProvider(
        'meta-llama-3.3-70b-instruct',
        options,
      );

      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'meta-llama-3.3-70b-instruct',
        expect.objectContaining({
          config: expect.objectContaining({
            temperature: 0.7,
            max_tokens: 100,
            top_p: 0.9,
          }),
        }),
      );
    });
  });
});
