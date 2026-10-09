import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeferred, mockProcessEnv } from '../util/utils';

import type * as CacheModule from '../../src/cache';
import type * as ProvidersModule from '../../src/providers';
import type { ApiProvider, ProviderResponse } from '../../src/types';

const headers = { 'content-type': 'application/json', 'x-request-id': 'publication-fixture' };
const usage = { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 };
const refusals = [
  {
    name: 'message refusal',
    choice: {
      message: { role: 'assistant', content: null, refusal: 'Synthetic refusal' },
      finish_reason: 'stop',
    },
    output: 'Synthetic refusal',
  },
  {
    name: 'content filter with output',
    choice: {
      message: { role: 'assistant', content: 'Synthetic filtered response' },
      finish_reason: 'content_filter',
    },
    output: 'Synthetic filtered response',
  },
  {
    name: 'content filter without output',
    choice: {
      message: { role: 'assistant', content: null },
      finish_reason: 'content_filter',
    },
    output: 'Content filtered by the model provider.',
  },
  {
    name: 'gateway choice refusal',
    choice: {
      message: { role: 'assistant', content: 'Synthetic partial response' },
      finish_reason: 'error',
      error: { message: 'Synthetic gateway refusal', metadata: { error_type: 'refusal' } },
    },
    output: 'Synthetic partial response',
  },
];

describe('OpenRouter completed refusals during disk publication', () => {
  let cacheModule: typeof CacheModule;
  let loadApiProvider: typeof ProvidersModule.loadApiProvider;
  let observers: typeof import('../../src/util/fetch/responseHeadersObserver');
  let restoreEnvironment: () => void;
  let provider: ApiProvider;
  const publications: Promise<unknown>[] = [];
  const releases: (() => void)[] = [];

  beforeAll(async () => {
    vi.resetModules();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'openrouter-disk-publication-'));
    restoreEnvironment = mockProcessEnv({
      PROMPTFOO_CACHE_TYPE: 'disk',
      PROMPTFOO_CACHE_PATH: directory,
      PROMPTFOO_CACHE_ENABLED: 'true',
      PROMPTFOO_RETRY_5XX: 'false',
    });
    cacheModule = await import('../../src/cache');
    ({ loadApiProvider } = await import('../../src/providers'));
    observers = await import('../../src/util/fetch/responseHeadersObserver');
    const { KeyvFile } = await import('keyv-file');
    expect(cacheModule.getCache().stores[0].store).toBeInstanceOf(KeyvFile);
  });

  beforeEach(async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected fixture request'));
    provider = await loadApiProvider('openrouter:gpt-4o-mini', {
      options: {
        config: {
          apiBaseUrl: 'https://publication.fixture.test/v1',
          apiKey: 'fixture-key',
          maxRetries: 0,
          cost: 0.01,
        },
      },
    });
  });

  afterEach(async () => {
    for (const release of releases.splice(0)) {
      release();
    }
    await Promise.allSettled(publications.splice(0));
    await provider.cleanup?.();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await cacheModule.getCache().disconnect();
    restoreEnvironment();
    // Keep the isolated task-owned cache; never clear a user's cache.
  });

  function holdPublication() {
    const cache = cacheModule.getCache();
    const set = cache.set.bind(cache);
    const started = createDeferred<void>();
    const release = createDeferred<void>();
    const observation = {
      started: started.promise,
      response: undefined as unknown,
      release: () => release.resolve(),
    };
    releases.push(() => release.resolve());
    vi.spyOn(cache, 'set').mockImplementationOnce((key, value, ttl) => {
      observation.response = JSON.parse(value as string);
      // Hold only store publication, then perform the real disk write. This
      // establishes the cancellation boundary without a timer race in CI.
      const publication = release.promise.then(() => set(key, value, ttl));
      publications.push(publication);
      started.resolve();
      return publication;
    });
    return observation;
  }

  describe.each(refusals)('$name', ({ choice, output }) => {
    it.each([false, true])(
      'retains the completed envelope with cancellation=%s',
      async (cancel) => {
        const payload = { choices: [choice], usage };
        const response = new Response(JSON.stringify(payload), { status: 200, headers });
        vi.mocked(globalThis.fetch).mockResolvedValueOnce(response);
        const publication = holdPublication();
        const prepared = createDeferred<void>();
        const controller = new AbortController();
        const outcome = provider
          .callApi(randomUUID(), undefined, {
            abortSignal: controller.signal,
            onResponseHeaders: () => prepared.resolve(),
          })
          .then(
            (result) => ({ result }),
            (error: unknown) => ({ error }),
          );
        await Promise.all([publication.started, prepared.promise]);
        expect(response.bodyUsed).toBe(true);
        expect(publication.response).toMatchObject({ data: payload, status: 200 });
        if (cancel) {
          controller.abort(
            new DOMException('caller cancelled after response completion', 'AbortError'),
          );
        } else {
          publication.release();
        }
        const settled = await outcome;
        expect(settled).toMatchObject({
          result: {
            output,
            cached: false,
            isRefusal: true,
            guardrails: { flagged: true },
            tokenUsage: { total: 5, prompt: 2, completion: 3, numRequests: 1 },
            cost: 0.05,
            raw: payload,
          },
        });
        expect(globalThis.fetch).toHaveBeenCalledOnce();
      },
    );
  });

  it('still cancels ordinary output while cache publication is pending', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            { message: { role: 'assistant', content: 'Ordinary output' }, finish_reason: 'stop' },
          ],
          usage,
        }),
        { status: 200, headers },
      ),
    );
    const publication = holdPublication();
    const prepared = createDeferred<void>();
    const controller = new AbortController();
    const outcome = provider.callApi(randomUUID(), undefined, {
      abortSignal: controller.signal,
      onResponseHeaders: () => prepared.resolve(),
    });
    const rejected = expect(outcome).rejects.toMatchObject({
      name: 'AbortError',
      message: 'cancel ordinary output',
    });
    await Promise.all([publication.started, prepared.promise]);
    controller.abort(new DOMException('cancel ordinary output', 'AbortError'));
    await rejected;
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it('preserves observer errors instead of replacing them with a completed refusal', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [refusals[0].choice], usage }), {
        status: 200,
        headers,
      }),
    );
    const publication = holdPublication();
    const controller = new AbortController();
    const reason = new DOMException('synthetic observer failure', 'AbortError');
    const observer = observers.composeResponseHeadersObservers(
      observers.createResponseHeadersObserver({}, () => true),
      () => {
        controller.abort(reason);
        throw reason;
      },
    );
    const result: ProviderResponse = await provider.callApi(randomUUID(), undefined, {
      abortSignal: controller.signal,
      onResponseHeaders: observer,
    });
    expect(result.error).toContain('synthetic observer failure');
    expect(result.isRefusal).toBeUndefined();
    expect(observers.isResponseHeadersObserverErrorResponse(result)).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    publication.release();
  });
});
