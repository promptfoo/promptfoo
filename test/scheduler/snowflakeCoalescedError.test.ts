import { randomUUID } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache, getCache, withCacheEnabled, withCacheNamespace } from '../../src/cache';
import { VERSION } from '../../src/constants';
import { loadApiProvider } from '../../src/providers';
import { SnowflakeCortexProvider } from '../../src/providers/snowflake';
import { wrapProviderWithRateLimiting } from '../../src/scheduler/providerWrapper';
import { getRateLimitKey } from '../../src/scheduler/rateLimitKey';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { SlotQueue } from '../../src/scheduler/slotQueue';
import { createDeferred, mockProcessEnv } from '../util/utils';
import type { MockInstance } from 'vitest';

import type { FetchWithCacheResult } from '../../src/cache';
import type { ApiProvider, ProviderResponse } from '../../src/types/providers';

const prompt = 'coalesced completed Snowflake error fixture';
const gateway = 'https://snowflake-coalesced-error.fixture.test';
const model = 'claude-sonnet-4-6';
const requestBody = {
  model,
  messages: [{ role: 'user', content: prompt }],
  seed: 1,
  max_tokens: 32,
  temperature: 0,
  top_p: 1,
  presence_penalty: 0,
  frequency_penalty: 0,
};
const headers = {
  'content-type': 'application/json',
  'x-request-id': 'snowflake-coalesced-error-fixture',
};
const upstreamError = {
  message: 'completed upstream failure',
  type: 'fixture_error',
  code: 'E_FIXTURE',
};
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
const refusalChoice = {
  message: { role: 'assistant', content: null, refusal: 'fixture refusal' },
  finish_reason: 'stop',
};

type Outcome<T> = { status: 'fulfilled'; value: T } | { status: 'rejected'; reason: unknown };
type Loaded = Awaited<ReturnType<typeof loadSnowflake>>;
type Separation = '' | 'request' | 'signal' | 'namespace' | 'disabled cache';

function settled<T>(promise: Promise<T>): Promise<Outcome<T>> {
  return promise.then(
    (value) => ({ status: 'fulfilled', value }),
    (reason: unknown) => ({ status: 'rejected', reason }),
  );
}

async function loadSnowflake() {
  const provider = await loadApiProvider(`snowflake:${model}`, {
    options: {
      config: {
        apiBaseUrl: gateway,
        apiKey: 'fixture-key',
        seed: 1,
        max_tokens: 32,
        temperature: 0,
        top_p: 1,
        presence_penalty: 0,
        frequency_penalty: 0,
        maxRetries: 0,
      },
    },
  });
  expect(provider).toBeInstanceOf(SnowflakeCortexProvider);
  const registry = new RateLimitRegistry({ maxConcurrency: 1, minConcurrency: 1 });
  // Observation-only spies retain the real methods and returned Promise identity.
  const call = vi.spyOn(provider, 'callApi');
  const body = vi.spyOn(provider as SnowflakeCortexProvider, 'getOpenAiBody');
  return {
    provider,
    registry,
    call,
    body,
    key: getRateLimitKey(provider),
    wrapped: wrapProviderWithRateLimiting(provider, registry),
  };
}

describe('public Snowflake and cache companion completed outcomes', () => {
  const providers: ApiProvider[] = [];
  const registries: RateLimitRegistry[] = [];
  const controllers: AbortController[] = [];
  const pending: Promise<unknown>[] = [];
  const drain: (() => void)[] = [];
  let restoreEnvironment: () => void;
  let release: MockInstance<SlotQueue['release']>;

  beforeEach(() => {
    restoreEnvironment = mockProcessEnv({
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

  async function load() {
    const loaded = await loadSnowflake();
    providers.push(loaded.provider);
    registries.push(loaded.registry);
    return loaded;
  }

  async function runPair(
    loaded: Loaded,
    payload: unknown,
    {
      abort = true,
      status = 200,
      separate = '' as Separation,
      namespace = randomUUID(),
      pendingBody = false,
    } = {},
  ) {
    const controller = new AbortController();
    const providerController = separate === 'signal' ? new AbortController() : controller;
    controllers.push(controller, providerController);
    const reason = Object.assign(new Error('caller stopped after companion response preparation'), {
      name: 'AbortError',
    });
    const prepared = createDeferred<void>();
    const dispatched = createDeferred<void>();
    const deliver = createDeferred<void>();
    const events: string[] = [];
    const observations: {
      response: FetchWithCacheResult<unknown>;
      bodyUsed: boolean;
      aborted: boolean;
      activeRequests: number;
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
      () => prepared.resolve(),
    );
    loaded.registry.on('request:retrying', retrying);
    // The public observer only records completion and resolves this separate
    // application policy. It never aborts inside the cache implementation.
    const caller = (async () => {
      await prepared.promise;
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
    const scope = <T>(name: string, invoke: () => Promise<T>) =>
      withCacheNamespace(name, () => withCacheEnabled(separate !== 'disabled cache', invoke));
    const companionBody =
      separate === 'request'
        ? { ...requestBody, messages: [{ role: 'user', content: `${prompt} other request` }] }
        : requestBody;
    // The companion is an ordinary consumer of the exported cache API. Its
    // explicit request matches the provider's public configuration exactly.
    const companionDone = settled(
      scope(namespace, () =>
        fetchWithCache(
          `${gateway}/api/v2/cortex/inference:complete`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer fixture-key',
            },
            body: JSON.stringify(companionBody),
            signal: controller.signal,
          },
          undefined,
          'json',
          false,
          undefined,
          (response) => {
            observations.push({
              response,
              bodyUsed: transports.every((transport) => transport.bodyUsed),
              aborted: controller.signal.aborted,
              activeRequests: loaded.registry.getMetrics()[loaded.key].activeRequests,
            });
            events.push('companion prepared');
            prepared.resolve();
          },
        ),
      ),
    );
    pending.push(companionDone);
    await dispatched.promise;
    const providerDone = settled(
      scope(separate === 'namespace' ? randomUUID() : namespace, () =>
        loaded.wrapped.callApi(prompt, undefined, { abortSignal: providerController.signal }),
      ),
    );
    pending.push(providerDone);
    // Hold only the external transport. This later task lets the real provider
    // setup and memory-cache lookup join before delivering a native Response.
    await setImmediate();
    expect(loaded.call).toHaveBeenCalledOnce();
    expect(loaded.call.mock.calls[0][2]?.abortSignal).toBe(providerController.signal);
    const rawDone = settled<ProviderResponse>(loaded.call.mock.results[0].value);
    pending.push(rawDone);
    expect((await loaded.body.mock.results[0].value).body).toEqual(requestBody);
    if (separate === 'disabled cache') {
      expect(reads).not.toHaveBeenCalled();
    } else {
      expect(reads).toHaveBeenCalledTimes(2);
      expect(await reads.mock.results[0].value).toBeUndefined();
      expect(await reads.mock.results[1].value).toBeUndefined();
      if (separate === 'namespace' || separate === 'request') {
        expect(reads.mock.calls[1][0]).not.toEqual(reads.mock.calls[0][0]);
      } else {
        expect(reads.mock.calls[1][0]).toEqual(reads.mock.calls[0][0]);
      }
    }
    expect(wire).toHaveLength(separate ? 2 : 1);
    const providerRequest = {
      url: `${gateway}/api/v2/cortex/inference:complete`,
      method: 'POST',
      headers: [
        ['authorization', 'Bearer fixture-key'],
        ['content-type', 'application/json'],
        ['x-promptfoo-version', VERSION],
      ],
      body: JSON.stringify(requestBody),
    };
    expect(wire[0]).toEqual({ ...providerRequest, body: JSON.stringify(companionBody) });
    if (separate) {
      expect(wire[1]).toEqual(providerRequest);
    }
    expect(loaded.registry.getMetrics()[loaded.key].activeRequests).toBe(1);
    deliver.resolve();
    if (pendingBody) {
      await setImmediate();
      expect(transports.every((transport) => transport.bodyUsed)).toBe(true);
      expect(observations).toEqual([]);
      controller.abort(reason);
      prepared.resolve();
    }
    const [companion, wrapped, raw] = await Promise.all([companionDone, providerDone, rawDone]);
    await caller;
    expect(controller.signal.aborted).toBe(abort || pendingBody);
    expect(wire).toHaveLength(separate ? 2 : 1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(separate ? 2 : 1);
    expect(release).toHaveBeenCalledOnce();
    expect(Object.keys(loaded.registry.getMetrics())).toEqual([loaded.key]);
    expect(loaded.registry.getMetrics()[loaded.key]).toMatchObject({
      activeRequests: 0,
      queueDepth: 0,
      totalRequests: 1,
      retriedRequests: 0,
      rateLimitHits: 0,
    });
    expect(retrying).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    if (!pendingBody) {
      expect(observations).toEqual([
        {
          response: expect.objectContaining({ data: payload, cached: false, status, headers }),
          bodyUsed: true,
          aborted: false,
          activeRequests: 1,
        },
      ]);
      expect(observations[0].response.coalesced).toBeUndefined();
      expect(events).toEqual(
        abort ? ['companion prepared', 'caller abort'] : ['companion prepared'],
      );
    }
    return { companion, wrapped, raw, reason, writes, wire, namespace };
  }

  function expectError(outcome: Outcome<ProviderResponse>, payload: unknown) {
    expect.soft(outcome).toEqual({
      status: 'fulfilled',
      value: {
        error: `API error: ${upstreamError.message}, Type: ${upstreamError.type}, Code: ${upstreamError.code}\n\n${JSON.stringify(payload, null, 2)}`,
      },
    });
  }

  function expectCompanion(outcome: Outcome<FetchWithCacheResult<unknown>>, payload: unknown) {
    expect(outcome).toEqual({
      status: 'fulfilled',
      value: expect.objectContaining({ data: payload, cached: false, status: 200, headers }),
    });
  }

  it.each([
    { name: 'absent choices', payload: errorPayload },
    { name: 'null choices', payload: { ...errorPayload, choices: null } },
    { name: 'empty choices', payload: { ...errorPayload, choices: [] } },
  ])('retains the coalesced completed error with $name after caller abort', async ({ payload }) => {
    const call = await runPair(await load(), payload);
    expectCompanion(call.companion, payload);
    expect(call.writes).not.toHaveBeenCalled();
    expectError(call.raw, payload);
    expectError(call.wrapped, payload);
  });

  it.each([false, true])(
    'refetches the noncacheable completed error after abort=%s',
    async (abort) => {
      const loaded = await load();
      const call = await runPair(loaded, errorPayload, { abort });
      expectCompanion(call.companion, errorPayload);
      expectError(call.raw, errorPayload);
      expectError(call.wrapped, errorPayload);
      const next = await withCacheNamespace(call.namespace, () =>
        withCacheEnabled(true, () => loaded.wrapped.callApi(prompt)),
      );
      expectError({ status: 'fulfilled', value: next }, errorPayload);
      expect(call.wire).toHaveLength(2);
      expect(call.wire[1]).toEqual(call.wire[0]);
      expect(call.writes).not.toHaveBeenCalled();
      expect(release).toHaveBeenCalledTimes(2);
      expect(loaded.registry.getMetrics()[loaded.key]).toMatchObject({
        activeRequests: 0,
        queueDepth: 0,
        totalRequests: 2,
        retriedRequests: 0,
        rateLimitHits: 0,
      });
    },
  );

  it('retains completed non-2xx diagnostics through the same caller policy', async () => {
    const call = await runPair(await load(), errorPayload, { status: 503 });
    expect(call.companion).toEqual({
      status: 'fulfilled',
      value: expect.objectContaining({ data: errorPayload, cached: false, status: 503, headers }),
    });
    expect(call.raw).toEqual({
      status: 'fulfilled',
      value: { error: `API error: 503 Service Unavailable\n${JSON.stringify(errorPayload)}` },
    });
    expect(call.wrapped).toEqual(call.raw);
    expect(call.writes).not.toHaveBeenCalled();
  });

  it('keeps a pending shared body cancellation as the exact caller error', async () => {
    const call = await runPair(await load(), errorPayload, { pendingBody: true });
    for (const outcome of [call.companion, call.raw, call.wrapped]) {
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
    { name: 'refusal choice', payload: { choices: [refusalChoice], usage } },
    {
      name: 'incidental error with refusal',
      payload: { ...errorPayload, choices: [refusalChoice] },
    },
    { name: 'code-only error', payload: { error: { code: 'E_FIXTURE' } } },
    { name: 'non-string message', payload: { error: { message: 42 } } },
    { name: 'nonempty malformed choices', payload: { ...errorPayload, choices: [null] } },
    { name: 'non-array choices', payload: { ...errorPayload, choices: {} } },
  ])('does not exempt $name from cancellation', async ({ payload }) => {
    const call = await runPair(await load(), payload);
    expect(call.raw).toEqual({ status: 'rejected', reason: call.reason });
    expect(call.wrapped).toEqual(call.raw);
  });

  it.each<Separation>(['request', 'signal', 'namespace', 'disabled cache'])(
    'does not coalesce with a different %s boundary',
    async (separate) => {
      // Independent requests cannot inherit the shared completion/abort proof.
      // Disable the caller policy and verify their distinct transport identity.
      const call = await runPair(await load(), errorPayload, { separate, abort: false });
      expectCompanion(call.companion, errorPayload);
      expectError(call.raw, errorPayload);
      expectError(call.wrapped, errorPayload);
      expect(call.writes).not.toHaveBeenCalled();
    },
  );
});
