import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpProvider } from '../../src/providers/http';
import { DEFAULT_RETRY_POLICY, shouldRetry } from '../../src/scheduler/retryPolicy';
import * as fetchModule from '../../src/util/fetch';
import * as monkeyPatchFetchModule from '../../src/util/fetch/monkeyPatchFetch';
import { timedStream } from '../util/timedStream';

function respondInChunks(chunks: string[], delayMs: number) {
  vi.spyOn(fetchModule, 'fetchWithRetries').mockResolvedValue(
    new Response(timedStream(chunks, delayMs), {
      headers: { 'Content-Type': 'text/event-stream' },
    }),
  );
}

async function settlePendingTimers<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}

describe('HttpProvider streaming integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it.each(['timeout', 'caller'])(
    'aborts a pending streaming body on %s cancellation',
    async (source) => {
      vi.useFakeTimers();
      vi.stubEnv('REQUEST_TIMEOUT_MS', '1000');
      const caller = new AbortController();
      const transport = vi.spyOn(monkeyPatchFetchModule, 'monkeyPatchFetch').mockImplementation(
        async (_url, options) =>
          new Response(
            new ReadableStream({
              start(controller) {
                options?.signal?.addEventListener(
                  'abort',
                  () => controller.error(new Error('stream interrupted')),
                  { once: true },
                );
              },
            }),
          ),
      );
      const provider = new HttpProvider('https://example.com/stream', {
        config: { method: 'POST', body: { stream: true } },
      });
      const result = provider.callApi('Hello', undefined, { abortSignal: caller.signal });
      const rejection = expect(result).rejects.toThrow(
        source === 'timeout' ? 'Request timed out after 1000 ms' : 'stream interrupted',
      );
      await vi.waitFor(() => expect(transport).toHaveBeenCalledOnce());
      if (source === 'timeout') {
        await vi.advanceTimersByTimeAsync(1000);
      } else {
        caller.abort();
      }
      await rejection;
    },
  );

  it.each([204, 205])(
    'passes bodyless HTTP %s responses through status and output handlers',
    async (status) => {
      vi.spyOn(fetchModule, 'fetchWithRetries').mockImplementation(
        async () => new Response(null, { status }),
      );
      const transformResponse = vi.fn((_json, text) =>
        text === '' ? 'No content' : 'Unexpected body',
      );
      const provider = new HttpProvider('https://example.com/stream', {
        config: {
          method: 'POST',
          body: { stream: true },
          validateStatus: (value: number) => value === status,
          transformResponse,
        },
      });
      const result = await provider.callApi('Hello');
      expect(result.output).toBe('No content');
      expect(result.streamingMetrics?.timeToFirstToken).toBeUndefined();
      expect(transformResponse).toHaveBeenCalledOnce();

      const rejected = new HttpProvider('https://example.com/stream', {
        config: { method: 'POST', body: { stream: true }, validateStatus: () => false },
      });
      await expect(rejected.callApi('Hello')).rejects.toThrow(
        `HTTP call failed with status ${status}`,
      );
    },
  );

  it('preserves HTTP context for scheduler retries without exposing URL credentials', async () => {
    const bodyError = new TypeError('terminated');
    vi.spyOn(fetchModule, 'fetchWithRetries').mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(bodyError);
          },
        }),
        { status: 503, statusText: 'Service Unavailable' },
      ),
    );
    const provider = new HttpProvider('https://example.com/stream?api_key=fixture-secret', {
      config: { method: 'POST', body: { stream: true } },
    });
    const error = await provider.callApi('Hello').catch((error: Error) => error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('HTTP 503 Service Unavailable');
    expect((error as Error).message).toContain('https://example.com/stream');
    expect((error as Error).message).not.toContain('fixture-secret');
    expect((error as Error).cause).toBe(bodyError);
    expect(shouldRetry(0, error as Error, false, DEFAULT_RETRY_POLICY)).toBe(true);
  });

  it('keeps retry backoff outside the per-attempt and body timeouts', async () => {
    vi.useFakeTimers();
    vi.stubEnv('REQUEST_TIMEOUT_MS', '1000');
    vi.stubEnv('PROMPTFOO_REQUEST_BACKOFF_MS', '2000');
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const fetch = vi
      .spyOn(monkeyPatchFetchModule, 'monkeyPatchFetch')
      .mockRejectedValueOnce(new Error('temporary transport failure'))
      .mockResolvedValueOnce(new Response('Hello'));
    const provider = new HttpProvider('https://example.com/stream', {
      config: { method: 'POST', body: { stream: true }, maxRetries: 1 },
    });

    const result = await settlePendingTimers(provider.callApi('Hello'));

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.output).toBe('Hello');
    expect(result.streamingMetrics?.timeToFirstToken).toBe(2000);
  });

  it('preserves cancellation during a body-read retry delay', async () => {
    vi.useFakeTimers();
    const caller = new AbortController();
    const fetch = vi.spyOn(fetchModule, 'fetchWithRetries').mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error('ECONNRESET'));
          },
        }),
      ),
    );
    const provider = new HttpProvider('https://example.com/stream', {
      config: { method: 'PUT', body: { stream: true } },
    });
    const result = provider.callApi('Hello', undefined, { abortSignal: caller.signal });
    const rejection = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(100);
    caller.abort();
    await rejection;
    await vi.runAllTimersAsync();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('retries transient PUT body reads twice before returning the successful metrics', async () => {
    vi.useFakeTimers();
    const fetch = vi.spyOn(fetchModule, 'fetchWithRetries');
    for (let i = 0; i < 2; i++) {
      fetch.mockResolvedValueOnce(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error('ECONNRESET during body read'));
            },
          }),
        ),
      );
    }
    fetch.mockResolvedValueOnce(new Response('Complete output'));
    const provider = new HttpProvider('https://example.com/stream', {
      config: { method: 'PUT', body: { stream: true } },
    });

    const result = await settlePendingTimers(provider.callApi('Hello'));

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(result.output).toBe('Complete output');
    expect(result.streamingMetrics?.timeToFirstToken).toBe(3000);
  });

  it.each([
    ['PUT', 'ECONNRESET during body read', 3],
    ['PUT', 'invalid stream', 1],
    ['POST', 'ECONNRESET during body read', 1],
    ['PATCH', 'ECONNRESET during body read', 1],
  ] as const)('limits %s body retries for %s to %s attempts', async (method, message, attempts) => {
    vi.useFakeTimers();
    const fetch = vi.spyOn(fetchModule, 'fetchWithRetries').mockImplementation(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error(message));
            },
          }),
        ),
    );
    const provider = new HttpProvider('https://example.com/stream', {
      config: { method, body: { stream: true } },
    });
    const rejection = expect(provider.callApi('Hello')).rejects.toThrow(message);
    await vi.runAllTimersAsync();
    await rejection;
    expect(fetch).toHaveBeenCalledTimes(attempts);
  });

  it('does not retry a failed body when maxRetries is zero', async () => {
    const fetch = vi.spyOn(fetchModule, 'fetchWithRetries').mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error('ECONNRESET'));
          },
        }),
      ),
    );
    const provider = new HttpProvider('https://example.com/stream', {
      config: { method: 'PUT', body: { stream: true }, maxRetries: 0 },
    });
    await expect(provider.callApi('Hello')).rejects.toThrow('ECONNRESET');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('reads each live response once, even with identical requests and a generic content type', async () => {
    const response = new Response('first');
    const clone = vi.spyOn(response, 'clone');
    const transport = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce(new Response('second'));
    const provider = new HttpProvider('https://example.com/stream', {
      config: { method: 'POST', body: { stream: true } },
    });
    for (const output of ['first', 'second']) {
      expect(await provider.callApi('Hello')).toMatchObject({ cached: false, output });
    }
    expect(clone).not.toHaveBeenCalled();
    expect(transport.mock.calls[0][1]).not.toHaveProperty('readBody');
  });

  it('aborts the transport and any clone when parsing stops early', async () => {
    let signal: AbortSignal | null | undefined;
    let loggedBody: Promise<string>;
    vi.spyOn(fetchModule, 'fetchWithRetries').mockImplementation(async (_url, options) => {
      signal = options?.signal;
      const response = new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: ' + ' '.repeat(64 * 1024)));
            signal?.addEventListener('abort', () => controller.error(signal?.reason), {
              once: true,
            });
          },
        }),
      );
      loggedBody = response.clone().text();
      void loggedBody.catch(() => {});
      return response;
    });
    const provider = new HttpProvider('https://example.com/stream', {
      config: { method: 'POST', body: { stream: true }, streamFormat: 'openai-chat' },
    });

    await expect(provider.callApi('Hello')).rejects.toThrow('exceeds 64 KiB');
    expect(signal?.aborted).toBe(true);
    await expect(loggedBody!).rejects.toThrow('exceeds 64 KiB');
  });

  it.each([{ stream: true }, '{"stream":true}', '{{prompt}}'])(
    'detects streaming in the rendered JSON body: %j',
    async (body) => {
      vi.spyOn(fetchModule, 'fetchWithRetries').mockResolvedValue(new Response('Hello'));
      const provider = new HttpProvider('https://example.com/stream', {
        config: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
      });

      const result = await provider.callApi('{"stream":true}');

      expect(result.streamingMetrics?.timeToFirstToken).toBeDefined();
      expect(result.cached).toBe(false);
      expect(fetchModule.fetchWithRetries).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ body: '{"stream":true}' }),
        expect.any(Number),
        undefined,
        undefined,
      );
    },
  );

  describe('TTFT measurement', () => {
    const chunks = [
      'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: [DONE]\n\n',
    ];
    const url = 'https://api.example.com';
    const request = { method: 'POST', body: { stream: true } } as const;
    const rawRequest = {
      request: [
        'POST /chat HTTP/1.1',
        'Host: api.example.com',
        'Content-Type: application/json',
        '',
        '{"stream":true,"prompt":"{{prompt}}"}',
      ].join('\n'),
    };

    it.each([false, true])(
      'measures full latency and first text with buffered=%s',
      async (buffered) => {
        vi.useFakeTimers();
        respondInChunks(buffered ? [chunks.join('')] : chunks, 50);
        const provider = new HttpProvider(url, {
          config: {
            ...request,
            streamFormat: 'openai-chat',
            transformResponse: `() => ({ output: 'Hello world' })`,
          },
        });

        const result = await provider.callApi('Test');
        expect(result).toMatchObject({
          output: 'Hello world',
          cached: false,
          latencyMs: buffered ? 50 : 200,
          streamingMetrics: {
            timeToFirstToken: buffered ? 50 : 100,
            totalStreamTime: buffered ? 0 : 150,
            multiChunkDelivery: !buffered,
            completionChars: 11,
          },
        });
        expect(result.streamingMetrics?.tokensPerSecond).toBe(buffered ? undefined : 20);
      },
    );

    it.each([request, rawRequest])(
      'does not infer throughput from framing for %j',
      async (config) => {
        vi.useFakeTimers();
        respondInChunks(chunks, 30);
        const provider = new HttpProvider(url, {
          config: { ...config, transformResponse: '() => ({ tokenUsage: { total: 10 } })' },
        });

        const result = await provider.callApi('Test');
        expect(result.streamingMetrics).toMatchObject({
          timeToFirstToken: 30,
          totalStreamTime: 90,
          multiChunkDelivery: true,
        });
        expect(result.streamingMetrics?.completionChars).toBeUndefined();
        expect(result.streamingMetrics?.tokensPerSecond).toBeUndefined();
      },
    );

    it('preserves untransformed text without reporting throughput', async () => {
      vi.useFakeTimers();
      respondInChunks(chunks, 25);
      const provider = new HttpProvider(url, { config: request });
      const result = await provider.callApi('Test');
      expect(result.output).toBe(chunks.join(''));
      expect(result.latencyMs).toBe(100);
      expect(result.streamingMetrics?.timeToFirstToken).toBe(25);
      expect(result.streamingMetrics?.completionChars).toBeUndefined();
      expect(result.streamingMetrics?.tokensPerSecond).toBeUndefined();
    });
  });
});
