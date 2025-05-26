import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';
import {
  XAIProvider,
  calculateXAICost,
  XAI_CHAT_MODELS,
  GROK_3_MINI_MODELS,
} from '../../../src/providers/xai/chat';

jest.mock('../../../src/logger');

describe('XAIProvider', () => {
  let provider: XAIProvider;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should initialize with correct configuration', () => {
    const options = {
      config: {
        config: {
          region: 'us-east-1',
          reasoning_effort: 'high' as const,
          apiKey: 'test-key',
        },
      },
    };

    provider = new XAIProvider('grok-3-beta', options);

    expect(provider.id()).toBe('xai:grok-3-beta');
    expect(provider.toString()).toBe('[xAI Provider grok-3-beta]');
  });

  it('should format JSON output correctly', () => {
    provider = new XAIProvider('grok-3-beta', {});
    const json = provider.toJSON();

    expect(json).toEqual({
      provider: 'xai',
      model: 'grok-3-beta',
      config: {
        apiBaseUrl: 'https://api.x.ai/v1',
        apiKeyEnvar: 'XAI_API_KEY',
      },
    });
  });

  it('should handle API calls with search parameters', async () => {
    const options = {
      config: {
        config: {
          search_parameters: {
            param1: 'value1',
            param2: '{{ var1 }}',
          },
        },
      },
    };

    provider = new XAIProvider('grok-3-beta', options);
    const result = provider.getOpenAiBody('test prompt', { vars: { var1: 'test' } });

    expect(result.body.search_parameters).toEqual({ param1: 'value1', param2: 'test' });
  });

  it('should handle reasoning model responses', async () => {
    provider = new XAIProvider('grok-3-mini-beta', {});

    const mockApiResponse = {
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
        prompt: 10,
        completion: 20,
      },
      cached: false,
    };

    const mockCallApi = jest.spyOn(OpenAiChatCompletionProvider.prototype, 'callApi');
    mockCallApi.mockResolvedValue(mockApiResponse);

    const result = await provider.callApi('test prompt');

    expect(result.tokenUsage?.completionDetails).toEqual({
      reasoning: 100,
      acceptedPrediction: 50,
      rejectedPrediction: 25,
    });
    expect(result.cost).toBeDefined();
  });

  it('should handle raw object response', async () => {
    provider = new XAIProvider('grok-3-mini-beta', {});

    const mockApiResponse = {
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
        prompt: 10,
        completion: 20,
      },
      cached: false,
    };

    const mockCallApi = jest.spyOn(OpenAiChatCompletionProvider.prototype, 'callApi');
    mockCallApi.mockResolvedValue(mockApiResponse);

    const result = await provider.callApi('test prompt');

    expect(result.tokenUsage?.completionDetails).toEqual({
      reasoning: 100,
      acceptedPrediction: 50,
      rejectedPrediction: 25,
    });
  });

  it('should handle error responses', async () => {
    provider = new XAIProvider('grok-3-mini-beta', {});
    const mockErrorResponse = { error: 'API error' };
    const mockCallApi = jest.spyOn(OpenAiChatCompletionProvider.prototype, 'callApi');
    mockCallApi.mockResolvedValue(mockErrorResponse);

    const result = await provider.callApi('test prompt');
    expect(result.error).toBe('API error');
  });

  it('should handle invalid JSON in raw response', async () => {
    provider = new XAIProvider('grok-3-mini-beta', {});
    const mockApiResponse = {
      raw: 'invalid json',
      tokenUsage: {
        prompt: 10,
        completion: 20,
      },
    };

    const mockCallApi = jest.spyOn(OpenAiChatCompletionProvider.prototype, 'callApi');
    mockCallApi.mockResolvedValue(mockApiResponse);

    const result = await provider.callApi('test prompt');
    expect(result.tokenUsage?.completionDetails).toBeUndefined();
  });

  it('should handle errors in response processing', async () => {
    provider = new XAIProvider('grok-3-mini-beta', {});
    const mockApiResponse = {
      raw: null,
      tokenUsage: {
        prompt: 10,
        completion: 20,
      },
    };

    const mockCallApi = jest.spyOn(OpenAiChatCompletionProvider.prototype, 'callApi');
    mockCallApi.mockResolvedValue(mockApiResponse);

    const result = await provider.callApi('test prompt');
    expect(result.tokenUsage).toBeDefined();
  });

  it('should initialize with custom region', () => {
    const options = {
      config: {
        config: {
          region: 'eu-west-1',
        },
      },
    };

    provider = new XAIProvider('grok-3-beta', options);
    expect(provider['config'].apiBaseUrl).toBe('https://eu-west-1.api.x.ai/v1');
  });

  it('should support temperature for non-reasoning models', () => {
    provider = new XAIProvider('grok-2-1212', {});
    expect(provider['supportsTemperature']()).toBe(true);
  });

  it('should not support temperature for reasoning models', () => {
    provider = new XAIProvider('grok-3-mini-beta', {});
    expect(GROK_3_MINI_MODELS).toContain(provider['modelName']);
    expect(provider['isReasoningModel']()).toBe(true);
  });
});

describe('calculateXAICost', () => {
  it('should calculate cost correctly for Grok-3 model', () => {
    const cost = calculateXAICost('grok-3-beta', {}, 1000, 500);
    expect(cost).toBe(1000 * (3.0 / 1e6) + 500 * (15.0 / 1e6));
  });

  it('should return undefined if tokens are not provided', () => {
    const cost = calculateXAICost('grok-3-beta', {}, undefined, undefined);
    expect(cost).toBeUndefined();
  });

  it('should return undefined for unknown model', () => {
    const cost = calculateXAICost('unknown-model', {}, 1000, 500);
    expect(cost).toBeUndefined();
  });

  it('should use model aliases when calculating cost', () => {
    const cost1 = calculateXAICost('grok-3', {}, 1000, 500);
    const cost2 = calculateXAICost('grok-3-beta', {}, 1000, 500);
    expect(cost1).toBe(cost2);
  });

  it('should use custom cost if provided in config', () => {
    const customConfig = {
      cost: 5.0 / 1e6,
    };
    const cost = calculateXAICost('grok-3-beta', customConfig, 1000, 500);
    expect(cost).toBe(1000 * (5.0 / 1e6) + 500 * (5.0 / 1e6));
  });

  it('should handle reasoning tokens in cost calculation', () => {
    const cost = calculateXAICost('grok-3-mini-beta', {}, 1000, 500, 200);
    expect(cost).toBe(1000 * (0.3 / 1e6) + 500 * (0.5 / 1e6));
  });
});

describe('Model Constants', () => {
  it('should define correct Grok-3 mini models', () => {
    expect(GROK_3_MINI_MODELS).toEqual(['grok-3-mini-beta', 'grok-3-mini-fast-beta']);
  });

  it('should define model costs correctly', () => {
    const grok3Beta = XAI_CHAT_MODELS.find((m) => m.id === 'grok-3-beta');
    expect(grok3Beta).toBeDefined();
    expect(grok3Beta!.cost.input).toBe(3.0 / 1e6);
    expect(grok3Beta!.cost.output).toBe(15.0 / 1e6);
  });

  it('should include all required model properties', () => {
    XAI_CHAT_MODELS.forEach((model) => {
      expect(model).toHaveProperty('id');
      expect(model).toHaveProperty('cost');
      expect(model.cost).toHaveProperty('input');
      expect(model.cost).toHaveProperty('output');
    });
  });

  it('should have correct aliases for models', () => {
    const modelWithAliases = XAI_CHAT_MODELS.find((m) => m.id === 'grok-3-beta');
    expect(modelWithAliases?.aliases).toEqual(['grok-3', 'grok-3-latest']);
  });
});
