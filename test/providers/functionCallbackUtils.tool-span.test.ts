import { randomUUID } from 'node:crypto';
import { getEventListeners } from 'node:events';
import { setImmediate } from 'node:timers/promises';

import { context, propagation, SpanStatusCode, trace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCacheEnabled, withCacheNamespace } from '../../src/cache';
import { loadApiProvider } from '../../src/providers';
import { executeProviderFunctionCallback } from '../../src/providers/functionCallbackUtils';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { wrapProviderWithRateLimiting } from '../../src/scheduler/providerWrapper';
import { getRateLimitKey } from '../../src/scheduler/rateLimitKey';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { TokenUsageTracker } from '../../src/util/tokenUsage';
import {
  accumulateResponseTokenUsage,
  createEmptyTokenUsage,
} from '../../src/util/tokenUsageUtils';
import { createDeferred, mockProcessEnv } from '../util/utils';
import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-base';

import type { ApiProvider } from '../../src/types/providers';

vi.mock('../../src/logger');

describe('callback failures selected before real tool-span completion', () => {
  const controllers: AbortController[] = [];
  const providers: ApiProvider[] = [];
  const registries: RateLimitRegistry[] = [];
  const drains: (() => void)[] = [];
  const pending: Promise<unknown>[] = [];
  let tracerProvider: NodeTracerProvider;
  let restoreEnvironment: () => void;
  let onToolEnd: ((span: ReadableSpan) => void) | undefined;

  beforeEach(() => {
    restoreEnvironment = mockProcessEnv({
      OPENAI_API_KEY: 'fixture-key',
      OPENAI_ORGANIZATION: undefined,
      PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: 'false',
      PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
      PROMPTFOO_DISABLE_TELEMETRY: 'true',
      PROMPTFOO_RETRY_5XX: 'false',
    });
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    const processor: SpanProcessor = {
      onStart() {},
      onEnd(span) {
        if (span.name === 'execute_tool lookup') {
          onToolEnd?.(span);
        }
      },
      async forceFlush() {},
      async shutdown() {},
    };
    tracerProvider = new NodeTracerProvider({ spanProcessors: [processor] });
    tracerProvider.register();
  });

  afterEach(async () => {
    for (const controller of controllers.splice(0)) {
      controller.abort();
    }
    for (const drain of drains.splice(0)) {
      drain();
    }
    await Promise.allSettled(pending.splice(0));
    await setImmediate();
    for (const provider of providers.splice(0)) {
      await provider.cleanup?.();
    }
    for (const registry of registries.splice(0)) {
      registry.dispose();
    }
    await tracerProvider.shutdown();
    onToolEnd = undefined;
    trace.disable();
    context.disable();
    propagation.disable();
    vi.restoreAllMocks();
    vi.useRealTimers();
    restoreEnvironment();
  });

  function watchTool() {
    const controller = new AbortController();
    controllers.push(controller);
    const completed = createDeferred<void>();
    drains.push(() => completed.resolve());
    const events: string[] = [];
    const ends: {
      span: ReadableSpan;
      signalAborted: boolean;
      operationSettled: boolean;
    }[] = [];
    let operationSettled = false;
    onToolEnd = (span) => {
      ends.push({ span, signalAborted: controller.signal.aborted, operationSettled });
      events.push('tool span ended');
      // A passive processor only notifies its application-owned promise.
      // Cancellation belongs to the separate continuation below.
      completed.resolve();
    };
    function capture<T>(promise: Promise<T>) {
      const outcome = promise.then(
        (value) => {
          operationSettled = true;
          events.push('operation fulfilled');
          return { value, error: undefined };
        },
        (error: unknown) => {
          operationSettled = true;
          events.push('operation rejected');
          return { value: undefined, error };
        },
      );
      pending.push(outcome);
      return outcome;
    }
    function abortAfterEnd(reason: unknown) {
      const policy = completed.promise.then(() => {
        events.push('caller abort');
        controller.abort(reason);
      });
      pending.push(policy);
      return policy;
    }
    return { controller, events, ends, capture, abortAfterEnd };
  }

  function inParent<T>(fn: () => Promise<T>): Promise<T> {
    return trace
      .getTracer('callback-span-fixture')
      .startActiveSpan('application caller', async (span) => {
        try {
          expect(span.isRecording()).toBe(true);
          return await fn();
        } finally {
          span.end();
        }
      });
  }

  it.each(['Error', 'AbortError', 'AbortException'])(
    'preserves the exact independent %s after the real error span ends and the caller aborts',
    async (name) => {
      const f = watchTool();
      const failure = Object.freeze(
        Object.assign(new Error('independent callback failure'), {
          name,
          cause: Object.freeze({ operation: 'callback' }),
        }),
      );
      const descriptors = Object.getOwnPropertyDescriptors(failure);
      const reason = Object.freeze(
        Object.assign(new Error('caller completion policy'), { name: 'AbortError' }),
      );
      const policy = f.abortAfterEnd(reason);
      const callback = vi.fn(async (args: string) => {
        expect(args).toBe('{"item":"fixture"}');
        expect(trace.getActiveSpan()?.isRecording()).toBe(true);
        expect(f.controller.signal.aborted).toBe(false);
        f.events.push('callback rejected');
        throw failure;
      });
      const result = await inParent(() =>
        f.capture(
          executeProviderFunctionCallback({
            functionName: 'lookup',
            args: '{"item":"fixture"}',
            callId: 'callback-call',
            callbacks: { lookup: callback },
            cache: {},
            abortSignal: f.controller.signal,
          }),
        ),
      );
      await policy;
      expect(f.ends).toHaveLength(1);
      expect(f.ends[0]).toMatchObject({ signalAborted: false, operationSettled: false });
      expect(f.ends[0].span.status).toEqual({
        code: SpanStatusCode.ERROR,
        message: failure.message,
      });
      expect(f.ends[0].span.attributes).toMatchObject({
        'tool.is_error': true,
        'error.type': name,
        'gen_ai.tool.call.id': 'callback-call',
      });
      expect(f.events).toEqual([
        'callback rejected',
        'tool span ended',
        'caller abort',
        'operation rejected',
      ]);
      expect(f.controller.signal.reason).toBe(reason);
      expect(result.error).toBe(failure);
      expect(Object.getOwnPropertyDescriptors(failure)).toEqual(descriptors);
      expect(callback).toHaveBeenCalledOnce();
      expect(getEventListeners(f.controller.signal, 'abort')).toHaveLength(0);
    },
  );

  it('still cancels a successful value when the caller aborts after its successful span ends', async () => {
    const f = watchTool();
    const reason = Object.assign(new Error('successful callback is no longer needed'), {
      name: 'AbortException',
    });
    const policy = f.abortAfterEnd(reason);
    const result = await inParent(() =>
      f.capture(
        executeProviderFunctionCallback({
          functionName: 'lookup',
          args: '{}',
          callbacks: { lookup: () => ({ answer: 42 }) },
          cache: {},
          abortSignal: f.controller.signal,
        }),
      ),
    );
    await policy;
    expect(f.ends).toHaveLength(1);
    expect(f.ends[0]).toMatchObject({ signalAborted: false, operationSettled: false });
    expect(f.ends[0].span.status.code).toBe(SpanStatusCode.OK);
    expect(f.ends[0].span.attributes['tool.output']).toBe('{"answer":42}');
    expect(f.events).toEqual(['tool span ended', 'caller abort', 'operation rejected']);
    expect(result.error).toBe(reason);
    expect(result.value).toBeUndefined();
    expect(getEventListeners(f.controller.signal, 'abort')).toHaveLength(0);
  });

  it.each(['resolve', 'reject'] as const)(
    'cancels a pending callback without stopping its late %s',
    async (settlement) => {
      const f = watchTool();
      const started = createDeferred<void>();
      const late = createDeferred<string>();
      const reason =
        settlement === 'resolve'
          ? Object.freeze({ owner: 'caller' })
          : Object.freeze(
              Object.assign(new Error('caller stopped waiting'), { name: 'AbortError' }),
            );
      let callbackSettled = false;
      const callback = vi.fn(() => {
        started.resolve();
        return late.promise.then(
          (value) => {
            callbackSettled = true;
            return value;
          },
          (error: unknown) => {
            callbackSettled = true;
            throw error;
          },
        );
      });
      drains.push(() => late.resolve('cleanup'));
      const outcome = inParent(() =>
        f.capture(
          executeProviderFunctionCallback({
            functionName: 'lookup',
            args: '{}',
            callbacks: { lookup: callback },
            cache: {},
            abortSignal: f.controller.signal,
          }),
        ),
      );
      await started.promise;
      expect(f.ends).toHaveLength(0);
      f.controller.abort(reason);
      const result = await outcome;
      expect(callbackSettled).toBe(false);
      if (settlement === 'resolve') {
        expect(result.error).toMatchObject({ name: 'AbortError', cause: reason });
        expect((result.error as Error).cause).toBe(reason);
        late.resolve('independent late value');
      } else {
        expect(result.error).toBe(reason);
        late.reject(new Error('independent late callback failure'));
      }
      await setImmediate();
      expect(callbackSettled).toBe(true);
      expect(f.ends).toHaveLength(1);
      expect(f.events.filter((event) => event === 'operation rejected')).toHaveLength(1);
      expect(f.events).not.toContain('operation fulfilled');
      expect(callback).toHaveBeenCalledOnce();
      expect(getEventListeners(f.controller.signal, 'abort')).toHaveLength(0);
    },
  );

  it.each([false, true])(
    'retains uncancelled callback errors and values with tracing=%s',
    async (traced) => {
      const f = watchTool();
      const failure = new Error('ordinary callback failure');
      const invoke = (callback: () => unknown) => {
        const call = () =>
          executeProviderFunctionCallback({
            functionName: 'lookup',
            args: '{}',
            callbacks: { lookup: callback },
            cache: {},
            abortSignal: f.controller.signal,
          });
        return traced ? inParent(call) : call();
      };
      await expect(
        invoke(async () => {
          throw failure;
        }),
      ).rejects.toBe(failure);
      await expect(invoke(() => ({ answer: 42 }))).resolves.toBe('{"answer":42}');
      await expect(invoke(async () => 'ordinary value')).resolves.toBe('ordinary value');
      expect(f.controller.signal.aborted).toBe(false);
      expect(f.ends).toHaveLength(traced ? 3 : 0);
      expect(getEventListeners(f.controller.signal, 'abort')).toHaveLength(0);
    },
  );

  it('does not dispatch an already-cancelled callback or create a tool span', async () => {
    const f = watchTool();
    const reason = 'caller stopped before dispatch';
    const callback = vi.fn(() => 'unreachable');
    f.controller.abort(reason);
    const result = await inParent(() =>
      f.capture(
        executeProviderFunctionCallback({
          functionName: 'lookup',
          args: '{}',
          callbacks: { lookup: callback },
          cache: {},
          abortSignal: f.controller.signal,
        }),
      ),
    );
    expect(result.error).toMatchObject({ name: 'AbortError', message: reason, cause: reason });
    expect(callback).not.toHaveBeenCalled();
    expect(f.ends).toHaveLength(0);
  });

  async function chatFixture(text: string, abortOnCompletion = true, cached = false) {
    const f = watchTool();
    const reason = Object.assign(new Error('caller observed tool completion'), {
      name: 'AbortError',
    });
    const failure = Object.assign(new Error(text), { name: 'AbortException' });
    let policy = Promise.resolve();
    const laterCallback = vi.fn(() => 'must not run');
    const callback = vi.fn(async () => {
      expect(trace.getActiveSpan()?.isRecording()).toBe(true);
      expect(f.controller.signal.aborted).toBe(false);
      throw failure;
    });
    const toolCalls = [
      { id: 'lookup-call', type: 'function', function: { name: 'lookup', arguments: '{}' } },
      { id: 'later-call', type: 'function', function: { name: 'later', arguments: '{}' } },
    ];
    const data = {
      choices: [
        {
          message: { role: 'assistant', content: null, tool_calls: toolCalls },
          finish_reason: 'tool_calls',
        },
      ],
      usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
    };
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      expect(input instanceof Request ? input.url : String(input)).toBe(
        'https://callback.fixture.test/v1/chat/completions',
      );
      return new Response(JSON.stringify(data), {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json', 'x-request-id': 'callback-model-response' },
      });
    });
    const raw = await loadApiProvider('openai:chat:gpt-4o-mini', {
      options: {
        config: {
          apiBaseUrl: 'https://callback.fixture.test/v1',
          apiKey: 'fixture-key',
          maxRetries: 0,
          cost: 0.25,
          functionToolCallbacks: { lookup: callback, later: laterCallback },
        },
      },
    });
    expect(raw).toBeInstanceOf(OpenAiChatCompletionProvider);
    providers.push(raw);
    const registry = new RateLimitRegistry({ maxConcurrency: 1, minConcurrency: 1 });
    registries.push(registry);
    const wrapped = wrapProviderWithRateLimiting(raw, registry);
    let warmResponse: Awaited<ReturnType<ApiProvider['callApi']>> | undefined;
    const result = await withCacheNamespace(randomUUID(), () =>
      withCacheEnabled(cached, async () => {
        if (cached) {
          // An ordinary completed callback fallback retains the real model cache
          // entry. Warming has no cancellation policy or observed tool span.
          const observer = onToolEnd;
          onToolEnd = undefined;
          try {
            warmResponse = await inParent(() => raw.callApi('fixture'));
          } finally {
            onToolEnd = observer;
          }
          expect(warmResponse.cached).toBe(false);
          expect(warmResponse.error).toBeUndefined();
        }
        policy = abortOnCompletion ? f.abortAfterEnd(reason) : Promise.resolve();
        return inParent(() =>
          f.capture(wrapped.callApi('fixture', undefined, { abortSignal: f.controller.signal })),
        );
      }),
    );
    await policy;
    expect(callback).toHaveBeenCalledTimes(cached ? 2 : 1);
    expect(laterCallback).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
    return {
      ...f,
      ...result,
      failure,
      reason,
      data,
      warmResponse,
      toolCalls,
      registry,
      key: getRateLimitKey(raw),
    };
  }

  it.each(['Independent callback unavailable', 'Downstream callback returned 429 rate limit'])(
    'keeps a post-span thrown callback diagnostic out of model quota: %s',
    async (text) => {
      const f = await chatFixture(text);
      expect(f.ends).toHaveLength(1);
      expect(f.ends[0]).toMatchObject({ signalAborted: false, operationSettled: false });
      expect(f.events).toEqual(['tool span ended', 'caller abort', 'operation fulfilled']);
      expect(f.error).toBeUndefined();
      expect(f.value).toEqual({
        error: `API error: ${String(f.failure)}: ${JSON.stringify(f.data)}`,
        tokenUsage: { total: 5, prompt: 2, completion: 3, numRequests: 1 },
        cost: 1.25,
        cached: false,
        latencyMs: expect.any(Number),
        metadata: {
          errorOrigin: 'tool',
          http: {
            status: 200,
            statusText: 'OK',
            headers: {
              'content-type': 'application/json',
              'x-request-id': 'callback-model-response',
            },
          },
        },
      });
      expect(f.registry.getMetrics()[f.key]).toMatchObject({
        totalRequests: 1,
        failedRequests: 1,
        activeRequests: 0,
        queueDepth: 0,
        retriedRequests: 0,
        rateLimitHits: 0,
      });
      expect(f.controller.signal.reason).toBe(f.reason);
    },
  );

  it('keeps completed cached model accounting after an independent callback failure', async () => {
    const f = await chatFixture('Downstream callback returned 429 rate limit', true, true);
    expect(f.error).toBeUndefined();
    expect(f.value).toMatchObject({
      error: `API error: ${String(f.failure)}: ${JSON.stringify(f.data)}`,
      tokenUsage: { total: 5, cached: 5 },
      cached: true,
      cost: 0,
      latencyMs: f.warmResponse?.latencyMs,
      metadata: { errorOrigin: 'tool' },
    });
    expect(f.events).toEqual(['tool span ended', 'caller abort', 'operation fulfilled']);
    expect(f.ends).toHaveLength(1);
    expect(f.ends[0]).toMatchObject({ signalAborted: false, operationSettled: false });
    const usage = createEmptyTokenUsage();
    accumulateResponseTokenUsage(usage, f.warmResponse);
    accumulateResponseTokenUsage(usage, f.value);
    expect(usage).toMatchObject({ total: 10, cached: 5, numRequests: 2 });
    expect(usage.incurredTokenUsage).toMatchObject({ total: 5, numRequests: 1 });
    const tracker = TokenUsageTracker.getInstance();
    const trackingId = randomUUID();
    try {
      tracker.trackResponseUsage(trackingId, f.warmResponse);
      tracker.trackResponseUsage(trackingId, f.value);
      expect(tracker.getProviderUsage(trackingId)).toMatchObject({
        total: 5,
        prompt: 2,
        completion: 3,
        cached: 5,
        numRequests: 1,
      });
    } finally {
      tracker.resetProviderUsage(trackingId);
    }
    expect(f.registry.getMetrics()[f.key]).toMatchObject({
      rateLimitHits: 0,
      activeRequests: 0,
      queueDepth: 0,
      retriedRequests: 0,
    });
  });

  it('keeps the ordinary uncancelled Chat callback fallback', async () => {
    const f = await chatFixture('ordinary callback failure', false);
    expect(f.error).toBeUndefined();
    expect(f.value?.error).toBeUndefined();
    expect(f.value?.output).toEqual(f.toolCalls);
    expect(f.value?.metadata?.errorOrigin).toBeUndefined();
    expect(f.controller.signal.aborted).toBe(false);
    expect(f.registry.getMetrics()[f.key]).toMatchObject({
      totalRequests: 1,
      completedRequests: 1,
      failedRequests: 0,
      rateLimitHits: 0,
      activeRequests: 0,
      queueDepth: 0,
      retriedRequests: 0,
    });
  });
});
