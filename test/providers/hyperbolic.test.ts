import { HyperbolicAudioProvider } from '../../src/providers/hyperbolic/audio';
import { calculateHyperbolicCost, HyperbolicProvider } from '../../src/providers/hyperbolic/chat';
import { HyperbolicImageProvider } from '../../src/providers/hyperbolic/image';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';

jest.mock('../../src/logger', () => ({
  debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

describe('HyperbolicProvider', () => {
  let provider: HyperbolicProvider;
  const mockApiKey = 'test-api-key';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.HYPERBOLIC_API_KEY = mockApiKey;
  });

  afterEach(() => {
    delete process.env.HYPERBOLIC_API_KEY;
  });

  describe('constructor', () => {
    it('should create a provider with default config', () => {
      provider = new HyperbolicProvider('deepseek-ai/DeepSeek-R1', {});
      expect(provider.id()).toBe('hyperbolic:deepseek-ai/DeepSeek-R1');
      expect(provider.toString()).toBe('[Hyperbolic Provider deepseek-ai/DeepSeek-R1]');
    });

    it('should use custom API key from config', () => {
      const customApiKey = 'custom-key';
      provider = new HyperbolicProvider('deepseek-ai/DeepSeek-R1', {
        config: { config: { apiKey: customApiKey } },
      });
      expect(provider['originalConfig']?.apiKey).toBe(customApiKey);
    });
  });

  describe('isReasoningModel', () => {
    it('should identify reasoning models correctly', () => {
      const reasoningProvider = new HyperbolicProvider('deepseek-ai/DeepSeek-R1', {});
      expect(reasoningProvider['isReasoningModel']()).toBe(true);

      const qwqProvider = new HyperbolicProvider('qwen/QwQ-32B', {});
      expect(qwqProvider['isReasoningModel']()).toBe(true);

      const regularProvider = new HyperbolicProvider('meta-llama/Llama-3.1-70B', {});
      expect(regularProvider['isReasoningModel']()).toBe(false);
    });
  });

  describe('callApi', () => {
    it('should handle successful API response', async () => {
      provider = new HyperbolicProvider('deepseek-ai/DeepSeek-R1', {});

      const mockResponse = {
        output: 'Test response',
        tokenUsage: { prompt: 100, completion: 50 },
        cached: false,
        raw: JSON.stringify({
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            completion_tokens_details: {
              reasoning_tokens: 30,
              accepted_prediction_tokens: 10,
              rejected_prediction_tokens: 5,
            },
          },
        }),
      };

      jest.spyOn(OpenAiChatCompletionProvider.prototype, 'callApi').mockResolvedValue(mockResponse);

      const result = await provider.callApi('Test prompt');

      expect(result.output).toBe('Test response');
      expect(result.tokenUsage.completionDetails).toEqual({
        reasoning: 30,
        acceptedPrediction: 10,
        rejectedPrediction: 5,
      });
      expect(result.cost).toBeDefined();
    });

    it('should handle API errors', async () => {
      provider = new HyperbolicProvider('deepseek-ai/DeepSeek-R1', {});

      const mockError = { error: 'API Error' };
      jest.spyOn(OpenAiChatCompletionProvider.prototype, 'callApi').mockResolvedValue(mockError);

      const result = await provider.callApi('Test prompt');
      expect(result).toEqual(mockError);
    });
  });

  describe('calculateHyperbolicCost', () => {
    it('should calculate cost for known models', () => {
      const cost = calculateHyperbolicCost('deepseek-ai/DeepSeek-R1', {}, 1000, 500);
      expect(cost).toBe((0.5 / 1e6) * 1000 + (2.18 / 1e6) * 500);
    });

    it('should handle model aliases', () => {
      const cost = calculateHyperbolicCost('DeepSeek-R1', {}, 1000, 500);
      expect(cost).toBe((0.5 / 1e6) * 1000 + (2.18 / 1e6) * 500);
    });

    it('should return undefined for unknown models', () => {
      const cost = calculateHyperbolicCost('unknown-model', {}, 1000, 500);
      expect(cost).toBeUndefined();
    });

    it('should return undefined if tokens are missing', () => {
      const cost = calculateHyperbolicCost('deepseek-ai/DeepSeek-R1', {}, undefined, 500);
      expect(cost).toBeUndefined();
    });

    it('should use custom cost from config', () => {
      const customCost = 0.001;
      const cost = calculateHyperbolicCost(
        'deepseek-ai/DeepSeek-R1',
        { cost: customCost },
        1000,
        500,
      );
      expect(cost).toBe(customCost * 1000 + customCost * 500);
    });
  });
});

describe('HyperbolicImageProvider', () => {
  let provider: HyperbolicImageProvider;
  const mockApiKey = 'test-api-key';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.HYPERBOLIC_API_KEY = mockApiKey;
  });

  afterEach(() => {
    delete process.env.HYPERBOLIC_API_KEY;
  });

  describe('constructor', () => {
    it('should create an image provider with default model', () => {
      provider = new HyperbolicImageProvider('Flux.1-dev', {});
      expect(provider.id()).toBe('hyperbolic:image:Flux.1-dev');
      expect(provider.toString()).toBe('[Hyperbolic Image Provider Flux.1-dev]');
    });
  });

  describe('getApiModelName', () => {
    it('should resolve model aliases', () => {
      provider = new HyperbolicImageProvider('flux-dev', {});
      expect(provider['getApiModelName']()).toBe('Flux.1-dev');

      provider = new HyperbolicImageProvider('sdxl', {});
      expect(provider['getApiModelName']()).toBe('SDXL1.0-base');
    });

    it('should return original name for unknown models', () => {
      provider = new HyperbolicImageProvider('custom-model', {});
      expect(provider['getApiModelName']()).toBe('custom-model');
    });
  });

  describe('calculateImageCost', () => {
    it('should return correct cost for known models', () => {
      provider = new HyperbolicImageProvider('Flux.1-dev', {});
      expect(provider['calculateImageCost']()).toBe(0.025);

      provider = new HyperbolicImageProvider('SDXL1.0-base', {});
      expect(provider['calculateImageCost']()).toBe(0.01);
    });

    it('should return default cost for unknown models', () => {
      provider = new HyperbolicImageProvider('unknown-model', {});
      expect(provider['calculateImageCost']()).toBe(0.01);
    });
  });
});

describe('HyperbolicAudioProvider', () => {
  let provider: HyperbolicAudioProvider;
  const mockApiKey = 'test-api-key';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.HYPERBOLIC_API_KEY = mockApiKey;
  });

  afterEach(() => {
    delete process.env.HYPERBOLIC_API_KEY;
  });

  describe('constructor', () => {
    it('should create an audio provider with default model', () => {
      provider = new HyperbolicAudioProvider('Melo-TTS', {});
      expect(provider.id()).toBe('hyperbolic:audio:Melo-TTS');
      expect(provider.toString()).toBe('[Hyperbolic Audio Provider Melo-TTS]');
    });

    it('should use default model if none specified', () => {
      provider = new HyperbolicAudioProvider('', {});
      expect(provider.modelName).toBe('Melo-TTS');
    });
  });

  describe('calculateAudioCost', () => {
    it('should calculate cost based on text length', () => {
      provider = new HyperbolicAudioProvider('Melo-TTS', {});
      const textLength = 5000; // 5000 characters
      expect(provider['calculateAudioCost'](textLength)).toBe(0.005); // $0.001 per 1000 chars
    });

    it('should handle partial thousands', () => {
      provider = new HyperbolicAudioProvider('Melo-TTS', {});
      const textLength = 1500; // 1.5 thousand characters
      expect(provider['calculateAudioCost'](textLength)).toBe(0.0015);
    });
  });
});
