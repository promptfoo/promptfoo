import { cloudConfig } from '../../src/globalConfig/cloud';
import logger from '../../src/logger';
import { PromptfooModelProvider } from '../../src/providers/promptfooModel';

describe('PromptfooModelProvider', () => {
  let mockFetch: jest.Mock;
  let mockCloudConfig: jest.SpyInstance;
  const mockLogger = jest.spyOn(logger, 'debug').mockImplementation();

  beforeEach(() => {
    mockFetch = jest.fn();
    global.fetch = mockFetch;
    mockCloudConfig = jest.spyOn(cloudConfig, 'getApiKey').mockReturnValue('test-token');
    mockLogger.mockClear();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should initialize with model name', () => {
    const provider = new PromptfooModelProvider('test-model');
    expect(provider.id()).toBe('promptfoo:model:test-model');
  });

  it('should throw error if model name is not provided', () => {
    expect(() => new PromptfooModelProvider('')).toThrow('Model name is required');
  });

  it('should call API with string prompt', async () => {
    const provider = new PromptfooModelProvider('test-model');
    const mockResponse = {
      ok: true,
      json: () =>
        Promise.resolve({
          result: {
            choices: [{ message: { content: 'test response' } }],
            usage: {
              total_tokens: 10,
              prompt_tokens: 5,
              completion_tokens: 5,
            },
          },
        }),
    };
    mockFetch.mockResolvedValue(mockResponse);

    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      output: 'test response',
      tokenUsage: {
        total: 10,
        prompt: 5,
        completion: 5,
      },
    });
  });

  it('should handle JSON array messages', async () => {
    const provider = new PromptfooModelProvider('test-model');
    const messages = JSON.stringify([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ]);

    const mockResponse = {
      ok: true,
      json: () =>
        Promise.resolve({
          result: {
            choices: [{ message: { content: 'test response' } }],
            usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
          },
        }),
    };
    mockFetch.mockResolvedValue(mockResponse);

    await provider.callApi(messages);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining(
          '"messages":[{"role":"user","content":"Hello"},{"role":"assistant","content":"Hi"}]',
        ),
      }),
    );
  });

  it('should throw error if no auth token', async () => {
    mockCloudConfig.mockReturnValue(undefined);
    const provider = new PromptfooModelProvider('test-model');

    await expect(provider.callApi('test')).rejects.toThrow('No Promptfoo auth token available');
  });

  it('should handle API errors', async () => {
    const provider = new PromptfooModelProvider('test-model');
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal server error'),
    });

    await expect(provider.callApi('test')).rejects.toThrow('PromptfooModel task API error: 500');
  });

  it('should handle invalid API responses', async () => {
    const provider = new PromptfooModelProvider('test-model');
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await expect(provider.callApi('test')).rejects.toThrow(
      'Invalid response from PromptfooModel task API',
    );
  });

  it('should use config from options', async () => {
    const config = { temperature: 0.7 };
    const provider = new PromptfooModelProvider('test-model', { model: 'test-model', config });

    const mockResponse = {
      ok: true,
      json: () =>
        Promise.resolve({
          result: {
            choices: [{ message: { content: 'test' } }],
            usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
          },
        }),
    };
    mockFetch.mockResolvedValue(mockResponse);

    await provider.callApi('test');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"config":{"temperature":0.7}'),
      }),
    );
  });
});
