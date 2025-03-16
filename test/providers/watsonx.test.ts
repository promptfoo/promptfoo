import { WatsonXAI } from '@ibm-cloud/watsonx-ai';
import { IamAuthenticator, BearerTokenAuthenticator } from 'ibm-cloud-sdk-core';
import { getCache, isCacheEnabled, fetchWithCache } from '../../src/cache';
import * as envarsModule from '../../src/envars';
import logger from '../../src/logger';
import {
  WatsonXProvider,
  generateConfigHash,
  clearModelSpecsCache,
} from '../../src/providers/watsonx';

jest.mock('@ibm-cloud/watsonx-ai', () => ({
  WatsonXAI: {
    newInstance: jest.fn(),
  },
}));

jest.mock('ibm-cloud-sdk-core', () => ({
  IamAuthenticator: jest.fn(),
  BearerTokenAuthenticator: jest.fn(),
}));

jest.mock('../../src/cache', () => ({
  getCache: jest.fn(),
  isCacheEnabled: jest.fn(),
  fetchWithCache: jest.fn().mockImplementation(async () => ({
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
  })),
}));

jest.mock('../../src/envars', () => ({
  getEnvString: jest.fn(),
  getEnvInt: jest.fn(),
}));

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
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with modelName and config', async () => {
      const mockedWatsonXAIClient: Partial<any> = {
        generateText: jest.fn(),
      };
      jest.mocked(WatsonXAI.newInstance).mockReturnValue(mockedWatsonXAIClient as any);

      const provider = new WatsonXProvider(modelName, { config });
      expect(provider.modelName).toBe(modelName);
      expect(provider.options.config).toEqual(config);

      // Get client to trigger authentication
      await provider.getClient();
      expect(logger.info).toHaveBeenCalledWith('Using IAM Authentication.');
    });

    it('should initialize with default id based on modelName', () => {
      const mockedWatsonXAIClient: Partial<any> = {
        generateText: jest.fn(),
      };
      jest.mocked(WatsonXAI.newInstance).mockReturnValue(mockedWatsonXAIClient as any);

      const provider = new WatsonXProvider(modelName, { config });
      expect(provider.id()).toBe(`watsonx:${modelName}`);
    });
  });

  describe('id', () => {
    it('should return the correct id string', () => {
      const mockedWatsonXAIClient: Partial<any> = {
        generateText: jest.fn(),
      };
      jest.mocked(WatsonXAI.newInstance).mockReturnValue(mockedWatsonXAIClient as any);

      const provider = new WatsonXProvider(modelName, { config });
      expect(provider.id()).toBe(`watsonx:${modelName}`);
    });
  });

  describe('toString', () => {
    it('should return the correct string representation', () => {
      const mockedWatsonXAIClient: Partial<any> = {
        generateText: jest.fn(),
      };
      jest.mocked(WatsonXAI.newInstance).mockReturnValue(mockedWatsonXAIClient as any);

      const provider = new WatsonXProvider(modelName, { config });
      expect(provider.toString()).toBe(`[Watsonx Provider ${modelName}]`);
    });
  });

  describe('getClient', () => {
    it('should initialize WatsonXAI client with correct parameters', async () => {
      const mockedWatsonXAIClient: Partial<any> = {
        generateText: jest.fn(),
      };
      jest.mocked(WatsonXAI.newInstance).mockReturnValue(mockedWatsonXAIClient as any);

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
      jest.spyOn(envarsModule, 'getEnvString').mockReturnValue(undefined as any);

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
        generateText: jest.fn(),
      };
      jest.mocked(WatsonXAI.newInstance).mockReturnValue(mockedWatsonXAIClient as any);

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
        generateText: jest.fn(),
      };
      jest.mocked(WatsonXAI.newInstance).mockReturnValue(mockedWatsonXAIClient as any);

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
        generateText: jest.fn(),
      };
      jest.mocked(WatsonXAI.newInstance).mockReturnValue(mockedWatsonXAIClient as any);

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
        generateText: jest.fn(),
      };
      jest.mocked(WatsonXAI.newInstance).mockReturnValue(mockedWatsonXAIClient as any);

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
        generateText: jest.fn(),
      };
      jest.mocked(WatsonXAI.newInstance).mockReturnValue(mockedWatsonXAIClient as any);

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
        generateText: jest.fn().mockResolvedValue({
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
      jest.mocked(WatsonXAI.newInstance).mockReturnValue(mockedWatsonXAIClient as any);

      const cache: Partial<any> = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn(),
        wrap: jest.fn(),
        del: jest.fn(),
        reset: jest.fn(),
        store: {} as any,
      };

      jest.mocked(getCache).mockReturnValue(cache as any);
      jest.mocked(isCacheEnabled).mockReturnValue(true);

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

      expect(cache.set).toHaveBeenCalledWith(
        `watsonx:${modelName}:${generateConfigHash(config)}:${prompt}`,
        JSON.stringify(response),
      );
    });

    it('should return cached response if available', async () => {
      const cachedResponse = {
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

      const cacheKey = `watsonx:${modelName}:${generateConfigHash(config)}:${prompt}`;
      const cache: Partial<any> = {
        get: jest.fn().mockResolvedValue(JSON.stringify(cachedResponse)),
        set: jest.fn(),
        wrap: jest.fn(),
        del: jest.fn(),
        reset: jest.fn(),
        store: {} as any,
      };

      jest.mocked(getCache).mockReturnValue(cache as any);
      jest.mocked(isCacheEnabled).mockReturnValue(true);

      const provider = new WatsonXProvider(modelName, { config });
      const generateTextSpy = jest.spyOn(await provider.getClient(), 'generateText');
      const response = await provider.callApi(prompt);
      expect(cache.get).toHaveBeenCalledWith(cacheKey);
      expect(response).toEqual(cachedResponse);
      expect(generateTextSpy).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      const mockedWatsonXAIClient: Partial<any> = {
        generateText: jest.fn().mockRejectedValue(new Error('API error')),
      };
      jest.mocked(WatsonXAI.newInstance).mockReturnValue(mockedWatsonXAIClient as any);
      const cache: Partial<any> = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn(),
        wrap: jest.fn(),
        del: jest.fn(),
        reset: jest.fn(),
        store: {} as any,
      };

      jest.mocked(getCache).mockReturnValue(cache as any);
      jest.mocked(isCacheEnabled).mockReturnValue(true);
      const provider = new WatsonXProvider(modelName, { config });
      const response = await provider.callApi(prompt);
      expect(response).toEqual({
        error: 'API call error: Error: API error',
        output: '',
        tokenUsage: {},
      });
      expect(logger.error).toHaveBeenCalledWith('Watsonx: API call error: Error: API error');
    });
  });

  describe('calculateWatsonXCost', () => {
    const MODEL_ID = 'meta-llama/llama-3-2-1b-instruct';
    const configWithModelId = {
      ...config,
      modelId: MODEL_ID,
    };

    beforeEach(() => {
      jest.clearAllMocks();
      clearModelSpecsCache();
      jest.mocked(fetchWithCache).mockImplementation(async () => ({
        data: {
          resources: [
            {
              model_id: MODEL_ID,
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
        status: 200,
        statusText: 'OK',
        headers: {},
      }));
    });

    it('should calculate cost correctly when token counts are provided', async () => {
      const mockedWatsonXAIClient: Partial<any> = {
        generateText: jest.fn().mockResolvedValue({
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
      jest.mocked(WatsonXAI.newInstance).mockReturnValue(mockedWatsonXAIClient as any);

      const cache: Partial<any> = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn(),
      };

      jest.mocked(getCache).mockReturnValue(cache as any);
      jest.mocked(isCacheEnabled).mockReturnValue(true);

      const provider = new WatsonXProvider(MODEL_ID, { config: configWithModelId });
      const response = await provider.callApi(prompt);

      expect(response.cost).toBeDefined();
      expect(typeof response.cost).toBe('number');
      // For class_c1 tier ($0.0001 per 1M tokens)
      // Input: 50 tokens * $0.0001/1M = 0.000005
      // Output: 50 tokens * $0.0001/1M = 0.000005
      // Total expected: 0.00001
      expect(response.cost).toBeCloseTo(0.00001, 6);
    });

    it('should calculate cost correctly for class_9 tier', async () => {
      const modelId = 'meta-llama/llama-3-2-11b-vision-instruct';
      const configWithClass9ModelId = { ...config, modelId };

      clearModelSpecsCache();
      jest.mocked(fetchWithCache).mockImplementation(async () => ({
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
      }));

      const mockedWatsonXAIClient: Partial<any> = {
        generateText: jest.fn().mockResolvedValue({
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
      jest.mocked(WatsonXAI.newInstance).mockReturnValue(mockedWatsonXAIClient as any);

      const cache: Partial<any> = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn(),
      };

      jest.mocked(getCache).mockReturnValue(cache as any);
      jest.mocked(isCacheEnabled).mockReturnValue(true);

      const provider = new WatsonXProvider(modelId, { config: configWithClass9ModelId });
      const response = await provider.callApi(prompt);

      expect(response.cost).toBeDefined();
      expect(typeof response.cost).toBe('number');
      // For class_9 tier ($0.00035 per 1M tokens)
      // Input: 50 tokens * $0.00035/1M = 0.0000175
      // Output: 50 tokens * $0.00035/1M = 0.0000175
      // Total expected: 0.000035
      expect(response.cost).toBeCloseTo(0.000035, 6);
    });
  });
});
