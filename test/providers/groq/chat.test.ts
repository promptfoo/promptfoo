import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearCache } from '../../../src/cache';
import { GroqProvider } from '../../../src/providers/groq/index';

import type { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';

const GROQ_API_BASE = 'https://api.groq.com/openai/v1';

describe('GroqProvider', () => {
  beforeEach(() => {
    process.env.GROQ_API_KEY = 'test-key';
  });

  afterEach(async () => {
    delete process.env.GROQ_API_KEY;
    await clearCache();
  });

  describe('constructor and identification', () => {
    it('should initialize with correct model name', () => {
      const provider = new GroqProvider('mixtral-8x7b-32768', {});
      expect(provider.modelName).toBe('mixtral-8x7b-32768');
    });

    it('should return correct id', () => {
      const provider = new GroqProvider('mixtral-8x7b-32768', {});
      expect(provider.id()).toBe('groq:mixtral-8x7b-32768');
    });

    it('should return correct string representation', () => {
      const provider = new GroqProvider('mixtral-8x7b-32768', {});
      expect(provider.toString()).toBe('[Groq Provider mixtral-8x7b-32768]');
    });

    it('should configure correct API base URL and key envar', () => {
      const provider = new GroqProvider('mixtral-8x7b-32768', {});
      expect((provider as OpenAiChatCompletionProvider).config).toMatchObject({
        apiKeyEnvar: 'GROQ_API_KEY',
        apiBaseUrl: GROQ_API_BASE,
      });
    });
  });

  describe('reasoning model detection', () => {
    it('should identify regular models as non-reasoning', () => {
      const provider = new GroqProvider('mixtral-8x7b-32768', {});
      expect(provider['isReasoningModel']()).toBe(false);
    });

    it('should identify deepseek-r1 as reasoning model', () => {
      const provider = new GroqProvider('deepseek-r1-distill-llama-70b', {});
      expect(provider['isReasoningModel']()).toBe(true);
    });

    it('should identify gpt-oss as reasoning model', () => {
      const provider = new GroqProvider('openai/gpt-oss-120b', {});
      expect(provider['isReasoningModel']()).toBe(true);
    });

    it('should identify qwen as reasoning model', () => {
      const provider = new GroqProvider('qwen/qwen3-32b', {});
      expect(provider['isReasoningModel']()).toBe(true);
    });

    it('should identify o1 models as reasoning (via parent)', () => {
      const provider = new GroqProvider('o1-mini', {});
      expect(provider['isReasoningModel']()).toBe(true);
    });
  });

  describe('temperature support', () => {
    it('should support temperature for regular models', () => {
      const provider = new GroqProvider('mixtral-8x7b-32768', {});
      expect(provider['supportsTemperature']()).toBe(true);
    });

    it('should support temperature for deepseek-r1 models', () => {
      const provider = new GroqProvider('deepseek-r1-distill-llama-70b', {});
      expect(provider['supportsTemperature']()).toBe(true);
    });

    it('should support temperature for gpt-oss models', () => {
      const provider = new GroqProvider('openai/gpt-oss-120b', {});
      expect(provider['supportsTemperature']()).toBe(true);
    });

    it('should support temperature for qwen models', () => {
      const provider = new GroqProvider('qwen/qwen3-32b', {});
      expect(provider['supportsTemperature']()).toBe(true);
    });

    it('should not support temperature for o1 models (via parent)', () => {
      const provider = new GroqProvider('o1-mini', {});
      expect(provider['supportsTemperature']()).toBe(false);
    });
  });

  describe('serialization', () => {
    it('should serialize to JSON correctly without API key', () => {
      const provider = new GroqProvider('mixtral-8x7b-32768', {
        config: {
          temperature: 0.7,
          max_tokens: 100,
        },
      });

      expect(provider.toJSON()).toEqual({
        provider: 'groq',
        model: 'mixtral-8x7b-32768',
        config: {
          temperature: 0.7,
          max_tokens: 100,
          apiKeyEnvar: 'GROQ_API_KEY',
          apiBaseUrl: GROQ_API_BASE,
        },
      });
    });

    it('should redact API key in serialization', () => {
      const provider = new GroqProvider('mixtral-8x7b-32768', {
        config: {
          apiKey: 'secret-api-key',
          temperature: 0.7,
        },
      });

      const json = provider.toJSON();
      expect(json.config.apiKey).toBeUndefined();
      // But the actual provider should still have the key
      expect(provider['apiKey']).toBe('secret-api-key');
    });
  });

  describe('getOpenAiBody', () => {
    it('should include reasoning_format when configured', async () => {
      const provider = new GroqProvider('openai/gpt-oss-120b', {
        config: {
          reasoning_format: 'parsed',
        },
      });

      const { body } = await provider['getOpenAiBody']('Test prompt');
      expect(body.reasoning_format).toBe('parsed');
    });

    it('should include include_reasoning when configured', async () => {
      const provider = new GroqProvider('openai/gpt-oss-120b', {
        config: {
          include_reasoning: true,
        },
      });

      const { body } = await provider['getOpenAiBody']('Test prompt');
      expect(body.include_reasoning).toBe(true);
    });

    it('should include compound_custom when configured', async () => {
      const provider = new GroqProvider('groq/compound', {
        config: {
          compound_custom: {
            tools: {
              enabled_tools: ['code_interpreter', 'web_search'],
              wolfram_settings: {
                authorization: 'test-key',
              },
            },
          },
        },
      });

      const { body } = await provider['getOpenAiBody']('Test prompt');
      expect(body.compound_custom).toEqual({
        tools: {
          enabled_tools: ['code_interpreter', 'web_search'],
          wolfram_settings: {
            authorization: 'test-key',
          },
        },
      });
    });

    it('should include search_settings when configured', async () => {
      const provider = new GroqProvider('groq/compound', {
        config: {
          search_settings: {
            exclude_domains: ['example.com'],
            include_domains: ['trusted.com'],
            country: 'US',
          },
        },
      });

      const { body } = await provider['getOpenAiBody']('Test prompt');
      expect(body.search_settings).toEqual({
        exclude_domains: ['example.com'],
        include_domains: ['trusted.com'],
        country: 'US',
      });
    });

    it('should handle all Groq-specific parameters together', async () => {
      const provider = new GroqProvider('openai/gpt-oss-120b', {
        config: {
          reasoning_format: 'hidden',
          include_reasoning: false,
          compound_custom: {
            tools: {
              enabled_tools: ['browser_automation'],
            },
          },
          search_settings: {
            exclude_domains: ['spam.com'],
          },
        },
      });

      const { body } = await provider['getOpenAiBody']('Test prompt');
      expect(body.reasoning_format).toBe('hidden');
      expect(body.include_reasoning).toBe(false);
      expect(body.compound_custom).toBeDefined();
      expect(body.search_settings).toBeDefined();
    });

    it('should build correct message structure', async () => {
      const provider = new GroqProvider('mixtral-8x7b-32768', {});
      const { body } = await provider['getOpenAiBody']('Test prompt');

      expect(body.model).toBe('mixtral-8x7b-32768');
      expect(body.messages).toEqual([{ role: 'user', content: 'Test prompt' }]);
    });
  });
});
