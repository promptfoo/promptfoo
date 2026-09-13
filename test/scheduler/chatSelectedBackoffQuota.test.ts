import { getEventListeners } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCacheEnabled } from '../../src/cache';
import { loadApiProvider } from '../../src/providers';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { wrapProviderWithRateLimiting } from '../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { SlotQueue } from '../../src/scheduler/slotQueue';
import { createDeferred, mockProcessEnv } from '../util/utils';

import type { ApiProvider, ProviderResponse } from '../../src/types/providers';

const variants = ['429 Retry-After', '200 exhausted requests'] as const;
const headers = { 'content-type': 'application/json' };
const usage = { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 };
const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

function success(caller: string) {
  return new Response(
    JSON.stringify({
      choices: [
        { message: { role: 'assistant', content: `${caller} output` }, finish_reason: 'stop' },
      ],
      usage,
    }),
    { status: 200, statusText: 'OK', headers },
  );
}

function limited(variant: (typeof variants)[number], code = 'rate_limit_exceeded') {
  if (variant === '429 Retry-After') {
    return new Response(JSON.stringify({ error: { code, message: 'fixture quota diagnostic' } }), {
      status: 429,
      statusText: 'Too Many Requests',
      headers: { ...headers, 'retry-after': '2' },
    });
  }
  return new Response(
    JSON.stringify({
      choices: [
        { message: { role: 'assistant', content: 'soft limited output' }, finish_reason: 'stop' },
      ],
      usage,
    }),
    {
      status: 200,
      statusText: 'OK',
      headers: {
        ...headers,
        'x-ratelimit-remaining-requests': '0',
        'x-ratelimit-reset-requests': '2s',
      },
    },
  );
}

describe('loaded Chat selected fetch backoff and same-key quota', () => {
  const providers: ApiProvider[] = [];
  const registries: RateLimitRegistry[] = [];
  const controllers: AbortController[] = [];
  const pending: Promise<void>[] = [];
  const releaseWork: (() => void)[] = [];
  let restoreEnvironment: () => void;

  function caller() {
    const controller = new AbortController();
    controllers.push(controller);
    return controller;
  }

  async function createTarget(config: Record<string, unknown> = {}, maxConcurrency = 1) {
    const target = await loadApiProvider('openai:chat:gpt-4o-mini', {
      options: {
        config: {
          apiBaseUrl: 'https://selected-backoff.fixture.test/v1',
          apiKey: 'fixture-key',
          maxRetries: 1,
          ...config,
        },
      },
    });
    providers.push(target);
    expect(target).toBeInstanceOf(OpenAiChatCompletionProvider);
    const registry = new RateLimitRegistry({ maxConcurrency });
    registries.push(registry);
    return { target, registry, wrapped: wrapProviderWithRateLimiting(target, registry) };
  }

  function start(target: ApiProvider, prompt: string, controller: AbortController) {
    const state: { settled: boolean; value?: ProviderResponse; error?: unknown } = {
      settled: false,
    };
    const done = withCacheEnabled(false, () =>
      target.callApi(prompt, undefined, {
        abortSignal: controller.signal,
      }),
    ).then(
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

  function observeSelectedWait(expectedWaitMs = 2500) {
    const entered = createDeferred<{ at: number; waitMs: number }>();
    const waits: { at: number; waitMs: number }[] = [];
    const realSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, delay, ...args) => {
      const timer = realSetTimeout(callback, delay, ...args);
      // The real lower wait includes deterministic 500 ms jitter.
      // Request/queue timeouts use different durations. Return the real timer.
      if (delay === expectedWaitMs) {
        const wait = { at: Date.now(), waitMs: delay };
        waits.push(wait);
        entered.resolve(wait);
      }
      return timer;
    });
    return { entered: entered.promise, waits };
  }

  function staticTransport(first: Response) {
    const dispatches: { caller: string; at: number }[] = [];
    vi.mocked(globalThis.fetch).mockImplementation(async (_url, options) => {
      const caller = JSON.parse(String(options?.body)).messages[0].content as string;
      dispatches.push({ caller, at: Date.now() });
      return dispatches.length === 1 ? first : success(caller);
    });
    return dispatches;
  }

  beforeEach(() => {
    restoreEnvironment = mockProcessEnv({
      OPENAI_API_KEY: 'fixture-key',
      PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: 'false',
      PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
      PROMPTFOO_RETRY_5XX: 'false',
    });
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date('2026-09-10T00:00:00.000Z'));
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected fixture request'));
  });

  afterEach(async () => {
    for (const controller of controllers.splice(0)) {
      controller.abort();
    }
    for (const release of releaseWork.splice(0)) {
      release();
    }
    await vi.advanceTimersByTimeAsync(0);
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

  it.each(variants)(
    'keeps B queued until the known reset after A cancels its selected %s wait',
    async (variant) => {
      const { registry, wrapped } = await createTarget();
      const firstController = caller();
      const secondController = caller();
      const reason = Object.freeze(
        Object.assign(new Error('stop only A'), {
          name: 'AbortError',
          cause: Object.freeze(new Error('original caller cause')),
        }),
      );
      const originalReasonKeys = Reflect.ownKeys(reason);
      const selected = observeSelectedWait();
      const dispatches = staticTransport(limited(variant));
      const releases: { at: number; resetAt: number | null }[] = [];
      const realRelease = SlotQueue.prototype.release;
      vi.spyOn(SlotQueue.prototype, 'release').mockImplementation(function (this: SlotQueue) {
        releases.push({ at: Date.now(), resetAt: this.getResetAt() });
        return realRelease.call(this);
      });
      const retrying = vi.fn();
      registry.on('request:retrying', retrying);
      const first = start(wrapped, 'A', firstController);
      const wait = await selected.entered;
      const quotaResetAt = wait.at + 2000;
      expect(wait.waitMs).toBe(2500);
      await vi.advanceTimersByTimeAsync(500);
      const second = start(wrapped, 'B', secondController);
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        activeRequests: 1,
        queueDepth: 1,
        totalRequests: 2,
      });

      firstController.abort(reason);
      await vi.advanceTimersByTimeAsync(0);
      // Capture and assert before any cleanup or advancement to the reset.
      expect(first.state).toMatchObject({ settled: true, error: reason });
      expect(first.state.error).toBe(reason);
      expect(secondController.signal.aborted).toBe(false);
      expect(dispatches).toEqual([{ caller: 'A', at: wait.at }]);
      expect(second.state.settled).toBe(false);
      expect(releases).toEqual([{ at: wait.at + 500, resetAt: quotaResetAt }]);
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        activeRequests: 0,
        queueDepth: 1,
        failedRequests: 1,
        retriedRequests: 0,
      });
      expect(getEventListeners(firstController.signal, 'abort')).toHaveLength(0);
      expect(Reflect.ownKeys(reason)).toEqual(originalReasonKeys);

      await vi.advanceTimersByTimeAsync(quotaResetAt - Date.now() - 1);
      expect(dispatches).toHaveLength(1);
      expect(second.state.settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await second.done;
      expect(second.state.value).toMatchObject({ output: 'B output' });
      expect(second.state.error).toBeUndefined();
      expect(dispatches).toEqual([
        { caller: 'A', at: wait.at },
        { caller: 'B', at: quotaResetAt },
      ]);
      expect(releases).toHaveLength(2);
      expect(retrying).not.toHaveBeenCalled();
      expect(selected.waits).toHaveLength(1);
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        activeRequests: 0,
        queueDepth: 0,
        completedRequests: 1,
        failedRequests: 1,
        retriedRequests: 0,
      });
      // Passing the cancelled lower timer's jitter deadline cannot retry A.
      await vi.advanceTimersByTimeAsync(1000);
      expect(dispatches).toHaveLength(2);
      expect(releases).toHaveLength(2);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(variants)(
    'keeps one live lower retry for %s within its positive retry budget',
    async (variant) => {
      const { registry, wrapped } = await createTarget();
      const selected = observeSelectedWait();
      const dispatches = staticTransport(limited(variant));
      const release = vi.spyOn(SlotQueue.prototype, 'release');
      const first = start(wrapped, 'A', caller());
      const wait = await selected.entered;
      await vi.advanceTimersByTimeAsync(500);
      const second = start(wrapped, 'B', caller());
      await vi.advanceTimersByTimeAsync(wait.waitMs - 501);
      expect(dispatches).toEqual([{ caller: 'A', at: wait.at }]);
      expect(release).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await Promise.all([first.done, second.done]);
      expect(first.state.value).toMatchObject({ output: 'A output' });
      expect(second.state.value).toMatchObject({ output: 'B output' });
      expect(dispatches).toEqual([
        { caller: 'A', at: wait.at },
        { caller: 'A', at: wait.at + wait.waitMs },
        { caller: 'B', at: wait.at + wait.waitMs },
      ]);
      expect(selected.waits).toHaveLength(1);
      expect(release).toHaveBeenCalledTimes(2);
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        activeRequests: 0,
        queueDepth: 0,
        totalRequests: 2,
        completedRequests: 2,
        failedRequests: 0,
        retriedRequests: 0,
      });
    },
  );

  it.each(variants)(
    'does not select a lower backoff or retry with maxRetries zero (%s)',
    async (variant) => {
      const { wrapped } = await createTarget({ maxRetries: 0 });
      const selected = observeSelectedWait();
      const dispatches = staticTransport(limited(variant));
      const release = vi.spyOn(SlotQueue.prototype, 'release');
      const first = start(wrapped, 'A', caller());
      await first.done;
      expect(first.state.error).toMatchObject({ name: 'RateLimitExhaustedError' });
      expect(dispatches).toHaveLength(1);
      expect(selected.waits).toHaveLength(0);
      expect(release).toHaveBeenCalledOnce();
    },
  );

  it.each([
    { recoveryHint: false, kind: 'quota', prefix: 'Quota exceeded:' },
    { recoveryHint: true, kind: 'rate_limit', prefix: 'Rate limit exceeded:' },
  ] as const)(
    'raw loaded Chat returns a hard-code response without lower retry (recoveryHint=$recoveryHint)',
    async ({ recoveryHint, kind, prefix }) => {
      const { target, registry } = await createTarget();
      const selected = observeSelectedWait();
      const responseHeaders = recoveryHint ? { ...headers, 'retry-after': '2' } : headers;
      const dispatches = staticTransport(
        new Response(
          JSON.stringify({
            error: { code: 'insufficient_quota', message: 'fixture quota diagnostic' },
          }),
          {
            status: 429,
            statusText: 'Too Many Requests',
            headers: responseHeaders,
          },
        ),
      );
      const release = vi.spyOn(SlotQueue.prototype, 'release');
      // Lower fetch fails fast on the code. Its structured error treats a short
      // recovery hint as rate_limit; outer scheduler retry policy is separate.
      const first = start(target, 'A', caller());
      await first.done;
      expect(first.state.error).toBeUndefined();
      expect(first.state.value).toMatchObject({
        error: expect.stringContaining(prefix),
        metadata: {
          rateLimitKind: kind,
          http: { status: 429, headers: responseHeaders },
        },
      });
      expect(dispatches).toHaveLength(1);
      expect(selected.waits).toHaveLength(0);
      expect(release).not.toHaveBeenCalled();
      expect(registry.getMetrics()).toEqual({});
    },
  );

  it('releases a held callback without imposing quota when its response has none', async () => {
    const started = createDeferred<void>();
    const held = createDeferred<string>();
    releaseWork.push(() => held.resolve('late callback result'));
    const { registry, wrapped } = await createTarget({
      functionToolCallbacks: {
        held: () => {
          started.resolve();
          return held.promise;
        },
      },
    });
    const selected = observeSelectedWait();
    const dispatches = staticTransport(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call-held',
                    type: 'function',
                    function: { name: 'held', arguments: '{}' },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
          usage,
        }),
        { status: 200, headers },
      ),
    );
    const firstController = caller();
    const first = start(wrapped, 'A', firstController);
    await started.promise;
    const second = start(wrapped, 'B', caller());
    const abortAt = Date.now();
    firstController.abort('custom caller reason');
    await vi.advanceTimersByTimeAsync(0);
    expect(first.state.error).toMatchObject({
      name: 'AbortError',
      cause: 'custom caller reason',
      message: 'custom caller reason',
    });
    expect(second.state.value).toMatchObject({ output: 'B output' });
    expect(dispatches).toEqual([
      { caller: 'A', at: abortAt },
      { caller: 'B', at: abortAt },
    ]);
    expect(selected.waits).toHaveLength(0);
    expect(Object.values(registry.getMetrics())[0]).toMatchObject({
      activeRequests: 0,
      queueDepth: 0,
    });
  });

  it('does not publish selected-backoff quota while the 429 body is still incomplete', async () => {
    const { registry, wrapped } = await createTarget();
    const selected = observeSelectedWait();
    const requested = createDeferred<void>();
    let body!: ReadableStreamDefaultController<Uint8Array>;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          body = controller;
          controller.enqueue(new TextEncoder().encode('{"error":'));
        },
      }),
      { status: 429, statusText: 'Too Many Requests', headers: { ...headers, 'retry-after': '2' } },
    );
    const dispatches: string[] = [];
    vi.mocked(globalThis.fetch).mockImplementation(async (_url, options) => {
      const prompt = JSON.parse(String(options?.body)).messages[0].content as string;
      dispatches.push(prompt);
      if (prompt === 'A') {
        const signal = options!.signal!;
        signal.addEventListener('abort', () => body.error(signal.reason), { once: true });
        requested.resolve();
        return response;
      }
      return success(prompt);
    });
    const firstController = caller();
    const reason = Object.assign(new Error('stop incomplete body'), { name: 'AbortError' });
    const first = start(wrapped, 'A', firstController);
    await requested.promise;
    await nextTurn();
    const second = start(wrapped, 'B', caller());
    expect(Object.values(registry.getMetrics())[0]).toMatchObject({
      activeRequests: 1,
      queueDepth: 1,
    });
    expect(selected.waits).toHaveLength(0);
    firstController.abort(reason);
    await vi.advanceTimersByTimeAsync(0);
    await Promise.all([first.done, second.done]);
    expect(first.state.error).toBe(reason);
    expect(second.state.value).toMatchObject({ output: 'B output' });
    expect(dispatches).toEqual(['A', 'B']);
    expect(selected.waits).toHaveLength(0);
    expect(Object.values(registry.getMetrics())[0]).toMatchObject({
      activeRequests: 0,
      queueDepth: 0,
      retriedRequests: 0,
    });
  });

  it.each([
    { existingSeconds: 60, selectedSeconds: 2, cancel: true },
    { existingSeconds: 60, selectedSeconds: 2, cancel: false },
    { existingSeconds: 2, selectedSeconds: 60, cancel: true },
  ])(
    'retains the later pool deadline across existing $existingSeconds s and selected $selectedSeconds s (cancel=$cancel)',
    async ({ existingSeconds, selectedSeconds, cancel }) => {
      const { registry, wrapped } = await createTarget({}, 2);
      const selected = observeSelectedWait(selectedSeconds * 1000 + 500);
      const held = createDeferred<Response>();
      releaseWork.push(() => held.resolve(success('A')));
      const dispatches: { caller: string; at: number }[] = [];
      vi.mocked(globalThis.fetch).mockImplementation(async (_url, options) => {
        const prompt = JSON.parse(String(options?.body)).messages[0].content as string;
        dispatches.push({ caller: prompt, at: Date.now() });
        if (prompt === 'A' && dispatches.filter((entry) => entry.caller === 'A').length === 1) {
          return held.promise;
        }
        if (prompt === 'C') {
          const response = success('C');
          // Generic successful-response quota is learned by the scheduler, but
          // does not itself cause the lower fetch layer to select a backoff.
          response.headers.set('ratelimit-remaining', '0');
          response.headers.set('ratelimit-reset', `${existingSeconds}s`);
          return response;
        }
        return success(prompt);
      });
      const releases: { at: number; resetAt: number | null }[] = [];
      const originalRelease = SlotQueue.prototype.release;
      vi.spyOn(SlotQueue.prototype, 'release').mockImplementation(function (this: SlotQueue) {
        releases.push({ at: Date.now(), resetAt: this.getResetAt() });
        originalRelease.call(this);
      });
      const reason = Object.freeze(
        Object.assign(new Error('stop selected A'), { name: 'AbortError' }),
      );
      const firstController = caller();
      const startedAt = Date.now();
      const first = start(wrapped, 'A', firstController);
      const companion = start(wrapped, 'C', caller());
      await companion.done;
      expect(companion.state.value).toMatchObject({ output: 'C output' });
      expect(dispatches).toEqual([
        { caller: 'A', at: startedAt },
        { caller: 'C', at: startedAt },
      ]);
      expect(releases).toEqual([{ at: startedAt, resetAt: startedAt + existingSeconds * 1000 }]);
      const queued = start(wrapped, 'B', caller());
      await nextTurn();
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        activeRequests: 1,
        queueDepth: 1,
      });
      held.resolve(
        new Response(
          JSON.stringify({ error: { code: 'rate_limit_exceeded', message: 'retry A' } }),
          {
            status: 429,
            statusText: 'Too Many Requests',
            headers: { ...headers, 'retry-after': String(selectedSeconds) },
          },
        ),
      );
      const wait = await selected.entered;
      const expectedResetAt = startedAt + Math.max(existingSeconds, selectedSeconds) * 1000;
      if (cancel) {
        await vi.advanceTimersByTimeAsync(500);
        firstController.abort(reason);
        await first.done;
        expect(first.state.error).toBe(reason);
        expect(first.state.value).toBeUndefined();
      } else {
        await vi.advanceTimersByTimeAsync(wait.waitMs);
        await first.done;
        expect(first.state.error).toBeUndefined();
        expect(first.state.value).toMatchObject({ output: 'A output' });
      }
      expect.soft(releases[1]).toEqual({ at: Date.now(), resetAt: expectedResetAt });
      // A's own shorter wait must not permit B to forget C's still-live quota.
      await vi.advanceTimersByTimeAsync(expectedResetAt - Date.now() - 1);
      expect.soft(queued.state.settled).toBe(false);
      expect.soft(dispatches.filter((entry) => entry.caller === 'B')).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      await queued.done;
      expect(queued.state.value).toMatchObject({ output: 'B output' });
      expect
        .soft(dispatches.filter((entry) => entry.caller === 'B'))
        .toEqual([{ caller: 'B', at: expectedResetAt }]);
      expect(dispatches.filter((entry) => entry.caller === 'A')).toHaveLength(cancel ? 1 : 2);
      expect(releases).toHaveLength(3);
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        activeRequests: 0,
        queueDepth: 0,
        completedRequests: cancel ? 2 : 3,
        failedRequests: cancel ? 1 : 0,
        retriedRequests: 0,
      });
      await vi.advanceTimersByTimeAsync(1000);
      expect(dispatches).toHaveLength(cancel ? 3 : 4);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('lets fresh successful quota replace an older exhausted deadline', async () => {
    const { registry, wrapped } = await createTarget({}, 2);
    const held = createDeferred<Response>();
    releaseWork.push(() => held.resolve(success('A')));
    const dispatches: string[] = [];
    vi.mocked(globalThis.fetch).mockImplementation(async (_url, options) => {
      const prompt = JSON.parse(String(options?.body)).messages[0].content as string;
      dispatches.push(prompt);
      if (prompt === 'A') {
        return held.promise;
      }
      const response = success(prompt);
      if (prompt === 'C') {
        response.headers.set('ratelimit-remaining', '0');
        response.headers.set('ratelimit-reset', '60s');
      }
      return response;
    });
    const first = start(wrapped, 'A', caller());
    const companion = start(wrapped, 'C', caller());
    await companion.done;
    const queued = start(wrapped, 'B', caller());
    await nextTurn();
    expect(dispatches).toEqual(['A', 'C']);
    const fresh = success('A');
    fresh.headers.set('ratelimit-remaining', '5');
    fresh.headers.set('ratelimit-reset', '2s');
    held.resolve(fresh);
    await Promise.all([first.done, queued.done]);
    expect(first.state.value).toMatchObject({ output: 'A output' });
    expect(queued.state.value).toMatchObject({ output: 'B output' });
    expect(dispatches).toEqual(['A', 'C', 'B']);
    expect(Object.values(registry.getMetrics())[0]).toMatchObject({
      activeRequests: 0,
      queueDepth: 0,
      completedRequests: 3,
      failedRequests: 0,
      retriedRequests: 0,
    });
    expect(vi.getTimerCount()).toBe(0);
  });
});
