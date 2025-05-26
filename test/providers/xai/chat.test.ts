import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';
import {
  calculateXAICost,
  createXAIProvider,
  XAI_CHAT_MODELS,
  GROK_3_MINI_MODELS,
} from '../../../src/providers/xai/chat';
import type { ProviderOptions } from '../../../src/types/providers';

jest.mock('../../../src/providers/openai/chat');
jest.mock('../../../src/logger');

function createMockToJSON(modelName: string, config: any = {}) {
  const { _apiKey, ...restConfig } = config;
  return () => ({
    provider: 'xai',
    model: modelName,
    config: restConfig,
  });
}

describe('xAI Chat Provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (OpenAiChatCompletionProvider as any).mockImplementation((modelName: string, options: any) => {
      return {
        id: () => `xai:${modelName}`,
        toString: () => `[xAI Provider ${modelName}]`,
        toJSON: createMockToJSON(modelName, options?.config),
        callApi: jest.fn().mockImplementation(async () => ({ output: 'Mock response' })),
        getOpenAiBody: jest.fn().mockImplementation((prompt) => ({
          body: {
            model: modelName,
            messages: [{ role: 'user', content: prompt }],
          },
        })),
      };
    });
  });

  describe('Provider creation and configuration', () => {
    it('throws an error if no model name is provided', () => {
      expect(() => createXAIProvider('xai:')).toThrow('Model name is required');
    });

    it('creates an xAI provider with specified model', () => {
      const provider = createXAIProvider('xai:grok-2');
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('grok-2', expect.any(Object));
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

    it('stores originalConfig during initialization', () => {
      const config = {
        config: {
          search_parameters: { mode: 'test' },
          region: 'us-west-1',
        },
      };
      const provider = createXAIProvider('xai:grok-2', { config }) as any;
      expect(provider.originalConfig).toEqual(config.config);
    });
  });

  describe('Provider methods', () => {
    it('generates correct id() for the provider', () => {
      const provider = createXAIProvider('xai:grok-3-beta');
      expect(provider.id()).toBe('xai:grok-3-beta');
    });

    it('returns readable toString() description', () => {
      const provider = createXAIProvider('xai:grok-3-mini-beta');
      expect(provider.toString()).toBe('[xAI Provider grok-3-mini-beta]');
    });

    it('serializes properly with toJSON() and masks API key', () => {
      (OpenAiChatCompletionProvider as any).mockImplementation((modelName: string) => {
        return {
          id: () => `xai:${modelName}`,
          toString: () => `[xAI Provider ${modelName}]`,
          toJSON: createMockToJSON(modelName, { _apiKey: 'test-key', temperature: 0.7 }),
        };
      });

      const provider = createXAIProvider('xai:grok-3-beta', {
        config: {
          temperature: 0.7,
        } as any,
      });

      expect(provider.toJSON).toBeDefined();
      const json = provider.toJSON!();
      expect(json).toMatchObject({
        provider: 'xai',
        model: 'grok-3-beta',
        config: {
          temperature: 0.7,
        },
      });
      expect(json.config.apiKey).toBeUndefined();
    });
  });

  describe('Search parameters handling', () => {
    it('renders search_parameters with context variables', () => {
      const mockGetOpenAiBody = jest.fn().mockImplementation((prompt: string, context: any) => ({
        body: {
          model: 'grok-3-beta',
          messages: [{ role: 'user', content: prompt }],
          search_parameters: {
            mode: context?.vars?.mode,
            filter: context?.vars?.filter,
          },
        },
      }));

      (OpenAiChatCompletionProvider as any).mockImplementation(() => ({
        getOpenAiBody: mockGetOpenAiBody,
      }));

      const provider = createXAIProvider('xai:grok-3-beta', {
        config: {
          config: {
            search_parameters: { mode: '{{mode}}', filter: '{{filter}}' },
          },
        },
      });

      const result = (provider as any).getOpenAiBody('test prompt', {
        vars: {
          mode: 'advanced',
          filter: 'latest',
        },
      });

      expect(result.body.search_parameters).toEqual({
        mode: 'advanced',
        filter: 'latest',
      });
    });

    it('includes search_parameters in API body when defined', () => {
      const mockGetOpenAiBody = jest.fn().mockImplementation(() => ({
        body: {
          model: 'grok-3-beta',
          messages: [{ role: 'user', content: 'test prompt' }],
          search_parameters: { mode: 'test' },
        },
      }));

      (OpenAiChatCompletionProvider as any).mockImplementation(() => ({
        getOpenAiBody: mockGetOpenAiBody,
      }));

      const provider = createXAIProvider('xai:grok-3-beta', {
        config: {
          config: {
            search_parameters: { mode: 'test' },
          },
        },
      });

      const result = (provider as any).getOpenAiBody('test prompt');
      expect(result.body.search_parameters).toEqual({ mode: 'test' });
    });

    it('does not include search_parameters when undefined and preserves original configuration', () => {
      const provider = createXAIProvider('xai:grok-3-beta');
      const result = (provider as any).getOpenAiBody('test prompt');
      expect(result.body.search_parameters).toBeUndefined();

      // Test preserving original config
      const searchParams = { mode: 'test', filter: 'all' };
      const providerWithParams = createXAIProvider('xai:grok-3-beta', {
        config: {
          config: {
            search_parameters: searchParams,
          },
        },
      }) as any;

      expect(providerWithParams.originalConfig.search_parameters).toEqual(searchParams);
    });
  });

  describe('Model type detection and capabilities', () => {
    it('identifies reasoning models correctly', () => {
      expect(GROK_3_MINI_MODELS).toContain('grok-3-mini-beta');
      expect(GROK_3_MINI_MODELS).toContain('grok-3-mini-fast-beta');
      expect(GROK_3_MINI_MODELS).not.toContain('grok-2-1212');
    });
  });

  describe('Reasoning models configuration', () => {
    it('supports reasoning effort parameters for mini models', () => {
      // Test high reasoning effort
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
          }),
        }),
      );

      // Test low reasoning effort
      createXAIProvider('xai:grok-3-mini-beta', {
        config: {
          config: {
            reasoning_effort: 'low',
          },
        },
      });

      expect(OpenAiChatCompletionProvider).toHaveBeenLastCalledWith(
        'grok-3-mini-beta',
        expect.objectContaining({
          config: expect.objectContaining({
            apiKeyEnvar: 'XAI_API_KEY',
          }),
        }),
      );
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
        } as any,
      };

      createXAIProvider('xai:grok-3-mini-beta', options);

      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(
        'grok-3-mini-beta',
        expect.objectContaining({
          config: expect.objectContaining({
            apiBaseUrl: 'https://us-east-1.api.x.ai/v1',
            temperature: 0.5,
            max_tokens: 1000,
          }),
        }),
      );
    });
  });

  describe('Cost calculation', () => {
    it('calculates costs correctly for all model types', () => {
      // Standard models
      const betaCost = calculateXAICost('grok-3-beta', {}, 1000, 500);
      expect(betaCost).toBeCloseTo(0.0105);
      expect(betaCost).toBe(1000 * (3.0 / 1e6) + 500 * (15.0 / 1e6));

      const fastCost = calculateXAICost('grok-3-fast-beta', {}, 1000, 500);
      expect(fastCost).toBeCloseTo(0.0175);

      // Mini models
      const miniCost = calculateXAICost('grok-3-mini-beta', {}, 1000, 500);
      expect(miniCost).toBeCloseTo(0.00055);
      expect(miniCost).toBe(1000 * (0.3 / 1e6) + 500 * (0.5 / 1e6));

      const miniFastCost = calculateXAICost('grok-3-mini-fast-beta', {}, 1000, 500);
      expect(miniFastCost).toBeCloseTo(0.0026);

      // Legacy models
      const grok2Cost = calculateXAICost('grok-2-latest', {}, 1000, 500);
      expect(grok2Cost).toBeCloseTo(0.007);

      const grok2VisionCost = calculateXAICost('grok-2-vision-latest', {}, 1000, 500);
      expect(grok2VisionCost).toBeCloseTo(0.007);

      // Verify cost relationships
      expect(Number(fastCost)).toBeGreaterThan(Number(betaCost));
      expect(Number(miniFastCost)).toBeGreaterThan(Number(miniCost));
      expect(Number(betaCost)).toBeGreaterThan(Number(miniCost));
    });

    it('handles model aliases correctly', () => {
      const costWithAlias = calculateXAICost('grok-3-latest', {}, 1000, 500);
      const costWithId = calculateXAICost('grok-3-beta', {}, 1000, 500);
      const aliasTest = calculateXAICost('grok-3', {}, 1000, 500);

      expect(costWithAlias).toBe(costWithId);
      expect(aliasTest).toBe(costWithId);
      expect(costWithAlias).toBeCloseTo(0.0105);
    });

    it('returns undefined for invalid inputs', () => {
      expect(calculateXAICost('non-existent-model', {}, 1000, 500)).toBeUndefined();
      expect(calculateXAICost('unknown-model', {}, 1000, 500)).toBeUndefined();
      expect(calculateXAICost('grok-3-beta', {}, undefined, 500)).toBeUndefined();
      expect(calculateXAICost('grok-3-beta', {}, 1000, undefined)).toBeUndefined();
      expect(calculateXAICost('grok-3-beta', {}, undefined, undefined)).toBeUndefined();
    });

    it('uses custom cost values when provided', () => {
      const customCost = 10.0 / 1e6;
      const cost = calculateXAICost('grok-3-beta', { cost: customCost }, 1000, 500);
      expect(cost).toBeCloseTo(0.015);
      expect(cost).toBe(1000 * (10.0 / 1e6) + 500 * (10.0 / 1e6));

      // Test with reasoning tokens
      const customCostWithReasoning = 5.0 / 1e6;
      const costWithReasoning = calculateXAICost(
        'grok-3-mini-beta',
        { cost: customCostWithReasoning },
        100,
        50,
        30,
      );
      const expectedCost = (100 + 50) * (5.0 / 1e6);
      expect(costWithReasoning).toBeCloseTo(expectedCost);
    });

    it('handles reasoning tokens correctly', () => {
      // Reasoning tokens are included in mini model calculations
      const miniCostWithReasoning = calculateXAICost('grok-3-mini-beta', {}, 100, 50, 30);
      expect(miniCostWithReasoning).toBeDefined();
      expect(miniCostWithReasoning).toBeCloseTo(0.000055);
      expect(miniCostWithReasoning).toBe(100 * (0.3 / 1e6) + 50 * (0.5 / 1e6));

      // Reasoning tokens don't affect non-mini models
      const standardCost = calculateXAICost('grok-3-beta', {}, 100, 50);
      const standardWithReasoningCost = calculateXAICost('grok-3-beta', {}, 100, 50, 30);
      expect(standardCost).toBe(standardWithReasoningCost);

      // Different reasoning token counts don't change cost for mini models
      const cost1 = calculateXAICost('grok-3-mini-beta', {}, 100, 50, 10);
      const cost2 = calculateXAICost('grok-3-mini-beta', {}, 100, 50, 30);
      expect(cost1).toBe(cost2);

      // Reasoning tokens in cost calculation
      const costWithReasoningTokens = calculateXAICost('grok-3-mini-beta', {}, 1000, 500, 200);
      expect(costWithReasoningTokens).toBe(1000 * (0.3 / 1e6) + 500 * (0.5 / 1e6));
    });
  });

  describe('Model constants and configuration', () => {
    it('defines correct Grok-3 mini models', () => {
      expect(GROK_3_MINI_MODELS).toEqual(['grok-3-mini-beta', 'grok-3-mini-fast-beta']);
    });

    it('defines model costs correctly', () => {
      const grok3Beta = XAI_CHAT_MODELS.find((m) => m.id === 'grok-3-beta');
      expect(grok3Beta).toBeDefined();
      expect(grok3Beta!.cost.input).toBe(3.0 / 1e6);
      expect(grok3Beta!.cost.output).toBe(15.0 / 1e6);
    });

    it('includes all required model properties', () => {
      XAI_CHAT_MODELS.forEach((model) => {
        expect(model).toHaveProperty('id');
        expect(model).toHaveProperty('cost');
        expect(model.cost).toHaveProperty('input');
        expect(model.cost).toHaveProperty('output');
      });
    });

    it('has correct aliases for models', () => {
      const modelWithAliases = XAI_CHAT_MODELS.find((m) => m.id === 'grok-3-beta');
      expect(modelWithAliases?.aliases).toEqual(['grok-3', 'grok-3-latest']);
    });
  });
});
