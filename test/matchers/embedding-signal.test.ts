import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import cliState from '../../src/cliState';
import { callEmbeddingProvider } from '../../src/matchers/providers';
import { matchesAnswerRelevance } from '../../src/matchers/rag';
import { matchesSimilarity } from '../../src/matchers/similarity';
import { getDefaultProviders } from '../../src/providers/defaults';
import { OpenAiEmbeddingProvider } from '../../src/providers/openai/embedding';
import { withProviderCallExecutionContext } from '../../src/scheduler/providerCallExecutionContext';
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
    vi.resetAllMocks();
    embed.mockResolvedValue(response());
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
  });

  const run = (kind: 'similarity' | 'answer relevance') =>
    kind === 'similarity'
      ? matchesSimilarity('input', 'output', 0.5, false, { provider: { embedding: provider } })
      : matchesAnswerRelevance('input', 'output', 0.5, { provider: { embedding: provider, text } });
  const runWithSignal = (kind: 'similarity' | 'answer relevance', abortSignal: AbortSignal) =>
    withProviderCallExecutionContext({ abortSignal }, () => run(kind));

  it.each(['similarity', 'answer relevance'] as const)(
    'passes the grading signal only to opted-in %s embedding providers',
    async (kind) => {
      const calls = kind === 'similarity' ? 2 : 4;
      const controller = new AbortController();
      const initial = await run(kind);
      expect(initial).toMatchObject({ pass: true, score: 1 });
      expect(initial.tokensUsed?.prompt).toBeGreaterThan(0);

      await expect(runWithSignal(kind, controller.signal)).resolves.toEqual(initial);
      expect(embed.mock.calls.slice(0, calls)).toEqual(
        Array.from({ length: calls }, () => [expect.any(String)]),
      );
      expect(embed.mock.calls.slice(calls)).toEqual(
        Array.from({ length: calls }, () => [
          expect.any(String),
          undefined,
          { abortSignal: controller.signal },
        ]),
      );
      expect(embed.mock.contexts.every((receiver) => receiver === provider)).toBe(true);

      // Custom providers that did not opt in may give extra parameters another meaning.
      const legacy = vi.fn(async (_input: string, _timeoutMs?: number) => response());
      provider = {
        id: () => 'custom-embedding',
        callApi: text.callApi,
        callEmbeddingApi: legacy,
      } satisfies ApiEmbeddingProvider;
      await expect(runWithSignal(kind, controller.signal)).resolves.toEqual(initial);
      expect(legacy.mock.calls).toEqual(Array.from({ length: calls }, () => [expect.any(String)]));
    },
  );

  it.each([
    ['an error response reports the cancellation', true],
    ['a finished embedding is kept', false],
  ])('when grading is cancelled during an embedding call, %s', async (_name, isError) => {
    provider.supportsEmbeddingCancellation = false;
    const controller = new AbortController();
    const reason = new Error('eval paused');
    const result = isError ? { error: 'Provider returned an ordinary error' } : response();
    embed.mockImplementation(async () => {
      controller.abort(reason);
      return result;
    });
    const call = withProviderCallExecutionContext({ abortSignal: controller.signal }, () =>
      callEmbeddingProvider(provider, 'input'),
    );

    await (isError ? expect(call).rejects.toBe(reason) : expect(call).resolves.toEqual(result));
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

  it('does not call an embedding provider when grading is already cancelled', async () => {
    const reason = new Error('evaluation cancelled');
    await expect(runWithSignal('similarity', AbortSignal.abort(reason))).rejects.toBe(reason);
    expect(embed).not.toHaveBeenCalled();
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

  it('passes the grading signal to both default OpenAI similarity requests', async () => {
    vi.mocked(getDefaultProviders).mockResolvedValue({
      ...(await getDefaultProviders()),
      embeddingProvider: new OpenAiEmbeddingProvider('text-embedding-3-small', {
        config: { apiKey: 'test-key' },
      }),
    });
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: { data: [{ embedding: [1, 0] }], usage: { prompt_tokens: 1, total_tokens: 1 } },
      cached: false,
      status: 200,
      statusText: 'OK',
    } as never);
    const controller = new AbortController();

    await expect(
      withProviderCallExecutionContext({ abortSignal: controller.signal }, () =>
        matchesSimilarity('input', 'output', 0.5),
      ),
    ).resolves.toMatchObject({ pass: true });
    expect(vi.mocked(fetchWithCache).mock.calls.map(([, options]) => options?.signal)).toEqual([
      controller.signal,
      controller.signal,
    ]);
  });
});
