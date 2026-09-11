import { randomUUID } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCache, withCacheEnabled, withCacheNamespace } from '../../src/cache';
import { VERSION } from '../../src/constants';
import { loadApiProvider } from '../../src/providers';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { OpenRouterProvider } from '../../src/providers/openrouter';
import { wrapProviderWithRateLimiting } from '../../src/scheduler/providerWrapper';
import { getRateLimitKey } from '../../src/scheduler/rateLimitKey';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { SlotQueue } from '../../src/scheduler/slotQueue';
import { createDeferred, mockProcessEnv } from '../util/utils';
import type { MockInstance } from 'vitest';

import type { ApiProvider, ProviderResponse } from '../../src/types/providers';

const prompt = 'coalesced completed error fixture';
const gateway = 'https://coalesced-error.fixture.test/v1';
const headers = {
  'content-type': 'application/json',
  'x-request-id': 'coalesced-error-fixture',
  'ratelimit-limit': '100',
  'ratelimit-remaining': '1',
};
const upstreamError = { message: 'completed upstream failure', code: 'provider_failure' };
const errorPayload = { error: upstreamError };
const usage = { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 };
const textChoice = {
  message: { role: 'assistant', content: 'ordinary output' },
  finish_reason: 'stop',
};
const toolChoice = {
  message: {
    role: 'assistant',
    content: null,
    tool_calls: [
      { id: 'call-fixture', type: 'function', function: { name: 'fixture', arguments: '{}' } },
    ],
  },
  finish_reason: 'tool_calls',
};

type Outcome =
  | { status: 'fulfilled'; value: ProviderResponse }
  | { status: 'rejected'; reason: unknown };
type Pair = Awaited<ReturnType<typeof loadPair>>;

function settled(promise: Promise<ProviderResponse>): Promise<Outcome> {
  return promise.then(
    (value) => ({ status: 'fulfilled', value }),
    (reason: unknown) => ({ status: 'rejected', reason }),
  );
}

async function loadPair() {
  const config = {
    apiBaseUrl: gateway,
    apiKey: 'fixture-key',
    max_tokens: 32,
    temperature: 0,
    maxRetries: 0,
  };
  const base = await loadApiProvider('openai:chat:gpt-4o-mini', { options: { config } });
  const router = await loadApiProvider('openrouter:gpt-4o-mini', { options: { config } });
  expect(base).toBeInstanceOf(OpenAiChatCompletionProvider);
  expect(router).toBeInstanceOf(OpenRouterProvider);
  const registry = new RateLimitRegistry({ maxConcurrency: 1, minConcurrency: 1 });
  // These spies preserve the original methods and their returned Promise identity.
  const baseCall = vi.spyOn(base, 'callApi');
  const routerCall = vi.spyOn(router, 'callApi');
  const baseBody = vi.spyOn(base as OpenAiChatCompletionProvider, 'getOpenAiBody');
  const routerBody = vi.spyOn(router as OpenRouterProvider, 'getOpenAiBody');
  return {
    base,
    router,
    registry,
    baseCall,
    routerCall,
    baseBody,
    routerBody,
    baseKey: getRateLimitKey(base),
    routerKey: getRateLimitKey(router),
    wrappedBase: wrapProviderWithRateLimiting(base, registry),
    wrappedRouter: wrapProviderWithRateLimiting(router, registry),
  };
}

describe('public OpenRouter and Chat coalesced completed outcomes', () => {
  const providers: ApiProvider[] = [];
  const registries: RateLimitRegistry[] = [];
  const controllers: AbortController[] = [];
  const pending: Promise<unknown>[] = [];
  const drain: (() => void)[] = [];
  let restoreEnvironment: () => void;
  let release: MockInstance<SlotQueue['release']>;

  beforeEach(() => {
    restoreEnvironment = mockProcessEnv({
      OPENAI_API_KEY: 'fixture-key',
      OPENAI_ORGANIZATION: undefined,
      PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: 'false',
      PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
      PROMPTFOO_RETRY_5XX: 'false',
    });
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected fixture request'));
    release = vi.spyOn(SlotQueue.prototype, 'release');
  });

  afterEach(async () => {
    for (const controller of controllers.splice(0)) {
      controller.abort();
    }
    for (const finish of drain.splice(0)) {
      finish();
    }
    await Promise.all(pending.splice(0));
    for (const registry of registries.splice(0)) {
      registry.dispose();
    }
    for (const provider of providers.splice(0)) {
      await provider.cleanup?.();
    }
    vi.restoreAllMocks();
    restoreEnvironment();
    vi.useRealTimers();
  });

  async function pair() {
    const loaded = await loadPair();
    providers.push(loaded.base, loaded.router);
    registries.push(loaded.registry);
    expect(loaded.baseKey).not.toBe(loaded.routerKey);
    return loaded;
  }

  async function runPair(
    loaded: Pair,
    payload: unknown,
    {
      abort = true,
      status = 200,
      separate = '',
      namespace = randomUUID(),
      pendingBody = false,
    } = {},
  ) {
    const controller = new AbortController();
    const routerController = separate === 'signal' ? new AbortController() : controller;
    controllers.push(controller, routerController);
    const reason = Object.assign(new Error('caller stopped on base quota warning'), {
      name: 'AbortError',
    });
    const warning = createDeferred<void>();
    const dispatched = createDeferred<void>();
    const deliver = createDeferred<void>();
    const events: string[] = [];
    const warningObservations: {
      key: string;
      bodyUsed: boolean;
      aborted: boolean;
      active: number[];
    }[] = [];
    const transports: Response[] = [];
    const wire: {
      url: string;
      method: string | undefined;
      headers: [string, string][];
      body: BodyInit | null | undefined;
    }[] = [];
    const retrying = vi.fn();
    const reads = vi.spyOn(getCache(), 'get');
    const writes = vi.spyOn(getCache(), 'set');
    drain.push(
      () => deliver.resolve(),
      () => warning.resolve(),
    );
    loaded.registry.on('request:retrying', retrying);
    loaded.registry.on('ratelimit:warning', (event: { rateLimitKey: string }) => {
      warningObservations.push({
        key: event.rateLimitKey,
        bodyUsed: transports.every((transport) => transport.bodyUsed),
        aborted: controller.signal.aborted,
        active: Object.values(loaded.registry.getMetrics()).map(
          (metrics) => metrics.activeRequests,
        ),
      });
      if (event.rateLimitKey === loaded.baseKey) {
        events.push('base warning');
        warning.resolve();
      }
    });
    // Only the real prepared warning resolves this Promise. The passive event
    // listener neither aborts nor replaces an internal response observer.
    const caller = (async () => {
      await warning.promise;
      if (abort && !pendingBody) {
        events.push('caller abort');
        controller.abort(reason);
      }
    })();
    pending.push(caller);
    vi.mocked(globalThis.fetch).mockImplementation(async (url, options) => {
      wire.push({
        url: String(url),
        method: options?.method,
        headers: [...new Headers(options?.headers)],
        body: options?.body,
      });
      dispatched.resolve();
      await deliver.promise;
      let body: string | ReadableStream<Uint8Array> = JSON.stringify(payload);
      if (pendingBody) {
        body = new ReadableStream<Uint8Array>({
          start(stream) {
            stream.enqueue(new TextEncoder().encode('{"error":'));
            const abortBody = () => stream.error(options!.signal!.reason);
            options!.signal!.addEventListener('abort', abortBody, { once: true });
            drain.push(() => options!.signal!.removeEventListener('abort', abortBody));
            if (options!.signal!.aborted) {
              abortBody();
            }
          },
        });
      }
      const transport = new Response(body, {
        status,
        statusText: status === 200 ? 'OK' : 'Service Unavailable',
        headers,
      });
      transports.push(transport);
      return transport;
    });
    const invoke = (provider: ApiProvider, signal: AbortSignal, scope: string) =>
      settled(
        withCacheNamespace(scope, () =>
          withCacheEnabled(true, () =>
            provider.callApi(prompt, undefined, { abortSignal: signal }),
          ),
        ),
      );
    const baseDone = invoke(loaded.wrappedBase, controller.signal, namespace);
    pending.push(baseDone);
    await dispatched.promise;
    const routerDone = invoke(
      loaded.wrappedRouter,
      routerController.signal,
      separate === 'namespace' ? randomUUID() : namespace,
    );
    pending.push(routerDone);
    // Only the external transport is held. A later task lets real memory-cache
    // lookup/preparation continuations drain and join the existing request.
    await setImmediate();
    expect(loaded.baseCall).toHaveBeenCalledOnce();
    expect(loaded.routerCall).toHaveBeenCalledOnce();
    expect(loaded.baseCall.mock.calls[0][2]?.abortSignal).toBe(controller.signal);
    expect(loaded.routerCall.mock.calls[0][2]?.abortSignal).toBe(routerController.signal);
    const rawBase = settled(loaded.baseCall.mock.results[0].value);
    const rawRouter = settled(loaded.routerCall.mock.results[0].value);
    pending.push(rawBase, rawRouter);
    const baseRequest = await loaded.baseBody.mock.results[0].value;
    const routerRequest = await loaded.routerBody.mock.results[0].value;
    expect(routerRequest.body).toEqual(baseRequest.body);
    expect(reads).toHaveBeenCalledTimes(2);
    expect(await reads.mock.results[0].value).toBeUndefined();
    expect(await reads.mock.results[1].value).toBeUndefined();
    if (separate === 'namespace') {
      expect(reads.mock.calls[1][0]).not.toEqual(reads.mock.calls[0][0]);
    } else {
      expect(reads.mock.calls[1][0]).toEqual(reads.mock.calls[0][0]);
    }
    expect(wire).toHaveLength(separate ? 2 : 1);
    expect(wire[0]).toEqual({
      url: `${gateway}/chat/completions`,
      method: 'POST',
      headers: [
        ['authorization', 'Bearer fixture-key'],
        ['content-type', 'application/json'],
        ['x-promptfoo-version', VERSION],
      ],
      body: JSON.stringify(baseRequest.body),
    });
    if (separate) {
      expect(wire[1]).toEqual(wire[0]);
    }
    expect(
      Object.values(loaded.registry.getMetrics()).map((metrics) => metrics.activeRequests),
    ).toEqual([1, 1]);
    deliver.resolve();
    if (pendingBody) {
      await setImmediate();
      expect(transports.every((transport) => transport.bodyUsed)).toBe(true);
      expect(warningObservations).toEqual([]);
      controller.abort(reason);
      warning.resolve();
    }
    const outcomes = await Promise.all([baseDone, routerDone, rawBase, rawRouter]);
    await caller;
    expect(wire).toHaveLength(separate ? 2 : 1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(separate ? 2 : 1);
    expect(release).toHaveBeenCalledTimes(2);
    expect(new Set(release.mock.contexts).size).toBe(2);
    expect(Object.keys(loaded.registry.getMetrics()).sort()).toEqual(
      [loaded.baseKey, loaded.routerKey].sort(),
    );
    for (const metrics of Object.values(loaded.registry.getMetrics())) {
      expect(metrics).toMatchObject({
        activeRequests: 0,
        queueDepth: 0,
        totalRequests: 1,
        retriedRequests: 0,
        rateLimitHits: 0,
      });
    }
    expect(retrying).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    if (!pendingBody) {
      const expectedKeys = status === 200 ? [loaded.baseKey, loaded.routerKey] : [loaded.baseKey];
      expect(warningObservations.map(({ key }) => key).sort()).toEqual(expectedKeys.sort());
      for (const observation of warningObservations) {
        expect(observation.bodyUsed).toBe(true);
      }
      const baseWarning = warningObservations.find(({ key }) => key === loaded.baseKey);
      expect(baseWarning).toMatchObject({ bodyUsed: true, aborted: false });
      if (!separate && status === 200) {
        expect(baseWarning?.active).toEqual([1, 1]);
      }
      expect(events).toEqual(abort ? ['base warning', 'caller abort'] : ['base warning']);
    }
    return { outcomes, reason, writes, wire, namespace };
  }

  function expectError(outcome: Outcome, payload: unknown, base = false) {
    expect.soft(outcome).toEqual({
      status: 'fulfilled',
      value: {
        error: `API error: ${upstreamError.message}, Code: ${upstreamError.code}\n\n${JSON.stringify(payload, null, 2)}`,
        ...(base ? { metadata: { http: { status: 200, statusText: 'OK', headers } } } : {}),
      },
    });
  }

  it.each([
    { name: 'absent choices', payload: errorPayload },
    { name: 'null choices', payload: { ...errorPayload, choices: null } },
    { name: 'empty choices', payload: { ...errorPayload, choices: [] } },
  ])('retains the coalesced completed error with $name after caller abort', async ({ payload }) => {
    const call = await runPair(await pair(), payload);
    expect(call.writes).not.toHaveBeenCalled();
    expectError(call.outcomes[0], payload, true);
    expectError(call.outcomes[2], payload, true);
    expectError(call.outcomes[1], payload);
    expectError(call.outcomes[3], payload);
  });

  it('preserves the ordinary diagnostic and refetches after noncacheable inflight cleanup', async () => {
    const loaded = await pair();
    const call = await runPair(loaded, errorPayload, { abort: false });
    expectError(call.outcomes[1], errorPayload);
    expectError(call.outcomes[3], errorPayload);
    const next = await withCacheNamespace(call.namespace, () =>
      withCacheEnabled(true, () => loaded.wrappedRouter.callApi(prompt)),
    );
    expectError({ status: 'fulfilled', value: next }, errorPayload);
    expect(call.wire).toHaveLength(2);
    expect(call.wire[1]).toEqual(call.wire[0]);
    expect(call.writes).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(3);
    expect(
      Object.values(loaded.registry.getMetrics()).every(
        (metrics) => metrics.activeRequests === 0 && metrics.queueDepth === 0,
      ),
    ).toBe(true);
  });

  it('retains completed non-2xx diagnostics through the same caller policy', async () => {
    const call = await runPair(await pair(), errorPayload, { status: 503 });
    expect(call.outcomes[1]).toEqual({
      status: 'fulfilled',
      value: { error: `API error: 503 Service Unavailable\n${JSON.stringify(errorPayload)}` },
    });
    expect(call.outcomes[3]).toEqual(call.outcomes[1]);
    expect(call.writes).not.toHaveBeenCalled();
  });

  it('keeps a pending shared body cancellation as the exact caller error', async () => {
    const call = await runPair(await pair(), errorPayload, { pendingBody: true });
    for (const outcome of call.outcomes) {
      expect(outcome).toEqual({ status: 'rejected', reason: call.reason });
    }
    expect(call.writes).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'ordinary text', payload: { choices: [textChoice], usage } },
    { name: 'ordinary tool', payload: { choices: [toolChoice], usage } },
    {
      name: 'incidental error with text',
      payload: { ...errorPayload, choices: [textChoice], usage },
    },
    {
      name: 'incidental error with tool',
      payload: { ...errorPayload, choices: [toolChoice], usage },
    },
    { name: 'code-only error', payload: { error: { code: 'provider_failure' } } },
    { name: 'non-string message', payload: { error: { message: 42 } } },
    { name: 'nonempty malformed choices', payload: { ...errorPayload, choices: [null] } },
    { name: 'non-array choices', payload: { ...errorPayload, choices: {} } },
  ])('does not exempt $name from cancellation', async ({ payload }) => {
    const call = await runPair(await pair(), payload);
    expect(call.outcomes[1]).toEqual({ status: 'rejected', reason: call.reason });
    expect(call.outcomes[3]).toEqual(call.outcomes[1]);
  });

  it.each(['signal', 'namespace'])('keeps different %s requests isolated', async (separate) => {
    const call = await runPair(await pair(), errorPayload, { separate, abort: false });
    expectError(call.outcomes[0], errorPayload, true);
    expectError(call.outcomes[1], errorPayload);
    expect(call.writes).not.toHaveBeenCalled();
  });
});
