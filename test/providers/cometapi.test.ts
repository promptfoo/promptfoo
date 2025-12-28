import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import {
  CometApiImageProvider,
  clearCometApiModelsCache,
  createCometApiProvider,
  fetchCometApiModels,
} from '../../src/providers/cometapi';
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

describe('createCometApiProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates chat completion provider when type is chat', () => {
    const provider = createCometApiProvider('cometapi:chat:model-name');
    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('model-name', expect.any(Object));
  });

  it('creates completion provider when type is completion', () => {
    const provider = createCometApiProvider('cometapi:completion:model-name');
    expect(provider).toBeInstanceOf(OpenAiCompletionProvider);
    expect(OpenAiCompletionProvider).toHaveBeenCalledWith('model-name', expect.any(Object));
  });

  it('creates embedding provider when type is embedding', () => {
    const provider = createCometApiProvider('cometapi:embedding:model-name');
    expect(provider).toBeInstanceOf(OpenAiEmbeddingProvider);
    expect(OpenAiEmbeddingProvider).toHaveBeenCalledWith('model-name', expect.any(Object));
  });

  it('creates image provider when type is image', () => {
    const provider = createCometApiProvider('cometapi:image:dall-e-3');
    expect(provider).toBeInstanceOf(CometApiImageProvider);
  });

  it('works with any user-specified model name', () => {
    const provider1 = createCometApiProvider('cometapi:chat:my-custom-model');
    expect(provider1).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
      'my-custom-model',
      expect.any(Object),
    );

    const provider2 = createCometApiProvider('cometapi:image:any-image-model');
    expect(provider2).toBeInstanceOf(CometApiImageProvider);

    const provider3 = createCometApiProvider('cometapi:embedding:custom-embeddings');
    expect(provider3).toBeInstanceOf(OpenAiEmbeddingProvider);
    expect(OpenAiEmbeddingProvider).toHaveBeenCalledWith('custom-embeddings', expect.any(Object));
  });

  it('defaults to chat provider when no type specified', () => {
    const provider = createCometApiProvider('cometapi:any-model-name');
    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('any-model-name', expect.any(Object));
  });
});

describe('fetchCometApiModels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCometApiModelsCache();
  });

  it('fetches all models from endpoint without filtering', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: {
        data: [
          { id: 'gpt-4o' },
          { id: 'claude-3-5-sonnet' },
          { id: 'dall-e-3' },
          { id: 'text-embedding-3-small' },
          { id: 'whisper-1' }, // Audio model - now included
          { id: 'custom-user-model' }, // User's custom model
        ],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    } as any);

    const models = await fetchCometApiModels({ COMETAPI_KEY: 'sk-test' } as any);

    expect(fetchWithCache).toHaveBeenCalledWith(
      'https://api.cometapi.com/v1/models',
      { headers: { Accept: 'application/json', Authorization: 'Bearer sk-test' } },
      expect.any(Number),
    );
    // All models should be included - no filtering based on model names
    expect(models).toEqual([
      { id: 'gpt-4o' },
      { id: 'claude-3-5-sonnet' },
      { id: 'dall-e-3' },
      { id: 'text-embedding-3-small' },
      { id: 'whisper-1' },
      { id: 'custom-user-model' },
    ]);
  });

  it('uses cache on subsequent calls', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: { data: [{ id: 'gpt-5-mini' }] },
      cached: false,
      status: 200,
      statusText: 'OK',
    } as any);

    const first = await fetchCometApiModels();
    vi.mocked(fetchWithCache).mockClear();
    const second = await fetchCometApiModels();

    expect(first).toEqual(second);
    expect(fetchWithCache).not.toHaveBeenCalled();
  });
});
