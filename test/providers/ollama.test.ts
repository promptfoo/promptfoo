import { trace } from '@opentelemetry/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import {
  OllamaChatProvider,
  OllamaCompletionProvider,
  OllamaEmbeddingProvider,
} from '../../src/providers/ollama';

import type { CallApiContextParams } from '../../src/types/index';

vi.mock('../../src/cache');

describe('OllamaCompletionProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should construct with model name and options', () => {
    const provider = new OllamaCompletionProvider('llama3.3', {
      id: 'custom-id',
      config: { temperature: 0.7 },
    });
    expect(provider.modelName).toBe('llama3.3');
    expect(provider.config.temperature).toBe(0.7);
    expect(provider.id()).toBe('custom-id');
  });

  it('should call API and return response', async () => {
    const mockResponse = {
      data: '{"response":"test response","done":true}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaCompletionProvider('llama3.3');
    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      output: 'test response',
    });
  });

  it('should handle multiple response chunks', async () => {
    const mockResponse = {
      data: '{"response":"test response","done":false}\n{"response":" more","done":true}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaCompletionProvider('llama3.3');
    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      output: 'test response more',
    });
  });

  it('should handle API errors', async () => {
    vi.mocked(fetchWithCache).mockRejectedValue(new Error('API error'));

    const provider = new OllamaCompletionProvider('llama3.3');
    const result = await provider.callApi('test prompt');

    expect(result.error).toContain('API call error: Error: API error');
  });

  // fetchWithCache is called with format 'text' here, so `data` is always a string --
  // the error body has to be parsed out of it rather than read off an object.
  it('should handle API response with error field', async () => {
    const mockResponse = {
      data: '{"error":"some error occurred"}',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaCompletionProvider('llama3.3');
    const result = await provider.callApi('test prompt');

    expect(result.error).toBe('Ollama error: some error occurred');
  });

  it.each([
    [404, 'Not Found', `model 'llama3.3' not found`],
    [500, 'Internal Server Error', 'option "num_predict" must be of type integer'],
    [401, 'Unauthorized', 'Unauthorized'],
  ])(
    'should surface a %i error body instead of an empty output',
    async (status, statusText, msg) => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: JSON.stringify({ error: msg }),
        cached: false,
        status,
        statusText,
        headers: {},
      });

      const provider = new OllamaCompletionProvider('llama3.3');
      const result = await provider.callApi('test prompt');

      expect(result.error).toBe(`Ollama API error: ${status} ${statusText}: ${msg}`);
      expect(result.output).toBeUndefined();
    },
  );

  it('should surface a non-2xx response whose body is not JSON', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: '<html><body>502 Bad Gateway</body></html>',
      cached: false,
      status: 502,
      statusText: 'Bad Gateway',
      headers: {},
    });

    const provider = new OllamaCompletionProvider('llama3.3');
    const result = await provider.callApi('test prompt');

    expect(result.error).toContain('Ollama API error: 502 Bad Gateway');
    expect(result.output).toBeUndefined();
  });

  it('should treat an unfollowed 3xx as a failure rather than empty output', async () => {
    // fetchWithCache returns every !response.ok body, which includes 3xx.
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: '',
      cached: false,
      status: 300,
      statusText: 'Multiple Choices',
      headers: {},
    });

    const provider = new OllamaCompletionProvider('llama3.3');
    const result = await provider.callApi('test prompt');

    expect(result.error).toBe('Ollama API error: 300 Multiple Choices');
    expect(result.output).toBeUndefined();
  });

  it('should evict a detected HTTP 200 error body from the cache', async () => {
    const deleteFromCache = vi.fn().mockResolvedValue(undefined);
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: '{"error":"transient failure"}',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
      deleteFromCache,
    });

    const provider = new OllamaCompletionProvider('llama3.3');
    const result = await provider.callApi('test prompt');

    // The 'text' format means fetchWithCache cannot spot the error key itself, so an
    // HTTP 200 error body would otherwise be replayed for the full cache TTL.
    expect(result.error).toBe('Ollama error: transient failure');
    expect(deleteFromCache).toHaveBeenCalledTimes(1);
  });

  it('should surface a non-2xx response with an empty body', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: '',
      cached: false,
      status: 503,
      statusText: 'Service Unavailable',
      headers: {},
    });

    const provider = new OllamaCompletionProvider('llama3.3');
    const result = await provider.callApi('test prompt');

    expect(result.error).toBe('Ollama API error: 503 Service Unavailable');
    expect(result.output).toBeUndefined();
  });

  it('should handle invalid JSON response', async () => {
    const mockResponse = {
      data: 'invalid json',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaCompletionProvider('llama3.3');
    const result = await provider.callApi('test prompt');

    expect(result.error).toContain('Ollama API response error:');
  });

  it('should use default id when not provided', () => {
    const provider = new OllamaCompletionProvider('llama3.3');
    expect(provider.id()).toBe('ollama:completion:llama3.3');
  });

  it('should handle toString method', () => {
    const provider = new OllamaCompletionProvider('llama3.3');
    expect(provider.toString()).toBe('[Ollama Completion Provider llama3.3]');
  });

  it('should extract token usage from response', async () => {
    const mockResponse = {
      data: '{"response":"test response","done":false,"prompt_eval_count":26}\n{"response":" more","done":true,"prompt_eval_count":26,"eval_count":259}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaCompletionProvider('llama3.3');
    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      output: 'test response more',
      tokenUsage: {
        prompt: 26,
        completion: 259,
        total: 285,
      },
    });
  });

  it('should handle missing token usage gracefully', async () => {
    const mockResponse = {
      data: '{"response":"test response","done":true}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaCompletionProvider('llama3.3');
    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      output: 'test response',
    });
  });

  it('should handle partial token usage (only prompt_eval_count)', async () => {
    const mockResponse = {
      data: '{"response":"test response","done":true,"prompt_eval_count":26}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaCompletionProvider('llama3.3');
    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      output: 'test response',
      tokenUsage: {
        prompt: 26,
        completion: 0,
        total: 26,
      },
    });
  });

  it('should handle partial token usage (only eval_count)', async () => {
    const mockResponse = {
      data: '{"response":"test response","done":true,"eval_count":259}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaCompletionProvider('llama3.3');
    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      output: 'test response',
      tokenUsage: {
        prompt: 0,
        completion: 259,
        total: 259,
      },
    });
  });
});

describe('OllamaChatProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should construct with model name and options', () => {
    const provider = new OllamaChatProvider('llama3.3', {
      id: 'custom-id',
      config: { temperature: 0.7 },
    });
    expect(provider.modelName).toBe('llama3.3');
    expect(provider.config.temperature).toBe(0.7);
    expect(provider.id()).toBe('custom-id');
  });

  it('should call chat API and return response', async () => {
    const mockResponse = {
      data: '{"message":{"role":"assistant","content":"test response","images":null},"done":true}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaChatProvider('llama3.3');
    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      output: 'test response',
    });
  });

  it('should handle multiple chat response chunks', async () => {
    const mockResponse = {
      data: '{"message":{"role":"assistant","content":"test response","images":null},"done":false}\n{"message":{"role":"assistant","content":" more","images":null},"done":true}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaChatProvider('llama3.3');
    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      output: 'test response more',
    });
  });

  it('should handle chat API errors', async () => {
    vi.mocked(fetchWithCache).mockRejectedValue(new Error('API error'));

    const provider = new OllamaChatProvider('llama3.3');
    const result = await provider.callApi('test prompt');

    expect(result.error).toContain('API call error: Error: API error');
  });

  it('should handle chat API response with error field', async () => {
    const mockResponse = {
      data: '{"error":"chat error occurred"}',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaChatProvider('llama3.3');
    const result = await provider.callApi('test prompt');

    expect(result.error).toBe('Ollama error: chat error occurred');
  });

  it.each([
    [404, 'Not Found', `model 'llama3.3' not found`],
    [400, 'Bad Request', '"all-minilm" does not support chat'],
    [401, 'Unauthorized', 'Unauthorized'],
  ])(
    'should surface a %i error body instead of an empty output',
    async (status, statusText, msg) => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: JSON.stringify({ error: msg }),
        cached: false,
        status,
        statusText,
        headers: {},
      });

      const provider = new OllamaChatProvider('llama3.3');
      const result = await provider.callApi('test prompt');

      expect(result.error).toBe(`Ollama API error: ${status} ${statusText}: ${msg}`);
      expect(result.output).toBeUndefined();
    },
  );

  it('should surface an error record emitted partway through a 200 stream', async () => {
    // /api/chat can start streaming, then fail: HTTP is already 200 and the body is
    // multi-line, so the whole body does not parse as a single JSON value.
    vi.mocked(fetchWithCache).mockResolvedValue({
      data:
        '{"message":{"role":"assistant","content":"Partial"},"done":false}\n' +
        '{"error":"an unexpected error was encountered while running the model"}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const provider = new OllamaChatProvider('llama3.3');
    const result = await provider.callApi('test prompt');

    expect(result.error).toBe(
      'Ollama error: an unexpected error was encountered while running the model',
    );
    // Must not silently return the partial content as a success.
    expect(result.output).toBeUndefined();
  });

  it('should not mistake a successful NDJSON stream for an error body', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data:
        '{"message":{"role":"assistant","content":"Hello"},"done":false}\n' +
        '{"message":{"role":"assistant","content":" there"},"done":true,"prompt_eval_count":3,"eval_count":2}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const provider = new OllamaChatProvider('llama3.3');
    const result = await provider.callApi('test prompt');

    expect(result.error).toBeUndefined();
    expect(result.output).toBe('Hello there');
  });

  it('should handle invalid JSON response', async () => {
    const mockResponse = {
      data: 'invalid json',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaChatProvider('llama3.3');
    const result = await provider.callApi('test prompt');

    expect(result.error).toContain('Ollama API response error:');
  });

  it('should use default id when not provided', () => {
    const provider = new OllamaChatProvider('llama3.3');
    expect(provider.id()).toBe('ollama:chat:llama3.3');
  });

  it('should handle toString method', () => {
    const provider = new OllamaChatProvider('llama3.3');
    expect(provider.toString()).toBe('[Ollama Chat Provider llama3.3]');
  });

  it('should handle think configuration when it is not provided', async () => {
    const provider = new OllamaCompletionProvider('llama3.3');
    const mockResponse = {
      data: '',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    await provider.callApi('test prompt');

    expect(vi.mocked(fetchWithCache).mock.calls[0]).toBeDefined();
    const call = vi.mocked(fetchWithCache).mock.calls[0] as any;
    expect(JSON.parse(call[1].body).think).toBeFalsy();
  });

  it('should handle think configuration when it is false', async () => {
    const provider = new OllamaCompletionProvider('llama3.3', {
      config: {
        think: false,
      },
    });
    const mockResponse = {
      data: '',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    await provider.callApi('test prompt');

    expect(vi.mocked(fetchWithCache).mock.calls[0]).toBeDefined();
    const call = vi.mocked(fetchWithCache).mock.calls[0] as any;
    expect(JSON.parse(call[1].body).think).toBeFalsy();
  });

  it('should handle think configuration when it is true', async () => {
    const provider = new OllamaCompletionProvider('llama3.3', {
      config: {
        think: true,
      },
    });
    const mockResponse = {
      data: '',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    await provider.callApi('test prompt');

    expect(vi.mocked(fetchWithCache).mock.calls[0]).toBeDefined();
    const call = vi.mocked(fetchWithCache).mock.calls[0] as any;
    expect(JSON.parse(call[1].body).think).toBeTruthy();
  });

  it('should handle tools configuration', async () => {
    const provider = new OllamaChatProvider('llama3.3', {
      config: {
        tools: [{ name: 'test-tool' }],
      },
    });
    const mockResponse = {
      data: '{"message":{"role":"assistant","content":"test response","images":null},"done":true}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const context: CallApiContextParams = {
      prompt: { raw: 'test prompt', label: 'test' },
      vars: { test: 'value' },
      debug: true,
    };

    await provider.callApi('test prompt', context);

    expect(vi.mocked(fetchWithCache).mock.calls[0]).toBeDefined();
    const call = vi.mocked(fetchWithCache).mock.calls[0] as any;
    expect(JSON.parse(call[1].body)).toMatchObject({
      tools: [{ name: 'test-tool' }],
    });
    expect(call[4]).toBe(true);
  });

  it('should handle context bustCache parameter', async () => {
    const provider = new OllamaChatProvider('llama3.3');
    const mockResponse = {
      data: '{"message":{"role":"assistant","content":"test response","images":null},"done":true}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const context: CallApiContextParams = {
      prompt: { raw: 'test prompt', label: 'test' },
      vars: {},
      bustCache: true,
    };

    await provider.callApi('test prompt', context);

    expect(vi.mocked(fetchWithCache).mock.calls[0]).toBeDefined();
    const call = vi.mocked(fetchWithCache).mock.calls[0] as any;
    expect(call[4]).toBe(true);
  });

  it('should extract token usage from chat response', async () => {
    const mockResponse = {
      data: '{"message":{"role":"assistant","content":"test response","images":null},"done":false,"prompt_eval_count":26}\n{"message":{"role":"assistant","content":" more","images":null},"done":true,"prompt_eval_count":26,"eval_count":259}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaChatProvider('llama3.3');
    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      output: 'test response more',
      tokenUsage: {
        prompt: 26,
        completion: 259,
        total: 285,
      },
    });
  });

  it('should handle missing token usage gracefully in chat', async () => {
    const mockResponse = {
      data: '{"message":{"role":"assistant","content":"test response","images":null},"done":true}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaChatProvider('llama3.3');
    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      output: 'test response',
    });
  });

  it('should handle partial token usage in chat (only prompt_eval_count)', async () => {
    const mockResponse = {
      data: '{"message":{"role":"assistant","content":"test response","images":null},"done":true,"prompt_eval_count":26}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaChatProvider('llama3.3');
    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      output: 'test response',
      tokenUsage: {
        prompt: 26,
        completion: 0,
        total: 26,
      },
    });
  });

  it('should handle partial token usage in chat (only eval_count)', async () => {
    const mockResponse = {
      data: '{"message":{"role":"assistant","content":"test response","images":null},"done":true,"eval_count":259}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaChatProvider('llama3.3');
    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      output: 'test response',
      tokenUsage: {
        prompt: 0,
        completion: 259,
        total: 259,
      },
    });
  });

  it('should handle tool calls in response', async () => {
    const mockResponse = {
      data: '{"message":{"role":"assistant","content":"","images":null,"tool_calls":[{"function":{"name":"get_weather","arguments":"{\\"location\\":\\"Amsterdam\\",\\"unit\\":\\"celsius\\"}"}}]},"done":true}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaChatProvider('llama3.3', {
      config: {
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get current weather for a location',
              parameters: {
                type: 'object',
                properties: {
                  location: {
                    type: 'string',
                    description: 'City and state, e.g. San Francisco, CA',
                  },
                  unit: {
                    type: 'string',
                    enum: ['celsius', 'fahrenheit'],
                  },
                },
                required: ['location'],
              },
            },
          },
        ],
      },
    });

    const result = await provider.callApi('What is the weather in Amsterdam?');

    expect(result.output).toEqual([
      {
        function: {
          name: 'get_weather',
          arguments: '{"location":"Amsterdam","unit":"celsius"}',
        },
      },
    ]);
  });

  it('should handle tool calls with content in response', async () => {
    const mockResponse = {
      data: '{"message":{"role":"assistant","content":"Let me check the weather for you.","images":null,"tool_calls":[{"function":{"name":"get_weather","arguments":"{\\"location\\":\\"Amsterdam\\",\\"unit\\":\\"celsius\\"}"}}]},"done":true}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaChatProvider('llama3.3', {
      config: {
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get current weather for a location',
              parameters: {
                type: 'object',
                properties: {
                  location: {
                    type: 'string',
                    description: 'City and state, e.g. San Francisco, CA',
                  },
                  unit: {
                    type: 'string',
                    enum: ['celsius', 'fahrenheit'],
                  },
                },
                required: ['location'],
              },
            },
          },
        ],
      },
    });

    const result = await provider.callApi('What is the weather in Amsterdam?');

    expect(result.output).toEqual({
      content: 'Let me check the weather for you.',
      tool_calls: [
        {
          function: {
            name: 'get_weather',
            arguments: '{"location":"Amsterdam","unit":"celsius"}',
          },
        },
      ],
    });
  });

  it.each([false, true])(
    'should collect tool calls across streaming chunks (with content: %s)',
    async (withContent) => {
      const chunks = [
        {
          message: {
            role: 'assistant',
            content: withContent ? 'Checking ' : '',
            tool_calls: [{ function: { name: 'get_weather', arguments: { city: 'Amsterdam' } } }],
          },
          done: false,
        },
        {
          message: {
            role: 'assistant',
            content: withContent ? 'weather.' : '',
            tool_calls: [{ function: { name: 'get_weather', arguments: '{"city":"Paris"}' } }],
          },
          done: false,
        },
        {
          message: { role: 'assistant', content: '' },
          done: true,
          prompt_eval_count: 10,
          eval_count: 20,
        },
      ];
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: `${chunks.map((chunk) => JSON.stringify(chunk)).join('\n')}\n`,
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      const result = await new OllamaChatProvider('llama3.3').callApi('Compare the weather');
      const toolCalls = [
        { function: { name: 'get_weather', arguments: '{"city":"Amsterdam"}' } },
        { function: { name: 'get_weather', arguments: '{"city":"Paris"}' } },
      ];
      expect(result.output).toEqual(
        withContent ? { content: 'Checking weather.', tool_calls: toolCalls } : toolCalls,
      );
      expect(result.tokenUsage).toEqual({ prompt: 10, completion: 20, total: 30 });
    },
  );

  it('should handle multiple tool calls in response', async () => {
    const mockResponse = {
      data: '{"message":{"role":"assistant","content":"","images":null,"tool_calls":[{"function":{"name":"get_weather","arguments":"{\\"location\\":\\"Amsterdam\\",\\"unit\\":\\"celsius\\"}"}},{"function":{"name":"get_weather","arguments":"{\\"location\\":\\"Paris\\",\\"unit\\":\\"celsius\\"}"}}]},"done":true}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaChatProvider('llama3.3', {
      config: {
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get current weather for a location',
              parameters: {
                type: 'object',
                properties: {
                  location: {
                    type: 'string',
                    description: 'City and state, e.g. San Francisco, CA',
                  },
                  unit: {
                    type: 'string',
                    enum: ['celsius', 'fahrenheit'],
                  },
                },
                required: ['location'],
              },
            },
          },
        ],
      },
    });

    const result = await provider.callApi('Compare weather in Amsterdam and Paris');

    expect(result.output).toEqual([
      {
        function: {
          name: 'get_weather',
          arguments: '{"location":"Amsterdam","unit":"celsius"}',
        },
      },
      {
        function: {
          name: 'get_weather',
          arguments: '{"location":"Paris","unit":"celsius"}',
        },
      },
    ]);
  });
});

describe('Ollama provider tracing', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each([
    {
      operation: 'completion',
      Provider: OllamaCompletionProvider,
      data: '{"response":"test response","done":true}\n',
    },
    {
      operation: 'chat',
      Provider: OllamaChatProvider,
      data: '{"message":{"role":"assistant","content":"test response"},"done":true}\n',
    },
  ])('prefers the canonical test index for $operation spans', async ({ Provider, data }) => {
    const attributes: Record<string, unknown> = {};
    const getTracer = vi.spyOn(trace, 'getTracer').mockReturnValue({
      startActiveSpan: (
        _name: string,
        options: { attributes: Record<string, unknown> },
        _context: unknown,
        callback: any,
      ) => {
        Object.assign(attributes, options.attributes);
        return callback({
          setAttribute: vi.fn(),
          setStatus: vi.fn(),
          recordException: vi.fn(),
          end: vi.fn(),
        });
      },
    } as any);

    try {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data,
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      await new Provider('llama3.3').callApi('test prompt', {
        prompt: { raw: 'test prompt', label: 'ollama prompt' },
        vars: {},
        test: { vars: { __testIdx: 99 } },
        testIdx: 7,
      });

      expect(attributes['promptfoo.test.index']).toBe(7);
    } finally {
      getTracer.mockRestore();
    }
  });
});

describe('OllamaEmbeddingProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should call embeddings API and return response', async () => {
    const mockResponse = {
      data: {
        embedding: [0.1, 0.2, 0.3],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaEmbeddingProvider('llama3.3');
    const result = await provider.callEmbeddingApi('test text');

    expect(result).toEqual({
      embedding: [0.1, 0.2, 0.3],
    });
  });

  it.each([
    [404, 'Not Found', `model 'llama3.3' not found`],
    [400, 'Bad Request', 'invalid input'],
  ])(
    'should surface a %i embeddings error body instead of a missing-embedding error',
    async (status, statusText, msg) => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: { error: msg },
        cached: false,
        status,
        statusText,
        headers: {},
      });

      const provider = new OllamaEmbeddingProvider('llama3.3');
      const result = await provider.callEmbeddingApi('test text');

      expect(result.error).toBe(`Ollama API error: ${status} ${statusText}: ${msg}`);
      expect(result.embedding).toBeUndefined();
    },
  );

  it('should preserve a non-2xx JSON body that has no top-level error key', async () => {
    // A gateway in front of Ollama may return e.g. {"message":"invalid token"}; the
    // diagnostic must survive rather than collapsing to just the status line.
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: { message: 'invalid token' },
      cached: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: {},
    });

    const provider = new OllamaEmbeddingProvider('llama3.3');
    const result = await provider.callEmbeddingApi('test text');

    expect(result.error).toBe('Ollama API error: 401 Unauthorized: {"message":"invalid token"}');
  });

  it('should handle embeddings API errors', async () => {
    vi.mocked(fetchWithCache).mockRejectedValue(new Error('API error'));

    const provider = new OllamaEmbeddingProvider('llama3.3');
    const result = await provider.callEmbeddingApi('test text');

    expect(result.error).toBe('API call error: Error: API error');
  });

  it('should handle missing embedding in response', async () => {
    const mockResponse = {
      data: {},
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaEmbeddingProvider('llama3.3');
    const result = await provider.callEmbeddingApi('test text');

    expect(result.error).toContain('No embedding found in Ollama embeddings API response');
  });

  it('should handle invalid JSON response', async () => {
    const mockResponse = {
      data: 'invalid json',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaEmbeddingProvider('llama3.3');
    const result = await provider.callEmbeddingApi('test text');

    expect(result.error).toContain('API response error:');
  });
});
