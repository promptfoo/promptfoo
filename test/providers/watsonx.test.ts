import { WatsonXAI } from '@ibm-cloud/watsonx-ai';
import { BearerTokenAuthenticator, IamAuthenticator } from 'ibm-cloud-sdk-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache, getCache, isCacheEnabled } from '../../src/cache';
import * as envarsModule from '../../src/envars';
import logger from '../../src/logger';
import {
  clearModelSpecsCache,
  generateConfigHash,
  WatsonXChatProvider,
  WatsonXProvider,
} from '../../src/providers/watsonx';
import { createEmptyTokenUsage } from '../../src/util/tokenUsageUtils';

vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  getLogLevel: vi.fn().mockReturnValue('info'),
}));

vi.mock('@ibm-cloud/watsonx-ai', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    WatsonXAI: {
      newInstance: vi.fn(),
    },
  };
});

vi.mock('ibm-cloud-sdk-core', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    IamAuthenticator: vi.fn(),
    BearerTokenAuthenticator: vi.fn(),
  };
});

vi.mock('../../src/cache', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    getCache: vi.fn(),
    isCacheEnabled: vi.fn(),

    fetchWithCache: vi.fn().mockImplementation(async function () {
      return {
        data: {
          resources: [
            {
              model_id: 'meta-llama/llama-3-2-1b-instruct',
              input_tier: 'class_c1',
              output_tier: 'class_c1',
              label: 'llama-3-2-1b-instruct',
              provider: 'Meta',
              source: 'Hugging Face',
              model_limits: {
                max_sequence_length: 131072,
                max_output_tokens: 8192,
              },
            },
          ],
        },

        cached: false,
      };
    }),
  };
});

vi.mock('../../src/envars', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    getEnvString: vi.fn(),
    getEnvInt: vi.fn(),
  };
});

describe('WatsonXProvider', () => {
  const modelName = 'test-model';
  const config = {
    apiKey: 'test-api-key',
    projectId: 'test-project-id',
    modelId: 'test-model-id',
    maxNewTokens: 50,
  };
  const prompt = 'Test prompt';

  beforeEach(() => {
    vi.clearAllMocks();
    clearModelSpecsCache();
  });

  afterEach(() => {
    vi.clearAllMocks();
    clearModelSpecsCache();
  });

  describe('constructor', () => {
    it('should initialize with modelName and config', async () => {
      const mockedWatsonXAIClient: Partial<any> = {
        generateText: vi.fn(),
      };
      vi.mocked(WatsonXAI.newInstance).mockImplementation(function () {
        return mockedWatsonXAIClient as any;
      });

      const provider = new WatsonXProvider(modelName, { config });
      expect(provider.modelName).toBe(modelName);
      expect(provider.options.config).toEqual(config);

      // Get client to trigger authentication
      await provider.getClient();
      expect(logger.info).toHaveBeenCalledWith('Using IAM Authentication.');
    });

    it('should initialize with default id based on modelName', () => {
      const mockedWatsonXAIClient: Partial<any> = {
        generateText: vi.fn(),
      };
      vi.mocked(WatsonXAI.newInstance).mockImplementation(function () {
        return mockedWatsonXAIClient as any;
      });

      const provider = new WatsonXProvider(modelName, { config });
      expect(provider.id()).toBe(`watsonx:${modelName}`);
    });
  });

  describe('id', () => {
    it('should return the correct id string', () => {
      const mockedWatsonXAIClient: Partial<any> = {
        generateText: vi.fn(),
      };
      vi.mocked(WatsonXAI.newInstance).mockImplementation(function () {
        return mockedWatsonXAIClient as any;
      });

      const provider = new WatsonXProvider(modelName, { config });
      expect(provider.id()).toBe(`watsonx:${modelName}`);
    });
  });

  describe('toString', () => {
    it('should return the correct string representation', () => {
      const mockedWatsonXAIClient: Partial<any> = {
        generateText: vi.fn(),
      };
      vi.mocked(WatsonXAI.newInstance).mockImplementation(function () {
        return mockedWatsonXAIClient as any;
      });

      const provider = new WatsonXProvider(modelName, { config });
      expect(provider.toString()).toBe(`[Watsonx Provider ${modelName}]`);
    });
  });

  describe('getClient', () => {
    it('should initialize WatsonXAI client with correct parameters', async () => {
      const mockedWatsonXAIClient: Partial<any> = {
        generateText: vi.fn(),
      };
      vi.mocked(WatsonXAI.newInstance).mockImplementation(function () {
        return mockedWatsonXAIClient as any;
      });

      const provider = new WatsonXProvider(modelName, { config });
      const client = await provider.getClient();

      expect(WatsonXAI.newInstance).toHaveBeenCalledWith({
        version: '2023-05-29',
        serviceUrl: 'https://us-south.ml.cloud.ibm.com',
        authenticator: expect.any(IamAuthenticator),
      });

      expect(IamAuthenticator).toHaveBeenCalledWith({ apikey: 'test-api-key' });
      expect(client).toBe(mockedWatsonXAIClient);
    });

    it('should throw an error if neither API key nor Bearer Token is set', async () => {
      vi.spyOn(envarsModule, 'getEnvString').mockReturnValue(undefined as any);

      const provider = new WatsonXProvider(modelName, {
        config: { ...config, apiKey: undefined, apiBearerToken: undefined },
      });

      await expect(provider.getClient()).rejects.toThrow(
        /Authentication credentials not provided\. Please set either `WATSONX_AI_APIKEY` for IAM Authentication or `WATSONX_AI_BEARER_TOKEN` for Bearer Token Authentication\./,
      );
    });
  });

  describe('constructor with Bearer Token', () => {
    it('should use Bearer Token Authentication when apiKey is not provided', async () => {
      const bearerTokenConfig = {
        ...config,
        apiKey: undefined,
        apiBearerToken: 'test-bearer-token',
      };
      const mockedWatsonXAIClient: Partial<any> = {
        generateText: vi.fn(),
      };
      vi.mocked(WatsonXAI.newInstance).mockImplementation(function () {
        return mockedWatsonXAIClient as any;
      });

      const provider = new WatsonXProvider(modelName, { config: bearerTokenConfig });
      await provider.getClient();

      expect(logger.info).toHaveBeenCalledWith('Using Bearer Token Authentication.');
      expect(WatsonXAI.newInstance).toHaveBeenCalledWith({
        version: '2023-05-29',
        serviceUrl: 'https://us-south.ml.cloud.ibm.com',
        authenticator: expect.any(BearerTokenAuthenticator),
      });
    });

    it('should prefer API Key Authentication over Bearer Token Authentication when both are provided', async () => {
      const dualAuthConfig = { ...config, apiBearerToken: 'test-bearer-token' };
      const mockedWatsonXAIClient: Partial<any> = {
        generateText: vi.fn(),
      };
      vi.mocked(WatsonXAI.newInstance).mockImplementation(function () {
        return mockedWatsonXAIClient as any;
      });

      const provider = new WatsonXProvider(modelName, { config: dualAuthConfig });
      await provider.getClient();

      expect(logger.info).toHaveBeenCalledWith('Using IAM Authentication.');
      expect(WatsonXAI.newInstance).toHaveBeenCalledWith({
        version: '2023-05-29',
        serviceUrl: 'https://us-south.ml.cloud.ibm.com',
        authenticator: expect.any(IamAuthenticator),
      });
    });

    it('should use IAM Authentication when WATSONX_AI_AUTH_TYPE is set to iam', async () => {
      const dualAuthConfig = { ...config, apiBearerToken: 'test-bearer-token' };
      const mockedWatsonXAIClient: Partial<any> = {
        generateText: vi.fn(),
      };
      vi.mocked(WatsonXAI.newInstance).mockImplementation(function () {
        return mockedWatsonXAIClient as any;
      });

      const provider = new WatsonXProvider(modelName, {
        config: dualAuthConfig,
        env: { WATSONX_AI_AUTH_TYPE: 'iam' },
      });
      await provider.getClient();

      expect(logger.info).toHaveBeenCalledWith(
        'Using IAM Authentication based on WATSONX_AI_AUTH_TYPE.',
      );
      expect(WatsonXAI.newInstance).toHaveBeenCalledWith({
        version: '2023-05-29',
        serviceUrl: 'https://us-south.ml.cloud.ibm.com',
        authenticator: expect.any(IamAuthenticator),
      });
    });

    it('should use Bearer Token Authentication when WATSONX_AI_AUTH_TYPE is set to bearertoken', async () => {
      const dualAuthConfig = {
        ...config,
        apiKey: 'test-api-key',
        apiBearerToken: 'test-bearer-token',
      };
      const mockedWatsonXAIClient: Partial<any> = {
        generateText: vi.fn(),
      };
      vi.mocked(WatsonXAI.newInstance).mockImplementation(function () {
        return mockedWatsonXAIClient as any;
      });

      const provider = new WatsonXProvider(modelName, {
        config: dualAuthConfig,
        env: { WATSONX_AI_AUTH_TYPE: 'bearertoken' },
      });
      await provider.getClient();

      expect(logger.info).toHaveBeenCalledWith(
        'Using Bearer Token Authentication based on WATSONX_AI_AUTH_TYPE.',
      );
      expect(WatsonXAI.newInstance).toHaveBeenCalledWith({
        version: '2023-05-29',
        serviceUrl: 'https://us-south.ml.cloud.ibm.com',
        authenticator: expect.any(BearerTokenAuthenticator),
      });
    });

    it('should fallback to default behavior when WATSONX_AI_AUTH_TYPE is invalid', async () => {
      const dualAuthConfig = { ...config, apiBearerToken: 'test-bearer-token' };
      const mockedWatsonXAIClient: Partial<any> = {
        generateText: vi.fn(),
      };
      vi.mocked(WatsonXAI.newInstance).mockImplementation(function () {
        return mockedWatsonXAIClient as any;
      });

      const provider = new WatsonXProvider(modelName, {
        config: dualAuthConfig,
        env: { WATSONX_AI_AUTH_TYPE: 'invalid' },
      });
      await provider.getClient();

      expect(logger.info).toHaveBeenCalledWith('Using IAM Authentication.');
      expect(WatsonXAI.newInstance).toHaveBeenCalledWith({
        version: '2023-05-29',
        serviceUrl: 'https://us-south.ml.cloud.ibm.com',
        authenticator: expect.any(IamAuthenticator),
      });
    });
  });

  describe('callApi', () => {
    it('should call generateText with correct parameters and return the correct response', async () => {
      const mockedWatsonXAIClient: Partial<any> = {
        generateText: vi.fn().mockResolvedValue({
          result: {
            model_id: 'ibm/test-model',
            model_version: '1.0.0',
            created_at: '2023-10-10T00:00:00Z',
            results: [
              {
                generated_text: 'Test response from WatsonX',
                generated_token_count: 10,
                input_token_count: 5,
                stop_reason: 'max_tokens',
              },
            ],
          },
        }),
      };
      vi.mocked(WatsonXAI.newInstance).mockImplementation(function () {
        return mockedWatsonXAIClient as any;
      });

      const cache: Partial<any> = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
        wrap: vi.fn(),
        del: vi.fn(),
        reset: vi.fn(),
        store: {} as any,
      };

      vi.mocked(getCache).mockImplementation(function () {
        return cache as any;
      });
      vi.mocked(isCacheEnabled).mockImplementation(function () {
        return true;
      });

      const provider = new WatsonXProvider(modelName, { config });
      const response = await provider.callApi(prompt);
      expect(mockedWatsonXAIClient.generateText).toHaveBeenCalledWith({
        input: prompt,
        modelId: config.modelId,
        projectId: config.projectId,
        parameters: {
          max_new_tokens: config.maxNewTokens,
        },
      });

      expect(response).toEqual({
        error: undefined,
        output: 'Test response from WatsonX',
        tokenUsage: {
          total: 10,
          prompt: 5,
          completion: 5,
        },
        cost: undefined,
        cached: undefined,
        logProbs: undefined,
      });

      const cacheKey = vi.mocked(cache.set).mock.calls[0][0] as string;
      expect(cacheKey).toMatch(
        new RegExp(
          `^watsonx:${modelName}:${generateConfigHash(config)}:[a-f0-9]{64}:[a-f0-9]{64}$`,
        ),
      );
      expect(cacheKey).not.toContain(prompt);
      expect(cacheKey).not.toContain(config.apiKey);
      expect(cache.get).toHaveBeenCalledWith(cacheKey);
      expect(cache.set).toHaveBeenCalledWith(cacheKey, JSON.stringify(response));
    });

    it('should include configured auth mode in cache keys without exposing secrets', async () => {
      const mockedWatsonXAIClient: Partial<any> = {
        generateText: vi.fn().mockResolvedValue({
          result: {
            model_id: 'ibm/test-model',
            model_version: '1.0.0',
            created_at: '2023-10-10T00:00:00Z',
            results: [
              {
                generated_text: 'Credential-separated response',
                generated_token_count: 1,
                input_token_count: 1,
                stop_reason: 'max_tokens',
              },
            ],
          },
        }),
      };
      vi.mocked(WatsonXAI.newInstance).mockImplementation(function () {
        return mockedWatsonXAIClient as any;
      });

      const cache: Partial<any> = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
      };

      vi.mocked(getCache).mockImplementation(function () {
        return cache as any;
      });
      vi.mocked(isCacheEnabled).mockImplementation(function () {
        return true;
      });

      const apiKey = 'watsonx-config-secret-api-key';
      const bearerToken = 'watsonx-config-secret-bearer-token';
      await new WatsonXProvider(modelName, {
        config: { ...config, apiKey },
      }).callApi(prompt);
      await new WatsonXProvider(modelName, {
        config: { ...config, apiKey: undefined, apiBearerToken: bearerToken },
        env: { WATSONX_AI_AUTH_TYPE: 'bearertoken' },
      }).callApi(prompt);

      const firstCacheKey = vi.mocked(cache.set).mock.calls[0][0] as string;
      const secondCacheKey = vi.mocked(cache.set).mock.calls[1][0] as string;
      expect(firstCacheKey).not.toEqual(secondCacheKey);
      expect(firstCacheKey).not.toContain(apiKey);
      expect(secondCacheKey).not.toContain(bearerToken);
    });

    it('should include env-sourced auth mode in cache keys without exposing secrets', async () => {
      const mockedWatsonXAIClient: Partial<any> = {
        generateText: vi.fn().mockResolvedValue({
          result: {
            model_id: 'ibm/test-model',
            model_version: '1.0.0',
            created_at: '2023-10-10T00:00:00Z',
            results: [
              {
                generated_text: 'Env credential-separated response',
                generated_token_count: 1,
                input_token_count: 1,
                stop_reason: 'max_tokens',
              },
            ],
          },
        }),
      };
      vi.mocked(WatsonXAI.newInstance).mockImplementation(function () {
        return mockedWatsonXAIClient as any;
      });

      const cache: Partial<any> = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
      };

      vi.mocked(getCache).mockImplementation(function () {
        return cache as any;
      });
      vi.mocked(isCacheEnabled).mockImplementation(function () {
        return true;
      });

      const apiKey = 'watsonx-env-secret-api-key';
      const bearerToken = 'watsonx-env-secret-bearer-token';
      const envConfig = { ...config, apiKey: undefined };
      await new WatsonXProvider(modelName, {
        config: envConfig,
        env: { WATSONX_AI_APIKEY: apiKey },
      }).callApi(prompt);
      await new WatsonXProvider(modelName, {
        config: envConfig,
        env: {
          WATSONX_AI_BEARER_TOKEN: bearerToken,
          WATSONX_AI_AUTH_TYPE: 'bearertoken',
        },
      }).callApi(prompt);

      const firstCacheKey = vi.mocked(cache.set).mock.calls[0][0] as string;
      const secondCacheKey = vi.mocked(cache.set).mock.calls[1][0] as string;
      expect(firstCacheKey).not.toEqual(secondCacheKey);
      expect(firstCacheKey).not.toContain(apiKey);
      expect(secondCacheKey).not.toContain(bearerToken);
    });

    it('should separate cache keys for different same-mode credentials without exposing secrets', async () => {
      const mockedWatsonXAIClient: Partial<any> = {
        generateText: vi.fn().mockResolvedValue({
          result: {
            model_id: 'ibm/test-model',
            model_version: '1.0.0',
            created_at: '2023-10-10T00:00:00Z',
            results: [
              {
                generated_text: 'Same-mode credential-separated response',
                generated_token_count: 1,
                input_token_count: 1,
                stop_reason: 'max_tokens',
              },
            ],
          },
        }),
      };
      vi.mocked(WatsonXAI.newInstance).mockImplementation(function () {
        return mockedWatsonXAIClient as any;
      });

      const cache: Partial<any> = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
      };

      vi.mocked(getCache).mockImplementation(function () {
        return cache as any;
      });
      vi.mocked(isCacheEnabled).mockImplementation(function () {
        return true;
      });

      const apiKeyA = 'watsonx-config-secret-api-key-a';
      const apiKeyB = 'watsonx-config-secret-api-key-b';
      const bearerTokenA = 'watsonx-config-secret-bearer-token-a';
      const bearerTokenB = 'watsonx-config-secret-bearer-token-b';

      await new WatsonXProvider(modelName, {
        config: { ...config, apiKey: apiKeyA },
      }).callApi(prompt);
      await new WatsonXProvider(modelName, {
        config: { ...config, apiKey: apiKeyB },
      }).callApi(prompt);
      await new WatsonXProvider(modelName, {
        config: { ...config, apiKey: undefined, apiBearerToken: bearerTokenA },
      }).callApi(prompt);
      await new WatsonXProvider(modelName, {
        config: { ...config, apiKey: undefined, apiBearerToken: bearerTokenB },
      }).callApi(prompt);

      const iamKeyA = vi.mocked(cache.set).mock.calls[0][0] as string;
      const iamKeyB = vi.mocked(cache.set).mock.calls[1][0] as string;
      const bearerKeyA = vi.mocked(cache.set).mock.calls[2][0] as string;
      const bearerKeyB = vi.mocked(cache.set).mock.calls[3][0] as string;

      expect(iamKeyA).not.toEqual(iamKeyB);
      expect(bearerKeyA).not.toEqual(bearerKeyB);
      expect(iamKeyA).not.toContain(apiKeyA);
      expect(iamKeyB).not.toContain(apiKeyB);
      expect(bearerKeyA).not.toContain(bearerTokenA);
      expect(bearerKeyB).not.toContain(bearerTokenB);
    });

    it('should keep cache keys stable across provider instances with the same credentials', async () => {
      const mockedWatsonXAIClient: Partial<any> = {
        generateText: vi.fn().mockResolvedValue({
          result: {
            model_id: 'ibm/test-model',
            model_version: '1.0.0',
            created_at: '2023-10-10T00:00:00Z',
            results: [
              {
                generated_text: 'Stable credential response',
                generated_token_count: 1,
                input_token_count: 1,
                stop_reason: 'max_tokens',
              },
            ],
          },
        }),
      };
      vi.mocked(WatsonXAI.newInstance).mockImplementation(function () {
        return mockedWatsonXAIClient as any;
      });

      const cache: Partial<any> = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
      };

      vi.mocked(getCache).mockImplementation(function () {
        return cache as any;
      });
      vi.mocked(isCacheEnabled).mockImplementation(function () {
        return true;
      });

      const sharedApiKey = 'watsonx-shared-stable-api-key';
      await new WatsonXProvider(modelName, {
        config: { ...config, apiKey: sharedApiKey },
      }).callApi(prompt);
      await new WatsonXProvider(modelName, {
        config: { ...config, apiKey: sharedApiKey },
      }).callApi(prompt);

      const firstCacheKey = vi.mocked(cache.set).mock.calls[0][0] as string;
      const secondCacheKey = vi.mocked(cache.set).mock.calls[1][0] as string;
      expect(firstCacheKey).toEqual(secondCacheKey);
      expect(firstCacheKey).not.toContain(sharedApiKey);
    });

    it('should keep the cache auth hash tied to the memoized client credentials', async () => {
      const mockedWatsonXAIClient: Partial<any> = {
        generateText: vi.fn().mockResolvedValue({
          result: {
            model_id: 'ibm/test-model',
            model_version: '1.0.0',
            created_at: '2023-10-10T00:00:00Z',
            results: [
              {
                generated_text: 'Memoized credential response',
                generated_token_count: 1,
                input_token_count: 1,
                stop_reason: 'max_tokens',
              },
            ],
          },
        }),
      };
      vi.mocked(WatsonXAI.newInstance).mockImplementation(function () {
        return mockedWatsonXAIClient as any;
      });

      const cache: Partial<any> = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
      };

      vi.mocked(getCache).mockImplementation(function () {
        return cache as any;
      });
      vi.mocked(isCacheEnabled).mockImplementation(function () {
        return true;
      });

      const originalApiKey = 'watsonx-original-env-api-key';
      const rotatedApiKey = 'watsonx-rotated-env-api-key';
      const provider = new WatsonXProvider(modelName, {
        config: { ...config, apiKey: undefined },
        env: { WATSONX_AI_APIKEY: originalApiKey },
      });

      await provider.callApi(prompt);
      provider.env = { WATSONX_AI_APIKEY: rotatedApiKey };
      await provider.callApi(prompt);

      const firstCacheKey = vi.mocked(cache.set).mock.calls[0][0] as string;
      const secondCacheKey = vi.mocked(cache.set).mock.calls[1][0] as string;

      expect(firstCacheKey).toEqual(secondCacheKey);
      expect(firstCacheKey).not.toContain(originalApiKey);
      expect(secondCacheKey).not.toContain(rotatedApiKey);
      expect(WatsonXAI.newInstance).toHaveBeenCalledTimes(1);
      expect(IamAuthenticator).toHaveBeenCalledWith({ apikey: originalApiKey });
      expect(IamAuthenticator).not.toHaveBeenCalledWith({ apikey: rotatedApiKey });
    });

    it('should preserve an explicit maxNewTokens value of 0', async () => {
      const zeroConfig = {
        ...config,
        maxNewTokens: 0,
      };
      const mockedWatsonXAIClient: Partial<any> = {
        generateText: vi.fn().mockResolvedValue({
          result: {
            model_id: 'ibm/test-model',
            model_version: '1.0.0',
            created_at: '2023-10-10T00:00:00Z',
            results: [
              {
                generated_text: 'Test response from WatsonX',
                generated_token_count: 0,
                input_token_count: 5,
                stop_reason: 'max_tokens',
              },
            ],
          },
        }),
      };
      vi.mocked(WatsonXAI.newInstance).mockImplementation(function () {
        return mockedWatsonXAIClient as any;
      });

      vi.mocked(getCache).mockImplementation(() => null as any);
      vi.mocked(isCacheEnabled).mockImplementation(() => false);

      const provider = new WatsonXProvider(modelName, { config: zeroConfig });
      await provider.callApi(prompt);

      expect(mockedWatsonXAIClient.generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          parameters: expect.objectContaining({
            max_new_tokens: 0,
          }),
        }),
      );
    });

    it('should return cached response if available', async () => {
      // What's stored in the cache doesn't have cached: true
      const storedCachedData = {
        error: undefined,
        output: 'Cached response',
        tokenUsage: {
          total: 8,
          prompt: 3,
          completion: 5,
        },
        cost: undefined,
        cached: undefined,
        logProbs: undefined,
      };

      // But the response should have cached: true added
      const expectedResponse = {
        ...storedCachedData,
        cached: true,
      };

      const cache: Partial<any> = {
        get: vi.fn().mockResolvedValue(JSON.stringify(storedCachedData)),
        set: vi.fn(),
        wrap: vi.fn(),
        del: vi.fn(),
        reset: vi.fn(),
        store: {} as any,
      };

      vi.mocked(getCache).mockImplementation(function () {
        return cache as any;
      });
      vi.mocked(isCacheEnabled).mockImplementation(function () {
        return true;
      });

      // Must mock WatsonXAI.newInstance to ensure test isolation
      const mockedWatsonXAIClient: Partial<any> = {
        generateText: vi.fn(),
      };
      vi.mocked(WatsonXAI.newInstance).mockImplementation(function () {
        return mockedWatsonXAIClient as any;
      });

      const provider = new WatsonXProvider(modelName, { config });
      const generateTextSpy = vi.spyOn(await provider.getClient(), 'generateText');
      const response = await provider.callApi(prompt);
      const cacheKey = vi.mocked(cache.get).mock.calls[0][0] as string;
      const debugLogs = JSON.stringify(vi.mocked(logger.debug).mock.calls);
      expect(cacheKey).toMatch(
        new RegExp(
          `^watsonx:${modelName}:${generateConfigHash(config)}:[a-f0-9]{64}:[a-f0-9]{64}$`,
        ),
      );
      expect(cacheKey).not.toContain(prompt);
      expect(cacheKey).not.toContain(config.apiKey);
      expect(debugLogs).not.toContain(prompt);
      expect(debugLogs).not.toContain(storedCachedData.output);
      expect(cache.get).toHaveBeenCalledWith(cacheKey);
      expect(response).toEqual(expectedResponse);
      expect(generateTextSpy).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      const mockedWatsonXAIClient: Partial<any> = {
        generateText: vi.fn().mockRejectedValue(new Error('API error')),
      };
      vi.mocked(WatsonXAI.newInstance).mockImplementation(function () {
        return mockedWatsonXAIClient as any;
      });
      const cache: Partial<any> = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
        wrap: vi.fn(),
        del: vi.fn(),
        reset: vi.fn(),
        store: {} as any,
      };

      vi.mocked(getCache).mockImplementation(function () {
        return cache as any;
      });
      vi.mocked(isCacheEnabled).mockImplementation(function () {
        return true;
      });
      const provider = new WatsonXProvider(modelName, { config });
      const response = await provider.callApi(prompt);
      expect(response).toEqual({
        error: 'API call error: Error: API error',
        output: '',
        tokenUsage: createEmptyTokenUsage(),
      });
      expect(logger.error).toHaveBeenCalledWith('Watsonx: API call error: Error: API error');
    });
  });

  describe('calculateWatsonXCost', () => {
    const MODEL_ID = 'meta-llama/llama-3-3-70b-instruct';
    const configWithModelId = {
      ...config,
      modelId: MODEL_ID,
    };

    beforeEach(() => {
      vi.clearAllMocks();
      clearModelSpecsCache();
      vi.mocked(fetchWithCache).mockImplementation(async function () {
        return {
          data: {
            resources: [
              {
                model_id: MODEL_ID,
                input_tier: 'class_c1',
                output_tier: 'class_c1',
                label: 'llama-3-3-70b-instruct',
                provider: 'Meta',
                source: 'Hugging Face',
                model_limits: {
                  max_sequence_length: 131072,
                  max_output_tokens: 8192,
                },
              },
            ],
          },

          cached: false,
          status: 200,
          statusText: 'OK',
          headers: {},
        };
      });
    });

    it('should calculate cost correctly when token counts are provided', async () => {
      const mockedWatsonXAIClient: Partial<any> = {
        generateText: vi.fn().mockResolvedValue({
          result: {
            model_id: MODEL_ID,
            model_version: '3.2.0',
            created_at: '2024-03-25T00:00:00Z',
            results: [
              {
                generated_text: 'Test response',
                generated_token_count: 100,
                input_token_count: 50,
                stop_reason: 'max_tokens',
              },
            ],
          },
        }),
      };
      vi.mocked(WatsonXAI.newInstance).mockImplementation(function () {
        return mockedWatsonXAIClient as any;
      });

      const cache: Partial<any> = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
      };

      vi.mocked(getCache).mockImplementation(function () {
        return cache as any;
      });
      vi.mocked(isCacheEnabled).mockImplementation(function () {
        return true;
      });

      const provider = new WatsonXProvider(MODEL_ID, { config: configWithModelId });
      const response = await provider.callApi(prompt);

      expect(response.cost).toBeDefined();
      expect(typeof response.cost).toBe('number');
      // For class_c1 tier ($0.0001 per 1M tokens)
      // Input: 50 tokens * $0.0001/1M = 0.000005
      // Output: (generated_token_count - input_token_count) = (100 - 50) = 50 tokens
      // Output cost: 50 tokens * $0.0001/1M = 0.000005
      // Total expected: 0.00001
      expect(response.cost).toBeCloseTo(0.00001, 6);
    });

    it('should calculate cost correctly for class_9 tier', async () => {
      const modelId = 'meta-llama/llama-3-2-11b-vision-instruct';
      const configWithClass9ModelId = { ...config, modelId };

      clearModelSpecsCache();
      vi.mocked(fetchWithCache).mockImplementation(async function () {
        return {
          data: {
            resources: [
              {
                model_id: modelId,
                label: 'llama-3-2-11b-vision-instruct',
                provider: 'Meta',
                source: 'Hugging Face',
                functions: [{ id: 'image_chat' }, { id: 'text_chat' }, { id: 'text_generation' }],
                input_tier: 'class_9',
                output_tier: 'class_9',
                number_params: '11b',
                model_limits: {
                  max_sequence_length: 131072,
                  max_output_tokens: 8192,
                },
              },
            ],
          },

          cached: false,
          status: 200,
          statusText: 'OK',
          headers: {},
        };
      });

      const mockedWatsonXAIClient: Partial<any> = {
        generateText: vi.fn().mockResolvedValue({
          result: {
            model_id: modelId,
            model_version: '3.2.0',
            created_at: '2024-03-25T00:00:00Z',
            results: [
              {
                generated_text: 'Test response',
                generated_token_count: 100,
                input_token_count: 50,
                stop_reason: 'max_tokens',
              },
            ],
          },
        }),
      };
      vi.mocked(WatsonXAI.newInstance).mockImplementation(function () {
        return mockedWatsonXAIClient as any;
      });

      const cache: Partial<any> = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
      };

      vi.mocked(getCache).mockImplementation(function () {
        return cache as any;
      });
      vi.mocked(isCacheEnabled).mockImplementation(function () {
        return true;
      });

      const provider = new WatsonXProvider(modelId, { config: configWithClass9ModelId });
      const response = await provider.callApi(prompt);

      expect(response.cost).toBeDefined();
      expect(typeof response.cost).toBe('number');
      // For class_9 tier ($0.00035 per 1M tokens):
      // input_token_count = 50
      // generated_token_count = 100, so completion/output tokens = 100 - 50 = 50
      // Input: 50 tokens * $0.00035/1M = 0.0000175
      // Output: 50 tokens * $0.00035/1M = 0.0000175
      // Total expected: 0.000035
      expect(response.cost).toBeCloseTo(0.000035, 6);
    });

    it('should calculate cost correctly for newer Granite models', async () => {
      const modelId = 'ibm/granite-3-3-8b-instruct';
      const configWithGraniteModelId = { ...config, modelId };

      clearModelSpecsCache();
      vi.mocked(fetchWithCache).mockImplementation(async function () {
        return {
          data: {
            resources: [
              {
                model_id: modelId,
                label: 'granite-3-3-8b-instruct',
                provider: 'IBM',
                source: 'IBM',
                functions: [{ id: 'text_chat' }, { id: 'text_generation' }],
                input_tier: 'class_c1',
                output_tier: 'class_c1',
                number_params: '8b',
                model_limits: {
                  max_sequence_length: 8192,
                  max_output_tokens: 4096,
                },
              },
            ],
          },

          cached: false,
          status: 200,
          statusText: 'OK',
          headers: {},
        };
      });

      const mockedWatsonXAIClient: Partial<any> = {
        generateText: vi.fn().mockResolvedValue({
          result: {
            model_id: modelId,
            model_version: '3.3.0',
            created_at: '2024-10-01T00:00:00Z',
            results: [
              {
                generated_text: 'Test response from Granite',
                generated_token_count: 100,
                input_token_count: 50,
                stop_reason: 'max_tokens',
              },
            ],
          },
        }),
      };
      vi.mocked(WatsonXAI.newInstance).mockImplementation(function () {
        return mockedWatsonXAIClient as any;
      });

      const cache: Partial<any> = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
      };

      vi.mocked(getCache).mockImplementation(function () {
        return cache as any;
      });
      vi.mocked(isCacheEnabled).mockImplementation(function () {
        return true;
      });

      const provider = new WatsonXProvider(modelId, { config: configWithGraniteModelId });
      const response = await provider.callApi(prompt);

      expect(response.cost).toBeDefined();
      expect(typeof response.cost).toBe('number');
      // For class_c1 tier ($0.0001 per 1M tokens)
      // input_token_count = 50
      // generated_token_count = 100, so completion/output tokens = 100 - 50 = 50
      // Input: 50 tokens * $0.0001/1M = 0.000005
      // Output: 50 tokens * $0.0001/1M = 0.000005
      // Total expected: 0.00001
      expect(response.cost).toBeCloseTo(0.00001, 6);
    });
  });

  describe('Enhanced Text Generation Parameters', () => {
    it('should pass temperature parameter to API', async () => {
      const configWithTemperature = {
        ...config,
        temperature: 0.7,
      };

      const mockedWatsonXAIClient: Partial<any> = {
        generateText: vi.fn().mockResolvedValue({
          result: {
            model_id: 'test-model',
            model_version: '1.0.0',
            created_at: '2023-10-10T00:00:00Z',
            results: [
              {
                generated_text: 'Test response',
                generated_token_count: 10,
                input_token_count: 5,
                stop_reason: 'max_tokens',
              },
            ],
          },
        }),
      };
      vi.mocked(WatsonXAI.newInstance).mockImplementation(function () {
        return mockedWatsonXAIClient as any;
      });

      const cache: Partial<any> = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
      };

      vi.mocked(getCache).mockImplementation(function () {
        return cache as any;
      });
      vi.mocked(isCacheEnabled).mockImplementation(function () {
        return true;
      });

      const provider = new WatsonXProvider(modelName, { config: configWithTemperature });
      await provider.callApi(prompt);

      expect(mockedWatsonXAIClient.generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          parameters: expect.objectContaining({
            temperature: 0.7,
          }),
        }),
      );
    });

    it('should pass stop_sequences parameter to API', async () => {
      const configWithStopSequences = {
        ...config,
        stopSequences: ['END', 'STOP'],
      };

      const mockedWatsonXAIClient: Partial<any> = {
        generateText: vi.fn().mockResolvedValue({
          result: {
            model_id: 'test-model',
            model_version: '1.0.0',
            created_at: '2023-10-10T00:00:00Z',
            results: [
              {
                generated_text: 'Test response',
                generated_token_count: 10,
                input_token_count: 5,
                stop_reason: 'max_tokens',
              },
            ],
          },
        }),
      };
      vi.mocked(WatsonXAI.newInstance).mockImplementation(function () {
        return mockedWatsonXAIClient as any;
      });

      const cache: Partial<any> = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
      };

      vi.mocked(getCache).mockImplementation(function () {
        return cache as any;
      });
      vi.mocked(isCacheEnabled).mockImplementation(function () {
        return true;
      });

      const provider = new WatsonXProvider(modelName, { config: configWithStopSequences });
      await provider.callApi(prompt);

      expect(mockedWatsonXAIClient.generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          parameters: expect.objectContaining({
            stop_sequences: ['END', 'STOP'],
          }),
        }),
      );
    });

    it('should pass all text generation parameters to API', async () => {
      const fullConfig = {
        ...config,
        temperature: 0.8,
        topP: 0.9,
        topK: 50,
        decodingMethod: 'sample' as const,
        repetitionPenalty: 1.1,
        minNewTokens: 10,
        randomSeed: 42,
      };

      const mockedWatsonXAIClient: Partial<any> = {
        generateText: vi.fn().mockResolvedValue({
          result: {
            model_id: 'test-model',
            model_version: '1.0.0',
            created_at: '2023-10-10T00:00:00Z',
            results: [
              {
                generated_text: 'Test response',
                generated_token_count: 10,
                input_token_count: 5,
                stop_reason: 'max_tokens',
              },
            ],
          },
        }),
      };
      vi.mocked(WatsonXAI.newInstance).mockImplementation(function () {
        return mockedWatsonXAIClient as any;
      });

      const cache: Partial<any> = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
      };

      vi.mocked(getCache).mockImplementation(function () {
        return cache as any;
      });
      vi.mocked(isCacheEnabled).mockImplementation(function () {
        return true;
      });

      const provider = new WatsonXProvider(modelName, { config: fullConfig });
      await provider.callApi(prompt);

      expect(mockedWatsonXAIClient.generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          parameters: expect.objectContaining({
            temperature: 0.8,
            top_p: 0.9,
            top_k: 50,
            decoding_method: 'sample',
            repetition_penalty: 1.1,
            min_new_tokens: 10,
            random_seed: 42,
          }),
        }),
      );
    });

    it('should merge prompt-level config with provider config', async () => {
      const providerConfig = {
        ...config,
        temperature: 0.5,
      };

      const mockedWatsonXAIClient: Partial<any> = {
        generateText: vi.fn().mockResolvedValue({
          result: {
            model_id: 'test-model',
            model_version: '1.0.0',
            created_at: '2023-10-10T00:00:00Z',
            results: [
              {
                generated_text: 'Test response',
                generated_token_count: 10,
                input_token_count: 5,
                stop_reason: 'max_tokens',
              },
            ],
          },
        }),
      };
      vi.mocked(WatsonXAI.newInstance).mockImplementation(function () {
        return mockedWatsonXAIClient as any;
      });

      const cache: Partial<any> = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
      };

      vi.mocked(getCache).mockImplementation(function () {
        return cache as any;
      });
      vi.mocked(isCacheEnabled).mockImplementation(function () {
        return true;
      });

      const provider = new WatsonXProvider(modelName, { config: providerConfig });

      // Call with prompt-level config override
      await provider.callApi(prompt, {
        prompt: {
          raw: prompt,
          label: 'test',
          config: { temperature: 0.9 },
        },
        vars: {},
      });

      // Prompt-level config should override provider config
      expect(mockedWatsonXAIClient.generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          parameters: expect.objectContaining({
            temperature: 0.9,
          }),
        }),
      );
    });
  });
});

describe('WatsonXChatProvider', () => {
  const modelName = 'test-model';
  const config = {
    apiKey: 'test-api-key',
    projectId: 'test-project-id',
    modelId: 'test-model-id',
    maxNewTokens: 50,
  };
  const prompt = 'Test prompt';

  beforeEach(() => {
    vi.clearAllMocks();
    clearModelSpecsCache();
  });

  afterEach(() => {
    vi.clearAllMocks();
    clearModelSpecsCache();
  });

  it('should parse JSON chat messages and call textChat', async () => {
    const chatPrompt = JSON.stringify([
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'Hello' },
    ]);

    const mockedWatsonXAIClient: Partial<any> = {
      generateText: vi.fn(),
      textChat: vi.fn().mockResolvedValue({
        result: {
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Hello! How can I help you?',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 8,
            total_tokens: 18,
          },
        },
      }),
    };
    vi.mocked(WatsonXAI.newInstance).mockImplementation(function () {
      return mockedWatsonXAIClient as any;
    });

    const cache: Partial<any> = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
    };

    vi.mocked(getCache).mockImplementation(function () {
      return cache as any;
    });
    vi.mocked(isCacheEnabled).mockImplementation(function () {
      return true;
    });

    const provider = new WatsonXChatProvider(modelName, { config });
    const response = await provider.callApi(chatPrompt);

    expect(mockedWatsonXAIClient.textChat).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hello' },
        ],
      }),
    );

    expect(response.output).toBe('Hello! How can I help you?');
    expect(response.tokenUsage).toEqual({
      prompt: 10,
      completion: 8,
      total: 18,
    });
  });

  it('should fall back to user message for plain text', async () => {
    const mockedWatsonXAIClient: Partial<any> = {
      generateText: vi.fn(),
      textChat: vi.fn().mockResolvedValue({
        result: {
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Response to plain text',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 5,
            completion_tokens: 4,
            total_tokens: 9,
          },
        },
      }),
    };
    vi.mocked(WatsonXAI.newInstance).mockImplementation(function () {
      return mockedWatsonXAIClient as any;
    });

    const cache: Partial<any> = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
    };

    vi.mocked(getCache).mockImplementation(function () {
      return cache as any;
    });
    vi.mocked(isCacheEnabled).mockImplementation(function () {
      return true;
    });

    const chatPrompt = 'PFQA_WATSONX_CHAT_PROMPT_SENTINEL';
    const provider = new WatsonXChatProvider(modelName, { config });
    await provider.callApi(chatPrompt);

    expect(mockedWatsonXAIClient.textChat).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'user', content: chatPrompt }],
      }),
    );
    const cacheKey = vi.mocked(cache.set).mock.calls[0][0] as string;
    expect(cacheKey).toMatch(
      new RegExp(
        `^watsonx:chat:${modelName}:${generateConfigHash(config)}:[a-f0-9]{64}:[a-f0-9]{64}$`,
      ),
    );
    expect(cacheKey).not.toContain(chatPrompt);
    expect(cacheKey).not.toContain(config.apiKey);
  });

  it('should keep chat cache auth hash tied to the memoized client credentials', async () => {
    const mockedWatsonXAIClient: Partial<any> = {
      generateText: vi.fn(),
      textChat: vi.fn().mockResolvedValue({
        result: {
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Memoized chat credential response',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 5,
            completion_tokens: 4,
            total_tokens: 9,
          },
        },
      }),
    };
    vi.mocked(WatsonXAI.newInstance).mockImplementation(function () {
      return mockedWatsonXAIClient as any;
    });

    const cache: Partial<any> = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
    };

    vi.mocked(getCache).mockImplementation(function () {
      return cache as any;
    });
    vi.mocked(isCacheEnabled).mockImplementation(function () {
      return true;
    });

    const originalApiKey = 'watsonx-original-chat-env-api-key';
    const rotatedApiKey = 'watsonx-rotated-chat-env-api-key';
    const provider = new WatsonXChatProvider(modelName, {
      config: { ...config, apiKey: undefined },
      env: { WATSONX_AI_APIKEY: originalApiKey },
    });

    await provider.callApi(prompt);
    provider.env = { WATSONX_AI_APIKEY: rotatedApiKey };
    await provider.callApi(prompt);

    const firstCacheKey = vi.mocked(cache.set).mock.calls[0][0] as string;
    const secondCacheKey = vi.mocked(cache.set).mock.calls[1][0] as string;

    expect(firstCacheKey).toEqual(secondCacheKey);
    expect(firstCacheKey).not.toContain(originalApiKey);
    expect(secondCacheKey).not.toContain(rotatedApiKey);
    expect(WatsonXAI.newInstance).toHaveBeenCalledTimes(1);
    expect(IamAuthenticator).toHaveBeenCalledWith({ apikey: originalApiKey });
    expect(IamAuthenticator).not.toHaveBeenCalledWith({ apikey: rotatedApiKey });
  });

  it('should handle API errors gracefully', async () => {
    const mockedWatsonXAIClient: Partial<any> = {
      generateText: vi.fn(),
      textChat: vi.fn().mockRejectedValue(new Error('Chat API error')),
    };
    vi.mocked(WatsonXAI.newInstance).mockImplementation(function () {
      return mockedWatsonXAIClient as any;
    });

    const cache: Partial<any> = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
    };

    vi.mocked(getCache).mockImplementation(function () {
      return cache as any;
    });
    vi.mocked(isCacheEnabled).mockImplementation(function () {
      return true;
    });

    const provider = new WatsonXChatProvider(modelName, { config });
    const response = await provider.callApi(prompt);

    expect(response).toEqual({
      error: 'API call error: Error: Chat API error',
      output: '',
      tokenUsage: createEmptyTokenUsage(),
    });
    expect(logger.error).toHaveBeenCalledWith(
      'Watsonx Chat: API call error: Error: Chat API error',
    );
  });

  it('should pass temperature and other parameters to textChat', async () => {
    const configWithParams = {
      ...config,
      temperature: 0.7,
      topP: 0.9,
      stopSequences: ['END'],
    };

    const mockedWatsonXAIClient: Partial<any> = {
      generateText: vi.fn(),
      textChat: vi.fn().mockResolvedValue({
        result: {
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Response',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 5,
            completion_tokens: 1,
            total_tokens: 6,
          },
        },
      }),
    };
    vi.mocked(WatsonXAI.newInstance).mockImplementation(function () {
      return mockedWatsonXAIClient as any;
    });

    const cache: Partial<any> = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
    };

    vi.mocked(getCache).mockImplementation(function () {
      return cache as any;
    });
    vi.mocked(isCacheEnabled).mockImplementation(function () {
      return true;
    });

    const provider = new WatsonXChatProvider(modelName, { config: configWithParams });
    await provider.callApi(prompt);

    expect(mockedWatsonXAIClient.textChat).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.7,
        topP: 0.9,
        stop: ['END'],
      }),
    );
  });
});
