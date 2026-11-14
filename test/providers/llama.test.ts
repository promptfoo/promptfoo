import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { LlamaProvider } from '../../src/providers/llama';
import { getRequestTimeoutMs } from '../../src/providers/shared';
import { createMockFetchResponse } from './mockProviderResponses';

vi.mock('../../src/cache', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    fetchWithCache: vi.fn(),
  };
});

describe('LlamaProvider', () => {
  const modelName = 'testModel';
  const config = {
    temperature: 0.7,
  };

  describe('constructor', () => {
    it('should initialize with modelName and config', () => {
      const provider = new LlamaProvider(modelName, { config });
      expect(provider.modelName).toBe(modelName);
      expect(provider.config).toEqual(config);
    });

    it('should initialize with id function if id is provided', () => {
      const id = 'testId';
      const provider = new LlamaProvider(modelName, { config, id });
      expect(provider.id()).toBe(id);
    });
  });

  describe('id', () => {
    it('should return the correct id string', () => {
      const provider = new LlamaProvider(modelName);
      expect(provider.id()).toBe(`llama:${modelName}`);
    });
  });

  describe('toString', () => {
    it('should return the correct string representation', () => {
      const provider = new LlamaProvider(modelName);
      expect(provider.toString()).toBe(`[Llama Provider ${modelName}]`);
    });
  });

  describe('callApi', () => {
    const prompt = 'test prompt';
    const response = { data: { content: 'test response' } };

    beforeEach(() => {
      vi.clearAllMocks();
    });
    it('should call fetchWithCache with correct parameters', async () => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        ...response,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const provider = new LlamaProvider(modelName, { config });
      await provider.callApi(prompt);
      expect(fetchWithCache).toHaveBeenCalledWith(
        `${process.env.LLAMA_BASE_URL || 'http://localhost:8080'}/completion`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt,
            n_predict: 512,
            temperature: config.temperature,
            top_k: undefined,
            top_p: undefined,
            n_keep: undefined,
            stop: undefined,
            repeat_penalty: undefined,
            repeat_last_n: undefined,
            penalize_nl: undefined,
            presence_penalty: undefined,
            frequency_penalty: undefined,
            mirostat: undefined,
            mirostat_tau: undefined,
            mirostat_eta: undefined,
            seed: undefined,
            ignore_eos: undefined,
            logit_bias: undefined,
          }),
        },
        getRequestTimeoutMs(),
      );
    });
    it.each([0, -1, 128])(
      'preserves an explicit n_predict=%s in the native request',
      async (nPredict) => {
        vi.mocked(fetchWithCache).mockResolvedValue(createMockFetchResponse({ content: '' }));
        const provider = new LlamaProvider(modelName, { config: { n_predict: nPredict } });
        const result = await provider.callApi('Hello');
        const request = vi.mocked(fetchWithCache).mock.calls[0][1];
        expect(JSON.parse(request?.body as string).n_predict).toBe(nPredict);
        expect(result).toMatchObject({ output: '', cached: false });
      },
    );

    it('forwards native Mirostat modes and token-bias pairs', async () => {
      vi.mocked(fetchWithCache).mockResolvedValue(createMockFetchResponse({ content: 'ok' }));
      const provider = new LlamaProvider(modelName, {
        config: {
          mirostat: 2,
          logit_bias: [
            [15043, false],
            ['hello', -0.5],
          ],
        },
      });

      await provider.callApi(prompt);

      const request = vi.mocked(fetchWithCache).mock.calls[0][1];
      expect(JSON.parse(request?.body as string)).toMatchObject({
        mirostat: 2,
        logit_bias: [
          [15043, false],
          ['hello', -0.5],
        ],
      });
    });

    it('should return the correct response on success', async () => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        ...createMockFetchResponse(response.data, { cached: true }),
        latencyMs: 42,
      });

      const provider = new LlamaProvider(modelName, { config });
      const result = await provider.callApi(prompt);
      expect(result).toEqual({
        output: response.data.content,
        cached: true,
        latencyMs: 42,
      });
    });

    it('should return an error if fetchWithCache throws an error', async () => {
      const error = new Error('API call error');
      vi.mocked(fetchWithCache).mockRejectedValue(error);

      const provider = new LlamaProvider(modelName, { config });
      const result = await provider.callApi(prompt);

      expect(result).toEqual({ error: `API call error: ${String(error)}` });
    });

    it.each([
      [
        400,
        'Bad Request',
        { error: { message: 'context size exceeded' } },
        '400 Bad Request: context size exceeded',
      ],
      [401, 'Unauthorized', { error: 'invalid API key' }, '401 Unauthorized: invalid API key'],
      [403, 'Forbidden', { message: 'access denied' }, '403 Forbidden: access denied'],
      [503, '', { content: 'partial output', prompt: 'original prompt' }, '503'],
      [
        200,
        'OK',
        { content: 'partial output', error: { message: 'generation failed' } },
        '200 OK: generation failed',
      ],
    ])('returns the server error for %i %s', async (status, statusText, data, expected) => {
      const deleteFromCache = vi.fn().mockResolvedValue(undefined);
      vi.mocked(fetchWithCache).mockResolvedValue({
        ...createMockFetchResponse(data, { status, statusText }),
        deleteFromCache,
      });

      expect(await new LlamaProvider(modelName).callApi(prompt)).toEqual({
        error: `API response error: ${expected}`,
        cached: false,
      });
      expect(deleteFromCache).toHaveBeenCalledTimes(status === 200 ? 1 : 0);
    });

    it.each([null, {}, { content: 0 }])('evicts a malformed completion %j', async (data) => {
      const deleteFromCache = vi.fn().mockResolvedValue(undefined);
      vi.mocked(fetchWithCache).mockResolvedValue({
        ...createMockFetchResponse(data),
        deleteFromCache,
      });

      expect(await new LlamaProvider(modelName).callApi(prompt)).toEqual({
        error: 'API response error: expected a string in the content field',
        cached: false,
      });
      expect(deleteFromCache).toHaveBeenCalledOnce();
    });

    it.each([
      [{}, 'API response error: expected a string in the content field'],
      [{ error: 'generation failed' }, 'API response error: 200 OK: generation failed'],
    ])('retains cache provenance for a malformed cached completion %j', async (data, error) => {
      const deleteFromCache = vi.fn().mockResolvedValue(undefined);
      vi.mocked(fetchWithCache).mockResolvedValue({
        ...createMockFetchResponse(data, { cached: true }),
        latencyMs: 42,
        deleteFromCache,
      });

      expect(await new LlamaProvider(modelName).callApi(prompt)).toEqual({
        error,
        cached: true,
        latencyMs: 42,
      });
      expect(deleteFromCache).toHaveBeenCalledOnce();
    });

    it('preserves the completion error if cache eviction fails', async () => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        ...createMockFetchResponse({ error: 'generation failed' }),
        deleteFromCache: vi.fn().mockRejectedValue(new Error('cache unavailable')),
      });

      expect(await new LlamaProvider(modelName).callApi(prompt)).toEqual({
        error: 'API response error: 200 OK: generation failed',
        cached: false,
      });
    });
  });
});
