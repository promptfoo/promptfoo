import { getEventListeners } from 'node:events';
import { setImmediate } from 'node:timers/promises';

import { context, propagation, SpanStatusCode, trace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCacheEnabled, withCacheNamespace } from '../../src/cache';
import { loadApiProvider } from '../../src/providers';
import RedteamIterativeProvider from '../../src/redteam/providers/iterative';
import { redteamProviderManager } from '../../src/redteam/providers/shared';
import { wrapProviderWithRateLimiting } from '../../src/scheduler/providerWrapper';
import { getRateLimitKey } from '../../src/scheduler/rateLimitKey';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { SlotQueue } from '../../src/scheduler/slotQueue';
import { createDeferred, mockProcessEnv } from '../util/utils';
import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-base';

import type { ApiProvider, ProviderResponse } from '../../src/types/providers';

vi.mock('../../src/logger');

describe('selected tool error through the actual iterative scheduler boundary', () => {
  const controllers: AbortController[] = [];
  const providers: ApiProvider[] = [];
  const pending: Promise<unknown>[] = [];
  const drains: (() => void)[] = [];
  let registry: RateLimitRegistry;
  let tracerProvider: NodeTracerProvider;
  let restoreEnvironment: () => void;

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
    vi.setSystemTime(new Date('2026-09-10T21:15:00.000Z'));
    registry = new RateLimitRegistry({ maxConcurrency: 1, minConcurrency: 1 });
    redteamProviderManager.clearProvider();
    redteamProviderManager.setRateLimitRegistry(registry);
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
    redteamProviderManager.clearProvider();
    redteamProviderManager.setRateLimitRegistry(undefined);
    registry.dispose();
    for (const provider of providers.splice(0)) {
      await provider.cleanup?.();
    }
    await tracerProvider?.shutdown();
    trace.disable();
    context.disable();
    propagation.disable();
    vi.restoreAllMocks();
    vi.useRealTimers();
    restoreEnvironment();
  });

  it.each([1, 2])(
    'releases a live same-key strategy after an independently failed real Chat tool span with %i iterations',
    async (numIterations) => {
      const firstController = new AbortController();
      const secondController = new AbortController();
      controllers.push(firstController, secondController);
      const callbackStarted = createDeferred<void>();
      const finishCallback = createDeferred<void>();
      const toolCompleted = createDeferred<void>();
      drains.push(
        () => finishCallback.resolve(),
        () => toolCompleted.resolve(),
      );
      const events: string[] = [];
      const spans: { span: ReadableSpan; aborted: boolean }[] = [];
      const failure = Object.freeze(new Error('Downstream tool returned 429 rate limit'));
      const reason = Object.freeze(
        Object.assign(new Error('caller observed independent tool completion'), {
          name: 'AbortError',
        }),
      );
      const reasonDescriptors = Object.getOwnPropertyDescriptors(reason);
      const processor: SpanProcessor = {
        onStart() {},
        onEnd(span) {
          if (span.name === 'execute_tool lookup') {
            spans.push({ span, aborted: firstController.signal.aborted });
            events.push('tool span ended');
            // This processor only publishes completion. The application owns cancellation.
            toolCompleted.resolve();
          }
        },
        async forceFlush() {},
        async shutdown() {},
      };
      tracerProvider = new NodeTracerProvider({ spanProcessors: [processor] });
      tracerProvider.register();
      const policy = toolCompleted.promise.then(() => {
        events.push('caller abort');
        firstController.abort(reason);
      });
      pending.push(policy);
      const callback = vi.fn(async () => {
        expect(trace.getActiveSpan()?.isRecording()).toBe(true);
        expect(firstController.signal.aborted).toBe(false);
        callbackStarted.resolve();
        await finishCallback.promise;
        expect(firstController.signal.aborted).toBe(false);
        events.push('callback rejected');
        throw failure;
      });
      const laterCallback = vi.fn(() => 'unreachable later callback');
      async function chat(model: string, tools = false) {
        const provider = await loadApiProvider(`openai:chat:${model}`, {
          options: {
            config: {
              apiBaseUrl: 'https://selected-tool.fixture.test/v1',
              apiKey: 'fixture-key',
              maxRetries: 0,
              ...(tools
                ? { functionToolCallbacks: { lookup: callback, later: laterCallback } }
                : {}),
            },
          },
        });
        providers.push(provider);
        return provider;
      }
      const attackerA = await chat('fixture-attacker-a');
      const attackerB = await chat('fixture-attacker-b');
      const targetA = await chat('gpt-4o-mini', true);
      const targetB = await chat('gpt-4.1-mini');
      const targetCalls = vi.spyOn(targetA, 'callApi');
      const judge: ApiProvider = {
        id: () => 'fixture-independent-judge',
        callApi: vi.fn(async () => ({
          output: JSON.stringify({
            currentResponse: { rating: 1, explanation: 'Harmless response' },
            previousBestResponse: { rating: 0, explanation: 'No previous response' },
          }),
        })),
      };
      await redteamProviderManager.setGradingProvider(judge);
      const strategyA = new RedteamIterativeProvider({
        injectVar: 'attack',
        numIterations,
        redteamProvider: attackerA,
      });
      const strategyB = new RedteamIterativeProvider({
        injectVar: 'attack',
        numIterations: 1,
        redteamProvider: attackerB,
      });
      const outerKey = getRateLimitKey(strategyA);
      expect(getRateLimitKey(strategyB)).toBe(outerKey);
      const release = vi.spyOn(SlotQueue.prototype, 'release');
      const hits = vi.fn();
      const retries = vi.fn();
      registry.on('ratelimit:hit', hits);
      registry.on('request:retrying', retries);
      const dispatches: { model: string; at: number }[] = [];
      const usage = { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 };
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url !== 'https://selected-tool.fixture.test/v1/chat/completions') {
          throw new Error(`Unexpected fixture transport: ${url}`);
        }
        const { model } = JSON.parse(String(options?.body)) as { model: string };
        dispatches.push({ model, at: Date.now() });
        let message: Record<string, unknown>;
        if (model === 'gpt-4o-mini') {
          message = {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'lookup-call',
                type: 'function',
                function: { name: 'lookup', arguments: '{}' },
              },
              { id: 'later-call', type: 'function', function: { name: 'later', arguments: '{}' } },
            ],
          };
        } else if (model === 'fixture-attacker-a' || model === 'fixture-attacker-b') {
          message = {
            role: 'assistant',
            content: JSON.stringify({
              improvement: 'Use a harmless greeting',
              prompt: 'Say hello',
            }),
          };
        } else if (model === 'gpt-4.1-mini') {
          message = { role: 'assistant', content: 'Hello.' };
        } else {
          throw new Error(`Unexpected fixture model: ${model}`);
        }
        return new Response(
          JSON.stringify({
            choices: [{ message, finish_reason: model === 'gpt-4o-mini' ? 'tool_calls' : 'stop' }],
            usage,
          }),
          {
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'application/json', 'x-request-id': `fixture-${model}` },
          },
        );
      });
      function start(strategy: ApiProvider, target: ApiProvider, controller: AbortController) {
        const wrapped = wrapProviderWithRateLimiting(strategy, registry);
        const outcome = withCacheEnabled(false, () =>
          wrapped.callApi(
            '',
            {
              prompt: { raw: '{{attack}}', label: 'selected error fixture' },
              vars: { attack: 'Produce a harmless greeting' },
              originalProvider: wrapProviderWithRateLimiting(target, registry),
            },
            { abortSignal: controller.signal },
          ),
        ).then(
          (value: ProviderResponse) => ({ value, error: undefined }),
          (error: unknown) => ({ value: undefined, error }),
        );
        pending.push(outcome);
        return outcome;
      }
      const startedAt = Date.now();
      const first = trace
        .getTracer('selected-tool-fixture')
        .startActiveSpan('application caller', async (span) => {
          try {
            return await start(strategyA, targetA, firstController);
          } finally {
            span.end();
          }
        });
      pending.push(first);
      await callbackStarted.promise;
      const second = start(strategyB, targetB, secondController);
      expect(registry.getMetrics()[outerKey]).toMatchObject({ activeRequests: 1, queueDepth: 1 });
      expect(dispatches.map(({ model }) => model)).toEqual(['fixture-attacker-a', 'gpt-4o-mini']);
      finishCallback.resolve();
      const firstResult = await first;
      events.push('strategy returned');
      await policy;
      await vi.advanceTimersByTimeAsync(0);
      await setImmediate();

      // Assert physical B dispatch before awaiting its promise: a lost marker must
      // produce a finite RED rather than waiting through a fabricated minute of quota.
      expect(dispatches.filter(({ model }) => model === 'fixture-attacker-b')).toEqual([
        { model: 'fixture-attacker-b', at: startedAt },
      ]);
      const secondResult = await second;
      const actualTargetResult = await targetCalls.mock.results[0].value;
      expect(firstResult.error).toBeUndefined();
      expect(actualTargetResult.error).toContain(failure.message);
      expect(actualTargetResult.metadata).toMatchObject({
        errorOrigin: 'tool',
        http: { status: 200 },
      });
      expect(firstResult.value?.error).toBe(actualTargetResult.error);
      expect(firstResult.value?.metadata?.errorOrigin).toBe('tool');
      expect(firstResult.value?.metadata).not.toHaveProperty('http');
      expect(firstResult.value?.metadata).not.toHaveProperty('headers');
      expect(secondResult.error).toBeUndefined();
      expect(secondResult.value?.error).toBeUndefined();
      expect(secondResult.value?.output).toBe('Hello.');
      expect(secondResult.value?.metadata?.redteamHistory).toHaveLength(1);
      expect(secondResult.value?.metadata?.errorOrigin).toBeUndefined();
      expect(events).toEqual([
        'callback rejected',
        'tool span ended',
        'caller abort',
        'strategy returned',
      ]);
      expect(spans).toHaveLength(1);
      expect(spans[0].aborted).toBe(false);
      expect(spans[0].span.status).toEqual({
        code: SpanStatusCode.ERROR,
        message: failure.message,
      });
      expect(spans[0].span.attributes).toMatchObject({
        'tool.is_error': true,
        'error.type': 'Error',
      });
      expect(firstController.signal.reason).toBe(reason);
      expect(Object.getOwnPropertyDescriptors(reason)).toEqual(reasonDescriptors);
      expect(secondController.signal.aborted).toBe(false);
      expect(callback).toHaveBeenCalledOnce();
      expect(laterCallback).not.toHaveBeenCalled();
      expect(judge.callApi).toHaveBeenCalledOnce();
      expect(targetCalls).toHaveBeenCalledOnce();
      expect(globalThis.fetch).toHaveBeenCalledTimes(4);
      expect(hits).not.toHaveBeenCalled();
      expect(retries).not.toHaveBeenCalled();
      expect(registry.getMetrics()[outerKey]).toMatchObject({
        totalRequests: 2,
        completedRequests: 1,
        failedRequests: 1,
        activeRequests: 0,
        queueDepth: 0,
        rateLimitHits: 0,
        retriedRequests: 0,
      });
      expect(registry.getMetrics()[getRateLimitKey(targetA)]).toMatchObject({
        totalRequests: 1,
        completedRequests: 0,
        failedRequests: 1,
        activeRequests: 0,
        queueDepth: 0,
        rateLimitHits: 0,
        retriedRequests: 0,
      });
      expect(Object.keys(registry.getMetrics())).toHaveLength(6);
      for (const metrics of Object.values(registry.getMetrics())) {
        expect(metrics).toMatchObject({
          activeRequests: 0,
          queueDepth: 0,
          rateLimitHits: 0,
          retriedRequests: 0,
        });
      }
      expect(release).toHaveBeenCalledTimes(7);
      const releasesByQueue = new Map<unknown, number>();
      for (const queue of release.mock.contexts) {
        releasesByQueue.set(queue, (releasesByQueue.get(queue) ?? 0) + 1);
      }
      expect([...releasesByQueue.values()].sort()).toEqual([1, 1, 1, 1, 1, 2]);
      expect(getEventListeners(firstController.signal, 'abort')).toHaveLength(0);
      expect(getEventListeners(secondController.signal, 'abort')).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(['fresh', 'cached'] as const)(
    'retains the valid %s model response after a selected callback failure and caller cancellation',
    async (source) => {
      const controller = new AbortController();
      controllers.push(controller);
      const completed = createDeferred<void>();
      const failure = Object.freeze(new Error('Independent callback failed'));
      const reason = Object.freeze(
        Object.assign(new Error('Caller saw tool completion'), { name: 'AbortError' }),
      );
      let fail = false;
      const events: string[] = [];
      const processor: SpanProcessor = {
        onStart() {},
        onEnd(span) {
          if (span.name === 'execute_tool lookup' && span.status.code === SpanStatusCode.ERROR) {
            expect(controller.signal.aborted).toBe(false);
            events.push('tool ended');
            completed.resolve();
          }
        },
        async forceFlush() {},
        async shutdown() {},
      };
      tracerProvider = new NodeTracerProvider({ spanProcessors: [processor] });
      tracerProvider.register();
      const callback = vi.fn(async () => {
        if (fail) {
          events.push('callback failed');
          throw failure;
        }
        return 'Hello from tool.';
      });
      const target = await loadApiProvider('openai:chat:gpt-4o-mini', {
        options: {
          config: {
            apiBaseUrl: 'https://tool-cache-retention.fixture.test/v1',
            apiKey: 'fixture-key',
            maxRetries: 0,
            functionToolCallbacks: { lookup: callback },
          },
        },
      });
      providers.push(target);
      const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        expect(String(input)).toBe('https://tool-cache-retention.fixture.test/v1/chat/completions');
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: null,
                  tool_calls: [
                    {
                      id: 'call-lookup',
                      type: 'function',
                      function: { name: 'lookup', arguments: '{}' },
                    },
                  ],
                },
                finish_reason: 'tool_calls',
              },
            ],
            usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
          }),
          {
            headers: { 'content-type': 'application/json', 'x-request-id': 'tool-cache-fixture' },
          },
        );
      });
      const policy = completed.promise.then(() => {
        events.push('caller aborted');
        controller.abort(reason);
      });
      pending.push(policy);
      drains.push(() => completed.resolve());
      const wrapped = wrapProviderWithRateLimiting(target, registry);
      await withCacheNamespace(`selected-tool-cache-${source}`, () =>
        withCacheEnabled(true, async () => {
          if (source === 'cached') {
            const seed = await wrapped.callApi('Same harmless prompt');
            expect(seed.error).toBeUndefined();
          }
          fail = true;
          const selected = await trace
            .getTracer('cache-retention')
            .startActiveSpan('application', async (span) => {
              try {
                return await wrapped.callApi('Same harmless prompt', undefined, {
                  abortSignal: controller.signal,
                });
              } finally {
                span.end();
              }
            });
          await policy;
          expect(selected.error).toContain(failure.message);
          expect(selected.metadata).toMatchObject({
            errorOrigin: 'tool',
            http: { status: 200, headers: { 'x-request-id': 'tool-cache-fixture' } },
          });
          expect(selected.cached).toBe(source === 'cached');
          expect(selected.tokenUsage?.total).toBe(5);
          expect(events).toEqual(['callback failed', 'tool ended', 'caller aborted']);
          expect(controller.signal.reason).toBe(reason);
          fail = false;
          const survivor = await wrapped.callApi('Same harmless prompt', undefined, {
            abortSignal: new AbortController().signal,
          });
          expect(survivor.error).toBeUndefined();
          expect(survivor.output).toBe('Hello from tool.');
          expect(survivor.cached).toBe(true);
          expect(fetch).toHaveBeenCalledOnce();
          expect(callback).toHaveBeenCalledTimes(source === 'cached' ? 3 : 2);
        }),
      );
      for (const metrics of Object.values(registry.getMetrics())) {
        expect(metrics).toMatchObject({
          activeRequests: 0,
          queueDepth: 0,
          retriedRequests: 0,
          rateLimitHits: 0,
        });
      }
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
