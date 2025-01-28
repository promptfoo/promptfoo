import { clearCache } from '../../src/cache';
import { loadApiProvider } from '../../src/providers';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai';

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

describe('OpenRouter Providers', () => {
  afterEach(async () => {
    jest.clearAllMocks();
    await clearCache();
  });

  describe('Provider Loading', () => {
    it('loadApiProvider with openrouter', async () => {
      const provider = await loadApiProvider('openrouter:mistralai/mistral-medium');
      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      // Intentionally openai, because it's just a wrapper around openai
      expect(provider.id()).toBe('mistralai/mistral-medium');
      expect(provider.config.apiBaseUrl).toBe('https://openrouter.ai/api/v1');
      expect(provider.config.apiKeyEnvar).toBe('OPENROUTER_API_KEY');
    });
  });

  describe('API Calls', () => {
    beforeEach(() => {
      mockFetch.mockReset();
    });

    it('OpenRouter provider callApi', async () => {
      const mockResponse = {
        ...defaultMockResponse,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            choices: [{ message: { content: 'Test output' } }],
            usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
          }),
        ),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const provider = await loadApiProvider('openrouter:mistralai/mistral-medium');
      const result = await provider.callApi('Test prompt');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.output).toBe('Test output');
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });

      // Verify the request was made to OpenRouter's API
      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[0]).toContain('openrouter.ai/api/v1');
    });

    it('handles error responses', async () => {
      const mockResponse = {
        ...defaultMockResponse,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            error: {
              message: 'Test error message',
              type: 'invalid_request_error',
            },
          }),
        ),
        ok: false,
        status: 400,
      };
      mockFetch.mockResolvedValue(mockResponse);

      const provider = await loadApiProvider('openrouter:mistralai/mistral-medium');
      const result = await provider.callApi('Test prompt');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.error).toContain('Test error message');
    });
  });
});

