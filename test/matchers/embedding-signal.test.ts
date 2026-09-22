import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import cliState from '../../src/cliState';
import { callEmbeddingProvider } from '../../src/matchers/providers';
import { matchesAnswerRelevance } from '../../src/matchers/rag';
import { matchesSimilarity } from '../../src/matchers/similarity';
import { getDefaultProviders } from '../../src/providers/defaults';
import { OpenAiEmbeddingProvider } from '../../src/providers/openai/embedding';
import { withProviderCallExecutionContext } from '../../src/scheduler/providerCallExecutionContext';
import { ProviderGroupedCallQueue } from '../../src/scheduler/providerCallQueue';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';

import type {
  ApiEmbeddingProvider,
  ApiProvider,
  CancellableEmbeddingProvider,
} from '../../src/types/providers';

vi.mock('../../src/providers/defaults', () => ({ getDefaultProviders: vi.fn() }));
vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));

describe('embedding graders receive evaluation cancellation', () => {
  const priorConfig = cliState.config;
  const embed = vi.fn<CancellableEmbeddingProvider['callEmbeddingApi']>();
  const response = () => ({
    embedding: [1, 0],
    tokenUsage: { prompt: 1, completion: 0, total: 1, numRequests: 1 },
  });
  let provider: ApiEmbeddingProvider;
  let text: ApiProvider;

  beforeEach(() => {
    embed.mockReset().mockResolvedValue(response());
    vi.mocked(getDefaultProviders).mockReset();
    vi.mocked(fetchWithCache).mockReset();
    cliState.config = {};
    provider = {
      id: () => 'test-embedding',
      callApi: vi.fn<ApiProvider['callApi']>().mockRejectedValue(new Error('Unexpected text call')),
      callEmbeddingApi: embed,
      supportsEmbeddingCancellation: true,
    } satisfies CancellableEmbeddingProvider;
    text = {
      id: () => 'test-question-generator',
      callApi: vi.fn(async () => ({
        output: 'question',
        tokenUsage: { prompt: 1, completion: 1, total: 2 },
      })),
    };
    vi.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: provider,
      gradingProvider: text,
      gradingJsonProvider: text,
      moderationProvider: text,
      suggestionsProvider: text,
      synthesizeProvider: text,
    });
  });

  afterEach(() => {
    cliState.config = priorConfig;
    vi.clearAllMocks();
  });

  const run = (kind: 'similarity' | 'answer relevance') =>
    kind === 'similarity'
      ? matchesSimilarity('input', 'output', 0.5, false, { provider: { embedding: provider } })
      : matchesAnswerRelevance('input', 'output', 0.5, { provider: { embedding: provider, text } });

  it.each(['similarity', 'answer relevance'] as const)(
    'preserves the %s result, token usage and legacy arguments without a signal',
    async (kind) => {
      const initial = await run(kind);
      expect(initial).toMatchObject({ pass: true, score: 1 });
      expect(initial.tokensUsed?.prompt).toBeGreaterThan(0);
      expect(embed).toHaveBeenCalledTimes(kind === 'similarity' ? 2 : 4);
      expect(embed.mock.calls.every((args) => args.length === 1)).toBe(true);
      embed.mockClear();

      const controller = new AbortController();
      const withSignal = await withProviderCallExecutionContext(
        { abortSignal: controller.signal },
        () => run(kind),
      );
      expect(withSignal).toEqual(initial);
      expect(embed).toHaveBeenCalledTimes(kind === 'similarity' ? 2 : 4);
      for (const args of embed.mock.calls) {
        expect(args).toEqual([expect.any(String), undefined, { abortSignal: controller.signal }]);
      }
      expect(embed.mock.contexts.every((receiver) => receiver === provider)).toBe(true);
    },
  );

  it.each(['similarity', 'answer relevance'] as const)(
    'keeps custom embedding arguments untouched through the %s matcher',
    async (kind) => {
      const withSettings = vi.fn(async (_input: string, settings?: { dimensions: number }) => {
        expect(settings).toBeUndefined();
        return response();
      });
      const withTimeout = vi.fn(async (_input: string, _settings?: number, timeout?: number) => {
        expect(timeout).toBeUndefined();
        return response();
      });
      const legacyWithThird = {
        id: () => 'custom-timeout-embedding',
        callApi: text.callApi,
        callEmbeddingApi: withTimeout,
      } satisfies ApiEmbeddingProvider;
      const implementations: ApiEmbeddingProvider[] = [
        {
          id: () => 'custom-settings-embedding',
          callApi: text.callApi,
          callEmbeddingApi: withSettings,
        },
        legacyWithThird,
      ];
      const controller = new AbortController();
      for (const implementation of implementations) {
        provider = implementation;
        await expect(
          withProviderCallExecutionContext({ abortSignal: controller.signal }, () => run(kind)),
        ).resolves.toMatchObject({ pass: true });
      }
      for (const calls of [withSettings.mock.calls, withTimeout.mock.calls]) {
        expect(calls).toHaveLength(kind === 'similarity' ? 2 : 4);
        expect(calls.every((args) => args.length === 1)).toBe(true);
      }
      const publicProvider: ApiProvider = legacyWithThird;
      await expect(publicProvider.callEmbeddingApi!('input')).resolves.toEqual(response());
    },
  );

  it('preserves the evaluation abort when a legacy provider returns an error response', async () => {
    provider.supportsEmbeddingCancellation = false;
    const controller = new AbortController();
    const reason = new DOMException('evaluation cancelled', 'AbortError');
    let markStarted!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    embed.mockImplementation(async () => {
      if (embed.mock.calls.length === 2) {
        markStarted();
      }
      await held;
      return { error: 'Provider returned an ordinary error' };
    });
    const grading = withProviderCallExecutionContext({ abortSignal: controller.signal }, () =>
      run('similarity'),
    );
    void grading.catch(() => {});
    try {
      await started;
      controller.abort(reason);
      release();
      await expect(grading).rejects.toBe(reason);
    } finally {
      release();
      controller.abort(reason);
      await Promise.allSettled([grading]);
    }
  });

  it('preserves an unrelated exception thrown by a running embedding provider during cancellation', async () => {
    const controller = new AbortController();
    const failure = new SyntaxError('malformed embedding response');
    embed.mockImplementation(async () => {
      controller.abort(new Error('evaluation stopped'));
      throw failure;
    });
    await expect(
      withProviderCallExecutionContext({ abortSignal: controller.signal }, () =>
        callEmbeddingProvider(provider, 'input'),
      ),
    ).rejects.toBe(failure);
  });

  it('removes embedding grading from a real exhausted rate-limit registry on cancellation', async () => {
    const registry = new RateLimitRegistry({ maxConcurrency: 1 });
    const controller = new AbortController();
    const reason = new Error('cancel waiting for quota');
    await registry.execute(provider, async () => 'seed', {
      getHeaders: () => ({
        'x-ratelimit-limit-requests': '1',
        'x-ratelimit-remaining-requests': '0',
        'x-ratelimit-reset-requests': '60s',
      }),
    });
    const grading = withProviderCallExecutionContext(
      { abortSignal: controller.signal, rateLimitRegistry: registry },
      () => run('similarity'),
    );
    void grading.catch(() => {});
    try {
      await vi.waitFor(() => expect(Object.values(registry.getMetrics())[0]?.queueDepth).toBe(2));
      controller.abort(reason);
      await expect(grading).rejects.toBe(reason);
      expect(Object.values(registry.getMetrics())[0]?.queueDepth).toBe(0);
      expect(embed).not.toHaveBeenCalled();
    } finally {
      controller.abort(reason);
      registry.dispose();
      await Promise.allSettled([grading]);
    }
  });

  it('removes grouped embedding grading before its provider runs on cancellation', async () => {
    const queue = new ProviderGroupedCallQueue();
    const controller = new AbortController();
    const reason = new Error('cancel grouped grading');
    const grading = withProviderCallExecutionContext(
      { abortSignal: controller.signal, providerCallQueue: queue },
      () => run('similarity'),
    );
    void grading.catch(() => {});
    try {
      await vi.waitFor(() => expect(queue.hasJobs()).toBe(true));
      const group = queue.takeNextGroup();
      controller.abort(reason);
      await expect(grading).rejects.toBe(reason);
      await Promise.all(group.map((job) => queue.run(job)));
      expect(queue.hasJobs()).toBe(false);
      expect(embed).not.toHaveBeenCalled();
    } finally {
      controller.abort(reason);
      await Promise.allSettled([grading]);
    }
  });

  it('does not call an embedding provider when grading is already cancelled', async () => {
    const reason = new Error('evaluation cancelled');
    await expect(
      withProviderCallExecutionContext({ abortSignal: AbortSignal.abort(reason) }, () =>
        run('similarity'),
      ),
    ).rejects.toBe(reason);
    expect(embed).not.toHaveBeenCalled();
  });

  it('aborts both default OpenAI embedding requests during similarity grading', async () => {
    const defaults = await getDefaultProviders();
    vi.mocked(getDefaultProviders).mockResolvedValue({
      ...defaults,
      embeddingProvider: new OpenAiEmbeddingProvider('text-embedding-3-small', {
        config: { apiKey: 'test-key' },
      }),
    });
    const controller = new AbortController();
    const reason = new Error('evaluation cancelled');
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const requests: AbortSignal[] = [];
    const aborted: AbortSignal[] = [];
    vi.mocked(fetchWithCache).mockImplementation((_url, options) => {
      const signal = options?.signal;
      if (!signal) {
        throw new Error('OpenAI transport received no cancellation signal');
      }
      requests.push(signal);
      if (requests.length === 2) {
        markStarted();
      }
      return new Promise<never>((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            aborted.push(signal);
            reject(signal.reason);
          },
          { once: true },
        );
      });
    });
    const grading = withProviderCallExecutionContext({ abortSignal: controller.signal }, () =>
      matchesSimilarity('input', 'output', 0.5),
    );
    void grading.catch(() => {});
    try {
      await Promise.race([
        started,
        grading.then(() => {
          throw new Error('Grading unexpectedly finished');
        }),
      ]);
      expect(requests).toEqual([controller.signal, controller.signal]);
      controller.abort(reason);
      await expect(grading).rejects.toBe(reason);
      expect(aborted).toEqual(requests);
    } finally {
      controller.abort(reason);
      await Promise.allSettled([grading]);
    }
  });

  it.each(['similarity', 'answer input', 'answer question'] as const)(
    'cancels a pending %s embedding',
    async (stage) => {
      const controller = new AbortController();
      const reason = new Error('evaluation cancelled');
      let markStarted!: () => void;
      const started = new Promise<void>((resolve) => {
        markStarted = resolve;
      });
      const pending = new Set<() => void>();
      const aborted: AbortSignal[] = [];
      embed.mockImplementation(async (_input, _context, options) => {
        const signal = options?.abortSignal;
        if (!signal) {
          throw new Error('Embedding received no cancellation signal');
        }
        if (stage === 'answer question' && embed.mock.calls.length === 1) {
          return response();
        }
        await new Promise<void>((_resolve, reject) => {
          const finish = () => {
            signal.removeEventListener('abort', onAbort);
            pending.delete(finish);
            reject(new Error('Embedding fixture released'));
          };
          const onAbort = () => {
            signal.removeEventListener('abort', onAbort);
            pending.delete(finish);
            aborted.push(signal);
            reject(signal.reason);
          };
          pending.add(finish);
          signal.addEventListener('abort', onAbort, { once: true });
          if (pending.size === (stage === 'similarity' ? 2 : 1)) {
            markStarted();
          }
        });
        return response();
      });
      const call = withProviderCallExecutionContext({ abortSignal: controller.signal }, () =>
        run(stage === 'similarity' ? 'similarity' : 'answer relevance'),
      );
      void call.catch(() => {});

      try {
        await Promise.race([
          started,
          call.then(() => {
            throw new Error('Grading finished before the embedding hold');
          }),
        ]);
        expect(embed.mock.calls.every((args) => args[2]?.abortSignal === controller.signal)).toBe(
          true,
        );
        controller.abort(reason);
        await expect(call).rejects.toBe(reason);
        await Promise.allSettled(embed.mock.results.map((result) => result.value));
        expect(aborted).toEqual(
          Array.from({ length: stage === 'similarity' ? 2 : 1 }, () => controller.signal),
        );
        expect(pending.size).toBe(0);
      } finally {
        for (const finish of pending) {
          finish();
        }
        await Promise.allSettled([call, ...embed.mock.results.map((result) => result.value)]);
      }
    },
  );
});
