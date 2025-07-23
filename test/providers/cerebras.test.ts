import { loadApiProvider } from '../../src/providers';
import { createCerebrasProvider } from '../../src/providers/cerebras';
import type { z } from 'zod';

import type { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import type { ApiProvider } from '../../src/types';
import type { ProviderEnvOverridesSchema } from '../../src/types/env';

type ProviderEnvOverrides = z.infer<typeof ProviderEnvOverridesSchema>;

describe('Cerebras provider', () => {
  let provider: ApiProvider;

  beforeEach(() => {
    process.env.CEREBRAS_API_KEY = 'test-key';
  });

  afterEach(() => {
    delete process.env.CEREBRAS_API_KEY;
  });

  describe('createCerebrasProvider', () => {
    it('should create a chat provider', () => {
      provider = createCerebrasProvider('cerebras:llama3.1-8b');
      expect(provider.id()).toBe('llama3.1-8b');
      expect(provider.toString()).toContain('OpenAI');
      expect((provider as OpenAiChatCompletionProvider).config).toMatchObject({
        apiKeyEnvar: 'CEREBRAS_API_KEY',
        apiBaseUrl: 'https://api.cerebras.ai/v1',
        passthrough: {},
      });
    });

    it('should handle custom config options', () => {
      provider = createCerebrasProvider('cerebras:llama3.1-8b', {
        config: {
          config: {
            basePath: '/custom/path',
            temperature: 0.8,
          },
        },
      });
      expect((provider as OpenAiChatCompletionProvider).config).toMatchObject({
        apiKeyEnvar: 'CEREBRAS_API_KEY',
        apiBaseUrl: 'https://api.cerebras.ai/v1',
        passthrough: {
          temperature: 0.8,
        },
      });
    });

    it('should handle max_tokens correctly', () => {
      const provider = createCerebrasProvider('cerebras:llama3.1-8b');
      const { body } = (provider as OpenAiChatCompletionProvider).getOpenAiBody(
        'test prompt',
        undefined,
        {
          max_tokens: 1024,
        } as any,
      );

      expect(body).toMatchObject({
        messages: [
          {
            role: 'user',
            content: 'test prompt',
          },
        ],
        model: 'llama3.1-8b',
        max_tokens: 1024,
      });
    });

    it('should handle model name parsing', () => {
      const provider = createCerebrasProvider('cerebras:model:with:colons');
      expect(provider.id()).toBe('model:with:colons');
    });

    it('should merge env overrides', () => {
      const provider = createCerebrasProvider('cerebras:test-model', {
        env: {
          OPENAI_API_KEY: 'override-key',
        } as ProviderEnvOverrides,
      });
      expect((provider as OpenAiChatCompletionProvider).config.apiKeyEnvar).toBe(
        'CEREBRAS_API_KEY',
      );
    });

    it('should handle empty config', () => {
      const provider = createCerebrasProvider('cerebras:test-model');
      expect((provider as OpenAiChatCompletionProvider).config).toMatchObject({
        apiKeyEnvar: 'CEREBRAS_API_KEY',
        apiBaseUrl: 'https://api.cerebras.ai/v1',
        passthrough: {},
      });
    });

    it('should not remove max_tokens if max_completion_tokens is not present', () => {
      const provider = createCerebrasProvider('cerebras:llama3.1-8b');
      const { body } = (provider as OpenAiChatCompletionProvider).getOpenAiBody(
        'prompt',
        undefined,
        {
          max_tokens: 123,
        } as any,
      );
      expect(body.max_tokens).toBe(1024);
      expect(body.max_completion_tokens).toBeUndefined();
    });

    it('should support both empty and undefined options', () => {
      const provider1 = createCerebrasProvider('cerebras:foo');
      const provider2 = createCerebrasProvider('cerebras:foo', undefined);
      expect((provider1 as OpenAiChatCompletionProvider).config).toMatchObject({
        apiKeyEnvar: 'CEREBRAS_API_KEY',
        apiBaseUrl: 'https://api.cerebras.ai/v1',
        passthrough: {},
      });
      expect((provider2 as OpenAiChatCompletionProvider).config).toMatchObject({
        apiKeyEnvar: 'CEREBRAS_API_KEY',
        apiBaseUrl: 'https://api.cerebras.ai/v1',
        passthrough: {},
      });
    });

    it('should not include basePath in passthrough config', () => {
      const provider = createCerebrasProvider('cerebras:llama3.1-8b', {
        config: {
          config: {
            basePath: '/should/not/be/included',
            foo: 'bar',
          },
        },
      });
      expect((provider as OpenAiChatCompletionProvider).config.passthrough).toMatchObject({
        foo: 'bar',
      });

      expect(
        ((provider as OpenAiChatCompletionProvider).config.passthrough as any).basePath,
      ).toBeUndefined();
    });

    it('should pass through arbitrary passthrough config', () => {
      const provider = createCerebrasProvider('cerebras:llama3.1-8b', {
        config: {
          config: {
            customParam: 'myValue',
          },
        },
      });
      expect((provider as OpenAiChatCompletionProvider).config.passthrough).toMatchObject({
        customParam: 'myValue',
      });
    });

    it('should allow id and env options', () => {
      const provider = createCerebrasProvider('cerebras:llama3.1-8b', {
        id: 'custom-id',
        env: {
          CEREBRAS_API_KEY: 'another-key',
        } as ProviderEnvOverrides,
      });
      expect(provider.id()).toBe('custom-id');
      expect((provider as OpenAiChatCompletionProvider).config.apiKeyEnvar).toBe(
        'CEREBRAS_API_KEY',
      );
    });

    it('should not include max_tokens or max_completion_tokens if neither provided', () => {
      const provider = createCerebrasProvider('cerebras:llama3.1-8b');
      const { body } = (provider as OpenAiChatCompletionProvider).getOpenAiBody(
        'prompt',
        undefined,
        {} as any,
      );
      expect(body.max_tokens).toBe(1024);
      expect(body.max_completion_tokens).toBeUndefined();
    });
  });

  describe('loadApiProvider', () => {
    it('should load the provider from the registry', async () => {
      provider = await loadApiProvider('cerebras:llama3.1-8b');
      expect(provider.id()).toBe('llama3.1-8b');
      expect(provider.toString()).toContain('OpenAI');
      expect((provider as OpenAiChatCompletionProvider).config).toMatchObject({
        apiKeyEnvar: 'CEREBRAS_API_KEY',
        apiBaseUrl: 'https://api.cerebras.ai/v1',
        passthrough: {},
      });
    });
  });
});
