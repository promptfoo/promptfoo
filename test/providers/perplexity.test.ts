import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleCost } from '../../src/assertions/cost';
import * as cache from '../../src/cache';
import { clearCache, disableCache, enableCache } from '../../src/cache';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import {
  calculatePerplexityCost,
  createPerplexityProvider,
  PerplexityProvider,
} from '../../src/providers/perplexity';

import type { AssertionParams } from '../../src/types';

describe('Perplexity Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('createPerplexityProvider', () => {
    it('should create a provider with default settings', () => {
      const provider = createPerplexityProvider('perplexity:sonar');

      expect(provider).toBeInstanceOf(PerplexityProvider);
    });

    it('should use sonar as the default model if none is specified', () => {
      const provider = createPerplexityProvider('perplexity:');

      expect(provider).toBeInstanceOf(PerplexityProvider);
      // @ts-ignore - accessing private property for testing
      expect(provider.modelName).toBe('sonar');
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

        expect(provider).toBeInstanceOf(PerplexityProvider);
        // @ts-ignore - accessing private property for testing
        expect(provider.modelName).toBe(model);
      }
    });

    it('should pass through configuration options', () => {
      const config = {
        temperature: 0.7,
        max_tokens: 1000,
        search_domain_filter: ['example.com'],
        search_recency_filter: 'week',
        return_related_questions: true,
      };

      const provider = createPerplexityProvider('perplexity:sonar', {
        config: { config },
      });

      expect(provider).toBeInstanceOf(PerplexityProvider);
      // Verify config was passed through to constructor
      // @ts-ignore - accessing private property for testing
      expect(provider.config).toMatchObject(expect.objectContaining(config));
    });
  });

  describe('PerplexityProvider', () => {
    it('should initialize with the correct API base URL and key environment variable', () => {
      const provider = new PerplexityProvider('sonar');

      // @ts-ignore - accessing private properties for testing
      expect(provider.config.apiBaseUrl).toBe('https://api.perplexity.ai');
      // @ts-ignore - accessing private properties for testing
      expect(provider.config.apiKeyEnvar).toBe('PERPLEXITY_API_KEY');
    });

    it('should forward Perplexity-specific search options', async () => {
      const provider = new PerplexityProvider('sonar-pro', {
        config: {
          search_domain_filter: ['example.com'],
          search_recency_filter: 'week',
          return_related_questions: true,
          return_images: true,
          search_after_date_filter: '01/01/2026',
          search_before_date_filter: '02/01/2026',
          web_search_options: {
            search_context_size: 'high',
            user_location: {
              latitude: 37.7749,
              longitude: -122.4194,
              country: 'US',
            },
          },
        },
      });

      const { body } = await provider.getOpenAiBody('Test prompt', {
        prompt: {
          raw: 'Test prompt',
          label: 'Test prompt',
          config: {
            search_domain_filter: ['prompt.example'],
            web_search_options: {
              search_context_size: 'low',
            },
          },
        },
        vars: {},
      });

      expect(body).toMatchObject({
        search_domain_filter: ['prompt.example'],
        search_recency_filter: 'week',
        return_related_questions: true,
        return_images: true,
        search_after_date_filter: '01/01/2026',
        search_before_date_filter: '02/01/2026',
        web_search_options: {
          search_context_size: 'low',
        },
      });

      const { body: passthroughBody } = await provider.getOpenAiBody('Test prompt', {
        prompt: {
          raw: 'Test prompt',
          label: 'Test prompt',
          config: {
            search_domain_filter: ['prompt.example'],
            passthrough: {
              search_domain_filter: ['passthrough.example'],
              web_search_options: {
                search_context_size: 'medium',
              },
            },
          },
        },
        vars: {},
      });

      expect(passthroughBody).toMatchObject({
        search_domain_filter: ['passthrough.example'],
        web_search_options: {
          search_context_size: 'medium',
        },
      });
    });

    it('prefers direct prompt search options over inherited provider passthrough', async () => {
      const provider = new PerplexityProvider('sonar-pro', {
        config: {
          passthrough: {
            search_domain_filter: ['provider.example'],
            return_images: true,
            web_search_options: {
              search_context_size: 'high',
            },
          },
        },
      });

      const { body } = await provider.getOpenAiBody('Test prompt', {
        prompt: {
          raw: 'Test prompt',
          label: 'Test prompt',
          config: {
            search_domain_filter: ['prompt.example'],
            return_images: false,
            web_search_options: {
              search_context_size: 'low',
            },
          },
        },
        vars: {},
      });

      expect(body).toMatchObject({
        search_domain_filter: ['prompt.example'],
        return_images: false,
        web_search_options: {
          search_context_size: 'low',
        },
      });
    });

    it('does not restore provider passthrough fields replaced by prompt passthrough', async () => {
      const provider = new PerplexityProvider('sonar-pro', {
        config: {
          passthrough: {
            search_domain_filter: ['private.example'],
            web_search_options: {
              search_context_size: 'high',
            },
          },
        },
      });

      const { body } = await provider.getOpenAiBody('Test prompt', {
        prompt: {
          raw: 'Test prompt',
          label: 'Test prompt',
          config: {
            passthrough: {
              model: 'sonar-pro',
            },
          },
        },
        vars: {},
      });

      expect(body.model).toBe('sonar-pro');
      expect(body).not.toHaveProperty('search_domain_filter');
      expect(body).not.toHaveProperty('web_search_options');
    });

    it('preserves null search options from prompt passthrough over inherited values', async () => {
      const provider = new PerplexityProvider('sonar-pro', {
        config: {
          search_domain_filter: ['provider.example'],
          web_search_options: {
            search_context_size: 'high',
          },
        },
      });

      const { body } = await provider.getOpenAiBody('Test prompt', {
        prompt: {
          raw: 'Test prompt',
          label: 'Test prompt',
          config: {
            passthrough: {
              search_domain_filter: null,
              web_search_options: null,
            },
          },
        },
        vars: {},
      });

      expect(body).toHaveProperty('search_domain_filter', null);
      expect(body).toHaveProperty('web_search_options', null);
    });

    it('preserves null search options from provider passthrough over direct provider values', async () => {
      const provider = new PerplexityProvider('sonar-pro', {
        config: {
          search_domain_filter: ['provider.example'],
          search_recency_filter: 'week',
          web_search_options: { search_context_size: 'high' },
          passthrough: {
            search_domain_filter: null,
            search_recency_filter: null,
            web_search_options: null,
          },
        },
      });

      const { body } = await provider.getOpenAiBody('Test prompt');

      expect(body).toHaveProperty('search_domain_filter', null);
      expect(body).toHaveProperty('search_recency_filter', null);
      expect(body).toHaveProperty('web_search_options', null);
    });

    it('preserves direct prompt null search options over inherited provider passthrough', async () => {
      const provider = new PerplexityProvider('sonar-pro', {
        config: {
          passthrough: {
            search_domain_filter: ['provider.example'],
            web_search_options: { search_context_size: 'high' },
          },
        },
      });

      const { body } = await provider.getOpenAiBody('Test prompt', {
        prompt: {
          raw: 'Test prompt',
          label: 'Test prompt',
          config: {
            search_domain_filter: null,
            web_search_options: null,
          },
        },
        vars: {},
      });

      expect(body).toHaveProperty('search_domain_filter', null);
      expect(body).toHaveProperty('web_search_options', null);
    });

    it('should have the correct id() method', () => {
      const provider = new PerplexityProvider('sonar-pro');
      expect(provider.id()).toBe('sonar-pro');
    });

    it('should have the correct toString() method', () => {
      const provider = new PerplexityProvider('sonar');
      expect(provider.toString()).toBe('[Perplexity Provider sonar]');
    });

    it('should have the correct toJSON() method', () => {
      const provider = new PerplexityProvider('sonar-pro', {
        config: {
          temperature: 0.7,
          max_tokens: 1000,
        },
      });

      expect(provider.toJSON()).toEqual({
        provider: 'perplexity',
        model: 'sonar-pro',
        config: expect.objectContaining({
          temperature: 0.7,
          max_tokens: 1000,
          apiKey: undefined,
        }),
      });
    });

    describe('response cost', () => {
      afterEach(() => {
        vi.restoreAllMocks();
      });

      beforeEach(() => {
        vi.spyOn(cache, 'fetchWithCache');
      });
      function mockResponse(usage: unknown, cached = false) {
        vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
          data: {
            choices: [{ message: { content: 'Test output' }, finish_reason: 'stop' }],
            usage,
          },
          cached,
          status: 200,
          statusText: 'OK',
        });
      }

      function provider(model = 'sonar-pro') {
        return new PerplexityProvider(model, { config: { apiKey: 'test-key' } });
      }

      it('uses the reported total including non-token charges', async () => {
        mockResponse({
          prompt_tokens: 10,
          completion_tokens: 10,
          total_tokens: 20,
          cost: {
            input_tokens_cost: 0.00003,
            output_tokens_cost: 0.00015,
            request_cost: 0.01,
            total_cost: 0.01018,
          },
        });

        const result = await provider().callApi('Test prompt');

        expect(result.output).toBe('Test output');
        expect(result.cost).toBe(0.01018);
        expect(result.tokenUsage).toMatchObject({ prompt: 10, completion: 10, total: 20 });
        expect(cache.fetchWithCache).toHaveBeenCalledWith(
          'https://api.perplexity.ai/chat/completions',
          expect.objectContaining({ method: 'POST' }),
          expect.any(Number),
          'json',
          undefined,
          undefined,
        );
      });

      it.each(['sonar', 'sonar-pro', 'sonar-reasoning-pro', 'sonar-deep-research', 'custom-model'])(
        'leaves %s cost unknown without a provider total',
        async (model) => {
          mockResponse({ prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 });
          const result = await provider(model).callApi('Test prompt');
          expect(result.output).toBe('Test output');
          expect(result.cost).toBeUndefined();
        },
      );

      it.each([0, 0.123])('accepts a reported total of %s without token counts', async (cost) => {
        mockResponse({ cost: { total_cost: cost } });
        expect((await provider('custom-model').callApi('Test prompt')).cost).toBe(cost);
      });

      it.each([undefined, null, {}, { total_tokens: 0 }, { cost: null }])(
        'handles missing billing data (%j)',
        async (usage) => {
          mockResponse(usage);
          const result = await provider().callApi('Test prompt');
          expect(result.output).toBe('Test output');
          expect(result.cost).toBeUndefined();
        },
      );

      it.each([-1, NaN, Infinity, -Infinity, '0.01', null, {}, true])(
        'leaves invalid reported total %s unknown',
        async (totalCost) => {
          mockResponse({
            prompt_tokens: 10,
            completion_tokens: 10,
            total_tokens: 20,
            cost: { total_cost: totalCost },
          });
          const result = await provider().callApi('Test prompt');
          expect(result.output).toBe('Test output');
          expect(result.cost).toBeUndefined();
        },
      );

      it('does not inherit OpenAI prices for a colliding model name', async () => {
        mockResponse({ prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 });
        expect((await provider('gpt-4o').callApi('Test prompt')).cost).toBeUndefined();
      });

      it('retains the logical reported total for a promptfoo cache hit', async () => {
        mockResponse(
          {
            prompt_tokens: 10,
            completion_tokens: 10,
            total_tokens: 20,
            cost: { total_cost: 0.01 },
          },
          true,
        );
        const result = await provider().callApi('Test prompt');
        expect(result.cached).toBe(true);
        expect(result.tokenUsage?.cached).toBe(20);
        expect(result.cost).toBe(0.01);
      });

      it('keeps cached cost unknown when the API omitted the total', async () => {
        mockResponse({ prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }, true);
        const result = await provider().callApi('Test prompt');
        expect(result.cached).toBe(true);
        expect(result.cost).toBeUndefined();
      });

      it('uses the reported total for a fresh response with cached input tokens', async () => {
        mockResponse({
          prompt_tokens: 10,
          completion_tokens: 10,
          total_tokens: 20,
          prompt_tokens_details: { cached_tokens: 5 },
          cost: { total_cost: 0.01018 },
        });
        const result = await provider().callApi('Test prompt');
        expect(result.cached).toBe(false);
        expect(result.cost).toBe(0.01018);
      });

      it.each([400, 429, 500])(
        'preserves HTTP %s errors without assigning a cost',
        async (status) => {
          vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
            data: { error: { message: 'API error' }, usage: { cost: { total_cost: 0.01 } } },
            cached: false,
            status,
            statusText: 'Error',
          });
          const result = await provider().callApi('Test prompt');
          expect(result.error).toContain(`API error: ${status}`);
          expect(result.cost).toBeUndefined();
        },
      );
    });

    it('should prefer Perplexity authoritative total cost', () => {
      const provider = new PerplexityProvider('sonar-pro');
      const cost = (provider as any).calculateResponseCost(
        {
          usage: {
            prompt_tokens: 10,
            completion_tokens: 10,
            total_tokens: 20,
            cost: {
              input_tokens_cost: 0.00003,
              output_tokens_cost: 0.00015,
              request_cost: 0.014,
              total_cost: 0.01418,
            },
          },
        },
        {},
        false,
      );

      expect(cost).toBe(0.01418);
    });

    it('retains logical cost and cost assertion outcomes through the parent cache path', async () => {
      // Never let this regression test clear a developer's persistent evaluation cache.
      expect(process.env.PROMPTFOO_CACHE_TYPE).toBe('memory');
      await clearCache();
      enableCache();
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 'response-id',
            model: 'sonar-pro',
            citations: ['https://example.com/cached-source'],
            choices: [
              {
                finish_reason: 'stop',
                index: 0,
                message: { role: 'assistant', content: 'Cached output' },
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 10,
              total_tokens: 20,
              cost: { total_cost: 0.01418 },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

      try {
        const provider = new PerplexityProvider('sonar-pro', {
          config: { apiKey: 'test-key' },
        });
        const first = await provider.callApi('Test prompt');
        const second = await provider.callApi('Test prompt');

        const expectedMetadata = {
          citations: [
            {
              url: 'https://example.com/cached-source',
              content: 'https://example.com/cached-source',
            },
          ],
          perplexity: { citations: ['https://example.com/cached-source'] },
        };
        expect(first).toMatchObject({ cached: false, cost: 0.01418, metadata: expectedMetadata });
        expect(second).toMatchObject({
          cached: true,
          cost: 0.01418,
          tokenUsage: { cached: 20 },
          metadata: expectedMetadata,
        });
        for (const response of [first, second]) {
          expect(
            handleCost({
              assertion: { type: 'cost', threshold: 0.01 },
              cost: response.cost,
              inverse: false,
            } as AssertionParams),
          ).toMatchObject({ pass: false });
        }
        expect(fetchSpy).toHaveBeenCalledTimes(1);
      } finally {
        disableCache();
        await clearCache();
      }
    });

    it('should omit cost for a fresh response without usage metadata', async () => {
      disableCache();
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 'response-without-usage',
            model: 'sonar-pro',
            choices: [
              {
                finish_reason: 'stop',
                index: 0,
                message: { role: 'assistant', content: 'Fresh output' },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

      const provider = new PerplexityProvider('sonar-pro', {
        config: { apiKey: 'test-key' },
      });
      const result = await provider.callApi('Test prompt');

      expect(result).toMatchObject({ output: 'Fresh output', cached: false });
      expect(result.cost).toBeUndefined();
    });

    it('should preserve Perplexity search artifacts in response metadata', async () => {
      disableCache();
      const images = [
        {
          image_url: 'https://example.com/image.jpg',
          origin_url: 'https://example.com/article',
          title: 'Example image',
          width: 640,
          height: 480,
        },
      ];
      const relatedQuestions = ['What happened next?'];
      const citations = ['https://example.com/article'];
      const searchResults = [
        {
          title: 'Example article',
          url: 'https://example.com/article',
          snippet: 'A concise result.',
          source: 'web',
        },
      ];
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 'response-with-search-artifacts',
            model: 'sonar-pro',
            choices: [
              {
                finish_reason: 'stop',
                index: 0,
                message: { role: 'assistant', content: 'Search-backed output' },
              },
            ],
            citations,
            search_results: searchResults,
            images,
            related_questions: relatedQuestions,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

      const provider = new PerplexityProvider('sonar-pro', {
        config: {
          apiKey: 'test-key',
          return_images: true,
          return_related_questions: true,
        },
      });
      const result = await provider.callApi('Test prompt');

      expect(result).toMatchObject({
        output: 'Search-backed output',
        metadata: {
          citations: [{ url: citations[0], content: citations[0] }],
          perplexity: {
            citations,
            search_results: searchResults,
            images,
            related_questions: relatedQuestions,
          },
        },
      });
    });

    it('should pass through error responses', async () => {
      // Mock the parent class callApi method with an error
      vi.spyOn(OpenAiChatCompletionProvider.prototype, 'callApi').mockResolvedValueOnce({
        error: 'API error',
      });

      const provider = new PerplexityProvider('sonar');
      const result = await provider.callApi('Test prompt');

      // Verify error is passed through
      expect(result.error).toBe('API error');
      expect(result.cost).toBeUndefined();
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

    it.each(['unknown-model', 'sonar-pro-future', 'my-sonar'])(
      'does not estimate unknown model %s',
      (model) => {
        expect(calculatePerplexityCost(model, 1000000, 1000000)).toBeUndefined();
        expect(calculatePerplexityCost(model)).toBeUndefined();
      },
    );

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
