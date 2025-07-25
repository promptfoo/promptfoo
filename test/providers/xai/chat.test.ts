import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';
import {
  calculateXAICost,
  createXAIProvider,
  GROK_3_MINI_MODELS,
  GROK_4_MODELS,
  GROK_REASONING_EFFORT_MODELS,
  GROK_REASONING_MODELS,
  XAI_CHAT_MODELS,
} from '../../../src/providers/xai/chat';

import type { ProviderOptions } from '../../../src/types/providers';

jest.mock('../../../src/providers/openai/chat');
jest.mock('../../../src/logger');

// Mock the parent class methods
const mockGetOpenAiBody = jest.fn();
const mockCallApi = jest.fn();

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

    // Set up the mock to return the expected base implementation
    mockGetOpenAiBody.mockImplementation(function (
      this: any,
      prompt: string,
      context?: any,
      callApiOptions?: any,
    ) {
      const config = context?.prompt?.config || {};
      const body: any = {
        model: this.modelName || 'test-model',
        messages: [{ role: 'user', content: prompt }],
      };

      // Add parameters if they exist in config
      if (config.temperature !== undefined) {
        body.temperature = config.temperature;
      }
      if (config.presence_penalty !== undefined) {
        body.presence_penalty = config.presence_penalty;
      }
      if (config.frequency_penalty !== undefined) {
        body.frequency_penalty = config.frequency_penalty;
      }
      if (config.stop !== undefined) {
        body.stop = config.stop;
      }
      if (config.reasoning_effort !== undefined) {
        body.reasoning_effort = config.reasoning_effort;
      }
      if (config.max_tokens !== undefined) {
        body.max_tokens = config.max_tokens;
      }
      if (config.max_completion_tokens !== undefined) {
        body.max_completion_tokens = config.max_completion_tokens;
      }

      // Simulate the actual XAIProvider filtering logic
      const result = { body, config };

      // Filter out unsupported parameters for Grok-4
      if (this.modelName && GROK_4_MODELS.includes(this.modelName)) {
        delete result.body.presence_penalty;
        delete result.body.frequency_penalty;
        delete result.body.stop;
        delete result.body.reasoning_effort;
      }

      // Filter reasoning_effort for models that don't support it
      if (
        !this.supportsReasoningEffort ||
        (!this.supportsReasoningEffort() && result.body.reasoning_effort)
      ) {
        delete result.body.reasoning_effort;
      }

      return result;
    });

    mockCallApi.mockResolvedValue({ output: 'Mock response' });

    (OpenAiChatCompletionProvider as any).mockImplementation((modelName: string, options: any) => {
      return {
        id: () => `xai:${modelName}`,
        toString: () => `[xAI Provider ${modelName}]`,
        toJSON: createMockToJSON(modelName, options?.config),
        callApi: mockCallApi,
        getOpenAiBody: mockGetOpenAiBody,
        modelName,
        config: options?.config,
        // Add the XAIProvider specific methods for testing
        isReasoningModel: () => GROK_REASONING_MODELS.includes(modelName),
        supportsReasoningEffort: () => GROK_REASONING_EFFORT_MODELS.includes(modelName),
        supportsTemperature: () => true,
        originalConfig: options?.config?.config,
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

  describe('Grok-4 specific functionality', () => {
    it('recognizes Grok-4 models as reasoning models', () => {
      const provider = createXAIProvider('xai:grok-4-0709') as any;
      expect(provider.isReasoningModel()).toBe(true);

      const providerAlias = createXAIProvider('xai:grok-4') as any;
      expect(providerAlias.isReasoningModel()).toBe(true);
    });

    it('does not support reasoning_effort for Grok-4', () => {
      const provider = createXAIProvider('xai:grok-4-0709') as any;
      expect(provider.supportsReasoningEffort()).toBe(false);
    });

    it('filters unsupported parameters for Grok-4 aliases', () => {
      const provider = createXAIProvider('xai:grok-4') as any;
      const mockContext = {
        prompt: {
          config: {
            presence_penalty: 0.5,
            frequency_penalty: 0.7,
            stop: ['\\n'],
            reasoning_effort: 'high',
            temperature: 0.8,
          },
        },
      };

      const result = provider.getOpenAiBody('test prompt', mockContext);

      // These should be filtered out for Grok-4
      expect(result.body.presence_penalty).toBeUndefined();
      expect(result.body.frequency_penalty).toBeUndefined();
      expect(result.body.stop).toBeUndefined();
      expect(result.body.reasoning_effort).toBeUndefined();

      // Temperature should still be present
      expect(result.body.temperature).toBe(0.8);
    });
  });

  describe('Model constants', () => {
    it('includes Grok-4 in reasoning models list', () => {
      expect(GROK_REASONING_MODELS).toContain('grok-4-0709');
      expect(GROK_REASONING_MODELS).toContain('grok-4');
      expect(GROK_REASONING_MODELS).toContain('grok-4-latest');
    });

    it('does not include Grok-4 in reasoning effort models list', () => {
      expect(GROK_REASONING_EFFORT_MODELS).not.toContain('grok-4-0709');
      expect(GROK_REASONING_EFFORT_MODELS).not.toContain('grok-4');
    });

    it('includes Grok-3 mini models in reasoning effort models list', () => {
      expect(GROK_REASONING_EFFORT_MODELS).toContain('grok-3-mini-beta');
      expect(GROK_REASONING_EFFORT_MODELS).toContain('grok-3-mini-fast-beta');
    });

    it('includes Grok-4 in XAI_CHAT_MODELS with correct pricing', () => {
      const grok4Model = XAI_CHAT_MODELS.find((model) => model.id === 'grok-4-0709');
      expect(grok4Model).toBeDefined();
      expect(grok4Model?.cost.input).toBe(3.0 / 1e6);
      expect(grok4Model?.cost.output).toBe(15.0 / 1e6);
      expect(grok4Model?.aliases).toContain('grok-4');
      expect(grok4Model?.aliases).toContain('grok-4-latest');
    });

    it('includes all Grok-3 mini aliases in reasoning constants', () => {
      // Test GROK_REASONING_EFFORT_MODELS
      expect(GROK_REASONING_EFFORT_MODELS).toContain('grok-3-mini-beta');
      expect(GROK_REASONING_EFFORT_MODELS).toContain('grok-3-mini');
      expect(GROK_REASONING_EFFORT_MODELS).toContain('grok-3-mini-latest');
      expect(GROK_REASONING_EFFORT_MODELS).toContain('grok-3-mini-fast-beta');
      expect(GROK_REASONING_EFFORT_MODELS).toContain('grok-3-mini-fast');
      expect(GROK_REASONING_EFFORT_MODELS).toContain('grok-3-mini-fast-latest');

      // Test GROK_REASONING_MODELS
      expect(GROK_REASONING_MODELS).toContain('grok-3-mini-beta');
      expect(GROK_REASONING_MODELS).toContain('grok-3-mini');
      expect(GROK_REASONING_MODELS).toContain('grok-3-mini-latest');
      expect(GROK_REASONING_MODELS).toContain('grok-3-mini-fast-beta');
      expect(GROK_REASONING_MODELS).toContain('grok-3-mini-fast');
      expect(GROK_REASONING_MODELS).toContain('grok-3-mini-fast-latest');
    });

    it('recognizes Grok-3 mini aliases as reasoning models', () => {
      const aliases = [
        'grok-3-mini',
        'grok-3-mini-latest',
        'grok-3-mini-fast',
        'grok-3-mini-fast-latest',
      ];

      aliases.forEach((alias) => {
        const provider = createXAIProvider(`xai:${alias}`) as any;
        expect(provider.isReasoningModel()).toBe(true);
        expect(provider.supportsReasoningEffort()).toBe(true);
      });
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
      expect(GROK_3_MINI_MODELS).toEqual([
        'grok-3-mini-beta',
        'grok-3-mini',
        'grok-3-mini-latest',
        'grok-3-mini-fast-beta',
        'grok-3-mini-fast',
        'grok-3-mini-fast-latest',
      ]);
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

  describe('callApi error handling', () => {
    beforeEach(() => {
      // Reset all mocks
      jest.clearAllMocks();

      // Create a simple mock implementation that mimics the XAI provider's error handling
      (OpenAiChatCompletionProvider as any).mockImplementation(
        (modelName: string, options: any) => {
          const provider = {
            modelName,
            config: options?.config,
            originalConfig: options?.config?.config,
            id: () => `xai:${modelName}`,
            toString: () => `[xAI Provider ${modelName}]`,
            toJSON: createMockToJSON(modelName, options?.config),
            getOpenAiBody: mockGetOpenAiBody,
            isReasoningModel: () => GROK_REASONING_MODELS.includes(modelName),
            supportsReasoningEffort: () => GROK_REASONING_EFFORT_MODELS.includes(modelName),
            callApi: async (prompt: string, context?: any, callApiOptions?: any) => {
              // This mimics the actual XAI provider's callApi implementation
              try {
                // Call the mocked super.callApi
                const response = await mockCallApi(prompt, context, callApiOptions);

                if (!response || response.error) {
                  // Check if the error indicates an authentication issue
                  if (
                    response?.error &&
                    (response.error.includes('502 Bad Gateway') ||
                      response.error.includes('invalid API key') ||
                      response.error.includes('authentication error'))
                  ) {
                    // Provide a more helpful error message for x.ai specific issues
                    return {
                      ...response,
                      error: `x.ai API error: ${response.error}\n\nTip: Ensure your XAI_API_KEY environment variable is set correctly. You can get an API key from https://x.ai/`,
                    };
                  }
                  return response;
                }

                // Rest of the processing...
                return response;
              } catch (err) {
                // Handle JSON parsing errors and other API errors
                const errorMessage = err instanceof Error ? err.message : String(err);

                // Check for common x.ai error patterns
                if (
                  errorMessage.includes('Error parsing response') &&
                  errorMessage.includes('<html')
                ) {
                  // This is likely a 502 Bad Gateway or similar HTML error response
                  return {
                    error: `x.ai API error: Server returned an HTML error page instead of JSON. This often indicates an invalid API key or server issues.\n\nTip: Ensure your XAI_API_KEY environment variable is set correctly. You can get an API key from https://x.ai/`,
                  };
                } else if (errorMessage.includes('502') || errorMessage.includes('Bad Gateway')) {
                  return {
                    error: `x.ai API error: 502 Bad Gateway - This often indicates an invalid API key.\n\nTip: Ensure your XAI_API_KEY environment variable is set correctly. You can get an API key from https://x.ai/`,
                  };
                }

                // For other errors, pass them through with a helpful tip
                return {
                  error: `x.ai API error: ${errorMessage}\n\nIf this persists, verify your API key at https://x.ai/`,
                };
              }
            },
          };
          return provider;
        },
      );
    });

    it('should handle JSON parsing errors from 502 HTML responses', async () => {
      // Mock callApi to throw a JSON parsing error
      mockCallApi.mockRejectedValueOnce(
        new Error(
          'Error parsing response from https://api.x.ai/v1/chat/completions: Unexpected token \'<\', "<html>\\n<h"... is not valid JSON. Received text: <html>...',
        ),
      );

      const provider = createXAIProvider('xai:grok-4', {
        config: {
          apiKey: 'test-key',
          config: {},
        } as any,
      });

      const result = await provider.callApi('test prompt');

      expect(result.error).toBeDefined();
      expect(result.error).toContain('x.ai API error:');
      expect(result.error).toContain('Server returned an HTML error page instead of JSON');
      expect(result.error).toContain('This often indicates an invalid API key');
      expect(result.error).toContain(
        'Ensure your XAI_API_KEY environment variable is set correctly',
      );
      expect(result.error).toContain('https://x.ai/');
    });

    it('should handle 502 Bad Gateway errors in error messages', async () => {
      // Mock callApi to return an error response
      mockCallApi.mockResolvedValueOnce({
        error: 'API error: 502 Bad Gateway',
      });

      const provider = createXAIProvider('xai:grok-4', {
        config: {
          apiKey: 'test-key',
          config: {},
        } as any,
      });

      const result = await provider.callApi('test prompt');

      expect(result.error).toBeDefined();
      expect(result.error).toContain('x.ai API error:');
      expect(result.error).toContain('502 Bad Gateway');
      expect(result.error).toContain(
        'Ensure your XAI_API_KEY environment variable is set correctly',
      );
    });

    it('should handle authentication errors', async () => {
      // Mock callApi to return an authentication error
      mockCallApi.mockResolvedValueOnce({
        error: 'authentication error: invalid API key provided',
      });

      const provider = createXAIProvider('xai:grok-4', {
        config: {
          apiKey: 'test-key',
          config: {},
        } as any,
      });

      const result = await provider.callApi('test prompt');

      expect(result.error).toBeDefined();
      expect(result.error).toContain('x.ai API error:');
      expect(result.error).toContain('authentication error');
      expect(result.error).toContain(
        'Ensure your XAI_API_KEY environment variable is set correctly',
      );
    });

    it('should handle generic errors with helpful message', async () => {
      // Mock callApi to throw a generic error
      mockCallApi.mockRejectedValueOnce(new Error('Network timeout'));

      const provider = createXAIProvider('xai:grok-4', {
        config: {
          apiKey: 'test-key',
          config: {},
        } as any,
      });

      const result = await provider.callApi('test prompt');

      expect(result.error).toBeDefined();
      expect(result.error).toContain('x.ai API error:');
      expect(result.error).toContain('Network timeout');
      expect(result.error).toContain('If this persists, verify your API key at https://x.ai/');
    });

    it('should pass through successful responses', async () => {
      const successResponse = {
        output: 'Test response',
        tokenUsage: { prompt: 10, completion: 20, total: 30 },
      };

      // Mock callApi to return success
      mockCallApi.mockResolvedValueOnce(successResponse);

      const provider = createXAIProvider('xai:grok-4', {
        config: {
          apiKey: 'test-key',
          config: {},
        } as any,
      });

      const result = await provider.callApi('test prompt');

      expect(result.output).toBe('Test response');
      expect(result.error).toBeUndefined();
      expect(result.tokenUsage).toEqual(successResponse.tokenUsage);
    });

    it('should handle errors that mention Bad Gateway', async () => {
      // Mock callApi to throw an error with "Bad Gateway" in the message
      mockCallApi.mockRejectedValueOnce(new Error('Request failed: 502 Bad Gateway'));

      const provider = createXAIProvider('xai:grok-4', {
        config: {
          apiKey: 'test-key',
          config: {},
        } as any,
      });

      const result = await provider.callApi('test prompt');

      expect(result.error).toBeDefined();
      expect(result.error).toContain('x.ai API error:');
      expect(result.error).toContain('502 Bad Gateway');
      expect(result.error).toContain('This often indicates an invalid API key');
    });

    it('should handle non-Error objects in catch block', async () => {
      // Mock callApi to throw a string (not an Error object)
      mockCallApi.mockRejectedValueOnce('String error message');

      const provider = createXAIProvider('xai:grok-4', {
        config: {
          apiKey: 'test-key',
          config: {},
        } as any,
      });

      const result = await provider.callApi('test prompt');

      expect(result.error).toBeDefined();
      expect(result.error).toContain('x.ai API error:');
      expect(result.error).toContain('String error message');
      expect(result.error).toContain('If this persists, verify your API key');
    });
  });
});
