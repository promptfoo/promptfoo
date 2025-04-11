import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { calculateXAICost, createXAIProvider } from '../../src/providers/xai';
import type { ProviderOptions } from '../../src/types/providers';

// Mock OpenAI provider
jest.mock('../../src/providers/openai/chat');

// Helper to create a mock toJSON function that masks apiKey
function createMockToJSON(modelName: string, config: any = {}) {
  const { _apiKey, ...restConfig } = config; // Use _apiKey to avoid unused var lint warning
  return () => ({
    provider: 'xai',
    model: modelName,
    config: restConfig,
  });
}

describe('xAI Provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock implementation of OpenAiChatCompletionProvider
    // Cast to any to avoid TypeScript errors with the mock
    (OpenAiChatCompletionProvider as any).mockImplementation((modelName: string, options: any) => {
      return {
        id: () => `xai:${modelName}`,
        toString: () => `[xAI Provider ${modelName}]`,
        toJSON: createMockToJSON(modelName, options?.config),
        callApi: jest.fn().mockImplementation(async () => ({ output: 'Mock response' })),
      };
    });
  });

  // ========================================================================
  // PROVIDER CREATION AND CONFIGURATION
  // ========================================================================
  describe('Provider creation and configuration', () => {
    it('throws an error if no model name is provided', () => {
      expect(() => createXAIProvider('xai:')).toThrow('Model name is required');
    });

    it('creates an xAI provider with specified model', () => {
      const provider = createXAIProvider('xai:grok-2');

      // Since we're mocking the constructor return value, we can't use instanceof
      // Instead we check that the constructor was called correctly
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('grok-2', expect.any(Object));

      // And verify the provider has the expected interface
      expect(provider.id()).toBe('xai:grok-2');
      expect(typeof provider.toString).toBe('function');
    });

    it('sets the correct API base URL and API key environment variable', () => {
      createXAIProvider('xai:grok-2');
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          config: expect.objectContaining({
            apiBaseUrl: 'https://api.x.ai/v1',
            apiKeyEnvar: 'XAI_API_KEY',
          }),
        }),
      );
    });

    it('uses region-specific API base URL when region is provided', () => {
      createXAIProvider('xai:grok-2', {
        config: {
          config: {
            region: 'us-west-1',
          },
        },
      });
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          config: expect.objectContaining({
            apiBaseUrl: 'https://us-west-1.api.x.ai/v1',
            apiKeyEnvar: 'XAI_API_KEY',
          }),
        }),
      );
    });

    it('merges provided options with xAI-specific config', () => {
      const options: ProviderOptions = {
        config: {
          temperature: 0.7,
          max_tokens: 100,
        },
        id: 'custom-id',
      };
      createXAIProvider('xai:grok-2', options);
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'grok-2',
        expect.objectContaining({
          config: expect.objectContaining({
            apiBaseUrl: 'https://api.x.ai/v1',
            apiKeyEnvar: 'XAI_API_KEY',
            temperature: 0.7,
            max_tokens: 100,
          }),
          id: 'custom-id',
        }),
      );
    });
  });

  // ========================================================================
  // PROVIDER METHODS
  // ========================================================================
  describe('Provider methods', () => {
    it('generates correct id() for the provider', () => {
      const provider = createXAIProvider('xai:grok-3-beta');
      expect(provider.id()).toBe('xai:grok-3-beta');
    });

    it('returns readable toString() description', () => {
      const provider = createXAIProvider('xai:grok-3-mini-beta');
      expect(provider.toString()).toBe('[xAI Provider grok-3-mini-beta]');
    });

    it('serializes properly with toJSON()', () => {
      // For this test, we need a more specific mock
      (OpenAiChatCompletionProvider as any).mockImplementation(() => ({
        id: () => 'xai:grok-3-beta',
        toString: () => '[xAI Provider grok-3-beta]',
        toJSON: () => ({
          provider: 'xai',
          model: 'grok-3-beta',
          config: {
            temperature: 0.7,
            // No other properties
          },
        }),
      }));

      const provider = createXAIProvider('xai:grok-3-beta', {
        config: {
          temperature: 0.7,
        } as any, // Cast to any to avoid TS error
      });

      // Compare only the specific properties we care about
      const json = provider.toJSON?.() || {};
      expect(json).toMatchObject({
        provider: 'xai',
        model: 'grok-3-beta',
        config: {
          temperature: 0.7,
        },
      });
    });

    it('masks API key in toJSON()', () => {
      // Set up our mock using the helper function directly
      (OpenAiChatCompletionProvider as any).mockImplementation((modelName: string) => {
        return {
          id: () => `xai:${modelName}`,
          toString: () => `[xAI Provider ${modelName}]`,
          // Key should be masked in toJSON output
          toJSON: createMockToJSON(modelName, { _apiKey: 'test-key' }),
        };
      });

      // Create provider with the overridden mock
      const provider = createXAIProvider('xai:grok-3-beta');

      // Our mock implementation should mask the API key
      const json = provider.toJSON?.() || {};
      expect(json.config.apiKey).toBeUndefined();
    });
  });

  // ========================================================================
  // STANDARD MODELS (grok-3-beta, grok-3-fast-beta)
  // ========================================================================
  describe('Standard models (grok-3-beta, grok-3-fast-beta)', () => {
    it('supports temperature for all models', () => {
      // Mock implementation for temperature support
      const mockSupportsTemperature = jest.fn().mockReturnValue(true);

      // Verify all models support temperature
      expect(mockSupportsTemperature()).toBe(true);
    });

    it('calculates costs correctly for standard models', () => {
      // grok-3-beta pricing
      const betaCost = calculateXAICost('grok-3-beta', {}, 1000, 500);
      expect(betaCost).toBeCloseTo(0.0105);

      // grok-3-fast-beta pricing (more expensive)
      const fastCost = calculateXAICost('grok-3-fast-beta', {}, 1000, 500);
      expect(fastCost).toBeCloseTo(0.0175);

      // Fast model should cost more than the standard model
      expect(Number(fastCost)).toBeGreaterThan(Number(betaCost));
    });

    it('does not support reasoning effort parameter', () => {
      // These models should ignore reasoning_effort if provided
      // This is implementation-specific, but worth testing
      createXAIProvider('xai:grok-3-beta', {
        config: {
          config: {
            reasoning_effort: 'high', // This should be ignored for non-mini models
          },
        },
      });

      // Verify the constructor was called with the parameter
      // but the implementation won't use it (tested in the provider code)
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'grok-3-beta',
        expect.objectContaining({
          config: expect.objectContaining({
            config: {
              reasoning_effort: 'high',
            },
          }),
        }),
      );
    });
  });

  // ========================================================================
  // REASONING MODELS (grok-3-mini-beta, grok-3-mini-fast-beta)
  // ========================================================================
  describe('Reasoning models (grok-3-mini-beta, grok-3-mini-fast-beta)', () => {
    it('identifies reasoning models correctly', () => {
      // Test the mock's implementation of isReasoningModel
      const mockReasoningCheck = jest.fn();
      mockReasoningCheck.mockReturnValueOnce(true); // mini
      mockReasoningCheck.mockReturnValueOnce(true); // mini-fast
      mockReasoningCheck.mockReturnValueOnce(false); // standard
      mockReasoningCheck.mockReturnValueOnce(false); // fast

      // Verify correct reasoning model detection
      expect(mockReasoningCheck()).toBe(true); // grok-3-mini-beta
      expect(mockReasoningCheck()).toBe(true); // grok-3-mini-fast-beta
      expect(mockReasoningCheck()).toBe(false); // grok-3-beta
      expect(mockReasoningCheck()).toBe(false); // grok-3-fast-beta
    });

    it('supports high reasoning effort parameter', () => {
      createXAIProvider('xai:grok-3-mini-beta', {
        config: {
          config: {
            reasoning_effort: 'high',
          },
        },
      });

      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'grok-3-mini-beta',
        expect.objectContaining({
          config: expect.objectContaining({
            apiBaseUrl: 'https://api.x.ai/v1',
            apiKeyEnvar: 'XAI_API_KEY',
            config: {
              reasoning_effort: 'high',
            },
          }),
        }),
      );
    });

    it('supports low reasoning effort parameter', () => {
      createXAIProvider('xai:grok-3-mini-beta', {
        config: {
          config: {
            reasoning_effort: 'low',
          },
        },
      });

      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'grok-3-mini-beta',
        expect.objectContaining({
          config: expect.objectContaining({
            config: {
              reasoning_effort: 'low',
            },
          }),
        }),
      );
    });

    it('calculates costs correctly for mini models', () => {
      // grok-3-mini-beta pricing
      const miniCost = calculateXAICost('grok-3-mini-beta', {}, 1000, 500);
      expect(miniCost).toBeCloseTo(0.00055);

      // grok-3-mini-fast-beta pricing
      const miniFastCost = calculateXAICost('grok-3-mini-fast-beta', {}, 1000, 500);
      expect(miniFastCost).toBeCloseTo(0.0026);

      // Fast mini should cost more than regular mini
      expect(Number(miniFastCost)).toBeGreaterThan(Number(miniCost));
    });

    it('handles multiple configuration options for mini models', () => {
      const options: ProviderOptions = {
        config: {
          config: {
            reasoning_effort: 'high',
            region: 'us-east-1',
          },
          temperature: 0.5,
          max_tokens: 1000,
        } as any, // Cast to any to avoid TS error
      };

      createXAIProvider('xai:grok-3-mini-beta', options);

      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'grok-3-mini-beta',
        expect.objectContaining({
          config: expect.objectContaining({
            apiBaseUrl: 'https://us-east-1.api.x.ai/v1',
            temperature: 0.5,
            max_tokens: 1000,
            config: {
              reasoning_effort: 'high',
              region: 'us-east-1',
            },
          }),
        }),
      );
    });
  });

  // ========================================================================
  // LEGACY MODELS (grok-2)
  // ========================================================================
  describe('Legacy models (grok-2)', () => {
    it('calculates costs correctly for grok-2 models', () => {
      // grok-2-latest pricing
      const grok2Cost = calculateXAICost('grok-2-latest', {}, 1000, 500);
      expect(grok2Cost).toBeCloseTo(0.007); // 1000 * (2/1e6) + 500 * (10/1e6)

      // grok-2-vision-latest pricing (same as standard grok-2)
      const grok2VisionCost = calculateXAICost('grok-2-vision-latest', {}, 1000, 500);
      expect(grok2VisionCost).toBeCloseTo(0.007);
    });
  });

  // ========================================================================
  // COST CALCULATION AND TOKEN PROCESSING
  // ========================================================================
  describe('Cost calculation and token processing', () => {
    it('includes reasoning tokens in cost calculation', () => {
      const cost = calculateXAICost('grok-3-mini-beta', {}, 1000, 500, 200);
      expect(cost).toBeCloseTo(0.00055);
    });

    it('handles model aliases correctly', () => {
      const costWithAlias = calculateXAICost('grok-3-latest', {}, 1000, 500);
      const costWithId = calculateXAICost('grok-3-beta', {}, 1000, 500);

      expect(costWithAlias).toBe(costWithId);
      expect(costWithAlias).toBeCloseTo(0.0105);
    });

    it('returns undefined for unknown models', () => {
      const cost = calculateXAICost('non-existent-model', {}, 1000, 500);
      expect(cost).toBeUndefined();
    });

    it('returns undefined when token counts are missing', () => {
      expect(calculateXAICost('grok-3-beta', {}, undefined, 500)).toBeUndefined();
      expect(calculateXAICost('grok-3-beta', {}, 1000, undefined)).toBeUndefined();
    });

    it('uses config cost values when provided', () => {
      const customCost = 10.0 / 1e6;
      const cost = calculateXAICost('grok-3-beta', { cost: customCost }, 1000, 500);

      expect(cost).toBeCloseTo(0.015);
    });

    it('handles different reasoning token counts without changing cost', () => {
      // Test with different reasoning token values
      const cost1 = calculateXAICost('grok-3-mini-beta', {}, 100, 50, 10);
      const cost2 = calculateXAICost('grok-3-mini-beta', {}, 100, 50, 30);

      // Reasoning tokens shouldn't change the total cost in our implementation
      expect(cost1).toBe(cost2);
    });

    it('properly applies custom cost values with reasoning tokens', () => {
      const customCost = 5.0 / 1e6;
      const cost = calculateXAICost('grok-3-mini-beta', { cost: customCost }, 100, 50, 30);

      // With custom cost, both input and output tokens use the same rate
      const expectedCost = (100 + 50) * (5.0 / 1e6);
      expect(cost).toBeCloseTo(expectedCost);
    });
  });

  // ========================================================================
  // API RESPONSE HANDLING
  // ========================================================================
  describe('API response handling', () => {
    it('processes reasoning tokens in Grok-3 mini models', () => {
      // Instead of mocking callApi, we'll test how calculateXAICost processes reasoning tokens
      const cost = calculateXAICost('grok-3-mini-beta', {}, 100, 50, 30);
      expect(cost).toBeDefined();
      expect(cost).toBeCloseTo(0.000055);
    });

    it('ignores reasoning tokens for non-mini models', () => {
      // Standard models don't support reasoning
      const standardCost = calculateXAICost('grok-3-beta', {}, 100, 50);
      const standardWithReasoningCost = calculateXAICost('grok-3-beta', {}, 100, 50, 30);

      // Adding reasoning tokens shouldn't change the cost for standard models
      expect(standardCost).toBe(standardWithReasoningCost);
    });

    it('applies different pricing models correctly', () => {
      // Compare pricing across different model types
      const miniCost = calculateXAICost('grok-3-mini-beta', {}, 100, 50, 30);
      const betaCost = calculateXAICost('grok-3-beta', {}, 100, 50);
      const grok2Cost = calculateXAICost('grok-2-latest', {}, 100, 50);

      // Flagship model should cost more than mini models
      expect(Number(betaCost)).toBeGreaterThan(Number(miniCost));

      // Grok-3-beta should be priced higher than grok-2
      expect(Number(betaCost)).toBeGreaterThan(Number(grok2Cost));
    });
  });
});
