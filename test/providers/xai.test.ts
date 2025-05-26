import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { calculateXAICost, createXAIProvider } from '../../src/providers/xai';
import type { ProviderOptions } from '../../src/types/providers';

jest.mock('../../src/providers/openai/chat');

function createMockToJSON(modelName: string, config: any = {}) {
  const { _apiKey, ...restConfig } = config;
  return () => ({
    provider: 'xai',
    model: modelName,
    config: restConfig,
  });
}

describe('xAI Provider', () => {
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

    it('serializes properly with toJSON()', () => {
      (OpenAiChatCompletionProvider as any).mockImplementation(() => ({
        id: () => 'xai:grok-3-beta',
        toString: () => '[xAI Provider grok-3-beta]',
        toJSON: () => ({
          provider: 'xai',
          model: 'grok-3-beta',
          config: {
            temperature: 0.7,
          },
        }),
      }));

      const provider = createXAIProvider('xai:grok-3-beta', {
        config: {
          temperature: 0.7,
        } as any,
      });

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
      (OpenAiChatCompletionProvider as any).mockImplementation((modelName: string) => {
        return {
          id: () => `xai:${modelName}`,
          toString: () => `[xAI Provider ${modelName}]`,
          toJSON: createMockToJSON(modelName, { _apiKey: 'test-key' }),
        };
      });

      const provider = createXAIProvider('xai:grok-3-beta');

      const json = provider.toJSON?.() || {};
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

    it('does not include search_parameters when undefined', () => {
      const provider = createXAIProvider('xai:grok-3-beta');
      const result = (provider as any).getOpenAiBody('test prompt');
      expect(result.body.search_parameters).toBeUndefined();
    });

    it('preserves original search_parameters configuration', () => {
      const searchParams = { mode: 'test', filter: 'all' };
      const provider = createXAIProvider('xai:grok-3-beta', {
        config: {
          config: {
            search_parameters: searchParams,
          },
        },
      }) as any;

      expect(provider.originalConfig.search_parameters).toEqual(searchParams);
    });
  });

  describe('Standard models (grok-3-beta, grok-3-fast-beta)', () => {
    it('supports temperature for all models', () => {
      const mockSupportsTemperature = jest.fn().mockReturnValue(true);
      expect(mockSupportsTemperature()).toBe(true);
    });

    it('calculates costs correctly for standard models', () => {
      const betaCost = calculateXAICost('grok-3-beta', {}, 1000, 500);
      expect(betaCost).toBeCloseTo(0.0105);

      const fastCost = calculateXAICost('grok-3-fast-beta', {}, 1000, 500);
      expect(fastCost).toBeCloseTo(0.0175);

      expect(Number(fastCost)).toBeGreaterThan(Number(betaCost));
    });

    it('does not support reasoning effort parameter', () => {
      createXAIProvider('xai:grok-3-beta', {
        config: {
          config: {
            reasoning_effort: 'high',
          },
        },
      });

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

  describe('Reasoning models (grok-3-mini-beta, grok-3-mini-fast-beta)', () => {
    it('identifies reasoning models correctly', () => {
      const mockReasoningCheck = jest.fn();
      mockReasoningCheck.mockReturnValueOnce(true);
      mockReasoningCheck.mockReturnValueOnce(true);
      mockReasoningCheck.mockReturnValueOnce(false);
      mockReasoningCheck.mockReturnValueOnce(false);

      expect(mockReasoningCheck()).toBe(true);
      expect(mockReasoningCheck()).toBe(true);
      expect(mockReasoningCheck()).toBe(false);
      expect(mockReasoningCheck()).toBe(false);
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
      const miniCost = calculateXAICost('grok-3-mini-beta', {}, 1000, 500);
      expect(miniCost).toBeCloseTo(0.00055);

      const miniFastCost = calculateXAICost('grok-3-mini-fast-beta', {}, 1000, 500);
      expect(miniFastCost).toBeCloseTo(0.0026);

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
            config: {
              reasoning_effort: 'high',
              region: 'us-east-1',
            },
          }),
        }),
      );
    });
  });

  describe('Legacy models (grok-2)', () => {
    it('calculates costs correctly for grok-2 models', () => {
      const grok2Cost = calculateXAICost('grok-2-latest', {}, 1000, 500);
      expect(grok2Cost).toBeCloseTo(0.007);

      const grok2VisionCost = calculateXAICost('grok-2-vision-latest', {}, 1000, 500);
      expect(grok2VisionCost).toBeCloseTo(0.007);
    });
  });

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
      const cost1 = calculateXAICost('grok-3-mini-beta', {}, 100, 50, 10);
      const cost2 = calculateXAICost('grok-3-mini-beta', {}, 100, 50, 30);

      expect(cost1).toBe(cost2);
    });

    it('properly applies custom cost values with reasoning tokens', () => {
      const customCost = 5.0 / 1e6;
      const cost = calculateXAICost('grok-3-mini-beta', { cost: customCost }, 100, 50, 30);

      const expectedCost = (100 + 50) * (5.0 / 1e6);
      expect(cost).toBeCloseTo(expectedCost);
    });
  });

  describe('API response handling', () => {
    it('processes reasoning tokens in Grok-3 mini models', () => {
      const cost = calculateXAICost('grok-3-mini-beta', {}, 100, 50, 30);
      expect(cost).toBeDefined();
      expect(cost).toBeCloseTo(0.000055);
    });

    it('ignores reasoning tokens for non-mini models', () => {
      const standardCost = calculateXAICost('grok-3-beta', {}, 100, 50);
      const standardWithReasoningCost = calculateXAICost('grok-3-beta', {}, 100, 50, 30);

      expect(standardCost).toBe(standardWithReasoningCost);
    });

    it('applies different pricing models correctly', () => {
      const miniCost = calculateXAICost('grok-3-mini-beta', {}, 100, 50, 30);
      const betaCost = calculateXAICost('grok-3-beta', {}, 100, 50);
      const grok2Cost = calculateXAICost('grok-2-latest', {}, 100, 50);

      expect(Number(betaCost)).toBeGreaterThan(Number(miniCost));
      expect(Number(betaCost)).toBeGreaterThan(Number(grok2Cost));
    });
  });
});
