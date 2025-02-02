import { clearCache } from '../../src/cache';
import * as fetchModule from '../../src/fetch';
import { GroqProvider } from '../../src/providers/groq';

const GROQ_API_BASE = 'https://api.groq.com/openai/v1';

jest.mock('../../src/util', () => ({
  maybeLoadFromExternalFile: jest.fn((x) => x),
  renderVarsInObject: jest.fn((x) => x),
}));

jest.mock('../../src/fetch');

describe('Groq', () => {
  const mockedFetchWithRetries = jest.mocked(fetchModule.fetchWithRetries);

  afterEach(async () => {
    await clearCache();
    jest.clearAllMocks();
  });

  describe('GroqProvider', () => {
    const provider = new GroqProvider('mixtral-8x7b-32768', {});

    it('should initialize with correct model name', () => {
      expect(provider.modelName).toBe('mixtral-8x7b-32768');
    });

    it('should return correct id', () => {
      expect(provider.id()).toBe('groq:mixtral-8x7b-32768');
    });

    it('should return correct string representation', () => {
      expect(provider.toString()).toBe('[Groq Provider mixtral-8x7b-32768]');
    });

    it('should identify reasoning models correctly', () => {
      const regularProvider = new GroqProvider('mixtral-8x7b-32768', {});
      const deepseekProvider = new GroqProvider('deepseek-r1-distill-llama-70b', {});
      const o1Provider = new GroqProvider('o1-mini', {});

      expect(regularProvider['isReasoningModel']()).toBe(false);
      expect(deepseekProvider['isReasoningModel']()).toBe(true);
      expect(o1Provider['isReasoningModel']()).toBe(true);
    });

    it('should handle temperature support correctly', () => {
      const regularProvider = new GroqProvider('mixtral-8x7b-32768', {});
      const deepseekProvider = new GroqProvider('deepseek-r1-distill-llama-70b', {});
      const o1Provider = new GroqProvider('o1-mini', {});

      expect(regularProvider['supportsTemperature']()).toBe(true);
      expect(deepseekProvider['supportsTemperature']()).toBe(true);
      expect(o1Provider['supportsTemperature']()).toBe(false);
    });

    it('should serialize to JSON correctly without API key', () => {
      const provider = new GroqProvider('mixtral-8x7b-32768', {
        config: {
          temperature: 0.7,
          max_tokens: 100,
        },
      });

      expect(provider.toJSON()).toEqual({
        provider: 'groq',
        model: 'mixtral-8x7b-32768',
        config: {
          temperature: 0.7,
          max_tokens: 100,
          apiKeyEnvar: 'GROQ_API_KEY',
          apiBaseUrl: GROQ_API_BASE,
        },
      });
    });

    it('should serialize to JSON correctly with API key redacted', () => {
      const provider = new GroqProvider('mixtral-8x7b-32768', {
        config: {
          apiKey: 'secret-api-key',
          temperature: 0.7,
        },
      });

      const json = provider.toJSON();
      expect(json).toEqual({
        provider: 'groq',
        model: 'mixtral-8x7b-32768',
        config: {
          temperature: 0.7,
          apiKey: undefined,
          apiKeyEnvar: 'GROQ_API_KEY',
          apiBaseUrl: GROQ_API_BASE,
        },
      });
      expect(provider['apiKey']).toBe('secret-api-key');
    });

    it('should handle configuration options correctly', () => {
      const provider = new GroqProvider('mixtral-8x7b-32768', {
        config: {
          systemPrompt: 'You are a helpful assistant',
          parallel_tool_calls: true,
          reasoning_format: 'markdown',
          service_tier: 'premium',
          user: 'test-user',
        },
      });

      expect(provider.toJSON().config).toMatchObject({
        systemPrompt: 'You are a helpful assistant',
        parallel_tool_calls: true,
        reasoning_format: 'markdown',
        service_tier: 'premium',
        user: 'test-user',
      });
    });

    describe('callApi', () => {
      beforeEach(() => {
        process.env.GROQ_API_KEY = 'test-key';
      });

      afterEach(() => {
        delete process.env.GROQ_API_KEY;
      });

      it('should call Groq API and return output with correct structure', async () => {
        const mockResponse = {
          choices: [{ message: { content: 'Test output' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await provider.callApi('Test prompt');

        const expectedBody = {
          model: 'mixtral-8x7b-32768',
          messages: [{ role: 'user', content: 'Test prompt' }],
          max_tokens: 1024,
        };

        expect(mockedFetchWithRetries).toHaveBeenCalledWith(
          `${GROQ_API_BASE}/chat/completions`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer test-key',
            },
            body: JSON.stringify(expectedBody),
          },
          300000,
          undefined,
        );

        expect(result).toEqual({
          output: 'Test output',
          tokenUsage: {
            total: 10,
            prompt: 5,
            completion: 5,
          },
          cached: false,
          cost: undefined,
          logProbs: undefined,
        });
      });

      it('should use cache by default', async () => {
        const mockResponse = {
          choices: [{ message: { content: 'Cached output' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValue(response);

        await provider.callApi('Test prompt');
        const cachedResult = await provider.callApi('Test prompt');

        expect(mockedFetchWithRetries).toHaveBeenCalledTimes(1);
        expect(cachedResult).toEqual({
          output: 'Cached output',
          cached: true,
          cost: undefined,
          logProbs: undefined,
          tokenUsage: {
            total: 10,
            cached: 10,
          },
        });
      });

      it('should handle API errors', async () => {
        const errorResponse = {
          error: {
            message: 'API Error',
            type: 'invalid_request_error',
          },
        };

        const response = new Response(JSON.stringify(errorResponse), {
          status: 400,
          statusText: 'Bad Request',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await provider.callApi('Test prompt');
        expect(result.error).toContain('400 Bad Request');
      });

      it('should handle network errors', async () => {
        mockedFetchWithRetries.mockRejectedValueOnce(new Error('Network error'));

        const result = await provider.callApi('Test prompt');
        expect(result.error).toContain('Network error');
      });

      it('should handle empty response', async () => {
        const mockResponse = {
          choices: [{ message: { content: '' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await provider.callApi('Test prompt');
        expect(result.output).toBe('');
      });

      it('should handle tool calls and function callbacks', async () => {
        const mockCallback = jest.fn().mockResolvedValue('Function result');
        const customProvider = new GroqProvider('llama3-groq-8b-8192-tool-use-preview', {
          config: {
            functionToolCallbacks: {
              test_function: mockCallback,
            },
          },
        });

        const mockResponse = {
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: 'call_123',
                    type: 'function',
                    function: { name: 'test_function', arguments: '{"arg": "value"}' },
                  },
                ],
              },
            },
          ],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await customProvider.callApi('Test prompt');

        expect(mockCallback).toHaveBeenCalledWith('{"arg": "value"}');
        expect(result.output).toBe('Function result');
      });

      it('should handle invalid tool calls', async () => {
        const customProvider = new GroqProvider('llama3-groq-8b-8192-tool-use-preview', {
          config: {
            functionToolCallbacks: {},
          },
        });

        const mockResponse = {
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: 'call_123',
                    type: 'function',
                    function: { name: 'nonexistent_function', arguments: '{}' },
                  },
                ],
              },
            },
          ],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await customProvider.callApi('Test prompt');
        expect(result.output).toEqual([
          {
            id: 'call_123',
            type: 'function',
            function: { name: 'nonexistent_function', arguments: '{}' },
          },
        ]);
        expect(result.error).toBeUndefined();
      });

      it('should handle system prompts correctly', async () => {
        const providerWithSystem = new GroqProvider('mixtral-8x7b-32768', {
          config: {
            systemPrompt: 'You are a helpful assistant',
          },
        });

        const mockResponse = {
          choices: [{ message: { content: 'Test output' } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        await providerWithSystem.callApi('Test prompt');

        const lastCall = mockedFetchWithRetries.mock.calls[0];
        if (!lastCall) {
          throw new Error('Expected fetch to have been called');
        }
        const requestBody = JSON.parse((lastCall[1] as { body: string }).body);
        expect(requestBody.messages).toEqual([{ role: 'user', content: 'Test prompt' }]);
      });

      it('should handle API key from environment variable', async () => {
        const originalApiKey = process.env.GROQ_API_KEY;
        delete process.env.GROQ_API_KEY;

        const mockErrorResponse = new Response(
          JSON.stringify({
            error: {
              message: 'No API key provided',
              type: 'auth_error',
            },
          }),
          {
            status: 401,
            statusText: 'Unauthorized',
            headers: new Headers({ 'Content-Type': 'application/json' }),
          },
        );
        mockedFetchWithRetries.mockResolvedValueOnce(mockErrorResponse);

        const result = await provider.callApi('Test prompt');
        expect(result.error).toContain('401 Unauthorized');
        process.env.GROQ_API_KEY = originalApiKey;
      });

      it('should handle malformed API response', async () => {
        const malformedResponse = new Response('{"invalid": json}', {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(malformedResponse);

        const result = await provider.callApi('Test prompt');
        expect(result.error).toBeDefined();
      });

      it('should handle rate limit errors', async () => {
        const rateLimitResponse = new Response(
          JSON.stringify({
            error: {
              message: 'Rate limit exceeded',
              type: 'rate_limit_error',
            },
          }),
          {
            status: 429,
            statusText: 'Too Many Requests',
            headers: new Headers({ 'Content-Type': 'application/json' }),
          },
        );
        mockedFetchWithRetries.mockResolvedValueOnce(rateLimitResponse);

        const result = await provider.callApi('Test prompt');
        expect(result.error).toContain('429');
        expect(result.error).toContain('Rate limit exceeded');
      });
    });
  });
});
