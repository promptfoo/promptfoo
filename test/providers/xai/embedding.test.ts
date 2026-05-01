import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { disableCache, enableCache, fetchWithCache } from '../../../src/cache';
import {
  createXAIEmbeddingProvider,
  XAIEmbeddingProvider,
} from '../../../src/providers/xai/embedding';
import { mockProcessEnv } from '../../util/utils';

vi.mock('../../../src/cache');

describe('XAIEmbeddingProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    disableCache();
  });

  afterEach(() => {
    vi.resetAllMocks();
    enableCache();
  });

  it('creates providers for embedding aliases', () => {
    expect(createXAIEmbeddingProvider('xai:embedding:v1')).toBeInstanceOf(XAIEmbeddingProvider);
    expect(createXAIEmbeddingProvider('xai:embeddings:v1').id()).toBe('xai:embedding:v1');
  });

  it('uses xAI defaults and regional endpoints', () => {
    expect(createXAIEmbeddingProvider('xai:embedding:v1').getApiUrl()).toBe('https://api.x.ai/v1');
    expect(
      createXAIEmbeddingProvider('xai:embedding:v1', {
        config: { region: 'eu-west-1' },
      }).getApiUrl(),
    ).toBe('https://eu-west-1.api.x.ai/v1');
  });

  it('honors env overrides for authentication and base URL', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: {
        data: [{ embedding: [0.1, 0.2, 0.3] }],
        usage: {
          prompt_tokens: 7,
          total_tokens: 7,
        },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = createXAIEmbeddingProvider('xai:embedding:v1', {
      env: {
        XAI_API_KEY: 'env-key',
        XAI_API_BASE_URL: 'https://env.api.x.ai/v1',
      },
    });

    await provider.callEmbeddingApi('embed this');

    expect(fetchWithCache).toHaveBeenCalledWith(
      'https://env.api.x.ai/v1/embeddings',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer env-key',
        }),
      }),
      expect.any(Number),
      'json',
      false,
      undefined,
    );
  });

  it('calls the embeddings endpoint successfully', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: {
        data: [{ embedding: [0.1, 0.2, 0.3] }],
        usage: {
          prompt_tokens: 7,
          total_tokens: 7,
        },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = createXAIEmbeddingProvider('xai:embedding:v1', {
      config: { apiKey: 'test-key' },
    });
    const result = await provider.callEmbeddingApi('embed this');

    expect(fetchWithCache).toHaveBeenCalledWith(
      'https://api.x.ai/v1/embeddings',
      expect.objectContaining({
        body: JSON.stringify({ input: 'embed this', model: 'v1' }),
      }),
      expect.any(Number),
      'json',
      false,
      undefined,
    );
    expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
    expect(result.tokenUsage).toEqual({
      total: 7,
      prompt: 7,
      completion: 0,
      numRequests: 1,
    });
  });

  it.each([
    {
      status: 429,
      statusText: 'Too Many Requests',
      data: { error: { message: 'rate limited' } },
    },
    {
      status: 500,
      statusText: 'Internal Server Error',
      data: { error: { message: 'server error' } },
    },
  ])('returns API errors for HTTP $status responses', async ({ status, statusText, data }) => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data,
      cached: false,
      status,
      statusText,
    });

    const provider = createXAIEmbeddingProvider('xai:embedding:v1', {
      config: { apiKey: 'test-key' },
    });
    const result = await provider.callEmbeddingApi('embed this');

    expect(result.error).toBe(`API error: ${status} ${statusText}\n${JSON.stringify(data)}`);
  });

  it('returns API call errors for request failures', async () => {
    vi.mocked(fetchWithCache).mockRejectedValue(new Error('timed out'));

    const provider = createXAIEmbeddingProvider('xai:embedding:v1', {
      config: { apiKey: 'test-key' },
    });
    const result = await provider.callEmbeddingApi('embed this');

    expect(result.error).toBe('API call error: Error: timed out');
  });

  it('rejects invalid embedding input types', async () => {
    const provider = createXAIEmbeddingProvider('xai:embedding:v1', {
      config: { apiKey: 'test-key' },
    });
    const result = await provider.callEmbeddingApi({ text: 'embed this' } as any);

    expect(result.error).toBe(
      'Invalid input type for embedding API. Expected string, got object. Input: {"text":"embed this"}',
    );
  });

  it('requires an embedding model name', () => {
    expect(() => createXAIEmbeddingProvider('xai:embedding:')).toThrow('Model name is required');
  });

  it('uses XAI_API_KEY and reports it when missing', async () => {
    const restoreEnv = mockProcessEnv({ XAI_API_KEY: undefined, OPENAI_API_KEY: undefined });

    try {
      const provider = createXAIEmbeddingProvider('xai:embedding:v1');
      const result = await provider.callEmbeddingApi('embed this');

      expect(result.error).toBe(
        'API key is not set. Set the XAI_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    } finally {
      restoreEnv();
    }
  });
});
