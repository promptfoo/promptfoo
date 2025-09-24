import { fetchWithCache } from '../../src/cache';
import {
  clearCometApiModelsCache,
  createCometApiProvider,
  fetchCometApiModels,
} from '../../src/providers/cometapi';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { OpenAiCompletionProvider } from '../../src/providers/openai/completion';
import { OpenAiEmbeddingProvider } from '../../src/providers/openai/embedding';

jest.mock('../../src/providers/openai/chat', () => ({
  OpenAiChatCompletionProvider: jest.fn(),
}));
jest.mock('../../src/providers/openai/completion', () => ({
  OpenAiCompletionProvider: jest.fn(),
}));
jest.mock('../../src/providers/openai/embedding', () => ({
  OpenAiEmbeddingProvider: jest.fn(),
}));
jest.mock('../../src/cache');

describe('createCometApiProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  it('defaults to chat provider when no type specified', () => {
    const provider = createCometApiProvider('cometapi:model-name');
    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('model-name', expect.any(Object));
  });
});

describe('fetchCometApiModels', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearCometApiModelsCache();
  });

  it('fetches models from endpoint with auth header when provided', async () => {
    jest.mocked(fetchWithCache).mockResolvedValue({
      data: { data: [{ id: 'chatgpt-4o-latest' }, { id: 'deepseek-v3' }, { id: 'sdxl' }] },
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
    // sdxl filtered out by ignore patterns
    expect(models).toEqual([{ id: 'chatgpt-4o-latest' }, { id: 'deepseek-v3' }]);
  });

  it('uses cache on subsequent calls', async () => {
    jest.mocked(fetchWithCache).mockResolvedValue({
      data: { data: [{ id: 'gpt-5-mini' }] },
      cached: false,
      status: 200,
      statusText: 'OK',
    } as any);

    const first = await fetchCometApiModels();
    jest.mocked(fetchWithCache).mockClear();
    const second = await fetchCometApiModels();

    expect(first).toEqual(second);
    expect(fetchWithCache).not.toHaveBeenCalled();
  });
});
