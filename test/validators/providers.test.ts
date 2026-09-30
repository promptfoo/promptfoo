import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { OpenAiEmbeddingProvider } from '../../src/providers/openai/embedding';
import { createTogetherAiProvider } from '../../src/providers/togetherai';
import { hasProviderCapability } from '../../src/types/providers';
import { ProviderOptionsSchema, ProviderSchema } from '../../src/validators/providers';
import { createMockProvider } from '../factories/provider';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProviderOptionsSchema', () => {
  it('should filter unknown keys without erroring', () => {
    const input = {
      id: 'test-provider',
      label: 'Test Provider',
      unknownField: 'this should be filtered',
      anotherUnknown: 123,
    };

    const result = ProviderOptionsSchema.safeParse(input);

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('id', 'test-provider');
    expect(result.data).toHaveProperty('label', 'Test Provider');
    expect(result.data).not.toHaveProperty('unknownField');
    expect(result.data).not.toHaveProperty('anotherUnknown');
  });

  it('should accept valid provider options', () => {
    const input = {
      id: 'test-provider',
      label: 'Test Provider',
      config: { temperature: 0.7 },
      prompts: ['prompt1', 'prompt2'],
      transform: 'output.toLowerCase()',
      delay: 1000,
    };

    const result = ProviderOptionsSchema.safeParse(input);

    expect(result.success).toBe(true);
    expect(result.data).toEqual(input);
  });

  it('should accept empty object', () => {
    const result = ProviderOptionsSchema.safeParse({});

    expect(result.success).toBe(true);
    expect(result.data).toEqual({});
  });

  it('uses process env for a custom Together AI credential name after config parsing', () => {
    vi.stubEnv('CUSTOM_TOGETHER_KEY', 'process-key');
    try {
      const parsed = ProviderOptionsSchema.parse({
        config: { apiKeyEnvar: 'CUSTOM_TOGETHER_KEY' },
        env: { CUSTOM_TOGETHER_KEY: 'provider-key', TOGETHER_API_KEY: 'registered-key' },
      });
      expect(parsed.env).toEqual({ TOGETHER_API_KEY: 'registered-key' });
      const provider = createTogetherAiProvider('togetherai:chat:fixture', { config: parsed });
      expect((provider as OpenAiChatCompletionProvider).getApiKey()).toBe('process-key');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('ProviderSchema union', () => {
  it('should match ApiProviderSchema before ProviderOptionsSchema when callApi is present', () => {
    const input = createMockProvider({
      id: 'custom-provider',
      label: 'Custom Provider',
    });

    const result = ProviderSchema.safeParse(input);

    expect(result.success).toBe(true);
    // callApi should be preserved because ApiProviderSchema matches first
    expect(result.data).toHaveProperty('callApi');
    expect(result.data).toHaveProperty('id');
    expect(result.data).toHaveProperty('label', 'Custom Provider');
  });

  it('should match ProviderOptionsSchema when no callApi function', () => {
    const input = {
      id: 'test-provider',
      label: 'Test Provider',
      unknownField: 'should be filtered',
    };

    const result = ProviderSchema.safeParse(input);

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('id', 'test-provider');
    expect(result.data).toHaveProperty('label', 'Test Provider');
    // unknownField should be filtered by ProviderOptionsSchema
    expect(result.data).not.toHaveProperty('unknownField');
  });

  it('preserves explicit provider capabilities', () => {
    const input = {
      id: () => 'embedding',
      callApi: async () => ({}),
      promptfooCapabilities: ['callEmbeddingApi'],
    };

    const result = ProviderSchema.parse(input);

    expect(result).toMatchObject({ promptfooCapabilities: ['callEmbeddingApi'] });
  });

  it('preserves inherited capability delegation and grader operations', () => {
    class TextEmbeddingProvider extends OpenAiEmbeddingProvider {
      override async callApi() {
        return { output: 'text' };
      }
    }
    const provider = ProviderSchema.parse(new TextEmbeddingProvider('fixture'));
    expect(hasProviderCapability(provider, 'callApi')).toBe(true);

    const custom = ProviderSchema.parse({
      id: () => 'custom',
      callApi: async () => ({ output: 'text' }),
      callSimilarityApi: async () => ({ similarity: 1 }),
      callModerationApi: async () => ({ flags: [] }),
    });
    expect(custom).toHaveProperty('callSimilarityApi');
    expect(custom).toHaveProperty('callModerationApi');
  });

  it('preserves the receiver for parsed provider operations', async () => {
    class StatefulProvider {
      #value = 7;
      id() {
        return `stateful-${this.#value}`;
      }
      async callApi() {
        return { output: this.#value };
      }
      async callEmbeddingApi() {
        return { embedding: [this.#value] };
      }
      async callClassificationApi() {
        return { classification: { fixture: this.#value } };
      }
      async callSimilarityApi() {
        return { similarity: this.#value };
      }
      async callModerationApi() {
        return { flags: [], value: this.#value };
      }
    }
    const input = new StatefulProvider();
    const provider = ProviderSchema.parse(input);
    expect(typeof provider).toBe('object');
    if (typeof provider === 'string' || !provider.callApi || typeof provider.id !== 'function') {
      throw new Error('Expected a parsed API provider');
    }

    expect(provider.id()).toBe('stateful-7');
    expect(await provider.callApi('')).toEqual({ output: 7 });
    expect(await provider.callEmbeddingApi?.('')).toEqual({ embedding: [7] });
    expect(await provider.callClassificationApi?.('')).toEqual({ classification: { fixture: 7 } });
    expect(await provider.callSimilarityApi?.('', '')).toEqual({ similarity: 7 });
    expect(await provider.callModerationApi?.('', '')).toEqual({ flags: [], value: 7 });
  });

  it.each([
    { capabilities: ['misspelled'] },
    { capabilities: ['callApi', 'third-party'] },
    { capabilities: 'callApi' },
  ])(
    'rejects invalid capability declarations instead of returning options: %j',
    ({ capabilities }) => {
      const provider = {
        id: () => 'custom',
        callApi: async () => ({ output: 'fixture' }),
        promptfooCapabilities: capabilities,
      };

      expect(ProviderSchema.safeParse(provider).success).toBe(false);
    },
  );

  it('should accept string provider', () => {
    const result = ProviderSchema.safeParse('openai:gpt-4');

    expect(result.success).toBe(true);
    expect(result.data).toBe('openai:gpt-4');
  });
});
