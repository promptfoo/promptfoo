import {
  calculateHyperbolicCost,
  createHyperbolicProvider,
  HYPERBOLIC_CHAT_MODELS,
  HYPERBOLIC_REASONING_MODELS,
  HyperbolicProvider,
} from '../../../src/providers/hyperbolic/chat';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';

describe('HyperbolicProvider', () => {
  let provider: HyperbolicProvider;
  const modelName = 'deepseek-ai/DeepSeek-R1';
  const options = {
    config: {
      config: {
        apiKey: 'test-key',
      },
    },
  };

  beforeEach(() => {
    provider = new HyperbolicProvider(modelName, options);
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

  it('should process API response correctly for reasoning model', async () => {
    const mockResponse = {
      raw: {
        usage: {
          completion_tokens_details: {
            reasoning_tokens: 100,
            accepted_prediction_tokens: 50,
            rejected_prediction_tokens: 25,
          },
        },
      },
      tokenUsage: {
        prompt: 200,
        completion: 150,
      },
    };

    jest.spyOn(OpenAiChatCompletionProvider.prototype, 'callApi').mockResolvedValue(mockResponse);

    const result = await provider.callApi('test prompt');

    expect(result.tokenUsage.completionDetails).toEqual({
      reasoning: 100,
      acceptedPrediction: 50,
      rejectedPrediction: 25,
    });
  });

  it('should handle raw response as string', async () => {
    const mockResponse = {
      raw: JSON.stringify({
        usage: {
          completion_tokens_details: {
            reasoning_tokens: 100,
            accepted_prediction_tokens: 50,
            rejected_prediction_tokens: 25,
          },
        },
      }),
      tokenUsage: {
        prompt: 200,
        completion: 150,
      },
    };

    jest.spyOn(OpenAiChatCompletionProvider.prototype, 'callApi').mockResolvedValue(mockResponse);

    const result = await provider.callApi('test prompt');

    expect(result.tokenUsage.completionDetails).toEqual({
      reasoning: 100,
      acceptedPrediction: 50,
      rejectedPrediction: 25,
    });
  });

  it('should handle error response', async () => {
    const mockResponse = { error: 'API error' };
    jest.spyOn(OpenAiChatCompletionProvider.prototype, 'callApi').mockResolvedValue(mockResponse);

    const result = await provider.callApi('test prompt');
    expect(result.error).toBe('API error');
  });

  it('should handle invalid JSON in raw response', async () => {
    const mockResponse = {
      raw: 'invalid json',
      tokenUsage: {
        prompt: 200,
        completion: 150,
      },
    };

    jest.spyOn(OpenAiChatCompletionProvider.prototype, 'callApi').mockResolvedValue(mockResponse);

    const result = await provider.callApi('test prompt');
    expect(result.tokenUsage.completionDetails).toBeUndefined();
  });

  it('should calculate cost for non-cached response', async () => {
    const mockResponse = {
      raw: 'test response',
      tokenUsage: {
        prompt: 1000,
        completion: 500,
      },
      cached: false,
    };

    jest.spyOn(OpenAiChatCompletionProvider.prototype, 'callApi').mockResolvedValue(mockResponse);

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
