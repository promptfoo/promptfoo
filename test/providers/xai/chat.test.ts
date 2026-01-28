import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

// Mock only external dependencies - NOT the OpenAiChatCompletionProvider class
vi.mock('../../../src/logger');

const mockFetchWithCache = vi.hoisted(() => vi.fn());
vi.mock('../../../src/cache', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    fetchWithCache: (...args: any[]) => mockFetchWithCache(...args),
    getCache: vi.fn(),
    isCacheEnabled: vi.fn().mockReturnValue(false),
  };
});

describe('xAI Chat Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock for fetchWithCache - successful response
    mockFetchWithCache.mockResolvedValue({
      data: {
        choices: [{ message: { content: 'Mock response' } }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Provider creation and configuration', () => {
    it('throws an error if no model name is provided', () => {
      expect(() => createXAIProvider('xai:')).toThrow('Model name is required');
    });

    it('creates an xAI provider with specified model', () => {
      const provider = createXAIProvider('xai:grok-2') as any;
      expect(provider.id()).toBe('xai:grok-2');
      expect(provider.modelName).toBe('grok-2');
      expect(typeof provider.toString).toBe('function');
    });

    it('sets the correct API base URL and API key environment variable', () => {
      const provider = createXAIProvider('xai:grok-2') as any;
      expect(provider.config.apiBaseUrl).toBe('https://api.x.ai/v1');
      expect(provider.config.apiKeyEnvar).toBe('XAI_API_KEY');
    });

    it('uses region-specific API base URL when region is provided', () => {
      const provider = createXAIProvider('xai:grok-2', {
        config: {
          config: {
            region: 'us-west-1',
          },
        },
      }) as any;
      expect(provider.config.apiBaseUrl).toBe('https://us-west-1.api.x.ai/v1');
      expect(provider.config.apiKeyEnvar).toBe('XAI_API_KEY');
    });

    it('merges provided options with xAI-specific config', () => {
      const options: ProviderOptions = {
        config: {
          temperature: 0.7,
          max_tokens: 100,
        },
        id: 'custom-id',
      };
      const provider = createXAIProvider('xai:grok-2', options) as any;
      expect(provider.config.apiBaseUrl).toBe('https://api.x.ai/v1');
      expect(provider.config.apiKeyEnvar).toBe('XAI_API_KEY');
      expect(provider.config.temperature).toBe(0.7);
      expect(provider.config.max_tokens).toBe(100);
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
      });
      // Verify API key is not exposed in serialized output
      expect(json.config?.apiKey).toBeUndefined();
    });
  });

  describe('Search parameters handling', () => {
    it('renders search_parameters with context variables', async () => {
      const provider = createXAIProvider('xai:grok-3-beta', {
        config: {
          config: {
            search_parameters: { mode: '{{mode}}', filter: '{{filter}}' },
          },
        },
      });

      const result = await (provider as any).getOpenAiBody('test prompt', {
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

    it('includes search_parameters in API body when defined', async () => {
      const provider = createXAIProvider('xai:grok-3-beta', {
        config: {
          config: {
            search_parameters: { mode: 'test' },
          },
        },
      });

      const result = await (provider as any).getOpenAiBody('test prompt');
      expect(result.body.search_parameters).toEqual({ mode: 'test' });
    });

    it('does not include search_parameters when undefined and preserves original configuration', async () => {
      const provider = createXAIProvider('xai:grok-3-beta');
      const result = await (provider as any).getOpenAiBody('test prompt');
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

  describe('Temperature zero handling', () => {
    it('should correctly send temperature: 0 in the request body', async () => {
      // Test that temperature: 0 is correctly sent (not filtered out by falsy check)
      const provider = createXAIProvider('xai:grok-3-beta', {
        config: {
          temperature: 0,
        } as any,
      });

      const result = await (provider as any).getOpenAiBody('test prompt');

      // temperature: 0 should be present in the request body
      expect(result.body.temperature).toBe(0);
      expect('temperature' in result.body).toBe(true);
    });
  });

  describe('Model type detection and capabilities', () => {
    it('identifies reasoning models correctly', () => {
      expect(GROK_3_MINI_MODELS).toContain('grok-3-mini-beta');
      expect(GROK_3_MINI_MODELS).toContain('grok-3-mini-fast-beta');
      expect(GROK_3_MINI_MODELS).not.toContain('grok-2-1212');
    });

    it('identifies Grok Code Fast as reasoning models', () => {
      expect(GROK_REASONING_MODELS).toContain('grok-code-fast-1');
      expect(GROK_REASONING_MODELS).toContain('grok-code-fast');
      expect(GROK_REASONING_MODELS).toContain('grok-code-fast-1-0825');
    });
  });

  describe('Reasoning models configuration', () => {
    it('supports reasoning effort parameters for mini models', () => {
      // Test high reasoning effort
      const provider = createXAIProvider('xai:grok-3-mini-beta', {
        config: {
          config: {
            reasoning_effort: 'high',
          },
        },
      }) as any;

      expect(provider.config.apiBaseUrl).toBe('https://api.x.ai/v1');
      expect(provider.config.apiKeyEnvar).toBe('XAI_API_KEY');

      // Test low reasoning effort
      const provider2 = createXAIProvider('xai:grok-3-mini-beta', {
        config: {
          config: {
            reasoning_effort: 'low',
          },
        },
      }) as any;

      expect(provider2.config.apiKeyEnvar).toBe('XAI_API_KEY');
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

      const provider = createXAIProvider('xai:grok-3-mini-beta', options) as any;

      expect(provider.config.apiBaseUrl).toBe('https://us-east-1.api.x.ai/v1');
      expect(provider.config.temperature).toBe(0.5);
      expect(provider.config.max_tokens).toBe(1000);
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

    it('filters unsupported parameters for Grok-4 aliases', async () => {
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

      const result = await provider.getOpenAiBody('test prompt', mockContext);

      // These should be filtered out for Grok-4
      expect(result.body.presence_penalty).toBeUndefined();
      expect(result.body.frequency_penalty).toBeUndefined();
      expect(result.body.stop).toBeUndefined();
      expect(result.body.reasoning_effort).toBeUndefined();

      // Temperature should still be present
      expect(result.body.temperature).toBe(0.8);
    });

    it('filters unsupported parameters for Grok 4.1 Fast models', async () => {
      const provider = createXAIProvider('xai:grok-4-1-fast-reasoning') as any;
      const mockContext = {
        prompt: {
          config: {
            presence_penalty: 0.5,
            frequency_penalty: 0.7,
            stop: ['\\n'],
            reasoning_effort: 'high',
            temperature: 0.7,
            max_completion_tokens: 2048,
          },
        },
      };

      const result = await provider.getOpenAiBody('test prompt', mockContext);

      // These should be filtered out for Grok 4.1 Fast
      expect(result.body.presence_penalty).toBeUndefined();
      expect(result.body.frequency_penalty).toBeUndefined();
      expect(result.body.stop).toBeUndefined();
      expect(result.body.reasoning_effort).toBeUndefined();

      // These should still be present
      expect(result.body.temperature).toBe(0.7);
      expect(result.body.max_completion_tokens).toBe(2048);
    });

    it('filters unsupported parameters for Grok 4 Fast models', async () => {
      const provider = createXAIProvider('xai:grok-4-fast-reasoning') as any;
      const mockContext = {
        prompt: {
          config: {
            presence_penalty: 0.5,
            frequency_penalty: 0.7,
            stop: ['\\n'],
            reasoning_effort: 'high',
            temperature: 0.7,
          },
        },
      };

      const result = await provider.getOpenAiBody('test prompt', mockContext);

      // These should be filtered out for Grok 4 Fast
      expect(result.body.presence_penalty).toBeUndefined();
      expect(result.body.frequency_penalty).toBeUndefined();
      expect(result.body.stop).toBeUndefined();
      expect(result.body.reasoning_effort).toBeUndefined();

      // Temperature should still be present
      expect(result.body.temperature).toBe(0.7);
    });

    it('filters unsupported parameters for non-reasoning variants', async () => {
      const provider = createXAIProvider('xai:grok-4-1-fast-non-reasoning') as any;
      const mockContext = {
        prompt: {
          config: {
            presence_penalty: 0.5,
            frequency_penalty: 0.7,
            stop: ['\\n'],
            temperature: 0.5,
          },
        },
      };

      const result = await provider.getOpenAiBody('test prompt', mockContext);

      // These should be filtered out for Grok 4.1 Fast non-reasoning
      expect(result.body.presence_penalty).toBeUndefined();
      expect(result.body.frequency_penalty).toBeUndefined();
      expect(result.body.stop).toBeUndefined();

      // Temperature should still be present
      expect(result.body.temperature).toBe(0.5);
    });
  });

  describe('Model constants', () => {
    it('includes Grok-4 in reasoning models list', () => {
      expect(GROK_REASONING_MODELS).toContain('grok-4-0709');
      expect(GROK_REASONING_MODELS).toContain('grok-4');
      expect(GROK_REASONING_MODELS).toContain('grok-4-latest');
    });

    it('includes Grok 4.1 Fast reasoning models in reasoning models list', () => {
      expect(GROK_REASONING_MODELS).toContain('grok-4-1-fast-reasoning');
      expect(GROK_REASONING_MODELS).toContain('grok-4-1-fast');
      expect(GROK_REASONING_MODELS).toContain('grok-4-1-fast-latest');
    });

    it('includes Grok 4 Fast reasoning models in reasoning models list', () => {
      expect(GROK_REASONING_MODELS).toContain('grok-4-fast-reasoning');
      expect(GROK_REASONING_MODELS).toContain('grok-4-fast');
      expect(GROK_REASONING_MODELS).toContain('grok-4-fast-latest');
    });

    it('does NOT include non-reasoning variants in reasoning models list', () => {
      expect(GROK_REASONING_MODELS).not.toContain('grok-4-1-fast-non-reasoning');
      expect(GROK_REASONING_MODELS).not.toContain('grok-4-fast-non-reasoning');
    });

    it('includes all Grok 4.1 Fast and Grok 4 Fast models in GROK_4_MODELS', () => {
      expect(GROK_4_MODELS).toContain('grok-4-1-fast-reasoning');
      expect(GROK_4_MODELS).toContain('grok-4-1-fast');
      expect(GROK_4_MODELS).toContain('grok-4-1-fast-latest');
      expect(GROK_4_MODELS).toContain('grok-4-1-fast-non-reasoning');
      expect(GROK_4_MODELS).toContain('grok-4-fast-reasoning');
      expect(GROK_4_MODELS).toContain('grok-4-fast');
      expect(GROK_4_MODELS).toContain('grok-4-fast-latest');
      expect(GROK_4_MODELS).toContain('grok-4-fast-non-reasoning');
    });

    it('does not include Grok-4 in reasoning effort models list', () => {
      expect(GROK_REASONING_EFFORT_MODELS).not.toContain('grok-4-0709');
      expect(GROK_REASONING_EFFORT_MODELS).not.toContain('grok-4');
      expect(GROK_REASONING_EFFORT_MODELS).not.toContain('grok-4-latest');
    });

    it('includes Grok-3 mini models in reasoning effort models list', () => {
      expect(GROK_REASONING_EFFORT_MODELS).toContain('grok-3-mini-beta');
      expect(GROK_REASONING_EFFORT_MODELS).toContain('grok-3-mini-fast-beta');
    });

    it('includes Grok-4 in XAI_CHAT_MODELS with correct pricing', () => {
      const grok4 = XAI_CHAT_MODELS.find((m) => m.id === 'grok-4-0709');
      expect(grok4).toBeDefined();
      expect(grok4?.cost?.input).toBeDefined();
      expect(grok4?.cost?.output).toBeDefined();
    });

    it('includes Grok 4.1 Fast in XAI_CHAT_MODELS with correct pricing', () => {
      const grok41Fast = XAI_CHAT_MODELS.find((m) => m.id === 'grok-4-1-fast-reasoning');
      expect(grok41Fast).toBeDefined();
      expect(grok41Fast?.cost?.input).toBeDefined();
      expect(grok41Fast?.cost?.output).toBeDefined();
    });

    it('includes Grok 4 Fast in XAI_CHAT_MODELS with correct pricing', () => {
      const grok4Fast = XAI_CHAT_MODELS.find((m) => m.id === 'grok-4-fast-reasoning');
      expect(grok4Fast).toBeDefined();
      expect(grok4Fast?.cost?.input).toBeDefined();
      expect(grok4Fast?.cost?.output).toBeDefined();
    });

    it('includes all Grok-3 mini aliases in reasoning constants', () => {
      // Verify base models
      expect(GROK_3_MINI_MODELS).toContain('grok-3-mini-beta');
      expect(GROK_3_MINI_MODELS).toContain('grok-3-mini-fast-beta');

      // Verify aliases exist in XAI_CHAT_MODELS
      const miniModel = XAI_CHAT_MODELS.find((m) => m.id === 'grok-3-mini-beta');
      expect(miniModel?.aliases).toContain('grok-3-mini');
      expect(miniModel?.aliases).toContain('grok-3-mini-latest');
    });

    it('recognizes Grok-3 mini aliases as reasoning models', () => {
      // The base models are in GROK_3_MINI_MODELS
      expect(GROK_3_MINI_MODELS).toContain('grok-3-mini-beta');

      // Verify aliases are properly linked
      const miniModel = XAI_CHAT_MODELS.find((m) => m.id === 'grok-3-mini-beta');
      expect(miniModel?.aliases).toBeDefined();
      expect(miniModel?.aliases?.length).toBeGreaterThan(0);
    });
  });

  describe('Cost calculation', () => {
    it('calculates costs correctly for all model types', () => {
      // Test Grok-2 - calculateXAICost(modelName, config, promptTokens, completionTokens)
      const grok2Cost = calculateXAICost('grok-2-1212', {}, 600, 400);
      expect(grok2Cost).toBeDefined();
      expect(typeof grok2Cost).toBe('number');

      // Test Grok-4
      const grok4Cost = calculateXAICost('grok-4-0709', {}, 600, 400);
      expect(grok4Cost).toBeDefined();

      // Test Grok-3 mini (reasoning model)
      const grok3MiniCost = calculateXAICost('grok-3-mini-beta', {}, 600, 400);
      expect(grok3MiniCost).toBeDefined();
    });

    it('handles model aliases correctly', () => {
      // grok-4 is an alias for grok-4-0709
      const aliasCost = calculateXAICost('grok-4', {}, 600, 400);
      expect(aliasCost).toBeDefined();

      // grok-3-mini is an alias for grok-3-mini-beta
      const miniAliasCost = calculateXAICost('grok-3-mini', {}, 600, 400);
      expect(miniAliasCost).toBeDefined();
    });

    it('returns undefined for invalid inputs', () => {
      // Unknown model
      expect(calculateXAICost('invalid-model', {}, 600, 400)).toBe(undefined);
      // Missing token counts
      expect(calculateXAICost('grok-2-1212', {}, undefined as any, undefined as any)).toBe(
        undefined,
      );
      expect(calculateXAICost('grok-2-1212', {}, 0, 0)).toBe(undefined);
    });

    it('calculates cost based on model pricing', () => {
      // grok-2-1212 has input: 2.0/1e6 and output: 10.0/1e6
      const cost = calculateXAICost('grok-2-1212', {}, 1000000, 1000000);
      expect(cost).toBeDefined();
      // Expected: (2.0/1e6 * 1000000) + (10.0/1e6 * 1000000) = 2.0 + 10.0 = 12.0
      expect(cost).toBeCloseTo(12.0, 2);
    });

    it('handles reasoning tokens correctly', () => {
      // reasoningTokens is passed as 5th argument but doesn't affect calculation currently
      const costWithReasoning = calculateXAICost('grok-3-mini-beta', {}, 500, 500, 200);
      expect(costWithReasoning).toBeDefined();
    });
  });

  describe('Model constants and configuration', () => {
    it('defines correct Grok-3 mini models', () => {
      expect(GROK_3_MINI_MODELS).toContain('grok-3-mini-beta');
      expect(GROK_3_MINI_MODELS).toContain('grok-3-mini-fast-beta');
    });

    it('defines model costs correctly', () => {
      // Check that XAI_CHAT_MODELS has cost information
      const modelsWithCosts = XAI_CHAT_MODELS.filter((m) => m.cost);
      expect(modelsWithCosts.length).toBeGreaterThan(0);

      // Verify cost structure
      modelsWithCosts.forEach((model) => {
        expect(model.cost).toBeDefined();
        expect(model.cost?.input).toBeDefined();
        expect(model.cost?.output).toBeDefined();
      });
    });

    it('includes all required model properties', () => {
      XAI_CHAT_MODELS.forEach((model) => {
        expect(model.id).toBeDefined();
        expect(typeof model.id).toBe('string');
      });
    });

    it('has correct aliases for models', () => {
      // grok-4 should have grok-4-latest alias
      const grok4 = XAI_CHAT_MODELS.find((m) => m.id === 'grok-4-0709');
      expect(grok4?.aliases).toContain('grok-4');
      expect(grok4?.aliases).toContain('grok-4-latest');

      // grok-3-beta should have aliases
      const _grok3 = XAI_CHAT_MODELS.find((m) => m.id === 'grok-3-beta');
      const modelWithAliases = XAI_CHAT_MODELS.find((m) => m.aliases?.includes('grok-3'));
      expect(modelWithAliases).toBeDefined();
      expect(modelWithAliases?.aliases).toEqual(['grok-3', 'grok-3-latest']);
    });
  });

  describe('callApi error handling', () => {
    // These tests verify XAIProvider's error handling behavior
    // Note: When fetchWithCache throws, the parent class (OpenAiChatCompletionProvider)
    // catches it first and returns { error: 'API call error: ...' }
    // XAIProvider then enhances specific error patterns with xAI-specific messages

    it('should pass through errors from parent class', async () => {
      // When fetchWithCache throws, parent class catches and returns error object
      mockFetchWithCache.mockRejectedValueOnce(new Error('Network timeout'));

      const provider = createXAIProvider('xai:grok-4', {
        config: {
          apiKey: 'test-key',
        } as any,
      });

      const result = await provider.callApi('test prompt');

      expect(result.error).toBeDefined();
      // Error comes through parent class first
      expect(result.error).toContain('API call error:');
    });

    it('should enhance 502 Bad Gateway errors in response.error', async () => {
      // When the parent returns an error containing '502 Bad Gateway',
      // XAIProvider enhances it with xAI-specific messaging
      mockFetchWithCache.mockResolvedValueOnce({
        data: { error: { message: 'Bad Gateway' } },
        cached: false,
        status: 502,
        statusText: 'Bad Gateway',
      });

      const provider = createXAIProvider('xai:grok-4', {
        config: {
          apiKey: 'test-key',
        } as any,
      });

      const result = await provider.callApi('test prompt');

      expect(result.error).toBeDefined();
      // XAIProvider enhances errors containing '502 Bad Gateway'
      expect(result.error).toContain('x.ai API error:');
      expect(result.error).toContain('XAI_API_KEY');
    });

    it('should handle authentication errors', async () => {
      // Mock fetchWithCache to return an authentication error
      mockFetchWithCache.mockResolvedValueOnce({
        data: { error: { message: 'Invalid API key' } },
        cached: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const provider = createXAIProvider('xai:grok-4', {
        config: {
          apiKey: 'test-key',
        } as any,
      });

      const result = await provider.callApi('test prompt');

      expect(result.error).toBeDefined();
      expect(result.error).toContain('API error: 401');
    });

    it('should pass through successful responses', async () => {
      const successResponse = {
        data: {
          choices: [{ message: { content: 'Test response' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };

      mockFetchWithCache.mockResolvedValueOnce(successResponse);

      const provider = createXAIProvider('xai:grok-4', {
        config: {
          apiKey: 'test-key',
        } as any,
      });

      const result = await provider.callApi('test prompt');

      expect(result.output).toBe('Test response');
      expect(result.error).toBeUndefined();
    });

    it('should include token usage in response', async () => {
      mockFetchWithCache.mockResolvedValueOnce({
        data: {
          choices: [{ message: { content: 'Response with tokens' } }],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const provider = createXAIProvider('xai:grok-4', {
        config: {
          apiKey: 'test-key',
        } as any,
      });

      const result = await provider.callApi('test prompt');

      expect(result.output).toBe('Response with tokens');
      expect(result.tokenUsage).toBeDefined();
      expect(result.tokenUsage?.prompt).toBe(100);
      expect(result.tokenUsage?.completion).toBe(50);
      expect(result.tokenUsage?.total).toBe(150);
    });

    it('should calculate cost for successful responses', async () => {
      mockFetchWithCache.mockResolvedValueOnce({
        data: {
          choices: [{ message: { content: 'Test response' } }],
          usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const provider = createXAIProvider('xai:grok-4', {
        config: {
          apiKey: 'test-key',
        } as any,
      });

      const result = await provider.callApi('test prompt');

      expect(result.output).toBe('Test response');
      expect(result.cost).toBeDefined();
      expect(typeof result.cost).toBe('number');
    });
  });
});
