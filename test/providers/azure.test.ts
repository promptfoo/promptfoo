import { fetchWithCache } from '../../src/cache';
import {
  AzureCompletionProvider,
  AzureGenericProvider,
  calculateAzureCost,
  AzureEmbeddingProvider,
  AzureAssistantProvider,
} from '../../src/providers/azure';

jest.mock('../../src/logger');
jest.mock('../../src/cache', () => ({
  fetchWithCache: jest.fn(),
}));

describe('calculateAzureCost', () => {
  it('should calculate cost for known models', () => {
    const cost = calculateAzureCost('gpt-4', {}, 100, 50);
    expect(cost).toBe(100 * (30 / 1000000) + 50 * (60 / 1000000));
  });

  it('should return undefined for unknown models', () => {
    const cost = calculateAzureCost('unknown-model', {}, 100, 50);
    expect(cost).toBeUndefined();
  });

  it('should return undefined when token counts are undefined', () => {
    const cost = calculateAzureCost('gpt-4', {}, undefined, undefined);
    expect(cost).toBeUndefined();
  });
});

describe('AzureEmbeddingProvider', () => {
  let provider: AzureEmbeddingProvider;

  beforeEach(() => {
    provider = new AzureEmbeddingProvider('test-embedding', {
      config: {
        apiHost: 'test.azure.com',
        apiKey: 'test-key',
      },
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should handle successful embedding request', async () => {
    const mockResponse = {
      data: [
        {
          embedding: [0.1, 0.2, 0.3],
        },
      ],
      usage: {
        total_tokens: 10,
        prompt_tokens: 5,
        completion_tokens: 5,
      },
    };

    jest.mocked(fetchWithCache).mockResolvedValueOnce({
      data: mockResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const result = await provider.callEmbeddingApi('test text');
    expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
    expect(result.tokenUsage).toEqual({
      total: 10,
      prompt: 5,
      completion: 5,
    });
  });

  it('should handle API errors', async () => {
    jest.mocked(fetchWithCache).mockRejectedValueOnce(new Error('API Error'));

    const result = await provider.callEmbeddingApi('test text');
    expect(result.error).toBe('API call error: Error: API Error');
  });

  it('should handle missing embedding in response', async () => {
    const mockResponse = {
      data: [{}],
      usage: { total_tokens: 10 },
    };

    jest.mocked(fetchWithCache).mockResolvedValueOnce({
      data: mockResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const result = await provider.callEmbeddingApi('test text');
    expect(result.error).toContain('No embedding returned');
  });
});

describe('AzureAssistantProvider', () => {
  let provider: AzureAssistantProvider;

  beforeEach(() => {
    provider = new AzureAssistantProvider('test-assistant', {
      config: {
        apiHost: 'test.azure.com',
        apiKey: 'test-key',
      },
    });
  });

  it('should initialize with correct configuration', () => {
    expect(provider.deploymentName).toBe('test-assistant');
    expect(provider.apiHost).toBe('test.azure.com');
  });

  it('should get API key from config', () => {
    const provider = new AzureAssistantProvider('test', {
      config: { apiKey: 'test-key' },
    });
    expect(provider.getApiKey()).toBe('test-key');
  });
});

describe('AzureGenericProvider Auth', () => {
  let provider: AzureGenericProvider;

  beforeEach(() => {
    provider = new AzureGenericProvider('test-deployment', {
      config: {
        apiHost: 'test.azure.com',
      },
      env: {},
    });
  });

  it('should get API key from config', () => {
    const providerWithKey = new AzureGenericProvider('test', {
      config: { apiKey: 'test-key' },
    });
    expect(providerWithKey.getApiKey()).toBe('test-key');
  });

  it('should get API key from environment', () => {
    process.env.AZURE_API_KEY = 'env-key';
    expect(provider.getApiKey()).toBe('env-key');
    delete process.env.AZURE_API_KEY;
  });

  it('should return auth headers with API key', async () => {
    const providerWithKey = new AzureGenericProvider('test', {
      config: { apiKey: 'test-key' },
    });
    const headers = await providerWithKey.getAuthHeaders();
    expect(headers).toEqual({ 'api-key': 'test-key' });
  });
});

describe('AzureCompletionProvider with Config', () => {
  let provider: AzureCompletionProvider;

  beforeEach(() => {
    provider = new AzureCompletionProvider('test-deployment', {
      config: {
        apiHost: 'test.azure.com',
        apiKey: 'test-key',
        max_tokens: 100,
        temperature: 0.5,
        stop: ['END'],
      },
    });
  });

  it('should handle successful completion with config', async () => {
    const mockResponse = {
      choices: [{ text: 'Generated text' }],
      usage: {
        total_tokens: 10,
        prompt_tokens: 5,
        completion_tokens: 5,
      },
    };

    jest.mocked(fetchWithCache).mockResolvedValueOnce({
      data: mockResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const result = await provider.callApi('Test prompt');
    expect(result.output).toBe('Generated text');
    expect(result.tokenUsage).toEqual({
      total: 10,
      prompt: 5,
      completion: 5,
    });
  });

  it('should handle API errors with details', async () => {
    const errorResponse = {
      error: {
        code: 'InvalidRequest',
        message: 'Invalid parameters',
      },
    };

    jest.mocked(fetchWithCache).mockResolvedValueOnce({
      data: errorResponse,
      cached: false,
      status: 400,
      statusText: 'Bad Request',
    });

    const result = await provider.callApi('Test prompt');
    expect(result.error).toContain('API response error');
    expect(result.error).toContain('InvalidRequest');
  });
});
