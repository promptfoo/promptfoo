import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCacheEnabled } from '../../src/cache';
import { runEval } from '../../src/evaluator';
import { loadApiProvider } from '../../src/providers';
import RedteamIterativeProvider from '../../src/redteam/providers/iterative';
import { callTargetProvider, redteamProviderManager } from '../../src/redteam/providers/shared';
import {
  isRateLimitWrapped,
  wrapProviderWithRateLimiting,
} from '../../src/scheduler/providerWrapper';
import { getRateLimitKey } from '../../src/scheduler/rateLimitKey';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { mockProcessEnv } from '../util/utils';

import type {
  ApiProvider,
  CallApiContextParams,
  ProviderResponse,
} from '../../src/types/providers';

const modelIds = {
  attackerA: 'fixture-attacker-a',
  attackerB: 'fixture-attacker-b',
  judgeA: 'fixture-judge-a',
  judgeB: 'fixture-judge-b',
};
const usage = { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 };

describe('actual iterative manager child quota ownership', () => {
  let restoreEnvironment: () => void;
  let registry: RateLimitRegistry;
  const providers: ApiProvider[] = [];
  const controllers: AbortController[] = [];
  const pending: Promise<void>[] = [];

  beforeEach(() => {
    restoreEnvironment = mockProcessEnv({
      OPENAI_API_KEY: 'fixture-key',
      PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: 'false',
      PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
      PROMPTFOO_RETRY_5XX: 'false',
    });
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date('2026-09-10T18:00:00.000Z'));
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected fixture transport'));
    registry = new RateLimitRegistry({ maxConcurrency: 1 });
    redteamProviderManager.clearProvider();
    redteamProviderManager.setRateLimitRegistry(registry);
  });

  afterEach(async () => {
    for (const controller of controllers.splice(0)) {
      controller.abort();
    }
    await vi.advanceTimersByTimeAsync(0);
    await Promise.all(pending.splice(0));
    redteamProviderManager.clearProvider();
    redteamProviderManager.setRateLimitRegistry(undefined);
    registry.dispose();
    for (const provider of providers.splice(0)) {
      await provider.cleanup?.();
    }
    vi.restoreAllMocks();
    restoreEnvironment();
    vi.useRealTimers();
  });

  async function chat(model: string) {
    const provider = await loadApiProvider(`openai:chat:${model}`, {
      options: {
        config: {
          apiBaseUrl: 'https://nested-quota.fixture.test/v1',
          apiKey: 'fixture-key',
          maxRetries: 0,
        },
      },
    });
    providers.push(provider);
    return provider;
  }

  function start(provider: ApiProvider, prompt: string, context?: CallApiContextParams) {
    const controller = new AbortController();
    controllers.push(controller);
    const state: { settled: boolean; value?: ProviderResponse; error?: unknown } = {
      settled: false,
    };
    const done = withCacheEnabled(false, () =>
      provider.callApi(prompt, context, {
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
    return { state, done, controller };
  }

  it.each(['attacker', 'judge'] as const)(
    'keeps a completed %s quota on its child pool while another iterative strategy starts',
    async (origin) => {
      const attackerA = await chat(modelIds.attackerA);
      const attackerB = await chat(modelIds.attackerB);
      const judgeA = await chat(modelIds.judgeA);
      const judgeB = await chat(modelIds.judgeB);
      const quotaChild = origin === 'attacker' ? attackerA : judgeA;
      const quotaModel = origin === 'attacker' ? modelIds.attackerA : modelIds.judgeA;
      const nextJudge = origin === 'judge' ? judgeB : judgeA;
      const target: ApiProvider = {
        id: () => 'fixture-harmless-target',
        callApi: vi.fn(async () => ({ output: 'Hello.' })),
      };
      const context = (): CallApiContextParams => ({
        prompt: { raw: '{{attack}}', label: 'nested iterative fixture' },
        vars: { attack: 'Produce a harmless greeting' },
        originalProvider: target,
      });
      await redteamProviderManager.setGradingProvider(judgeA);
      const strategyA = new RedteamIterativeProvider({
        injectVar: 'attack',
        numIterations: 1,
        redteamProvider: attackerA,
      });
      const strategyB = new RedteamIterativeProvider({
        injectVar: 'attack',
        numIterations: 1,
        redteamProvider: attackerB,
      });
      const outerKey = getRateLimitKey(strategyA);
      const childKey = getRateLimitKey(quotaChild);
      expect(getRateLimitKey(strategyB)).toBe(outerKey);
      expect(getRateLimitKey(attackerA)).not.toBe(getRateLimitKey(attackerB));
      expect(getRateLimitKey(judgeA)).not.toBe(getRateLimitKey(judgeB));
      expect(childKey).not.toBe(outerKey);
      const wrappedA = wrapProviderWithRateLimiting(strategyA, registry);
      const wrappedB = wrapProviderWithRateLimiting(strategyB, registry);
      const learnedKeys: string[] = [];
      const retrying = vi.fn();
      registry.on('ratelimit:learned', ({ rateLimitKey }) => learnedKeys.push(rateLimitKey));
      registry.on('request:retrying', retrying);
      const dispatches: { model: string; at: number }[] = [];
      let quotaResponseAt: number | undefined;
      vi.mocked(globalThis.fetch).mockImplementation(async (_url, options) => {
        const { model } = JSON.parse(String(options?.body)) as { model: string };
        const firstForModel = !dispatches.some((request) => request.model === model);
        dispatches.push({ model, at: Date.now() });
        if (!Object.values(modelIds).includes(model)) {
          throw new Error(`Unexpected fixture model: ${model}`);
        }
        const publishesQuota = model === quotaModel && firstForModel;
        if (publishesQuota) {
          quotaResponseAt = Date.now();
        }
        const output = model.startsWith('fixture-attacker')
          ? { improvement: 'Use a harmless greeting', prompt: `Say hello from ${model}` }
          : {
              currentResponse: { rating: 1, explanation: 'Harmless fixture response' },
              previousBestResponse: { rating: 0, explanation: 'No previous response' },
            };
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: { role: 'assistant', content: JSON.stringify(output) },
                finish_reason: 'stop',
              },
            ],
            usage,
          }),
          {
            status: 200,
            statusText: 'OK',
            headers: {
              'content-type': 'application/json',
              ...(publishesQuota
                ? {
                    'ratelimit-limit': '10',
                    'ratelimit-remaining': '0',
                    'ratelimit-reset': '60',
                  }
                : {}),
            },
          },
        );
      });

      const startedAt = Date.now();
      const first = start(wrappedA, '', context());
      await first.done;
      expect(first.state.error).toBeUndefined();
      expect(first.state.value?.output).toBe('Hello.');
      expect(first.state.value?.metadata?.redteamHistory).toHaveLength(1);
      expect(quotaResponseAt).toBe(startedAt);
      const resetAt = startedAt + 60000;
      expect(dispatches).toEqual([
        { model: modelIds.attackerA, at: startedAt },
        { model: modelIds.judgeA, at: startedAt },
      ]);

      // B is admitted later than the quota observation. The deadline must stay
      // absolute: the selected child waits 59.5 seconds from here, not a new minute.
      await vi.advanceTimersByTimeAsync(500);
      await redteamProviderManager.setGradingProvider(nextJudge);
      const managedQuotaChild =
        origin === 'attacker'
          ? await redteamProviderManager.getProvider({ provider: quotaChild })
          : await redteamProviderManager.getGradingProvider({ provider: quotaChild });
      expect(isRateLimitWrapped(managedQuotaChild)).toBe(true);
      expect(getRateLimitKey(managedQuotaChild)).toBe(childKey);
      const childFollowup = start(managedQuotaChild, 'Independent follow-up to the limited child');
      expect(registry.getMetrics()[childKey]).toMatchObject({
        activeRequests: 0,
        queueDepth: 1,
        totalRequests: 2,
        completedRequests: 1,
      });
      const second = start(wrappedB, '', context());
      await vi.advanceTimersByTimeAsync(0);
      // This fails before fix while the actual outer queue still blocks B.
      // Do not await a queued B until its real attacker dispatch is established.
      expect(dispatches.filter(({ model }) => model === modelIds.attackerB)).toEqual([
        { model: modelIds.attackerB, at: startedAt + 500 },
      ]);
      await second.done;
      expect(second.state.error).toBeUndefined();
      expect(second.state.value?.output).toBe('Hello.');
      expect(second.state.value?.metadata?.redteamHistory).toHaveLength(1);
      expect(second.controller.signal.aborted).toBe(false);
      expect(target.callApi).toHaveBeenCalledTimes(2);
      expect(childFollowup.state.settled).toBe(false);
      expect(learnedKeys).toEqual([childKey]);
      expect(registry.getMetrics()[outerKey]).toMatchObject({
        activeRequests: 0,
        queueDepth: 0,
        totalRequests: 2,
        completedRequests: 2,
        failedRequests: 0,
        retriedRequests: 0,
      });
      expect(registry.getMetrics()[childKey]).toMatchObject({
        activeRequests: 0,
        queueDepth: 1,
        completedRequests: 1,
        retriedRequests: 0,
      });
      expect(dispatches.filter(({ model }) => model === quotaModel)).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(resetAt - Date.now() - 1);
      expect(childFollowup.state.settled).toBe(false);
      expect(dispatches.filter(({ model }) => model === quotaModel)).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      await childFollowup.done;
      expect(childFollowup.state.error).toBeUndefined();
      expect(childFollowup.state.value).not.toHaveProperty('error');
      expect(dispatches.filter(({ model }) => model === quotaModel)).toEqual([
        { model: quotaModel, at: startedAt },
        { model: quotaModel, at: resetAt },
      ]);
      expect(registry.getMetrics()[childKey]).toMatchObject({
        activeRequests: 0,
        queueDepth: 0,
        totalRequests: 2,
        completedRequests: 2,
        failedRequests: 0,
        retriedRequests: 0,
      });
      const expectedKeys = [
        outerKey,
        getRateLimitKey(attackerA),
        getRateLimitKey(attackerB),
        getRateLimitKey(judgeA),
      ];
      if (origin === 'judge') {
        expectedKeys.push(getRateLimitKey(judgeB));
      }
      expect(Object.keys(registry.getMetrics()).sort()).toEqual(expectedKeys.sort());
      for (const metrics of Object.values(registry.getMetrics())) {
        expect(metrics).toMatchObject({
          activeRequests: 0,
          queueDepth: 0,
          failedRequests: 0,
          retriedRequests: 0,
        });
      }
      expect(retrying).not.toHaveBeenCalled();
      expect(globalThis.fetch).toHaveBeenCalledTimes(5);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(['raw target', 'stale manager registry', 'already wrapped target', 'disabled'] as const)(
    'owns actual evaluator target quota with %s',
    async (mode) => {
      const staleRegistry = new RateLimitRegistry({ maxConcurrency: 1 });
      if (mode === 'disabled') {
        vi.stubEnv('PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER', 'true');
        registry.dispose();
        registry = new RateLimitRegistry({ maxConcurrency: 1 });
      }
      if (mode === 'stale manager registry') {
        redteamProviderManager.setRateLimitRegistry(staleRegistry);
      }
      const targetA = await chat('fixture-target-a');
      const targetB = await chat('fixture-target-b');
      const attacker: ApiProvider = {
        id: () => 'harmless-fixture-attacker',
        callApi: async () => ({
          output: JSON.stringify({ improvement: 'Use a greeting', prompt: 'Say hello.' }),
        }),
      };
      await redteamProviderManager.setGradingProvider({
        id: () => 'harmless-fixture-judge',
        callApi: async () => ({
          output: JSON.stringify({
            currentResponse: { rating: 1, explanation: 'Harmless greeting' },
            previousBestResponse: { rating: 0, explanation: 'No previous response' },
          }),
        }),
      });
      const strategy = () =>
        new RedteamIterativeProvider({
          injectVar: 'attack',
          numIterations: 1,
          redteamProvider: attacker,
        });
      const strategyA = strategy();
      const strategyB = strategy();
      const strategyKey = getRateLimitKey(strategyA);
      const targetKey = getRateLimitKey(targetA);
      expect(getRateLimitKey(strategyB)).toBe(strategyKey);
      expect(targetKey).not.toBe(getRateLimitKey(targetB));
      const learned: string[] = [];
      registry.on('ratelimit:learned', ({ rateLimitKey }) => learned.push(rateLimitKey));
      const requests: { model: string; at: number }[] = [];
      const startedAt = Date.now();
      vi.mocked(globalThis.fetch).mockImplementation(async (_url, options) => {
        const { model } = JSON.parse(String(options?.body)) as { model: string };
        const firstA = model === 'fixture-target-a' && !requests.some((r) => r.model === model);
        expect(['fixture-target-a', 'fixture-target-b']).toContain(model);
        requests.push({ model, at: Date.now() });
        return new Response(
          JSON.stringify({
            choices: [{ message: { role: 'assistant', content: 'Hello.' }, finish_reason: 'stop' }],
            usage,
          }),
          {
            headers: {
              'content-type': 'application/json',
              ...(firstA
                ? { 'ratelimit-limit': '10', 'ratelimit-remaining': '0', 'ratelimit-reset': '60' }
                : {}),
            },
          },
        );
      });
      function evaluate(target: ApiProvider, active: ApiProvider) {
        const controller = new AbortController();
        controllers.push(controller);
        const state: { rows?: Awaited<ReturnType<typeof runEval>> } = {};
        const done = withCacheEnabled(false, () =>
          runEval({
            delay: 0,
            testIdx: 0,
            promptIdx: 0,
            repeatIndex: 0,
            isRedteam: false,
            provider:
              mode === 'already wrapped target'
                ? wrapProviderWithRateLimiting(target, registry)
                : target,
            prompt: { raw: '{{attack}}', label: 'harmless target quota' },
            test: { provider: active, vars: { attack: 'Produce a greeting' } },
            conversations: {},
            registers: {},
            abortSignal: controller.signal,
            rateLimitRegistry: registry,
          }),
        ).then((rows) => {
          state.rows = rows;
        });
        pending.push(done);
        return { state, done };
      }
      try {
        const first = evaluate(targetA, strategyA);
        await first.done;
        expect(first.state.rows?.[0].success).toBe(true);
        expect(first.state.rows?.[0].response?.output).toBe('Hello.');
        expect(requests).toEqual([{ model: 'fixture-target-a', at: startedAt }]);
        await vi.advanceTimersByTimeAsync(500);
        const followup = start(wrapProviderWithRateLimiting(targetA, registry), 'Another greeting');
        const second = evaluate(targetB, strategyB);
        await vi.advanceTimersByTimeAsync(0);
        // Check the actual B transport before awaiting its potentially blocked strategy pool.
        expect(requests.filter((r) => r.model === 'fixture-target-b')).toEqual([
          { model: 'fixture-target-b', at: startedAt + 500 },
        ]);
        await second.done;
        expect(second.state.rows?.[0].success).toBe(true);
        expect(second.state.rows?.[0].response?.output).toBe('Hello.');
        if (mode === 'disabled') {
          await followup.done;
          expect(learned).toEqual([]);
          expect(registry.getMetrics()).toEqual({});
          expect(requests.filter((r) => r.model === 'fixture-target-a')).toEqual([
            { model: 'fixture-target-a', at: startedAt },
            { model: 'fixture-target-a', at: startedAt + 500 },
          ]);
        } else {
          expect(learned).toEqual([targetKey]);
          expect(followup.state.settled).toBe(false);
          expect(registry.getMetrics()[targetKey]).toMatchObject({
            completedRequests: 1,
            queueDepth: 1,
          });
          expect(registry.getMetrics()[strategyKey]).toMatchObject({
            completedRequests: 2,
            activeRequests: 0,
            queueDepth: 0,
          });
          await vi.advanceTimersByTimeAsync(59499);
          expect(followup.state.settled).toBe(false);
          await vi.advanceTimersByTimeAsync(1);
          await followup.done;
          expect(followup.state.error).toBeUndefined();
          expect(requests.filter((r) => r.model === 'fixture-target-a')).toEqual([
            { model: 'fixture-target-a', at: startedAt },
            { model: 'fixture-target-a', at: startedAt + 60000 },
          ]);
          expect(staleRegistry.getMetrics()).not.toHaveProperty(targetKey);
        }
        expect(globalThis.fetch).toHaveBeenCalledTimes(3);
        for (const metrics of Object.values(registry.getMetrics())) {
          expect(metrics).toMatchObject({
            activeRequests: 0,
            queueDepth: 0,
            failedRequests: 0,
            retriedRequests: 0,
          });
        }
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        for (const controller of controllers) {
          controller.abort();
        }
        await vi.advanceTimersByTimeAsync(0);
        await Promise.all(pending);
        staleRegistry.dispose();
        vi.unstubAllEnvs();
      }
    },
  );

  it('reuses an evaluator-owned same-pool slot when its raw target delegates', async () => {
    const target = await chat('fixture-same-pool-target');
    const explicit = vi.fn();
    const delegated: ApiProvider = {
      id: () => target.id(),
      config: target.config,
      callApi: (prompt, context, options) =>
        callTargetProvider(target, prompt, context, {
          ...options,
          onResponseHeaders: (headers, backoff) => {
            options?.onResponseHeaders?.(headers, backoff);
            explicit(headers, backoff);
          },
        }),
    };
    const controller = new AbortController();
    controllers.push(controller);
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { role: 'assistant', content: 'Hello.' }, finish_reason: 'stop' }],
          usage,
        }),
        {
          headers: {
            'content-type': 'application/json',
            'ratelimit-limit': '10',
            'ratelimit-remaining': '9',
          },
        },
      ),
    );
    let rows: Awaited<ReturnType<typeof runEval>> | undefined;
    const done = withCacheEnabled(false, () =>
      runEval({
        delay: 0,
        testIdx: 0,
        promptIdx: 0,
        repeatIndex: 0,
        isRedteam: false,
        provider: target,
        prompt: { raw: 'Hello', label: 'same pool' },
        test: { provider: delegated },
        conversations: {},
        registers: {},
        abortSignal: controller.signal,
        rateLimitRegistry: registry,
      }),
    ).then((result) => {
      rows = result;
    });
    pending.push(done);
    await vi.advanceTimersByTimeAsync(0);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    await done;
    expect(rows?.[0].success).toBe(true);
    expect(rows?.[0].response?.output).toBe('Hello.');
    expect(explicit).toHaveBeenCalledOnce();
    expect(Object.values(registry.getMetrics())).toMatchObject([
      { totalRequests: 1, completedRequests: 1, activeRequests: 0, queueDepth: 0 },
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
