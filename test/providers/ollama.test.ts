import { trace } from '@opentelemetry/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import logger from '../../src/logger';
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

  it('should surface thinking output and finish reason', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data:
        '{"response":"","thinking":"Let me ","done":false}\n' +
        '{"response":"","thinking":"reason.","done":true,"done_reason":"length","eval_count":32}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const provider = new OllamaCompletionProvider('qwen3:0.6b');
    const result = await provider.callApi('test prompt');

    // Previously this returned '' because `thinking` was dropped entirely.
    expect(result.output).toBe('Thinking: Let me reason.');
    expect(result.finishReason).toBe('length');
  });

  it('should prepend thinking to response content when both are present', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: '{"response":"Hi!","thinking":"Short.","done":true,"done_reason":"stop"}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const provider = new OllamaCompletionProvider('qwen3:0.6b');
    const result = await provider.callApi('test prompt');

    expect(result.output).toBe('Thinking: Short.\n\nHi!');
    expect(result.finishReason).toBe('stop');
  });

  it('should omit thinking when showThinking is false, without sending it to Ollama', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: '{"response":"Hi!","thinking":"Short.","done":true,"done_reason":"stop"}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const provider = new OllamaCompletionProvider('qwen3:0.6b', {
      config: { showThinking: false },
    });
    const result = await provider.callApi('test prompt');

    expect(result.output).toBe('Hi!');

    // showThinking is a promptfoo-side rendering option; Ollama must never receive it.
    const body = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string);
    expect(body.showThinking).toBeUndefined();
    expect(body.options.showThinking).toBeUndefined();
  });

  it('should set the cached flag and report cached token usage on a completion cache hit', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: '{"response":"hi","done":true,"prompt_eval_count":10,"eval_count":20}\n',
      cached: true,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const provider = new OllamaCompletionProvider('llama3.3');
    const result = await provider.callApi('test prompt');

    // The completion path builds its response separately from the chat path, so it
    // needs its own cache-hit coverage.
    expect(result.cached).toBe(true);
    expect(result.tokenUsage).toEqual({ cached: 30, total: 30 });
  });

  it('should send format as a top-level parameter on the completion path too', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: '{"response":"{}","done":true}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const schema = { type: 'object', properties: { capital: { type: 'string' } } };
    const provider = new OllamaCompletionProvider('qwen3', { config: { format: schema } });
    await provider.callApi('test prompt');

    // Chat and completion build separate request objects, so both need coverage.
    const body = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string);
    expect(body.format).toEqual(schema);
    expect(body.options.format).toBeUndefined();
  });

  it('should keep an explicitly reported zero cached-prompt count', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: '{"response":"hi","done":true,"prompt_eval_count":10,"prompt_eval_cached_count":0,"eval_count":5}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const provider = new OllamaCompletionProvider('qwen3');
    const result = await provider.callApi('test prompt');

    // 0 is a real value Ollama reports, distinct from the field being absent.
    expect(result.tokenUsage?.completionDetails).toEqual({ cacheReadInputTokens: 0 });
  });

  it.each([
    ['suffix', 'return result'],
    ['system', 'You are terse.'],
    ['template', '{{ .Prompt }}'],
    ['raw', true],
  ])('should forward /api/generate-only parameter %s', async (key, value) => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: '{"response":"ok","done":true}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const provider = new OllamaCompletionProvider('qwen2.5', {
      config: { [key]: value } as any,
    });
    await provider.callApi('test prompt');

    const body = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string);
    expect(body[key]).toEqual(value);
    expect(body.options[key]).toBeUndefined();
  });

  // The completion endpoint has its own parsing/accumulation branch, so the same
  // malformed-response contract needs coverage on both sides.
  it.each([
    ['non-string thinking', '"thinking":{"a":1}', 'hi'],
    ['non-string thinking with empty response', '"thinking":[1,2],"response":""', ''],
  ])('should degrade gracefully on completion %s', async (_label, fragment, expected) => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: `{"response":"hi",${fragment},"done":true}\n`,
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const result = await new OllamaCompletionProvider('llama3.3').callApi('test prompt');

    expect(result.error).toBeUndefined();
    expect(result.output).toBe(expected);
    expect(String(result.output)).not.toContain('[object Object]');
  });

  it('should render a non-string completion response as empty', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: '{"response":{"a":1},"done":true}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const result = await new OllamaCompletionProvider('llama3.3').callApi('test prompt');

    expect(result.output).toBe('');
    expect(String(result.output)).not.toContain('[object Object]');
  });

  it.each([
    [{ bustCache: true }, true],
    [{ debug: true }, true],
    [{}, undefined],
  ])('should forward bustCache %j to fetchWithCache', async (extra, expected) => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: '{"response":"hi","done":true}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const context = {
      prompt: { raw: 'test prompt', label: 'test' },
      vars: {},
      ...extra,
    } as CallApiContextParams;

    await new OllamaCompletionProvider('llama3.3').callApi('test prompt', context);

    // redteam discover and the gcg strategy pass bustCache: true directly into
    // callApi, and a bare `ollama:<model>` id routes here -- without this the
    // completion provider replayed cached target answers.
    const call = vi.mocked(fetchWithCache).mock.calls[0] as any;
    expect(call[4]).toBe(expected);
  });

  it('should omit finishReason when done_reason is absent', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: '{"response":"Hi!","done":true}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const provider = new OllamaCompletionProvider('llama3.3');
    const result = await provider.callApi('test prompt');

    expect(result.output).toBe('Hi!');
    expect(result.finishReason).toBeUndefined();
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
        numRequests: 1,
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
        numRequests: 1,
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
        numRequests: 1,
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
    const provider = new OllamaChatProvider('llama3.3');
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
    const provider = new OllamaChatProvider('llama3.3', {
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
    const provider = new OllamaChatProvider('llama3.3', {
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

  it('should set the cached flag and report cached token usage on a cache hit', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: '{"message":{"role":"assistant","content":"hi"},"done":true,"prompt_eval_count":10,"eval_count":20}\n',
      cached: true,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const provider = new OllamaChatProvider('llama3.3');
    const result = await provider.callApi('test prompt');

    // src/providers/AGENTS.md requires the cached flag; without it the evaluator never
    // takes its "Skipping delay because response is cached" branch.
    expect(result.cached).toBe(true);
    expect(result.tokenUsage).toEqual({ cached: 30, total: 30 });
  });

  it('should merge passthrough.options instead of clobbering computed options', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: '{"message":{"role":"assistant","content":"hi"},"done":true}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const provider = new OllamaChatProvider('llama3.3', {
      config: { temperature: 0.5, num_predict: 64, passthrough: { options: { min_p: 0.1 } } },
    });
    await provider.callApi('test prompt');

    const body = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string);
    // Spreading passthrough wholesale used to replace the computed options object,
    // silently discarding temperature and num_predict.
    expect(body.options).toEqual({ temperature: 0.5, num_predict: 64, min_p: 0.1 });
  });

  it('should forward min_p, keep_alive, and legacy options, but drop invalid keys', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: '{"message":{"role":"assistant","content":"hi"},"done":true}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const provider = new OllamaChatProvider('llama3.3', {
      config: {
        min_p: 0.05,
        draft_num_predict: 4,
        keep_alive: '5m',
        // Removed from current Ollama releases but still forwarded, so a config
        // pointed at an older OLLAMA_BASE_URL keeps working.
        mirostat: 2,
        tfs_z: 1,
        // Never a valid wire name: the Go field was UseNUMA with json tag "numa",
        // and "numa" itself is gone upstream.
        useNUMA: true,
        // An OpenAI key Ollama ignores.
        max_tokens: 99,
      } as any,
    });
    await provider.callApi('test prompt');

    const body = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string);
    expect(body.options.min_p).toBe(0.05);
    expect(body.options.draft_num_predict).toBe(4);
    expect(body.keep_alive).toBe('5m');
    expect(body.options.keep_alive).toBeUndefined();
    expect(body.options.mirostat).toBe(2);
    expect(body.options.tfs_z).toBe(1);
    expect(body.options.useNUMA).toBeUndefined();
    expect(body.options.max_tokens).toBeUndefined();
    expect(body.max_tokens).toBeUndefined();
  });

  it.each([['low'], ['medium'], ['high'], ['max'], [true], [false]])(
    'should forward think level %s as a top-level parameter',
    async (level) => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: '{"message":{"role":"assistant","content":"hi"},"done":true}\n',
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      const provider = new OllamaChatProvider('qwen3', { config: { think: level as any } });
      await provider.callApi('test prompt');

      // Ollama 0.34+ accepts a boolean or a thinking level.
      const body = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string);
      expect(body.think).toBe(level);
      expect(body.options.think).toBeUndefined();
    },
  );

  it('should send format as a top-level structured-output parameter', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: '{"message":{"role":"assistant","content":"{}"},"done":true}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const schema = { type: 'object', properties: { capital: { type: 'string' } } };
    const provider = new OllamaChatProvider('qwen3', { config: { format: schema } });
    await provider.callApi('test prompt');

    // Previously reachable only via passthrough.
    const body = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string);
    expect(body.format).toEqual(schema);
    expect(body.options.format).toBeUndefined();
  });

  it('should surface prompt_eval_cached_count as cacheReadInputTokens', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: '{"message":{"role":"assistant","content":"hi"},"done":true,"prompt_eval_count":54,"prompt_eval_cached_count":53,"eval_count":25}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const provider = new OllamaChatProvider('qwen3');
    const result = await provider.callApi('test prompt');

    // Ollama's own KV prefix cache -- NOT a promptfoo cache hit, so `cached` stays unset.
    expect(result.tokenUsage).toEqual({
      prompt: 54,
      completion: 25,
      total: 79,
      numRequests: 1,
      completionDetails: { cacheReadInputTokens: 53 },
    });
    expect(result.cached).toBeUndefined();
  });

  it('should warn when a completion-only key is set on a chat provider', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: '{"message":{"role":"assistant","content":"hi"},"done":true}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const provider = new OllamaChatProvider('qwen3', {
      config: { suffix: 'X', system: 'terse', raw: true } as any,
    });
    await provider.callApi('test prompt');

    const body = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string);
    const warnings = warnSpy.mock.calls.map((c) => String(c[0]));
    warnSpy.mockRestore();

    // These are valid Ollama keys, but /api/chat does not accept them. Without the
    // endpoint check they were neither forwarded nor reported -- a silent drop.
    expect(body.suffix).toBeUndefined();
    expect(body.system).toBeUndefined();
    expect(body.raw).toBeUndefined();
    expect(warnings.some((w) => w.includes('chat endpoint does not accept'))).toBe(true);
    expect(warnings.some((w) => w.includes('suffix'))).toBe(true);
  });

  it.each([
    ['chat', 'llama3.3'],
    ['completion', 'llama3.3'],
  ])('should forward truncate on the %s endpoint', async (kind, model) => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    vi.mocked(fetchWithCache).mockResolvedValue({
      data:
        kind === 'chat'
          ? '{"message":{"role":"assistant","content":"hi"},"done":true}\n'
          : '{"response":"hi","done":true}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const provider =
      kind === 'chat'
        ? new OllamaChatProvider(model, { config: { truncate: false } })
        : new OllamaCompletionProvider(model, { config: { truncate: false } });
    await provider.callApi('test prompt');

    const body = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string);
    const warnings = warnSpy.mock.calls.map((c) => String(c[0]));
    warnSpy.mockRestore();

    // truncate gates context-overflow behavior on the generation endpoints too, not
    // just /api/embed: a long prompt with a small num_ctx returns 400 when false.
    expect(body.truncate).toBe(false);
    expect(body.options.truncate).toBeUndefined();
    expect(warnings.filter((w) => w.includes('does not accept'))).toHaveLength(0);
  });

  it('should not warn for keys the chat endpoint does accept', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: '{"message":{"role":"assistant","content":"hi"},"done":true}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const provider = new OllamaChatProvider('qwen3', {
      config: { think: false, keep_alive: '5m', format: 'json' },
    });
    await provider.callApi('test prompt');
    const warnings = warnSpy.mock.calls.map((c) => String(c[0]));
    warnSpy.mockRestore();

    expect(warnings.filter((w) => w.includes('does not accept'))).toHaveLength(0);
  });

  it('should not report promptfoo-internal keys as dropped config', async () => {
    const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => logger);
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: '{"message":{"role":"assistant","content":"hi"},"done":true}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    // loadApiProvider injects basePath into every provider config, so without an
    // exclusion the diagnostic fires on every request with a key the user never set.
    const provider = new OllamaChatProvider('llama3.3', {
      config: { temperature: 0, basePath: '/x', showThinking: false } as any,
    });
    await provider.callApi('test prompt');

    const droppedCalls = debugSpy.mock.calls.filter((c) =>
      String(c[0]).includes('Ignoring unsupported config keys'),
    );
    debugSpy.mockRestore();
    expect(droppedCalls).toHaveLength(0);
  });

  it('should not leak think or passthrough into the nested options object', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: '{"message":{"role":"assistant","content":"hi"},"done":true}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const provider = new OllamaChatProvider('llama3.3', {
      config: { temperature: 0.5, think: true, passthrough: { format: 'json' } },
    });
    await provider.callApi('test prompt');

    const body = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string);
    // think and format belong at the top level; the chat reducer used to copy them
    // into options as junk members too.
    expect(body.options).toEqual({ temperature: 0.5 });
    expect(body.think).toBe(true);
    expect(body.format).toBe('json');
  });

  // Contract for outgoing message normalization, stated as one table so the whole input
  // space is visible. The helper must change EXACTLY one thing -- a tool call whose
  // `arguments` is a JSON *object* string becomes an object, because Ollama rejects the
  // stringified form that responses are normalized to -- and must pass everything else
  // through byte-identical without throwing.
  const TOOL_CALL = (args: any) => [
    { role: 'assistant', tool_calls: [{ function: { name: 'f', arguments: args } }] },
  ];
  it.each([
    ['empty array', [], null],
    ['plain message', [{ role: 'user', content: 'hi' }], null],
    ['tool_calls null', [{ role: 'assistant', tool_calls: null }], null],
    ['tool_calls not an array', [{ role: 'assistant', tool_calls: 'nope' }], null],
    ['tool_calls empty', [{ role: 'assistant', tool_calls: [] }], null],
    ['null tool call', [{ role: 'assistant', tool_calls: [null] }], null],
    ['tool call without function', [{ role: 'assistant', tool_calls: [{}] }], null],
    ['null function', [{ role: 'assistant', tool_calls: [{ function: null }] }], null],
    ['arguments missing', [{ role: 'assistant', tool_calls: [{ function: { name: 'f' } }] }], null],
    ['arguments already an object', TOOL_CALL({ a: 1 }), null],
    ['arguments JSON array string', TOOL_CALL('[1,2]'), null],
    ['arguments JSON null string', TOOL_CALL('null'), null],
    ['arguments JSON number string', TOOL_CALL('42'), null],
    ['arguments unparseable string', TOOL_CALL('{oops'), null],
    ['arguments empty string', TOOL_CALL(''), null],
    ['null message', [null], null],
    ['string message', ['hello'], null],
    ['number message', [7], null],
    // parseChatPrompt returns whatever parsed, not necessarily an array. Non-arrays must
    // reach Ollama so its validation reports the problem instead of us throwing first.
    ['non-array object prompt', { role: 'user', content: 'hi' }, null],
    ['non-array string prompt', 'plain', null],
    ['non-array number prompt', 5, null],
    // The single case that is transformed.
    ['arguments JSON object string', TOOL_CALL('{"city":"Paris"}'), TOOL_CALL({ city: 'Paris' })],
  ])('normalizes %s correctly on the way to Ollama', async (_label, input, expected) => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: '{"message":{"role":"assistant","content":"ok"},"done":true}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    await new OllamaChatProvider('llama3.3').callApi(JSON.stringify(input));

    const body = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string);
    expect(body.messages).toEqual(expected ?? input);
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
        numRequests: 1,
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
        numRequests: 1,
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
        numRequests: 1,
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
      expect(result.tokenUsage).toEqual({ prompt: 10, completion: 20, total: 30, numRequests: 1 });
    },
  );

  it('should accumulate message.thinking across chunks and surface finish reason', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data:
        '{"message":{"role":"assistant","content":"","thinking":"Let me "},"done":false}\n' +
        '{"message":{"role":"assistant","content":"","thinking":"reason."},"done":false}\n' +
        '{"message":{"role":"assistant","content":""},"done":true,"done_reason":"length","eval_count":32}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const provider = new OllamaChatProvider('qwen3:0.6b');
    const result = await provider.callApi('test prompt');

    // Previously this returned '' because message.thinking was dropped entirely.
    expect(result.output).toBe('Thinking: Let me reason.');
    expect(result.finishReason).toBe('length');
  });

  it('should prepend thinking to chat content when both are present', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data:
        '{"message":{"role":"assistant","content":"","thinking":"Short."},"done":false}\n' +
        '{"message":{"role":"assistant","content":"Hi!"},"done":true,"done_reason":"stop"}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const provider = new OllamaChatProvider('qwen3:0.6b');
    const result = await provider.callApi('test prompt');

    expect(result.output).toBe('Thinking: Short.\n\nHi!');
    expect(result.finishReason).toBe('stop');
  });

  it('should omit chat thinking when showThinking is false', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data:
        '{"message":{"role":"assistant","content":"","thinking":"Short."},"done":false}\n' +
        '{"message":{"role":"assistant","content":"Hi!"},"done":true,"done_reason":"stop"}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const provider = new OllamaChatProvider('qwen3:0.6b', { config: { showThinking: false } });
    const result = await provider.callApi('test prompt');

    expect(result.output).toBe('Hi!');

    const body = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string);
    expect(body.showThinking).toBeUndefined();
    expect(body.options.showThinking).toBeUndefined();
  });

  it('should leave the tool-call output shape untouched when thinking is present', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data:
        '{"message":{"role":"assistant","content":"","thinking":"Deciding."},"done":false}\n' +
        '{"message":{"role":"assistant","content":"","tool_calls":[{"function":{"name":"get_weather","arguments":{"city":"Paris"}}}]},"done":false}\n' +
        '{"message":{"role":"assistant","content":""},"done":true,"done_reason":"stop"}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const provider = new OllamaChatProvider('qwen3:0.6b');
    const result = await provider.callApi('test prompt');

    // Tool calls must stay structured -- prepending a string would break
    // is-valid-openai-tools-call.
    expect(result.output).toEqual([
      { function: { name: 'get_weather', arguments: '{"city":"Paris"}' } },
    ]);
    expect(result.finishReason).toBe('stop');
  });

  // Contract for malformed/proxied responses: never surface a raw TypeError, never
  // render a non-string into the output, and never discard readable data alongside
  // unreadable data.
  it.each([
    ['tool_calls not an array', '"tool_calls":{"a":1}', 'hi'],
    ['null tool call', '"tool_calls":[null]', 'hi'],
    ['tool call without function', '"tool_calls":[{}]', 'hi'],
    ['null function', '"tool_calls":[{"function":null}]', 'hi'],
    ['function without a name', '"tool_calls":[{"function":{"arguments":{"a":1}}}]', 'hi'],
    ['non-string thinking', '"thinking":{"a":1}', 'hi'],
  ])('should degrade gracefully on %s', async (_label, fragment, expected) => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: `{"message":{"role":"assistant","content":"hi",${fragment}},"done":true}\n`,
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const result = await new OllamaChatProvider('llama3.3').callApi('test prompt');

    expect(result.error).toBeUndefined();
    expect(result.output).toBe(expected);
  });

  it('should render a non-string content as empty rather than [object Object]', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: '{"message":{"role":"assistant","content":{"a":1}},"done":true}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const result = await new OllamaChatProvider('llama3.3').callApi('test prompt');

    expect(result.output).toBe('');
    expect(String(result.output)).not.toContain('[object Object]');
  });

  it('should keep readable tool calls alongside unreadable ones', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: '{"message":{"role":"assistant","content":"","tool_calls":[null,{"function":{"name":"f","arguments":{"a":1}}}]},"done":true}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const result = await new OllamaChatProvider('llama3.3').callApi('test prompt');

    // Dropping the whole response because one entry is malformed would lose real data.
    expect(result.output).toEqual([{ function: { name: 'f', arguments: '{"a":1}' } }]);
  });

  it.each([
    ['missing', '{"name":"f"}'],
    ['null', '{"name":"f","arguments":null}'],
  ])('should normalize %s tool-call arguments to an empty JSON object', async (_label, fn) => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: `{"message":{"role":"assistant","content":"","tool_calls":[{"function":${fn}}]},"done":true}\n`,
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const result = await new OllamaChatProvider('llama3.3').callApi('test prompt');

    expect(result.output).toEqual([{ function: { name: 'f', arguments: '{}' } }]);
  });

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

describe('Ollama endpoint key matrix', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // Guards the invariant behind the endpoint warning: a key listed as accepted for an
  // endpoint MUST be forwarded by that endpoint's provider. If it is listed but not
  // forwarded, the user gets neither the parameter nor a warning -- a silent drop.
  it.each([
    ['chat', ['think', 'keep_alive', 'format', 'truncate']],
    [
      'completion',
      ['think', 'keep_alive', 'format', 'truncate', 'suffix', 'system', 'template', 'raw'],
    ],
    ['embedding', ['keep_alive', 'truncate', 'dimensions']],
  ])('every accepted %s key reaches the wire', async (kind, keys) => {
    const values: Record<string, any> = {
      think: false,
      keep_alive: '5m',
      format: 'json',
      truncate: false,
      suffix: 'S',
      system: 'SYS',
      template: 'T',
      raw: true,
      dimensions: 128,
    };
    const config = Object.fromEntries((keys as string[]).map((k) => [k, values[k]]));

    vi.mocked(fetchWithCache).mockResolvedValue({
      data:
        kind === 'embedding'
          ? ({ embeddings: [[0.1]] } as any)
          : kind === 'chat'
            ? '{"message":{"role":"assistant","content":"hi"},"done":true}\n'
            : '{"response":"hi","done":true}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    if (kind === 'embedding') {
      await new OllamaEmbeddingProvider('all-minilm', { config: config as any }).callEmbeddingApi(
        'text',
      );
    } else if (kind === 'chat') {
      await new OllamaChatProvider('m', { config: config as any }).callApi('p');
    } else {
      await new OllamaCompletionProvider('m', { config: config as any }).callApi('p');
    }

    const body = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string);
    for (const key of keys as string[]) {
      expect(body[key]).toBeDefined();
      expect(body.options?.[key]).toBeUndefined();
    }
  });
});

describe('OllamaEmbeddingProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should warn for a key the embed endpoint does not accept', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: { embeddings: [[0.1]] },
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const provider = new OllamaEmbeddingProvider('all-minilm', {
      config: { format: 'json', suffix: 'X' } as any,
    });
    await provider.callEmbeddingApi('test text');

    const body = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string);
    const warnings = warnSpy.mock.calls.map((c) => String(c[0]));
    warnSpy.mockRestore();

    // Every key allowed for an endpoint must be forwarded by it; otherwise the key is
    // silently dropped rather than warned about.
    expect(body.format).toBeUndefined();
    expect(warnings.some((w) => w.includes('embedding endpoint does not accept'))).toBe(true);
    expect(warnings.some((w) => w.includes('format'))).toBe(true);
  });

  it('should call the /api/embed endpoint and return the embedding with token usage', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: { embeddings: [[0.1, 0.2, 0.3]], prompt_eval_count: 4 },
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const provider = new OllamaEmbeddingProvider('all-minilm');
    const result = await provider.callEmbeddingApi('test text');

    expect(result).toEqual({
      embedding: [0.1, 0.2, 0.3],
      // numRequests must be explicit: the similarity matcher accumulates usage without
      // inferring a request count, so omitting it reports zero embedding requests.
      tokenUsage: { prompt: 4, total: 4, numRequests: 1 },
    });

    // /api/embeddings is superseded upstream; it also hard-errors on long inputs.
    const [url] = vi.mocked(fetchWithCache).mock.calls[0];
    expect(url).toBe('http://localhost:11434/api/embed');
  });

  it('should report a cached embedding as cached usage', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: { embeddings: [[0.1, 0.2]], prompt_eval_count: 7 },
      cached: true,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const provider = new OllamaEmbeddingProvider('all-minilm');
    const result = await provider.callEmbeddingApi('test text');

    expect(result.cached).toBe(true);
    expect(result.tokenUsage).toEqual({ cached: 7, total: 7 });
  });

  it('should default truncate to false so over-long input fails loudly', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: { embeddings: [[0.1]] },
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const provider = new OllamaEmbeddingProvider('all-minilm');
    await provider.callEmbeddingApi('test text');

    const body = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string);
    expect(body.input).toBe('test text');
    expect(body.truncate).toBe(false);
  });

  it('should thread config through to the embeddings request', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: { embeddings: [[0.1]] },
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const provider = new OllamaEmbeddingProvider('all-minilm', {
      config: {
        num_ctx: 2048,
        truncate: true,
        dimensions: 128,
        keep_alive: '5m',
      },
    });
    await provider.callEmbeddingApi('test text');

    // Previously callEmbeddingApi built {model, prompt} and ignored config entirely,
    // so num_ctx (the actual fix for a context-length error) was unreachable.
    const body = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string);
    expect(body.options.num_ctx).toBe(2048);
    expect(body.truncate).toBe(true);
    expect(body.dimensions).toBe(128);
    expect(body.keep_alive).toBe('5m');
  });

  it('should explain how to fix a context-length error', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: { error: 'the input length exceeds the context length' },
      cached: false,
      status: 400,
      statusText: 'Bad Request',
      headers: {},
    });

    const provider = new OllamaEmbeddingProvider('all-minilm');
    const result = await provider.callEmbeddingApi('a'.repeat(5000));

    expect(result.error).toContain('the input length exceeds the context length');
    expect(result.error).toContain('num_ctx');
    expect(result.error).toContain('truncate');
    expect(result.embedding).toBeUndefined();
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
