import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as cache from '../../../src/cache';
import logger from '../../../src/logger';
import { loadApiProvider } from '../../../src/providers';
import { MCPClient } from '../../../src/providers/mcp/client';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';
import { OpenRouterProvider } from '../../../src/providers/openrouter';
import { SnowflakeCortexProvider } from '../../../src/providers/snowflake';
import { RateLimitRegistry, wrapProviderWithRateLimiting } from '../../../src/scheduler';
import { createDeferred, mockProcessEnv } from '../../util/utils';
import type { MockInstance } from 'vitest';

const payload = {
  choices: [{ message: { role: 'assistant', content: 'fixture output' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
};
const response = () =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
const provider = () =>
  new OpenAiChatCompletionProvider('team/served-model:revision-1', {
    config: { apiBaseUrl: 'https://chat.fixture.test/v1', apiKey: 'fixture-key', maxRetries: 0 },
  });

function mockPendingFetch(fetch: MockInstance<typeof globalThis.fetch>): Promise<AbortSignal> {
  const started = createDeferred<AbortSignal>();
  fetch.mockImplementationOnce(
    (_url, options) =>
      new Promise((_resolve, reject) => {
        const signal = options!.signal!;
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        started.resolve(signal);
      }),
  );
  return started.promise;
}

function withCompletedCache(run: () => Promise<void>) {
  return cache.withCacheNamespace(randomUUID(), () => cache.withCacheEnabled(true, run));
}

describe('OpenAI-compatible chat cancellation', () => {
  let restoreEnvironment: () => void;
  let cacheWasEnabled: boolean;
  let fetch: MockInstance<typeof globalThis.fetch>;

  beforeEach(() => {
    restoreEnvironment = mockProcessEnv();
    cacheWasEnabled = cache.isCacheEnabled();
    cache.disableCache();
    fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected fixture request'));
    vi.spyOn(logger, 'error').mockImplementation(() => logger);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    restoreEnvironment();
    if (cacheWasEnabled) {
      cache.enableCache();
    }
  });

  it.each([undefined, new Error('caller cancelled'), 'custom reason'])(
    'rejects a pre-aborted caller before dispatch (%s)',
    async (reason) => {
      const controller = new AbortController();
      controller.abort(reason);
      await expect(
        provider().callApi('fixture', undefined, { abortSignal: controller.signal }),
      ).rejects.toMatchObject({
        name: 'AbortError',
        ...(reason instanceof Error ? { message: reason.message } : {}),
      });
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('does not dispatch after cancellation during MCP initialization', async () => {
    const initialization = createDeferred<void>();
    vi.spyOn(MCPClient.prototype, 'initialize').mockReturnValue(initialization.promise);
    const target = new OpenAiChatCompletionProvider('fixture', {
      config: { apiKey: 'fixture-key', mcp: { enabled: true } },
    });
    const controller = new AbortController();
    const pending = target.callApi('fixture', undefined, { abortSignal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    initialization.resolve();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not await canceled MCP initialization during cleanup', async () => {
    const initialization = createDeferred<void>();
    vi.spyOn(MCPClient.prototype, 'initialize').mockReturnValue(initialization.promise);
    const cleanup = vi.spyOn(MCPClient.prototype, 'cleanup').mockResolvedValue();
    const target = new OpenAiChatCompletionProvider('fixture', {
      config: { apiKey: 'fixture-key', mcp: { enabled: true } },
    });
    const controller = new AbortController();
    const pending = target.callApi('fixture', undefined, { abortSignal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });

    await expect(target.cleanup()).resolves.toBeUndefined();
    expect(cleanup).not.toHaveBeenCalled();
    initialization.resolve();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('observes a late MCP initialization failure after a pre-aborted first call', async () => {
    const initialization = createDeferred<void>();
    vi.spyOn(MCPClient.prototype, 'initialize').mockReturnValue(initialization.promise);
    const unhandledRejection = vi.fn();
    process.on('unhandledRejection', unhandledRejection);
    try {
      const target = new OpenAiChatCompletionProvider('fixture', {
        config: { apiKey: 'fixture-key', mcp: { enabled: true } },
      });
      const controller = new AbortController();
      controller.abort(new Error('cancel before MCP initialization'));
      await expect(
        target.callApi('fixture', undefined, { abortSignal: controller.signal }),
      ).rejects.toMatchObject({ name: 'AbortError', message: 'cancel before MCP initialization' });

      const failure = new Error('MCP initialization failed');
      initialization.reject(failure);
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(unhandledRejection).not.toHaveBeenCalled();
      await expect(target.callApi('fixture')).rejects.toBe(failure);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandledRejection);
    }
  });

  it('preserves an uncancelled call waiting on a failed MCP initialization', async () => {
    const initialization = createDeferred<void>();
    vi.spyOn(MCPClient.prototype, 'initialize').mockReturnValue(initialization.promise);
    const target = new OpenAiChatCompletionProvider('fixture', {
      config: { apiKey: 'fixture-key', mcp: { enabled: true } },
    });
    const failure = new Error('MCP connection failed');
    const pending = target.callApi('fixture');
    const rejected = expect(pending).rejects.toBe(failure);
    initialization.reject(failure);
    await rejected;
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reuses successful MCP initialization after a pre-aborted first call', async () => {
    const initialization = createDeferred<void>();
    const initialize = vi
      .spyOn(MCPClient.prototype, 'initialize')
      .mockReturnValue(initialization.promise);
    const target = new OpenAiChatCompletionProvider('fixture', {
      config: { apiKey: 'fixture-key', mcp: { enabled: true } },
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      target.callApi('fixture', undefined, { abortSignal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    initialization.resolve();
    fetch.mockResolvedValueOnce(response());
    await expect(target.callApi('fixture')).resolves.toMatchObject({
      output: 'fixture output',
      tokenUsage: { total: 5 },
    });
    expect(initialize).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('does not dispatch after cancellation during asynchronous body preparation', async () => {
    const target = provider();
    const body = await target.getOpenAiBody('fixture');
    const preparation = createDeferred<typeof body>();
    vi.spyOn(target, 'getOpenAiBody').mockReturnValueOnce(preparation.promise);
    const controller = new AbortController();
    const pending = target.callApi('fixture', undefined, { abortSignal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
      message: 'cancel preparation',
    });
    controller.abort(new Error('cancel preparation'));
    await rejected;
    preparation.resolve(body);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['OpenRouter', () => new OpenRouterProvider('fixture', { config: { apiKey: 'key' } })],
    [
      'Snowflake',
      () =>
        new SnowflakeCortexProvider('fixture', {
          config: { apiKey: 'key', apiBaseUrl: 'https://snowflake.fixture.test' },
        }),
    ],
  ])('aborts asynchronous body preparation in %s overrides', async (_name, createProvider) => {
    const target = createProvider();
    const body = await target.getOpenAiBody('fixture');
    const preparation = createDeferred<typeof body>();
    vi.spyOn(target, 'getOpenAiBody').mockReturnValueOnce(preparation.promise);
    const controller = new AbortController();
    const pending = target.callApi('fixture', undefined, { abortSignal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
      message: 'cancel override preparation',
    });
    controller.abort(new Error('cancel override preparation'));
    await rejected;
    preparation.resolve(body);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('aborts a pending fetch and preserves a custom cancellation reason', async () => {
    const started = mockPendingFetch(fetch);
    const controller = new AbortController();
    const pending = provider().callApi('fixture', undefined, { abortSignal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
      message: 'cancel fetch',
    });
    const transportSignal = await started;
    controller.abort(new Error('cancel fetch'));
    await rejected;
    expect(transportSignal.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('stops waiting for a tool callback and does not invoke the next callback', async () => {
    const firstStarted = createDeferred<void>();
    const firstResult = createDeferred<string>();
    const second = vi.fn().mockResolvedValue('second result');
    const target = new OpenAiChatCompletionProvider('fixture', {
      config: {
        apiKey: 'fixture-key',
        functionToolCallbacks: {
          first: async () => {
            firstStarted.resolve();
            return firstResult.promise;
          },
          second,
        },
      },
    });
    fetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                tool_calls: [
                  { id: '1', function: { name: 'first', arguments: '{}' } },
                  { id: '2', function: { name: 'second', arguments: '{}' } },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
    );
    const controller = new AbortController();
    const pending = target.callApi('fixture', undefined, { abortSignal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await firstStarted.promise;
    controller.abort();
    await rejected;
    expect(second).not.toHaveBeenCalled();
    firstResult.resolve('first result');
  });

  it.each([undefined, new Error('cancel body read'), 'cancel body read'])(
    'aborts while reading the response body without retrying the POST (%s)',
    async (reason) => {
      const reading = createDeferred<void>();
      fetch.mockImplementationOnce(async (_url, options) => {
        const pendingBody = new Response(
          new ReadableStream({
            start(stream) {
              options!.signal!.addEventListener(
                'abort',
                () => stream.error(options!.signal!.reason),
                { once: true },
              );
            },
          }),
          { status: 200 },
        );
        const readBody = pendingBody.text.bind(pendingBody);
        vi.spyOn(pendingBody, 'text').mockImplementation(() => {
          reading.resolve();
          return readBody();
        });
        return pendingBody;
      });
      const controller = new AbortController();
      const pending = provider().callApi('fixture', undefined, { abortSignal: controller.signal });
      const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      await reading.promise;
      controller.abort(reason);
      await rejected;
      expect(fetch).toHaveBeenCalledOnce();
      expect(logger.error).not.toHaveBeenCalled();
    },
  );

  it('rejects cancelled warm-cache callers and leaves the entry reusable', async () =>
    withCompletedCache(async () => {
      fetch.mockResolvedValueOnce(response());
      const target = provider();
      expect(await target.callApi('fixture')).toMatchObject({
        output: 'fixture output',
        cached: false,
      });
      const controller = new AbortController();
      controller.abort();
      await expect(
        target.callApi('fixture', undefined, { abortSignal: controller.signal }),
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(await target.callApi('fixture')).toMatchObject({
        output: 'fixture output',
        cached: true,
      });
      expect(fetch).toHaveBeenCalledOnce();
    }));

  it('rejects cancellation racing a completed cache lookup without evicting it', async () => {
    const backingCache = cache.getCache();
    await withCompletedCache(async () => {
      fetch.mockResolvedValueOnce(response());
      const target = provider();
      await target.callApi('fixture');
      const controller = new AbortController();
      const originalGet = backingCache.get.bind(backingCache);
      vi.spyOn(backingCache, 'get').mockImplementationOnce(async (key) => {
        const value = await originalGet(key);
        expect(value).toBeDefined();
        controller.abort(new Error('cancel cache lookup'));
        return value;
      });
      const rejected = target.callApi('fixture', undefined, { abortSignal: controller.signal });
      await expect(rejected).rejects.toMatchObject({
        name: 'AbortError',
        message: 'cancel cache lookup',
      });
      expect(await target.callApi('fixture')).toMatchObject({
        output: 'fixture output',
        cached: true,
      });
      expect(fetch).toHaveBeenCalledOnce();
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  it.each([true, false])(
    'isolates cancellation from another in-flight caller (signaled: %s)',
    async (signaled) =>
      withCompletedCache(async () => {
        const firstStarted = createDeferred<AbortSignal>();
        const secondStarted = createDeferred<AbortSignal>();
        const survivingResponse = createDeferred<Response>();
        fetch
          .mockImplementationOnce(
            (_url, options) =>
              new Promise((_resolve, reject) => {
                const signal = options!.signal!;
                signal.addEventListener('abort', () => reject(signal.reason), { once: true });
                firstStarted.resolve(signal);
              }),
          )
          .mockImplementationOnce((_url, options) => {
            secondStarted.resolve(options!.signal!);
            return survivingResponse.promise;
          });
        const target = provider();
        const cancelled = new AbortController();
        const survivor = new AbortController();
        const first = target.callApi('same fixture', undefined, { abortSignal: cancelled.signal });
        const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
        const firstSignal = await firstStarted.promise;
        const second = target.callApi(
          'same fixture',
          undefined,
          signaled ? { abortSignal: survivor.signal } : undefined,
        );
        const secondSignal = await secondStarted.promise;
        cancelled.abort();
        survivingResponse.resolve(response());
        await rejected;
        expect(await second).toMatchObject({ output: 'fixture output', cached: false });
        expect(firstSignal.aborted).toBe(true);
        expect(secondSignal.aborted).toBe(false);
        expect(await target.callApi('same fixture')).toMatchObject({
          output: 'fixture output',
          cached: true,
        });
        expect(fetch).toHaveBeenCalledTimes(2);
      }),
  );

  it.each(['network', 'retry-after'])('stops during %s retry backoff', async (kind) => {
    vi.useFakeTimers();
    if (kind === 'network') {
      fetch.mockRejectedValueOnce(new Error('temporary failure'));
    } else {
      fetch.mockResolvedValueOnce(
        new Response('{}', { status: 429, headers: { 'retry-after': '60' } }),
      );
    }
    const target = provider();
    target.config.maxRetries = 2;
    const controller = new AbortController();
    const pending = target.callApi('fixture', undefined, { abortSignal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledOnce();
    controller.abort();
    await rejected;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('retains the ordinary no-signal error response', async () => {
    fetch.mockRejectedValueOnce(new Error('fixture network failure'));
    const result = await provider().callApi('fixture');
    expect(result).toMatchObject({
      error: expect.stringContaining('fixture network failure'),
      metadata: { http: { status: 0, statusText: 'Error' } },
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalled();
  });

  it('preserves structured hard-quota errors without retrying', async () => {
    fetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 'insufficient_quota', message: 'fixture quota' } }),
        { status: 429, statusText: 'Too Many Requests' },
      ),
    );
    const target = provider();
    target.config.maxRetries = 3;
    expect(await target.callApi('fixture')).toMatchObject({
      error: expect.stringContaining('Quota exceeded:'),
      metadata: { rateLimitKind: 'quota', http: { status: 429 } },
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([undefined, new Error('cancel xAI fetch'), 'cancel xAI fetch'])(
    'propagates cancellation through the inherited xAI request (%s)',
    async (reason) => {
      const started = mockPendingFetch(fetch);
      const target = await loadApiProvider('xai:grok-4', {
        options: { config: { apiKey: 'xai-fixture-key', maxRetries: 0 } },
      });
      const controller = new AbortController();
      const pending = target.callApi('fixture', undefined, { abortSignal: controller.signal });
      const rejected = expect(pending).rejects.toMatchObject({
        name: 'AbortError',
        ...(reason instanceof Error ? { message: reason.message } : {}),
      });
      const signal = await started;
      controller.abort(reason);
      await rejected;
      if (reason === undefined) {
        await expect(pending).rejects.toBe(controller.signal.reason);
      }
      expect(signal.aborted).toBe(true);
      expect(fetch).toHaveBeenCalledOnce();
      expect(logger.error).not.toHaveBeenCalled();
    },
  );

  it.each(['openai:chat:gpt-4o', 'xai:grok-4'])(
    'preserves a custom timeout abort through the default registry for %s',
    async (id) => {
      vi.useFakeTimers();
      const registry = new RateLimitRegistry({ maxConcurrency: 1 });
      const target = await loadApiProvider(id, {
        options: { config: { apiKey: 'fixture-key' } },
      });
      const callApi = vi.spyOn(target, 'callApi');
      const wrapped = wrapProviderWithRateLimiting(target, registry);
      const controller = new AbortController();
      const reason = Object.assign(new Error('request timeout'), { name: 'AbortError' });
      controller.abort(reason);
      let caught: unknown;

      try {
        const pending = wrapped
          .callApi('fixture', undefined, { abortSignal: controller.signal })
          .catch((error) => {
            caught = error;
          });
        await vi.advanceTimersByTimeAsync(0);
        expect(caught).toBe(reason);
        await pending;
        expect(callApi).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
        expect(logger.error).not.toHaveBeenCalled();
      } finally {
        registry.dispose();
      }
    },
  );

  it('retains successful inherited xAI responses', async () => {
    fetch.mockResolvedValueOnce(response());
    const target = await loadApiProvider('xai:grok-4', {
      options: { config: { apiKey: 'xai-fixture-key', maxRetries: 0 } },
    });
    expect(await target.callApi('fixture')).toMatchObject({ output: 'fixture output' });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('cancels an inherited Envoy request while retaining its model, normalized URL and named key', async () => {
    mockProcessEnv({
      ENVOY_API_BASE_URL: 'https://gateway.fixture.test',
      CHAT_FIXTURE_KEY: 'named-fixture-key',
      OPENAI_API_KEY: 'unrelated-key',
    });
    const started = mockPendingFetch(fetch);
    const target = await loadApiProvider('envoy:team/served-model:revision-1', {
      options: { config: { apiKeyEnvar: 'CHAT_FIXTURE_KEY', maxRetries: 0 } },
    });
    const controller = new AbortController();
    const pending = target.callApi('fixture', undefined, { abortSignal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    const signal = await started;
    controller.abort();
    await rejected;
    const [url, options] = fetch.mock.calls[0];
    expect(String(url)).toBe('https://gateway.fixture.test/v1/chat/completions');
    expect(new Headers(options!.headers).get('authorization')).toBe('Bearer named-fixture-key');
    expect(JSON.parse(options!.body as string).model).toBe('team/served-model:revision-1');
    expect(signal.aborted).toBe(true);
    expect(target).toBeInstanceOf(OpenAiChatCompletionProvider);
  });
});
