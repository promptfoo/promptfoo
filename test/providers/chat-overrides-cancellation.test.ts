import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as cache from '../../src/cache';
import logger from '../../src/logger';
import { loadApiProvider } from '../../src/providers';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { OpenRouterProvider } from '../../src/providers/openrouter';
import { SnowflakeCortexProvider } from '../../src/providers/snowflake';
import { withFetchRetryContext } from '../../src/util/fetch/retryContext';
import { createDeferred, mockProcessEnv } from '../util/utils';

const payload = {
  choices: [{ message: { role: 'assistant', content: 'fixture output' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5, cost: 0.125, is_byok: true },
};
const response = () =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

describe.each([
  {
    id: 'openrouter:fixture/model',
    model: 'fixture/model',
    type: OpenRouterProvider,
    url: 'https://openrouter.ai/api/v1/chat/completions',
    key: 'openrouter-fixture-key',
  },
  {
    id: 'snowflake:fixture-model',
    model: 'fixture-model',
    type: SnowflakeCortexProvider,
    url: 'https://fixture-account.snowflakecomputing.com/api/v2/cortex/inference:complete',
    key: 'snowflake-fixture-key',
  },
])('$id request cancellation through the provider registry', ({ id, model, type, url, key }) => {
  let restoreEnvironment: () => void;
  let cacheWasEnabled: boolean;
  let target: OpenAiChatCompletionProvider;

  beforeEach(async () => {
    // Snowflake's registry factory obtains its account from the supported environment path.
    restoreEnvironment = mockProcessEnv({
      OPENROUTER_API_KEY: 'openrouter-fixture-key',
      SNOWFLAKE_ACCOUNT_IDENTIFIER: 'fixture-account',
      SNOWFLAKE_API_KEY: 'snowflake-fixture-key',
    });
    cacheWasEnabled = cache.isCacheEnabled();
    cache.disableCache();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected fixture request'));
    vi.spyOn(logger, 'error').mockImplementation(() => logger);
    target = (await loadApiProvider(id)) as OpenAiChatCompletionProvider;
    expect(target).toBeInstanceOf(type);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    restoreEnvironment();
    if (cacheWasEnabled) {
      cache.enableCache();
    }
  });

  it.each([undefined, new Error('caller cancelled'), 'caller cancelled'])(
    'rejects pre-aborted callers before body preparation or transport (%s)',
    async (reason) => {
      const prepare = vi.spyOn(target, 'getOpenAiBody');
      const controller = new AbortController();
      controller.abort(reason);
      await expect(
        target.callApi('fixture', undefined, { abortSignal: controller.signal }),
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(prepare).not.toHaveBeenCalled();
      expect(globalThis.fetch).not.toHaveBeenCalled();
    },
  );

  it('checks cancellation after asynchronous body preparation before dispatch', async () => {
    const body = await target.getOpenAiBody('fixture');
    const preparation = createDeferred<typeof body>();
    vi.spyOn(target, 'getOpenAiBody').mockReturnValueOnce(preparation.promise);
    const controller = new AbortController();
    const pending = target.callApi('fixture', undefined, { abortSignal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    preparation.resolve(body);
    await rejected;
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each([undefined, new Error('cancel fetch'), 'cancel fetch'])(
    'forwards cancellation to the actual request signal (%s)',
    async (reason) => {
      const started = createDeferred<AbortSignal>();
      vi.mocked(globalThis.fetch).mockImplementationOnce(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            const signal = options!.signal!;
            signal.addEventListener('abort', () => reject(signal.reason), { once: true });
            started.resolve(signal);
          }),
      );
      const controller = new AbortController();
      const pending = target.callApi('fixture', undefined, { abortSignal: controller.signal });
      const rejected = expect(pending).rejects.toMatchObject({
        name: 'AbortError',
        ...(reason === undefined ? {} : { cause: reason }),
      });
      const requestSignal = await started.promise;
      controller.abort(reason);
      await rejected;
      expect(requestSignal.aborted).toBe(true);
      const [requestUrl, options] = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(String(requestUrl)).toBe(url);
      expect(new Headers(options!.headers).get('authorization')).toBe(`Bearer ${key}`);
      expect(JSON.parse(options!.body as string).model).toBe(model);
      expect(globalThis.fetch).toHaveBeenCalledOnce();
      expect(logger.error).not.toHaveBeenCalled();
    },
  );

  it('rejects cancellation during body reading without resubmitting the POST', async () => {
    const reading = createDeferred<void>();
    vi.mocked(globalThis.fetch).mockImplementationOnce(async (_url, options) => {
      const body = new Response(
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
      const read = body.text.bind(body);
      vi.spyOn(body, 'text').mockImplementation(() => {
        reading.resolve();
        return read();
      });
      return body;
    });
    const controller = new AbortController();
    const pending = target.callApi('fixture', undefined, { abortSignal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await reading.promise;
    controller.abort();
    await rejected;
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it('checks the post-response boundary even if transport finishes successfully after abort', async () => {
    const controller = new AbortController();
    vi.spyOn(cache, 'fetchWithCache').mockImplementationOnce(async () => {
      controller.abort();
      return { data: payload, cached: false, status: 200, statusText: 'OK', headers: {} };
    });
    await expect(
      target.callApi('fixture', undefined, { abortSignal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('leaves a completed cache entry reusable after cancelling a cache hit', async () => {
    // fetchWithCache reads the backing store with an already-scoped key.
    // Capture that store before entering the namespace-aware getCache facade.
    const backing = cache.getCache();
    await cache.withCacheNamespace(randomUUID(), () =>
      cache.withCacheEnabled(true, async () => {
        vi.mocked(globalThis.fetch).mockResolvedValueOnce(response());
        await expect(target.callApi('fixture')).resolves.toMatchObject({ cached: false });
        const controller = new AbortController();
        const get = backing.get.bind(backing);
        const read = vi.spyOn(backing, 'get').mockImplementationOnce(async (cacheKey) => {
          const value = await get(cacheKey);
          expect(value).toBeDefined();
          controller.abort();
          return value;
        });
        await expect(
          target.callApi('fixture', undefined, { abortSignal: controller.signal }),
        ).rejects.toMatchObject({ name: 'AbortError' });
        expect(read).toHaveBeenCalledOnce();
        expect(controller.signal.aborted).toBe(true);
        await expect(target.callApi('fixture')).resolves.toMatchObject({
          cached: true,
          output: 'fixture output',
        });
        expect(globalThis.fetch).toHaveBeenCalledOnce();
      }),
    );
  });

  it.each(['network', 'retry-after'])('stops during %s backoff', async (kind) => {
    vi.useFakeTimers();
    if (kind === 'network') {
      vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('temporary failure'));
    } else {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response('{}', {
          status: 429,
          headers: { 'retry-after': '60' },
        }),
      );
    }
    const controller = new AbortController();
    const pending = target.callApi('fixture', undefined, { abortSignal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(0);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    controller.abort();
    await rejected;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it('preserves ordinary no-signal transport errors', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('fixture network failure'));
    await expect(withFetchRetryContext(0, () => target.callApi('fixture'))).resolves.toMatchObject({
      error: expect.stringContaining('fixture network failure'),
    });
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it.each(['AbortError', 'AbortException'])(
    'preserves ordinary error handling for a mocked noncaller %s',
    async (name) => {
      vi.spyOn(cache, 'fetchWithCache').mockRejectedValueOnce(
        Object.assign(new Error('fixture failure'), { name }),
      );
      await expect(target.callApi('fixture')).resolves.toEqual({
        error: `API call error: ${name}: fixture failure`,
      });
    },
  );

  it('keeps an unrelated plain error ordinary even after the caller aborts', async () => {
    const controller = new AbortController();
    vi.spyOn(cache, 'fetchWithCache').mockImplementationOnce(async () => {
      controller.abort(new Error('same message'));
      throw new Error('same message');
    });
    await expect(
      target.callApi('fixture', undefined, { abortSignal: controller.signal }),
    ).resolves.toEqual({ error: 'API call error: Error: same message' });
  });

  it('preserves successful output, request options, usage and provider billing', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(response());
    const result = await target.callApi('fixture', undefined, { includeLogProbs: true });
    expect(result).toMatchObject({
      output: 'fixture output',
      tokenUsage: { total: 5 },
      finishReason: 'stop',
      cached: false,
    });
    const [requestUrl, options] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(String(requestUrl)).toBe(url);
    expect(JSON.parse(options!.body as string)).toMatchObject({ model, logprobs: true });
    if (target instanceof OpenRouterProvider) {
      expect(result.cost).toBeUndefined();
      expect(result.metadata).toMatchObject({ openrouter: { accountCharge: 0.125, isByok: true } });
    }
  });
});
