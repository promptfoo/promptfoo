import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache, getCache, withCacheEnabled, withCacheNamespace } from '../../src/cache';
import { matchesLlmRubric } from '../../src/matchers/llmGrading';
import { loadApiProvider } from '../../src/providers';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import {
  withProviderCallExecutionContext,
  withProviderCallTracingContext,
} from '../../src/scheduler/providerCallExecutionContext';
import { wrapProviderWithRateLimiting } from '../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { SlotQueue } from '../../src/scheduler/slotQueue';
import { fetchWithRetries } from '../../src/util/fetch/index';
import { createDeferred, mockProcessEnv } from '../util/utils';

import type { ProviderCallTracingContext } from '../../src/scheduler/providerCallExecutionContext';
import type { ApiProvider } from '../../src/types/providers';

type BackoffObservation = {
  headers: Record<string, string>;
  status: number;
  resetAt: number;
};
type HeaderObserver = (headers: Record<string, string>, backoff?: BackoffObservation) => void;
const createObserver = () => vi.fn<HeaderObserver>();
const selectedObservations = (observer: ReturnType<typeof createObserver>) =>
  observer.mock.calls.flatMap(([, backoff]) => (backoff ? [backoff] : []));
const headers = { 'content-type': 'application/json' };
const usage = { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 };
const grade = { pass: true, score: 1, reason: 'local grader accepted B' };
const traceparent = '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01';
const auxiliaryUrl = 'https://auxiliary-backoff.fixture.test/data';

function success(output: string) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { role: 'assistant', content: output }, finish_reason: 'stop' }],
      usage,
    }),
    { status: 200, statusText: 'OK', headers },
  );
}

function limited() {
  return new Response(
    JSON.stringify({ error: { code: 'rate_limit_exceeded', message: 'temporary quota' } }),
    {
      status: 429,
      statusText: 'Too Many Requests',
      headers: {
        ...headers,
        'retry-after': '2',
        'ratelimit-limit': '10',
        'ratelimit-remaining': '0',
      },
    },
  );
}

describe('selected Chat backoff belongs to each target request consumer', () => {
  let restoreEnvironment: () => void;
  let namespace: string;
  const providers: ApiProvider[] = [];
  const registries: RateLimitRegistry[] = [];
  const controllers: AbortController[] = [];
  const pending: Promise<unknown>[] = [];
  const releaseResponses: (() => void)[] = [];

  beforeEach(() => {
    restoreEnvironment = mockProcessEnv({
      OPENAI_API_KEY: 'fixture-key',
      PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: 'false',
      PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
      PROMPTFOO_RETRY_5XX: 'false',
    });
    namespace = randomUUID();
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date('2026-09-10T01:00:00.000Z'));
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected fixture request'));
  });

  afterEach(async () => {
    const drained = Promise.allSettled(pending.splice(0));
    for (const controller of controllers.splice(0)) {
      controller.abort();
    }
    for (const release of releaseResponses.splice(0)) {
      release();
    }
    await vi.advanceTimersByTimeAsync(0);
    await drained;
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

  function caller() {
    const controller = new AbortController();
    controllers.push(controller);
    return controller;
  }

  function createRegistry() {
    const registry = new RateLimitRegistry({ maxConcurrency: 1 });
    registries.push(registry);
    const learned = vi.fn();
    const retrying = vi.fn();
    registry.on('ratelimit:learned', learned);
    registry.on('request:retrying', retrying);
    return { registry, learned, retrying };
  }

  async function createTarget(config: Record<string, unknown> = {}) {
    const target = await loadApiProvider('openai:chat:gpt-4o-mini', {
      options: {
        config: {
          apiBaseUrl: 'https://backoff-ownership.fixture.test/v1',
          apiKey: 'fixture-key',
          maxRetries: 1,
          ...config,
        },
      },
    });
    providers.push(target);
    expect(target).toBeInstanceOf(OpenAiChatCompletionProvider);
    return target;
  }

  function cached<T>(run: () => Promise<T>) {
    return withCacheNamespace(namespace, () => withCacheEnabled(true, run));
  }

  function track<T>(promise: Promise<T>) {
    const state: { settled: boolean; value?: T; error?: unknown } = { settled: false };
    const done = promise.then(
      (value) => {
        state.settled = true;
        state.value = value;
      },
      (error: unknown) => {
        state.settled = true;
        state.error = error;
      },
    );
    pending.push(done);
    return { state, done };
  }

  function start(
    provider: ApiProvider,
    prompt: string,
    controller: AbortController,
    onResponseHeaders?: HeaderObserver,
  ) {
    return track(
      cached(() =>
        provider.callApi(prompt, undefined, {
          abortSignal: controller.signal,
          ...(onResponseHeaders ? { onResponseHeaders } : {}),
        }),
      ),
    );
  }

  function heldResponse() {
    const response = createDeferred<Response>();
    releaseResponses.push(() => response.resolve(success('cleanup')));
    return response;
  }

  function observeSelectedWaits() {
    const entered = createDeferred<{ at: number; waitMs: number }>();
    const waits: { at: number; waitMs: number }[] = [];
    const realSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, delay, ...args) => {
      const timer = realSetTimeout(callback, delay, ...args);
      // The actual lower wait adds 500 ms jitter to the 2-second quota delay.
      if (delay === 2500) {
        const wait = { at: Date.now(), waitMs: delay };
        waits.push(wait);
        entered.resolve(wait);
      }
      return timer;
    });
    return { entered: entered.promise, waits };
  }

  function observeReleases() {
    const events: { at: number; resetAt: number | null }[] = [];
    const realRelease = SlotQueue.prototype.release;
    vi.spyOn(SlotQueue.prototype, 'release').mockImplementation(function (this: SlotQueue) {
      events.push({ at: Date.now(), resetAt: this.getResetAt() });
      return realRelease.call(this);
    });
    return events;
  }

  it('attributes one shared absolute deadline to early and late same-signal consumers in separate registries', async () => {
    const target = await createTarget();
    const owners = Array.from({ length: 3 }, () => createRegistry());
    const wrapped = owners.map(({ registry }) => wrapProviderWithRateLimiting(target, registry));
    const observers = owners.map(() => createObserver());
    const shared = caller();
    const firstResponse = heldResponse();
    const selected = observeSelectedWaits();
    const releases = observeReleases();
    // Capture the real unscoped cache instance: fetchWithCache supplies scoped keys.
    const reads = vi.spyOn(getCache(), 'get');
    const dispatches: { prompt: string; at: number }[] = [];
    vi.mocked(globalThis.fetch).mockImplementation(async (_url, options) => {
      const prompt = JSON.parse(String(options?.body)).messages[0].content as string;
      dispatches.push({ prompt, at: Date.now() });
      return dispatches.length === 1 ? firstResponse.promise : success(prompt);
    });
    const first = start(wrapped[0], 'shared prompt', shared, observers[0]);
    const coalesced = start(wrapped[1], 'shared prompt', shared, observers[1]);
    await vi.advanceTimersByTimeAsync(0);
    expect(reads).toHaveBeenCalledTimes(2);
    expect(await reads.mock.results[0].value).toBeUndefined();
    expect(await reads.mock.results[1].value).toBeUndefined();
    expect(reads.mock.calls[0][0]).toBe(reads.mock.calls[1][0]);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    firstResponse.resolve(limited());
    const wait = await selected.entered;
    const resetAt = wait.at + 2000;
    await vi.advanceTimersByTimeAsync(500);

    const late = start(wrapped[2], 'shared prompt', shared, observers[2]);
    await vi.advanceTimersByTimeAsync(0);
    expect(reads).toHaveBeenCalledTimes(3);
    expect(await reads.mock.results[2].value).toBeUndefined();
    expect(reads.mock.calls[2][0]).toBe(reads.mock.calls[0][0]);
    await vi.advanceTimersByTimeAsync(0);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const observation = selectedObservations(observers[0])[0];
    expect(observation).toMatchObject({ status: 429, resetAt });
    for (const [index, observer] of observers.entries()) {
      expect(selectedObservations(observer)).toHaveLength(1);
      expect(selectedObservations(observer)[0]).toBe(observation);
      expect(observer.mock.calls[0][0]).toBe(observation.headers);
      expect(owners[index].learned).toHaveBeenCalledOnce();
    }
    const survivors = wrapped.map((provider, index) => start(provider, `B ${index}`, caller()));
    for (const { registry } of owners) {
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        activeRequests: 1,
        queueDepth: 1,
        totalRequests: 2,
      });
    }
    const reason = Object.freeze(
      Object.assign(new Error('stop shared callers'), { name: 'AbortError' }),
    );
    shared.abort(reason);
    await vi.advanceTimersByTimeAsync(0);
    for (const call of [first, coalesced, late]) {
      expect(call.state.settled).toBe(true);
      expect(call.state.error).toBe(reason);
    }
    expect(releases).toEqual(Array.from({ length: 3 }, () => ({ at: wait.at + 500, resetAt })));
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1499);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    await Promise.all(survivors.map(({ done }) => done));
    expect(dispatches).toEqual([
      { prompt: 'shared prompt', at: wait.at },
      ...owners.map((_, index) => ({ prompt: `B ${index}`, at: resetAt })),
    ]);
    for (const [index, owner] of owners.entries()) {
      expect(survivors[index].state.value).toMatchObject({ output: `B ${index}` });
      expect(owner.retrying).not.toHaveBeenCalled();
      expect(owner.learned).toHaveBeenCalledOnce();
      expect(selectedObservations(observers[index])).toHaveLength(1);
      expect(Object.values(owner.registry.getMetrics())[0]).toMatchObject({
        activeRequests: 0,
        queueDepth: 0,
        totalRequests: 2,
        completedRequests: 1,
        failedRequests: 1,
        retriedRequests: 0,
      });
    }
    expect(releases).toHaveLength(6);
    expect(selected.waits).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['signal', 'authorization'] as const)(
    'isolates selected quota for distinct %s ownership',
    async (isolation) => {
      const firstTarget = await createTarget();
      const secondTarget = await createTarget(
        isolation === 'authorization' ? { apiKey: 'other-fixture-key' } : {},
      );
      const owners = [createRegistry(), createRegistry()];
      const wrapped = [firstTarget, secondTarget].map((target, index) =>
        wrapProviderWithRateLimiting(target, owners[index].registry),
      );
      const firstController = caller();
      const secondController = isolation === 'signal' ? caller() : firstController;
      const observers = [createObserver(), createObserver()];
      const responses = [heldResponse(), heldResponse()];
      const selected = observeSelectedWaits();
      const releases = observeReleases();
      const reads = vi.spyOn(getCache(), 'get');
      vi.mocked(globalThis.fetch)
        .mockImplementationOnce(() => responses[0].promise)
        .mockImplementationOnce(() => responses[1].promise);
      const first = start(wrapped[0], 'same prompt', firstController, observers[0]);
      const second = start(wrapped[1], 'same prompt', secondController, observers[1]);
      await vi.advanceTimersByTimeAsync(0);
      expect(reads).toHaveBeenCalledTimes(2);
      expect(await reads.mock.results[0].value).toBeUndefined();
      expect(await reads.mock.results[1].value).toBeUndefined();
      if (isolation === 'signal') {
        expect(reads.mock.calls[0][0]).toBe(reads.mock.calls[1][0]);
      } else {
        expect(reads.mock.calls[0][0]).not.toBe(reads.mock.calls[1][0]);
      }
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      responses[0].resolve(limited());
      const wait = await selected.entered;
      const resetAt = wait.at + 2000;
      expect(selectedObservations(observers[0])).toHaveLength(1);
      expect(selectedObservations(observers[0])[0]).toMatchObject({ status: 429, resetAt });
      expect(selectedObservations(observers[1])).toHaveLength(0);
      expect(owners[0].learned).toHaveBeenCalledOnce();
      expect(owners[1].learned).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(500);
      responses[1].resolve(success('independent B'));
      await vi.advanceTimersByTimeAsync(0);
      await second.done;
      expect(second.state.value).toMatchObject({ output: 'independent B' });
      expect(secondController.signal.aborted).toBe(false);
      expect(first.state.settled).toBe(false);
      expect(releases).toEqual([{ at: wait.at + 500, resetAt: null }]);
      const reason = Object.freeze(
        Object.assign(new Error('stop A only after B completes'), { name: 'AbortError' }),
      );
      firstController.abort(reason);
      await vi.advanceTimersByTimeAsync(0);
      expect(first.state.error).toBe(reason);
      expect(releases[1]).toEqual({ at: wait.at + 500, resetAt });
      expect(second.state.value).toMatchObject({ output: 'independent B' });
      expect(selectedObservations(observers[1])).toHaveLength(0);
      for (const owner of owners) {
        expect(owner.retrying).not.toHaveBeenCalled();
        expect(Object.values(owner.registry.getMetrics())[0]).toMatchObject({
          activeRequests: 0,
          queueDepth: 0,
          totalRequests: 1,
          retriedRequests: 0,
        });
      }
      expect(releases).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(2000);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it.each(['fetchWithCache', 'fetchWithRetries'] as const)(
    'does not attribute auxiliary callback %s quota to the model',
    async (transport) => {
      const auxiliaryController = caller();
      let auxiliaryWork: Promise<string> | undefined;
      let auxiliaryValue: unknown;
      let callbackSettled = false;
      const callback = vi.fn(() => {
        const work = (async () => {
          if (transport === 'fetchWithCache') {
            const response = await cached(() =>
              fetchWithCache<{ value: string }>(
                auxiliaryUrl,
                { signal: auxiliaryController.signal },
                10000,
                'json',
              ),
            );
            auxiliaryValue = response.data;
          } else {
            const response = await fetchWithRetries(
              auxiliaryUrl,
              { signal: auxiliaryController.signal },
              10000,
              1,
            );
            auxiliaryValue = await response.json();
          }
          callbackSettled = true;
          return 'auxiliary finished';
        })();
        auxiliaryWork = work;
        pending.push(
          work.then(
            () => undefined,
            () => undefined,
          ),
        );
        return work;
      });
      const target = await createTarget({ functionToolCallbacks: { auxiliary: callback } });
      const owner = createRegistry();
      const wrapped = wrapProviderWithRateLimiting(target, owner.registry);
      const observed = createObserver();
      const selected = observeSelectedWaits();
      const releases = observeReleases();
      const dispatches: { kind: string; at: number }[] = [];
      let auxiliaryRequests = 0;
      let modelRequests = 0;
      vi.mocked(globalThis.fetch).mockImplementation(async (url) => {
        if (url === auxiliaryUrl) {
          auxiliaryRequests++;
          dispatches.push({ kind: 'auxiliary', at: Date.now() });
          return auxiliaryRequests === 1
            ? limited()
            : new Response(JSON.stringify({ value: 'auxiliary result' }), { status: 200, headers });
        }
        modelRequests++;
        dispatches.push({ kind: 'model', at: Date.now() });
        return modelRequests === 1
          ? new Response(
              JSON.stringify({
                choices: [
                  {
                    message: {
                      role: 'assistant',
                      content: null,
                      tool_calls: [
                        {
                          id: 'auxiliary-call',
                          type: 'function',
                          function: { name: 'auxiliary', arguments: '{}' },
                        },
                      ],
                    },
                    finish_reason: 'tool_calls',
                  },
                ],
                usage,
              }),
              { status: 200, headers },
            )
          : success('live model B');
      });
      const firstController = caller();
      const first = start(wrapped, 'A', firstController, observed);
      const wait = await selected.entered;
      expect(callback).toHaveBeenCalledOnce();
      expect(callbackSettled).toBe(false);
      expect(observed).toHaveBeenCalledOnce();
      expect(selectedObservations(observed)).toHaveLength(0);
      expect(owner.learned).not.toHaveBeenCalled();
      expect(dispatches).toEqual([
        { kind: 'model', at: wait.at },
        { kind: 'auxiliary', at: wait.at },
      ]);
      await vi.advanceTimersByTimeAsync(500);
      const secondController = caller();
      const second = start(wrapped, 'B', secondController);
      const reason = Object.freeze(
        Object.assign(new Error('stop model A while auxiliary waits'), { name: 'AbortError' }),
      );
      firstController.abort(reason);
      await vi.advanceTimersByTimeAsync(0);
      expect(first.state.error).toBe(reason);
      expect(second.state.value).toMatchObject({ output: 'live model B' });
      expect(secondController.signal.aborted).toBe(false);
      expect(auxiliaryController.signal.aborted).toBe(false);
      expect(callbackSettled).toBe(false);
      expect(releases).toEqual([
        { at: wait.at + 500, resetAt: null },
        { at: wait.at + 500, resetAt: null },
      ]);
      expect(dispatches).toEqual([
        { kind: 'model', at: wait.at },
        { kind: 'auxiliary', at: wait.at },
        { kind: 'model', at: wait.at + 500 },
      ]);
      const metrics = owner.registry.getMetrics();
      expect(Object.values(metrics)[0]).toMatchObject({
        activeRequests: 0,
        queueDepth: 0,
        totalRequests: 2,
        completedRequests: 1,
        failedRequests: 1,
        retriedRequests: 0,
      });
      await vi.advanceTimersByTimeAsync(wait.waitMs - 500);
      await auxiliaryWork;
      expect(auxiliaryValue).toEqual({ value: 'auxiliary result' });
      expect(callbackSettled).toBe(true);
      expect(auxiliaryRequests).toBe(2);
      expect(modelRequests).toBe(2);
      expect(dispatches.at(-1)).toEqual({ kind: 'auxiliary', at: wait.at + wait.waitMs });
      expect(owner.registry.getMetrics()).toEqual(metrics);
      expect(owner.learned).not.toHaveBeenCalled();
      expect(owner.retrying).not.toHaveBeenCalled();
      expect(observed).toHaveBeenCalledOnce();
      expect(selectedObservations(observed)).toHaveLength(0);
      expect(releases).toHaveLength(2);
      expect(selected.waits).toHaveLength(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each([
    { alreadyWrapped: false, traced: false },
    { alreadyWrapped: true, traced: true },
  ])(
    'preserves selected target quota through configured grading (wrapped=$alreadyWrapped, traced=$traced)',
    async ({ alreadyWrapped, traced }) => {
      const target = await createTarget();
      const callApi = vi.spyOn(target, 'callApi');
      const owner = createRegistry();
      const contextRegistry = alreadyWrapped ? createRegistry().registry : owner.registry;
      const provider = alreadyWrapped
        ? wrapProviderWithRateLimiting(target, owner.registry)
        : target;
      const providerSpan = vi.fn<ProviderCallTracingContext['withProviderSpan']>(
        async ({ callContext }, invoke) => invoke({ ...callContext!, traceparent }),
      );
      const runGrade = (output: string, controller: AbortController) =>
        track(
          withCacheEnabled(false, () =>
            withProviderCallExecutionContext(
              { abortSignal: controller.signal, rateLimitRegistry: contextRegistry },
              () => {
                const invoke = () =>
                  matchesLlmRubric('must pass', output, {
                    provider,
                    rubricPrompt: 'Grade {{output}}.',
                  });
                return traced
                  ? withProviderCallTracingContext(
                      {
                        getActiveTraceparent: () => traceparent,
                        withGraderSpan: async (_options, callback) => callback(),
                        withProviderSpan: providerSpan,
                      },
                      invoke,
                    )
                  : invoke();
              },
            ),
          ),
        );
      const selected = observeSelectedWaits();
      const releases = observeReleases();
      const dispatches: number[] = [];
      vi.mocked(globalThis.fetch).mockImplementation(async () => {
        dispatches.push(Date.now());
        return dispatches.length === 1 ? limited() : success(JSON.stringify(grade));
      });
      const firstController = caller();
      const first = runGrade('A', firstController);
      const wait = await selected.entered;
      const resetAt = wait.at + 2000;
      await vi.advanceTimersByTimeAsync(500);
      const secondController = caller();
      const second = runGrade('B', secondController);
      await vi.advanceTimersByTimeAsync(0);
      expect(Object.values(owner.registry.getMetrics())[0]).toMatchObject({
        activeRequests: 1,
        queueDepth: 1,
        totalRequests: 2,
      });
      const reason = Object.freeze(
        Object.assign(new Error('grading caller cancelled'), { name: 'AbortError' }),
      );
      firstController.abort(reason);
      await vi.advanceTimersByTimeAsync(0);
      expect(first.state.error).toBe(reason);
      expect(second.state.settled).toBe(false);
      expect(secondController.signal.aborted).toBe(false);
      expect(releases).toEqual([{ at: wait.at + 500, resetAt }]);
      expect(owner.learned).toHaveBeenCalledOnce();
      expect(callApi).toHaveBeenCalledOnce();
      expect(callApi.mock.calls[0]).toHaveLength(3);
      expect(callApi.mock.calls[0][2]).toMatchObject({
        abortSignal: firstController.signal,
        onResponseHeaders: expect.any(Function),
      });
      if (traced) {
        expect(callApi.mock.calls[0][1]).toMatchObject({ traceparent });
      }
      if (alreadyWrapped) {
        expect(contextRegistry.getMetrics()).toEqual({});
      }
      await vi.advanceTimersByTimeAsync(1499);
      expect(dispatches).toEqual([wait.at]);
      await vi.advanceTimersByTimeAsync(1);
      await second.done;
      expect(second.state.value).toMatchObject(grade);
      expect(second.state.error).toBeUndefined();
      expect(dispatches).toEqual([wait.at, resetAt]);
      expect(callApi).toHaveBeenCalledTimes(2);
      expect(callApi.mock.calls[1]).toHaveLength(3);
      expect(callApi.mock.calls[1][2]?.abortSignal).toBe(secondController.signal);
      expect(providerSpan).toHaveBeenCalledTimes(traced ? 2 : 0);
      expect(releases).toHaveLength(2);
      expect(owner.retrying).not.toHaveBeenCalled();
      expect(owner.learned).toHaveBeenCalledOnce();
      expect(Object.values(owner.registry.getMetrics())[0]).toMatchObject({
        activeRequests: 0,
        queueDepth: 0,
        totalRequests: 2,
        completedRequests: 1,
        failedRequests: 1,
        retriedRequests: 0,
      });
      if (alreadyWrapped) {
        expect(contextRegistry.getMetrics()).toEqual({});
      }
      await vi.advanceTimersByTimeAsync(500);
      expect(dispatches).toHaveLength(2);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
