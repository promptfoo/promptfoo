import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearCache } from '../../src/cache';
import {
  calculateFireworksCost,
  createFireworksProvider,
  FireworksProvider,
  readFireworksCachedPromptTokens,
} from '../../src/providers/fireworks/chat';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { mockProcessEnv } from '../util/utils';

const FIREWORKS_API_BASE = 'https://api.fireworks.ai/inference/v1';
const FIREWORKS_MODEL = 'accounts/fireworks/models/llama-v3p3-70b-instruct';

vi.mock('../../src/util', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    maybeLoadFromExternalFile: vi.fn((x) => x),
    renderVarsInObject: vi.fn((x) => x),
  };
});

vi.mock('../../src/util/fetch');

describe('Fireworks AI', () => {
  afterEach(async () => {
    await clearCache();
    vi.clearAllMocks();
  });

  describe('FireworksProvider', () => {
    it('initializes with the model name', () => {
      const provider = new FireworksProvider(FIREWORKS_MODEL, {});
      expect(provider.modelName).toBe(FIREWORKS_MODEL);
    });

    it('returns the prefixed id', () => {
      const provider = new FireworksProvider(FIREWORKS_MODEL, {});
      expect(provider.id()).toBe(`fireworks:${FIREWORKS_MODEL}`);
    });

    it('returns a human-readable string', () => {
      const provider = new FireworksProvider(FIREWORKS_MODEL, {});
      expect(provider.toString()).toBe(`[Fireworks AI Provider ${FIREWORKS_MODEL}]`);
    });

    it('falls back to the default apiBaseUrl and apiKeyEnvar', () => {
      const provider = new FireworksProvider(FIREWORKS_MODEL, {});
      expect(provider.config.apiBaseUrl).toBe(FIREWORKS_API_BASE);
      expect(provider.config.apiKeyEnvar).toBe('FIREWORKS_API_KEY');
    });

    it('falls back to the default when apiBaseUrl or apiKeyEnvar is an empty string', () => {
      const provider = new FireworksProvider(FIREWORKS_MODEL, {
        config: {
          apiBaseUrl: '',
          apiKeyEnvar: '',
        },
      });

      expect(provider.config.apiBaseUrl).toBe(FIREWORKS_API_BASE);
      expect(provider.config.apiKeyEnvar).toBe('FIREWORKS_API_KEY');
    });

    it('respects custom apiBaseUrl and apiKeyEnvar overrides', () => {
      const restoreEnv = mockProcessEnv({ CUSTOM_FIREWORKS_KEY: 'test-only-fake-key' });

      try {
        const provider = new FireworksProvider(FIREWORKS_MODEL, {
          config: {
            apiBaseUrl: 'https://proxy.example.com/fireworks/v1',
            apiKeyEnvar: 'CUSTOM_FIREWORKS_KEY',
          },
        });

        expect(provider.config.apiBaseUrl).toBe('https://proxy.example.com/fireworks/v1');
        expect(provider.config.apiKeyEnvar).toBe('CUSTOM_FIREWORKS_KEY');
        expect(provider.getApiKey()).toBe('test-only-fake-key');
      } finally {
        restoreEnv();
      }
    });

    it('reads FIREWORKS_API_BASE_URL from the environment', () => {
      const restoreEnv = mockProcessEnv({
        FIREWORKS_API_BASE_URL: 'https://self-hosted.example.com/v1',
      });
      try {
        const provider = new FireworksProvider(FIREWORKS_MODEL, {});
        expect(provider.config.apiBaseUrl).toBe('https://self-hosted.example.com/v1');
      } finally {
        restoreEnv();
      }
    });

    it('prefers an explicit apiBaseUrl over FIREWORKS_API_BASE_URL', () => {
      const restoreEnv = mockProcessEnv({
        FIREWORKS_API_BASE_URL: 'https://from-env.example.com/v1',
      });
      try {
        const provider = new FireworksProvider(FIREWORKS_MODEL, {
          config: { apiBaseUrl: 'https://explicit.example.com/v1' },
        });
        expect(provider.config.apiBaseUrl).toBe('https://explicit.example.com/v1');
      } finally {
        restoreEnv();
      }
    });

    it('does not fall back to OPENAI_API_KEY when FIREWORKS_API_KEY is missing', () => {
      const restoreEnv = mockProcessEnv({
        FIREWORKS_API_KEY: undefined,
        OPENAI_API_KEY: 'sk-fake-openai-must-not-leak',
      });
      try {
        const provider = new FireworksProvider(FIREWORKS_MODEL, {});
        expect(provider.getApiKey()).toBeUndefined();
      } finally {
        restoreEnv();
      }
    });

    it('does not attach an OpenAI organization header for Fireworks calls', () => {
      const restoreEnv = mockProcessEnv({ OPENAI_ORGANIZATION: 'org-fake-leak' });
      try {
        const provider = new FireworksProvider(FIREWORKS_MODEL, {
          config: { organization: 'org-from-config' },
        });
        expect(provider.getOrganization()).toBeUndefined();
      } finally {
        restoreEnv();
      }
    });

    it('does not route through OPENAI_API_HOST / OPENAI_API_BASE_URL / OPENAI_BASE_URL', () => {
      const restoreEnv = mockProcessEnv({
        OPENAI_API_HOST: 'evil-openai-proxy.example.com',
        OPENAI_API_BASE_URL: 'https://evil-openai-proxy.example.com/v1',
        OPENAI_BASE_URL: 'https://evil-openai-proxy.example.com/v1',
      });
      try {
        const provider = new FireworksProvider(FIREWORKS_MODEL, {});
        expect(provider.getApiUrl()).toBe(FIREWORKS_API_BASE);
      } finally {
        restoreEnv();
      }
    });

    it('honors an explicit config.apiHost so users can route through a proxy', () => {
      // OPENAI_API_HOST is still ignored (credential isolation), but a
      // deliberately configured apiHost must reach the resolved URL.
      const restoreEnv = mockProcessEnv({
        OPENAI_API_HOST: 'evil-openai-proxy.example.com',
      });
      try {
        const provider = new FireworksProvider(FIREWORKS_MODEL, {
          config: { apiHost: 'fireworks-proxy.internal.example.com' },
        });
        expect(provider.getApiUrl()).toBe('https://fireworks-proxy.internal.example.com/v1');
      } finally {
        restoreEnv();
      }
    });

    it('records explicitly configured token-cost estimates', async () => {
      const provider = new FireworksProvider(FIREWORKS_MODEL, {
        config: { inputCost: 0.001, outputCost: 0.002 },
      });
      vi.spyOn(OpenAiChatCompletionProvider.prototype, 'callApi').mockResolvedValue({
        output: 'ok',
        tokenUsage: { prompt: 10, completion: 5, total: 15 },
        cached: false,
      });

      const result = await provider.callApi('hello');

      expect(result.cost).toBe(0.02);
    });
  });

  describe('calculateFireworksCost', () => {
    it('requires explicit input and output rates because Fireworks pricing varies by model', () => {
      expect(calculateFireworksCost({ inputCost: 0.001 }, 10, 5)).toBeUndefined();
      expect(calculateFireworksCost({ inputCost: 0.001, outputCost: 0.002 }, 10, 5)).toBe(0.02);
      expect(calculateFireworksCost({ cost: 0.003 }, 10, 5, true)).toBe(0);
    });

    it('returns zero for a Promptfoo cache hit even when token counts are missing', () => {
      // `getTokenUsage()` only emits `{ cached, total }` for cache hits, so a
      // strict requirement on `prompt`/`completion` would clobber the
      // superclass's zero-cost contract on repeated evaluations.
      expect(
        calculateFireworksCost({ inputCost: 0.001, outputCost: 0.002 }, undefined, undefined, true),
      ).toBe(0);
    });

    it('discounts Fireworks prompt-cache tokens against the input rate', () => {
      // Default discount mirrors Fireworks's documented 50% off cached input.
      expect(
        calculateFireworksCost({ inputCost: 0.001, outputCost: 0.002 }, 100, 5, false, 40),
      ).toBeCloseTo(0.001 * 60 + 0.0005 * 40 + 0.002 * 5);
    });

    it('honors an explicit cacheReadInputCost override for Fireworks prompt cache', () => {
      expect(
        calculateFireworksCost(
          { inputCost: 0.001, outputCost: 0.002, cacheReadInputCost: 0.0001 },
          100,
          5,
          false,
          40,
        ),
      ).toBeCloseTo(0.001 * 60 + 0.0001 * 40 + 0.002 * 5);
    });
  });

  describe('readFireworksCachedPromptTokens', () => {
    it('reads from the OpenAI-style completionDetails field when present', () => {
      expect(
        readFireworksCachedPromptTokens({
          output: 'ok',
          tokenUsage: {
            prompt: 100,
            completion: 5,
            total: 105,
            completionDetails: { cacheReadInputTokens: 40 },
          },
        } as any),
      ).toBe(40);
    });

    it('falls back to the `fireworks-cached-prompt-tokens` response header', () => {
      expect(
        readFireworksCachedPromptTokens({
          output: 'ok',
          tokenUsage: { prompt: 100, completion: 5, total: 105 },
          metadata: { http: { headers: { 'fireworks-cached-prompt-tokens': '40' } } },
        } as any),
      ).toBe(40);
    });

    it('handles a title-cased response header for the cache count', () => {
      // Different proxies normalise header casing differently, so accept both.
      expect(
        readFireworksCachedPromptTokens({
          output: 'ok',
          metadata: { http: { headers: { 'Fireworks-Cached-Prompt-Tokens': '12' } } },
        } as any),
      ).toBe(12);
    });

    it('prefers the larger value when both sources are populated', () => {
      expect(
        readFireworksCachedPromptTokens({
          output: 'ok',
          tokenUsage: {
            prompt: 100,
            completion: 5,
            total: 105,
            completionDetails: { cacheReadInputTokens: 30 },
          },
          metadata: { http: { headers: { 'fireworks-cached-prompt-tokens': '50' } } },
        } as any),
      ).toBe(50);
    });

    it('returns 0 when no source provides a cache count', () => {
      expect(
        readFireworksCachedPromptTokens({
          output: 'ok',
          tokenUsage: { prompt: 100, completion: 5, total: 105 },
        } as any),
      ).toBe(0);
    });

    it('ignores malformed header values without throwing', () => {
      expect(
        readFireworksCachedPromptTokens({
          output: 'ok',
          metadata: { http: { headers: { 'fireworks-cached-prompt-tokens': 'not-a-number' } } },
        } as any),
      ).toBe(0);
    });
  });

  describe('createFireworksProvider', () => {
    it('parses the model name from the provider path', () => {
      const provider = createFireworksProvider(`fireworks:${FIREWORKS_MODEL}`);
      expect(provider.id()).toBe(`fireworks:${FIREWORKS_MODEL}`);
    });

    it('preserves model names that contain colons', () => {
      const provider = createFireworksProvider('fireworks:vendor/model:tag-v1');
      expect(provider.id()).toBe('fireworks:vendor/model:tag-v1');
    });

    it('throws when the provider path is missing the model', () => {
      expect(() => createFireworksProvider('fireworks:')).toThrow(/needs a model identifier/);
    });

    it('rejects endpoint subtypes that this chat-only provider does not implement', () => {
      expect(() =>
        createFireworksProvider('fireworks:embedding:nomic-ai/nomic-embed-text-v1.5'),
      ).toThrow(/fireworks:embedding:\* subtype is reserved/);
    });

    it('forwards config and env into the constructed provider', () => {
      const provider = createFireworksProvider(`fireworks:${FIREWORKS_MODEL}`, {
        config: { config: { temperature: 0.5 } } as any,
        env: { FIREWORKS_API_KEY: 'env-fake-key' },
      });
      expect(provider).toBeInstanceOf(FireworksProvider);
    });
  });
});
