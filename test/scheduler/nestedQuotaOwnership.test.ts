import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCacheEnabled } from '../../src/cache';
import { loadApiProvider } from '../../src/providers';
import RedteamIterativeProvider from '../../src/redteam/providers/iterative';
import { redteamProviderManager } from '../../src/redteam/providers/shared';
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
});
