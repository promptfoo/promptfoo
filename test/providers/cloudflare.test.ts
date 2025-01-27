import { clearCache, disableCache, enableCache } from '../../src/cache';
import { loadApiProviders } from '../../src/providers';
import {
  CloudflareAiChatCompletionProvider,
  CloudflareAiCompletionProvider,
  CloudflareAiEmbeddingProvider,
  type ICloudflareProviderBaseConfig,
  type ICloudflareTextGenerationResponse,
  type ICloudflareEmbeddingResponse,
  type ICloudflareProviderConfig,
} from '../../src/providers/cloudflare-ai';
import type { ProviderOptionsMap } from '../../src/types';

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

describe('CloudflareAi', () => {
  beforeAll(() => {
    enableCache();
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await clearCache();
  });

  const cloudflareMinimumConfig: Required<
    Pick<ICloudflareProviderBaseConfig, 'accountId' | 'apiKey'>
  > = {
    accountId: 'testAccountId',
    apiKey: 'testApiKey',
  };

  const testModelName = '@cf/meta/llama-2-7b-chat-fp16';
  // Token usage is not implemented for cloudflare so this is the default that
  // is returned
  const tokenUsageDefaultResponse = {
    total: undefined,
    prompt: undefined,
    completion: undefined,
  };

  describe('CloudflareAiCompletionProvider', () => {
    it('callApi with caching enabled', async () => {
      const PROMPT = 'Test prompt for caching';
      const provider = new CloudflareAiCompletionProvider(testModelName, {
        config: cloudflareMinimumConfig,
      });

      const responsePayload: ICloudflareTextGenerationResponse = {
        success: true,
        errors: [],
        messages: [],
        result: {
          response: 'Test text output',
        },
      };
      const mockResponse = {
        ...defaultMockResponse,
        text: jest.fn().mockResolvedValue(JSON.stringify(responsePayload)),
        ok: true,
      };

      mockFetch.mockResolvedValue(mockResponse);
      const result = await provider.callApi(PROMPT);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.output).toBe(responsePayload.result.response);
      expect(result.tokenUsage).toEqual(tokenUsageDefaultResponse);

      const resultFromCache = await provider.callApi(PROMPT);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(resultFromCache.output).toBe(responsePayload.result.response);
      expect(resultFromCache.tokenUsage).toEqual(tokenUsageDefaultResponse);
    });

    it('callApi with caching disabled', async () => {
      const PROMPT = 'test prompt without caching';
      try {
        disableCache();
        const provider = new CloudflareAiCompletionProvider(testModelName, {
          config: cloudflareMinimumConfig,
        });

        const responsePayload: ICloudflareTextGenerationResponse = {
          success: true,
          errors: [],
          messages: [],
          result: {
            response: 'Test text output',
          },
        };
        const mockResponse = {
          ...defaultMockResponse,
          text: jest.fn().mockResolvedValue(JSON.stringify(responsePayload)),
          ok: true,
        };

        mockFetch.mockResolvedValue(mockResponse);
        const result = await provider.callApi(PROMPT);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(result.output).toBe(responsePayload.result.response);
        expect(result.tokenUsage).toEqual(tokenUsageDefaultResponse);

        const resultFromCache = await provider.callApi(PROMPT);
        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(resultFromCache.output).toBe(responsePayload.result.response);
        expect(resultFromCache.tokenUsage).toEqual(tokenUsageDefaultResponse);
      } finally {
        enableCache();
      }
    });

    it('callApi handles cloudflare error properly', async () => {
      const PROMPT = 'Test prompt for caching';
      const provider = new CloudflareAiCompletionProvider(testModelName, {
        config: cloudflareMinimumConfig,
      });

      const responsePayload: ICloudflareTextGenerationResponse = {
        success: false,
        errors: ['Some error occurred'],
        messages: [],
      };
      const mockResponse = {
        ...defaultMockResponse,
        text: jest.fn().mockResolvedValue(JSON.stringify(responsePayload)),
        ok: true,
      };

      mockFetch.mockResolvedValue(mockResponse);
      const result = await provider.callApi(PROMPT);

      expect(result.error).toContain(JSON.stringify(responsePayload.errors));
    });

    it('Can be invoked with custom configuration', async () => {
      const cloudflareChatConfig: ICloudflareProviderConfig = {
        accountId: 'MADE_UP_ACCOUNT_ID',
        apiKey: 'MADE_UP_API_KEY',
        frequency_penalty: 10,
      };
      const rawProviderConfigs: ProviderOptionsMap[] = [
        {
          [`cloudflare-ai:completion:${testModelName}`]: {
            config: cloudflareChatConfig,
          },
        },
      ];

      const providers = await loadApiProviders(rawProviderConfigs);
      expect(providers).toHaveLength(1);
      expect(providers[0]).toBeInstanceOf(CloudflareAiCompletionProvider);

      const cfProvider = providers[0] as CloudflareAiCompletionProvider;
      expect(cfProvider.config).toEqual(cloudflareChatConfig);

      const PROMPT = 'Test prompt for custom configuration';

      const responsePayload: ICloudflareTextGenerationResponse = {
        success: true,
        errors: [],
        messages: [],
        result: {
          response: 'Test text output',
        },
      };
      const mockResponse = {
        ...defaultMockResponse,
        text: jest.fn().mockResolvedValue(JSON.stringify(responsePayload)),
        ok: true,
      };

      mockFetch.mockResolvedValue(mockResponse);
      await cfProvider.callApi(PROMPT);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(`"prompt":"${PROMPT}"`),
        }),
      );

      const { accountId: _accountId, apiKey: _apiKey, ...passThroughConfig } = cloudflareChatConfig;
      const { prompt: _prompt, ...bodyWithoutPrompt } = JSON.parse(
        jest.mocked(mockFetch).mock.calls[0][1].body as string,
      );
      expect(bodyWithoutPrompt).toEqual(passThroughConfig);
    });
  });

  describe('CloudflareAiChatCompletionProvider', () => {
    it('Should handle chat provider', async () => {
      const provider = new CloudflareAiChatCompletionProvider(testModelName, {
        config: cloudflareMinimumConfig,
      });

      const responsePayload: ICloudflareTextGenerationResponse = {
        success: true,
        errors: [],
        messages: [],
        result: {
          response: 'Test text output',
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
      expect(result.output).toBe(responsePayload.result.response);
      expect(result.tokenUsage).toEqual(tokenUsageDefaultResponse);
    });
  });

  describe('CloudflareAiEmbeddingProvider', () => {
    it('Should return embeddings in the proper format', async () => {
      const provider = new CloudflareAiEmbeddingProvider(testModelName, {
        config: cloudflareMinimumConfig,
      });

      const responsePayload: ICloudflareEmbeddingResponse = {
        success: true,
        errors: [],
        messages: [],
        result: {
          shape: [1, 3],
          data: [[0.02055364102125168, -0.013749595731496811, 0.0024201320484280586]],
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
      expect(result.embedding).toEqual(responsePayload.result.data[0]);
      expect(result.tokenUsage).toEqual(tokenUsageDefaultResponse);
    });
  });
});
