import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCacheEnabled } from '../../src/cache';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { wrapProviderWithRateLimiting } from '../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { SlotQueue } from '../../src/scheduler/slotQueue';
import { createDeferred, mockProcessEnv } from '../util/utils';

import type { OpenAiCompletionOptions } from '../../src/providers/openai/types';

const usage = { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 };
const successPayload = {
  choices: [{ message: { role: 'assistant', content: 'second output' }, finish_reason: 'stop' }],
  usage,
};
const toolPayload = {
  choices: [
    {
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'call-held', type: 'function', function: { name: 'held', arguments: '{}' } },
        ],
      },
      finish_reason: 'tool_calls',
    },
  ],
  usage,
};
const responseHeaders = {
  'content-type': 'application/json',
  'x-request-id': 'completed-scheduler-fixture',
};

describe('real Chat completed outcomes through the rate-limit wrapper', () => {
  const registries: RateLimitRegistry[] = [];
  const providers: OpenAiChatCompletionProvider[] = [];
  let restoreEnvironment: () => void;

  function createTarget(config: OpenAiCompletionOptions = {}) {
    const target = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: {
        apiBaseUrl: 'https://completed-scheduler.fixture.test/v1',
        apiKey: 'fixture-key',
        maxRetries: 3,
        cost: 0.01,
        ...config,
      },
    });
    providers.push(target);
    const registry = new RateLimitRegistry({ maxConcurrency: 1 });
    registries.push(registry);
    return { target, registry, wrapped: wrapProviderWithRateLimiting(target, registry) };
  }

  beforeEach(() => {
    restoreEnvironment = mockProcessEnv({
      PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: 'false',
      PROMPTFOO_RETRY_5XX: 'false',
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-09T12:00:00.000Z'));
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected fixture request'));
  });

  afterEach(async () => {
    for (const registry of registries.splice(0)) {
      registry.dispose();
    }
    for (const provider of providers.splice(0)) {
      await provider.cleanup();
    }
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    restoreEnvironment();
    vi.useRealTimers();
  });

  it.each([
    'AbortError',
    'AbortException',
    'custom reason',
    'successful callback',
    'independent callback error',
  ] as const)(
    'learns completed quota before releasing a held callback with %s',
    async (outcome) => {
      const started = createDeferred<void>();
      const callbackResult = createDeferred<string>();
      const events: string[] = [];
      let secondDispatchAt: number | undefined;
      const callback = vi.fn(() => {
        events.push('A callback started');
        started.resolve();
        return callbackResult.promise;
      });
      const { registry, wrapped } = createTarget({ functionToolCallbacks: { held: callback } });
      const firstController = new AbortController();
      const secondController = new AbortController();
      const reason = Object.freeze(
        Object.assign(new Error('caller stopped the held callback'), {
          name: outcome === 'AbortException' ? 'AbortException' : 'AbortError',
        }),
      );
      const customReason = 'custom callback cancellation';
      const release = vi.spyOn(SlotQueue.prototype, 'release');
      const updateQuota = vi.spyOn(SlotQueue.prototype, 'updateRateLimitState');
      const learned = vi.fn();
      const retrying = vi.fn();
      registry.on('ratelimit:learned', learned);
      registry.on('request:retrying', retrying);
      const resetAt = Date.now() + 1500;
      const quotaHeaders = {
        ...responseHeaders,
        'ratelimit-limit': '10',
        'ratelimit-remaining': '0',
        'ratelimit-reset': new Date(resetAt).toISOString(),
      };
      const response = new Response(JSON.stringify(toolPayload), {
        status: 200,
        statusText: 'OK',
        headers: quotaHeaders,
      });
      const read = response.text.bind(response);
      response.text = async () => {
        const text = await read();
        events.push('A body complete');
        return text;
      };
      vi.mocked(globalThis.fetch)
        .mockImplementationOnce(async () => {
          events.push('A dispatched');
          return response;
        })
        .mockImplementationOnce(async () => {
          events.push('B dispatched');
          secondDispatchAt = Date.now();
          return new Response(JSON.stringify(successPayload), { headers: responseHeaders });
        });

      const first = withCacheEnabled(false, () =>
        wrapped.callApi('first', undefined, { abortSignal: firstController.signal }),
      ).catch((error: unknown) => error);
      await started.promise;
      expect(events).toEqual(['A dispatched', 'A body complete', 'A callback started']);
      expect(response.bodyUsed).toBe(true);
      await vi.advanceTimersByTimeAsync(1000);
      if (outcome !== 'successful callback') {
        firstController.abort(outcome === 'custom reason' ? customReason : reason);
        events.push('A aborted');
      }

      // The same wrapper and provider key put B behind A's still-owned slot.
      const second = withCacheEnabled(false, () =>
        wrapped.callApi('second', undefined, { abortSignal: secondController.signal }),
      );
      events.push('B queued');
      expect(Object.values(registry.getMetrics())).toHaveLength(1);
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        activeRequests: 1,
        queueDepth: 1,
        totalRequests: 2,
      });
      expect(release).not.toHaveBeenCalled();
      expect(secondController.signal.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(100);
      events.push('A callback settled');
      if (outcome === 'independent callback error') {
        callbackResult.reject(new Error('independent callback failure'));
      } else {
        callbackResult.resolve('completed callback output');
      }
      await vi.advanceTimersByTimeAsync(0);
      const firstResult = await first;
      if (outcome === 'successful callback') {
        expect(firstResult).toMatchObject({ output: 'completed callback output' });
      } else if (outcome === 'independent callback error') {
        expect(firstResult).toEqual({
          error: `API error: Error: independent callback failure: ${JSON.stringify(toolPayload)}`,
          metadata: { http: { status: 200, statusText: 'OK', headers: quotaHeaders } },
        });
      } else if (outcome === 'custom reason') {
        expect(firstResult).toMatchObject({
          name: 'AbortError',
          message: customReason,
          cause: customReason,
        });
      } else {
        expect(firstResult).toBe(reason);
      }
      expect(callback).toHaveBeenCalledOnce();
      expect(globalThis.fetch).toHaveBeenCalledOnce();
      expect(release).toHaveBeenCalledOnce();
      expect(learned).toHaveBeenCalledOnce();
      // A normal result also returns these headers; that must not double-apply them.
      expect(updateQuota).toHaveBeenCalledOnce();
      expect(updateQuota).toHaveBeenCalledWith({
        remainingRequests: 0,
        remainingTokens: undefined,
        limitRequests: 10,
        limitTokens: undefined,
        resetAt,
      });
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        activeRequests: 0,
        queueDepth: 1,
        completedRequests: outcome === 'successful callback' ? 1 : 0,
        failedRequests: outcome === 'successful callback' ? 0 : 1,
        retriedRequests: 0,
        rateLimitHits: 0,
        avgLatencyMs: 1100,
      });

      await vi.advanceTimersByTimeAsync(399);
      expect(globalThis.fetch).toHaveBeenCalledOnce();
      expect(events).not.toContain('B dispatched');
      await vi.advanceTimersByTimeAsync(1);
      await expect(second).resolves.toMatchObject({ output: 'second output' });
      expect(events.at(-1)).toBe('B dispatched');
      expect(secondDispatchAt).toBeGreaterThanOrEqual(resetAt);
      expect(Date.now()).toBe(resetAt);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(release).toHaveBeenCalledTimes(2);
      expect(learned).toHaveBeenCalledOnce();
      expect(retrying).not.toHaveBeenCalled();
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        activeRequests: 0,
        queueDepth: 0,
        totalRequests: 2,
        completedRequests: outcome === 'successful callback' ? 2 : 1,
        failedRequests: outcome === 'successful callback' ? 0 : 1,
        retriedRequests: 0,
        rateLimitHits: 0,
        avgLatencyMs: 550,
      });
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each([
    { abort: false, scheduler: true },
    { abort: true, scheduler: true },
    { abort: true, scheduler: false },
  ])(
    'retains a completed invalid_prompt refusal with abort=$abort and scheduler=$scheduler',
    async ({ abort, scheduler }) => {
      vi.stubEnv('PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER', String(!scheduler));
      const { registry, wrapped } = createTarget();
      const controller = new AbortController();
      const events: string[] = [];
      const payload = {
        error: { code: 'invalid_prompt', message: 'upstream rejected input' },
        usage,
      };
      const response = new Response(JSON.stringify(payload), {
        status: 400,
        statusText: 'Bad Request',
        headers: responseHeaders,
      });
      const read = response.text.bind(response);
      response.text = async () => {
        const text = await read();
        events.push('body complete');
        if (abort) {
          controller.abort(new Error('caller stopped after completed refusal'));
          events.push('caller aborted');
        }
        return text;
      };
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(response);
      const release = vi.spyOn(SlotQueue.prototype, 'release');
      const retrying = vi.fn();
      registry.on('request:retrying', retrying);

      const result = await withCacheEnabled(false, () =>
        wrapped.callApi('refusal', undefined, { abortSignal: controller.signal }),
      );

      expect(result).toEqual({
        output: `API error: 400 Bad Request\n${JSON.stringify(payload)}`,
        tokenUsage: { total: 5, prompt: 2, completion: 3, numRequests: 1 },
        cached: false,
        latencyMs: expect.any(Number),
        cost: 0.05,
        isRefusal: true,
        guardrails: { flagged: true, flaggedInput: true },
        metadata: { http: { status: 400, statusText: 'Bad Request', headers: responseHeaders } },
      });
      expect(result).not.toHaveProperty('error');
      expect(events).toEqual(abort ? ['body complete', 'caller aborted'] : ['body complete']);
      expect(response.bodyUsed).toBe(true);
      expect(controller.signal.aborted).toBe(abort);
      expect(globalThis.fetch).toHaveBeenCalledOnce();
      expect(release).toHaveBeenCalledTimes(scheduler ? 1 : 0);
      expect(retrying).not.toHaveBeenCalled();
      if (scheduler) {
        expect(Object.values(registry.getMetrics())[0]).toMatchObject({
          activeRequests: 0,
          queueDepth: 0,
          totalRequests: 1,
          completedRequests: 1,
          failedRequests: 0,
          retriedRequests: 0,
        });
      } else {
        expect(registry.getMetrics()).toEqual({});
      }
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('preserves a completed independent HTTP failure after body completion and cancellation', async () => {
    const { registry, wrapped } = createTarget();
    const controller = new AbortController();
    const payload = { error: { code: 'server_error', message: 'upstream unavailable' } };
    const response = new Response(JSON.stringify(payload), {
      status: 503,
      statusText: 'Service Unavailable',
      headers: responseHeaders,
    });
    const read = response.text.bind(response);
    response.text = async () => {
      const text = await read();
      controller.abort(new Error('caller cancelled after independent HTTP failure'));
      return text;
    };
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(response);
    const release = vi.spyOn(SlotQueue.prototype, 'release');

    await expect(
      withCacheEnabled(false, () =>
        wrapped.callApi('failure', undefined, { abortSignal: controller.signal }),
      ),
    ).resolves.toEqual({
      error: `API error: 503 Service Unavailable\n${JSON.stringify(payload)}`,
      metadata: {
        http: { status: 503, statusText: 'Service Unavailable', headers: responseHeaders },
      },
    });
    expect(response.bodyUsed).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
    expect(Object.values(registry.getMetrics())[0]).toMatchObject({
      activeRequests: 0,
      completedRequests: 0,
      failedRequests: 1,
      retriedRequests: 0,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['AbortError', 'AbortException'])(
    'still rejects a completed ordinary 200 with exact %s identity',
    async (name) => {
      const { registry, wrapped } = createTarget();
      const controller = new AbortController();
      const reason = Object.freeze(
        Object.assign(new Error('caller stopped after success'), { name }),
      );
      const response = new Response(JSON.stringify(successPayload), { headers: responseHeaders });
      const read = response.text.bind(response);
      response.text = async () => {
        const text = await read();
        controller.abort(reason);
        return text;
      };
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(response);
      const release = vi.spyOn(SlotQueue.prototype, 'release');

      await expect(
        withCacheEnabled(false, () =>
          wrapped.callApi('success', undefined, { abortSignal: controller.signal }),
        ),
      ).rejects.toBe(reason);
      expect(response.bodyUsed).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledOnce();
      expect(release).toHaveBeenCalledOnce();
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        activeRequests: 0,
        completedRequests: 0,
        failedRequests: 1,
        retriedRequests: 0,
      });
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('still cancels a pending body before a refusal exists without retrying or leaking its slot', async () => {
    const { registry, wrapped } = createTarget();
    const controller = new AbortController();
    const reason = new DOMException('caller stopped during the refusal body', 'AbortError');
    const reading = createDeferred<void>();
    const release = vi.spyOn(SlotQueue.prototype, 'release');
    vi.mocked(globalThis.fetch).mockImplementationOnce(async (_url, options) => {
      const response = new Response(
        new ReadableStream({
          start(stream) {
            options!.signal!.addEventListener('abort', () => stream.error(reason), { once: true });
          },
        }),
        { status: 400, statusText: 'Bad Request', headers: responseHeaders },
      );
      const read = response.text.bind(response);
      response.text = () => {
        reading.resolve();
        return read();
      };
      return response;
    });
    const pending = withCacheEnabled(false, () =>
      wrapped.callApi('pending body', undefined, { abortSignal: controller.signal }),
    );
    const rejected = expect(pending).rejects.toBe(reason);
    await reading.promise;
    controller.abort(reason);
    await rejected;
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
    expect(Object.values(registry.getMetrics())[0]).toMatchObject({
      activeRequests: 0,
      queueDepth: 0,
      completedRequests: 0,
      failedRequests: 1,
      retriedRequests: 0,
    });
    expect(vi.getTimerCount()).toBe(0);
  });
});
