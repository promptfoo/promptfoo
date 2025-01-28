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

describe('Perplexity Providers', () => {
  afterEach(async () => {
    jest.clearAllMocks();
    await clearCache();
  });

  describe('Provider Loading', () => {
    it('loadApiProvider with perplexity', async () => {
      const provider = await loadApiProvider('perplexity:llama-3-sonar-large-32k-online');
      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect(provider.id()).toBe('llama-3-sonar-large-32k-online');
      expect(provider.config.apiBaseUrl).toBe('https://api.perplexity.ai');
      expect(provider.config.apiKeyEnvar).toBe('PERPLEXITY_API_KEY');
    });
  });

  describe('API Calls', () => {
    beforeEach(() => {
      mockFetch.mockReset();
    });

    it('Perplexity provider callApi', async () => {
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

      const provider = await loadApiProvider('perplexity:llama-3-sonar-large-32k-online');
      const result = await provider.callApi('Test prompt');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.output).toBe('Test output');
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });

      // Verify the request was made to Perplexity's API
      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[0]).toContain('api.perplexity.ai');
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

      const provider = await loadApiProvider('perplexity:llama-3-sonar-large-32k-online');
      const result = await provider.callApi('Test prompt');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.error).toContain('Test error message');
    });

    it('handles streaming responses', async () => {
      const mockResponse = {
        ...defaultMockResponse,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            id: 'chatcmpl-123',
            object: 'chat.completion.chunk',
            created: 1694268190,
            model: 'llama-3-sonar-large-32k-online',
            choices: [{ message: { content: 'Test output' }, finish_reason: 'stop' }],
            usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
          }),
        ),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const provider = await loadApiProvider('perplexity:llama-3-sonar-large-32k-online');
      const result = await provider.callApi('Test prompt', { stream: true });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.output).toBe('Test output');
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
    });
  });
});

