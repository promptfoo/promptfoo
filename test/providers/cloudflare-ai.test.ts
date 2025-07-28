import { clearCache, enableCache } from '../../src/cache';
import {
  CloudflareAiChatCompletionProvider,
  CloudflareAiCompletionProvider,
  type CloudflareAiConfig,
  CloudflareAiEmbeddingProvider,
  createCloudflareAiProvider,
} from '../../src/providers/cloudflare-ai';
import { loadApiProviders } from '../../src/providers/index';

import type { ProviderOptionsMap } from '../../src/types';

jest.mock('fs');

jest.mock('glob', () => ({
  globSync: jest.fn(),
}));

jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../src/esm', () => ({
  ...jest.requireActual('../../src/esm'),
  importModule: jest.fn(),
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

jest.mock('glob', () => ({
  globSync: jest.fn(),
}));

jest.mock('../../src/database', () => ({
  getDb: jest.fn(),
}));

const mockFetch = jest.mocked(jest.fn());
global.fetch = mockFetch;

const defaultMockResponse = {
  status: 200,
  statusText: 'OK',
  headers: {
    get: jest.fn().mockReturnValue(null),
    entries: jest.fn().mockReturnValue([]),
  },
};

describe('CloudflareAi Provider', () => {
  beforeAll(() => {
    enableCache();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await clearCache();
  });

  const cloudflareMinimumConfig: Required<Pick<CloudflareAiConfig, 'accountId' | 'apiKey'>> = {
    accountId: 'testAccountId',
    apiKey: 'testApiKey',
  };

  const testModelName = '@cf/meta/llama-2-7b-chat-fp16';
  const tokenUsageDefaultResponse = {
    total: 50,
    prompt: 25,
    completion: 25,
    cached: undefined,
  };

  describe('CloudflareAiChatCompletionProvider', () => {
    it('Should handle chat provider', async () => {
      const provider = new CloudflareAiChatCompletionProvider(testModelName, {
        config: cloudflareMinimumConfig,
      });

      const responsePayload = {
        choices: [
          {
            message: {
              content: 'Test text output',
            },
          },
        ],
        usage: {
          total_tokens: 50,
          prompt_tokens: 25,
          completion_tokens: 25,
        },
      };
      const mockResponse = {
        ...defaultMockResponse,
        text: jest.fn().mockResolvedValue(JSON.stringify(responsePayload)),
        ok: true,
      };

      mockFetch.mockResolvedValue(mockResponse);
      const result = await provider.callApi('Test chat prompt');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.output).toBe(responsePayload.choices[0].message.content);
      expect(result.tokenUsage).toEqual(tokenUsageDefaultResponse);
    });

    it('Should handle errors properly', async () => {
      const provider = new CloudflareAiChatCompletionProvider(testModelName, {
        config: cloudflareMinimumConfig,
      });

      const responsePayload = {
        error: {
          message: 'Some error occurred',
          type: 'invalid_request_error',
          code: 'invalid_request',
        },
      };
      const mockResponse = {
        ...defaultMockResponse,
        text: jest.fn().mockResolvedValue(JSON.stringify(responsePayload)),
        ok: true,
      };

      mockFetch.mockResolvedValue(mockResponse);
      const result = await provider.callApi('Test chat prompt');

      expect(result.error).toContain('invalid_request_error');
    });

    it('Can be invoked with custom configuration', async () => {
      const cloudflareChatConfig: CloudflareAiConfig = {
        accountId: 'MADE_UP_ACCOUNT_ID',
        apiKey: 'MADE_UP_API_KEY',
        temperature: 0.7,
        max_tokens: 100,
      };
      const rawProviderConfigs: ProviderOptionsMap[] = [
        {
          [`cloudflare-ai:chat:${testModelName}`]: {
            config: cloudflareChatConfig,
          },
        },
      ];

      const providers = await loadApiProviders(rawProviderConfigs);
      expect(providers).toHaveLength(1);
      expect(providers[0]).toBeInstanceOf(CloudflareAiChatCompletionProvider);

      const cfProvider = providers[0] as CloudflareAiChatCompletionProvider;
      expect(cfProvider.id()).toBe(`cloudflare-ai:chat:${testModelName}`);

      const responsePayload = {
        choices: [
          {
            message: {
              content: 'Test text output',
            },
          },
        ],
        usage: {
          total_tokens: 50,
          prompt_tokens: 25,
          completion_tokens: 25,
        },
      };
      const mockResponse = {
        ...defaultMockResponse,
        text: jest.fn().mockResolvedValue(JSON.stringify(responsePayload)),
        ok: true,
      };

      mockFetch.mockResolvedValue(mockResponse);
      await cfProvider.callApi('Test prompt for custom configuration');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      // Check that the request includes the expected URL format for OpenAI-compatible endpoints
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('chat/completions'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer MADE_UP_API_KEY',
          }),
          body: expect.stringContaining(testModelName),
        }),
      );
    });

    it('Uses environment variables when config not provided', () => {
      process.env.CLOUDFLARE_ACCOUNT_ID = 'env-account-id';
      process.env.CLOUDFLARE_API_KEY = 'env-api-key';

      const provider = new CloudflareAiChatCompletionProvider(testModelName, {});

      expect(provider.id()).toBe(`cloudflare-ai:chat:${testModelName}`);
      expect(provider.toString()).toBe(`[Cloudflare AI chat Provider ${testModelName}]`);

      // Clean up
      delete process.env.CLOUDFLARE_ACCOUNT_ID;
      delete process.env.CLOUDFLARE_API_KEY;
    });

    it('Should use custom API base URL when provided', async () => {
      const customConfig: CloudflareAiConfig = {
        accountId: 'test-account',
        apiKey: 'test-key',
        apiBaseUrl: 'https://custom-cloudflare-api.example.com/v1',
      };

      const provider = new CloudflareAiChatCompletionProvider(testModelName, {
        config: customConfig,
      });

      const responsePayload = {
        choices: [
          {
            message: {
              content: 'Custom API response',
            },
          },
        ],
        usage: {
          total_tokens: 50,
          prompt_tokens: 25,
          completion_tokens: 25,
        },
      };
      const mockResponse = {
        ...defaultMockResponse,
        text: jest.fn().mockResolvedValue(JSON.stringify(responsePayload)),
        ok: true,
      };

      mockFetch.mockResolvedValue(mockResponse);
      const result = await provider.callApi('Test custom API prompt');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom-cloudflare-api.example.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
            'Content-Type': 'application/json',
          }),
          body: expect.any(String),
        }),
      );

      expect(result.output).toBe(responsePayload.choices[0].message.content);
    });

    it('Should pass through additional configuration parameters', async () => {
      const configWithPassthrough = {
        accountId: 'test-account',
        apiKey: 'test-key',
        temperature: 0.8,
        max_tokens: 1000,
        top_p: 0.9,
        // Cloudflare-specific parameters
        seed: 12345,
        repetition_penalty: 1.1,
        // Custom passthrough parameters
        custom_param: 'custom_value',
        another_param: 42,
      } as CloudflareAiConfig;

      const provider = new CloudflareAiChatCompletionProvider(testModelName, {
        config: configWithPassthrough,
      });

      const responsePayload = {
        choices: [
          {
            message: {
              content: 'Response with passthrough params',
            },
          },
        ],
        usage: {
          total_tokens: 50,
          prompt_tokens: 25,
          completion_tokens: 25,
        },
      };
      const mockResponse = {
        ...defaultMockResponse,
        text: jest.fn().mockResolvedValue(JSON.stringify(responsePayload)),
        ok: true,
      };

      mockFetch.mockResolvedValue(mockResponse);
      await provider.callApi('Test passthrough');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/chat/completions'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
            'Content-Type': 'application/json',
          }),
          body: expect.stringContaining('"custom_param":"custom_value"'),
        }),
      );

      // Verify the request body contains passthrough parameters
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.temperature).toBe(0.8);
      expect(requestBody.max_tokens).toBe(1000);
      expect(requestBody.top_p).toBe(0.9);
      expect(requestBody.seed).toBe(12345);
      expect(requestBody.repetition_penalty).toBe(1.1);
      expect(requestBody.custom_param).toBe('custom_value');
      expect(requestBody.another_param).toBe(42);

      // Verify Cloudflare-specific config keys are not in the request body
      expect(requestBody.accountId).toBeUndefined();
      expect(requestBody.apiKey).toBeUndefined();
      expect(requestBody.apiKeyEnvar).toBeUndefined();
      expect(requestBody.apiBaseUrl).toBeUndefined();
    });

    it('Should return proper provider identification methods', () => {
      const provider = new CloudflareAiChatCompletionProvider(testModelName, {
        config: cloudflareMinimumConfig,
      });

      expect(provider.id()).toBe(`cloudflare-ai:chat:${testModelName}`);
      expect(provider.toString()).toBe(`[Cloudflare AI chat Provider ${testModelName}]`);
      expect(provider.getApiKey()).toBe('testApiKey');
    });

    it('Should serialize to JSON properly', () => {
      const provider = new CloudflareAiChatCompletionProvider(testModelName, {
        config: cloudflareMinimumConfig,
      });

      const jsonOutput = provider.toJSON();
      expect(jsonOutput).toEqual({
        provider: 'cloudflare-ai',
        model: testModelName,
        modelType: 'chat',
        config: expect.objectContaining({
          apiKeyEnvar: 'CLOUDFLARE_API_KEY',
          apiBaseUrl: expect.stringContaining('cloudflare.com'),
        }),
      });
      // Verify API key is not included in JSON output for security
      expect(jsonOutput.config.apiKey).toBeUndefined();
    });

    it('Should use custom environment variable names', () => {
      process.env.CUSTOM_CF_ACCOUNT = 'custom-account-id';
      process.env.CUSTOM_CF_KEY = 'custom-api-key';

      const provider = new CloudflareAiChatCompletionProvider(testModelName, {
        config: {
          accountIdEnvar: 'CUSTOM_CF_ACCOUNT',
          apiKeyEnvar: 'CUSTOM_CF_KEY',
        },
      });

      expect(provider.getApiKey()).toBe('custom-api-key');

      // Clean up
      delete process.env.CUSTOM_CF_ACCOUNT;
      delete process.env.CUSTOM_CF_KEY;
    });

    it('requires API key', () => {
      expect(
        () =>
          new CloudflareAiChatCompletionProvider(testModelName, {
            config: { accountId: 'test-account' },
          }),
      ).toThrow('Cloudflare API token required');
    });

    it('uses accountIdEnvar when accountId not provided', () => {
      process.env.CUSTOM_ACCOUNT_VAR = 'env-account-from-custom-var';
      process.env.CLOUDFLARE_API_KEY = 'default-api-key';

      const provider = new CloudflareAiChatCompletionProvider(testModelName, {
        config: {
          accountIdEnvar: 'CUSTOM_ACCOUNT_VAR',
        },
      });

      expect(provider.id()).toBe(`cloudflare-ai:chat:${testModelName}`);

      // Clean up
      delete process.env.CUSTOM_ACCOUNT_VAR;
      delete process.env.CLOUDFLARE_API_KEY;
    });

    it('throws error when account ID environment variable does not exist', () => {
      expect(
        () =>
          new CloudflareAiChatCompletionProvider(testModelName, {
            config: {
              accountIdEnvar: 'NONEXISTENT_ACCOUNT_VAR',
              apiKey: 'test-key',
            },
          }),
      ).toThrow('Cloudflare account ID required');
    });

    it('throws error when API key environment variable does not exist', () => {
      expect(
        () =>
          new CloudflareAiChatCompletionProvider(testModelName, {
            config: {
              accountId: 'test-account',
              apiKeyEnvar: 'NONEXISTENT_KEY_VAR',
            },
          }),
      ).toThrow('Cloudflare API token required');
    });

    it('prioritizes explicit config over environment variables', () => {
      process.env.CLOUDFLARE_ACCOUNT_ID = 'env-account';
      process.env.CLOUDFLARE_API_KEY = 'env-key';

      const provider = new CloudflareAiChatCompletionProvider(testModelName, {
        config: {
          accountId: 'explicit-account',
          apiKey: 'explicit-key',
        },
      });

      expect(provider.getApiKey()).toBe('explicit-key');

      // Clean up
      delete process.env.CLOUDFLARE_ACCOUNT_ID;
      delete process.env.CLOUDFLARE_API_KEY;
    });

    it('handles missing config gracefully with environment fallback', () => {
      process.env.CLOUDFLARE_ACCOUNT_ID = 'fallback-account';
      process.env.CLOUDFLARE_API_KEY = 'fallback-key';

      const provider = new CloudflareAiChatCompletionProvider(testModelName, {});

      expect(provider.getApiKey()).toBe('fallback-key');
      expect(provider.id()).toBe(`cloudflare-ai:chat:${testModelName}`);

      // Clean up
      delete process.env.CLOUDFLARE_ACCOUNT_ID;
      delete process.env.CLOUDFLARE_API_KEY;
    });

    it('throws error when no configuration and no environment variables', () => {
      // Ensure environment variables are not set
      delete process.env.CLOUDFLARE_ACCOUNT_ID;
      delete process.env.CLOUDFLARE_API_KEY;

      expect(() => new CloudflareAiChatCompletionProvider(testModelName, {})).toThrow(
        'Cloudflare API token required',
      );
    });
  });

  describe('CloudflareAiCompletionProvider', () => {
    it('Should handle completion provider', async () => {
      const provider = new CloudflareAiCompletionProvider(testModelName, {
        config: cloudflareMinimumConfig,
      });

      const responsePayload = {
        choices: [
          {
            text: 'Test completion output',
          },
        ],
        usage: {
          total_tokens: 50,
          prompt_tokens: 25,
          completion_tokens: 25,
        },
      };
      const mockResponse = {
        ...defaultMockResponse,
        text: jest.fn().mockResolvedValue(JSON.stringify(responsePayload)),
        ok: true,
      };

      mockFetch.mockResolvedValue(mockResponse);
      const result = await provider.callApi('Test completion prompt');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.output).toBe(responsePayload.choices[0].text);
      expect(result.tokenUsage).toEqual(tokenUsageDefaultResponse);
      expect(provider.id()).toBe(`cloudflare-ai:completion:${testModelName}`);
      expect(provider.toString()).toBe(`[Cloudflare AI completion Provider ${testModelName}]`);

      // Check that the request uses the completions endpoint
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('completions'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer testApiKey',
          }),
          body: expect.stringContaining(testModelName),
        }),
      );
    });

    it('Should return proper provider identification methods', () => {
      const provider = new CloudflareAiCompletionProvider(testModelName, {
        config: cloudflareMinimumConfig,
      });

      expect(provider.id()).toBe(`cloudflare-ai:completion:${testModelName}`);
      expect(provider.toString()).toBe(`[Cloudflare AI completion Provider ${testModelName}]`);
      expect(provider.getApiKey()).toBe('testApiKey');
    });

    it('Should serialize to JSON properly', () => {
      const provider = new CloudflareAiCompletionProvider(testModelName, {
        config: cloudflareMinimumConfig,
      });

      const jsonOutput = provider.toJSON();
      expect(jsonOutput).toEqual({
        provider: 'cloudflare-ai',
        model: testModelName,
        modelType: 'completion',
        config: expect.objectContaining({
          apiKeyEnvar: 'CLOUDFLARE_API_KEY',
          apiBaseUrl: expect.stringContaining('cloudflare.com'),
        }),
      });
      // Verify API key is not included in JSON output for security
      expect(jsonOutput.config.apiKey).toBeUndefined();
    });

    it('Should handle passthrough parameters correctly', async () => {
      const configWithPassthrough = {
        accountId: 'test-account',
        apiKey: 'test-key',
        temperature: 0.5,
        max_tokens: 500,
        custom_completion_param: 'test_value',
      } as CloudflareAiConfig;

      const provider = new CloudflareAiCompletionProvider(testModelName, {
        config: configWithPassthrough,
      });

      const responsePayload = {
        choices: [{ text: 'Test completion with passthrough' }],
        usage: { total_tokens: 30, prompt_tokens: 15, completion_tokens: 15 },
      };
      const mockResponse = {
        ...defaultMockResponse,
        text: jest.fn().mockResolvedValue(JSON.stringify(responsePayload)),
        ok: true,
      };

      mockFetch.mockResolvedValue(mockResponse);
      await provider.callApi('Test completion passthrough');

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.temperature).toBe(0.5);
      expect(requestBody.max_tokens).toBe(500);
      expect(requestBody.custom_completion_param).toBe('test_value');
      // Verify provider-specific config is excluded
      expect(requestBody.accountId).toBeUndefined();
      expect(requestBody.apiKey).toBeUndefined();
    });
  });

  describe('CloudflareAiEmbeddingProvider', () => {
    it('Should return embeddings in the proper format', async () => {
      const provider = new CloudflareAiEmbeddingProvider(testModelName, {
        config: cloudflareMinimumConfig,
      });

      const responsePayload = {
        data: [
          {
            embedding: [0.02055364102125168, -0.013749595731496811, 0.0024201320484280586],
          },
        ],
        usage: {
          total_tokens: 50,
          prompt_tokens: 25,
        },
      };

      const mockResponse = {
        ...defaultMockResponse,
        text: jest.fn().mockResolvedValue(JSON.stringify(responsePayload)),
        ok: true,
      };

      mockFetch.mockResolvedValue(mockResponse);
      const result = await provider.callEmbeddingApi('Create embeddings from this');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.embedding).toEqual(responsePayload.data[0].embedding);
      expect(result.tokenUsage).toEqual({
        total: 50,
        prompt: 25,
        completion: 0,
        cached: undefined,
      });
    });

    it('Should return proper provider identification methods', () => {
      const provider = new CloudflareAiEmbeddingProvider(testModelName, {
        config: cloudflareMinimumConfig,
      });

      expect(provider.id()).toBe(`cloudflare-ai:embedding:${testModelName}`);
      expect(provider.toString()).toBe(`[Cloudflare AI embedding Provider ${testModelName}]`);
      expect(provider.getApiKey()).toBe('testApiKey');
    });

    it('Should serialize to JSON properly', () => {
      const provider = new CloudflareAiEmbeddingProvider(testModelName, {
        config: cloudflareMinimumConfig,
      });

      const jsonOutput = provider.toJSON();
      expect(jsonOutput).toEqual({
        provider: 'cloudflare-ai',
        model: testModelName,
        modelType: 'embedding',
        config: expect.objectContaining({
          apiKeyEnvar: 'CLOUDFLARE_API_KEY',
          apiBaseUrl: expect.stringContaining('cloudflare.com'),
        }),
      });
      // Verify API key is not included in JSON output for security
      expect(jsonOutput.config.apiKey).toBeUndefined();
    });

    it('Should handle passthrough parameters correctly', async () => {
      const configWithPassthrough = {
        accountId: 'test-account',
        apiKey: 'test-key',
        custom_embedding_param: 'embedding_value',
        pooling: 'mean',
      } as CloudflareAiConfig;

      const provider = new CloudflareAiEmbeddingProvider(testModelName, {
        config: configWithPassthrough,
      });

      const responsePayload = {
        data: [{ embedding: [0.1, 0.2, 0.3] }],
        usage: { total_tokens: 20, prompt_tokens: 20 },
      };
      const mockResponse = {
        ...defaultMockResponse,
        text: jest.fn().mockResolvedValue(JSON.stringify(responsePayload)),
        ok: true,
      };

      mockFetch.mockResolvedValue(mockResponse);
      await provider.callEmbeddingApi('Test embedding passthrough');

      // Verify the basic request structure
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('embeddings'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-key',
          }),
        }),
      );

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      // Verify base embedding parameters are present
      expect(requestBody.input).toBe('Test embedding passthrough');
      expect(requestBody.model).toBe(testModelName);
      // Verify provider-specific config is excluded
      expect(requestBody.accountId).toBeUndefined();
      expect(requestBody.apiKey).toBeUndefined();
    });

    it('Should use embeddings endpoint correctly', async () => {
      const provider = new CloudflareAiEmbeddingProvider(testModelName, {
        config: cloudflareMinimumConfig,
      });

      const responsePayload = {
        data: [{ embedding: [0.1, 0.2, 0.3] }],
        usage: { total_tokens: 15, prompt_tokens: 15 },
      };
      const mockResponse = {
        ...defaultMockResponse,
        text: jest.fn().mockResolvedValue(JSON.stringify(responsePayload)),
        ok: true,
      };

      mockFetch.mockResolvedValue(mockResponse);
      await provider.callEmbeddingApi('Test embedding endpoint');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('embeddings'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer testApiKey',
          }),
        }),
      );
    });
  });

  describe('createCloudflareAiProvider', () => {
    it('throws an error if no model name is provided', () => {
      expect(() => createCloudflareAiProvider('cloudflare-ai:chat:')).toThrow(
        'Model name is required',
      );
    });

    it('creates correct provider types', () => {
      const chatProvider = createCloudflareAiProvider('cloudflare-ai:chat:llama-3', {
        config: cloudflareMinimumConfig,
      });
      expect(chatProvider).toBeInstanceOf(CloudflareAiChatCompletionProvider);

      const completionProvider = createCloudflareAiProvider('cloudflare-ai:completion:llama-3', {
        config: cloudflareMinimumConfig,
      });
      expect(completionProvider).toBeInstanceOf(CloudflareAiCompletionProvider);

      const embeddingProvider = createCloudflareAiProvider('cloudflare-ai:embedding:bge-base', {
        config: cloudflareMinimumConfig,
      });
      expect(embeddingProvider).toBeInstanceOf(CloudflareAiEmbeddingProvider);

      const embeddingsProvider = createCloudflareAiProvider('cloudflare-ai:embeddings:bge-base', {
        config: cloudflareMinimumConfig,
      });
      expect(embeddingsProvider).toBeInstanceOf(CloudflareAiEmbeddingProvider);
    });

    it('throws error for unknown model types', () => {
      expect(() =>
        createCloudflareAiProvider('cloudflare-ai:unknown:model', {
          config: cloudflareMinimumConfig,
        }),
      ).toThrow('Unknown Cloudflare AI model type: unknown');
    });

    it('handles empty model name after splitting', () => {
      expect(() => createCloudflareAiProvider('cloudflare-ai:chat:', {})).toThrow(
        'Model name is required',
      );
    });

    it('handles model names with multiple colons correctly', () => {
      const provider = createCloudflareAiProvider('cloudflare-ai:chat:@cf/meta/llama-3:latest', {
        config: cloudflareMinimumConfig,
      });
      expect(provider).toBeInstanceOf(CloudflareAiChatCompletionProvider);
      expect(provider.id()).toBe('cloudflare-ai:chat:@cf/meta/llama-3:latest');
    });

    it('works with undefined options when environment variables are set', () => {
      process.env.CLOUDFLARE_ACCOUNT_ID = 'env-account';
      process.env.CLOUDFLARE_API_KEY = 'env-key';

      const provider = createCloudflareAiProvider('cloudflare-ai:chat:test-model', undefined);
      expect(provider).toBeInstanceOf(CloudflareAiChatCompletionProvider);

      // Clean up
      delete process.env.CLOUDFLARE_ACCOUNT_ID;
      delete process.env.CLOUDFLARE_API_KEY;
    });

    it('works with empty options object when environment variables are set', () => {
      process.env.CLOUDFLARE_ACCOUNT_ID = 'env-account';
      process.env.CLOUDFLARE_API_KEY = 'env-key';

      const provider = createCloudflareAiProvider('cloudflare-ai:chat:test-model', {});
      expect(provider).toBeInstanceOf(CloudflareAiChatCompletionProvider);

      // Clean up
      delete process.env.CLOUDFLARE_ACCOUNT_ID;
      delete process.env.CLOUDFLARE_API_KEY;
    });

    it('passes through provider options correctly', () => {
      const customOptions = {
        id: 'custom-provider-id',
        env: { CLOUDFLARE_API_KEY: 'custom-key' },
        config: cloudflareMinimumConfig,
      };

      const provider = createCloudflareAiProvider('cloudflare-ai:chat:test-model', customOptions);
      expect(provider).toBeInstanceOf(CloudflareAiChatCompletionProvider);
      expect(provider.id()).toBe('custom-provider-id');
    });
  });

  describe('Provider configuration validation', () => {
    it('requires account ID', () => {
      expect(
        () =>
          new CloudflareAiChatCompletionProvider(testModelName, {
            config: { apiKey: 'test-key' },
          }),
      ).toThrow('Cloudflare account ID required');
    });

    it('requires API key', () => {
      expect(
        () =>
          new CloudflareAiChatCompletionProvider(testModelName, {
            config: { accountId: 'test-account' },
          }),
      ).toThrow('Cloudflare API token required');
    });
  });
});
