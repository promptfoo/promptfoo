import * as cache from '../../../src/cache';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';
import { OpenAiResponsesProvider } from '../../../src/providers/openai/responses';

jest.mock('../../../src/cache', () => ({
  fetchWithCache: jest.fn(),
}));

jest.mock('../../../src/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('GPT-OSS Models in OpenAI Provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Model Recognition', () => {
    it('should recognize gpt-oss-120b as a valid chat model', () => {
      const provider = new OpenAiChatCompletionProvider('gpt-oss-120b', {
        config: { apiKey: 'test-key' },
      });
      expect(provider.id()).toBe('openai:gpt-oss-120b');
      expect(OpenAiChatCompletionProvider.OPENAI_CHAT_MODEL_NAMES).toContain('gpt-oss-120b');
    });

    it('should recognize gpt-oss-20b as a valid chat model', () => {
      const provider = new OpenAiChatCompletionProvider('gpt-oss-20b', {
        config: { apiKey: 'test-key' },
      });
      expect(provider.id()).toBe('openai:gpt-oss-20b');
      expect(OpenAiChatCompletionProvider.OPENAI_CHAT_MODEL_NAMES).toContain('gpt-oss-20b');
    });

    it('should recognize gpt-oss models in responses provider', () => {
      expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-oss-120b');
      expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-oss-20b');
    });
  });

  describe('Reasoning Model Behavior', () => {
    it('should identify gpt-oss-120b as a reasoning model', () => {
      const provider = new OpenAiChatCompletionProvider('gpt-oss-120b', {
        config: { apiKey: 'test-key' },
      });
      expect(provider['isReasoningModel']()).toBe(true);
    });

    it('should identify gpt-oss-20b as a reasoning model', () => {
      const provider = new OpenAiChatCompletionProvider('gpt-oss-20b', {
        config: { apiKey: 'test-key' },
      });
      expect(provider['isReasoningModel']()).toBe(true);
    });

    it('should support temperature for gpt-oss models unlike other reasoning models', () => {
      const gptOssProvider = new OpenAiChatCompletionProvider('gpt-oss-120b', {
        config: { apiKey: 'test-key' },
      });
      const o1Provider = new OpenAiChatCompletionProvider('o1', {
        config: { apiKey: 'test-key' },
      });

      expect(gptOssProvider['supportsTemperature']()).toBe(true);
      expect(o1Provider['supportsTemperature']()).toBe(false);
    });
  });

  describe('Chat Completion API Calls', () => {
    it('should handle reasoning_effort parameter for gpt-oss-120b', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Test response with high reasoning',
              role: 'assistant',
            },
            index: 0,
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue({
        data: mockResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const provider = new OpenAiChatCompletionProvider('gpt-oss-120b', {
        config: {
          apiKey: 'test-key',
          reasoning_effort: 'high',
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.output).toBe('Test response with high reasoning');

      // Check that the API was called with reasoning_effort
      const apiCall = jest.mocked(cache.fetchWithCache).mock.calls[0];
      const body = JSON.parse((apiCall[1] as any).body);
      expect(body.reasoning_effort).toBe('high');
      expect(body.model).toBe('gpt-oss-120b');
    });

    it('should include temperature for gpt-oss models', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Response with temperature',
              role: 'assistant',
            },
            index: 0,
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue({
        data: mockResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const provider = new OpenAiChatCompletionProvider('gpt-oss-20b', {
        config: {
          apiKey: 'test-key',
          temperature: 0.7,
          reasoning_effort: 'medium',
        },
      });

      await provider.callApi('Test prompt');

      const apiCall = jest.mocked(cache.fetchWithCache).mock.calls[0];
      const body = JSON.parse((apiCall[1] as any).body);

      // gpt-oss should support both temperature and reasoning_effort
      expect(body.temperature).toBe(0.7);
      expect(body.reasoning_effort).toBe('medium');
      // Default max_completion_tokens is not set unless explicitly provided
      expect(body.max_tokens).toBeUndefined(); // Should use max_completion_tokens for reasoning models
    });

    it('should use max_completion_tokens for gpt-oss models', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Test response',
              role: 'assistant',
            },
            index: 0,
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue({
        data: mockResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const provider = new OpenAiChatCompletionProvider('gpt-oss-120b', {
        config: {
          apiKey: 'test-key',
          max_completion_tokens: 4096,
        },
      });

      await provider.callApi('Test prompt');

      const apiCall = jest.mocked(cache.fetchWithCache).mock.calls[0];
      const body = JSON.parse((apiCall[1] as any).body);

      expect(body.max_completion_tokens).toBe(4096);
      expect(body.max_tokens).toBeUndefined();
    });
  });

  describe('Responses API Calls', () => {
    it('should handle gpt-oss-120b with responses API', async () => {
      const mockResponse = {
        id: 'resp_abc123',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Reasoning response from gpt-oss-120b',
              },
            ],
          },
        ],
        usage: {
          input_tokens: 50,
          output_tokens: 100,
          input_tokens_detail: {
            text_tokens: 50,
            audio_tokens: 0,
            cached_tokens: 0,
          },
          output_tokens_detail: {
            text_tokens: 100,
            audio_tokens: 0,
          },
        },
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue({
        data: mockResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const provider = new OpenAiResponsesProvider('gpt-oss-120b', {
        config: {
          apiKey: 'test-key',
          reasoning_effort: 'low',
          temperature: 0.5,
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.output).toBe('Reasoning response from gpt-oss-120b');

      const apiCall = jest.mocked(cache.fetchWithCache).mock.calls[0];
      const body = JSON.parse((apiCall[1] as any).body);

      // Verify Responses API specific fields
      expect(body.model).toBe('gpt-oss-120b');
      expect(body.reasoning_effort).toBe('low');
      expect(body.temperature).toBe(0.5);
      // max_output_tokens is only set if explicitly provided or from env, not by default
    });

    it('should handle all reasoning effort levels for gpt-oss', async () => {
      const mockResponse = {
        id: 'resp_xyz789',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Response',
              },
            ],
          },
        ],
        usage: {
          input_tokens: 50,
          output_tokens: 100,
        },
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue({
        data: mockResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const reasoningEfforts: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];

      for (const effort of reasoningEfforts) {
        jest.clearAllMocks();
        jest.mocked(cache.fetchWithCache).mockResolvedValue({
          data: mockResponse,
          cached: false,
          status: 200,
          statusText: 'OK',
        });

        const provider = new OpenAiResponsesProvider('gpt-oss-20b', {
          config: {
            apiKey: 'test-key',
            reasoning_effort: effort,
          },
        });

        await provider.callApi('Test prompt');

        const apiCall = jest.mocked(cache.fetchWithCache).mock.calls[0];
        const body = JSON.parse((apiCall[1] as any).body);

        expect(body.reasoning_effort).toBe(effort);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors for gpt-oss models', async () => {
      jest.mocked(cache.fetchWithCache).mockResolvedValue({
        data: {
          error: {
            message: 'Model not available',
            type: 'invalid_request_error',
            code: 'model_not_found',
          },
        },
        cached: false,
        status: 404,
        statusText: 'Not Found',
      });

      const provider = new OpenAiChatCompletionProvider('gpt-oss-120b', {
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('API error');
      expect(result.error).toContain('404');
    });

    it('should handle network errors', async () => {
      jest.mocked(cache.fetchWithCache).mockRejectedValue(new Error('Network error'));

      const provider = new OpenAiChatCompletionProvider('gpt-oss-20b', {
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('API call error');
    });
  });

  describe('Configuration Options', () => {
    it('should respect custom API base URL for gpt-oss models', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Custom endpoint response',
              role: 'assistant',
            },
            index: 0,
            finish_reason: 'stop',
          },
        ],
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue({
        data: mockResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const provider = new OpenAiChatCompletionProvider('gpt-oss-120b', {
        config: {
          apiKey: 'test-key',
          apiBaseUrl: 'https://custom.api.endpoint/v1',
        },
      });

      await provider.callApi('Test prompt');

      const apiCall = jest.mocked(cache.fetchWithCache).mock.calls[0];
      const url = apiCall[0] as string;

      expect(url).toContain('custom.api.endpoint');
    });

    it('should handle function calling with gpt-oss models', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: null,
              role: 'assistant',
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    arguments: '{"location": "San Francisco"}',
                  },
                },
              ],
            },
            index: 0,
            finish_reason: 'tool_calls',
          },
        ],
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue({
        data: mockResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const provider = new OpenAiChatCompletionProvider('gpt-oss-120b', {
        config: {
          apiKey: 'test-key',
          tools: [
            {
              type: 'function',
              function: {
                name: 'get_weather',
                description: 'Get the weather for a location',
                parameters: {
                  type: 'object',
                  properties: {
                    location: { type: 'string' },
                  },
                },
              },
            },
          ],
        },
      });

      const result = await provider.callApi('What is the weather in San Francisco?');

      // Tool calls are returned as an array of tool call objects
      expect(result.output).toBeDefined();
      const outputStr = JSON.stringify(result.output);
      expect(outputStr).toContain('get_weather');
      expect(outputStr).toContain('San Francisco');
    });
  });
});
