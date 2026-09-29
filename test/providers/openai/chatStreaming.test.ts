import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { fetchProviderRequestWithRetries } from '../../../src/providers/fetch';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';
import { readOpenAiChatStream } from '../../../src/providers/openai/chatStream';
import { HttpRateLimitError } from '../../../src/util/fetch/errors';
import { mockProcessEnv } from '../../util/utils';

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
}));
vi.mock('../../../src/providers/fetch', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchProviderRequestWithRetries: vi.fn(),
}));
const mockFetchWithRetries = vi.mocked(fetchProviderRequestWithRetries);
const mockFetchWithCache = vi.mocked(fetchWithCache);
beforeEach(() => {
  vi.resetAllMocks();
  mockProcessEnv({ OPENAI_API_KEY: 'fixture-key' });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function createMockSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let chunkIndex = 0;

  return new ReadableStream({
    pull(controller) {
      if (chunkIndex < chunks.length) {
        controller.enqueue(encoder.encode(chunks[chunkIndex]));
        chunkIndex++;
      } else {
        controller.close();
      }
    },
  });
}

describe('Streaming API', () => {
  it.each(['timeout', 'caller'])(
    'terminates a stalled body on %s and releases its reader',
    async (cause) => {
      vi.useFakeTimers();
      const restoreEnv = mockProcessEnv({ REQUEST_TIMEOUT_MS: '25' });
      try {
        const caller = new AbortController();
        let startRead!: () => void;
        const started = new Promise<void>((resolve) => {
          startRead = resolve;
        });
        let body!: ReadableStream<Uint8Array>;
        let signal!: AbortSignal;
        mockFetchWithRetries.mockImplementation(async (_url, options) => {
          signal = options!.signal as AbortSignal;
          body = new ReadableStream({
            start(controller) {
              signal.addEventListener('abort', () => controller.error(signal.reason), {
                once: true,
              });
            },
            pull() {
              startRead();
            },
          });
          return new Response(body);
        });
        const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
          config: { stream: true },
        });
        const pending = provider.callApi('Hello', undefined, { abortSignal: caller.signal });
        await started;
        expect(signal.aborted).toBe(false);
        if (cause === 'caller') {
          const cancelled = expect(pending).rejects.toThrow('Fixture cancellation');
          caller.abort(new DOMException('Fixture cancellation', 'AbortError'));
          await cancelled;
        } else {
          await vi.advanceTimersByTimeAsync(25);
          const result = await pending;
          expect(result.output).toBeUndefined();
          expect(result.error).toContain('timed out after 25ms');
        }
        expect(signal.aborted).toBe(true);
        expect(body.locked).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        restoreEnv();
      }
    },
  );

  it.each(['\r', '\n', '\r\n'])('accepts fragmented SSE line endings %j', async (lineEnding) => {
    const raw =
      'data: {"choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":"stop"}]}' +
      lineEnding.repeat(2) +
      'data: [DONE]' +
      lineEnding.repeat(2);
    const response = new Response(createMockSSEStream([...raw]));
    const result = await readOpenAiChatStream(response, vi.fn());
    expect(result.choices[0].message.content).toBe('Hello');
  });

  it('retains metadata from successive events', async () => {
    const chunks = [
      { id: 'fixture', first: 1, choices: [{ index: 0, delta: { content: 'Hello' } }] },
      { second: 2, choices: [] },
      { third: 3, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
    ];
    const body =
      chunks.map((chunk) => 'data: ' + JSON.stringify(chunk) + '\n\n').join('') +
      'data: [DONE]\n\n';
    const result = await readOpenAiChatStream(new Response(body), vi.fn());
    expect(result).toMatchObject({ id: 'fixture', first: 1, second: 2, third: 3 });
  });

  it.each([false, 0, '', true, []])(
    'rejects malformed terminal error envelopes: %j',
    async (error) => {
      const chunk = { error, choices: [{ index: 0, delta: { content: 'Incomplete' } }] };
      mockFetchWithRetries.mockResolvedValue(
        new Response('data: ' + JSON.stringify(chunk) + '\n\n'),
      );
      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
        config: { stream: true },
      });
      const result = await provider.callApi('Hello');
      expect(result.error).toContain('malformed SSE');
      expect(result.output).toBeUndefined();
    },
  );

  it('measures event limits in UTF-8 bytes across reads', async () => {
    const chunk = JSON.stringify({
      choices: [{ index: 0, delta: { content: '語'.repeat(350_000) }, finish_reason: 'stop' }],
    });
    const bytes = new TextEncoder().encode('data: ' + chunk + '\n\ndata: [DONE]\n\n');
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 100));
        controller.enqueue(bytes.slice(100));
        controller.close();
      },
    });
    await expect(readOpenAiChatStream(new Response(body), vi.fn())).rejects.toThrow('1 MiB limit');
  });

  it.each(['tool', 'legacy'])('preserves repeated %s function identifiers', async (kind) => {
    const functionDeltas = [
      { name: 'weather', arguments: '{' },
      { name: 'weather', arguments: '}' },
    ];
    const chunks: unknown[] = functionDeltas.map((fn) => ({
      choices: [
        {
          index: 0,
          delta:
            kind === 'tool'
              ? { tool_calls: [{ index: 0, id: 'fixture-call', function: fn }] }
              : { function_call: fn },
        },
      ],
    }));
    chunks.push({
      choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
    });
    const body =
      chunks.map((chunk) => 'data: ' + JSON.stringify(chunk) + '\n\n').join('') +
      'data: [DONE]\n\n';
    mockFetchWithRetries.mockResolvedValue(new Response(body));
    const callback = vi.fn().mockResolvedValue('Clear skies');
    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: { stream: true, functionToolCallbacks: { weather: callback } },
    });
    const result = await provider.callApi('Weather?');
    expect(result.error).toBeUndefined();
    expect(callback).toHaveBeenCalledExactlyOnceWith('{}');
    expect(result.output).toBe('Clear skies');
  });
  it('preserves explicitly empty text and aborts the request after DONE', async () => {
    mockFetchWithRetries.mockResolvedValue(
      new Response(
        'data: {"choices":[{"index":0,"delta":{"content":""},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
      ),
    );
    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', { config: { stream: true } });
    const result = await provider.callApi('Hello.');
    expect(result.error).toBeUndefined();
    expect(result.output).toBe('');
    expect(mockFetchWithRetries.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it.each([false, true])(
    'rejects unnamed tool calls, including mixed calls (%s)',
    async (mixed) => {
      const callback = vi.fn();
      const calls = [
        { index: 0, id: 'missing-name', function: { arguments: '{}' } },
        ...(mixed
          ? [{ index: 1, id: 'complete', function: { name: 'weather', arguments: '{}' } }]
          : []),
      ];
      mockFetchWithRetries.mockResolvedValue(
        new Response(
          'data: ' +
            JSON.stringify({
              choices: [{ index: 0, delta: { tool_calls: calls }, finish_reason: 'tool_calls' }],
            }) +
            '\n\ndata: [DONE]\n\n',
        ),
      );
      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
        config: { stream: true, functionToolCallbacks: { weather: callback } },
      });
      const result = await provider.callApi('Weather?');
      expect(result.error).toContain('incomplete tool call');
      expect(callback).not.toHaveBeenCalled();
    },
  );

  it.each(['outer', 'choice'])('retains gateway quota classification at %s', async (location) => {
    const error = {
      message: 'Fixture credits exhausted',
      metadata: { error_type: 'rate_limit_exceeded', provider_code: 'credit_balance_exhausted' },
    };
    const chunk =
      location === 'outer'
        ? { error }
        : {
            choices: [
              { index: 0, delta: { content: 'Partial reply' }, finish_reason: 'error', error },
            ],
          };
    mockFetchWithRetries.mockResolvedValue(new Response('data: ' + JSON.stringify(chunk) + '\n\n'));
    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: { stream: true, apiBaseUrl: 'https://gateway.example.test/v1' },
    });
    const result = await provider.callApi('A benign greeting');
    expect(result.error).toContain('Fixture credits exhausted');
    expect(result.metadata?.rateLimitKind).toBe('quota');
    expect(result.isRefusal).toBeUndefined();
  });

  it.each(['outer', 'choice', 'choiceWithoutFinish'])(
    'normalizes structured gateway refusals at %s',
    async (location) => {
      const error = {
        message: 'The model declined this request.',
        metadata: { error_type: 'content_policy_violation' },
      };
      const chunk =
        location === 'outer'
          ? { error }
          : {
              choices: [
                {
                  index: 0,
                  delta: { content: 'Partial reply' },
                  finish_reason: location === 'choiceWithoutFinish' ? undefined : 'error',
                  error,
                },
              ],
            };
      mockFetchWithRetries.mockResolvedValue(
        new Response('data: ' + JSON.stringify(chunk) + '\n\n'),
      );
      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
        config: { stream: true, apiBaseUrl: 'https://gateway.example.test/v1' },
      });
      const result = await provider.callApi('A benign greeting');
      expect(result.error).toBeUndefined();
      expect(result.isRefusal).toBe(true);
      expect(result.guardrails?.flagged).toBe(true);
      expect(result.output).toBe(location === 'outer' ? error.message : 'Partial reply');
    },
  );

  it.each(['refusal', 'content_filter'])(
    'does not execute local or MCP callbacks for a streamed %s',
    async (kind) => {
      const callback = vi.fn().mockResolvedValue('unused');
      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
        config: { stream: true, functionToolCallbacks: { weather: callback } },
      });
      const callTool = vi.fn();
      (provider as any).mcpClient = { getAllTools: () => [{ name: 'weather' }], callTool };
      const chunk = {
        choices: [
          {
            index: 0,
            delta: {
              content: 'Unable to answer.',
              ...(kind === 'refusal' ? { refusal: 'Unable to answer.' } : {}),
              tool_calls: [
                {
                  index: 0,
                  id: 'fixture-call',
                  type: 'function',
                  function: { name: 'weather', arguments: '{}' },
                },
              ],
            },
            finish_reason: kind === 'content_filter' ? kind : 'stop',
          },
        ],
      };
      mockFetchWithRetries.mockResolvedValue(
        new Response('data: ' + JSON.stringify(chunk) + '\n\ndata: [DONE]\n\n', { status: 200 }),
      );
      const response = await provider.callApi('Weather?');
      expect(response.isRefusal).toBe(true);
      expect(response.guardrails?.flagged).toBe(true);
      expect(callback).not.toHaveBeenCalled();
      expect(callTool).not.toHaveBeenCalled();
    },
  );

  it.each(['10', -1, false, { unexpected: 'value' }])(
    'rejects malformed streamed usage: %j',
    async (value) => {
      mockFetchWithRetries.mockResolvedValue(
        new Response(
          'data: ' +
            JSON.stringify({
              choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: 'stop' }],
              usage: { prompt_tokens: value },
            }) +
            '\n\ndata: [DONE]\n\n',
          { status: 200 },
        ),
      );
      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
        config: { stream: true },
      });
      const response = await provider.callApi('Hello');
      expect(response.error).toContain('malformed SSE');
      expect(response.output).toBeUndefined();
      expect(response.cost).toBeUndefined();
    },
  );

  it('rejects custom-tool streaming before sending a request', async () => {
    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: {
        stream: true,
        passthrough: { tools: [{ type: 'custom', custom: { name: 'fixture' } }] },
      },
    });
    expect((await provider.callApi('Hello')).error).toContain('Set stream: false for custom tools');
    expect(mockFetchWithRetries).not.toHaveBeenCalled();
  });

  it('preserves compatible-provider cost details while validating token counts', async () => {
    mockFetchWithRetries.mockResolvedValue(
      new Response(
        'data: ' +
          JSON.stringify({
            choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: 'stop' }],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 2,
              total_tokens: 12,
              cost: 0.01,
              cost_details: { upstream_inference_cost: 0.009 },
            },
          }) +
          '\n\ndata: [DONE]\n\n',
        { status: 200 },
      ),
    );
    const provider = new OpenAiChatCompletionProvider('openai/gpt-4o-mini', {
      config: { stream: true, apiBaseUrl: 'https://openrouter.ai/api/v1' },
    });
    const response = await provider.callApi('Hello');
    expect(response.error).toBeUndefined();
    expect(response.tokenUsage).toMatchObject({ prompt: 10, completion: 2, total: 12 });
    expect(response.cost).toBe(0.01);
  });

  it('cancels a malformed stream immediately', async () => {
    const cancel = vi.fn();
    mockFetchWithRetries.mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: invalid JSON\n\n'));
          },
          cancel,
        }),
        { status: 200 },
      ),
    );
    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', { config: { stream: true } });
    expect((await provider.callApi('Hello')).error).toContain('malformed SSE');
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('bounds an unfinished streaming event and cancels its body', async () => {
    const cancel = vi.fn();
    mockFetchWithRetries.mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: ' + ' '.repeat(1024 * 1024)));
          },
          cancel,
        }),
        { status: 200 },
      ),
    );
    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', { config: { stream: true } });
    expect((await provider.callApi('Hello')).error).toContain('1 MiB limit');
    expect(cancel).toHaveBeenCalledOnce();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithRetries.mockReset();
    mockFetchWithCache.mockReset();
  });

  it('should handle basic streaming response with content', async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n',
      'data: [DONE]\n\n',
    ];

    mockFetchWithRetries.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'x-request-id': 'stream-123' }),
      body: createMockSSEStream(sseChunks),
    } as unknown as Response);

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: { stream: true },
    });
    const result = await provider.callApi(JSON.stringify([{ role: 'user', content: 'Say hello' }]));

    expect(mockFetchWithRetries).toHaveBeenCalledTimes(1);
    const requestHeaders = mockFetchWithRetries.mock.calls[0][1]?.headers as Record<string, string>;
    expect(requestHeaders['X-OpenAI-Originator']).toBe('promptfoo');
    expect(result.output).toBe('Hello world');
    expect(result.tokenUsage).toEqual({
      prompt: 10,
      completion: 5,
      total: 15,
      numRequests: 1,
    });
    expect(result.cached).toBe(false);
    expect(result.metadata?.http).toEqual({
      status: 200,
      statusText: 'OK',
      headers: { 'x-request-id': 'stream-123' },
    });
  });

  it('should allow custom streaming headers to override OpenAI defaults', async () => {
    mockFetchWithRetries.mockResolvedValue({
      ok: true,
      body: createMockSSEStream([
        'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    } as unknown as Response);

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: {
        stream: true,
        organization: 'org-default',
        headers: {
          'X-OpenAI-Originator': 'custom-originator',
          'OpenAI-Organization': 'org-override',
        },
      },
    });
    await provider.callApi(JSON.stringify([{ role: 'user', content: 'Say hello' }]));

    const requestHeaders = mockFetchWithRetries.mock.calls[0][1]?.headers as Record<string, string>;
    expect(requestHeaders['X-OpenAI-Originator']).toBe('custom-originator');
    expect(requestHeaders['OpenAI-Organization']).toBe('org-override');
  });

  it('should preserve prompt-cache token details in streaming usage', async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15,"prompt_tokens_details":{"cached_tokens":4},"completion_tokens_details":{"reasoning_tokens":2}}}\n\n',
      'data: [DONE]\n\n',
    ];

    mockFetchWithRetries.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      body: createMockSSEStream(sseChunks),
    } as unknown as Response);

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: { stream: true },
    });
    const result = await provider.callApi(JSON.stringify([{ role: 'user', content: 'Say hello' }]));

    expect(result.tokenUsage).toEqual({
      prompt: 10,
      completion: 5,
      total: 15,
      numRequests: 1,
      completionDetails: {
        reasoning: 2,
        acceptedPrediction: undefined,
        rejectedPrediction: undefined,
        cacheReadInputTokens: 4,
      },
    });
  });

  it('should preserve streamed logprobs when requested', async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"Hello"},"logprobs":{"content":[{"token":"Hello","logprob":-0.1}]}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"!"},"logprobs":{"content":[{"token":"!","logprob":-0.2}]},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ];

    mockFetchWithRetries.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      body: createMockSSEStream(sseChunks),
    } as unknown as Response);

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: { stream: true },
    });
    const result = await provider.callApi(
      JSON.stringify([{ role: 'user', content: 'Say hello' }]),
      undefined,
      { includeLogProbs: true },
    );

    expect(result.output).toBe('Hello!');
    expect(result.logProbs).toEqual([-0.1, -0.2]);
    const requestBody = JSON.parse(mockFetchWithRetries.mock.calls[0]?.[1]?.body as string);
    expect(requestBody.logprobs).toBe(true);
  });

  it('should preserve streamed reasoning content when showThinking is enabled', async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"reasoning_content":"Let me reason. "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Final answer"},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ];

    mockFetchWithRetries.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      body: createMockSSEStream(sseChunks),
    } as unknown as Response);

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: { stream: true, showThinking: true },
    });
    const result = await provider.callApi(
      JSON.stringify([{ role: 'user', content: 'Explain briefly' }]),
    );

    expect(result.output).toBe('Thinking: Let me reason. \n\nFinal answer');
  });

  it('should preserve multiple streamed choices in response metadata', async () => {
    const sseChunks = [
      'data: {"choices":[{"index":0,"delta":{"content":"First"}},{"index":1,"delta":{"content":"Second"}}]}\n\n',
      'data: {"choices":[{"index":0,"delta":{"content":" result"},"finish_reason":"stop"},{"index":1,"delta":{"content":" result"},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ];

    mockFetchWithRetries.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      body: createMockSSEStream(sseChunks),
    } as unknown as Response);

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: { stream: true, passthrough: { n: 2 } },
    });
    const result = await provider.callApi(
      JSON.stringify([{ role: 'user', content: 'Give alternatives' }]),
    );

    expect(result.output).toBe('First result');
    expect(result.metadata?.choices).toEqual([
      {
        index: 0,
        finish_reason: 'stop',
        message: { role: 'assistant', content: 'First result' },
      },
      {
        index: 1,
        finish_reason: 'stop',
        message: { role: 'assistant', content: 'Second result' },
      },
    ]);
  });

  it('should handle streaming with tool calls', async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_123","function":{"name":"get_weather"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"loc"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ation\\": \\"NYC\\"}"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":15,"completion_tokens":20,"total_tokens":35}}\n\n',
      'data: [DONE]\n\n',
    ];

    mockFetchWithRetries.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'x-request-id': 'stream-123' }),
      body: createMockSSEStream(sseChunks),
    } as unknown as Response);

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: { stream: true },
    });
    const result = await provider.callApi(
      JSON.stringify([{ role: 'user', content: 'Weather in NYC?' }]),
    );

    expect(mockFetchWithRetries).toHaveBeenCalledTimes(1);
    expect(result.output).toEqual([
      {
        id: 'call_123',
        type: 'function',
        function: {
          name: 'get_weather',
          arguments: '{"location": "NYC"}',
        },
      },
    ]);
  });

  it('should handle streaming with function_call (legacy)', async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"function_call":{"name":"search"}}}]}\n\n',
      'data: {"choices":[{"delta":{"function_call":{"arguments":"{\\"query\\": \\"test\\"}"}}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"function_call"}]}\n\n',
      'data: [DONE]\n\n',
    ];

    mockFetchWithRetries.mockResolvedValue({
      ok: true,
      body: createMockSSEStream(sseChunks),
    } as unknown as Response);

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: { stream: true },
    });
    const result = await provider.callApi(
      JSON.stringify([{ role: 'user', content: 'Search for test' }]),
    );

    expect(result.output).toEqual({
      name: 'search',
      arguments: '{"query": "test"}',
    });
  });

  it('should run function tool callbacks in streaming mode', async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_123","function":{"name":"get_weather"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"location\\":\\"NYC\\"}"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n',
      'data: [DONE]\n\n',
    ];

    mockFetchWithRetries.mockResolvedValue({
      ok: true,
      body: createMockSSEStream(sseChunks),
    } as unknown as Response);

    const mockWeatherFunction = vi.fn().mockResolvedValue('Sunny, 25C');
    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: {
        stream: true,
        functionToolCallbacks: {
          get_weather: mockWeatherFunction,
        },
      },
    });
    const result = await provider.callApi(
      JSON.stringify([{ role: 'user', content: 'Weather in NYC?' }]),
    );

    expect(mockWeatherFunction).toHaveBeenCalledWith('{"location":"NYC"}');
    expect(result.output).toBe('Sunny, 25C');
  });

  it('should surface MCP tool error results in streaming mode', async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_123","function":{"name":"read_file"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"path\\":\\"fixtures/missing.txt\\"}"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n',
      'data: [DONE]\n\n',
    ];

    mockFetchWithRetries.mockResolvedValue({
      ok: true,
      body: createMockSSEStream(sseChunks),
    } as unknown as Response);

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: { stream: true },
    });
    const mcpClient = {
      getAllTools: vi.fn().mockReturnValue([{ name: 'read_file' }]),
      callTool: vi.fn().mockResolvedValue({
        content: 'File not found',
        isError: true,
      }),
    };
    (provider as any).mcpClient = mcpClient;

    const result = await provider.callApi(
      JSON.stringify([{ role: 'user', content: 'Read the file' }]),
    );

    expect(mcpClient.callTool).toHaveBeenCalledWith('read_file', {
      path: 'fixtures/missing.txt',
    });
    expect(result.output).toBe('MCP Tool Error (read_file): File not found');
  });

  it('should handle streaming API error response', async () => {
    mockFetchWithRetries.mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: new Headers({ 'retry-after': '60' }),
      body: createMockSSEStream(['Rate limit exceeded']),
    } as unknown as Response);

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: { stream: true },
    });
    const result = await provider.callApi(JSON.stringify([{ role: 'user', content: 'Test' }]));

    expect(result.error).toContain('429 Too Many Requests');
    expect(result.error).toContain('Rate limit exceeded');
    expect(result.metadata?.http).toEqual({
      status: 429,
      statusText: 'Too Many Requests',
      headers: { 'retry-after': '60' },
    });
  });

  it('should preserve invalid_prompt refusals returned before streaming begins', async () => {
    mockFetchWithRetries.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      headers: new Headers(),
      body: createMockSSEStream(['{"error":{"code":"invalid_prompt"}}']),
    } as unknown as Response);

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: { stream: true },
    });
    const result = await provider.callApi(JSON.stringify([{ role: 'user', content: 'Test' }]));

    expect(result.output).toContain('invalid_prompt');
    expect(result.isRefusal).toBe(true);
    expect(result.guardrails).toEqual({ flagged: true, flaggedInput: true });
  });

  it('should preserve structured quota errors from streaming request retries', async () => {
    mockFetchWithRetries.mockRejectedValue(
      new HttpRateLimitError({
        status: 429,
        statusText: 'Too Many Requests',
        code: 'insufficient_quota',
        headers: { 'x-request-id': 'quota-request' },
      }),
    );

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: { stream: true, maxRetries: 0 },
    });
    const result = await provider.callApi(JSON.stringify([{ role: 'user', content: 'Test' }]));

    expect(result.error).toContain('Quota exceeded');
    expect(result.metadata?.rateLimitKind).toBe('quota');
    expect(result.metadata?.http).toEqual({
      status: 429,
      statusText: 'Too Many Requests',
      headers: { 'x-request-id': 'quota-request' },
    });
    expect(mockFetchWithRetries.mock.calls[0]?.[3]).toBe(0);
  });

  it('should handle streaming with missing response body', async () => {
    mockFetchWithRetries.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      body: null,
    } as unknown as Response);

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: { stream: true },
    });
    const result = await provider.callApi(JSON.stringify([{ role: 'user', content: 'Test' }]));

    expect(result.error).toContain('No response body for streaming request');
  });

  it('should parse JSON structured output in streaming mode', async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"{\\"name\\": \\"John\\""}}]}\n\n',
      'data: {"choices":[{"delta":{"content":", \\"age\\": 30}"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ];

    mockFetchWithRetries.mockResolvedValue({
      ok: true,
      body: createMockSSEStream(sseChunks),
    } as unknown as Response);

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: {
        stream: true,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'person',
            strict: true,
            schema: {
              type: 'object',
              properties: { name: { type: 'string' }, age: { type: 'number' } },
              required: ['name', 'age'],
              additionalProperties: false,
            },
          },
        },
      },
    });
    const result = await provider.callApi(
      JSON.stringify([{ role: 'user', content: 'Get person' }]),
    );

    expect(result.output).toEqual({ name: 'John', age: 30 });
  });

  it('should handle content_filter finish reason in streaming', async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"content_filter"}]}\n\n',
      'data: [DONE]\n\n',
    ];

    mockFetchWithRetries.mockResolvedValue({
      ok: true,
      body: createMockSSEStream(sseChunks),
    } as unknown as Response);

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: { stream: true },
    });
    const result = await provider.callApi(JSON.stringify([{ role: 'user', content: 'Test' }]));

    expect(result.output).toBe('Partial');
    expect(result.finishReason).toBe('content_filter');
    expect(result.isRefusal).toBe(true);
    expect(result.guardrails).toEqual({ flagged: true });
  });

  it('should surface streamed refusal text as a guarded refusal', async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"refusal":"I cannot "}}]}\n\n',
      'data: {"choices":[{"delta":{"refusal":"help with that."},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ];

    mockFetchWithRetries.mockResolvedValue({
      ok: true,
      body: createMockSSEStream(sseChunks),
    } as unknown as Response);

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: { stream: true },
    });
    const result = await provider.callApi(JSON.stringify([{ role: 'user', content: 'Test' }]));

    expect(result.output).toBe('I cannot help with that.');
    expect(result.isRefusal).toBe(true);
    expect(result.guardrails).toEqual({ flagged: true });
  });

  it('should handle partial SSE lines across chunks', async () => {
    // Simulate partial line split across chunks
    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"Hel',
      'lo"}}]}\n\ndata: {"choices":[{"delta":{"content":" wor',
      'ld"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
    ];

    mockFetchWithRetries.mockResolvedValue({
      ok: true,
      body: createMockSSEStream(sseChunks),
    } as unknown as Response);

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: { stream: true },
    });
    const result = await provider.callApi(JSON.stringify([{ role: 'user', content: 'Test' }]));

    expect(result.output).toBe('Hello world');
  });

  it('should reassemble multiple data lines in a single SSE event', async () => {
    const sseChunks = [
      'data: {"choices":[\n',
      'data: {"delta":{"content":"Hello from multiline SSE"},"finish_reason":"stop"}\n',
      'data: ]}\n\n',
      'data: [DONE]\n\n',
    ];

    mockFetchWithRetries.mockResolvedValue({
      ok: true,
      body: createMockSSEStream(sseChunks),
    } as unknown as Response);

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: { stream: true },
    });
    const result = await provider.callApi(JSON.stringify([{ role: 'user', content: 'Test' }]));

    expect(result.output).toBe('Hello from multiline SSE');
    expect(result.error).toBeUndefined();
  });

  it('should handle CRLF, data without a space, and final buffered SSE line', async () => {
    const sseChunks = [
      'data:{"choices":[{"delta":{"content":"Hello"}}]}\r\n\r\n',
      'data: {"choices":[{"delta":{"content":" stream"}}]}\r\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":4,"completion_tokens":2,"total_tokens":6}}\r\n',
      'data:[DONE]',
    ];

    mockFetchWithRetries.mockResolvedValue({
      ok: true,
      body: createMockSSEStream(sseChunks),
    } as unknown as Response);

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: { stream: true },
    });
    const result = await provider.callApi(JSON.stringify([{ role: 'user', content: 'Test' }]));

    expect(result.output).toBe('Hello stream');
    expect(result.tokenUsage).toEqual({
      prompt: 4,
      completion: 2,
      total: 6,
      numRequests: 1,
    });
  });

  it('should skip SSE comments and empty lines', async () => {
    const sseChunks = [
      ': this is a comment\n\n',
      '\n',
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      ': another comment\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ];

    mockFetchWithRetries.mockResolvedValue({
      ok: true,
      body: createMockSSEStream(sseChunks),
    } as unknown as Response);

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: { stream: true },
    });
    const result = await provider.callApi(JSON.stringify([{ role: 'user', content: 'Test' }]));

    expect(result.output).toBe('Hello');
  });

  it('should include stream_options in request body', async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"Test"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":1,"total_tokens":6}}\n\n',
      'data: [DONE]\n\n',
    ];

    mockFetchWithRetries.mockResolvedValue({
      ok: true,
      body: createMockSSEStream(sseChunks),
    } as unknown as Response);

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: { stream: true },
    });
    await provider.callApi(JSON.stringify([{ role: 'user', content: 'Test' }]));

    expect(mockFetchWithRetries).toHaveBeenCalledTimes(1);
    const callArgs = mockFetchWithRetries.mock.calls[0];
    const requestBody = JSON.parse(callArgs[1]?.body as string);
    expect(requestBody.stream).toBe(true);
    expect(requestBody.stream_options).toEqual({ include_usage: true });
    expect(callArgs[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('should reject streaming audio output rather than returning incomplete media', async () => {
    const provider = new OpenAiChatCompletionProvider('gpt-4o-audio-preview', {
      config: { stream: true },
    });
    const result = await provider.callApi(JSON.stringify([{ role: 'user', content: 'Speak' }]));

    expect(result.error).toContain('do not support audio output');
    expect(mockFetchWithRetries).not.toHaveBeenCalled();
  });

  it('should preserve stream_options passthrough values while requesting usage', async () => {
    const sseChunks = ['data: {"choices":[{"delta":{"content":"Test"}}]}\n\n', 'data: [DONE]\n\n'];

    mockFetchWithRetries.mockResolvedValue({
      ok: true,
      body: createMockSSEStream(sseChunks),
    } as unknown as Response);

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: {
        stream: true,
        passthrough: {
          stream_options: { include_obfuscation: true },
        },
      },
    });
    await provider.callApi(JSON.stringify([{ role: 'user', content: 'Test' }]));

    const callArgs = mockFetchWithRetries.mock.calls[0];
    const requestBody = JSON.parse(callArgs[1]?.body as string);
    expect(requestBody.stream_options).toEqual({
      include_obfuscation: true,
      include_usage: true,
    });
  });

  it('should handle network errors during streaming', async () => {
    mockFetchWithRetries.mockRejectedValue(new Error('Network error'));

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: { stream: true },
    });
    const result = await provider.callApi(JSON.stringify([{ role: 'user', content: 'Test' }]));

    expect(result.error).toContain('Network error');
  });

  it('should preserve HTTP metadata when a stream reader fails', async () => {
    const streamError = new Error('Stream interrupted');
    mockFetchWithRetries.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'x-request-id': 'stream-failed' }),
      body: new ReadableStream({
        start(controller) {
          controller.error(streamError);
        },
      }),
    } as unknown as Response);

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: { stream: true },
    });
    const result = await provider.callApi(JSON.stringify([{ role: 'user', content: 'Test' }]));

    expect(result.error).toContain('Stream interrupted');
    expect(result.metadata?.http).toEqual({
      status: 200,
      statusText: 'OK',
      headers: { 'x-request-id': 'stream-failed' },
    });
  });

  it('should handle mixed content and tool calls in streaming', async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"Let me check "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"the weather."}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_abc","function":{"name":"weather","arguments":"{}"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
      'data: [DONE]\n\n',
    ];

    mockFetchWithRetries.mockResolvedValue({
      ok: true,
      body: createMockSSEStream(sseChunks),
    } as unknown as Response);

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: { stream: true },
    });
    const result = await provider.callApi(JSON.stringify([{ role: 'user', content: 'Weather?' }]));

    expect(result.output).toEqual({
      role: 'assistant',
      content: 'Let me check the weather.',
      tool_calls: [
        {
          id: 'call_abc',
          type: 'function',
          function: { name: 'weather', arguments: '{}' },
        },
      ],
    });
  });

  it('should fail closed when an SSE chunk is malformed', async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {invalid json chunk}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ];

    mockFetchWithRetries.mockResolvedValue({
      ok: true,
      body: createMockSSEStream(sseChunks),
    } as unknown as Response);

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: { stream: true },
    });
    const result = await provider.callApi(JSON.stringify([{ role: 'user', content: 'Test' }]));

    expect(result.error).toContain('API returned malformed SSE data during streaming request');
    expect(result.output).toBeUndefined();
  });

  it('should surface a top-level streamed error instead of returning partial output', async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"Partial output"}}]}\n\n',
      'data: {"error":{"message":"Upstream provider overloaded","code":"provider_error"}}\n\n',
      'data: [DONE]\n\n',
    ];

    mockFetchWithRetries.mockResolvedValue({
      ok: true,
      body: createMockSSEStream(sseChunks),
    } as unknown as Response);

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: { stream: true },
    });
    const result = await provider.callApi(JSON.stringify([{ role: 'user', content: 'Test' }]));

    expect(result.error).toContain('Upstream provider overloaded');
    expect(result.output).toBeUndefined();
  });

  it('should reject invalid streamed choice and tool-call indexes', async () => {
    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: { stream: true },
    });
    const malformedStreams = [
      'data: {"choices":[{"index":-1,"delta":{"content":"Invalid"}}]}\n\ndata: [DONE]\n\n',
      'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":-1,"function":{"name":"invalid"}}]}}]}\n\ndata: [DONE]\n\n',
    ];

    for (const stream of malformedStreams) {
      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        body: createMockSSEStream([stream]),
      } as unknown as Response);

      const result = await provider.callApi(JSON.stringify([{ role: 'user', content: 'Test' }]));
      expect(result.error).toContain('API returned malformed SSE data during streaming request');
    }
  });

  it('should reject an incomplete stream instead of returning or caching partial output', async () => {
    mockFetchWithRetries.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      body: createMockSSEStream(['data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n']),
    } as unknown as Response);

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: { stream: true },
    });
    const result = await provider.callApi(JSON.stringify([{ role: 'user', content: 'Test' }]));

    expect(result.error).toContain(
      'Streaming response ended before the [DONE] completion marker was received',
    );
  });

  it('should reject a stream that closes after finish_reason but before DONE', async () => {
    mockFetchWithRetries.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      body: createMockSSEStream([
        'data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":3,"total_tokens":13}}\n\n',
      ]),
    } as unknown as Response);

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: { stream: true },
    });
    const result = await provider.callApi(JSON.stringify([{ role: 'user', content: 'Test' }]));

    expect(result.error).toContain(
      'Streaming response ended before the [DONE] completion marker was received',
    );
  });

  it('should handle invalid JSON output with response_format json_schema', async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"not valid json {"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ];

    mockFetchWithRetries.mockResolvedValue({
      ok: true,
      body: createMockSSEStream(sseChunks),
    } as unknown as Response);

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: {
        stream: true,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'test_output',
            strict: true,
            schema: {
              type: 'object',
              properties: { value: { type: 'string' } },
              additionalProperties: false,
            },
          },
        },
      },
    });
    const result = await provider.callApi(JSON.stringify([{ role: 'user', content: 'Test' }]));

    // Should return raw string when JSON parsing fails
    expect(result.output).toBe('not valid json {');
  });

  it('should fetch again instead of persisting streaming responses in the response cache', async () => {
    const buildResponse = (content: string) =>
      ({
        ok: true,
        body: createMockSSEStream([
          `data: {"choices":[{"delta":{"content":"${content}"},"finish_reason":"stop"}]}\n\n`,
          'data: [DONE]\n\n',
        ]),
      }) as unknown as Response;
    mockFetchWithRetries
      .mockResolvedValueOnce(buildResponse('First response'))
      .mockResolvedValueOnce(buildResponse('Second response'));

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: { stream: true },
    });
    const first = await provider.callApi(
      JSON.stringify([{ role: 'user', content: 'Sensitive prompt' }]),
    );
    const second = await provider.callApi(
      JSON.stringify([{ role: 'user', content: 'Sensitive prompt' }]),
    );

    expect(first.output).toBe('First response');
    expect(second.output).toBe('Second response');
    expect(mockFetchWithRetries).toHaveBeenCalledTimes(2);
    expect(mockFetchWithCache).not.toHaveBeenCalled();
  });
});
