import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { matchesAnswerRelevance } from '../../src/matchers/rag';
import { matchesSimilarity } from '../../src/matchers/similarity';
import { getDefaultProviders } from '../../src/providers/defaults';
import { SageMakerEmbeddingProvider } from '../../src/providers/sagemaker';
import { withProviderCallExecutionContext } from '../../src/scheduler/providerCallExecutionContext';

import type { ApiProvider } from '../../src/types/index';

const sdk = vi.hoisted(() => ({ send: vi.fn(), destroy: vi.fn(), cacheSet: vi.fn() }));
vi.mock('@aws-sdk/client-sagemaker-runtime', () => ({
  SageMakerRuntimeClient: class {
    send = sdk.send;
    destroy = sdk.destroy;
  },
  InvokeEndpointCommand: class {
    constructor(input: Record<string, unknown>) {
      Object.assign(this, input);
    }
  },
}));
vi.mock('@smithy/core/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@smithy/core/config')>()),
  loadConfig:
    ({ default: value }: { default: unknown }) =>
    async () =>
      value,
  resolveDefaultsModeConfig: () => async () => 'legacy',
}));
vi.mock('../../src/cache', () => ({
  isCacheEnabled: () => true,
  getCache: () => ({ get: async () => undefined, set: sdk.cacheSet }),
}));
vi.mock('../../src/providers/defaults', () => ({ getDefaultProviders: vi.fn() }));
vi.mock('../../src/telemetry', () => ({ default: { record: vi.fn() } }));

describe('embedding grading cancellation', () => {
  const priorConfig = cliState.config;
  let provider: SageMakerEmbeddingProvider;
  let text: ApiProvider;
  const response = () => ({
    Body: new TextEncoder().encode(JSON.stringify({ embedding: [1, 0] })),
  });

  beforeEach(() => {
    sdk.send.mockReset();
    sdk.destroy.mockReset();
    sdk.cacheSet.mockReset();
    vi.mocked(getDefaultProviders).mockReset();
    cliState.config = {};
    provider = new SageMakerEmbeddingProvider('synthetic-embedding-endpoint', {
      config: {
        region: 'us-east-1',
        modelType: 'custom',
        accessKeyId: 'SYNTHETIC_EMBEDDING_KEY',
        secretAccessKey: 'synthetic-embedding-secret',
      },
    });
    text = {
      id: () => 'synthetic-question-generator',
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
    provider.cleanup();
    cliState.config = priorConfig;
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  const run = (kind: 'similarity' | 'RAG') =>
    kind === 'similarity'
      ? matchesSimilarity('input', 'output', 0.5, false, { provider: { embedding: provider } })
      : matchesAnswerRelevance('input', 'output', 0.5, { provider: { embedding: provider, text } });

  it.each(['similarity', 'RAG'] as const)(
    'preserves %s embeddings, usage and legacy arity with optional cancellation',
    async (kind) => {
      sdk.send.mockImplementation(async () => response());
      const calls = vi.spyOn(provider, 'callEmbeddingApi');
      const noSignal = await run(kind);
      expect(noSignal).toMatchObject({ pass: true, score: 1 });
      expect(noSignal.tokensUsed?.prompt).toBeGreaterThan(0);
      expect(calls.mock.calls).toHaveLength(kind === 'similarity' ? 2 : 4);
      expect(calls.mock.calls.every((args) => args.length === 1)).toBe(true);
      calls.mockClear();
      const controller = new AbortController();
      const withSignal = await withProviderCallExecutionContext(
        { abortSignal: controller.signal },
        () => run(kind),
      );
      expect(withSignal).toEqual(noSignal);
      expect(calls.mock.calls).toHaveLength(kind === 'similarity' ? 2 : 4);
      for (const args of calls.mock.calls) {
        expect(args).toEqual([expect.any(String), undefined, { abortSignal: controller.signal }]);
      }
      expect(calls.mock.contexts.every((receiver) => receiver === provider)).toBe(true);
    },
  );

  it.each(['similarity', 'RAG input', 'RAG question'] as const)(
    'cancels a held %s embedding through the actual matcher and Sage request',
    async (stage) => {
      const controller = new AbortController();
      const calls = vi.spyOn(provider, 'callEmbeddingApi');
      const abortReason = new Error('Synthetic evaluation cancellation');
      let markStarted!: () => void;
      const started = new Promise<void>((resolve) => {
        markStarted = resolve;
      });
      const releases = new Set<() => void>();
      let heldCount = 0;
      sdk.send.mockImplementation(
        async (_command, { abortSignal }: { abortSignal: AbortSignal }) => {
          if (stage === 'RAG question' && sdk.send.mock.calls.length === 1) {
            return response();
          }
          await new Promise<void>((_resolve, reject) => {
            const finish = () => {
              abortSignal.removeEventListener('abort', onAbort);
              releases.delete(finish);
              // Stop RAG during failed-regression teardown instead of allowing it
              // to enter and hold a later question embedding after this sweep.
              reject(new Error('Embedding fixture released'));
            };
            const onAbort = () => {
              abortSignal.removeEventListener('abort', onAbort);
              releases.delete(finish);
              reject(abortSignal.reason);
            };
            releases.add(finish);
            abortSignal.addEventListener('abort', onAbort, { once: true });
            if (++heldCount === (stage === 'similarity' ? 2 : 1)) {
              markStarted();
            }
          });
          return response();
        },
      );
      const call = withProviderCallExecutionContext({ abortSignal: controller.signal }, () =>
        run(stage === 'similarity' ? 'similarity' : 'RAG'),
      );
      void call.catch(() => {});
      try {
        await Promise.race([
          started,
          call.then(() => {
            throw new Error('Grading finished before the embedding hold');
          }),
        ]);
        expect(calls.mock.calls.every((args) => args[2]?.abortSignal === controller.signal)).toBe(
          true,
        );
        const writesBeforeAbort = sdk.cacheSet.mock.calls.length;
        controller.abort(abortReason);
        await expect(call).rejects.toBe(abortReason);
        await Promise.allSettled(sdk.send.mock.results.map((result) => result.value));
        expect(releases.size).toBe(0);
        expect(sdk.cacheSet).toHaveBeenCalledTimes(writesBeforeAbort);
      } finally {
        for (const release of releases) {
          release();
        }
        await Promise.allSettled([call, ...sdk.send.mock.results.map((result) => result.value)]);
      }
    },
  );
});
