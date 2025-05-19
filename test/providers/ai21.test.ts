import { fetchWithCache } from '../../src/cache';
import logger from '../../src/logger';
import { AI21ChatCompletionProvider } from '../../src/providers/ai21';

jest.mock('../../src/cache');
jest.mock('../../src/logger');

describe('AI21ChatCompletionProvider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should construct with valid model name', () => {
    const provider = new AI21ChatCompletionProvider('jamba-1.5-mini');
    expect(provider.modelName).toBe('jamba-1.5-mini');
  });

  it('should warn when constructing with unknown model', () => {
    const mockWarn = jest.spyOn(logger, 'warn').mockImplementation();
    new AI21ChatCompletionProvider('unknown-model');
    expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('unknown-model'));
    mockWarn.mockRestore();
  });

  it('should get API key from config', () => {
    const provider = new AI21ChatCompletionProvider('jamba-1.5-mini', {
      config: { apiKey: 'test-key' },
    });
    expect(provider.getApiKey()).toBe('test-key');
  });

  it('should get API key from environment variable', () => {
    process.env.AI21_API_KEY = 'env-key';
    const provider = new AI21ChatCompletionProvider('jamba-1.5-mini');
    expect(provider.getApiKey()).toBe('env-key');
    delete process.env.AI21_API_KEY;
  });

  it('should get API URL from config', () => {
    const provider = new AI21ChatCompletionProvider('jamba-1.5-mini', {
      config: { apiBaseUrl: 'https://custom-api.ai21.com' },
    });
    expect(provider.getApiUrl()).toBe('https://custom-api.ai21.com');
  });

  it('should get default API URL when not configured', () => {
    const provider = new AI21ChatCompletionProvider('jamba-1.5-mini');
    expect(provider.getApiUrl()).toBe('https://api.ai21.com/studio/v1');
  });

  it('should throw error when API key is not set', async () => {
    const provider = new AI21ChatCompletionProvider('jamba-1.5-mini');
    await expect(provider.callApi('test prompt')).rejects.toThrow('AI21 API key is not set');
  });

  it('should handle successful API call', async () => {
    const mockResponse = {
      data: {
        choices: [
          {
            message: {
              content: 'test response',
            },
          },
        ],
        usage: {
          total_tokens: 10,
          prompt_tokens: 5,
          completion_tokens: 5,
        },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    };

    jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new AI21ChatCompletionProvider('jamba-1.5-mini', {
      config: { apiKey: 'test-key' },
    });

    const result = await provider.callApi('test prompt');
    expect(result.output).toBe('test response');
    expect(result.tokenUsage).toEqual({
      total: 10,
      prompt: 5,
      completion: 5,
    });
  });

  it('should handle API error response', async () => {
    const mockResponse = {
      data: {
        error: 'API error message',
      },
      cached: false,
      status: 400,
      statusText: 'Bad Request',
    };

    jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new AI21ChatCompletionProvider('jamba-1.5-mini', {
      config: { apiKey: 'test-key' },
    });

    const result = await provider.callApi('test prompt');
    expect(result.error).toBe('API call error: API error message');
  });

  it('should handle malformed API response', async () => {
    const mockResponse = {
      data: {
        choices: [],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    };

    jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new AI21ChatCompletionProvider('jamba-1.5-mini', {
      config: { apiKey: 'test-key' },
    });

    const result = await provider.callApi('test prompt');
    expect(result.error).toContain('Malformed response data');
  });

  it('should handle network errors', async () => {
    jest.mocked(fetchWithCache).mockRejectedValue(new Error('Network error'));

    const provider = new AI21ChatCompletionProvider('jamba-1.5-mini', {
      config: { apiKey: 'test-key' },
    });

    const result = await provider.callApi('test prompt');
    expect(result.error).toBe('API call error: Error: Network error');
  });

  it('should calculate cost correctly', async () => {
    const mockResponse = {
      data: {
        choices: [
          {
            message: {
              content: 'test response',
            },
          },
        ],
        usage: {
          total_tokens: 10,
          prompt_tokens: 5,
          completion_tokens: 5,
        },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    };

    jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new AI21ChatCompletionProvider('jamba-1.5-mini', {
      config: { apiKey: 'test-key' },
    });

    const result = await provider.callApi('test prompt');
    expect(result.cost).toBeDefined();
  });
});
