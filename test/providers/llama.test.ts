import { fetchWithCache } from '../../src/cache';
import { LlamaProvider } from '../../src/providers/llama';
import { REQUEST_TIMEOUT_MS } from '../../src/providers/shared';

jest.mock('../../src/cache', () => ({
  fetchWithCache: jest.fn(),
}));

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
      jest.clearAllMocks();
    });
    it('should call fetchWithCache with correct parameters', async () => {
      jest
        .mocked(fetchWithCache)
        .mockResolvedValue({ ...response, cached: false, status: 200, statusText: 'OK' });

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
        REQUEST_TIMEOUT_MS,
      );
    });
    it('should return the correct response on success', async () => {
      jest.mocked(fetchWithCache).mockResolvedValue({
        data: { content: 'test response' },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const provider = new LlamaProvider(modelName, { config });
      const result = await provider.callApi(prompt);
      expect(result).toEqual({ output: response.data.content });
    });

    it('should return an error if fetchWithCache throws an error', async () => {
      const error = new Error('API call error');
      jest.mocked(fetchWithCache).mockRejectedValue(error);

      const provider = new LlamaProvider(modelName, { config });
      const result = await provider.callApi(prompt);

      expect(result).toEqual({ error: `API call error: ${String(error)}` });
    });

    it('should return an error if response data is malformed', async () => {
      const malformedResponse = { data: null, cached: false, status: 200, statusText: 'OK' };
      jest.mocked(fetchWithCache).mockResolvedValue(malformedResponse);

      const provider = new LlamaProvider(modelName, { config });
      const result = await provider.callApi(prompt);
      expect(result).toEqual({
        error: `API response error: TypeError: Cannot read properties of null (reading 'content'): null`,
      });
    });
  });
});
