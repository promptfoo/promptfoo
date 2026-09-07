import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import {
  AIStudioChatProvider,
  AIStudioEmbeddingProvider,
} from '../../src/providers/google/ai.studio';
import { GoogleProvider } from '../../src/providers/google/provider';
import {
  HuggingfaceFeatureExtractionProvider,
  HuggingfaceSentenceSimilarityProvider,
  HuggingfaceTextClassificationProvider,
  HuggingfaceTextGenerationProvider,
  HuggingfaceTokenExtractionProvider,
} from '../../src/providers/huggingface';
import {
  OllamaChatProvider,
  OllamaCompletionProvider,
  OllamaEmbeddingProvider,
} from '../../src/providers/ollama';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { OpenAiCompletionProvider } from '../../src/providers/openai/completion';
import { OpenAiEmbeddingProvider } from '../../src/providers/openai/embedding';
import { OpenAiModerationProvider } from '../../src/providers/openai/moderation';
import { createDeferred } from '../util/utils';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
  isCacheEnabled: () => false,
}));
vi.mock('../../src/logger');

beforeEach(() => {
  vi.mocked(fetchWithCache).mockReset();
});

const config = { config: { apiKey: 'fixture-key' } };
const textProviders = [
  ['Hugging Face generation', () => new HuggingfaceTextGenerationProvider('fixture-model', config)],
  [
    'Hugging Face classification via callApi',
    () => new HuggingfaceTextClassificationProvider('fixture-model', config),
  ],
  ['Ollama chat', () => new OllamaChatProvider('fixture-model')],
  ['Ollama completion', () => new OllamaCompletionProvider('fixture-model')],
  ['OpenAI chat', () => new OpenAiChatCompletionProvider('gpt-4o-mini', config)],
  ['OpenAI completion', () => new OpenAiCompletionProvider('gpt-3.5-turbo-instruct', config)],
  ['AI Studio', () => new AIStudioChatProvider('gemini-2.5-flash', config)],
  [
    'Google',
    () =>
      new GoogleProvider('gemini-2.5-flash', {
        config: { apiKey: 'fixture-key', vertexai: false },
      }),
  ],
] as const;
const embeddingProviders = [
  [
    'Hugging Face embeddings',
    () => new HuggingfaceFeatureExtractionProvider('fixture-model', config),
  ],
  ['Ollama embeddings', () => new OllamaEmbeddingProvider('fixture-model')],
  ['OpenAI embeddings', () => new OpenAiEmbeddingProvider('text-embedding-3-small', config)],
  ['AI Studio embeddings', () => new AIStudioEmbeddingProvider('gemini-embedding-001', config)],
] as const;

const operations = [
  ...[HuggingfaceTextClassificationProvider, HuggingfaceTokenExtractionProvider].map(
    (Provider) => ({
      name: Provider.name,
      call: (abortSignal: AbortSignal) =>
        new Provider('fixture-model', config).callClassificationApi('hello', undefined, {
          abortSignal,
        }),
    }),
  ),
  {
    name: 'Hugging Face similarity',
    call: (abortSignal: AbortSignal) =>
      new HuggingfaceSentenceSimilarityProvider('fixture-model', config).callSimilarityApi(
        'hello',
        'hello',
        undefined,
        { abortSignal },
      ),
  },
  {
    name: 'OpenAI moderation',
    call: (abortSignal: AbortSignal) =>
      new OpenAiModerationProvider('omni-moderation-latest', config).callModerationApi(
        'hello',
        'hello',
        undefined,
        { abortSignal },
      ),
  },
  ...textProviders.map(([name, create]) => ({
    name,
    call: (abortSignal: AbortSignal) => create().callApi('hello', undefined, { abortSignal }),
  })),
  ...embeddingProviders.map(([name, create]) => ({
    name,
    call: (abortSignal: AbortSignal) =>
      create().callEmbeddingApi('hello', undefined, { abortSignal }),
  })),
];

describe.each(operations)('$name cancellation', ({ call }) => {
  it('does not dispatch an already-cancelled request', async () => {
    const signal = AbortSignal.abort(new Error('fixture cancellation'));
    await expect(call(signal)).rejects.toThrow('fixture cancellation');
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('forwards cancellation to an in-flight transport', async () => {
    const controller = new AbortController();
    const started = createDeferred<void>();
    vi.mocked(fetchWithCache).mockImplementation(async (_url, request) => {
      expect(request?.signal).toBe(controller.signal);
      started.resolve();
      return new Promise((_resolve, reject) => {
        controller.signal.addEventListener('abort', () => reject(controller.signal.reason), {
          once: true,
        });
      });
    });
    const pending = call(controller.signal);
    void pending.catch(started.reject);
    await started.promise;
    controller.abort(new Error('fixture cancellation'));
    const response = await pending;
    expect(response.error).toContain('fixture cancellation');
    expect(fetchWithCache).toHaveBeenCalledOnce();
  });
});

it('keeps concurrent moderation calls in separate cancellation scopes', async () => {
  const first = new AbortController();
  const second = new AbortController();
  const bothStarted = createDeferred<void>();
  let count = 0;
  const finishSecond = createDeferred<Awaited<ReturnType<typeof fetchWithCache>>>();
  vi.mocked(fetchWithCache).mockImplementation(async (_url, request) => {
    if (++count === 2) {
      bothStarted.resolve();
    }
    if (request?.signal === first.signal) {
      return new Promise((_resolve, reject) =>
        first.signal.addEventListener('abort', () => reject(first.signal.reason), { once: true }),
      );
    }
    expect(request?.signal).toBe(second.signal);
    return finishSecond.promise;
  });
  const provider = new OpenAiModerationProvider('omni-moderation-latest', config);
  const a = provider.callModerationApi('hello', 'hello', undefined, { abortSignal: first.signal });
  const b = provider.callModerationApi('hello', 'hello', undefined, { abortSignal: second.signal });
  await bothStarted.promise;
  first.abort(new Error('first cancelled'));
  expect((await a).error).toContain('first cancelled');
  expect(second.signal.aborted).toBe(false);
  finishSecond.resolve({
    data: { results: [{ categories: {}, category_scores: {} }] },
    status: 200,
    statusText: 'OK',
    cached: false,
  });
  expect((await b).error).toBeUndefined();
});
