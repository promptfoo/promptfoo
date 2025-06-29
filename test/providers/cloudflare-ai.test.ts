import { clearCache, enableCache } from '../../src/cache';
import {
  CloudflareAiChatCompletionProvider,
  CloudflareAiCompletionProvider,
  CloudflareAiEmbeddingProvider,
  createCloudflareAiProvider,
  type CloudflareAiConfig,
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
              content: 'Test response with custom API base URL',
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
      await provider.callApi('Test prompt with custom URL');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      // Verify that the custom API base URL is used in the request
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('custom-cloudflare-api.example.com'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-key',
          }),
        }),
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
