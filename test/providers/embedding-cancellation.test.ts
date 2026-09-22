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
  beforeEach(() => vi.mocked(fetchWithCache).mockReset());
  afterEach(() => vi.restoreAllMocks());

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
    const result = provider.callEmbeddingApi!('text', undefined, {
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
      await settled;
    } finally {
      controller.abort(reason);
      await settled;
    }
  });

  it.each(['Bedrock', 'Vertex'] as const)(
    'forwards cancellation to the %s SDK request',
    async (name) => {
      const controller = new AbortController();
      const { started, hold } = heldRequest();
      const provider =
        name === 'Bedrock'
          ? new AwsBedrockEmbeddingProvider('amazon.titan-embed-text-v1')
          : new VertexEmbeddingProvider('gemini-embedding-001');

      if (provider instanceof AwsBedrockEmbeddingProvider) {
        vi.spyOn(provider, 'getBedrockInstance').mockResolvedValue({
          invokeModel: vi.fn((_command, options) => hold(options?.abortSignal)),
        } as never);
      } else {
        vi.spyOn(provider, 'getProjectId').mockResolvedValue('fixture-project');
        vi.spyOn(provider, 'getClientWithCredentials').mockResolvedValue({
          request: vi.fn((options) => hold(options?.signal)),
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
        expect(actual).toBe(controller.signal);
        controller.abort();
        expect(actual.aborted).toBe(true);
        await settled;
      } finally {
        controller.abort();
        await settled;
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
