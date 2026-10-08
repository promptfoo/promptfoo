import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { disableCache, enableCache, fetchWithCache } from '../../../src/cache';
import { OpenAiEmbeddingProvider } from '../../../src/providers/openai/embedding';
import { mockProcessEnv } from '../../util/utils';
import { getOpenAiMissingApiKeyMessage } from './shared';

vi.mock('../../../src/cache');

describe('OpenAI Provider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    disableCache();
  });

  afterEach(() => {
    enableCache();
  });

  describe('OpenAiEmbeddingProvider', () => {
    const configuredEmbeddingCostPerToken = 0.42 / 1e6;
    const provider = new OpenAiEmbeddingProvider('text-embedding-3-large', {
      config: {
        apiKey: 'test-key',
        cost: configuredEmbeddingCostPerToken,
      },
    });

    it('should reject a Codex-only embedding passthrough model override before dispatch', async () => {
      const passthroughProvider = new OpenAiEmbeddingProvider('text-embedding-3-small', {
        config: { apiKey: 'test-key', passthrough: { model: 'gpt-5.3-codex-spark' } },
      });

      await expect(passthroughProvider.callEmbeddingApi('test text')).rejects.toThrow(
        'only available through openai:codex-sdk',
      );
      expect(fetchWithCache).not.toHaveBeenCalled();
    });

    it('should call embedding API successfully', async () => {
      const mockResponse = {
        data: [
          {
            embedding: [0.1, 0.2, 0.3],
          },
        ],
        usage: {
          total_tokens: 10,
          prompt_tokens: 0,
          completion_tokens: 0,
        },
      };

      vi.mocked(fetchWithCache).mockResolvedValue({
        data: mockResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callEmbeddingApi('test text');
      const expectedCost = 10 * provider.config.cost!;
      expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
      expect(result.tokenUsage).toEqual({
        total: 10,
        prompt: 0,
        completion: 0,
        numRequests: 1,
      });
      expect(result.cost).toBeCloseTo(expectedCost, 12);
    });

    it.each(['float', 'base64'])('accepts %s with numeric embeddings', async (format) => {
      const passthroughProvider = new OpenAiEmbeddingProvider('text-embedding-3-small', {
        config: {
          apiKey: 'test-key',
          passthrough: {
            dimensions: 8,
            encoding_format: format,
          },
        },
      });

      const mockEmbeddingResponse = {
        data: [{ embedding: [0.1, 0.2, 0.3] }],
        usage: {
          total_tokens: 10,
          prompt_tokens: 10,
          completion_tokens: 0,
        },
      };

      vi.mocked(fetchWithCache).mockResolvedValue({
        data: mockEmbeddingResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await passthroughProvider.callEmbeddingApi('test text');
      expect(result.error).toBeUndefined();
      expect(result.embedding).toEqual([0.1, 0.2, 0.3]);

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.stringContaining('/embeddings'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-OpenAI-Originator': 'promptfoo',
          }),
          body: JSON.stringify({
            input: 'test text',
            model: 'text-embedding-3-small',
            dimensions: 8,
            encoding_format: format,
          }),
        }),
        expect.any(Number),
        'json',
        false,
        undefined,
      );
      expect(mockEmbeddingResponse.usage.completion_tokens).toBe(0);
    });

    it.each([
      ['two padding characters', 'AACAPw==', [1]],
      ['one padding character', 'AAAAPwAAwL8=', [0.5, -1.5]],
      ['no padding characters', 'AACAPgAAAL8AAIA/', [0.25, -0.5, 1]],
      ['omitted padding', 'AACAPw', [1]],
      [
        'float32 boundary values',
        'AAAAAAAAAIABAAAA//9/fw==',
        [0, -0, 1.401298464324817e-45, 3.4028234663852886e38],
      ],
    ])('should decode base64 embeddings with %s', async (_description, embedding, expected) => {
      const mockResponse = {
        data: [{ embedding }],
      };
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: mockResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callEmbeddingApi('test text');

      expect(result.error).toBeUndefined();
      expect(result.embedding).toEqual(expected);
      expect(mockResponse.data[0].embedding).toBe(embedding);
    });

    it.each([false, true])('should decode base64 responses when cached is %s', async (cached) => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: {
          data: [{ embedding: 'AACAPgAAAL8AAIA/' }],
          usage: { total_tokens: 10, prompt_tokens: 10 },
        },
        cached,
        status: 200,
        statusText: 'OK',
        latencyMs: 15,
      });

      const result = await provider.callEmbeddingApi('test text');

      expect(result.embedding).toEqual([0.25, -0.5, 1]);
      expect(result.latencyMs).toBe(15);
      expect(result.cost).toBeCloseTo(cached ? 0 : 10 * configuredEmbeddingCostPerToken, 12);
      expect(result.tokenUsage).toEqual(
        cached
          ? { total: 10, cached: 10 }
          : { total: 10, prompt: 10, completion: 0, numRequests: 1 },
      );
    });

    it.each([undefined, null, ''])('should handle a missing embedding (%s)', async (embedding) => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: { data: [{ embedding }] },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callEmbeddingApi('test text');

      expect(result.error).toBe('No embedding found in OpenAI embeddings API response');
      expect(result.embedding).toBeUndefined();
    });

    it.each([
      ['invalid characters', 'AACAPw!!'],
      ['truncated float32', 'AQID'],
      ['embedded padding', 'AA=CAPw=='],
      ['excess padding', 'AACAPw==='],
      ['trailing data after padding', 'AACAPw==AAAA'],
      ['non-finite NaN', 'AADAfw=='],
      ['positive infinity', 'AACAfw=='],
      ['negative infinity', 'AACA/w=='],
    ])('should reject base64 embeddings with %s', async (_description, embedding) => {
      const deleteFromCache = vi.fn().mockResolvedValue(undefined);
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: {
          data: [{ embedding }],
          metadata: { authorization: 'Bearer response-secret-canary' },
        },
        cached: true,
        status: 200,
        statusText: 'OK',
        deleteFromCache,
      });

      const result = await provider.callEmbeddingApi('test text');

      expect(result.error).toBe(
        'API error: Error: Invalid base64 embedding in OpenAI embeddings API response',
      );
      expect(result.embedding).toBeUndefined();
      expect(deleteFromCache).toHaveBeenCalledOnce();
    });

    it('should bill a qualified passthrough embedding model through a custom gateway', async () => {
      const passthroughProvider = new OpenAiEmbeddingProvider('text-embedding-3-large', {
        config: {
          apiKey: 'test-key',
          apiBaseUrl: 'https://gateway.example/v1',
          passthrough: { model: 'openai/text-embedding-3-small' },
        },
      });
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: {
          data: [{ embedding: [0.1, 0.2, 0.3] }],
          usage: { total_tokens: 1_000_000, prompt_tokens: 1_000_000, completion_tokens: 0 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await passthroughProvider.callEmbeddingApi('test text');
      const request = vi.mocked(fetchWithCache).mock.calls[0] as [string, { body: string }];

      expect(JSON.parse(request[1].body).model).toBe('openai/text-embedding-3-small');
      expect(result.cost).toBeCloseTo(0.02, 10);
    });

    it('should not apply OpenAI pricing to another gateway embedding namespace', async () => {
      const passthroughProvider = new OpenAiEmbeddingProvider('text-embedding-3-large', {
        config: {
          apiKey: 'test-key',
          apiBaseUrl: 'https://gateway.example/v1',
          passthrough: { model: 'vendor/text-embedding-3-small' },
        },
      });
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: {
          data: [{ embedding: [0.1, 0.2, 0.3] }],
          usage: { total_tokens: 1_000_000, prompt_tokens: 1_000_000, completion_tokens: 0 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await passthroughProvider.callEmbeddingApi('test text');
      const request = vi.mocked(fetchWithCache).mock.calls[0] as [string, { body: string }];

      expect(JSON.parse(request[1].body).model).toBe('vendor/text-embedding-3-small');
      expect(result.cost).toBeUndefined();
    });

    it('should handle API errors', async () => {
      vi.mocked(fetchWithCache).mockRejectedValue(new Error('API error'));

      const result = await provider.callEmbeddingApi('test text');
      expect(result.error).toBe('API call error: Error: API error');
      expect(result.embedding).toBeUndefined();
    });

    it('should validate input type', async () => {
      const result = await provider.callEmbeddingApi({ message: 'test' } as unknown as string);
      expect(result.error).toBe(
        'Invalid input type for embedding API. Expected string, got object. Input: {"message":"test"}',
      );
      expect(result.embedding).toBeUndefined();
    });

    it('should handle HTTP error status', async () => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: { error: { message: 'Unauthorized' } },
        cached: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const result = await provider.callEmbeddingApi('test text');
      expect(result.error).toBe(
        'API error: 401 Unauthorized\n{"error":{"message":"Unauthorized"}}',
      );
      expect(result.embedding).toBeUndefined();
    });

    it('should validate API key', async () => {
      const restoreEnv = mockProcessEnv({ OPENAI_API_KEY: undefined });

      try {
        const providerNoKey = new OpenAiEmbeddingProvider('text-embedding-3-large', {
          config: {},
        });

        const result = await providerNoKey.callEmbeddingApi('test text');
        expect(result.error).toBe(getOpenAiMissingApiKeyMessage());
        expect(result.embedding).toBeUndefined();
      } finally {
        restoreEnv();
      }
    });
  });
});
