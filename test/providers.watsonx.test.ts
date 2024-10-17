import { WatsonXAI } from '@ibm-cloud/watsonx-ai';
import { IamAuthenticator, BearerTokenAuthenticator } from 'ibm-cloud-sdk-core';
import { getCache, isCacheEnabled } from '../src/cache';
import * as envarsModule from '../src/envars';
import logger from '../src/logger';
import { WatsonXProvider, generateConfigHash } from '../src/providers/watsonx';

jest.mock('@ibm-cloud/watsonx-ai', () => ({
  WatsonXAI: {
    newInstance: jest.fn(),
  },
}));

jest.mock('ibm-cloud-sdk-core', () => ({
  IamAuthenticator: jest.fn(),
  BearerTokenAuthenticator: jest.fn(),
}));

jest.mock('../src/cache', () => ({
  getCache: jest.fn(),
  isCacheEnabled: jest.fn(),
}));

jest.mock('../src/logger', () => ({
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
}));

jest.mock('../src/envars', () => ({
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
    it('should initialize with modelName and config', () => {
      const mockedWatsonXAIClient: Partial<any> = {
        generateText: jest.fn(),
      };
      jest.mocked(WatsonXAI.newInstance).mockReturnValue(mockedWatsonXAIClient as any);

      const provider = new WatsonXProvider(modelName, { config });
      expect(provider.modelName).toBe(modelName);
      expect(provider.options.config).toEqual(config);
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
    it('should initialize WatsonXAI client with correct parameters', () => {
      const mockedWatsonXAIClient: Partial<any> = {
        generateText: jest.fn(),
      };
      jest.mocked(WatsonXAI.newInstance).mockReturnValue(mockedWatsonXAIClient as any);

      const provider = new WatsonXProvider(modelName, { config });

      const client = provider.getClient();

      expect(WatsonXAI.newInstance).toHaveBeenCalledWith({
        version: '2023-05-29',
        serviceUrl: 'https://us-south.ml.cloud.ibm.com',
        authenticator: expect.any(IamAuthenticator),
      });

      expect(IamAuthenticator).toHaveBeenCalledWith({ apikey: 'test-api-key' });

      expect(client).toBe(mockedWatsonXAIClient);
    });

    it('should throw an error if neither API key nor Bearer Token is set', () => {
      jest.spyOn(envarsModule, 'getEnvString').mockReturnValue(undefined as any);

      expect(() => {
        new WatsonXProvider(modelName, {
          config: { ...config, apiKey: undefined, apiBearerToken: undefined },
        });
      }).toThrow(
        /Authentication credentials not provided\. Please set either `WATSONX_AI_APIKEY` for IAM Authentication or `WATSONX_AI_BEARER_TOKEN` for Bearer Token Authentication\./,
      );
    });
  });

  describe('constructor with Bearer Token', () => {
    it('should use Bearer Token Authentication when apiKey is not provided', () => {
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
      expect(logger.info).toHaveBeenCalledWith('Using Bearer Token Authentication.');
      expect(WatsonXAI.newInstance).toHaveBeenCalledWith({
        version: '2023-05-29',
        serviceUrl: 'https://us-south.ml.cloud.ibm.com',
        authenticator: expect.any(BearerTokenAuthenticator),
      });
      expect(provider.getClient()).toBe(mockedWatsonXAIClient);
    });

    it('should prefer API Key Authentication over Bearer Token Authentication when both are provided', () => {
      const dualAuthConfig = { ...config, apiBearerToken: 'test-bearer-token' };
      const mockedWatsonXAIClient: Partial<any> = {
        generateText: jest.fn(),
      };
      jest.mocked(WatsonXAI.newInstance).mockReturnValue(mockedWatsonXAIClient as any);

      const provider = new WatsonXProvider(modelName, { config: dualAuthConfig });
      expect(logger.info).toHaveBeenCalledWith('Using IAM Authentication.');
      expect(WatsonXAI.newInstance).toHaveBeenCalledWith({
        version: '2023-05-29',
        serviceUrl: 'https://us-south.ml.cloud.ibm.com',
        authenticator: expect.any(IamAuthenticator),
      });
      expect(provider.getClient()).toBe(mockedWatsonXAIClient);
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
      const generateTextSpy = jest.spyOn(provider.getClient(), 'generateText');
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
});
