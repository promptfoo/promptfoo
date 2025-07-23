import { fetchWithCache } from '../../src/cache';
import {
  OllamaChatProvider,
  OllamaCompletionProvider,
  OllamaEmbeddingProvider,
} from '../../src/providers/ollama';

import type { CallApiContextParams } from '../../src/types';

jest.mock('../../src/cache');

describe('OllamaCompletionProvider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should construct with model name and options', () => {
    const provider = new OllamaCompletionProvider('llama2', {
      id: 'custom-id',
      config: { temperature: 0.7 },
    });
    expect(provider.modelName).toBe('llama2');
    expect(provider.config.temperature).toBe(0.7);
    expect(provider.id()).toBe('custom-id');
  });

  it('should call API and return response', async () => {
    const mockResponse = {
      data: '{"response":"test response","done":true}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaCompletionProvider('llama2');
    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      output: 'test response',
    });
  });

  it('should handle multiple response chunks', async () => {
    const mockResponse = {
      data: '{"response":"test response","done":false}\n{"response":" more","done":true}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaCompletionProvider('llama2');
    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      output: 'test response more',
    });
  });

  it('should handle API errors', async () => {
    jest.mocked(fetchWithCache).mockRejectedValue(new Error('API error'));

    const provider = new OllamaCompletionProvider('llama2');
    const result = await provider.callApi('test prompt');

    expect(result.error).toContain('API call error: Error: API error');
  });

  it('should handle API response with error field', async () => {
    const mockResponse = {
      data: { error: 'some error occurred' },
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaCompletionProvider('llama2');
    const result = await provider.callApi('test prompt');

    expect(result.error).toBe('Ollama error: some error occurred');
  });

  it('should handle invalid JSON response', async () => {
    const mockResponse = {
      data: 'invalid json',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaCompletionProvider('llama2');
    const result = await provider.callApi('test prompt');

    expect(result.error).toContain('Ollama API response error:');
  });

  it('should use default id when not provided', () => {
    const provider = new OllamaCompletionProvider('llama2');
    expect(provider.id()).toBe('ollama:completion:llama2');
  });

  it('should handle toString method', () => {
    const provider = new OllamaCompletionProvider('llama2');
    expect(provider.toString()).toBe('[Ollama Completion Provider llama2]');
  });

  it('should extract token usage from response', async () => {
    const mockResponse = {
      data: '{"response":"test response","done":false,"prompt_eval_count":26}\n{"response":" more","done":true,"prompt_eval_count":26,"eval_count":259}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaCompletionProvider('llama2');
    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      output: 'test response more',
      tokenUsage: {
        prompt: 26,
        completion: 259,
        total: 285,
      },
    });
  });

  it('should handle missing token usage gracefully', async () => {
    const mockResponse = {
      data: '{"response":"test response","done":true}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaCompletionProvider('llama2');
    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      output: 'test response',
    });
  });

  it('should handle partial token usage (only prompt_eval_count)', async () => {
    const mockResponse = {
      data: '{"response":"test response","done":true,"prompt_eval_count":26}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaCompletionProvider('llama2');
    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      output: 'test response',
      tokenUsage: {
        prompt: 26,
        completion: 0,
        total: 26,
      },
    });
  });

  it('should handle partial token usage (only eval_count)', async () => {
    const mockResponse = {
      data: '{"response":"test response","done":true,"eval_count":259}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaCompletionProvider('llama2');
    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      output: 'test response',
      tokenUsage: {
        prompt: 0,
        completion: 259,
        total: 259,
      },
    });
  });
});

describe('OllamaChatProvider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should construct with model name and options', () => {
    const provider = new OllamaChatProvider('llama2', {
      id: 'custom-id',
      config: { temperature: 0.7 },
    });
    expect(provider.modelName).toBe('llama2');
    expect(provider.config.temperature).toBe(0.7);
    expect(provider.id()).toBe('custom-id');
  });

  it('should call chat API and return response', async () => {
    const mockResponse = {
      data: '{"message":{"role":"assistant","content":"test response","images":null},"done":true}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaChatProvider('llama2');
    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      output: 'test response',
    });
  });

  it('should handle multiple chat response chunks', async () => {
    const mockResponse = {
      data: '{"message":{"role":"assistant","content":"test response","images":null},"done":false}\n{"message":{"role":"assistant","content":" more","images":null},"done":true}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaChatProvider('llama2');
    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      output: 'test response more',
    });
  });

  it('should handle chat API errors', async () => {
    jest.mocked(fetchWithCache).mockRejectedValue(new Error('API error'));

    const provider = new OllamaChatProvider('llama2');
    const result = await provider.callApi('test prompt');

    expect(result.error).toContain('API call error: Error: API error');
  });

  it('should handle chat API response with error field', async () => {
    const mockResponse = {
      data: { error: 'chat error occurred' },
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaChatProvider('llama2');
    const result = await provider.callApi('test prompt');

    expect(result.error).toBe('Ollama error: chat error occurred');
  });

  it('should handle invalid JSON response', async () => {
    const mockResponse = {
      data: 'invalid json',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaChatProvider('llama2');
    const result = await provider.callApi('test prompt');

    expect(result.error).toContain('Ollama API response error:');
  });

  it('should use default id when not provided', () => {
    const provider = new OllamaChatProvider('llama2');
    expect(provider.id()).toBe('ollama:chat:llama2');
  });

  it('should handle toString method', () => {
    const provider = new OllamaChatProvider('llama2');
    expect(provider.toString()).toBe('[Ollama Chat Provider llama2]');
  });

  it('should handle tools configuration', async () => {
    const provider = new OllamaChatProvider('llama2', {
      config: {
        tools: [{ name: 'test-tool' }],
      },
    });
    const mockResponse = {
      data: '{"message":{"role":"assistant","content":"test response","images":null},"done":true}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const context: CallApiContextParams = {
      prompt: { raw: 'test prompt', label: 'test' },
      vars: { test: 'value' },
      debug: true,
    };

    await provider.callApi('test prompt', context);

    expect(jest.mocked(fetchWithCache).mock.calls[0]).toBeDefined();
    const call = jest.mocked(fetchWithCache).mock.calls[0] as any;
    expect(JSON.parse(call[1].body)).toMatchObject({
      tools: [{ name: 'test-tool' }],
    });
    expect(call[4]).toBe(true);
  });

  it('should handle context bustCache parameter', async () => {
    const provider = new OllamaChatProvider('llama2');
    const mockResponse = {
      data: '{"message":{"role":"assistant","content":"test response","images":null},"done":true}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const context: CallApiContextParams = {
      prompt: { raw: 'test prompt', label: 'test' },
      vars: {},
      bustCache: true,
    };

    await provider.callApi('test prompt', context);

    expect(jest.mocked(fetchWithCache).mock.calls[0]).toBeDefined();
    const call = jest.mocked(fetchWithCache).mock.calls[0] as any;
    expect(call[4]).toBe(true);
  });

  it('should extract token usage from chat response', async () => {
    const mockResponse = {
      data: '{"message":{"role":"assistant","content":"test response","images":null},"done":false,"prompt_eval_count":26}\n{"message":{"role":"assistant","content":" more","images":null},"done":true,"prompt_eval_count":26,"eval_count":259}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaChatProvider('llama2');
    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      output: 'test response more',
      tokenUsage: {
        prompt: 26,
        completion: 259,
        total: 285,
      },
    });
  });

  it('should handle missing token usage gracefully in chat', async () => {
    const mockResponse = {
      data: '{"message":{"role":"assistant","content":"test response","images":null},"done":true}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaChatProvider('llama2');
    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      output: 'test response',
    });
  });

  it('should handle partial token usage in chat (only prompt_eval_count)', async () => {
    const mockResponse = {
      data: '{"message":{"role":"assistant","content":"test response","images":null},"done":true,"prompt_eval_count":26}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaChatProvider('llama2');
    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      output: 'test response',
      tokenUsage: {
        prompt: 26,
        completion: 0,
        total: 26,
      },
    });
  });

  it('should handle partial token usage in chat (only eval_count)', async () => {
    const mockResponse = {
      data: '{"message":{"role":"assistant","content":"test response","images":null},"done":true,"eval_count":259}\n',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaChatProvider('llama2');
    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      output: 'test response',
      tokenUsage: {
        prompt: 0,
        completion: 259,
        total: 259,
      },
    });
  });
});

describe('OllamaEmbeddingProvider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should call embeddings API and return response', async () => {
    const mockResponse = {
      data: {
        embedding: [0.1, 0.2, 0.3],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaEmbeddingProvider('llama2');
    const result = await provider.callEmbeddingApi('test text');

    expect(result).toEqual({
      embedding: [0.1, 0.2, 0.3],
    });
  });

  it('should handle embeddings API errors', async () => {
    jest.mocked(fetchWithCache).mockRejectedValue(new Error('API error'));

    const provider = new OllamaEmbeddingProvider('llama2');
    const result = await provider.callEmbeddingApi('test text');

    expect(result.error).toBe('API call error: Error: API error');
  });

  it('should handle missing embedding in response', async () => {
    const mockResponse = {
      data: {},
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaEmbeddingProvider('llama2');
    const result = await provider.callEmbeddingApi('test text');

    expect(result.error).toContain('No embedding found in Ollama embeddings API response');
  });

  it('should handle invalid JSON response', async () => {
    const mockResponse = {
      data: 'invalid json',
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    };

    jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const provider = new OllamaEmbeddingProvider('llama2');
    const result = await provider.callEmbeddingApi('test text');

    expect(result.error).toContain('API response error:');
  });
});
