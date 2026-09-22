import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { AzureEmbeddingProvider } from '../../src/providers/azure/embedding';
import { AwsBedrockEmbeddingProvider } from '../../src/providers/bedrock';
import { CohereEmbeddingProvider } from '../../src/providers/cohere';
import { DMREmbeddingProvider } from '../../src/providers/docker';
import { AIStudioEmbeddingProvider } from '../../src/providers/google/ai.studio';
import { VertexEmbeddingProvider } from '../../src/providers/google/vertex';
import { HuggingfaceFeatureExtractionProvider } from '../../src/providers/huggingface';
import { createLiteLLMProvider } from '../../src/providers/litellm';
import { LocalAiEmbeddingProvider } from '../../src/providers/localai';
import { MistralEmbeddingProvider } from '../../src/providers/mistral';
import { OllamaEmbeddingProvider } from '../../src/providers/ollama';
import { OpenAiEmbeddingProvider } from '../../src/providers/openai/embedding';
import { SageMakerEmbeddingProvider } from '../../src/providers/sagemaker';
import { TrueFoundryEmbeddingProvider } from '../../src/providers/truefoundry';
import { VoyageEmbeddingProvider } from '../../src/providers/voyage';

import type { CancellableEmbeddingProvider } from '../../src/types/providers';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/cache')>()),
  fetchWithCache: vi.fn(),
  isCacheEnabled: () => false,
}));

describe('embedding transport cancellation', () => {
  const openAiConfig = { apiKey: 'test-key', apiBaseUrl: 'https://models.example/v1' };
  const mistral = () => new MistralEmbeddingProvider({ config: { apiKey: 'test-key' } });
  let signals: unknown[];
  // Record the signal a transport received, then fail the way an aborted request does.
  const rejectAborted = async (signal: AbortSignal | null | undefined): Promise<never> => {
    signals.push(signal);
    throw signal?.reason ?? new Error('Transport received no cancellation signal');
  };

  beforeEach(() => {
    vi.resetAllMocks();
    signals = [];
    vi.mocked(fetchWithCache).mockImplementation(async (url, options) => {
      if (String(url).endsWith('/models')) {
        signals.push(options?.signal);
        return { data: { data: [{ id: 'model' }] } } as never;
      }
      return rejectAborted(options?.signal);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each<[string, () => unknown]>([
    [
      'OpenAI',
      () => new OpenAiEmbeddingProvider('text-embedding-3-small', { config: openAiConfig }),
    ],
    ['Azure', () => new AzureEmbeddingProvider('model', { config: openAiConfig })],
    ['Cohere', () => new CohereEmbeddingProvider('model', { apiKey: 'test-key' })],
    ['Docker', () => new DMREmbeddingProvider('model', { config: openAiConfig })],
    [
      'AI Studio',
      () =>
        new AIStudioEmbeddingProvider('gemini-embedding-001', { config: { apiKey: 'test-key' } }),
    ],
    ['Hugging Face', () => new HuggingfaceFeatureExtractionProvider('model')],
    ['LiteLLM', () => createLiteLLMProvider('litellm:embedding:model')],
    ['LocalAI', () => new LocalAiEmbeddingProvider('model')],
    ['Mistral', mistral],
    ['Ollama', () => new OllamaEmbeddingProvider('model')],
    ['TrueFoundry', () => new TrueFoundryEmbeddingProvider('model', { config: openAiConfig })],
    ['Voyage', () => new VoyageEmbeddingProvider('model', { apiKey: 'test-key' })],
    [
      'Bedrock',
      () => {
        const provider = new AwsBedrockEmbeddingProvider('amazon.titan-embed-text-v1');
        vi.spyOn(provider, 'getBedrockInstance').mockResolvedValue({
          invokeModel: (_command: unknown, options?: { abortSignal?: AbortSignal }) =>
            rejectAborted(options?.abortSignal),
        } as never);
        return provider;
      },
    ],
    [
      'Vertex',
      () => {
        const provider = new VertexEmbeddingProvider('gemini-embedding-001');
        vi.spyOn(provider, 'getProjectId').mockResolvedValue('fixture-project');
        vi.spyOn(provider, 'getClientWithCredentials').mockResolvedValue({
          request: (options: { signal?: AbortSignal }) => rejectAborted(options.signal),
        } as never);
        return provider;
      },
    ],
    [
      'SageMaker',
      () => {
        const provider = new SageMakerEmbeddingProvider('endpoint', {
          config: { modelType: 'custom' },
        });
        vi.spyOn(provider, 'getSageMakerRuntimeInstance').mockResolvedValue({
          send: (_command: unknown, options?: { abortSignal?: AbortSignal }) =>
            rejectAborted(options?.abortSignal),
        } as never);
        return provider;
      },
    ],
  ])('passes cancellation to the %s request and rejects with its reason', async (_name, create) => {
    const provider = create() as CancellableEmbeddingProvider;
    const reason = new Error('evaluation cancelled');
    const abortSignal = AbortSignal.abort(reason);

    expect(provider.supportsEmbeddingCancellation).toBe(true);
    await expect(provider.callEmbeddingApi('text', undefined, { abortSignal })).rejects.toBe(
      reason,
    );
    expect(new Set(signals)).toEqual(new Set([abortSignal]));
  });

  it('cancels the SageMaker request delay before calling the endpoint', async () => {
    const provider = new SageMakerEmbeddingProvider('endpoint', {
      config: { modelType: 'custom', delay: 60_000 },
    });
    const runtime = vi.spyOn(provider, 'getSageMakerRuntimeInstance');
    const reason = new Error('evaluation cancelled');

    await expect(
      provider.callEmbeddingApi('text', undefined, { abortSignal: AbortSignal.abort(reason) }),
    ).rejects.toBe(reason);
    expect(runtime).not.toHaveBeenCalled();
  });

  it('shares identical Mistral requests only between callers with the same signal', async () => {
    const pending = new Map<AbortSignal, (value: unknown) => void>();
    vi.mocked(fetchWithCache).mockImplementation(
      (_url, options) =>
        new Promise((resolve, reject) => {
          const signal = options!.signal!;
          pending.set(signal, resolve as (value: unknown) => void);
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
    );
    const provider = mistral();
    const first = new AbortController();
    const second = new AbortController();
    const embed = ({ signal }: AbortController) =>
      provider.callEmbeddingApi('same text', undefined, { abortSignal: signal });
    const shared = Promise.allSettled([embed(first), embed(first)]);
    const independent = embed(second);
    void independent.catch(() => {});

    try {
      await vi.waitFor(() => expect(pending.size).toBe(2));
      expect(fetchWithCache).toHaveBeenCalledTimes(2);
      const reason = new Error('first evaluation cancelled');
      first.abort(reason);
      await expect(shared).resolves.toEqual([
        { status: 'rejected', reason },
        { status: 'rejected', reason },
      ]);
      pending.get(second.signal)!({ data: { data: [{ embedding: [1, 0] }] }, cached: false });
      await expect(independent).resolves.toMatchObject({ embedding: [1, 0] });
    } finally {
      first.abort();
      second.abort();
      await Promise.allSettled([shared, independent]);
    }
  });
});
