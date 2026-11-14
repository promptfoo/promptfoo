import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCacheEnabled } from '../../src/cache';
import { matchesLlmRubric } from '../../src/matchers/llmGrading';
import { callProviderWithContext } from '../../src/matchers/providers';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import {
  withProviderCallExecutionContext,
  withProviderCallTracingContext,
} from '../../src/scheduler/providerCallExecutionContext';
import { wrapProviderWithRateLimiting } from '../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { SlotQueue } from '../../src/scheduler/slotQueue';
import { createDeferred, mockProcessEnv } from '../util/utils';

import type { ProviderCallTracingContext } from '../../src/scheduler/providerCallExecutionContext';
import type { ApiProvider, CallApiContextParams } from '../../src/types/providers';

const traceparent = '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01';
const usage = { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 };
const grade = { pass: true, score: 1, reason: 'local grader accepted B' };
const responseHeaders = { 'content-type': 'application/json', 'x-request-id': 'grader-fixture' };
const successPayload = {
  choices: [
    {
      message: { role: 'assistant', content: JSON.stringify(grade) },
      finish_reason: 'stop',
    },
  ],
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
const callerContext: CallApiContextParams = {
  prompt: { raw: 'target prompt', label: 'target' },
  vars: { source: 'caller' },
  evaluationId: 'grader-quota-eval',
  testIdx: 7,
  promptIdx: 2,
  repeatIndex: 1,
};

function createTracingRoute(traced: boolean) {
  // Exercise the real tracing context with an injected child-context hook that
  // delegates to the real provider, without replacing its result.
  const providerSpan = vi.fn<ProviderCallTracingContext['withProviderSpan']>(
    async ({ callContext }, invoke) => invoke({ ...callContext!, traceparent }),
  );
  return {
    providerSpan,
    run<T>(invoke: () => Promise<T>): Promise<T> {
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
  };
}

function runGrade(
  provider: ApiProvider,
  output: string,
  signal: AbortSignal,
  registry: RateLimitRegistry | undefined,
  tracing: ReturnType<typeof createTracingRoute>,
) {
  return withCacheEnabled(false, () =>
    withProviderCallExecutionContext({ abortSignal: signal, rateLimitRegistry: registry }, () =>
      tracing.run(() =>
        matchesLlmRubric(
          'must satisfy the rubric',
          output,
          { provider, rubricPrompt: 'Grade {{output}} against {{rubric}}.' },
          { marker: 'kept grading variable' },
          undefined,
          undefined,
          callerContext,
        ),
      ),
    ),
  );
}

describe('completed quota from a configured local Chat grader', () => {
  const registries: RateLimitRegistry[] = [];
  const providers: OpenAiChatCompletionProvider[] = [];
  const pendingCleanups: Array<() => Promise<void>> = [];
  let restoreEnvironment: () => void;

  function createRegistry() {
    const registry = new RateLimitRegistry({ maxConcurrency: 1 });
    registries.push(registry);
    return registry;
  }

  function createGrader(callback?: () => Promise<string>) {
    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: {
        apiBaseUrl: 'https://grader-quota.fixture.test/v1',
        apiKey: 'fixture-key',
        maxRetries: 3,
        ...(callback ? { functionToolCallbacks: { held: callback } } : {}),
      },
    });
    providers.push(provider);
    return provider;
  }

  beforeEach(() => {
    restoreEnvironment = mockProcessEnv({
      OPENAI_API_KEY: 'fixture-key',
      PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: 'false',
      PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
      PROMPTFOO_RETRY_5XX: 'false',
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-09T12:00:00.000Z'));
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected fixture request'));
  });

  afterEach(async () => {
    for (const cleanup of pendingCleanups.splice(0)) {
      await cleanup();
    }
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
    { traced: false, wrapped: false },
    { traced: true, wrapped: false },
    { traced: false, wrapped: true },
    { traced: true, wrapped: true },
  ])(
    'holds a queued grader until reset after A times out (traced=$traced, wrapped=$wrapped)',
    async ({ traced, wrapped }) => {
      const started = createDeferred<void>();
      const callbackResult = createDeferred<string>();
      const events: string[] = [];
      const callback = vi.fn(() => {
        events.push('A callback started');
        started.resolve();
        return callbackResult.promise;
      });
      const target = createGrader(callback);
      const callApi = vi.spyOn(target, 'callApi');
      const registry = createRegistry();
      // A separate contextual registry makes accidental double scheduling visible.
      const contextRegistry = wrapped ? createRegistry() : registry;
      const provider = wrapped ? wrapProviderWithRateLimiting(target, registry) : target;
      const tracing = createTracingRoute(traced);
      const firstController = new AbortController();
      const secondController = new AbortController();
      const reason = Object.freeze(
        Object.assign(new Error('grader A timed out'), {
          name: traced ? 'AbortException' : 'AbortError',
        }),
      );
      const release = vi.spyOn(SlotQueue.prototype, 'release');
      const updateQuota = vi.spyOn(SlotQueue.prototype, 'updateRateLimitState');
      const learned = vi.fn();
      const retrying = vi.fn();
      registry.on('ratelimit:learned', learned);
      registry.on('request:retrying', retrying);
      const resetAt = Date.now() + 1500;
      let secondDispatchAt: number | undefined;
      const response = new Response(JSON.stringify(toolPayload), {
        status: 200,
        statusText: 'OK',
        headers: {
          ...responseHeaders,
          'ratelimit-limit': '10',
          'ratelimit-remaining': '0',
          'ratelimit-reset': new Date(resetAt).toISOString(),
        },
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
          secondDispatchAt = Date.now();
          events.push('B dispatched');
          return new Response(JSON.stringify(successPayload), {
            statusText: 'OK',
            headers: responseHeaders,
          });
        });

      let firstSettled = false;
      const first = runGrade(provider, 'A answer', firstController.signal, contextRegistry, tracing)
        .catch((error: unknown) => error)
        .then((result) => {
          firstSettled = true;
          return result;
        });
      pendingCleanups.push(async () => {
        firstController.abort(reason);
        callbackResult.resolve(JSON.stringify({ pass: true, score: 1, reason: 'cleanup' }));
        await first;
      });
      setTimeout(() => {
        events.push('A timeout');
        firstController.abort(reason);
      }, 1000);
      await started.promise;
      expect(events).toEqual(['A dispatched', 'A body complete', 'A callback started']);
      expect(response.bodyUsed).toBe(true);
      await vi.advanceTimersByTimeAsync(1000);
      expect(firstController.signal.reason).toBe(reason);
      expect(firstSettled).toBe(true);
      expect(await first).toBe(reason);

      const second = runGrade(
        provider,
        'B answer',
        secondController.signal,
        contextRegistry,
        tracing,
      ).then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      await vi.advanceTimersByTimeAsync(0);
      expect(Object.values(registry.getMetrics())).toHaveLength(1);
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        activeRequests: 0,
        queueDepth: 1,
        totalRequests: 2,
      });
      events.push('B queued');
      expect(secondController.signal.aborted).toBe(false);
      expect(release).toHaveBeenCalledOnce();

      expect(events).toEqual([
        'A dispatched',
        'A body complete',
        'A callback started',
        'A timeout',
        'B queued',
      ]);
      expect(globalThis.fetch).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledOnce();
      expect(release).toHaveBeenCalledOnce();
      expect(learned).toHaveBeenCalledOnce();
      expect(updateQuota).toHaveBeenCalledOnce();
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        activeRequests: 0,
        queueDepth: 1,
        completedRequests: 0,
        failedRequests: 1,
        retriedRequests: 0,
        rateLimitHits: 0,
        avgLatencyMs: 1000,
      });

      await vi.advanceTimersByTimeAsync(499);
      expect(globalThis.fetch).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(1);
      await expect(second).resolves.toMatchObject({
        value: {
          ...grade,
          tokensUsed: { total: 5, prompt: 2, completion: 3, numRequests: 1 },
          metadata: {
            renderedGradingPrompt: 'Grade B answer against must satisfy the rubric.',
            http: { status: 200, statusText: 'OK', headers: responseHeaders },
          },
        },
      });
      expect(secondDispatchAt).toBe(resetAt);
      expect(events).not.toContain('A callback settled');
      events.push('A callback settled');
      callbackResult.resolve(JSON.stringify({ pass: true, score: 1, reason: 'A settled' }));
      await vi.advanceTimersByTimeAsync(0);
      expect(await first).toBe(reason);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(release).toHaveBeenCalledTimes(2);
      expect(updateQuota).toHaveBeenCalledTimes(2);
      expect(learned).toHaveBeenCalledOnce();
      expect(retrying).not.toHaveBeenCalled();
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        activeRequests: 0,
        queueDepth: 0,
        totalRequests: 2,
        completedRequests: 1,
        failedRequests: 1,
        retriedRequests: 0,
        avgLatencyMs: 500,
      });
      if (wrapped) {
        expect(contextRegistry.getMetrics()).toEqual({});
      }
      for (const [index, signal] of [firstController.signal, secondController.signal].entries()) {
        expect(callApi.mock.calls[index][1]).toMatchObject({
          evaluationId: callerContext.evaluationId,
          testIdx: callerContext.testIdx,
          promptIdx: callerContext.promptIdx,
          repeatIndex: callerContext.repeatIndex,
          prompt: { label: 'llm-rubric' },
          vars: { marker: 'kept grading variable', rubric: 'must satisfy the rubric' },
          ...(traced ? { traceparent } : {}),
        });
        expect(callApi.mock.calls[index][2]?.abortSignal).toBe(signal);
      }
      expect(tracing.providerSpan).toHaveBeenCalledTimes(traced ? 2 : 0);
      if (traced) {
        expect(tracing.providerSpan).toHaveBeenCalledWith(
          expect.objectContaining({ provider, role: 'grader', promptLabel: 'llm-rubric' }),
          expect.any(Function),
        );
      }
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each([
    { mode: 'direct', traced: false },
    { mode: 'direct', traced: true },
    { mode: 'disabled', traced: false },
    { mode: 'disabled', traced: true },
  ] as const)(
    'preserves the unscheduled grader path (mode=$mode, traced=$traced)',
    async ({ mode, traced }) => {
      if (mode === 'disabled') {
        vi.stubEnv('PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER', 'true');
      }
      const started = createDeferred<void>();
      const callbackResult = createDeferred<string>();
      const callback = vi.fn(() => {
        started.resolve();
        return callbackResult.promise;
      });
      const target = createGrader(callback);
      const callApi = vi.spyOn(target, 'callApi');
      const registry = mode === 'disabled' ? createRegistry() : undefined;
      const tracing = createTracingRoute(traced);
      const controller = new AbortController();
      const secondController = new AbortController();
      const reason = Object.freeze(
        Object.assign(new Error('direct grader timeout'), { name: 'AbortError' }),
      );
      const release = vi.spyOn(SlotQueue.prototype, 'release');
      const updateQuota = vi.spyOn(SlotQueue.prototype, 'updateRateLimitState');
      let secondDispatchAt: number | undefined;
      vi.mocked(globalThis.fetch)
        .mockResolvedValueOnce(
          new Response(JSON.stringify(toolPayload), {
            headers: {
              ...responseHeaders,
              'ratelimit-remaining': '0',
              'ratelimit-reset': new Date(Date.now() + 1500).toISOString(),
            },
          }),
        )
        .mockImplementationOnce(async () => {
          secondDispatchAt = Date.now();
          return new Response(JSON.stringify(successPayload), { headers: responseHeaders });
        });
      const first = runGrade(target, 'A answer', controller.signal, registry, tracing).catch(
        (error: unknown) => error,
      );
      await started.promise;
      await vi.advanceTimersByTimeAsync(1000);
      controller.abort(reason);
      const second = runGrade(target, 'B answer', secondController.signal, registry, tracing);
      await vi.advanceTimersByTimeAsync(0);
      await expect(second).resolves.toMatchObject(grade);
      expect(secondDispatchAt).toBe(Date.now());
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(100);
      callbackResult.resolve(JSON.stringify(grade));
      await expect(first).resolves.toBe(reason);
      expect(callback).toHaveBeenCalledOnce();
      expect(release).not.toHaveBeenCalled();
      expect(updateQuota).not.toHaveBeenCalled();
      expect(registry?.getMetrics() ?? {}).toEqual({});
      expect(callApi.mock.calls[0][2]).toEqual({ abortSignal: controller.signal });
      expect(callApi.mock.calls[1][2]).toEqual({ abortSignal: secondController.signal });
      expect(tracing.providerSpan).toHaveBeenCalledTimes(traced ? 2 : 0);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each([false, true])(
    'keeps the two-argument direct provider invocation without a signal or observer (traced=%s)',
    async (traced) => {
      const target = createGrader();
      const callApi = vi.spyOn(target, 'callApi');
      const tracing = createTracingRoute(traced);
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(successPayload), { headers: responseHeaders }),
      );

      await expect(
        withCacheEnabled(false, () =>
          tracing.run(() =>
            callProviderWithContext(
              target,
              'direct grade',
              'rubric',
              { marker: 'kept' },
              callerContext,
            ),
          ),
        ),
      ).resolves.toMatchObject({ output: JSON.stringify(grade) });

      expect(callApi).toHaveBeenCalledOnce();
      expect(callApi.mock.calls[0]).toHaveLength(2);
      expect(callApi.mock.calls[0][1]).toMatchObject({
        ...callerContext,
        prompt: { raw: 'direct grade', label: 'rubric' },
        vars: { marker: 'kept' },
        ...(traced ? { traceparent } : {}),
      });
      expect(globalThis.fetch).toHaveBeenCalledOnce();
      expect(tracing.providerSpan).toHaveBeenCalledTimes(traced ? 1 : 0);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
