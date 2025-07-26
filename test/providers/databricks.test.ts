import { clearCache } from '../../src/cache';
import { DatabricksMosaicAiChatCompletionProvider } from '../../src/providers/databricks';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';

import type { DatabricksMosaicAiProviderOptions } from '../../src/providers/databricks';

jest.mock('../../src/logger');
jest.mock('../../src/providers/openai/chat');

describe('Databricks Foundation Model APIs Provider', () => {
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
    it('should create provider for a custom deployed endpoint', () => {
      const provider = new DatabricksMosaicAiChatCompletionProvider(
        'my-custom-endpoint',
        defaultOptions,
      );

      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'my-custom-endpoint',
        expect.objectContaining({
          config: expect.objectContaining({
            apiBaseUrl: `${workspaceUrl}/serving-endpoints`,
            apiKeyEnvar: 'DATABRICKS_TOKEN',
          }),
        }),
      );
    });

    it('should create provider for a pay-per-token endpoint', () => {
      const options: DatabricksMosaicAiProviderOptions = {
        config: {
          workspaceUrl,
          isPayPerToken: true,
        },
      };
      const provider = new DatabricksMosaicAiChatCompletionProvider(
        'databricks-meta-llama-3-3-70b-instruct',
        options,
      );

      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'databricks-meta-llama-3-3-70b-instruct',
        expect.objectContaining({
          config: expect.objectContaining({
            apiBaseUrl: workspaceUrl,
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
      const provider = new DatabricksMosaicAiChatCompletionProvider('my-endpoint', options);

      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'my-endpoint',
        expect.objectContaining({
          config: expect.objectContaining({
            apiBaseUrl: `${workspaceUrl}/serving-endpoints`,
            apiKeyEnvar: 'DATABRICKS_TOKEN',
          }),
        }),
      );
    });

    it('should strip trailing slash from workspace URL', () => {
      const options: DatabricksMosaicAiProviderOptions = {
        config: {
          workspaceUrl: `${workspaceUrl}/`,
        },
      };
      const _provider = new DatabricksMosaicAiChatCompletionProvider('my-endpoint', options);

      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'my-endpoint',
        expect.objectContaining({
          config: expect.objectContaining({
            apiBaseUrl: `${workspaceUrl}/serving-endpoints`,
          }),
        }),
      );
    });

    it('should throw error when no workspace URL is provided', () => {
      const options: DatabricksMosaicAiProviderOptions = {
        config: {},
      };
      expect(() => new DatabricksMosaicAiChatCompletionProvider('my-endpoint', options)).toThrow(
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
      const provider = new DatabricksMosaicAiChatCompletionProvider('my-endpoint', options);

      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'my-endpoint',
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
      const provider = new DatabricksMosaicAiChatCompletionProvider('my-endpoint', options);

      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'my-endpoint',
        expect.objectContaining({
          config: expect.objectContaining({
            temperature: 0.7,
            max_tokens: 100,
            top_p: 0.9,
          }),
        }),
      );
    });

    it('should include usage context as extra body params', () => {
      const options: DatabricksMosaicAiProviderOptions = {
        config: {
          workspaceUrl,
          usageContext: {
            project: 'test-project',
            team: 'engineering',
          },
        },
      };
      const _provider = new DatabricksMosaicAiChatCompletionProvider('my-endpoint', options);

      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'my-endpoint',
        expect.objectContaining({
          config: expect.objectContaining({
            extraBodyParams: {
              usage_context: {
                project: 'test-project',
                team: 'engineering',
              },
            },
          }),
        }),
      );
    });

    it('should merge usage context with existing extra body params', () => {
      const options: DatabricksMosaicAiProviderOptions = {
        config: {
          workspaceUrl,
          usageContext: {
            project: 'test-project',
          },
          extraBodyParams: {
            custom_param: 'value',
          },
        },
      };
      const _provider = new DatabricksMosaicAiChatCompletionProvider('my-endpoint', options);

      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'my-endpoint',
        expect.objectContaining({
          config: expect.objectContaining({
            extraBodyParams: {
              custom_param: 'value',
              usage_context: {
                project: 'test-project',
              },
            },
          }),
        }),
      );
    });

    it('should pass through AI Gateway config', () => {
      const options: DatabricksMosaicAiProviderOptions = {
        config: {
          workspaceUrl,
          aiGatewayConfig: {
            enableSafety: true,
            piiHandling: 'mask',
          },
        },
      };
      const _provider = new DatabricksMosaicAiChatCompletionProvider('my-endpoint', options);

      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'my-endpoint',
        expect.objectContaining({
          config: expect.objectContaining({
            aiGatewayConfig: {
              enableSafety: true,
              piiHandling: 'mask',
            },
          }),
        }),
      );
    });

    it('should use custom apiKeyEnvar if provided', () => {
      const options: DatabricksMosaicAiProviderOptions = {
        config: {
          workspaceUrl,
          apiKeyEnvar: 'CUSTOM_DATABRICKS_KEY',
        },
      };
      const _provider = new DatabricksMosaicAiChatCompletionProvider('my-endpoint', options);

      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'my-endpoint',
        expect.objectContaining({
          config: expect.objectContaining({
            apiKeyEnvar: 'CUSTOM_DATABRICKS_KEY',
          }),
        }),
      );
    });
  });

  describe('getApiUrl method', () => {
    // Need to unmock for these specific tests
    beforeEach(() => {
      jest.unmock('../../src/providers/openai/chat');
      jest.resetModules();
    });

    it('should return custom URL for pay-per-token endpoints', async () => {
      // Re-import after unmocking
      const { DatabricksMosaicAiChatCompletionProvider: UnmockedProvider } = await import(
        '../../src/providers/databricks'
      );

      const options: DatabricksMosaicAiProviderOptions = {
        config: {
          workspaceUrl,
          isPayPerToken: true,
        },
      };
      const provider = new UnmockedProvider('databricks-meta-llama-3-3-70b-instruct', options);

      // Use type assertion to access protected method
      const url = (provider as any).getApiUrl();

      expect(url).toBe(
        `${workspaceUrl}/serving-endpoints/databricks-meta-llama-3-3-70b-instruct/invocations`,
      );
    });

    it('should use parent class URL for custom endpoints', async () => {
      // Re-import after unmocking
      const { DatabricksMosaicAiChatCompletionProvider: UnmockedProvider } = await import(
        '../../src/providers/databricks'
      );

      const provider = new UnmockedProvider('my-custom-endpoint', defaultOptions);

      // Since we're extending OpenAI provider, it should use the OpenAI URL pattern
      const url = (provider as any).getApiUrl();

      // For custom endpoints, getApiUrl returns the base URL (apiBaseUrl)
      // The /chat/completions path is added later in the callApi method
      expect(url).toBe(`${workspaceUrl}/serving-endpoints`);
    });
  });
});
