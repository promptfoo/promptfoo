import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeferred, mockProcessEnv } from '../util/utils';

import type * as CacheModule from '../../src/cache';
import type * as ProvidersModule from '../../src/providers';
import type { ApiProvider } from '../../src/types';

const headers = { 'content-type': 'application/json', 'x-request-id': 'disk-publication-fixture' };
const usage = { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 };
const diagnostics = [
  {
    name: 'message refusal',
    message: { role: 'assistant', content: null, refusal: 'Cannot comply with this request' },
    finishReason: 'stop',
    output: 'Cannot comply with this request',
  },
  {
    name: 'content filter with output',
    message: { role: 'assistant', content: 'Blocked by the provider' },
    finishReason: 'content_filter',
    output: 'Blocked by the provider',
  },
  {
    name: 'content filter without output',
    message: { role: 'assistant', content: null },
    finishReason: 'content_filter',
    output: 'Content filtered by provider',
  },
];

describe('public Chat outcomes during default disk publication', () => {
  let cacheModule: typeof CacheModule;
  let loadApiProvider: typeof ProvidersModule.loadApiProvider;
  let restoreEnvironment: () => void;
  let cacheDirectory: string;
  let target: ApiProvider;
  let prompt: string;
  let callback: ReturnType<typeof vi.fn>;
  const publications: Promise<unknown>[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();

  beforeAll(async () => {
    vi.resetModules();
    cacheDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-chat-disk-publication-'));
    restoreEnvironment = mockProcessEnv({
      PROMPTFOO_CACHE_TYPE: 'disk',
      PROMPTFOO_CACHE_PATH: cacheDirectory,
      PROMPTFOO_CACHE_ENABLED: 'true',
      PROMPTFOO_RETRY_5XX: 'false',
    });
    cacheModule = await import('../../src/cache');
    ({ loadApiProvider } = await import('../../src/providers'));
    const { KeyvFile } = await import('keyv-file');
    const stores = cacheModule.getCache().stores;
    expect(stores).toHaveLength(1);
    expect(stores[0].store).toBeInstanceOf(KeyvFile);
    expect(stores[0].store.opts.filename).toBe(path.join(cacheDirectory, 'cache.json'));
    expect(stores[0].store.opts.writeDelay).toBe(100);
  });

  beforeEach(async () => {
    // This regression requires the shipped real timer and filesystem interval.
    vi.useRealTimers();
    prompt = `disk publication ${randomUUID()}`;
    callback = vi.fn().mockResolvedValue('Unexpected tool execution');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected fixture request'));
    // Billing applies explicit token-cost overrides only to recognized models.
    target = await loadApiProvider('openai:chat:gpt-4o-mini', {
      options: {
        config: {
          apiBaseUrl: 'https://disk-publication.fixture.test/v1',
          apiKey: 'fixture-key',
          maxRetries: 0,
          cost: 0.01,
          functionToolCallbacks: { unexpected: callback },
        },
      },
    });
  });

  afterEach(async () => {
    for (const timer of timers) {
      clearTimeout(timer);
    }
    timers.clear();
    // Observe real late writes before restoring spies or finishing this test.
    await Promise.allSettled(publications.splice(0));
    await target.cleanup?.();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await cacheModule.getCache().disconnect();
    restoreEnvironment();
    // The isolated task-owned disk cache is retained; no cache is cleared.
  });

  function observePublication() {
    const cache = cacheModule.getCache();
    const set = cache.set.bind(cache);
    const started = createDeferred<void>();
    const observation = {
      started: started.promise,
      settled: false,
      response: undefined as Record<string, unknown> | undefined,
      events: [] as string[],
    };
    vi.spyOn(cache, 'set').mockImplementationOnce((key, value, ttl) => {
      observation.response = JSON.parse(value as string);
      observation.events.push('completed response entering publication');
      // Delegate the original store operation unchanged: actual KeyvFile's
      // default 100 ms delay and filesystem write both remain in effect.
      const publication = set(key, value, ttl);
      publications.push(publication);
      void publication.then(
        () => {
          observation.settled = true;
          observation.events.push('publication settled');
        },
        () => {
          observation.settled = true;
          observation.events.push('publication rejected');
        },
      );
      started.resolve();
      return publication;
    });
    return observation;
  }

  function ordinaryTimer(run: () => void) {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        run();
        resolve();
      }, 10);
      timers.add(timer);
    });
  }

  describe.each(diagnostics)('$name', ({ message, finishReason, output }) => {
    it.each([false, true])(
      'retains the exact envelope with caller cancellation=%s',
      async (cancel) => {
        const payload = { choices: [{ message, finish_reason: finishReason }], usage };
        const response = new Response(JSON.stringify(payload), {
          status: 200,
          statusText: 'OK',
          headers,
        });
        vi.mocked(globalThis.fetch).mockResolvedValueOnce(response);
        const publication = observePublication();
        const controller = new AbortController();
        const reason = new DOMException('caller deadline during disk publication', 'AbortError');
        const outcome = target.callApi(prompt, undefined, { abortSignal: controller.signal }).then(
          (result) => ({ result }),
          (error: unknown) => ({ error }),
        );
        await publication.started;
        expect(publication.response).toMatchObject({
          data: payload,
          status: 200,
          statusText: 'OK',
          headers,
        });
        expect(response.bodyUsed).toBe(true);
        let pendingAtTimer = false;
        await ordinaryTimer(() => {
          pendingAtTimer = !publication.settled;
          publication.events.push('ordinary caller timer');
          if (cancel) {
            controller.abort(reason);
          }
        });
        expect(pendingAtTimer).toBe(true);
        const settled = await outcome;
        expect(settled).toEqual({
          result: {
            output,
            tokenUsage: { total: 5, prompt: 2, completion: 3, numRequests: 1 },
            cached: false,
            latencyMs: expect.any(Number),
            cost: 0.05,
            isRefusal: true,
            finishReason,
            guardrails: { flagged: true },
            metadata: { http: { status: 200, statusText: 'OK', headers } },
          },
        });
        expect(controller.signal.aborted).toBe(cancel);
        expect(callback).not.toHaveBeenCalled();
        expect(globalThis.fetch).toHaveBeenCalledOnce();
        await Promise.all(publications);
        expect(publication.events).toEqual([
          'completed response entering publication',
          'ordinary caller timer',
          'publication settled',
        ]);
        expect(fs.statSync(path.join(cacheDirectory, 'cache.json')).size).toBeGreaterThan(0);
      },
    );
  });

  it.each([
    { tool: false, reasonName: 'AbortError' },
    { tool: true, reasonName: 'AbortException' },
    { tool: true, reasonName: 'Error' },
  ])(
    'cancels ordinary 200 publication with tool=$tool and $reasonName',
    async ({ tool, reasonName }) => {
      const message = {
        role: 'assistant',
        content: tool ? null : 'ordinary output',
        ...(tool
          ? {
              tool_calls: [
                {
                  id: 'call-unexpected',
                  type: 'function',
                  function: { name: 'unexpected', arguments: '{}' },
                },
              ],
            }
          : {}),
      };
      const payload = {
        choices: [{ message, finish_reason: tool ? 'tool_calls' : 'stop' }],
        usage,
      };
      const response = new Response(JSON.stringify(payload), {
        status: 200,
        statusText: 'OK',
        headers,
      });
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(response);
      const publication = observePublication();
      const controller = new AbortController();
      const reason = Object.freeze(
        Object.assign(new Error('custom publication cancellation'), { name: reasonName }),
      );
      const outcome = target
        .callApi(prompt, undefined, { abortSignal: controller.signal })
        .catch((error: unknown) => error);
      await publication.started;
      expect(publication.response).toMatchObject({ data: payload, status: 200 });
      expect(response.bodyUsed).toBe(true);
      let pendingAtTimer = false;
      await ordinaryTimer(() => {
        pendingAtTimer = !publication.settled;
        controller.abort(reason);
      });
      const error = await outcome;
      expect(pendingAtTimer).toBe(true);
      expect(publication.settled).toBe(false);
      if (reasonName === 'Error') {
        expect(error).toMatchObject({ name: 'AbortError', message: reason.message, cause: reason });
      } else {
        expect(error).toBe(reason);
      }
      expect(reason.name).toBe(reasonName);
      expect(callback).not.toHaveBeenCalled();
      await Promise.all(publications);
      expect(callback).not.toHaveBeenCalled();
      expect(globalThis.fetch).toHaveBeenCalledOnce();
    },
  );

  it('rejects a pre-aborted caller before cache lookup or transport', async () => {
    const lookup = vi.spyOn(cacheModule.getCache(), 'get');
    const publication = vi.spyOn(cacheModule.getCache(), 'set');
    const controller = new AbortController();
    const reason = new DOMException('already cancelled', 'AbortError');
    controller.abort(reason);
    await expect(
      target.callApi(prompt, undefined, { abortSignal: controller.signal }),
    ).rejects.toBe(reason);
    expect(lookup).not.toHaveBeenCalled();
    expect(publication).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });

  it('cancels an incomplete native body without publishing or resubmitting', async () => {
    const reading = createDeferred<void>();
    const controller = new AbortController();
    const reason = new DOMException('caller stopped an incomplete body', 'AbortError');
    const publication = vi.spyOn(cacheModule.getCache(), 'set');
    vi.mocked(globalThis.fetch).mockImplementationOnce(
      async (_url, options) =>
        new Response(
          new ReadableStream(
            {
              start(stream) {
                options!.signal!.addEventListener('abort', () => stream.error(reason), {
                  once: true,
                });
              },
              pull() {
                reading.resolve();
              },
            },
            { highWaterMark: 0 },
          ),
          { status: 200, statusText: 'OK', headers },
        ),
    );
    const outcome = target.callApi(prompt, undefined, { abortSignal: controller.signal });
    const rejected = expect(outcome).rejects.toBe(reason);
    await reading.promise;
    await ordinaryTimer(() => controller.abort(reason));
    await rejected;
    expect(publication).not.toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    expect(callback).not.toHaveBeenCalled();
  });
});
