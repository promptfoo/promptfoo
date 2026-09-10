import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCacheEnabled } from '../../src/cache';
import { loadApiProvider } from '../../src/providers';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { wrapProviderWithRateLimiting } from '../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { createDeferred, mockProcessEnv } from '../util/utils';

import type { ApiProvider, ProviderResponse } from '../../src/types/providers';

const headers = { 'content-type': 'application/json' };
const startAt = Date.parse('2026-09-10T00:00:00.000Z');
const retryJitterMs = 500;
const cases = [
  { name: 'Retry-After zero with proactive reduction', positiveLimit: true, pastReset: false },
  { name: 'Retry-After zero without a positive limit', positiveLimit: false, pastReset: false },
  { name: 'a past reset with proactive reduction', positiveLimit: true, pastReset: true },
] as const;

function success(caller: string) {
  return new Response(
    JSON.stringify({
      choices: [
        { message: { role: 'assistant', content: `${caller} output` }, finish_reason: 'stop' },
      ],
      usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
    }),
    { status: 200, statusText: 'OK', headers },
  );
}

function limited(positiveLimit: boolean, pastReset: boolean) {
  const quotaHeaders: Record<string, string> = {
    ...headers,
    'x-ratelimit-remaining-requests': '0',
  };
  if (positiveLimit) {
    quotaHeaders['x-ratelimit-limit-requests'] = '100';
  }
  if (pastReset) {
    quotaHeaders['x-ratelimit-reset-requests'] = new Date(startAt - 1000).toISOString();
  } else {
    quotaHeaders['retry-after'] = '0';
  }
  return new Response(
    JSON.stringify({
      error: { code: 'rate_limit_exceeded', message: 'fixture request quota exhausted' },
    }),
    { status: 429, statusText: 'Too Many Requests', headers: quotaHeaders },
  );
}

describe('loaded Chat elapsed selected quota with two active calls and queued demand', () => {
  const providers: ApiProvider[] = [];
  const registries: RateLimitRegistry[] = [];
  const controllers: AbortController[] = [];
  const pending: Promise<void>[] = [];
  const releaseResponses: (() => void)[] = [];
  let restoreEnvironment: () => void;

  function heldResponse(caller: string) {
    const response = createDeferred<Response>();
    releaseResponses.push(() => response.resolve(success(caller)));
    return response;
  }

  function start(provider: ApiProvider, prompt: string) {
    const controller = new AbortController();
    controllers.push(controller);
    const state: { settled: boolean; value?: ProviderResponse; error?: unknown } = {
      settled: false,
    };
    const done = withCacheEnabled(false, () =>
      provider.callApi(prompt, undefined, { abortSignal: controller.signal }),
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

  beforeEach(() => {
    restoreEnvironment = mockProcessEnv({
      OPENAI_API_KEY: 'fixture-key',
      PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: 'false',
      PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
      PROMPTFOO_RETRY_5XX: 'false',
    });
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(startAt);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected fixture request'));
  });

  afterEach(async () => {
    for (const controller of controllers.splice(0)) {
      controller.abort();
    }
    for (const release of releaseResponses.splice(0)) {
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

  it.each(cases)('dispatches B promptly after $name', async ({ positiveLimit, pastReset }) => {
    const target = await loadApiProvider('openai:chat:gpt-4o-mini', {
      options: {
        config: {
          apiBaseUrl: 'https://elapsed-quota.fixture.test/v1',
          apiKey: 'fixture-key',
          maxRetries: 1,
        },
      },
    });
    providers.push(target);
    expect(target).toBeInstanceOf(OpenAiChatCompletionProvider);
    const registry = new RateLimitRegistry({ maxConcurrency: 2, minConcurrency: 1 });
    registries.push(registry);
    const wrapped = wrapProviderWithRateLimiting(target, registry);
    const firstResponse = heldResponse('A');
    const companionResponse = heldResponse('C');
    const queuedResponse = heldResponse('B');
    const activeDispatched = createDeferred<void>();
    const dispatches: { caller: string; at: number }[] = [];
    vi.mocked(globalThis.fetch).mockImplementation(async (_url, options) => {
      const caller = JSON.parse(String(options?.body)).messages[0].content as string;
      dispatches.push({ caller, at: Date.now() });
      if (dispatches.length === 2) {
        activeDispatched.resolve();
      }
      if (caller === 'A') {
        return dispatches.filter((dispatch) => dispatch.caller === 'A').length === 1
          ? firstResponse.promise
          : success('A');
      }
      if (caller === 'C') {
        return companionResponse.promise;
      }
      if (caller === 'B') {
        return queuedResponse.promise;
      }
      throw new Error(`Unexpected fixture caller: ${caller}`);
    });

    const hitObserved = createDeferred<{ at: number; resetAt: number | null }>();
    const hits: { at: number; resetAt: number | null }[] = [];
    registry.on('ratelimit:hit', (event: { resetAt: number | null }) => {
      const hit = { at: Date.now(), resetAt: event.resetAt };
      hits.push(hit);
      hitObserved.resolve(hit);
    });
    const started = vi.fn();
    const completed = vi.fn();
    const failed = vi.fn();
    const retrying = vi.fn();
    const decreased = vi.fn();
    registry.on('request:started', started);
    registry.on('request:completed', completed);
    registry.on('request:failed', failed);
    registry.on('request:retrying', retrying);
    registry.on('concurrency:decreased', decreased);
    const metrics = () => {
      const values = Object.values(registry.getMetrics());
      expect(values).toHaveLength(1);
      return values[0];
    };

    const first = start(wrapped, 'A');
    const companion = start(wrapped, 'C');
    await activeDispatched.promise;
    const queued = start(wrapped, 'B');
    expect(dispatches).toEqual([
      { caller: 'A', at: startAt },
      { caller: 'C', at: startAt },
    ]);
    expect(metrics()).toMatchObject({
      activeRequests: 2,
      maxConcurrency: 2,
      queueDepth: 1,
      totalRequests: 3,
      completedRequests: 0,
      failedRequests: 0,
      rateLimitHits: 0,
      retriedRequests: 0,
    });

    firstResponse.resolve(limited(positiveLimit, pastReset));
    const hit = await hitObserved.promise;
    expect(hit.at).toBe(startAt);
    // An elapsed deadline can already have been cleared by queue processing,
    // but it must never turn into the unknown-quota 60-second fallback.
    expect.soft(hit.resetAt ?? hit.at).toBe(startAt);
    expect(decreased).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        previous: 2,
        current: 1,
        reason: positiveLimit ? 'proactive' : 'ratelimit',
      }),
    );
    expect(metrics()).toMatchObject({
      activeRequests: 2,
      maxConcurrency: 1,
      queueDepth: 1,
      completedRequests: 0,
      rateLimitHits: 1,
      retriedRequests: 0,
    });
    expect(completed).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(retryJitterMs - 1);
    expect(dispatches).toHaveLength(2);
    expect(first.state.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(first.state.value).toMatchObject({ output: 'A output' });
    expect(first.state.error).toBeUndefined();
    expect(companion.state.settled).toBe(false);
    expect(queued.state.settled).toBe(false);
    expect(dispatches).toEqual([
      { caller: 'A', at: startAt },
      { caller: 'C', at: startAt },
      { caller: 'A', at: startAt + retryJitterMs },
    ]);
    // A's lower retry retains its one slot until its successful completion.
    expect(completed).toHaveBeenCalledTimes(1);
    expect(metrics()).toMatchObject({ activeRequests: 1, queueDepth: 1, completedRequests: 1 });

    companionResponse.resolve(success('C'));
    await companion.done;
    await vi.advanceTimersByTimeAsync(0);
    expect(companion.state.value).toMatchObject({ output: 'C output' });
    expect(companion.state.error).toBeUndefined();
    expect(dispatches).toEqual([
      { caller: 'A', at: startAt },
      { caller: 'C', at: startAt },
      { caller: 'A', at: startAt + retryJitterMs },
      { caller: 'B', at: startAt + retryJitterMs },
    ]);
    // C releases the remaining active slot; B acquires it before its held response.
    expect(completed).toHaveBeenCalledTimes(2);
    expect(queued.state.settled).toBe(false);
    expect(metrics()).toMatchObject({ activeRequests: 1, queueDepth: 0, completedRequests: 2 });

    queuedResponse.resolve(success('B'));
    await queued.done;
    expect(queued.state.value).toMatchObject({ output: 'B output' });
    expect(queued.state.error).toBeUndefined();
    expect(started).toHaveBeenCalledTimes(3);
    expect(completed).toHaveBeenCalledTimes(3);
    expect(failed).not.toHaveBeenCalled();
    expect(retrying).not.toHaveBeenCalled();
    expect(hits).toHaveLength(1);
    expect(metrics()).toMatchObject({
      activeRequests: 0,
      maxConcurrency: 1,
      queueDepth: 0,
      totalRequests: 3,
      completedRequests: 3,
      failedRequests: 0,
      rateLimitHits: 1,
      retriedRequests: 0,
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(dispatches).toHaveLength(4);
    expect(completed).toHaveBeenCalledTimes(3);
    expect(metrics()).toMatchObject({ activeRequests: 0, queueDepth: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });
});
