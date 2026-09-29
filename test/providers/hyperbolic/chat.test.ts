import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import {
  calculateHyperbolicCost,
  createHyperbolicProvider,
  HYPERBOLIC_CHAT_MODELS,
  HYPERBOLIC_REASONING_MODELS,
  HyperbolicProvider,
} from '../../../src/providers/hyperbolic/chat';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));

const mockFetchWithCache = vi.mocked(fetchWithCache);

describe('HyperbolicProvider', () => {
  let provider: HyperbolicProvider;
  const modelName = 'deepseek-ai/DeepSeek-R1';
  const options = {
    config: {
      config: {
        apiKey: 'test-key',
      },
    },
    env: { HYPERBOLIC_API_KEY: 'test-key' },
  };

  beforeEach(() => {
    mockFetchWithCache.mockReset();
    provider = new HyperbolicProvider(modelName, options);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create provider with correct config', () => {
    expect(provider.id()).toBe(`hyperbolic:${modelName}`);
    expect(provider.toString()).toBe(`[Hyperbolic Provider ${modelName}]`);
  });

  it('should convert to JSON correctly', () => {
    const json = provider.toJSON();
    expect(json).toEqual({
      provider: 'hyperbolic',
      model: modelName,
      config: {
        apiKeyEnvar: 'HYPERBOLIC_API_KEY',
        apiBaseUrl: 'https://api.hyperbolic.xyz/v1',
        config: expect.any(Object),
      },
    });
  });

  it.each([
    {
      label: 'populated',
      details: {
        reasoning_tokens: 100,
        accepted_prediction_tokens: 50,
        rejected_prediction_tokens: 25,
      },
      expected: { reasoning: 100, acceptedPrediction: 50, rejectedPrediction: 25 },
    },
    {
      label: 'zero-valued',
      details: {
        reasoning_tokens: 0,
        accepted_prediction_tokens: 0,
        rejected_prediction_tokens: 0,
      },
      expected: { reasoning: 0, acceptedPrediction: 0, rejectedPrediction: 0 },
    },
    { label: 'absent', details: undefined, expected: undefined },
  ])('should normalize $label reasoning details from API usage', async ({ details, expected }) => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        choices: [{ message: { content: 'answer' }, finish_reason: 'stop' }],
        usage: {
          total_tokens: 350,
          prompt_tokens: 200,
          completion_tokens: 150,
          ...(details ? { completion_tokens_details: details } : {}),
        },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const result = await provider.callApi('test prompt');

    expect(result.output).toBe('answer');
    expect(result.tokenUsage?.completionDetails).toEqual(expected);
    expect(result).not.toHaveProperty('raw');
    expect(result.cost).toBe((0.5 / 1e6) * 200 + (2.18 / 1e6) * 150);
  });

  it('should handle error response', async () => {
    const mockResponse = { error: 'API error' };
    vi.spyOn(OpenAiChatCompletionProvider.prototype, 'callApi').mockResolvedValue(mockResponse);

    const result = await provider.callApi('test prompt');
    expect(result.error).toBe('API error');
  });

  it('should calculate cost for non-cached response', async () => {
    const mockResponse = {
      tokenUsage: {
        prompt: 1000,
        completion: 500,
      },
      cached: false,
    };

    vi.spyOn(OpenAiChatCompletionProvider.prototype, 'callApi').mockResolvedValue(mockResponse);

    const result = await provider.callApi('test prompt');
    expect(result.cost).toBe((0.5 / 1e6) * 1000 + (2.18 / 1e6) * 500);
  });
});

describe('calculateHyperbolicCost', () => {
  it('should calculate cost correctly for known model', () => {
    const cost = calculateHyperbolicCost('deepseek-ai/DeepSeek-R1', {}, 1000, 500);
    expect(cost).toBe((0.5 / 1e6) * 1000 + (2.18 / 1e6) * 500);
  });

  it('should calculate cost correctly for model alias', () => {
    const cost = calculateHyperbolicCost('DeepSeek-R1', {}, 1000, 500);
    expect(cost).toBe((0.5 / 1e6) * 1000 + (2.18 / 1e6) * 500);
  });

  it('should return undefined for unknown model', () => {
    const cost = calculateHyperbolicCost('unknown-model', {}, 1000, 500);
    expect(cost).toBeUndefined();
  });

  it('should return undefined if tokens are missing', () => {
    const cost = calculateHyperbolicCost('deepseek-ai/DeepSeek-R1', {}, undefined, 500);
    expect(cost).toBeUndefined();
  });

  it('should use custom cost from config if provided', () => {
    const config = {
      cost: 0.001,
    };
    const cost = calculateHyperbolicCost('deepseek-ai/DeepSeek-R1', config, 1000, 500);
    expect(cost).toBe(0.001 * 1000 + 0.001 * 500);
  });
});

describe('createHyperbolicProvider', () => {
  it('should create provider with correct model name', () => {
    const provider = createHyperbolicProvider('hyperbolic:deepseek-ai/DeepSeek-R1');
    expect(provider.id()).toBe('hyperbolic:deepseek-ai/DeepSeek-R1');
  });

  it('should throw error if model name is missing', () => {
    expect(() => createHyperbolicProvider('hyperbolic:')).toThrow('Model name is required');
  });
});

describe('HYPERBOLIC_CHAT_MODELS', () => {
  it('should contain valid model definitions', () => {
    for (const model of HYPERBOLIC_CHAT_MODELS) {
      expect(model).toHaveProperty('id');
      expect(model).toHaveProperty('cost.input');
      expect(model).toHaveProperty('cost.output');
      expect(model).toHaveProperty('aliases');
      expect(Array.isArray(model.aliases)).toBe(true);
    }
  });
});

describe('HYPERBOLIC_REASONING_MODELS', () => {
  it('should be a subset of HYPERBOLIC_CHAT_MODELS', () => {
    for (const modelId of HYPERBOLIC_REASONING_MODELS) {
      const found = HYPERBOLIC_CHAT_MODELS.some(
        (m) => m.id === modelId || m.aliases.includes(modelId),
      );
      expect(found).toBe(true);
    }
  });
});
