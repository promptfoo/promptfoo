import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache } from '../../src/cache';
import { OpenRouterProvider } from '../../src/providers/openrouter';
import { createProviderRateLimitOptions } from '../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import * as fetchModule from '../../src/util/fetch/index';
import { mockProcessEnv } from '../util/utils';

const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';

vi.mock('../../src/util', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    maybeLoadFromExternalFile: vi.fn((x) => x),
    renderVarsInObject: vi.fn((x) => x),
  };
});

vi.mock('../../src/util/fetch/index');

describe('OpenRouter', () => {
  const mockedFetchWithRetries = vi.mocked(fetchModule.fetchWithRetries);

  afterEach(async () => {
    await clearCache();
    mockedFetchWithRetries.mockReset();
    vi.clearAllMocks();
  });

  describe('OpenRouterProvider', () => {
    const provider = new OpenRouterProvider('google/gemini-2.5-pro', {});

    it('should initialize with correct model name', () => {
      expect(provider.modelName).toBe('google/gemini-2.5-pro');
    });

    it('should return correct id', () => {
      expect(provider.id()).toBe('openrouter:google/gemini-2.5-pro');
    });

    it('should return correct string representation', () => {
      expect(provider.toString()).toBe('[OpenRouter Provider google/gemini-2.5-pro]');
    });

    it('should serialize to JSON correctly', () => {
      const provider = new OpenRouterProvider('google/gemini-2.5-pro', {
        config: {
          temperature: 0.7,
          max_tokens: 100,
        },
      });

      expect(provider.toJSON()).toEqual({
        provider: 'openrouter',
        model: 'google/gemini-2.5-pro',
        config: {
          temperature: 0.7,
          max_tokens: 100,
          apiKeyEnvar: 'OPENROUTER_API_KEY',
          apiBaseUrl: OPENROUTER_API_BASE,
          passthrough: {},
        },
      });
    });

    it('should preserve custom apiBaseUrl and apiKeyEnvar overrides', () => {
      const restoreEnv = mockProcessEnv({ CUSTOM_OPENROUTER_KEY: 'custom-test-key' });

      try {
        const provider = new OpenRouterProvider('google/gemini-2.5-pro', {
          config: {
            apiBaseUrl: 'https://proxy.example.com/openrouter/api/v1',
            apiKeyEnvar: 'CUSTOM_OPENROUTER_KEY',
          },
        });

        expect(provider.config.apiBaseUrl).toBe('https://proxy.example.com/openrouter/api/v1');
        expect(provider.config.apiKeyEnvar).toBe('CUSTOM_OPENROUTER_KEY');
        expect(provider.getApiKey()).toBe('custom-test-key');
      } finally {
        restoreEnv();
      }
    });

    it('should fall back to the default apiBaseUrl and apiKeyEnvar when none are configured', () => {
      const provider = new OpenRouterProvider('google/gemini-2.5-pro', {});

      expect(provider.config.apiBaseUrl).toBe(OPENROUTER_API_BASE);
      expect(provider.config.apiKeyEnvar).toBe('OPENROUTER_API_KEY');
    });

    it('should fall back to the default when apiBaseUrl or apiKeyEnvar is an empty string', () => {
      const provider = new OpenRouterProvider('google/gemini-2.5-pro', {
        config: {
          apiBaseUrl: '',
          apiKeyEnvar: '',
        },
      });

      expect(provider.config.apiBaseUrl).toBe(OPENROUTER_API_BASE);
      expect(provider.config.apiKeyEnvar).toBe('OPENROUTER_API_KEY');
    });

    it('should call the configured apiBaseUrl instead of the default OpenRouter host', async () => {
      const restoreEnv = mockProcessEnv({ CUSTOM_OPENROUTER_KEY: 'custom-test-key' });

      try {
        const customApiBaseUrl = 'https://proxy.example.com/openrouter/api/v1';
        const provider = new OpenRouterProvider('google/gemini-2.5-pro', {
          config: {
            apiBaseUrl: customApiBaseUrl,
            apiKeyEnvar: 'CUSTOM_OPENROUTER_KEY',
          },
        });

        const response = new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Test output' }, finish_reason: 'stop' }],
            usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
          }),
          {
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'Content-Type': 'application/json' }),
          },
        );
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        await provider.callApi('Test prompt');

        const [url, init] = mockedFetchWithRetries.mock.calls[0] ?? [];
        expect(url).toBe(`${customApiBaseUrl}/chat/completions`);
        expect((init as RequestInit | undefined)?.headers).toMatchObject({
          Authorization: 'Bearer custom-test-key',
        });
      } finally {
        restoreEnv();
      }
    });

    it('should call the default OpenRouter host when no apiBaseUrl override is configured', async () => {
      const restoreEnv = mockProcessEnv({ OPENROUTER_API_KEY: 'default-test-key' });

      try {
        const provider = new OpenRouterProvider('google/gemini-2.5-pro', {});

        const response = new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Default host output' }, finish_reason: 'stop' }],
            usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
          }),
          {
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'Content-Type': 'application/json' }),
          },
        );
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        await provider.callApi('Test prompt');

        const [url, init] = mockedFetchWithRetries.mock.calls[0] ?? [];
        expect(url).toBe(`${OPENROUTER_API_BASE}/chat/completions`);
        expect((init as RequestInit | undefined)?.headers).toMatchObject({
          Authorization: 'Bearer default-test-key',
        });
      } finally {
        restoreEnv();
      }
    });

    it.each([
      ['a null body', null],
      ['missing choices', {}],
      ['null choices', { choices: null }],
      ['non-array choices', { choices: { 0: { message: { content: 'wrong shape' } } } }],
      ['empty choices', { choices: [] }],
      ['a null first choice', { choices: [null] }],
      ['a missing message', { choices: [{}] }],
      ['a null message', { choices: [{ message: null }] }],
      ['a primitive message', { choices: [{ message: 'wrong shape' }] }],
      ['an array message', { choices: [{ message: [] }] }],
      ['an empty message', { choices: [{ message: {} }] }],
      ['object content', { choices: [{ message: { content: { private: 'secret' } } }] }],
      ['numeric content', { choices: [{ message: { content: 42 } }] }],
      ['true content', { choices: [{ message: { content: true } }] }],
      ['false content', { choices: [{ message: { content: false } }] }],
      ['zero content', { choices: [{ message: { content: 0 } }] }],
      ['an invalid content array', { choices: [{ message: { content: [42] } }] }],
      ['an invalid function call', { choices: [{ message: { function_call: { name: 42 } } }] }],
      ['an invalid tool call', { choices: [{ message: { tool_calls: [null] } }] }],
    ])('returns a structured error for %s', async (_description, responseBody) => {
      const restoreEnv = mockProcessEnv({ OPENROUTER_API_KEY: 'test-key' });

      try {
        const provider = new OpenRouterProvider('google/gemini-2.5-pro', {});

        // A malformed 200 response must resolve through the provider error contract.
        const response = new Response(JSON.stringify(responseBody), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await provider.callApi('Test prompt');
        expect(result.error).toBe('Malformed response data: expected choices[0].message');
        expect(result.cached).toBe(false);
        expect(result.output).toBeUndefined();
        expect(result.tokenUsage).toEqual({ numRequests: 1 });
      } finally {
        restoreEnv();
      }
    });

    it('preserves structured array content allowed by OpenRouter', async () => {
      const restoreEnv = mockProcessEnv({ OPENROUTER_API_KEY: 'test-key' });

      try {
        const provider = new OpenRouterProvider('google/gemini-2.5-pro', {});
        const content = [
          { type: 'text', text: 'Hello' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } },
        ];
        mockedFetchWithRetries.mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              choices: [{ message: { content }, finish_reason: 'stop' }],
              usage: { total_tokens: 2, prompt_tokens: 1, completion_tokens: 1 },
            }),
            {
              status: 200,
              statusText: 'OK',
              headers: new Headers({ 'Content-Type': 'application/json' }),
            },
          ),
        );

        const result = await provider.callApi('Test prompt');

        expect(result.output).toEqual(content);
      } finally {
        restoreEnv();
      }
    });

    it('evicts malformed responses while preserving bounded accounting metadata', async () => {
      const restoreEnv = mockProcessEnv({ OPENROUTER_API_KEY: 'test-key' });

      try {
        const provider = new OpenRouterProvider('gpt-4o', {
          config: { inputCost: 0.001, outputCost: 0.002 },
        });
        const malformedResponse = new Response(
          JSON.stringify({
            choices: [],
            usage: { total_tokens: 5, prompt_tokens: 3, completion_tokens: 2 },
            private: 'must-not-appear',
            padding: 'x'.repeat(10_000),
          }),
          {
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'Content-Type': 'application/json' }),
          },
        );
        const recoveredResponse = new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Recovered' }, finish_reason: 'stop' }],
            usage: { total_tokens: 5, prompt_tokens: 3, completion_tokens: 2 },
          }),
          {
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'Content-Type': 'application/json' }),
          },
        );
        mockedFetchWithRetries
          .mockResolvedValueOnce(malformedResponse)
          .mockResolvedValueOnce(recoveredResponse);

        const malformed = await provider.callApi('Test prompt');
        expect(malformed).toEqual({
          error: 'Malformed response data: expected choices[0].message',
          tokenUsage: { total: 5, prompt: 3, completion: 2, numRequests: 1 },
          cached: false,
          cost: 0.007,
        });

        const recovered = await provider.callApi('Test prompt');
        expect(recovered.output).toBe('Recovered');
        expect(mockedFetchWithRetries).toHaveBeenCalledTimes(2);
      } finally {
        restoreEnv();
      }
    });

    it('treats a documented choice-level error as an error and evicts it', async () => {
      const restoreEnv = mockProcessEnv({ OPENROUTER_API_KEY: 'test-key' });

      try {
        const privateDiagnostic = `PRIVATE_DIAGNOSTIC_${'x'.repeat(10_000)}`;
        const provider = new OpenRouterProvider('gpt-4o', {
          config: { inputCost: 0.001, outputCost: 0.002 },
        });
        const choiceErrorResponse = new Response(
          JSON.stringify({
            choices: [
              {
                message: { content: 'partial output must not be graded' },
                finish_reason: 'error',
                error: { code: 502, message: privateDiagnostic },
              },
            ],
            usage: { total_tokens: 5, prompt_tokens: 3, completion_tokens: 2 },
          }),
          {
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'Content-Type': 'application/json' }),
          },
        );
        const recoveredResponse = new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Recovered' }, finish_reason: 'stop' }],
            usage: { total_tokens: 5, prompt_tokens: 3, completion_tokens: 2 },
          }),
          {
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'Content-Type': 'application/json' }),
          },
        );
        mockedFetchWithRetries
          .mockResolvedValueOnce(choiceErrorResponse)
          .mockResolvedValueOnce(recoveredResponse);

        const failed = await provider.callApi('Test prompt');
        expect(failed.error).toBe('API error: OpenRouter provider returned a generation error');
        expect(failed.error).not.toContain('PRIVATE_DIAGNOSTIC');
        expect(failed.error).not.toContain('partial output must not be graded');
        expect(failed).toMatchObject({
          tokenUsage: { total: 5, prompt: 3, completion: 2, numRequests: 1 },
          cached: false,
          cost: 0.007,
          finishReason: 'error',
        });
        expect(failed.output).toBeUndefined();

        const recovered = await provider.callApi('Test prompt');
        expect(recovered.output).toBe('Recovered');
        expect(mockedFetchWithRetries).toHaveBeenCalledTimes(2);
      } finally {
        restoreEnv();
      }
    });

    it('retries a documented choice-level rate limit without exposing its diagnostic', async () => {
      const restoreEnv = mockProcessEnv({ OPENROUTER_API_KEY: 'test-key' });
      const registry = new RateLimitRegistry({ maxConcurrency: 1, queueTimeoutMs: 100 });

      try {
        const provider = new OpenRouterProvider('gpt-4o', { config: { maxRetries: 1 } });
        mockedFetchWithRetries
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify({
                choices: [
                  {
                    message: { content: 'partial output' },
                    finish_reason: 'error',
                    error: { code: 429, message: 'PRIVATE_RATE_LIMIT_DIAGNOSTIC' },
                  },
                ],
              }),
              {
                status: 200,
                statusText: 'OK',
                headers: new Headers({ 'Content-Type': 'application/json' }),
              },
            ),
          )
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify({
                choices: [{ message: { content: 'Recovered' }, finish_reason: 'stop' }],
              }),
              {
                status: 200,
                statusText: 'OK',
                headers: new Headers({ 'Content-Type': 'application/json' }),
              },
            ),
          );

        const result = await registry.execute(provider, () => provider.callApi('Test prompt'), {
          ...createProviderRateLimitOptions(),
          getRetryAfter: () => 0,
        });

        expect(result.output).toBe('Recovered');
        expect(JSON.stringify(result)).not.toContain('PRIVATE_RATE_LIMIT_DIAGNOSTIC');
        expect(mockedFetchWithRetries).toHaveBeenCalledTimes(2);
      } finally {
        registry.dispose();
        restoreEnv();
      }
    });

    it('should preserve a trailing slash on the configured apiBaseUrl as-is', async () => {
      const restoreEnv = mockProcessEnv({ OPENROUTER_API_KEY: 'test-key' });

      try {
        const customApiBaseUrl = 'https://proxy.example.com/openrouter/api/v1/';
        const provider = new OpenRouterProvider('google/gemini-2.5-pro', {
          config: {
            apiBaseUrl: customApiBaseUrl,
          },
        });

        const response = new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Test output' }, finish_reason: 'stop' }],
            usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
          }),
          {
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'Content-Type': 'application/json' }),
          },
        );
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        await provider.callApi('Test prompt');

        const [url] = mockedFetchWithRetries.mock.calls[0] ?? [];
        expect(url).toBe(`${customApiBaseUrl}/chat/completions`);
      } finally {
        restoreEnv();
      }
    });

    it('should combine apiBaseUrl override with passthrough options on the request body', async () => {
      const restoreEnv = mockProcessEnv({ OPENROUTER_API_KEY: 'test-key' });

      try {
        const customApiBaseUrl = 'https://proxy.example.com/openrouter/api/v1';
        const provider = new OpenRouterProvider('google/gemini-2.5-pro', {
          config: {
            apiBaseUrl: customApiBaseUrl,
            route: 'fallback',
            models: ['google/gemini-2.5-pro', 'anthropic/claude-sonnet-4.6'],
          },
        });

        const response = new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Test output' }, finish_reason: 'stop' }],
            usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
          }),
          {
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'Content-Type': 'application/json' }),
          },
        );
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        await provider.callApi('Test prompt');

        const [url, init] = mockedFetchWithRetries.mock.calls[0] ?? [];
        expect(url).toBe(`${customApiBaseUrl}/chat/completions`);
        const body = JSON.parse((init as RequestInit | undefined)?.body as string);
        expect(body.route).toBe('fallback');
        expect(body.models).toEqual(['google/gemini-2.5-pro', 'anthropic/claude-sonnet-4.6']);
      } finally {
        restoreEnv();
      }
    });

    describe('Thinking tokens handling', () => {
      beforeEach(() => {
        mockProcessEnv({ OPENROUTER_API_KEY: 'test-key' });
      });

      afterEach(() => {
        mockProcessEnv({ OPENROUTER_API_KEY: undefined });
      });

      it('should handle reasoning field correctly when both reasoning and content are present', async () => {
        const mockResponse = {
          choices: [
            {
              message: {
                content:
                  '<transcript>The sentence is a pangram containing all alphabet letters.</transcript>\n<confidence>green</confidence>',
                reasoning:
                  'I need to analyze the given text and provide a summary in the requested format. The text states that "The quick brown fox jumps over the lazy dog" is a pangram that contains all letters of the alphabet. Let me format this according to the XML structure requested.',
              },
            },
          ],
          usage: { total_tokens: 50, prompt_tokens: 20, completion_tokens: 30 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await provider.callApi('Analyze text and provide summary with XML tags');

        // Should include both thinking and content when showThinking is true (default)
        const expectedOutput = `Thinking: I need to analyze the given text and provide a summary in the requested format. The text states that "The quick brown fox jumps over the lazy dog" is a pangram that contains all letters of the alphabet. Let me format this according to the XML structure requested.\n\n<transcript>The sentence is a pangram containing all alphabet letters.</transcript>\n<confidence>green</confidence>`;
        expect(result.output).toBe(expectedOutput);
        expect(result.tokenUsage).toEqual({
          total: 50,
          prompt: 20,
          completion: 30,
          numRequests: 1,
        });
      });

      it('should hide reasoning when showThinking is false', async () => {
        const providerWithoutThinking = new OpenRouterProvider('google/gemini-2.5-pro', {
          config: { showThinking: false },
        });

        const mockResponse = {
          choices: [
            {
              message: {
                content:
                  '<transcript>The sentence is a pangram containing all alphabet letters.</transcript>\n<confidence>green</confidence>',
                reasoning:
                  'I need to analyze the given text and provide a summary in the requested format.',
              },
            },
          ],
          usage: { total_tokens: 50, prompt_tokens: 20, completion_tokens: 30 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await providerWithoutThinking.callApi(
          'Analyze text and provide summary with XML tags',
        );

        // Should only show content, not reasoning
        expect(result.output).toBe(
          '<transcript>The sentence is a pangram containing all alphabet letters.</transcript>\n<confidence>green</confidence>',
        );
        expect(result.tokenUsage).toEqual({
          total: 50,
          prompt: 20,
          completion: 30,
          numRequests: 1,
        });
      });

      it('should handle responses with only reasoning and no content', async () => {
        const mockResponse = {
          choices: [
            {
              message: {
                reasoning: 'This is the thinking process for the response.',
                content: null,
              },
            },
          ],
          usage: { total_tokens: 50, prompt_tokens: 20, completion_tokens: 30 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await provider.callApi('Test prompt');

        // Should show reasoning when content is null
        expect(result.output).toBe('This is the thinking process for the response.');
        expect(result.tokenUsage).toEqual({
          total: 50,
          prompt: 20,
          completion: 30,
          numRequests: 1,
        });
      });

      it('should handle models with reasoning field', async () => {
        const nonGeminiProvider = new OpenRouterProvider('anthropic/claude-opus-4.7', {});

        const mockResponse = {
          choices: [
            {
              message: {
                content: 'Regular response with reasoning',
                reasoning: 'Thinking about the best way to respond to this query',
              },
            },
          ],
          usage: { total_tokens: 30, prompt_tokens: 10, completion_tokens: 20 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await nonGeminiProvider.callApi('Test prompt');

        // All models now handle reasoning field when present
        const expectedOutput =
          'Thinking: Thinking about the best way to respond to this query\n\nRegular response with reasoning';
        expect(result.output).toBe(expectedOutput);
        expect(result.tokenUsage).toEqual({
          total: 30,
          prompt: 10,
          completion: 20,
          numRequests: 1,
        });
      });

      it('should handle models without reasoning field', async () => {
        const provider = new OpenRouterProvider('anthropic/claude-opus-4.7', {});

        const mockResponse = {
          choices: [
            {
              message: {
                content: 'Regular response without reasoning',
              },
            },
          ],
          usage: { total_tokens: 30, prompt_tokens: 10, completion_tokens: 20 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await provider.callApi('Test prompt');

        expect(result.output).toBe('Regular response without reasoning');
        expect(result.tokenUsage).toEqual({
          total: 30,
          prompt: 10,
          completion: 20,
          numRequests: 1,
        });
      });

      it('should handle empty reasoning field', async () => {
        const mockResponse = {
          choices: [
            {
              message: {
                content: 'Response with empty reasoning',
                reasoning: '',
              },
            },
          ],
          usage: { total_tokens: 30, prompt_tokens: 10, completion_tokens: 20 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await provider.callApi('Test prompt');

        // Should not add "Thinking:" prefix for empty reasoning
        expect(result.output).toBe('Response with empty reasoning');
        expect(result.tokenUsage).toEqual({
          total: 30,
          prompt: 10,
          completion: 20,
          numRequests: 1,
        });
      });

      it('should handle tool calls without including reasoning when showThinking is false', async () => {
        const providerWithoutThinking = new OpenRouterProvider('google/gemini-2.5-pro', {
          config: { showThinking: false },
        });

        const mockToolCall = {
          id: 'call_abc123',
          type: 'function',
          function: {
            name: 'get_weather',
            arguments: '{"location": "San Francisco", "unit": "celsius"}',
          },
        };

        const mockResponse = {
          choices: [
            {
              message: {
                content: null,
                tool_calls: [mockToolCall],
                reasoning:
                  'I need to check the weather for San Francisco to answer the user query.',
              },
            },
          ],
          usage: { total_tokens: 60, prompt_tokens: 25, completion_tokens: 35 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await providerWithoutThinking.callApi(
          'What is the weather in San Francisco?',
        );

        // Should return tool_calls directly without any reasoning
        expect(result.output).toEqual([mockToolCall]);
        expect(result.tokenUsage).toEqual({
          total: 60,
          prompt: 25,
          completion: 35,
          numRequests: 1,
        });
      });

      it('should handle function calls without including reasoning when showThinking is false', async () => {
        const providerWithoutThinking = new OpenRouterProvider('google/gemini-2.5-pro', {
          config: { showThinking: false },
        });

        const mockFunctionCall = {
          name: 'get_current_time',
          arguments: '{"timezone": "UTC"}',
        };

        const mockResponse = {
          choices: [
            {
              message: {
                content: null,
                function_call: mockFunctionCall,
                reasoning:
                  'The user wants to know the current time, I should call the time function.',
              },
            },
          ],
          usage: { total_tokens: 45, prompt_tokens: 15, completion_tokens: 30 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await providerWithoutThinking.callApi('What time is it?');

        // Should return function_call directly without any reasoning
        expect(result.output).toEqual(mockFunctionCall);
        expect(result.tokenUsage).toEqual({
          total: 45,
          prompt: 15,
          completion: 30,
          numRequests: 1,
        });
      });

      it('should handle tool calls without including reasoning even when showThinking is true', async () => {
        // Using the default provider which has showThinking enabled by default
        const mockToolCall = {
          id: 'call_xyz789',
          type: 'function',
          function: {
            name: 'search_database',
            arguments: '{"query": "latest sales data"}',
          },
        };

        const mockResponse = {
          choices: [
            {
              message: {
                content: null,
                tool_calls: [mockToolCall],
                reasoning:
                  'I need to search the database for the latest sales data to provide accurate information.',
              },
            },
          ],
          usage: { total_tokens: 55, prompt_tokens: 20, completion_tokens: 35 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await provider.callApi('Show me the latest sales data');

        // Tool calls should never include reasoning, regardless of showThinking setting
        expect(result.output).toEqual([mockToolCall]);
        expect(result.tokenUsage).toEqual({
          total: 55,
          prompt: 20,
          completion: 35,
          numRequests: 1,
        });
      });

      it('should handle tool calls when content is empty string', async () => {
        const mockToolCall = {
          id: 'call_abc123',
          type: 'function',
          function: {
            name: 'get_current_weather',
            arguments: '{"location": "New York, NY", "unit": "fahrenheit"}',
          },
        };

        const mockResponse = {
          choices: [
            {
              message: {
                content: '', // Empty string
                tool_calls: [mockToolCall],
              },
            },
          ],
          usage: { total_tokens: 50, prompt_tokens: 20, completion_tokens: 30 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await provider.callApi('What is the weather in New York?');

        // Should return tool_calls when content is empty string
        expect(result.output).toEqual([mockToolCall]);
        expect(result.tokenUsage).toEqual({
          total: 50,
          prompt: 20,
          completion: 30,
          numRequests: 1,
        });
      });

      it('should handle tool calls when content is whitespace only', async () => {
        const mockToolCall = {
          id: 'call_def456',
          type: 'function',
          function: {
            name: 'get_current_weather',
            arguments: '{"location": "New York, NY", "unit": "fahrenheit"}',
          },
        };

        const mockResponse = {
          choices: [
            {
              message: {
                content: '\n\n', // Whitespace only
                tool_calls: [mockToolCall],
              },
            },
          ],
          usage: { total_tokens: 50, prompt_tokens: 20, completion_tokens: 30 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await provider.callApi('What is the weather?');

        // Should return tool_calls when content is only whitespace
        expect(result.output).toEqual([mockToolCall]);
        expect(result.tokenUsage).toEqual({
          total: 50,
          prompt: 20,
          completion: 30,
          numRequests: 1,
        });
      });

      it('should handle function calls when content is whitespace only', async () => {
        const mockFunctionCall = {
          name: 'calculate_sum',
          arguments: '{"a": 5, "b": 10}',
        };

        const mockResponse = {
          choices: [
            {
              message: {
                content: '  \t  ', // Various whitespace characters
                function_call: mockFunctionCall,
              },
            },
          ],
          usage: { total_tokens: 40, prompt_tokens: 15, completion_tokens: 25 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await provider.callApi('Calculate 5 + 10');

        // Should return function_call when content is only whitespace
        expect(result.output).toEqual(mockFunctionCall);
        expect(result.tokenUsage).toEqual({
          total: 40,
          prompt: 15,
          completion: 25,
          numRequests: 1,
        });
      });

      it('should handle tool calls with reasoning when content is whitespace only', async () => {
        const mockToolCall = {
          id: 'call_ghi789',
          type: 'function',
          function: {
            name: 'get_stock_price',
            arguments: '{"symbol": "AAPL"}',
          },
        };

        const mockResponse = {
          choices: [
            {
              message: {
                content: '\t\n \n\t', // Mixed whitespace
                tool_calls: [mockToolCall],
                reasoning: 'The user wants to know the stock price for Apple Inc.',
              },
            },
          ],
          usage: { total_tokens: 60, prompt_tokens: 25, completion_tokens: 35 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await provider.callApi('What is AAPL stock price?');

        // Should return tool_calls, ignoring reasoning when there are tool calls
        expect(result.output).toEqual([mockToolCall]);
        expect(result.tokenUsage).toEqual({
          total: 60,
          prompt: 25,
          completion: 35,
          numRequests: 1,
        });
      });

      it('should prioritize tool calls over content+reasoning when all three are present (fixes Qwen thinking models)', async () => {
        const providerWithoutThinking = new OpenRouterProvider(
          'qwen/qwen3-235b-a22b-thinking-2507',
          {
            config: { showThinking: false },
          },
        );

        const mockToolCall = {
          id: 'call_qwen_thinking_fix',
          type: 'function',
          function: {
            name: 'get_weather',
            arguments: '{"location": "San Francisco"}',
          },
        };

        const mockResponse = {
          choices: [
            {
              message: {
                // This is the problematic scenario: model returns ALL THREE fields
                content: 'I need to get the weather for San Francisco.',
                reasoning:
                  'The user is asking for weather information. I should use the get_weather function with San Francisco as the location parameter.',
                tool_calls: [mockToolCall],
              },
            },
          ],
          usage: { total_tokens: 100, prompt_tokens: 50, completion_tokens: 50 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await providerWithoutThinking.callApi('Get weather for San Francisco');

        // Should prioritize tool_calls and ignore content+reasoning when showThinking is false
        expect(result.output).toEqual([mockToolCall]);
        expect(result.tokenUsage).toEqual({
          total: 100,
          prompt: 50,
          completion: 50,
          numRequests: 1,
        });
      });

      it('should prioritize tool calls over content+reasoning even when showThinking is true', async () => {
        // Using the default provider which has showThinking enabled by default
        const mockToolCall = {
          id: 'call_qwen_thinking_enabled',
          type: 'function',
          function: {
            name: 'search_database',
            arguments: '{"query": "user data"}',
          },
        };

        const mockResponse = {
          choices: [
            {
              message: {
                // All three fields present
                content: 'I will search the database for user data.',
                reasoning:
                  'The user wants to find information in the database. I should call the search function.',
                tool_calls: [mockToolCall],
              },
            },
          ],
          usage: { total_tokens: 80, prompt_tokens: 40, completion_tokens: 40 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await provider.callApi('Search for user data');

        // Tool calls should always take priority, regardless of showThinking setting
        expect(result.output).toEqual([mockToolCall]);
        expect(result.tokenUsage).toEqual({
          total: 80,
          prompt: 40,
          completion: 40,
          numRequests: 1,
        });
      });

      it('should handle responses with empty content and reasoning when showThinking is false', async () => {
        const providerWithoutThinking = new OpenRouterProvider('some/thinking-model', {
          config: { showThinking: false },
        });

        const mockResponse = {
          choices: [
            {
              message: {
                content: '',
                reasoning: 'Some thinking process here',
                // No tool_calls
              },
            },
          ],
          usage: { total_tokens: 30, prompt_tokens: 15, completion_tokens: 15 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await providerWithoutThinking.callApi('Test prompt');

        // Should return empty string when content is empty and showThinking is false
        expect(result.output).toBe('');
        expect(result.tokenUsage).toEqual({
          total: 30,
          prompt: 15,
          completion: 15,
          numRequests: 1,
        });
      });

      it('should handle responses with only reasoning and no content/tools when showThinking is false', async () => {
        const providerWithoutThinking = new OpenRouterProvider('some/reasoning-model', {
          config: { showThinking: false },
        });

        const mockResponse = {
          choices: [
            {
              message: {
                // No content, no tool_calls
                reasoning: 'This is only reasoning content',
              },
            },
          ],
          usage: { total_tokens: 25, prompt_tokens: 10, completion_tokens: 15 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await providerWithoutThinking.callApi('Test prompt');

        // Should return empty string when only reasoning is available and showThinking is false
        expect(result.output).toBe('');
        expect(result.tokenUsage).toEqual({
          total: 25,
          prompt: 10,
          completion: 15,
          numRequests: 1,
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

      it('should pass through OpenRouter-specific options', async () => {
        const providerWithOptions = new OpenRouterProvider('google/gemini-2.5-pro', {
          config: {
            transforms: ['strip-xml-tags'],
            models: ['google/gemini-2.5-pro', 'anthropic/claude-opus-4.7'],
            route: 'fallback',
            provider: {
              order: ['google', 'anthropic'],
            },
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

        await providerWithOptions.callApi('Test prompt');

        const lastCall = mockedFetchWithRetries.mock.calls[0];
        if (!lastCall) {
          throw new Error('Expected fetch to have been called');
        }
        const requestBody = JSON.parse((lastCall[1] as { body: string }).body);

        expect(requestBody.transforms).toEqual(['strip-xml-tags']);
        expect(requestBody.models).toEqual(['google/gemini-2.5-pro', 'anthropic/claude-opus-4.7']);
        expect(requestBody.route).toBe('fallback');
        expect(requestBody.provider).toEqual({ order: ['google', 'anthropic'] });
      });
    });

    describe('JSON schema response format handling', () => {
      beforeEach(() => {
        mockProcessEnv({ OPENROUTER_API_KEY: 'test-key' });
      });

      afterEach(() => {
        mockProcessEnv({ OPENROUTER_API_KEY: undefined });
      });

      it('should parse JSON output when response_format.type is json_schema', async () => {
        const providerWithJsonSchema = new OpenRouterProvider('google/gemini-2.5-pro', {
          config: {
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'test_schema',
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    age: { type: 'number' },
                  },
                },
              },
            },
          },
        });

        const mockResponse = {
          choices: [
            {
              message: {
                content: '{"name": "John Doe", "age": 30}',
              },
            },
          ],
          usage: { total_tokens: 50, prompt_tokens: 20, completion_tokens: 30 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await providerWithJsonSchema.callApi('Generate JSON');

        // Should parse the JSON string into an object
        expect(result.output).toEqual({
          name: 'John Doe',
          age: 30,
        });
        expect(result.tokenUsage).toEqual({
          total: 50,
          prompt: 20,
          completion: 30,
          numRequests: 1,
        });
      });

      it('should handle invalid JSON gracefully when response_format.type is json_schema', async () => {
        const providerWithJsonSchema = new OpenRouterProvider('google/gemini-2.5-pro', {
          config: {
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'test_schema',
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                  },
                },
              },
            },
          },
        });

        const mockResponse = {
          choices: [
            {
              message: {
                content: 'This is not valid JSON { broken: }',
              },
            },
          ],
          usage: { total_tokens: 50, prompt_tokens: 20, completion_tokens: 30 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await providerWithJsonSchema.callApi('Generate JSON');

        // Should return the original string when JSON parsing fails
        expect(result.output).toBe('This is not valid JSON { broken: }');
        expect(result.tokenUsage).toEqual({
          total: 50,
          prompt: 20,
          completion: 30,
          numRequests: 1,
        });
      });

      it('should not parse JSON when response_format.type is not json_schema', async () => {
        const regularProvider = new OpenRouterProvider('google/gemini-2.5-pro', {});

        const mockResponse = {
          choices: [
            {
              message: {
                content: '{"name": "John Doe", "age": 30}',
              },
            },
          ],
          usage: { total_tokens: 50, prompt_tokens: 20, completion_tokens: 30 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await regularProvider.callApi('Generate JSON');

        // Should return the string as-is without parsing
        expect(result.output).toBe('{"name": "John Doe", "age": 30}');
        expect(result.tokenUsage).toEqual({
          total: 50,
          prompt: 20,
          completion: 30,
          numRequests: 1,
        });
      });

      it('should handle json_schema with reasoning field', async () => {
        const providerWithJsonSchema = new OpenRouterProvider('google/gemini-2.5-pro', {
          config: {
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'test_schema',
                schema: {
                  type: 'object',
                  properties: {
                    result: { type: 'string' },
                  },
                },
              },
            },
          },
        });

        const mockResponse = {
          choices: [
            {
              message: {
                content: '{"result": "success"}',
                reasoning: 'I formatted the response as JSON according to the schema',
              },
            },
          ],
          usage: { total_tokens: 50, prompt_tokens: 20, completion_tokens: 30 },
        };

        const response = new Response(JSON.stringify(mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        });
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        const result = await providerWithJsonSchema.callApi('Generate JSON with reasoning');

        // Should parse JSON after adding reasoning prefix
        // The output is built as "Thinking: ...\n\n{content}" and then parsed
        // Since the combined string is not valid JSON, it should return as-is
        expect(result.output).toStrictEqual({ result: 'success' });
        expect(result.tokenUsage).toEqual({
          total: 50,
          prompt: 20,
          completion: 30,
          numRequests: 1,
        });
      });
    });
  });
});
