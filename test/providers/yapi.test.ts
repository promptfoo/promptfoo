import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import {
  createYApiProvider,
  Y_API_API_BASE_URL,
  Y_API_DEFAULT_API_KEY_ENVAR,
  YApiProvider,
} from '../../src/providers/yapi';
import { mockProcessEnv } from '../util/utils';

/**
 * These tests are offline by construction: they assert registry dispatch, class
 * construction, endpoint/credential resolution and cost suppression. No HTTP request
 * is made and no live API key is used.
 */
describe('YApiProvider', () => {
  let restoreEnv: (() => void) | undefined;

  afterEach(() => {
    restoreEnv?.();
    restoreEnv = undefined;
    vi.restoreAllMocks();
  });

  it('defaults to the Y-API endpoint and key envar', () => {
    const provider = new YApiProvider('deepseek/deepseek-v4-pro', { config: { apiKey: 'k' } });

    expect(provider.modelName).toBe('deepseek/deepseek-v4-pro');
    expect(provider.id()).toBe('y-api:deepseek/deepseek-v4-pro');
    expect(provider.toString()).toBe('[Y-API Provider deepseek/deepseek-v4-pro]');
    expect(provider.getApiUrl()).toBe(Y_API_API_BASE_URL);
    expect(provider.config.apiBaseUrl).toBe(Y_API_API_BASE_URL);
    expect(provider.config.apiKeyEnvar).toBe(Y_API_DEFAULT_API_KEY_ENVAR);
  });

  it('lets explicit config override the endpoint and envar', () => {
    const provider = new YApiProvider('qwen/qwen3.8-flash', {
      config: { apiBaseUrl: 'https://proxy.example.com/y-api/v1', apiKeyEnvar: 'MY_PROXY_KEY' },
    });

    expect(provider.getApiUrl()).toBe('https://proxy.example.com/y-api/v1');
    expect(provider.config.apiKeyEnvar).toBe('MY_PROXY_KEY');
  });

  it('does not fall back to OPENAI_API_KEY', () => {
    restoreEnv = mockProcessEnv({ OPENAI_API_KEY: 'openai-key', Y_API_API_KEY: undefined });
    const provider = new YApiProvider('z-ai/glm-5.3');

    expect(provider.getApiKey()).toBeUndefined();
  });

  it('resolves the key from config, env object, then process.env', () => {
    restoreEnv = mockProcessEnv({ OPENAI_API_KEY: undefined, Y_API_API_KEY: 'proc-key' });

    expect(new YApiProvider('z-ai/glm-5.3', { config: { apiKey: 'explicit' } }).getApiKey()).toBe(
      'explicit',
    );
    expect(
      new YApiProvider('z-ai/glm-5.3', { env: { Y_API_API_KEY: 'ctx-key' } }).getApiKey(),
    ).toBe('ctx-key');
    expect(new YApiProvider('z-ai/glm-5.3').getApiKey()).toBe('proc-key');
  });

  it('reads a custom apiKeyEnvar instead of Y_API_API_KEY', () => {
    restoreEnv = mockProcessEnv({ CUSTOM_Y_KEY: 'custom', Y_API_API_KEY: undefined });
    const provider = new YApiProvider('z-ai/glm-5.3', {
      config: { apiKeyEnvar: 'CUSTOM_Y_KEY' },
    });

    expect(provider.getApiKey()).toBe('custom');
  });

  it('ignores the OpenAI base URL env vars so traffic cannot be misrouted', () => {
    restoreEnv = mockProcessEnv({
      OPENAI_API_HOST: 'evil.example.com',
      OPENAI_API_BASE_URL: 'https://evil.example.com/v1',
      OPENAI_BASE_URL: 'https://evil.example.com/v1',
    });
    const provider = new YApiProvider('deepseek/deepseek-v4-pro', { config: { apiKey: 'k' } });

    expect(provider.getApiUrl()).toBe(Y_API_API_BASE_URL);
  });

  it('does not forward an OpenAI organization to the gateway', () => {
    restoreEnv = mockProcessEnv({ OPENAI_ORGANIZATION: 'org-123' });
    const provider = new YApiProvider('deepseek/deepseek-v4-pro', { config: { apiKey: 'k' } });

    expect(provider.getOrganization()).toBeUndefined();
  });

  it('names Y_API_API_KEY in the missing-key error', () => {
    const provider = new YApiProvider('deepseek/deepseek-v4-pro', {
      config: { apiKeyEnvar: 'CUSTOM_Y_KEY' },
    });

    expect((provider as any).getMissingApiKeyErrorMessage()).toContain('CUSTOM_Y_KEY');
    expect(
      (new YApiProvider('deepseek/deepseek-v4-pro') as any).getMissingApiKeyErrorMessage(),
    ).toContain(Y_API_DEFAULT_API_KEY_ENVAR);
  });

  describe('cost reporting', () => {
    const usage = {
      prompt_tokens: 1000,
      completion_tokens: 1000,
      prompt_tokens_details: { cached_tokens: 0 },
    };

    const costFor = (provider: OpenAiChatCompletionProvider) =>
      (provider as any).calculateResponseCost({ usage }, (provider as any).config, false);

    it('reports no cost, because Y-API meters in credit rather than USD', () => {
      const provider = new YApiProvider('deepseek/deepseek-v4-pro', { config: { apiKey: 'k' } });

      expect(costFor(provider)).toBeUndefined();
    });

    it('suppresses the inherited OpenAI rate table for vendor-namespaced model IDs', () => {
      // The base class resolves billing rates from `modelName.split('/').pop()`, so
      // `openai/gpt-5.6-luna` would otherwise match OpenAI's *direct* list price and
      // publish it as the cost of a Y-API call.
      const base = new OpenAiChatCompletionProvider('openai/gpt-5.6-luna', {
        config: { apiKey: 'k', apiBaseUrl: Y_API_API_BASE_URL },
      });
      const yapi = new YApiProvider('openai/gpt-5.6-luna', { config: { apiKey: 'k' } });

      expect(costFor(base)).toBeTypeOf('number');
      expect(costFor(yapi)).toBeUndefined();
    });

    it('reports no cost for the other vendor-prefixed IDs that collide with the table', () => {
      const provider = new YApiProvider('openai/gpt-5.6-sol', { config: { apiKey: 'k' } });

      expect(costFor(provider)).toBeUndefined();
    });
  });

  it('keeps OpenRouter billing detection off for this prefix', () => {
    const provider = new YApiProvider('openai/gpt-5.6-luna', { config: { apiKey: 'k' } });

    expect((provider as any).getGenAISystem()).toBe('y-api');
  });
});

describe('createYApiProvider', () => {
  it.each([
    ['y-api:deepseek/deepseek-v4-pro', 'deepseek/deepseek-v4-pro'],
    ['y-api:chat:deepseek/deepseek-v4-pro', 'deepseek/deepseek-v4-pro'],
    ['y-api:moonshotai/kimi-k3', 'moonshotai/kimi-k3'],
    ['y-api:minimax/minimax-m2.7', 'minimax/minimax-m2.7'],
    ['y-api:anthropic/claude-sonnet-5', 'anthropic/claude-sonnet-5'],
    ['y-api:openai/gpt-5.6-luna', 'openai/gpt-5.6-luna'],
  ])('routes %s to YApiProvider with model %s', (providerPath, modelName) => {
    const provider = createYApiProvider(providerPath, { config: { apiKey: 'k' } });

    expect(provider).toBeInstanceOf(YApiProvider);
    expect(provider.modelName).toBe(modelName);
    expect(provider.id()).toBe(`y-api:${modelName}`);
  });

  it('preserves the configured provider id and env overrides', () => {
    const provider = createYApiProvider('y-api:qwen/qwen3.8-flash', {
      id: 'my-y-api-model',
      env: { Y_API_API_KEY: 'from-context' },
    });

    expect(provider.id()).toBe('my-y-api-model');
    expect(provider.getApiKey()).toBe('from-context');
  });

  it.each(['y-api:', 'y-api:chat:'])('throws when %s omits the model', (providerPath) => {
    expect(() => createYApiProvider(providerPath)).toThrow(
      'Y-API provider requires a model in the format y-api:<vendor/model>',
    );
  });

  it.each([
    'embedding',
    'embeddings',
    'completion',
    'image',
    'moderation',
    'audio',
    'transcription',
    'realtime',
    'responses',
  ])('fails fast for the unsupported y-api:%s sub-type instead of routing to chat', (subType) => {
    const providerPath = `y-api:${subType}:deepseek/deepseek-v4-pro`;

    expect(() => createYApiProvider(providerPath)).toThrow(
      /Y-API serves OpenAI-style chat completions only/,
    );
    expect(() => createYApiProvider(providerPath)).toThrow(new RegExp(`openai:${subType}:<model>`));
  });
});
