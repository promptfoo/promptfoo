import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache, enableCache } from '../../src/cache';
import { runEval } from '../../src/evaluator';
import { matchesClassification } from '../../src/matchers/classification';
import { TypeSafeProvider } from '../../src/providers/typesafe';
import { withProviderCallExecutionContext } from '../../src/scheduler/providerCallExecutionContext';
import { createProviderRateLimitOptions } from '../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { ResultFailureReason } from '../../src/types/index';
import { clearAgentCache } from '../../src/util/fetch/index';
import { createDeferred, mockProcessEnv } from '../util/utils';

import type { TypeSafeConfig } from '../../src/providers/typesafe';

// Keep the cache, response parsing, retries, and evaluator real. Only the HTTP
// transport is replaced, so these tests cannot contact a model service.
const mockFetch = vi.fn<typeof fetch>();

function createProvider(config: TypeSafeConfig = {}) {
  return new TypeSafeProvider('jev-latest', {
    config: {
      apiKey: 'fixture-typesafe-key',
      apiBaseUrl: 'https://typesafe.example',
      cacheNamespace: 'fixture-account',
      instructions: 'Is this a polite response?',
      ...config,
    },
  });
}

function jsonResponse(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    status: 200,
    statusText: 'OK',
    ...init,
  });
}

function gradeResponse() {
  return jsonResponse({
    model: 'jev-fixture',
    answers: { grade: { type: 'noul', noul: 0.75 } },
    usage: { input_tokens: 10, output_tokens: 2 },
  });
}

function choiceResponse() {
  return jsonResponse({
    answers: {
      classification: {
        type: 'choice',
        choice: 'polite',
        confidence: 0.8,
        probabilities: { polite: 0.8, rude: 0.2 },
      },
    },
  });
}

describe('TypeSafe HTTP transport integration', () => {
  let restoreEnv: () => void;

  beforeEach(async () => {
    restoreEnv = mockProcessEnv({
      TYPESAFE_API_KEY: undefined,
      PROMPTFOO_RETRY_5XX: undefined,
      NO_PROXY: '*',
    });
    mockFetch.mockReset();
    mockFetch.mockImplementation(
      async () => new Response('Unexpected HTTP request in TypeSafe test', { status: 400 }),
    );
    vi.stubGlobal('fetch', mockFetch);
    enableCache();
    await clearCache();
  });

  afterEach(async () => {
    await clearCache();
    clearAgentCache();
    vi.unstubAllGlobals();
    vi.resetAllMocks();
    vi.restoreAllMocks();
    vi.useRealTimers();
    restoreEnv();
  });

  it.each(['callApi', 'callClassificationApi'] as const)(
    'does not reuse cached responses across unscoped credentials for %s',
    async (method) => {
      mockFetch
        .mockResolvedValueOnce(method === 'callApi' ? gradeResponse() : choiceResponse())
        .mockResolvedValueOnce(jsonResponse({ error: 'Invalid key' }, { status: 401 }));
      const first = createProvider({ cacheNamespace: undefined, labels: ['polite', 'rude'] });
      const second = createProvider({
        cacheNamespace: undefined,
        apiKey: 'different-fixture-key',
        labels: ['polite', 'rude'],
      });

      expect((await first[method]('Thank you')).error).toBeUndefined();
      expect((await second[method]('Thank you')).error).toContain('401');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    },
  );

  it.each(['callApi', 'callClassificationApi'] as const)(
    'does not coalesce concurrent unscoped calls for %s',
    async (method) => {
      mockFetch.mockImplementation(async () =>
        method === 'callApi' ? gradeResponse() : choiceResponse(),
      );

      const results = await Promise.all([
        createProvider({ cacheNamespace: undefined, labels: ['polite', 'rude'] })[method](
          'Thank you',
        ),
        createProvider({
          cacheNamespace: undefined,
          apiKey: 'different-fixture-key',
          labels: ['polite', 'rude'],
        })[method]('Thank you'),
      ]);

      expect(results.every((result) => result.error === undefined)).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    },
  );

  it('isolates account namespaces and reuses answers within the same namespace', async () => {
    mockFetch
      .mockResolvedValueOnce(gradeResponse())
      .mockResolvedValueOnce(jsonResponse({ answers: { grade: { type: 'noul', noul: 0.25 } } }));
    const first = createProvider({ cacheNamespace: 'account-one' });
    const second = createProvider({
      cacheNamespace: 'account-two',
      apiKey: 'different-fixture-key',
    });

    const firstResult = await first.callApi('Thank you');
    const secondResult = await second.callApi('Thank you');
    const firstCached = await createProvider({
      cacheNamespace: 'account-one',
      apiKey: 'rotated-fixture-key',
    }).callApi('Thank you');
    const secondCached = await second.callApi('Thank you');

    expect(JSON.parse(firstResult.output as string).score).toBe(0.75);
    expect(JSON.parse(secondResult.output as string).score).toBe(0.25);
    expect(firstResult.cached).toBe(false);
    expect(secondResult.cached).toBe(false);
    expect(firstCached).toMatchObject({ output: firstResult.output, cached: true });
    expect(secondCached).toMatchObject({ output: secondResult.output, cached: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['invalid JSON', new Response('not JSON')],
    ['malformed envelope', jsonResponse({ answers: [] })],
    ['missing answer', jsonResponse({ answers: {} })],
    ['invalid probability', jsonResponse({ answers: { grade: { type: 'noul', noul: 2 } } })],
  ])('evicts a grading response with %s so the next request can recover', async (_, invalid) => {
    const provider = createProvider();
    mockFetch.mockResolvedValueOnce(invalid).mockResolvedValueOnce(gradeResponse());

    const failure = await provider.callApi('Thank you');
    expect(failure.error).toBeDefined();

    const recovered = await provider.callApi('Thank you');
    expect(recovered.error).toBeUndefined();
    expect(recovered.cached).toBe(false);
    expect(JSON.parse(recovered.output as string)).toMatchObject({ pass: true, score: 0.75 });

    const cached = await provider.callApi('Thank you');
    expect(cached.cached).toBe(true);
    expect(cached.tokenUsage).toMatchObject({ cached: 12, total: 12 });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('evicts an invalid Choice answer before caching a recovered classification', async () => {
    const provider = createProvider({ labels: ['polite', 'rude'] });
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          answers: {
            classification: {
              type: 'choice',
              choice: 'polite',
              confidence: 0.8,
              probabilities: { polite: 0.8 },
            },
          },
        }),
      )
      .mockResolvedValueOnce(choiceResponse());

    expect((await provider.callClassificationApi('Thank you')).error).toBeDefined();
    const recovered = await provider.callClassificationApi('Thank you');
    expect(recovered).toMatchObject({ classification: { polite: 0.8, rude: 0.2 } });
    expect(recovered.error).toBeUndefined();
    expect(await provider.callClassificationApi('Thank you')).toEqual(recovered);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('reuses the raw answer when only the local grading threshold changes', async () => {
    mockFetch.mockImplementation(async () => gradeResponse());

    const lenient = await createProvider({ threshold: 0.5 }).callApi('Thank you');
    const strict = await createProvider({ threshold: 0.9 }).callApi('Thank you');

    expect(JSON.parse(lenient.output as string)).toMatchObject({ pass: true, score: 0.75 });
    expect(JSON.parse(strict.output as string)).toMatchObject({ pass: false, score: 0.75 });
    expect(strict.cached).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('shares one HTTP request between concurrent threshold variants and bills it once', async () => {
    const started = createDeferred<void>();
    const response = createDeferred<Response>();
    mockFetch.mockImplementation(async () => {
      started.resolve();
      return response.promise;
    });
    const lenient = createProvider({ threshold: 0.5 }).callApi('Thank you');
    const strict = createProvider({ threshold: 0.9 }).callApi('Thank you');
    await started.promise;
    response.resolve(gradeResponse());

    const results = await Promise.all([lenient, strict]);

    expect(results.map((result) => JSON.parse(result.output as string).pass)).toEqual([
      true,
      false,
    ]);
    expect(results.filter((result) => result.cached)).toHaveLength(1);
    expect(results.reduce((sum, result) => sum + (result.tokenUsage?.numRequests ?? 0), 0)).toBe(1);
    expect(results.find((result) => result.cached)?.cost).toBe(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it.each(['callApi', 'callClassificationApi'] as const)(
    'does not throttle the scheduler or pause subsequent work after a %s hard-quota response',
    async (method) => {
      vi.useFakeTimers();
      const restoreSchedulerEnv = mockProcessEnv({
        PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: 'false',
      });
      const registry = new RateLimitRegistry({ maxConcurrency: 4 });
      const provider = createProvider({ maxRetries: 0, labels: ['polite', 'rude'] });
      const rateLimitHit = vi.fn();
      const concurrencyDecreased = vi.fn();
      const completed = vi.fn();
      registry.on('ratelimit:hit', rateLimitHit);
      registry.on('concurrency:decreased', concurrencyDecreased);
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse(
            { error: { code: 'credit_balance_exhausted', message: 'Billing credits exhausted' } },
            {
              status: 429,
              statusText: 'Too Many Requests',
              headers: {
                'x-ratelimit-remaining-requests': '0',
                'x-ratelimit-reset-requests': '60s',
              },
            },
          ),
        )
        .mockResolvedValueOnce(method === 'callApi' ? gradeResponse() : choiceResponse());
      const invoke = (prompt: string) =>
        registry.execute(
          provider,
          () => provider[method](prompt),
          createProviderRateLimitOptions(),
        );
      let subsequent: Promise<unknown> | undefined;
      try {
        const quota = await invoke('Quota request');
        const afterQuota = Object.values(registry.getMetrics())[0];
        subsequent = invoke('Subsequent request').then(completed, (error: unknown) => error);
        // Flush work without advancing the 60-second rate-limit window. A hard
        // quota must not impose that pause on this provider's next operation.
        await vi.advanceTimersByTimeAsync(0);

        expect(quota.error).toContain('Quota exceeded');
        expect(afterQuota).toMatchObject({
          rateLimitHits: 0,
          maxConcurrency: 4,
          retriedRequests: 0,
        });
        expect(rateLimitHit).not.toHaveBeenCalled();
        expect(concurrencyDecreased).not.toHaveBeenCalled();
        expect(completed).toHaveBeenCalledOnce();
        expect(completed.mock.calls[0][0].error).toBeUndefined();
        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(Object.values(registry.getMetrics())[0]).toMatchObject({
          queueDepth: 0,
          activeRequests: 0,
        });
      } finally {
        // Dispose also settles a mistakenly paused request when this regression
        // fails, so the test never leaves an unhandled promise or reset timer.
        registry.dispose();
        await subsequent;
        restoreSchedulerEnv();
      }
    },
  );

  it('keeps one account’s exhausted rate limit from pausing another account', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const restoreSchedulerEnv = mockProcessEnv({ PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: 'false' });
    const registry = new RateLimitRegistry({ maxConcurrency: 4 });
    const limited = createProvider({ apiKey: 'limited-account-same', maxRetries: 1 });
    const available = createProvider({ apiKey: 'available-account-same', maxRetries: 1 });
    const completed = vi.fn();
    const rateLimitResponse = () =>
      jsonResponse(
        { error: 'Too many requests' },
        { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '1' } },
      );
    mockFetch
      .mockImplementationOnce(async () => rateLimitResponse())
      .mockImplementationOnce(async () => rateLimitResponse())
      .mockResolvedValueOnce(gradeResponse());
    let subsequent: Promise<unknown> | undefined;
    try {
      const pending = registry.execute(
        limited,
        () => limited.callApi('Thank you'),
        createProviderRateLimitOptions(),
      );
      await vi.advanceTimersByTimeAsync(1000);
      expect((await pending).error).toContain('429 Too Many Requests');
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(registry.getMetrics()[limited.getRateLimitKey()]).toMatchObject({
        rateLimitHits: 1,
        retriedRequests: 0,
      });

      subsequent = registry
        .execute(available, () => available.callApi('Thank you'), createProviderRateLimitOptions())
        .then(completed, (error: unknown) => error);
      // Flush work without advancing the first account's cooldown.
      await vi.advanceTimersByTimeAsync(0);

      expect(completed).toHaveBeenCalledOnce();
      expect(completed.mock.calls[0][0].error).toBeUndefined();
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(registry.getMetrics()[available.getRateLimitKey()]).toMatchObject({
        rateLimitHits: 0,
        maxConcurrency: 4,
        completedRequests: 1,
      });
    } finally {
      registry.dispose();
      await subsequent;
      restoreSchedulerEnv();
    }
  });

  it('preserves the missing-key error when scheduled', async () => {
    const registry = new RateLimitRegistry({ maxConcurrency: 1 });
    const provider = createProvider({ apiKey: undefined });
    try {
      const result = await registry.execute(
        provider,
        () => provider.callApi('Thank you'),
        createProviderRateLimitOptions(),
      );

      expect(result.error).toContain('TypeSafe API key is not set');
      expect(mockFetch).not.toHaveBeenCalled();
    } finally {
      registry.dispose();
    }
  });

  it.each(['target', 'llm-rubric', 'classifier'] as const)(
    'records invalid %s endpoint configuration as an evaluation error without a TypeSafe request',
    async (usage) => {
      const restoreSchedulerEnv = mockProcessEnv({ PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: 'false' });
      const registry = new RateLimitRegistry({ maxConcurrency: 1 });
      const provider = createProvider({
        apiBaseUrl: 'https://fixture-user:fixture-url-secret@typesafe.example',
        labels: ['polite', 'rude'],
      });
      try {
        const rows = await runEval({
          delay: 0,
          testIdx: 0,
          promptIdx: 0,
          repeatIndex: 0,
          isRedteam: false,
          provider:
            usage === 'target'
              ? provider
              : { id: () => 'local:fixed-output', callApi: async () => ({ output: 'Thank you' }) },
          prompt: { raw: 'Thank you', label: 'local' },
          test:
            usage === 'target'
              ? {}
              : {
                  assert: [
                    {
                      type: usage,
                      value: usage === 'classifier' ? 'polite' : 'Is polite?',
                      provider,
                    },
                  ],
                },
          conversations: {},
          registers: {},
          rateLimitRegistry: registry,
        });

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          success: false,
          score: 0,
          failureReason: ResultFailureReason.ERROR,
        });
        expect(rows[0].error).toContain('`apiBaseUrl` must be an HTTP(S) URL');
        expect(rows[0].error).not.toContain('fixture-user');
        expect(rows[0].error).not.toContain('fixture-url-secret');
        expect(mockFetch).not.toHaveBeenCalled();
      } finally {
        registry.dispose();
        restoreSchedulerEnv();
      }
    },
  );

  it('retries HTTP 429 with Retry-After and caches the recovered response', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse(
          { error: 'Too many requests' },
          { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '1' } },
        ),
      )
      .mockResolvedValueOnce(gradeResponse());
    const provider = createProvider();

    const pending = provider.callApi('Thank you');
    await vi.advanceTimersByTimeAsync(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).error).toBeUndefined();
    expect((await provider.callApi('Thank you')).cached).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    { status: 429, statusText: 'Too Many Requests' },
    { status: 503, statusText: 'Service Unavailable' },
    { status: 529, statusText: 'Overloaded' },
  ])('bounds retries for persistent HTTP $status responses', async ({ status, statusText }) => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    mockFetch.mockImplementation(async () =>
      jsonResponse(
        { error: 'Please retry later' },
        {
          status,
          statusText,
          headers: { 'Retry-After': '1', 'x-typesafe-request-id': 'fixture-request' },
        },
      ),
    );

    const pending = createProvider({ maxRetries: 2 }).callApi('Thank you');
    await vi.runAllTimersAsync();
    const response = await pending;

    expect(response.error).toContain(String(status));
    expect(response.error).toContain('fixture-request');
    expect(response.error).toContain('Please retry later');
    expect(response.output).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('does not retry a permanent authentication error reported as HTTP 502', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: 'Invalid API key' }, { status: 502, statusText: 'Unauthorized' }),
    );

    const response = await createProvider({ maxRetries: 2 }).callApi('Thank you');

    expect(response.error).toContain('502 Unauthorized');
    expect(response.error).toContain('Invalid API key');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('shares one retry budget across rate-limit, service-unavailable, and overload responses', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const responses = [
      { status: 429, statusText: 'Too Many Requests' },
      { status: 503, statusText: 'Service Unavailable' },
      { status: 529, statusText: 'Overloaded' },
    ];
    let attempts = 0;
    mockFetch.mockImplementation(async () => {
      const response = responses[attempts++ % responses.length];
      return jsonResponse(
        { error: 'Please retry later' },
        {
          ...response,
          headers: { 'Retry-After': '1' },
        },
      );
    });

    const pending = createProvider({ maxRetries: 2 }).callApi('Thank you');
    await vi.runAllTimersAsync();

    expect((await pending).error).toContain('529');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it.each([
    { status: 502, statusText: 'Bad Gateway' },
    { status: 503, statusText: 'Service Unavailable' },
    { status: 504, statusText: 'Gateway Timeout' },
    { status: 524, statusText: 'A Timeout Occurred' },
    { status: 529, statusText: 'Overloaded' },
  ])(
    'recovers from HTTP $status after Retry-After and caches the response',
    async ({ status, statusText }) => {
      vi.useFakeTimers();
      vi.spyOn(Math, 'random').mockReturnValue(0);
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse(
            { error: statusText },
            { status, statusText, headers: { 'Retry-After': '1' } },
          ),
        )
        .mockResolvedValueOnce(gradeResponse());
      const provider = createProvider({ maxRetries: 2 });

      const pending = provider.callApi('Thank you');
      await vi.advanceTimersByTimeAsync(999);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect((await pending).error).toBeUndefined();
      expect((await provider.callApi('Thank you')).cached).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    { assertionType: 'llm-rubric', status: 503, statusText: 'Service Unavailable' },
    { assertionType: 'classifier', status: 503, statusText: 'Service Unavailable' },
    { assertionType: 'llm-rubric', status: 529, statusText: 'Overloaded' },
    { assertionType: 'classifier', status: 529, statusText: 'Overloaded' },
  ] as const)(
    'cancels an HTTP $status retry delay for $assertionType without sending the next request',
    async ({ assertionType, status, statusText }) => {
      vi.useFakeTimers();
      const controller = new AbortController();
      mockFetch.mockResolvedValueOnce(
        jsonResponse(
          { error: statusText },
          { status, statusText, headers: { 'Retry-After': '60' } },
        ),
      );
      const provider = createProvider({ labels: ['polite', 'rude'] });
      const pending =
        assertionType === 'classifier'
          ? withProviderCallExecutionContext({ abortSignal: controller.signal }, () =>
              matchesClassification('polite', 'Thank you', 0.5, { provider }),
            )
          : provider.callApi('Thank you', undefined, { abortSignal: controller.signal });
      const cancelled = pending.catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      controller.abort();
      expect(await cancelled).toMatchObject({ name: 'AbortError' });
      await vi.runAllTimersAsync();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    { status: 503, statusText: 'Service Unavailable' },
    { status: 529, statusText: 'Overloaded' },
  ])(
    'does not multiply HTTP $status retries when global 5xx retries are enabled',
    async ({ status, statusText }) => {
      vi.useFakeTimers();
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const restoreRetryEnv = mockProcessEnv({ PROMPTFOO_RETRY_5XX: 'true' });
      try {
        mockFetch.mockImplementation(async () =>
          jsonResponse({ error: statusText }, { status, statusText }),
        );

        const pending = createProvider({ maxRetries: 2 }).callApi('Thank you');
        await vi.runAllTimersAsync();

        expect((await pending).error).toContain(String(status));
        expect(mockFetch).toHaveBeenCalledTimes(3);
      } finally {
        restoreRetryEnv();
      }
    },
  );

  it('preserves diagnostics and redacts secrets after exhausting globally enabled HTTP 500 retries', async () => {
    vi.useFakeTimers();
    const restoreRetryEnv = mockProcessEnv({ PROMPTFOO_RETRY_5XX: 'true' });
    try {
      mockFetch.mockImplementation(
        async () =>
          new Response('Service failed for fixture-typesafe-key', {
            status: 500,
            statusText: 'Internal Server Error',
            headers: { 'Retry-After': '1', 'x-typesafe-request-id': 'fixture-exhausted' },
          }),
      );

      const pending = createProvider({ maxRetries: 1 }).callApi('Thank you');
      await vi.runAllTimersAsync();
      const response = await pending;

      expect(response.error).toContain('500 Internal Server Error');
      expect(response.error).toContain('fixture-exhausted');
      expect(response.error).toContain('Service failed for [REDACTED]');
      expect(response.error).not.toContain('fixture-typesafe-key');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    } finally {
      restoreRetryEnv();
    }
  });

  it('preserves the status, request id, and body of non-JSON HTTP errors', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('<html>Service unavailable</html>', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'x-typesafe-request-id': 'fixture-unavailable' },
      }),
    );

    const response = await createProvider({ maxRetries: 0 }).callApi('Thank you');

    expect(response.error).toContain('503 Service Unavailable');
    expect(response.error).toContain('fixture-unavailable');
    expect(response.error).toContain('Service unavailable');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    { assertionType: 'llm-rubric', when: 'before grading' },
    { assertionType: 'llm-rubric', when: 'during the request' },
    { assertionType: 'classifier', when: 'before grading' },
    { assertionType: 'classifier', when: 'during the request' },
  ] as const)(
    'records $assertionType cancellation $when as an evaluation error',
    async ({ assertionType, when }) => {
      const controller = new AbortController();
      const started = createDeferred<void>();
      mockFetch.mockImplementation(async (_, options) => {
        const signal = options?.signal;
        if (!signal) {
          throw new Error('The grading request is missing the evaluation abort signal');
        }
        signal.throwIfAborted();
        return new Promise<Response>((_, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
          started.resolve();
        });
      });
      const pending = runEval({
        delay: 0,
        testIdx: 0,
        promptIdx: 0,
        repeatIndex: 0,
        isRedteam: false,
        provider: {
          id: () => 'local:fixed-output',
          callApi: async () => {
            if (when === 'before grading') {
              controller.abort();
            }
            return { output: 'Thank you' };
          },
        },
        prompt: { raw: 'Thank you', label: 'local' },
        test: {
          assert: [
            {
              type: assertionType,
              value: assertionType === 'classifier' ? 'polite' : 'Is polite',
              provider: createProvider({ labels: ['polite', 'rude'] }),
            },
          ],
        },
        conversations: {},
        registers: {},
        abortSignal: controller.signal,
      });
      if (when === 'during the request') {
        await started.promise;
        controller.abort();
      }
      const rows = await pending;

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        success: false,
        score: 0,
        failureReason: ResultFailureReason.ERROR,
      });
      expect(rows[0].error).toMatch(/abort/i);
      expect(mockFetch).toHaveBeenCalledTimes(when === 'before grading' ? 0 : 1);
    },
  );
});
