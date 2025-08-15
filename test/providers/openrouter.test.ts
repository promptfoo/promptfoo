import { clearCache } from '../../src/cache';
import * as fetchModule from '../../src/fetch';
import { OpenRouterProvider } from '../../src/providers/openrouter';

const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';

jest.mock('../../src/util', () => ({
  maybeLoadFromExternalFile: jest.fn((x) => x),
  renderVarsInObject: jest.fn((x) => x),
}));

jest.mock('../../src/fetch');

describe('OpenRouter', () => {
  const mockedFetchWithRetries = jest.mocked(fetchModule.fetchWithRetries);

  afterEach(async () => {
    await clearCache();
    jest.clearAllMocks();
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
        expect(result.tokenUsage).toEqual({ total: 50, prompt: 20, completion: 30 });
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
        expect(result.tokenUsage).toEqual({ total: 50, prompt: 20, completion: 30 });
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
        expect(result.tokenUsage).toEqual({ total: 50, prompt: 20, completion: 30 });
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
        expect(result.tokenUsage).toEqual({ total: 30, prompt: 10, completion: 20 });
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
        expect(result.tokenUsage).toEqual({ total: 30, prompt: 10, completion: 20 });
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
        expect(result.tokenUsage).toEqual({ total: 30, prompt: 10, completion: 20 });
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
  });
});
