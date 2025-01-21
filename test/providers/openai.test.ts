import OpenAI from 'openai';
import { disableCache, fetchWithCache } from '../../src/cache';
import {
  failApiCall,
  getTokenUsage,
  OpenAiGenericProvider,
  OpenAiEmbeddingProvider,
  calculateOpenAICost,
} from '../../src/providers/openai';

jest.mock('../../src/cache');
jest.mock('../../src/globalConfig/globalConfig');
jest.mock('../../src/logger');

describe('OpenAI Provider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    disableCache();
  });

  describe('failApiCall', () => {
    it('should format OpenAI API errors', () => {
      const error = new OpenAI.APIError(
        400,
        {
          type: 'invalid_request_error',
          message: 'Bad request',
        },
        'Bad request',
        {},
      );

      const result = failApiCall(error);
      expect(result).toEqual({
        error: `API error: invalid_request_error 400 Bad request`,
      });
    });

    it('should format generic errors', () => {
      const error = new Error('Network error');
      const result = failApiCall(error);
      expect(result).toEqual({
        error: `API error: Error: Network error`,
      });
    });
  });

  describe('getTokenUsage', () => {
    it('should return token usage for non-cached response', () => {
      const data = {
        usage: {
          total_tokens: 100,
          prompt_tokens: 40,
          completion_tokens: 60,
        },
      };

      const result = getTokenUsage(data, false);
      expect(result).toEqual({
        total: 100,
        prompt: 40,
        completion: 60,
      });
    });

    it('should return cached token usage', () => {
      const data = {
        usage: {
          total_tokens: 100,
        },
      };

      const result = getTokenUsage(data, true);
      expect(result).toEqual({
        cached: 100,
        total: 100,
      });
    });

    it('should handle missing usage data', () => {
      const data = {};
      const result = getTokenUsage(data, false);
      expect(result).toEqual({});
    });
  });

  describe('OpenAiGenericProvider', () => {
    const provider = new OpenAiGenericProvider('test-model', {
      config: {
        apiKey: 'test-key',
        organization: 'test-org',
      },
    });

    it('should generate correct API URL', () => {
      expect(provider.getApiUrl()).toBe('https://api.openai.com/v1');
    });

    it('should use custom API host', () => {
      const customProvider = new OpenAiGenericProvider('test-model', {
        config: { apiHost: 'custom.openai.com' },
      });
      expect(customProvider.getApiUrl()).toBe('https://custom.openai.com/v1');
    });

    it('should get organization', () => {
      expect(provider.getOrganization()).toBe('test-org');
    });

    it('should get API key', () => {
      expect(provider.getApiKey()).toBe('test-key');
    });
  });

  describe('OpenAiEmbeddingProvider', () => {
    const provider = new OpenAiEmbeddingProvider('text-embedding-3-large', {
      config: {
        apiKey: 'test-key',
      },
    });

    it('should call embedding API successfully', async () => {
      const mockResponse = {
        data: [
          {
            embedding: [0.1, 0.2, 0.3],
          },
        ],
        usage: {
          total_tokens: 10,
          prompt_tokens: 0,
          completion_tokens: 0,
        },
      };

      jest.mocked(fetchWithCache).mockResolvedValue({
        data: mockResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callEmbeddingApi('test text');
      expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
      expect(result.tokenUsage).toEqual({
        total: 10,
        prompt: 0,
        completion: 0,
      });
    });

    it('should handle API errors', async () => {
      jest.mocked(fetchWithCache).mockRejectedValue(new Error('API error'));

      await expect(provider.callEmbeddingApi('test text')).rejects.toThrow('API error');
    });
  });

  describe('calculateOpenAICost', () => {
    it('should calculate cost correctly', () => {
      const cost = calculateOpenAICost('gpt-4', {}, 100, 50);
      expect(cost).toBeDefined();
      expect(typeof cost).toBe('number');
    });

    it('should handle unknown models', () => {
      const cost = calculateOpenAICost('unknown-model', {}, 100, 50);
      expect(cost).toBeUndefined();
    });
  });
});
