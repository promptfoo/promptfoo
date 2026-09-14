import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCacheEnabled } from '../../src/cache';
import { runEval } from '../../src/evaluator';
import { loadApiProvider } from '../../src/providers';
import RedteamIterativeProvider from '../../src/redteam/providers/iterative';
import {
  callTargetProvider,
  getTargetResponse,
  redteamProviderManager,
} from '../../src/redteam/providers/shared';
import * as remoteGeneration from '../../src/redteam/remoteGeneration';
import { wrapProviderWithRateLimiting } from '../../src/scheduler/providerWrapper';
import { getRateLimitKey } from '../../src/scheduler/rateLimitKey';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import {
  composeResponseHeadersObservers,
  isResponseHeadersObserverErrorResponse,
} from '../../src/scheduler/responseHeadersObserver';
import { mockProcessEnv } from '../util/utils';

import type { ApiProvider, ProviderResponse } from '../../src/types/providers';

describe('selected caller observer error through real iterative evaluation', () => {
  let restoreEnvironment: () => void;
  let registry: RateLimitRegistry;
  const providers: ApiProvider[] = [];
  const controllers: AbortController[] = [];
  const pending: Promise<void>[] = [];

  beforeEach(() => {
    restoreEnvironment = mockProcessEnv({
      OPENAI_API_KEY: undefined,
      OPENAI_ORGANIZATION: undefined,
      PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: 'false',
      PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
      PROMPTFOO_DISABLE_TELEMETRY: 'true',
      PROMPTFOO_RETRY_5XX: 'false',
    });
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date('2026-09-11T15:20:00.000Z'));
    registry = new RateLimitRegistry({ maxConcurrency: 1, minConcurrency: 1 });
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
    vi.useRealTimers();
    restoreEnvironment();
  });

  it.each([
    { maxRetries: 0, origin: 'observer' },
    { maxRetries: 1, origin: 'observer' },
    { maxRetries: 1, origin: 'independent' },
    { maxRetries: 1, origin: 'success' },
  ])(
    'raw caller observer conversion: $origin, retries=$maxRetries',
    async ({ maxRetries, origin }) => {
      const failure = Object.freeze(new Error('metrics rate limit exceeded'));
      const descriptors = Object.getOwnPropertyDescriptors(failure);
      const observer = vi.fn(() => {
        if (origin === 'observer') {
          throw failure;
        }
      });
      const target: ApiProvider = {
        id: () => 'raw-selected-observer',
        config: { maxRetries },
        callApi: vi.fn(async (_prompt, _context, options) => {
          options?.onResponseHeaders?.({ 'ratelimit-limit': '10', 'ratelimit-remaining': '9' });
          if (origin === 'independent') {
            throw failure;
          }
          return { output: 'Hello.' };
        }),
      };
      const delegator: ApiProvider = {
        id: target.id,
        config: target.config,
        callApi: vi.fn((prompt, context, options) =>
          getTargetResponse(target, prompt, context, options),
        ),
      };
      expect(getRateLimitKey(delegator)).toBe(getRateLimitKey(target));
      let response: ProviderResponse | undefined;
      let rejection: unknown;
      const done = wrapProviderWithRateLimiting(delegator, registry)
        .callApi('Hello', undefined, {
          onResponseHeaders: observer,
        })
        .then(
          (value) => {
            response = value;
          },
          (error) => {
            rejection = error;
          },
        );
      pending.push(done);
      await vi.advanceTimersByTimeAsync(120000);
      await done;
      expect(target.callApi).toHaveBeenCalledTimes(origin === 'independent' ? 2 : 1);
      expect(observer).toHaveBeenCalledTimes(origin === 'independent' ? 2 : 1);
      if (origin === 'independent') {
        expect(rejection).toMatchObject({
          message: 'Rate limit exceeded for raw-selected-observer after 2 attempts',
        });
        expect(response).toBeUndefined();
      } else {
        expect(rejection).toBeUndefined();
        expect(response?.error).toBe(origin === 'observer' ? failure.message : undefined);
        if (origin === 'success') {
          expect(response?.output).toBe('Hello.');
        }
      }
      expect(isResponseHeadersObserverErrorResponse(response)).toBe(origin === 'observer');
      expect(Object.getOwnPropertyDescriptors(failure)).toEqual(descriptors);
      for (const metrics of Object.values(registry.getMetrics())) {
        expect(metrics).toMatchObject({ activeRequests: 0, queueDepth: 0 });
        if (origin !== 'independent') {
          expect(metrics).toMatchObject({ rateLimitHits: 0, retriedRequests: 0 });
        }
      }
    },
  );

  it.each([
    { label: 'selected observer error with zero retries', maxRetries: 0, throws: true },
    { label: 'selected observer error with a positive retry budget', maxRetries: 1, throws: true },
    {
      label: 'ordinary observer success with a positive retry budget',
      maxRetries: 1,
      throws: false,
    },
  ])('$label', async ({ maxRetries, throws }) => {
    const target = await loadApiProvider('openai:chat:gpt-4o-mini', {
      options: {
        config: {
          apiBaseUrl: 'https://selected-observer.fixture.test/v1',
          apiKey: 'harmless-fixture-key',
          maxRetries: 0,
        },
      },
    });
    providers.push(target);
    const failure = Object.freeze(new Error('metrics rate limit exceeded'));
    const descriptors = Object.getOwnPropertyDescriptors(failure);
    const observer = vi.fn(() => {
      if (throws) {
        throw failure;
      }
    });
    const rawResponses: ProviderResponse[] = [];
    const delegator: ApiProvider = {
      id: () => target.id(),
      config: target.config,
      callApi: vi.fn(async (prompt, context, options) => {
        const response = await callTargetProvider(target, prompt, context, {
          ...options,
          onResponseHeaders: options?.onResponseHeaders
            ? composeResponseHeadersObservers(options.onResponseHeaders, observer)
            : observer,
        });
        rawResponses.push(response);
        return response;
      }),
    };
    expect(getRateLimitKey(delegator)).toBe(getRateLimitKey(target));
    const attacker: ApiProvider = {
      id: () => 'harmless-observer-attacker',
      callApi: vi.fn(async () => ({
        output: JSON.stringify({ improvement: 'Greet', prompt: 'Hello' }),
      })),
    };
    const judge: ApiProvider = {
      id: () => 'harmless-observer-judge',
      callApi: vi.fn(async () => ({
        output: JSON.stringify({
          currentResponse: { rating: 1, explanation: 'Harmless greeting' },
          previousBestResponse: { rating: 0, explanation: 'No previous response' },
        }),
      })),
    };
    await redteamProviderManager.setGradingProvider(judge);
    const strategy = new RedteamIterativeProvider({
      injectVar: 'input',
      numIterations: 1,
      maxRetries,
      redteamProvider: attacker,
    });
    const targetRequests: unknown[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      expect(String(url)).toBe('https://selected-observer.fixture.test/v1/chat/completions');
      const body = JSON.parse(String(options?.body));
      expect(body.model).toBe('gpt-4o-mini');
      targetRequests.push(body);
      return new Response(
        JSON.stringify({
          choices: [{ message: { role: 'assistant', content: 'Hello.' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
        }),
        {
          headers: {
            'content-type': 'application/json',
            'ratelimit-limit': '10',
            'ratelimit-remaining': '9',
            'x-request-id': 'harmless-selected-observer',
          },
        },
      );
    });
    const retrying = vi.fn();
    registry.on('request:retrying', retrying);
    const controller = new AbortController();
    controllers.push(controller);
    let rows: Awaited<ReturnType<typeof runEval>> | undefined;
    const done = withCacheEnabled(false, () =>
      runEval({
        delay: 0,
        testIdx: 0,
        promptIdx: 0,
        repeatIndex: 0,
        isRedteam: false,
        provider: delegator,
        prompt: { raw: '{{input}}', label: 'harmless selected observer' },
        test: { provider: strategy, vars: { input: 'Hello' } },
        conversations: {},
        registers: {},
        abortSignal: controller.signal,
        rateLimitRegistry: registry,
      }),
    ).then((value) => {
      rows = value;
    });
    pending.push(done);
    // Let the unchanged positive retry policy finish in RED as well as GREEN.
    await vi.advanceTimersByTimeAsync(120000);
    await done;
    expect(rawResponses.length).toBeGreaterThan(0);
    for (const response of rawResponses) {
      expect(isResponseHeadersObserverErrorResponse(response)).toBe(throws);
      if (throws) {
        expect(response.error).toBe('API call error: Error: metrics rate limit exceeded');
      }
    }
    expect(targetRequests).toHaveLength(1);
    expect(observer).toHaveBeenCalledOnce();
    expect(delegator.callApi).toHaveBeenCalledOnce();
    expect(attacker.callApi).toHaveBeenCalledOnce();
    expect(retrying).not.toHaveBeenCalled();
    expect(rows).toHaveLength(1);
    if (throws) {
      expect(rows?.[0].success).toBe(false);
      expect(rows?.[0].response?.error).toBe('API call error: Error: metrics rate limit exceeded');
      expect(rows?.[0].response?.metadata).not.toHaveProperty('errorOrigin');
      expect(judge.callApi).not.toHaveBeenCalled();
    } else {
      expect(rows?.[0].success).toBe(true);
      expect(rows?.[0].response?.output).toBe('Hello.');
      expect(judge.callApi).toHaveBeenCalledOnce();
    }
    expect(controller.signal.aborted).toBe(false);
    expect(Object.getOwnPropertyDescriptors(failure)).toEqual(descriptors);
    for (const metrics of Object.values(registry.getMetrics())) {
      expect(metrics).toMatchObject({
        activeRequests: 0,
        queueDepth: 0,
        rateLimitHits: 0,
        retriedRequests: 0,
        totalRequests: 1,
      });
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([true, false])(
    'authoritative markup retains the actual selected Chat observer error: throws=%s',
    async (throws) => {
      vi.spyOn(remoteGeneration, 'neverGenerateRemote').mockReturnValue(false);
      vi.spyOn(remoteGeneration, 'getRemoteGenerationUrl').mockReturnValue(
        'https://markup-observer.fixture.test/generate',
      );
      const target = await loadApiProvider('openai:chat:gpt-4o-mini', {
        options: {
          config: {
            apiBaseUrl: 'https://markup-observer.fixture.test/v1',
            apiKey: 'fixture-key',
            maxRetries: 0,
          },
        },
      });
      providers.push(target);
      const failure = Object.freeze(new Error('metrics rate limit exceeded'));
      const descriptors = Object.getOwnPropertyDescriptors(failure);
      const observer = vi.fn(() => {
        if (throws) {
          throw failure;
        }
      });
      const rawResponses: ProviderResponse[] = [];
      const delegator: ApiProvider = {
        id: target.id.bind(target),
        config: target.config,
        callApi: vi.fn(async (prompt, context, options) => {
          const response = await callTargetProvider(target, prompt, context, {
            ...options,
            onResponseHeaders: options?.onResponseHeaders
              ? composeResponseHeadersObservers(options.onResponseHeaders, observer)
              : observer,
          });
          rawResponses.push(response);
          return response;
        }),
      };
      const strategy = await loadApiProvider('promptfoo:redteam:authoritative-markup-injection', {
        options: { config: { injectVar: 'input' } },
      });
      const strategyResponses: ProviderResponse[] = [];
      const callStrategy = strategy.callApi;
      vi.spyOn(strategy, 'callApi').mockImplementation(function (this: ApiProvider, ...args) {
        const result = callStrategy.apply(this, args);
        void result.then(
          (response) => {
            strategyResponses.push(response);
          },
          () => {},
        );
        return result;
      });
      expect(getRateLimitKey(delegator)).toBe(getRateLimitKey(target));
      expect(getRateLimitKey(strategy)).not.toBe(getRateLimitKey(target));
      let generationRequests = 0;
      let targetRequests = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
        if (String(url) === 'https://markup-observer.fixture.test/generate') {
          generationRequests++;
          expect(JSON.parse(String(options?.body)).task).toBe('authoritative-markup-injection');
          return new Response(
            JSON.stringify({
              message: { role: 'user', content: 'Hello' },
              tokenUsage: { prompt: 2, completion: 1, total: 3, numRequests: 1 },
            }),
            { headers: { 'content-type': 'application/json' } },
          );
        }
        expect(String(url)).toBe('https://markup-observer.fixture.test/v1/chat/completions');
        targetRequests++;
        return new Response(
          JSON.stringify({
            choices: [{ message: { role: 'assistant', content: 'Hello.' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
          }),
          { headers: { 'content-type': 'application/json' } },
        );
      });
      const controller = new AbortController();
      controllers.push(controller);
      let rows: Awaited<ReturnType<typeof runEval>> | undefined;
      const done = withCacheEnabled(false, () =>
        runEval({
          delay: 0,
          testIdx: 0,
          promptIdx: 0,
          repeatIndex: 0,
          isRedteam: false,
          provider: delegator,
          prompt: { raw: '{{input}}', label: 'harmless markup greeting' },
          test: { provider: strategy, vars: { input: 'Hello' } },
          conversations: {},
          registers: {},
          abortSignal: controller.signal,
          rateLimitRegistry: registry,
        }),
      ).then((value) => {
        rows = value;
      });
      pending.push(done);
      // Finish the existing default positive retry policy in RED as well as GREEN.
      await vi.advanceTimersByTimeAsync(300000);
      await done;
      expect(rawResponses.length).toBeGreaterThan(0);
      expect(
        rawResponses.every(
          (response) => isResponseHeadersObserverErrorResponse(response) === throws,
        ),
      ).toBe(true);
      expect(generationRequests).toBe(1);
      expect(targetRequests).toBe(1);
      expect(delegator.callApi).toHaveBeenCalledOnce();
      expect(observer).toHaveBeenCalledOnce();
      expect(rows).toHaveLength(1);
      expect(rows?.[0].response?.error).toBe(
        throws ? `API call error: ${String(failure)}` : undefined,
      );
      // The marker is private scheduler provenance, not part of normalized persisted rows.
      expect(strategyResponses).toHaveLength(1);
      expect(isResponseHeadersObserverErrorResponse(strategyResponses[0])).toBe(throws);
      expect(rows?.[0].response?.tokenUsage?.attacker).toMatchObject({ total: 3, numRequests: 1 });
      if (!throws) {
        expect(rows?.[0].response?.tokenUsage).toMatchObject({ total: 5, numRequests: 1 });
        expect(rows?.[0].response?.output).toBe('Hello.');
      }
      expect(Object.getOwnPropertyDescriptors(failure)).toEqual(descriptors);
      const metrics = Object.values(registry.getMetrics());
      expect(metrics).toHaveLength(2);
      expect(metrics).toMatchObject([
        {
          totalRequests: 1,
          rateLimitHits: 0,
          retriedRequests: 0,
          activeRequests: 0,
          queueDepth: 0,
        },
        {
          totalRequests: 1,
          rateLimitHits: 0,
          retriedRequests: 0,
          activeRequests: 0,
          queueDepth: 0,
        },
      ]);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
