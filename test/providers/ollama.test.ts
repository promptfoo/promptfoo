import { fetchWithCache } from '../../src/cache';
import {
  OllamaCompletionProvider,
  OllamaChatProvider,
  OllamaEmbeddingProvider,
} from '../../src/providers/ollama';
import type { CallApiContextParams, Prompt } from '../../src/types';

jest.mock('../../src/cache');

describe('OllamaCompletionProvider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const mockFetchWithCache = jest.mocked(fetchWithCache);

  it('should call completion API successfully', async () => {
    const provider = new OllamaCompletionProvider('llama2', {
      config: {
        temperature: 0.7,
      },
    });

    mockFetchWithCache.mockResolvedValueOnce({
      data:
        JSON.stringify({ response: 'test response' }) +
        '\n' +
        JSON.stringify({ response: ' more' }),
      status: 200,
      statusText: 'OK',
      headers: {},
      cached: false,
      deleteFromCache: async () => {},
    });

    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      output: 'test response more',
    });

    expect(mockFetchWithCache).toHaveBeenCalledWith(
      'http://localhost:11434/api/generate',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          model: 'llama2',
          prompt: 'test prompt',
          stream: false,
          options: {
            temperature: 0.7,
          },
        }),
      }),
      expect.any(Number),
      'text',
    );
  });

  it('should handle API errors', async () => {
    const provider = new OllamaCompletionProvider('llama2');

    mockFetchWithCache.mockRejectedValueOnce(new Error('API error'));

    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      error: expect.stringContaining('API call error: Error: API error'),
    });
  });

  it('should handle error in response data', async () => {
    const provider = new OllamaCompletionProvider('llama2');

    mockFetchWithCache.mockResolvedValueOnce({
      data: { error: 'API error message' },
      status: 400,
      statusText: 'Bad Request',
      headers: {},
      cached: false,
      deleteFromCache: async () => {},
    });

    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      error: expect.stringContaining('Ollama error: API error message'),
    });
  });

  it('should handle invalid JSON response', async () => {
    const provider = new OllamaCompletionProvider('llama2');

    mockFetchWithCache.mockResolvedValueOnce({
      data: 'invalid json',
      status: 200,
      statusText: 'OK',
      headers: {},
      cached: false,
      deleteFromCache: async () => {},
    });

    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      error: expect.stringContaining('Ollama API response error'),
    });
  });
});

describe('OllamaChatProvider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const mockFetchWithCache = jest.mocked(fetchWithCache);

  it('should call chat API successfully', async () => {
    const provider = new OllamaChatProvider('llama2', {
      config: {
        temperature: 0.7,
        tools: [{ name: 'test_tool' }],
      },
    });

    mockFetchWithCache.mockResolvedValueOnce({
      data:
        JSON.stringify({ message: { content: 'test response' } }) +
        '\n' +
        JSON.stringify({ message: { content: ' more' } }),
      status: 200,
      statusText: 'OK',
      headers: {},
      cached: false,
      deleteFromCache: async () => {},
    });

    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      output: 'test response more',
    });

    expect(mockFetchWithCache).toHaveBeenCalledWith(
      'http://localhost:11434/api/chat',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('test prompt'),
      }),
      expect.any(Number),
      'text',
    );
  });

  it('should use custom fetchWithCache from context', async () => {
    const provider = new OllamaChatProvider('llama2');
    const customFetch = jest.fn().mockResolvedValueOnce({
      data: JSON.stringify({ message: { content: 'test response' } }),
      status: 200,
      statusText: 'OK',
      headers: {},
      cached: false,
      deleteFromCache: async () => {},
    });

    const context: CallApiContextParams = {
      prompt: { raw: 'test prompt' } as Prompt,
      vars: {},
      fetchWithCache: customFetch,
    };

    await provider.callApi('test prompt', context);

    expect(customFetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/chat',
      expect.any(Object),
      expect.any(Number),
      'text',
    );
    expect(mockFetchWithCache).not.toHaveBeenCalled();
  });

  it('should handle API errors', async () => {
    const provider = new OllamaChatProvider('llama2');

    mockFetchWithCache.mockRejectedValueOnce(new Error('API error'));

    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      error: expect.stringContaining('API call error: Error: API error'),
    });
  });

  it('should handle error in response data', async () => {
    const provider = new OllamaChatProvider('llama2');

    mockFetchWithCache.mockResolvedValueOnce({
      data: { error: 'API error message' },
      status: 400,
      statusText: 'Bad Request',
      headers: {},
      cached: false,
      deleteFromCache: async () => {},
    });

    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      error: expect.stringContaining('Ollama error: API error message'),
    });
  });

  it('should handle invalid JSON response', async () => {
    const provider = new OllamaChatProvider('llama2');

    mockFetchWithCache.mockResolvedValueOnce({
      data: 'invalid json',
      status: 200,
      statusText: 'OK',
      headers: {},
      cached: false,
      deleteFromCache: async () => {},
    });

    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      error: expect.stringContaining('Ollama API response error'),
    });
  });
});

describe('OllamaEmbeddingProvider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const mockFetchWithCache = jest.mocked(fetchWithCache);

  it('should call embedding API successfully', async () => {
    const provider = new OllamaEmbeddingProvider('llama2');

    mockFetchWithCache.mockResolvedValueOnce({
      data: {
        embedding: [0.1, 0.2, 0.3],
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      cached: false,
      deleteFromCache: async () => {},
    });

    const result = await provider.callEmbeddingApi('test text');

    expect(result).toEqual({
      embedding: [0.1, 0.2, 0.3],
    });

    expect(mockFetchWithCache).toHaveBeenCalledWith(
      'http://localhost:11434/api/embeddings',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          model: 'llama2',
          prompt: 'test text',
        }),
      }),
      expect.any(Number),
      'json',
    );
  });

  it('should handle API errors', async () => {
    const provider = new OllamaEmbeddingProvider('llama2');

    mockFetchWithCache.mockRejectedValueOnce(new Error('API error'));

    const result = await provider.callEmbeddingApi('test text');

    expect(result).toEqual({
      error: expect.stringContaining('API call error: Error: API error'),
    });
  });

  it('should handle missing embedding in response', async () => {
    const provider = new OllamaEmbeddingProvider('llama2');

    mockFetchWithCache.mockResolvedValueOnce({
      data: {},
      status: 200,
      statusText: 'OK',
      headers: {},
      cached: false,
      deleteFromCache: async () => {},
    });

    const result = await provider.callEmbeddingApi('test text');

    expect(result).toEqual({
      error: expect.stringContaining('No embedding found in Ollama embeddings API response'),
    });
  });
});
