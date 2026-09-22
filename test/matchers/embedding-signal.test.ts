import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import cliState from '../../src/cliState';
import { matchesAnswerRelevance } from '../../src/matchers/rag';
import { matchesSimilarity } from '../../src/matchers/similarity';
import { getDefaultProviders } from '../../src/providers/defaults';
import { OpenAiEmbeddingProvider } from '../../src/providers/openai/embedding';
import { withProviderCallExecutionContext } from '../../src/scheduler/providerCallExecutionContext';

import type { ApiEmbeddingProvider, ApiProvider } from '../../src/types/providers';

vi.mock('../../src/providers/defaults', () => ({ getDefaultProviders: vi.fn() }));
vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));

describe('embedding graders receive evaluation cancellation', () => {
  const priorConfig = cliState.config;
  const embed = vi.fn<ApiEmbeddingProvider['callEmbeddingApi']>();
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
    };
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
