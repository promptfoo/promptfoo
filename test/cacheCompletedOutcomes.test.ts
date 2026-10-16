import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache, getCache, withCacheEnabled, withCacheNamespace } from '../src/cache';
import { loadApiProvider } from '../src/providers';
import { clearAgentCache } from '../src/util/fetch/index';
import { createDeferred, mockProcessEnv } from './util/utils';

import type { ApiProvider } from '../src/types';

const headers = { 'content-type': 'application/json', 'x-request-id': 'completed-cache-fixture' };
const successPayload = {
  choices: [{ message: { role: 'assistant', content: 'fixture output' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
};
const failures = [
  {
    status: 503,
    statusText: 'Service Unavailable',
    payload: { error: { code: 'server_error', message: 'upstream unavailable' } },
  },
  {
    status: 400,
    statusText: 'Bad Request',
    payload: { error: { code: 'invalid_prompt', message: 'upstream rejected input' } },
  },
];

describe('enabled cache completed HTTP outcomes', () => {
  let restoreEnvironment: () => void;
  let target: ApiProvider;
  let namespace: string;

  beforeEach(async () => {
    restoreEnvironment = mockProcessEnv({ PROMPTFOO_RETRY_5XX: 'false' });
    namespace = randomUUID();
    target = await loadApiProvider('openai:chat:fixture-model', {
      options: {
        config: {
          apiBaseUrl: 'https://completed-cache.fixture.test/v1',
          apiKey: 'fixture-key',
          maxRetries: 0,
        },
      },
    });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected fixture request'));
  });

  afterEach(async () => {
    await target.cleanup?.();
    clearAgentCache();
    vi.restoreAllMocks();
    restoreEnvironment();
  });

  function withEnabledCache<T>(run: () => Promise<T>) {
    return withCacheNamespace(namespace, () => withCacheEnabled(true, run));
  }

  function callProvider(signal?: AbortSignal) {
    return withEnabledCache(() =>
      target.callApi(
        'fixture',
        { prompt: { raw: 'fixture', label: 'fixture' }, vars: {} },
        { abortSignal: signal },
      ),
    );
  }

  // Only the global transport fixture changes. Body reading, preparation,
  // enabled-cache miss handling and the public provider loader remain real.
  function completedResponse(
    payload: unknown,
    init: ResponseInit,
    boundary: 'body' | 'prepared',
    controller: AbortController,
    reason: Error,
    events: string[],
  ) {
    const response = new Response(JSON.stringify(payload), init);
    const read = response.text.bind(response);
    let bodyComplete = false;
    response.text = async () => {
      const text = await read();
      bodyComplete = true;
      events.push('body complete');
      if (boundary === 'body') {
        controller.abort(reason);
        events.push('caller aborted');
      }
      return text;
    };
    const entries = response.headers.entries.bind(response.headers);
    let scheduled = false;
    response.headers.entries = () => {
      const iterator = entries();
      if (bodyComplete && !scheduled) {
        scheduled = true;
        events.push('preparing completed response');
        if (boundary === 'prepared') {
          // prepareFetchResponse has no further await after reading headers.
          // It fulfills before this microtask, which runs before its awaiting
          // consumer resumes. No promise-count or timer assumptions are needed.
          queueMicrotask(() => {
            controller.abort(reason);
            events.push('caller aborted');
          });
        }
      }
      return iterator;
    };
    return response;
  }

  describe.each(['body', 'prepared'] as const)('abort at the %s boundary', (boundary) => {
    it.each(failures)(
      'preserves the completed $status response through the public loader',
      async (failure) => {
        const controller = new AbortController();
        const events: string[] = [];
        const response = completedResponse(
          failure.payload,
          { status: failure.status, statusText: failure.statusText, headers },
          boundary,
          controller,
          new Error('caller stopped after a completed diagnostic'),
          events,
        );
        vi.mocked(globalThis.fetch).mockResolvedValueOnce(response);

        const result = await callProvider(controller.signal);
        const message = `API error: ${failure.status} ${failure.statusText}\n${JSON.stringify(failure.payload)}`;
        expect(result).toEqual({
          ...(failure.status === 400
            ? {
                output: message,
                tokenUsage: undefined,
                cached: false,
                latencyMs: expect.any(Number),
                isRefusal: true,
                guardrails: { flagged: true, flaggedInput: true },
              }
            : { error: message }),
          metadata: { http: { status: failure.status, statusText: failure.statusText, headers } },
        });
        expect(events).toEqual(
          boundary === 'body'
            ? ['body complete', 'caller aborted', 'preparing completed response']
            : ['body complete', 'preparing completed response', 'caller aborted'],
        );
        expect(response.bodyUsed).toBe(true);
        expect(controller.signal.aborted).toBe(true);
        expect(globalThis.fetch).toHaveBeenCalledOnce();
      },
    );

    it.each(['AbortError', 'AbortException'])(
      'still cancels a completed success with the exact %s',
      async (name) => {
        const controller = new AbortController();
        const reason = Object.assign(new Error('caller stopped after success'), { name });
        const response = completedResponse(
          successPayload,
          { status: 200, headers },
          boundary,
          controller,
          reason,
          [],
        );
        vi.mocked(globalThis.fetch).mockResolvedValueOnce(response);

        await expect(callProvider(controller.signal)).rejects.toBe(reason);
        expect(response.bodyUsed).toBe(true);
        expect(globalThis.fetch).toHaveBeenCalledOnce();
      },
    );
  });

  describe.each(['memory store', 'ready miss'] as const)(
    'sequential requests with a %s',
    (lookup) => {
      it.each(failures)('dispatches again after a completed $status response', async (failure) => {
        if (lookup === 'ready miss') {
          // A storage lookup is allowed to return an already-fulfilled miss.
          // Keep real HTTP/body processing while exercising that fast boundary.
          vi.spyOn(getCache(), 'get').mockResolvedValue(undefined);
        }
        const firstPayload = { ...failure.payload, request: 1 };
        const secondPayload = { ...failure.payload, request: 2 };
        vi.mocked(globalThis.fetch)
          .mockResolvedValueOnce(
            new Response(JSON.stringify(firstPayload), {
              status: failure.status,
              statusText: failure.statusText,
              headers,
            }),
          )
          .mockResolvedValueOnce(
            new Response(JSON.stringify(secondPayload), {
              status: failure.status,
              statusText: failure.statusText,
              headers,
            }),
          );
        const request = () =>
          withEnabledCache(() =>
            fetchWithCache(
              'https://completed-cache.fixture.test/sequential',
              {},
              1000,
              'json',
              false,
              0,
            ),
          );

        const first = await request();
        const second = await request();

        expect(first).toMatchObject({ data: firstPayload, status: failure.status, cached: false });
        expect(second).toMatchObject({
          data: secondPayload,
          status: failure.status,
          cached: false,
        });
        expect(first.coalesced).toBeUndefined();
        expect(second.coalesced).toBeUndefined();
        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      });
    },
  );

  it('rejects a pre-aborted caller before lookup or transport', async () => {
    const lookup = vi.spyOn(getCache(), 'get');
    const controller = new AbortController();
    const reason = new DOMException('already stopped', 'AbortError');
    controller.abort(reason);

    await expect(callProvider(controller.signal)).rejects.toBe(reason);
    expect(lookup).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each([200, 400, 503])(
    'cancels a pending %s body without retrying or resubmitting',
    async (status) => {
      const reading = createDeferred<void>();
      const controller = new AbortController();
      const reason = new DOMException('body still incomplete', 'AbortError');
      vi.mocked(globalThis.fetch).mockImplementationOnce(async (_url, options) => {
        const response = new Response(
          new ReadableStream({
            start(stream) {
              options!.signal!.addEventListener('abort', () => stream.error(reason), {
                once: true,
              });
            },
          }),
          { status, headers },
        );
        const read = response.text.bind(response);
        response.text = () => {
          reading.resolve();
          return read();
        };
        return response;
      });
      const pending = callProvider(controller.signal);
      const rejected = expect(pending).rejects.toBe(reason);
      await reading.promise;
      controller.abort(reason);
      await rejected;
      expect(globalThis.fetch).toHaveBeenCalledOnce();
    },
  );

  it('cancels a pending transport without waiting for a future response', async () => {
    const started = createDeferred<void>();
    const controller = new AbortController();
    const reason = new DOMException('transport still pending', 'AbortError');
    vi.mocked(globalThis.fetch).mockImplementationOnce(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options!.signal!.addEventListener('abort', () => reject(reason), { once: true });
          started.resolve();
        }),
    );
    const pending = callProvider(controller.signal);
    const rejected = expect(pending).rejects.toBe(reason);
    await started.promise;
    controller.abort(reason);
    await rejected;
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it('cancels a pending cache lookup and observes its later rejection', async () => {
    const lookup = createDeferred<undefined>();
    const lookingUp = createDeferred<void>();
    vi.spyOn(getCache(), 'get').mockImplementationOnce(() => {
      lookingUp.resolve();
      return lookup.promise;
    });
    const controller = new AbortController();
    const reason = new DOMException('lookup still pending', 'AbortError');
    const pending = callProvider(controller.signal);
    const rejected = expect(pending).rejects.toBe(reason);
    try {
      await lookingUp.promise;
      controller.abort(reason);
      await rejected;
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      lookup.reject(new Error('late cache lookup failure'));
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  });

  it.each(['resolve', 'reject'] as const)(
    'cancels a pending publication and observes its later %s',
    async (settlement) => {
      const publication = createDeferred<string>();
      const publishing = createDeferred<void>();
      const cache = getCache();
      const set = cache.set.bind(cache);
      vi.spyOn(cache, 'set').mockImplementationOnce((key, value) => {
        publishing.resolve();
        return publication.promise.then(() => set(key, value));
      });
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(successPayload), { status: 200, headers }),
      );
      const controller = new AbortController();
      const reason = new DOMException('publication still pending', 'AbortError');
      const pending = callProvider(controller.signal);
      const rejected = expect(pending).rejects.toBe(reason);
      try {
        await publishing.promise;
        controller.abort(reason);
        await rejected;
        if (settlement === 'resolve') {
          publication.resolve('saved');
        } else {
          publication.reject(new Error('late cache publication failure'));
        }
        // Cross a turn so an unobserved late rejection fails Vitest explicitly.
        await new Promise<void>((resolve) => setImmediate(resolve));
        if (settlement === 'resolve') {
          await expect(callProvider()).resolves.toMatchObject({
            output: 'fixture output',
            cached: true,
          });
        }
        expect(globalThis.fetch).toHaveBeenCalledOnce();
      } finally {
        publication.resolve('cleanup');
      }
    },
  );

  it('preserves original and coalesced attribution for a completed failure', async () => {
    const started = createDeferred<void>();
    const transport = createDeferred<Response>();
    const controller = new AbortController();
    vi.mocked(globalThis.fetch).mockImplementationOnce(() => {
      started.resolve();
      return transport.promise;
    });
    const request = () =>
      withEnabledCache(() =>
        fetchWithCache(
          'https://completed-cache.fixture.test/coalesced',
          { signal: controller.signal },
          1000,
          'json',
          false,
          0,
        ),
      );
    const original = request();
    await started.promise;
    const coalesced = request();
    const outcomes = Promise.all([original, coalesced]);
    // Allow the second real cache miss to join the already-pending transport.
    await new Promise<void>((resolve) => setImmediate(resolve));
    transport.resolve(
      completedResponse(
        failures[0].payload,
        { status: 503, statusText: 'Service Unavailable', headers },
        'prepared',
        controller,
        new Error('completed shared failure'),
        [],
      ),
    );

    const [first, second] = await outcomes;
    expect(first).toMatchObject({
      data: failures[0].payload,
      status: 503,
      statusText: 'Service Unavailable',
      headers,
      cached: false,
    });
    expect(first.coalesced).toBeUndefined();
    expect(second).toMatchObject({
      data: failures[0].payload,
      status: 503,
      statusText: 'Service Unavailable',
      headers,
      cached: false,
      coalesced: true,
    });
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });
});
