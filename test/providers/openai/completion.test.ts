import { disableCache, enableCache, fetchWithCache } from '../../../src/cache';
import logger from '../../../src/logger';
import { OpenAiCompletionProvider } from '../../../src/providers/openai/completion';

jest.mock('../../../src/cache');
jest.mock('../../../src/logger');

const mockFetchWithCache = jest.mocked(fetchWithCache);

describe('OpenAI Provider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    disableCache();
    // Set a default API key for tests unless explicitly testing missing key
    process.env.OPENAI_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    enableCache();
  });

  describe('OpenAiCompletionProvider', () => {
    const mockResponse = {
      data: {
        choices: [{ text: 'Test output' }],
        usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
      severity: 'info',
    };

    it('should call API successfully with text completion', async () => {
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiCompletionProvider('text-davinci-003');
      const result = await provider.callApi('Test prompt');

      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
      expect(result.output).toBe('Test output');
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
    });

    it('should handle API errors', async () => {
      mockFetchWithCache.mockResolvedValue({
        data: {
          error: {
            message: 'Test error',
            type: 'test_error',
          },
        },
        cached: false,
        status: 400,
        statusText: 'Bad Request',
      });

      const provider = new OpenAiCompletionProvider('text-davinci-003');
      const result = await provider.callApi('Test prompt');

      expect(result.error).toBeDefined();
      expect(result.error).toContain('Test error');
    });

    it('should handle fetch errors', async () => {
      mockFetchWithCache.mockRejectedValue(new Error('Network error'));

      const provider = new OpenAiCompletionProvider('text-davinci-003');
      const result = await provider.callApi('Test prompt');

      expect(result.error).toBeDefined();
      expect(result.error).toContain('Network error');
    });

    it('should handle missing API key', async () => {
      // Save the original env var and clear it for this test
      const originalApiKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      try {
        const provider = new OpenAiCompletionProvider('text-davinci-003', {
          config: {
            apiKeyRequired: true,
          },
          env: {
            OPENAI_API_KEY: undefined,
          },
        });

        await expect(provider.callApi('Test prompt')).rejects.toThrow('OpenAI API key is not set');
      } finally {
        // Restore the original env var
        if (originalApiKey) {
          process.env.OPENAI_API_KEY = originalApiKey;
        }
      }
    });

    it('should warn about unknown model', () => {
      const warnSpy = jest.spyOn(logger, 'warn');

      new OpenAiCompletionProvider('unknown-model');

      expect(warnSpy).toHaveBeenCalledWith(
        'FYI: Using unknown OpenAI completion model: unknown-model',
      );
      warnSpy.mockRestore();
    });

    it('should handle cached responses', async () => {
      mockFetchWithCache.mockResolvedValue({
        ...mockResponse,
        cached: true,
      });

      const provider = new OpenAiCompletionProvider('text-davinci-003');
      const result = await provider.callApi('Test prompt');

      expect(result.cached).toBe(true);
      expect(result.output).toBe('Test output');
    });

    it('should handle responses without usage information', async () => {
      mockFetchWithCache.mockResolvedValue({
        data: {
          choices: [{ text: 'Test output' }],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const provider = new OpenAiCompletionProvider('text-davinci-003');
      const result = await provider.callApi('Test prompt');

      expect(result.output).toBe('Test output');
      expect(result.tokenUsage).toEqual({});
    });

    it('should handle fetchWithCache returning undefined response', async () => {
      mockFetchWithCache.mockResolvedValue(undefined as any);

      const provider = new OpenAiCompletionProvider('text-davinci-003');
      const result = await provider.callApi('Test prompt');

      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
      expect(result.error).toContain('Cannot destructure property');
    });

    it('should pass custom headers from config', async () => {
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const customHeaders = {
        'X-Test-Header': 'test-value',
      };

      const provider = new OpenAiCompletionProvider('text-davinci-003', {
        config: {
          headers: customHeaders,
        },
      });

      await provider.callApi('Test prompt');

      expect(mockFetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Test-Header': 'test-value',
          }),
        }),
        expect.any(Number),
        'json',
        undefined,
      );
    });

    it('should pass passthrough config fields in body', async () => {
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiCompletionProvider('text-davinci-003', {
        config: {
          passthrough: { logprobs: 3 },
        },
      });

      await provider.callApi('Test prompt');

      const actualCall = mockFetchWithCache.mock.calls[0];
      const body = JSON.parse(actualCall[1]?.body as string);
      expect(body.logprobs).toBe(3);
    });

    it('should handle response parsing errors', async () => {
      mockFetchWithCache.mockResolvedValue({
        data: {}, // Missing choices array
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const provider = new OpenAiCompletionProvider('text-davinci-003');
      const result = await provider.callApi('Test prompt');

      expect(result.error).toMatch(/API error:/);
    });

    it('should handle invalid OPENAI_STOP env var', async () => {
      process.env.OPENAI_STOP = '{invalid json}';

      const provider = new OpenAiCompletionProvider('text-davinci-003', {
        config: {
          apiKey: 'test-api-key',
        },
      });

      await expect(provider.callApi('test')).rejects.toThrow(
        /OPENAI_STOP is not a valid JSON string/,
      );

      delete process.env.OPENAI_STOP;
    });
  });
});
