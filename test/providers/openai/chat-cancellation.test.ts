import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as cache from '../../../src/cache';
import { importModule } from '../../../src/esm';
import logger from '../../../src/logger';
import { loadApiProvider } from '../../../src/providers';
import { MCPClient } from '../../../src/providers/mcp/client';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';
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
    expect(fetch).not.toHaveBeenCalled();
    initialization.resolve();
    await target.cleanup();
  });

  it('releases its scheduler slot while shared MCP connection remains pending for another caller', async () => {
    const connection = createDeferred<void>();
    const connecting = createDeferred<void>();
    const connect = vi.spyOn(Client.prototype, 'connect').mockImplementation(() => {
      connecting.resolve();
      return connection.promise;
    });
    vi.spyOn(Client.prototype, 'listTools').mockResolvedValue({ tools: [] });
    const target = new OpenAiChatCompletionProvider('fixture', {
      config: {
        apiKey: 'fixture-key',
        mcp: { enabled: true, servers: [{ url: 'https://mcp.fixture.test' }] },
      },
    });
    const registry = new RateLimitRegistry({ maxConcurrency: 1 });
    const wrapped = wrapProviderWithRateLimiting(target, registry);
    const controller = new AbortController();
    const first = wrapped.callApi('cancelled', undefined, { abortSignal: controller.signal });
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await connecting.promise;
    const survivorSettled = vi.fn();
    const survivor = target.callApi('survivor').then((value) => {
      survivorSettled();
      return value;
    });

    try {
      controller.abort();
      await rejected;
      expect(Object.values(registry.getMetrics())).toEqual([
        expect.objectContaining({ activeRequests: 0 }),
      ]);
      expect(survivorSettled).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();

      fetch.mockResolvedValueOnce(response());
      connection.resolve();
      await expect(survivor).resolves.toMatchObject({ output: 'fixture output' });
      expect(connect).toHaveBeenCalledOnce();
      expect(fetch).toHaveBeenCalledOnce();
    } finally {
      connection.resolve();
      await survivor;
      await target.cleanup();
      registry.dispose();
    }
  });

  it('observes shared setup failure after cancelling a pending initialization wait', async () => {
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
    const failure = new Error('late initialization failure');
    initialization.reject(failure);
    await expect(target.callApi('fixture')).rejects.toBe(failure);
    expect(fetch).not.toHaveBeenCalled();
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

  it('stops waiting for configured body preparation before its JavaScript function settles', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'promptfoo-chat-remote-preparation-'));
    const file = path.join(directory, 'tools.mjs');
    await writeFile(
      file,
      `export const started = Promise.withResolvers();
export const held = Promise.withResolvers();
export let finished = false;
export async function get_tools() {
  started.resolve();
  try { return await held.promise; }
  finally { finished = true; }
}
`,
    );
    const fixture = await importModule(file);
    const target = await loadApiProvider('openai:chat:fixture', {
      options: {
        config: {
          apiBaseUrl: 'https://chat.fixture.test/v1',
          apiKey: 'fixture-key',
          maxRetries: 0,
          tools: `file://${file}:get_tools`,
        },
      },
    });
    expect(target).toBeInstanceOf(OpenAiChatCompletionProvider);
    const controller = new AbortController();
    const reason = new Error('cancel preparation');
    const pending = target.callApi('fixture', undefined, { abortSignal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
      message: reason.message,
      cause: reason,
    });
    try {
      await fixture.started.promise;
      controller.abort(reason);
      await rejected;
      expect(fixture.finished).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fixture.held.resolve([]);
      await pending.catch(() => undefined);
      await vi.waitFor(() => expect(fixture.finished).toBe(true));
      await target.cleanup?.();
      await rm(directory, { recursive: true, force: true });
    }
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
    try {
      await firstStarted.promise;
      controller.abort();
      await rejected;
      expect(second).not.toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledOnce();
    } finally {
      firstResult.resolve('first result');
      await pending.catch(() => undefined);
      await target.cleanup();
    }
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

  it.each(['AbortError', 'AbortException'])(
    'normalizes a mocked noncaller %s as an ordinary provider error',
    async (name) => {
      const error = Object.assign(new Error('fixture independent failure'), { name });
      vi.spyOn(cache, 'fetchWithCache').mockRejectedValueOnce(error);
      await expect(provider().callApi('fixture')).resolves.toMatchObject({
        error: `API call error: ${name}: fixture independent failure`,
        metadata: { http: { status: 0, statusText: 'Error' } },
      });
    },
  );

  it('does not relabel an unrelated error merely because the caller cancelled', async () => {
    const controller = new AbortController();
    vi.spyOn(cache, 'fetchWithCache').mockImplementationOnce(async () => {
      controller.abort();
      throw new Error('unrelated cache failure');
    });
    expect(
      await provider().callApi('fixture', undefined, { abortSignal: controller.signal }),
    ).toMatchObject({ error: expect.stringContaining('unrelated cache failure') });
  });

  it('does not relabel an unrelated body error with the same message as cancellation', async () => {
    const controller = new AbortController();
    const reason = new Error('body read failed');
    const unrelated = new Error(reason.message);
    const bodyResponse = response();
    vi.spyOn(bodyResponse, 'text').mockImplementation(async () => {
      controller.abort(reason);
      throw unrelated;
    });
    fetch.mockResolvedValueOnce(bodyResponse);
    expect(
      await provider().callApi('fixture', undefined, { abortSignal: controller.signal }),
    ).toMatchObject({
      error: expect.stringContaining('Error reading response body'),
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

  it('preserves xAI handling for an unrelated preparation error after cancellation', async () => {
    const target = (await loadApiProvider('xai:grok-4', {
      options: { config: { apiKey: 'xai-fixture-key', maxRetries: 0 } },
    })) as OpenAiChatCompletionProvider;
    const controller = new AbortController();
    const reason = new Error('xAI preparation failed');
    vi.spyOn(target, 'getOpenAiBody').mockImplementationOnce(async () => {
      controller.abort(reason);
      throw new Error(reason.message);
    });
    expect(await target.callApi('fixture', undefined, { abortSignal: controller.signal })).toEqual({
      error:
        'x.ai API error: xAI preparation failed\n\nIf this persists, verify your API key at https://x.ai/',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['AbortError', 'AbortException'])(
    'preserves xAI ordinary handling for a mocked noncaller %s',
    async (name) => {
      const target = (await loadApiProvider('xai:grok-4', {
        options: { config: { apiKey: 'fixture-key', maxRetries: 0 } },
      })) as OpenAiChatCompletionProvider;
      vi.spyOn(target, 'getOpenAiBody').mockRejectedValueOnce(
        Object.assign(new Error('fixture preparation failure'), { name }),
      );
      await expect(target.callApi('fixture')).resolves.toEqual({
        error:
          'x.ai API error: fixture preparation failure\n\nIf this persists, verify your API key at https://x.ai/',
      });
      expect(fetch).not.toHaveBeenCalled();
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
