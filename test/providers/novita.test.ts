import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import {
  clearNovitaModelsCache,
  createNovitaProvider,
  fetchNovitaModels,
} from '../../src/providers/novita';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { OpenAiCompletionProvider } from '../../src/providers/openai/completion';
import { OpenAiEmbeddingProvider } from '../../src/providers/openai/embedding';

vi.mock('../../src/providers/openai/chat', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    OpenAiChatCompletionProvider: vi.fn(),
  };
});
vi.mock('../../src/providers/openai/completion', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    OpenAiCompletionProvider: vi.fn(),
  };
});
vi.mock('../../src/providers/openai/embedding', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    OpenAiEmbeddingProvider: vi.fn(),
  };
});
vi.mock('../../src/cache');

describe('createNovitaProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates chat completion provider when type is chat', () => {
    const provider = createNovitaProvider('novita:chat:model-name');

    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('model-name', expect.any(Object));
  });

  it('creates completion provider when type is completion', () => {
    const provider = createNovitaProvider('novita:completion:model-name');

    expect(provider).toBeInstanceOf(OpenAiCompletionProvider);
    expect(OpenAiCompletionProvider).toHaveBeenCalledWith('model-name', expect.any(Object));
  });

  it('creates embedding provider when type is embedding', () => {
    const provider = createNovitaProvider('novita:embedding:model-name');

    expect(provider).toBeInstanceOf(OpenAiEmbeddingProvider);
    expect(OpenAiEmbeddingProvider).toHaveBeenCalledWith('model-name', expect.any(Object));
  });

  it('defaults to chat provider when no type is specified', () => {
    const provider = createNovitaProvider('novita:model-name');

    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('model-name', expect.any(Object));
  });
});

describe('fetchNovitaModels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearNovitaModelsCache();
  });

  it('fetches models from the Novita endpoint', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: { data: [{ id: 'model-a' }, { model: 'model-b' }] },
      cached: false,
      status: 200,
      statusText: 'OK',
    } as any);

    const models = await fetchNovitaModels({ NOVITA_API_KEY: 'sk-test' } as any);

    expect(fetchWithCache).toHaveBeenCalledWith(
      'https://api.novita.ai/v3/openai/models',
      { headers: { Authorization: 'Bearer sk-test' } },
      expect.any(Number),
    );
    expect(models).toEqual([{ id: 'model-a' }, { id: 'model-b' }]);
  });

  it('uses cache on subsequent calls', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: { data: [{ id: 'cached-model' }] },
      cached: false,
      status: 200,
      statusText: 'OK',
    } as any);

    const first = await fetchNovitaModels();
    vi.mocked(fetchWithCache).mockClear();
    const second = await fetchNovitaModels();

    expect(first).toEqual(second);
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('returns an empty model list when the models request fails', async () => {
    vi.mocked(fetchWithCache).mockRejectedValue(new Error('network unavailable'));

    await expect(fetchNovitaModels()).resolves.toEqual([]);
  });
});
