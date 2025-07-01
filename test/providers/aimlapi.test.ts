import { fetchWithCache } from '../../src/cache';
import {
  createAimlApiProvider,
  fetchAimlApiModels,
  clearAimlApiModelsCache,
} from '../../src/providers/aimlapi';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { OpenAiCompletionProvider } from '../../src/providers/openai/completion';
import { OpenAiEmbeddingProvider } from '../../src/providers/openai/embedding';

jest.mock('../../src/providers/openai');
jest.mock('../../src/cache');

describe('createAimlApiProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates chat completion provider when type is chat', () => {
    const provider = createAimlApiProvider('aimlapi:chat:model-name');
    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('model-name', expect.any(Object));
  });

  it('creates completion provider when type is completion', () => {
    const provider = createAimlApiProvider('aimlapi:completion:model-name');
    expect(provider).toBeInstanceOf(OpenAiCompletionProvider);
    expect(OpenAiCompletionProvider).toHaveBeenCalledWith('model-name', expect.any(Object));
  });

  it('creates embedding provider when type is embedding', () => {
    const provider = createAimlApiProvider('aimlapi:embedding:model-name');
    expect(provider).toBeInstanceOf(OpenAiEmbeddingProvider);
    expect(OpenAiEmbeddingProvider).toHaveBeenCalledWith('model-name', expect.any(Object));
  });

  it('defaults to chat provider when no type specified', () => {
    const provider = createAimlApiProvider('aimlapi:model-name');
    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('model-name', expect.any(Object));
  });
});

describe('fetchAimlApiModels', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearAimlApiModelsCache();
  });

  it('fetches models from endpoint', async () => {
    jest.mocked(fetchWithCache).mockResolvedValue({
      data: { data: [{ id: 'model-a' }, { id: 'model-b' }] },
      cached: false,
      status: 200,
      statusText: 'OK',
    } as any);

    const models = await fetchAimlApiModels();

    expect(fetchWithCache).toHaveBeenCalledWith(
      'https://api.aimlapi.com/models',
      { headers: {} },
      expect.any(Number),
    );
    expect(models).toEqual([{ id: 'model-a' }, { id: 'model-b' }]);
  });

  it('uses cache on subsequent calls', async () => {
    jest.mocked(fetchWithCache).mockResolvedValue({
      data: { data: [{ id: 'model-x' }] },
      cached: false,
      status: 200,
      statusText: 'OK',
    } as any);

    const first = await fetchAimlApiModels();
    jest.mocked(fetchWithCache).mockClear();
    const second = await fetchAimlApiModels();

    expect(first).toEqual(second);
    expect(fetchWithCache).not.toHaveBeenCalled();
  });
});
