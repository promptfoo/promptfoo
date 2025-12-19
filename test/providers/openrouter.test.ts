import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache } from '../../src/cache';
import { OpenRouterProvider } from '../../src/providers/openrouter';
import * as fetchModule from '../../src/util/fetch/index';

const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';

vi.mock('../../src/util', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    maybeLoadFromExternalFile: vi.fn((x) => x),
    renderVarsInObject: vi.fn((x) => x),
  };
});

vi.mock('../../src/util/fetch');

describe('OpenRouter', () => {
  const mockedFetchWithRetries = vi.mocked(fetchModule.fetchWithRetries);

  afterEach(async () => {
    await clearCache();
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

    describe('Thinking tokens handling', () => {
      beforeEach(() => {
        process.env.OPENROUTER_API_KEY = 'test-key';
      });

      afterEach(() => {
        delete process.env.OPENROUTER_API_KEY;
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
        const nonGeminiProvider = new OpenRouterProvider('anthropic/claude-3.5-sonnet', {});

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
        const provider = new OpenRouterProvider('anthropic/claude-3.5-sonnet', {});

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
            models: ['google/gemini-2.5-pro', 'anthropic/claude-3.5-sonnet'],
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
        expect(requestBody.models).toEqual([
          'google/gemini-2.5-pro',
          'anthropic/claude-3.5-sonnet',
        ]);
        expect(requestBody.route).toBe('fallback');
        expect(requestBody.provider).toEqual({ order: ['google', 'anthropic'] });
      });
    });

    describe('JSON schema response format handling', () => {
      beforeEach(() => {
        process.env.OPENROUTER_API_KEY = 'test-key';
      });

      afterEach(() => {
        delete process.env.OPENROUTER_API_KEY;
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
