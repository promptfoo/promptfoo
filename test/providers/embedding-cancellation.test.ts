import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import logger from '../../src/logger';
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

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/cache')>()),
  fetchWithCache: vi.fn(),
  isCacheEnabled: () => false,
}));

function heldRequest() {
  let markStarted!: (signal: AbortSignal) => void;
  const started = new Promise<AbortSignal>((resolve) => {
    markStarted = resolve;
  });
  const hold = (signal: AbortSignal | null | undefined) => {
    if (!signal) {
      throw new Error('Embedding transport received no cancellation signal');
    }
    markStarted(signal);
    return new Promise<never>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  };
  return { started, hold };
}

describe('embedding transport cancellation', () => {
  beforeEach(() => {
    vi.mocked(fetchWithCache).mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const openAiConfig = { apiKey: 'test-key', apiBaseUrl: 'https://models.example/v1' };
  const mistral = () => new MistralEmbeddingProvider({ config: { apiKey: 'test-key' } });

  it.each([
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
  ] as const)('forwards cancellation to the %s HTTP request', async (name, createProvider) => {
    const controller = new AbortController();
    const reason = new Error('evaluation cancelled');
    const { started, hold } = heldRequest();
    vi.mocked(fetchWithCache).mockImplementation((url, options) => {
      if (name === 'Docker' && String(url).endsWith('/models')) {
        expect(options?.signal).toBe(controller.signal);
        return Promise.resolve({ data: { data: [{ id: 'model' }] } }) as never;
      }
      return hold(options?.signal);
    });

    const provider = createProvider();
    expect(provider.supportsEmbeddingCancellation).toBe(true);
    const callEmbedding = provider.callEmbeddingApi as OpenAiEmbeddingProvider['callEmbeddingApi'];
    const result = callEmbedding.call(provider, 'text', undefined, {
      abortSignal: controller.signal,
    });
    const settled = result.then(
      () => undefined,
      () => undefined,
    );
    try {
      const actual = await Promise.race([
        started,
        result.then(() => {
          throw new Error('Embedding unexpectedly finished');
        }),
      ]);
      expect(actual).toBe(controller.signal);
      controller.abort(reason);
      expect(actual.reason).toBe(reason);
      await expect(result).rejects.toBe(reason);
    } finally {
      controller.abort(reason);
      await settled;
    }
  });

  it.each(['Bedrock', 'Vertex', 'SageMaker'] as const)(
    'forwards cancellation to the %s SDK request',
    async (name) => {
      const controller = new AbortController();
      const reason = new DOMException('evaluation cancelled', 'AbortError');
      const { started, hold } = heldRequest();
      const provider =
        name === 'Bedrock'
          ? new AwsBedrockEmbeddingProvider('amazon.titan-embed-text-v1')
          : name === 'Vertex'
            ? new VertexEmbeddingProvider('gemini-embedding-001')
            : new SageMakerEmbeddingProvider('endpoint', { config: { modelType: 'custom' } });
      expect(provider.supportsEmbeddingCancellation).toBe(true);

      if (provider instanceof AwsBedrockEmbeddingProvider) {
        vi.spyOn(provider, 'getBedrockInstance').mockResolvedValue({
          invokeModel: vi.fn((_command, options) => hold(options?.abortSignal)),
        } as never);
      } else if (provider instanceof VertexEmbeddingProvider) {
        vi.spyOn(provider, 'getProjectId').mockResolvedValue('fixture-project');
        vi.spyOn(provider, 'getClientWithCredentials').mockResolvedValue({
          request: vi.fn((options) => hold(options?.signal)),
        } as never);
      } else {
        vi.spyOn(provider, 'getSageMakerRuntimeInstance').mockResolvedValue({
          send: vi.fn((_command, options) => hold(options?.abortSignal)),
        } as never);
      }

      const result = provider.callEmbeddingApi('text', undefined, {
        abortSignal: controller.signal,
      });
      const settled = result.then(
        () => undefined,
        () => undefined,
      );
      try {
        const actual = await Promise.race([
          started,
          result.then(() => {
            throw new Error('Embedding unexpectedly finished');
          }),
        ]);
        if (name !== 'SageMaker') {
          expect(actual).toBe(controller.signal);
        }
        expect(actual.aborted).toBe(false);
        controller.abort(reason);
        expect(actual.reason).toBe(reason);
        await expect(result).rejects.toBe(reason);
      } finally {
        controller.abort();
        await settled;
      }
    },
  );

  it('cancels the SageMaker embedding delay before starting an SDK request', async () => {
    const controller = new AbortController();
    const reason = new Error('cancel SageMaker delay');
    const provider = new SageMakerEmbeddingProvider('endpoint', {
      config: { modelType: 'custom', delay: 60_000 },
    });
    const runtime = vi.spyOn(provider, 'getSageMakerRuntimeInstance');
    const debug = vi.spyOn(logger, 'debug');
    const embedding = provider.callEmbeddingApi('text', undefined, {
      abortSignal: controller.signal,
    });
    void embedding.catch(() => {});
    await vi.waitFor(() =>
      expect(debug).toHaveBeenCalledWith(expect.stringContaining('Applying delay')),
    );
    controller.abort(reason);
    await expect(embedding).rejects.toBe(reason);
    expect(runtime).not.toHaveBeenCalled();
  });

  it.each(['success', 'cancellation'] as const)(
    'shares identical Mistral requests with the same signal through %s',
    async (outcome) => {
      const controller = new AbortController();
      let release!: () => void;
      const started = new Promise<void>((resolve) => {
        vi.mocked(fetchWithCache).mockImplementation((_url, options) => {
          const signal = options?.signal;
          if (!signal) {
            throw new Error('Mistral transport received no cancellation signal');
          }
          resolve();
          return new Promise((resolveResponse, reject) => {
            release = () =>
              resolveResponse({ data: { data: [{ embedding: [1, 0] }] }, cached: false } as never);
            signal.addEventListener('abort', () => reject(signal.reason), { once: true });
          });
        });
      });
      const provider = mistral();
      const call = () =>
        provider.callEmbeddingApi('same text', undefined, { abortSignal: controller.signal });
      const first = call();
      const second = call();
      void first.catch(() => {});
      void second.catch(() => {});
      try {
        await started;
        expect(fetchWithCache).toHaveBeenCalledTimes(1);
        if (outcome === 'cancellation') {
          const reason = new DOMException('evaluation cancelled', 'AbortError');
          controller.abort(reason);
          await expect(first).rejects.toBe(reason);
          await expect(second).rejects.toBe(reason);
        } else {
          release();
          await expect(first).resolves.toMatchObject({ embedding: [1, 0] });
          await expect(second).resolves.toMatchObject({ embedding: [1, 0] });
        }
      } finally {
        controller.abort();
        await Promise.allSettled([first, second]);
      }
    },
  );

  it('does not share identical Mistral requests across independent cancellation signals', async () => {
    const firstController = new AbortController();
    const secondController = new AbortController();
    const pending = new Map<AbortSignal, (value: unknown) => void>();
    vi.mocked(fetchWithCache).mockImplementation((_url, options) => {
      const signal = options?.signal;
      if (!signal) {
        throw new Error('Mistral transport received no cancellation signal');
      }
      return new Promise((resolve, reject) => {
        pending.set(signal, resolve as (value: unknown) => void);
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    });
    const provider = mistral();
    const first = provider.callEmbeddingApi('same text', undefined, {
      abortSignal: firstController.signal,
    });
    const second = provider.callEmbeddingApi('same text', undefined, {
      abortSignal: secondController.signal,
    });
    void first.catch(() => {});
    void second.catch(() => {});
    try {
      await vi.waitFor(() => expect(pending.size).toBe(2));
      const reason = new Error('first evaluation cancelled');
      firstController.abort(reason);
      await expect(first).rejects.toBe(reason);
      expect(secondController.signal.aborted).toBe(false);
      pending.get(secondController.signal)!({
        data: { data: [{ embedding: [1, 0] }] },
        cached: false,
      });
      await expect(second).resolves.toMatchObject({ embedding: [1, 0] });
    } finally {
      firstController.abort();
      secondController.abort();
      await Promise.allSettled([first, second]);
    }
  });
});
