import { WatsonXProvider } from '../src/providers/watsonx';
import { getCache, isCacheEnabled } from '../src/cache';
import { WatsonXAI } from '@ibm-cloud/watsonx-ai';
import { IamAuthenticator } from 'ibm-cloud-sdk-core';
import logger from '../src/logger';

jest.mock('@ibm-cloud/watsonx-ai', () => ({
  WatsonXAI: {
    newInstance: jest.fn(),
  },
}));

jest.mock('ibm-cloud-sdk-core', () => ({
  IamAuthenticator: jest.fn(),
}));

jest.mock('../src/cache', () => ({
  getCache: jest.fn(),
  isCacheEnabled: jest.fn(),
}));

jest.mock('../src/logger', () => ({
  debug: jest.fn(),
  error: jest.fn(),
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
      const provider = new WatsonXProvider(modelName, { config });
      expect(provider.modelName).toBe(modelName);
      expect(provider.options.config).toEqual(config);
    });

    it('should initialize with id function if id is provided', () => {
      const id = 'test-id';
      const provider = new WatsonXProvider(modelName, { config, id });
      expect(provider.id()).toBe(id);
    });
  });

  describe('id', () => {
    it('should return the correct id string', () => {
      const provider = new WatsonXProvider(modelName, { config });
      expect(provider.id()).toBe(`watsonx:${modelName}`);
    });
  });

  describe('toString', () => {
    it('should return the correct string representation', () => {
      const provider = new WatsonXProvider(modelName, { config });
      expect(provider.toString()).toBe(`[Watsonx Provider ${modelName}]`);
    });
  });

  describe('getClient', () => {
    it('should initialize WatsonXAI client with correct parameters', async () => {
      const provider = new WatsonXProvider(modelName, { config });

      const mockedWatsonXAIClient = {
        generateText: jest.fn(),
      };
      (WatsonXAI.newInstance as jest.Mock).mockReturnValue(mockedWatsonXAIClient);

      const client = await provider.getClient();

      expect(WatsonXAI.newInstance).toHaveBeenCalledWith({
        version: '2023-05-29',
        serviceUrl: 'https://us-south.ml.cloud.ibm.com',
        authenticator: expect.any(IamAuthenticator),
      });

      expect(IamAuthenticator).toHaveBeenCalledWith({ apikey: 'test-api-key' });

      expect(client).toBe(mockedWatsonXAIClient);
    });

    it('should throw an error if API key is not set', async () => {
      const provider = new WatsonXProvider(modelName, { config: { ...config, apiKey: undefined } });

      jest.spyOn(provider, 'getApiKey').mockReturnValue(undefined);

      await expect(provider.getClient()).rejects.toThrow(
        'Watsonx API key is not set. Set the WATSONX_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    });
  });

  describe('callApi', () => {
    it('should call generateText with correct parameters and return the correct response', async () => {
      const provider = new WatsonXProvider(modelName, { config });

      const mockedGenerateText = jest.fn().mockResolvedValue({
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
      });

      const mockedClient = {
        generateText: mockedGenerateText,
      };

      provider.getClient = jest.fn().mockResolvedValue(mockedClient);

      const cache = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn(),
      };
      (getCache as jest.Mock).mockResolvedValue(cache);
      (isCacheEnabled as jest.Mock).mockReturnValue(true);

      const response = await provider.callApi(prompt);

      expect(mockedGenerateText).toHaveBeenCalledWith({
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

      expect(cache.set).toHaveBeenCalled();
    });

    it('should return cached response if available', async () => {
      const provider = new WatsonXProvider(modelName, { config });

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

      const cache = {
        get: jest.fn().mockResolvedValue(JSON.stringify(cachedResponse)),
        set: jest.fn(),
      };
      (getCache as jest.Mock).mockResolvedValue(cache);
      (isCacheEnabled as jest.Mock).mockReturnValue(true);

      const getClientSpy = jest.spyOn(provider, 'getClient');

      const response = await provider.callApi(prompt);

      expect(response).toEqual(cachedResponse);

      expect(getClientSpy).not.toHaveBeenCalled();

      expect(provider.getClient).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      const provider = new WatsonXProvider(modelName, { config });

      const mockedGenerateText = jest.fn().mockRejectedValue(new Error('API error'));
      const mockedClient = {
        generateText: mockedGenerateText,
      };

      provider.getClient = jest.fn().mockResolvedValue(mockedClient);

      const cache = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn(),
      };
      (getCache as jest.Mock).mockResolvedValue(cache);
      (isCacheEnabled as jest.Mock).mockReturnValue(true);

      const response = await provider.callApi(prompt);

      expect(response).toEqual({
        error: 'API call error: Error: API error',
        output: '',
        tokenUsage: {},
      });
    });

    it('should throw an error if API key is not set when calling callApi', async () => {
        const provider = new WatsonXProvider(modelName, { config: { ...config, apiKey: undefined } });
    
        jest.spyOn(provider, 'getApiKey').mockReturnValue(undefined);
    
        await expect(provider.callApi(prompt)).rejects.toThrow(
            'Watsonx API key is not set. Set the WATSONX_API_KEY environment variable or add `apiKey` to the provider config.',
        );
    });    
  });
});
