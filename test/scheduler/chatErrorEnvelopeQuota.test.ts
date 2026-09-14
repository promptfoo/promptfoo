import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCache, withCacheEnabled, withCacheNamespace } from '../../src/cache';
import { loadApiProvider } from '../../src/providers';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { wrapProviderWithRateLimiting } from '../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { SlotQueue } from '../../src/scheduler/slotQueue';
import { createDeferred, mockProcessEnv } from '../util/utils';
import type { MockInstance } from 'vitest';

import type { OpenAiCompletionOptions } from '../../src/providers/openai/types';
import type { ApiProvider, ProviderResponse } from '../../src/types/providers';

const quotaHeaders = {
  'content-type': 'application/json',
  'x-request-id': 'completed-error-envelope',
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

function response(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    statusText: 'OK',
    headers: quotaHeaders,
  });
}

type CallOutcome =
  | { status: 'fulfilled'; value: ProviderResponse }
  | { status: 'rejected'; reason: unknown };
type Target = Awaited<ReturnType<typeof createTarget>>;

// The loader, wrapper, registry, cache and body parser are all real. Only the
// external fetch boundary is mocked; no completed cache result is synthesized.
async function createTarget(config: OpenAiCompletionOptions = {}) {
  const provider = await loadApiProvider('openai:chat:gpt-4o-mini', {
    options: {
      config: {
        apiBaseUrl: 'https://error-envelope.fixture.test/v1',
        apiKey: 'fixture-key',
        maxRetries: 0,
        ...config,
      },
    },
  });
  expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
  const registry = new RateLimitRegistry({ maxConcurrency: 1, minConcurrency: 1 });
  return { provider, registry, wrapped: wrapProviderWithRateLimiting(provider, registry) };
}

describe('loaded Chat error envelopes at the prepared quota warning', () => {
  const providers: ApiProvider[] = [];
  const registries: RateLimitRegistry[] = [];
  const controllers: AbortController[] = [];
  const pending: Promise<unknown>[] = [];
  const releaseWaiters: (() => void)[] = [];
  const removeListeners: (() => void)[] = [];
  let restoreEnvironment: () => void;
  let release: MockInstance<SlotQueue['release']>;
  let updateQuota: MockInstance<SlotQueue['updateRateLimitState']>;

  beforeEach(() => {
    restoreEnvironment = mockProcessEnv({
      OPENAI_API_KEY: 'fixture-key',
      PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: 'false',
      PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
      PROMPTFOO_RETRY_5XX: 'false',
    });
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date('2026-09-10T04:00:00.000Z'));
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected fixture request'));
    release = vi.spyOn(SlotQueue.prototype, 'release');
    updateQuota = vi.spyOn(SlotQueue.prototype, 'updateRateLimitState');
  });

  afterEach(async () => {
    // Drain even when the expected pre-fix diagnostic assertion fails.
    for (const controller of controllers.splice(0)) {
      controller.abort();
    }
    for (const releaseWaiter of releaseWaiters.splice(0)) {
      releaseWaiter();
    }
    await vi.advanceTimersByTimeAsync(0);
    await Promise.all(pending.splice(0));
    for (const removeListener of removeListeners.splice(0)) {
      removeListener();
    }
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

  async function target(config: OpenAiCompletionOptions = {}) {
    const loaded = await createTarget(config);
    providers.push(loaded.provider);
    registries.push(loaded.registry);
    return loaded;
  }

  function start(
    loaded: Target,
    transport: Response,
    {
      abort = true,
      cache = false,
      bust = false,
      namespace = randomUUID(),
    }: { abort?: boolean; cache?: boolean; bust?: boolean; namespace?: string } = {},
  ) {
    const controller = new AbortController();
    controllers.push(controller);
    const reason = Object.freeze(
      Object.assign(new Error('caller stopped on low quota'), { name: 'AbortError' }),
    );
    const warning = createDeferred<void>();
    releaseWaiters.push(() => warning.resolve());
    const events: string[] = [];
    const observations: { requestRatio?: number; aborted: boolean; bodyUsed: boolean }[] = [];
    const warned = vi.fn();
    const retrying = vi.fn();
    const onWarning = (event: { requestRatio?: number }) => {
      events.push('warning');
      observations.push({
        requestRatio: event.requestRatio,
        aborted: controller.signal.aborted,
        bodyUsed: transport.bodyUsed,
      });
      warning.resolve();
    };
    loaded.registry.once('ratelimit:warning', onWarning);
    loaded.registry.on('ratelimit:warning', warned);
    loaded.registry.on('request:retrying', retrying);
    const detach = () => {
      loaded.registry.off('ratelimit:warning', onWarning);
      loaded.registry.off('ratelimit:warning', warned);
      loaded.registry.off('request:retrying', retrying);
    };
    removeListeners.push(detach);

    // This continuation is registered before the call. The event listener only
    // resolves its Promise; the separate caller decides to stop on low quota.
    const caller = (async () => {
      await warning.promise;
      if (abort) {
        events.push('caller aborted');
        controller.abort(reason);
      }
    })();
    pending.push(caller);
    vi.mocked(globalThis.fetch).mockImplementationOnce(async () => {
      events.push('dispatch');
      return transport;
    });
    let abortedAtSettlement: boolean | undefined;
    const prompt = 'error-envelope fixture';
    const done: Promise<CallOutcome> = withCacheNamespace(namespace, () =>
      withCacheEnabled(cache, () =>
        loaded.wrapped.callApi(
          prompt,
          bust
            ? { bustCache: true, prompt: { raw: prompt, label: 'fixture' }, vars: {} }
            : undefined,
          { abortSignal: controller.signal },
        ),
      ),
    ).then(
      (value) => {
        abortedAtSettlement = controller.signal.aborted;
        events.push('settled');
        detach();
        return { status: 'fulfilled', value };
      },
      (error: unknown) => {
        abortedAtSettlement = controller.signal.aborted;
        events.push('settled');
        detach();
        return { status: 'rejected', reason: error };
      },
    );
    pending.push(done);
    return {
      done,
      reason,
      controller,
      events,
      observations,
      warned,
      retrying,
      abortedAtSettlement: () => abortedAtSettlement,
    };
  }

  function expectWarning(call: ReturnType<typeof start>, abort = true) {
    expect(call.events).toEqual(
      abort
        ? ['dispatch', 'warning', 'caller aborted', 'settled']
        : ['dispatch', 'warning', 'settled'],
    );
    expect(call.observations).toEqual([{ requestRatio: 0.01, aborted: false, bodyUsed: true }]);
    expect(call.warned).toHaveBeenCalledOnce();
    expect(call.retrying).not.toHaveBeenCalled();
    expect(call.abortedAtSettlement()).toBe(abort);
  }

  function expectIdle(loaded: Target, calls = 1) {
    expect(globalThis.fetch).toHaveBeenCalledTimes(calls);
    expect(release).toHaveBeenCalledTimes(calls);
    expect(updateQuota).toHaveBeenCalledTimes(calls);
    expect(Object.values(loaded.registry.getMetrics())).toEqual([
      expect.objectContaining({
        activeRequests: 0,
        queueDepth: 0,
        totalRequests: calls,
        retriedRequests: 0,
        rateLimitHits: 0,
      }),
    ]);
    expect(vi.getTimerCount()).toBe(0);
  }

  function expectDiagnostic(
    outcome: CallOutcome,
    payload: { error: { message: string; code?: string; type?: string } },
  ) {
    // This is the genuine pre-fix failure: the completed envelope is replaced by
    // a cancellation rejection, despite the body having reached the real event.
    expect(outcome.status, 'completed error envelope must survive caller cancellation').toBe(
      'fulfilled',
    );
    if (outcome.status !== 'fulfilled') {
      return;
    }
    let heading = `API error: ${payload.error.message}`;
    if (payload.error.type) {
      heading += `, Type: ${payload.error.type}`;
    }
    if (payload.error.code) {
      heading += `, Code: ${payload.error.code}`;
    }
    expect(outcome.value).toEqual({
      error: `${heading}\n\n${JSON.stringify(payload, null, 2)}`,
      metadata: { http: { status: 200, statusText: 'OK', headers: quotaHeaders } },
    });
  }

  function expectCancellation(outcome: CallOutcome, reason: Error) {
    expect(outcome.status).toBe('rejected');
    if (outcome.status === 'rejected') {
      expect(outcome.reason).toBe(reason);
    }
  }

  it('retains the completed error-only diagnostic after a separate quota-warning caller abort', async () => {
    const loaded = await target();
    const call = start(loaded, response(errorPayload));
    const outcome = await call.done;
    expectWarning(call);
    expectDiagnostic(outcome, errorPayload);
    expectIdle(loaded);
    expect(Object.values(loaded.registry.getMetrics())[0]).toMatchObject({ failedRequests: 1 });
  });

  it.each([
    {
      name: 'no choices and extra upstream detail',
      payload: { ...errorPayload, detail: 'retained' },
    },
    { name: 'null choices', payload: { ...errorPayload, choices: null } },
    { name: 'empty choices', payload: { ...errorPayload, choices: [] } },
    {
      name: 'empty message with a code',
      payload: { error: { message: '', code: 'provider_failure' } },
    },
    {
      name: 'message without a code',
      payload: { error: { message: 'completed upstream failure' } },
    },
    {
      name: 'message with type and code',
      payload: { error: { ...upstreamError, type: 'upstream' } },
    },
  ])('formats $name identically with and without abort', async ({ payload }) => {
    const loaded = await target();
    for (const abort of [false, true]) {
      const call = start(loaded, response(payload), { abort });
      const outcome = await call.done;
      expectWarning(call, abort);
      expectDiagnostic(outcome, payload);
    }
    expectIdle(loaded, 2);
  });

  it.each([
    { name: 'ordinary success', payload: { choices: [textChoice], usage } },
    {
      name: 'text choice with incidental error',
      payload: { choices: [textChoice], error: upstreamError, usage },
    },
    { name: 'null error', payload: { choices: [textChoice], error: null, usage } },
    { name: 'false error', payload: { choices: [textChoice], error: false, usage } },
    { name: 'zero error', payload: { choices: [textChoice], error: 0, usage } },
    { name: 'empty-string error', payload: { choices: [textChoice], error: '', usage } },
  ])('preserves choice behavior for $name', async ({ payload }) => {
    const loaded = await target();
    const ordinary = start(loaded, response(payload), { abort: false });
    await expect(ordinary.done).resolves.toMatchObject({
      status: 'fulfilled',
      value: { output: 'ordinary output', guardrails: { flagged: false } },
    });
    expectWarning(ordinary, false);
    const cancelled = start(loaded, response(payload));
    expectCancellation(await cancelled.done, cancelled.reason);
    expectWarning(cancelled);
    expectIdle(loaded, 2);
  });

  it('preserves tool choices and stops cancelled tool work despite an incidental error', async () => {
    const callback = vi.fn().mockResolvedValue('tool output');
    const loaded = await target({ functionToolCallbacks: { fixture: callback } });
    const payload = { choices: [toolChoice], error: upstreamError, usage };
    const cancelled = start(loaded, response(payload));
    expectCancellation(await cancelled.done, cancelled.reason);
    expect(callback).not.toHaveBeenCalled();
    expectWarning(cancelled);
    const ordinary = start(loaded, response(payload), { abort: false });
    await expect(ordinary.done).resolves.toMatchObject({
      status: 'fulfilled',
      value: { output: 'tool output' },
    });
    expect(callback).toHaveBeenCalledOnce();
    expectWarning(ordinary, false);
    expectIdle(loaded, 2);
  });

  it.each([
    {
      name: 'refusal',
      message: { role: 'assistant', content: null, refusal: 'cannot comply' },
      finish: 'stop',
      output: 'cannot comply',
    },
    {
      name: 'content filter',
      message: { role: 'assistant', content: null },
      finish: 'content_filter',
      output: 'Content filtered by provider',
    },
  ])(
    'retains $name ahead of an incidental error and abort',
    async ({ message, finish, output }) => {
      const loaded = await target();
      const call = start(
        loaded,
        response({
          choices: [{ message, finish_reason: finish }],
          error: upstreamError,
          usage,
        }),
      );
      const outcome = await call.done;
      expect(outcome).toMatchObject({
        status: 'fulfilled',
        value: {
          output,
          isRefusal: true,
          guardrails: { flagged: true },
          metadata: { http: { status: 200, statusText: 'OK', headers: quotaHeaders } },
        },
      });
      if (outcome.status === 'fulfilled') {
        expect(outcome.value).not.toHaveProperty('error');
      }
      expectWarning(call);
      expectIdle(loaded);
    },
  );

  it.each([
    { name: 'code-only error', payload: { error: { code: 'provider_failure' } } },
    { name: 'empty error object', payload: { error: {} } },
    { name: 'array error', payload: { error: [] } },
    { name: 'non-string message', payload: { error: { message: 42, code: 'provider_failure' } } },
    { name: 'string error', payload: { error: 'upstream failure' } },
    { name: 'nonempty invalid choices', payload: { ...errorPayload, choices: [null] } },
    { name: 'non-array choices', payload: { ...errorPayload, choices: {} } },
  ])('does not exempt $name from cancellation', async ({ payload }) => {
    const loaded = await target();
    const call = start(loaded, response(payload));
    expectCancellation(await call.done, call.reason);
    expectWarning(call);
    expectIdle(loaded);
  });

  it.each([false, true])(
    'preserves noncacheable errors and refetches the same key (bust=%s)',
    async (bust) => {
      const loaded = await target();
      const namespace = randomUUID();
      const writes = vi.spyOn(getCache(), 'set');
      const cancelled = start(loaded, response(errorPayload), { cache: true, bust, namespace });
      const cancelledOutcome = await cancelled.done;
      expectWarning(cancelled);
      expectDiagnostic(cancelledOutcome, errorPayload);
      expect(writes).not.toHaveBeenCalled();

      // The same key must perform another real fetch, not replay the error or quota.
      const ordinary = start(loaded, response(errorPayload), {
        abort: false,
        cache: true,
        namespace,
      });
      const ordinaryOutcome = await ordinary.done;
      expectWarning(ordinary, false);
      expectDiagnostic(ordinaryOutcome, errorPayload);
      expect(writes).not.toHaveBeenCalled();
      expectIdle(loaded, 2);
    },
  );

  it('does not publish a prepared warning or diagnostic while the response body is pending', async () => {
    const loaded = await target();
    const controller = new AbortController();
    controllers.push(controller);
    const reason = Object.freeze(
      Object.assign(new Error('caller stopped pending body'), { name: 'AbortError' }),
    );
    const dispatched = createDeferred<void>();
    let streamController: ReadableStreamDefaultController<Uint8Array>;
    let streamOpen = true;
    const stream = new ReadableStream<Uint8Array>({
      start(current) {
        streamController = current;
        current.enqueue(new TextEncoder().encode('{"error":'));
      },
    });
    const transport = new Response(stream, {
      status: 200,
      statusText: 'OK',
      headers: quotaHeaders,
    });
    vi.mocked(globalThis.fetch).mockImplementationOnce(async (_url, options) => {
      const signal = options!.signal!;
      const abortBody = () => {
        if (streamOpen) {
          streamOpen = false;
          streamController.error(signal.reason);
        }
      };
      signal.addEventListener('abort', abortBody, { once: true });
      removeListeners.push(() => signal.removeEventListener('abort', abortBody));
      if (signal.aborted) {
        abortBody();
      }
      dispatched.resolve();
      return transport;
    });
    const warned = vi.fn();
    const retrying = vi.fn();
    loaded.registry.on('ratelimit:warning', warned);
    loaded.registry.on('request:retrying', retrying);
    let settled = false;
    const done: Promise<CallOutcome> = withCacheEnabled(false, () =>
      loaded.wrapped.callApi('pending body fixture', undefined, { abortSignal: controller.signal }),
    ).then(
      (value) => {
        settled = true;
        return { status: 'fulfilled', value };
      },
      (error: unknown) => {
        settled = true;
        return { status: 'rejected', reason: error };
      },
    );
    pending.push(done);
    await dispatched.promise;
    await vi.advanceTimersByTimeAsync(0);
    expect(transport.bodyUsed).toBe(true);
    expect(settled).toBe(false);
    expect(warned).not.toHaveBeenCalled();
    expect(updateQuota).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();

    controller.abort(reason);
    expectCancellation(await done, reason);
    expect(warned).not.toHaveBeenCalled();
    expect(updateQuota).not.toHaveBeenCalled();
    expect(retrying).not.toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
    expect(Object.values(loaded.registry.getMetrics())[0]).toMatchObject({
      activeRequests: 0,
      queueDepth: 0,
    });
    expect(vi.getTimerCount()).toBe(0);
  });
});
