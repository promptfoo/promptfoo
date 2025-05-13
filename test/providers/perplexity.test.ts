import { calculatePerplexityCost, createPerplexityProvider } from '../../src/providers/perplexity';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';

jest.mock('../../src/providers/openai/chat');

describe('Perplexity Provider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('createPerplexityProvider', () => {
    it('should create a provider with default settings', () => {
      const provider = createPerplexityProvider('perplexity:sonar');

      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('sonar', {
        config: {
          apiBaseUrl: 'https://api.perplexity.ai',
          apiKeyEnvar: 'PERPLEXITY_API_KEY',
          costCalculator: expect.any(Function),
          passthrough: {},
        },
      });
    });

    it('should use sonar as the default model if none is specified', () => {
      const provider = createPerplexityProvider('perplexity:');

      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('sonar', {
        config: {
          apiBaseUrl: 'https://api.perplexity.ai',
          apiKeyEnvar: 'PERPLEXITY_API_KEY',
          costCalculator: expect.any(Function),
          passthrough: {},
        },
      });
    });

    it('should handle specific Perplexity models', () => {
      const models = [
        'sonar-pro',
        'sonar-reasoning',
        'sonar-reasoning-pro',
        'sonar-deep-research',
        'r1-1776',
      ];

      for (const model of models) {
        const provider = createPerplexityProvider(`perplexity:${model}`);

        expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
        expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith(model, {
          config: {
            apiBaseUrl: 'https://api.perplexity.ai',
            apiKeyEnvar: 'PERPLEXITY_API_KEY',
            costCalculator: expect.any(Function),
            passthrough: {},
          },
        });
      }
    });

    it('should pass through additional config options', () => {
      const provider = createPerplexityProvider('perplexity:sonar', {
        config: {
          config: {
            temperature: 0.7,
            max_tokens: 1000,
            search_domain_filter: ['example.com'],
            search_recency_filter: 'week',
            return_related_questions: true,
          },
        },
      });

      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('sonar', {
        config: {
          apiBaseUrl: 'https://api.perplexity.ai',
          apiKeyEnvar: 'PERPLEXITY_API_KEY',
          costCalculator: expect.any(Function),
          passthrough: {
            temperature: 0.7,
            max_tokens: 1000,
            search_domain_filter: ['example.com'],
            search_recency_filter: 'week',
            return_related_questions: true,
          },
        },
      });
    });

    it('should handle response_format option', () => {
      const responseFormat = {
        type: 'json_schema',
        json_schema: {
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              age: { type: 'number' },
            },
          },
        },
      };

      const provider = createPerplexityProvider('perplexity:sonar', {
        config: {
          config: {
            response_format: responseFormat,
          },
        },
      });

      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('sonar', {
        config: {
          apiBaseUrl: 'https://api.perplexity.ai',
          apiKeyEnvar: 'PERPLEXITY_API_KEY',
          costCalculator: expect.any(Function),
          passthrough: {
            response_format: responseFormat,
          },
        },
      });
    });

    it('should handle web search options', () => {
      const webSearchOptions = {
        search_context_size: 'high',
        user_location: {
          latitude: 37.7749,
          longitude: -122.4194,
          country: 'US',
        },
      };

      const provider = createPerplexityProvider('perplexity:sonar-pro', {
        config: {
          config: {
            web_search_options: webSearchOptions,
          },
        },
      });

      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('sonar-pro', {
        config: {
          apiBaseUrl: 'https://api.perplexity.ai',
          apiKeyEnvar: 'PERPLEXITY_API_KEY',
          costCalculator: expect.any(Function),
          passthrough: {
            web_search_options: webSearchOptions,
          },
        },
      });
    });

    it('should handle date filter options', () => {
      const provider = createPerplexityProvider('perplexity:sonar', {
        config: {
          config: {
            search_after_date_filter: '01/01/2024',
            search_before_date_filter: '05/31/2024',
          },
        },
      });

      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('sonar', {
        config: {
          apiBaseUrl: 'https://api.perplexity.ai',
          apiKeyEnvar: 'PERPLEXITY_API_KEY',
          costCalculator: expect.any(Function),
          passthrough: {
            search_after_date_filter: '01/01/2024',
            search_before_date_filter: '05/31/2024',
          },
        },
      });
    });

    it('should set usage tier for cost calculation', () => {
      const tiers = ['high', 'medium', 'low'] as const;

      for (const tier of tiers) {
        const provider = createPerplexityProvider('perplexity:sonar', {
          config: {
            config: {
              usage_tier: tier,
            },
          },
        });

        expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
        expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('sonar', expect.anything());
        
        // Get the cost calculator function
        const call = (OpenAiChatCompletionProvider as jest.Mock).mock.calls.pop();
        const config = call[1].config;
        
        // Call the cost calculator and verify it works
        const cost = config.costCalculator(100, 100);
        expect(typeof cost).toBe('number');
      }
    });
  });

  describe('calculatePerplexityCost', () => {
    it('should return 0 if no tokens are provided', () => {
      expect(calculatePerplexityCost('sonar')).toBe(0);
      expect(calculatePerplexityCost('sonar', 0, 0)).toBe(0);
      expect(calculatePerplexityCost('sonar', undefined, undefined)).toBe(0);
    });

    it('should calculate costs for sonar model', () => {
      // sonar: $1 per million input tokens, $1 per million output tokens
      expect(calculatePerplexityCost('sonar', 1000000, 1000000)).toBe(2);
      expect(calculatePerplexityCost('sonar', 500000, 500000)).toBe(1);
      expect(calculatePerplexityCost('sonar', 2000000, 0)).toBe(2);
      expect(calculatePerplexityCost('sonar', 0, 3000000)).toBe(3);
    });

    it('should calculate costs for sonar-pro model', () => {
      // sonar-pro: $3 per million input tokens, $15 per million output tokens
      expect(calculatePerplexityCost('sonar-pro', 1000000, 1000000)).toBe(18);
      expect(calculatePerplexityCost('sonar-pro', 500000, 500000)).toBe(9);
      expect(calculatePerplexityCost('sonar-pro', 2000000, 0)).toBe(6);
      expect(calculatePerplexityCost('sonar-pro', 0, 2000000)).toBe(30);
    });

    it('should calculate costs for sonar-reasoning model', () => {
      // sonar-reasoning: $1 per million input tokens, $5 per million output tokens
      expect(calculatePerplexityCost('sonar-reasoning', 1000000, 1000000)).toBe(6);
      expect(calculatePerplexityCost('sonar-reasoning', 500000, 500000)).toBe(3);
      expect(calculatePerplexityCost('sonar-reasoning', 2000000, 0)).toBe(2);
      expect(calculatePerplexityCost('sonar-reasoning', 0, 2000000)).toBe(10);
    });

    it('should calculate costs for sonar-reasoning-pro model', () => {
      // sonar-reasoning-pro: $2 per million input tokens, $8 per million output tokens
      expect(calculatePerplexityCost('sonar-reasoning-pro', 1000000, 1000000)).toBe(10);
      expect(calculatePerplexityCost('sonar-reasoning-pro', 500000, 500000)).toBe(5);
      expect(calculatePerplexityCost('sonar-reasoning-pro', 2000000, 0)).toBe(4);
      expect(calculatePerplexityCost('sonar-reasoning-pro', 0, 2000000)).toBe(16);
    });

    it('should calculate costs for sonar-deep-research model', () => {
      // sonar-deep-research: $2 per million input tokens, $8 per million output tokens
      expect(calculatePerplexityCost('sonar-deep-research', 1000000, 1000000)).toBe(10);
      expect(calculatePerplexityCost('sonar-deep-research', 500000, 500000)).toBe(5);
      expect(calculatePerplexityCost('sonar-deep-research', 2000000, 0)).toBe(4);
      expect(calculatePerplexityCost('sonar-deep-research', 0, 2000000)).toBe(16);
    });

    it('should calculate costs for r1-1776 model', () => {
      // r1-1776: $2 per million input tokens, $8 per million output tokens
      expect(calculatePerplexityCost('r1-1776', 1000000, 1000000)).toBe(10);
      expect(calculatePerplexityCost('r1-1776', 500000, 500000)).toBe(5);
      expect(calculatePerplexityCost('r1-1776', 2000000, 0)).toBe(4);
      expect(calculatePerplexityCost('r1-1776', 0, 2000000)).toBe(16);
    });

    it('should handle unknown models by defaulting to sonar pricing', () => {
      expect(calculatePerplexityCost('unknown-model', 1000000, 1000000)).toBe(2);
      expect(calculatePerplexityCost('custom-model', 500000, 500000)).toBe(1);
    });

    it('should handle case insensitivity in model names', () => {
      expect(calculatePerplexityCost('SONAR-PRO', 1000000, 1000000)).toBe(18);
      expect(calculatePerplexityCost('Sonar-Reasoning', 1000000, 1000000)).toBe(6);
      expect(calculatePerplexityCost('sonar-DEEP-research', 1000000, 1000000)).toBe(10);
    });

    it('should handle different usage tiers', () => {
      // Test one model with different tiers (the tier doesn't affect the token price calculation)
      const model = 'sonar-pro';
      const inputTokens = 1000000;
      const outputTokens = 1000000;
      
      // All tiers should calculate the same token costs
      expect(calculatePerplexityCost(model, inputTokens, outputTokens, 'high')).toBe(18);
      expect(calculatePerplexityCost(model, inputTokens, outputTokens, 'medium')).toBe(18);
      expect(calculatePerplexityCost(model, inputTokens, outputTokens, 'low')).toBe(18);
    });
  });
}); 