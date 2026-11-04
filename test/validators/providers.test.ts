import { afterEach, describe, expect, it, vi } from 'vitest';
import { InputsSchema } from '../../src/contracts/shared';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { OpenAiEmbeddingProvider } from '../../src/providers/openai/embedding';
import { createTogetherAiProvider } from '../../src/providers/togetherai';
import { type ApiProvider, hasProviderCapability } from '../../src/types/providers';
import {
  ApiProviderObjectSchema,
  ApiProviderSchema,
  ProviderOptionsSchema,
  ProviderSchema,
} from '../../src/validators/providers';
import { createMockProvider } from '../factories/provider';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProviderOptionsSchema', () => {
  it('uses the canonical input schema for configured and callable providers', () => {
    expect(ProviderOptionsSchema.shape.inputs.unwrap()).toBe(InputsSchema);
    expect(ApiProviderObjectSchema.shape.inputs.unwrap()).toBe(InputsSchema);
    const inputs = { question: 'User question', context: { type: 'text', description: 'Context' } };
    expect(ProviderOptionsSchema.parse({ inputs }).inputs).toEqual(inputs);
    expect(
      ApiProviderSchema.parse({ id: () => 'local', callApi: async () => ({}), inputs }).inputs,
    ).toEqual(inputs);
  });

  it.each([{ 'invalid-name': 'question' }, { question: 42 }, { question: { type: 'unknown' } }])(
    'rejects invalid input contracts: %j',
    (inputs) => {
      expect(ProviderOptionsSchema.safeParse({ inputs }).success).toBe(false);
      expect(
        ApiProviderSchema.safeParse({ id: () => 'local', callApi: async () => ({}), inputs })
          .success,
      ).toBe(false);
    },
  );
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
  it('preserves the explicit embedding cancellation capability without requiring it', async () => {
    const provider = {
      id: () => 'custom-embedding',
      callApi: vi.fn(async () => ({ output: 'text' })),
      callEmbeddingApi: vi.fn(async () => ({ embedding: [1, 0] })),
    };
    expect(ApiProviderSchema.parse(provider)).not.toHaveProperty('supportsEmbeddingCancellation');
    const parsed = ProviderSchema.parse({
      ...provider,
      supportsEmbeddingCancellation: true,
    }) as ApiProvider;
    expect(parsed.supportsEmbeddingCancellation).toBe(true);
    expect(await parsed.callEmbeddingApi?.('input')).toEqual({ embedding: [1, 0] });
    expect(provider.callEmbeddingApi).toHaveBeenCalledWith('input');
    expect(
      ApiProviderSchema.safeParse({ ...provider, supportsEmbeddingCancellation: 'true' }).success,
    ).toBe(false);
  });

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
