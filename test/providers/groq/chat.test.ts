import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearCache } from '../../../src/cache';
import { GroqProvider } from '../../../src/providers/groq/index';
import { mockProcessEnv } from '../../util/utils';

import type { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';
import type { CallApiContextParams } from '../../../src/types/index';

const GROQ_API_BASE = 'https://api.groq.com/openai/v1';

describe('GroqProvider', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = mockProcessEnv({ GROQ_API_KEY: 'test-key' });
  });

  afterEach(async () => {
    restoreEnv();
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

    it('identifies the actual provider instead of its OpenAI-compatible transport', () => {
      const provider = new GroqProvider('mixtral-8x7b-32768', {});
      expect(provider['getGenAISystem']()).toBe('groq');
    });

    it('keeps Groq telemetry independent of a customer-defined provider ID', () => {
      const provider = new GroqProvider('mixtral-8x7b-32768', {
        id: 'customer:custom-label',
      });

      expect(provider.id()).toBe('customer:custom-label');
      expect(provider['getGenAISystem']()).toBe('groq');
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

    it('should not identify retired deepseek-r1 as reasoning model', () => {
      const provider = new GroqProvider('deepseek-r1-distill-llama-70b', {});
      expect(provider['isReasoningModel']()).toBe(false);
    });

    it('should identify gpt-oss as reasoning model', () => {
      const provider = new GroqProvider('openai/gpt-oss-120b', {});
      expect(provider['isReasoningModel']()).toBe(true);
    });

    it('should identify qwen as reasoning model', () => {
      const provider = new GroqProvider('qwen/qwen3.6-27b', {});
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

    it('should support temperature for gpt-oss models', () => {
      const provider = new GroqProvider('openai/gpt-oss-120b', {});
      expect(provider['supportsTemperature']()).toBe(true);
    });

    it('should support temperature for qwen models', () => {
      const provider = new GroqProvider('qwen/qwen3.6-27b', {});
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
    describe.each([
      { model: 'qwen/qwen3.6-27b', reasoningEffort: 'none', reasoning: true },
      { model: 'openai/gpt-oss-120b', reasoningEffort: 'high', reasoning: true },
      { model: 'llama-3.3-70b-versatile', reasoningEffort: 'high', reasoning: false },
    ] as const)('effective model $model', ({ model, reasoningEffort, reasoning }) => {
      it.each(['direct', 'provider passthrough', 'prompt passthrough', 'unchanged passthrough'])(
        'preserves the model request contract with %s selection',
        async (selection) => {
          const configuredModel =
            selection === 'direct' || selection === 'unchanged passthrough'
              ? model
              : model === 'openai/gpt-oss-120b'
                ? 'qwen/qwen3.6-27b'
                : 'openai/gpt-oss-120b';
          const provider = new GroqProvider(configuredModel, {
            config: {
              reasoning_effort: reasoningEffort,
              max_completion_tokens: 4096,
              max_tokens: 2048,
              temperature: 0.6,
              ...(selection === 'direct'
                ? {}
                : {
                    passthrough: {
                      model: selection === 'prompt passthrough' ? configuredModel : model,
                    },
                  }),
            },
          });
          const context: CallApiContextParams | undefined =
            selection === 'prompt passthrough'
              ? {
                  vars: {},
                  prompt: {
                    raw: 'Test prompt',
                    label: 'Test prompt',
                    config: { passthrough: { model } },
                  },
                }
              : undefined;

          const { body } = await provider.getOpenAiBody('Test prompt', context);

          expect(body.model).toBe(model);
          expect(body.messages).toEqual([{ role: 'user', content: 'Test prompt' }]);
          expect(body.temperature).toBe(0.6);
          expect(provider.modelName).toBe(configuredModel);
          expect(provider.getApiUrl()).toBe(GROQ_API_BASE);
          if (reasoning) {
            expect(body.reasoning_effort).toBe(reasoningEffort);
            expect(body.max_completion_tokens).toBe(4096);
            expect(body).not.toHaveProperty('max_tokens');
          } else {
            expect(body.max_tokens).toBe(2048);
            expect(body).not.toHaveProperty('max_completion_tokens');
            expect(body).not.toHaveProperty('reasoning_effort');
          }
        },
      );
    });

    it('accepts Groq Chat service tiers and rejects non-Chat tiers', async () => {
      for (const service_tier of ['auto', 'on_demand', 'flex', 'performance'] as const) {
        const provider = new GroqProvider('openai/gpt-oss-120b', {
          config: { service_tier },
        });

        expect((await provider.getOpenAiBody('Test prompt')).body.service_tier).toBe(service_tier);
      }

      const provider = new GroqProvider('openai/gpt-oss-120b', {
        config: { service_tier: 'priority' as any },
      });
      await expect(provider.getOpenAiBody('Test prompt')).rejects.toThrow(
        'Invalid Groq Chat Completions service_tier "priority"',
      );
    });

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
