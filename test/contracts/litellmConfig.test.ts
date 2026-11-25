import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';
import {
  LiteLLMChatConfigInputJsonSchema,
  LiteLLMChatConfigInputSchema,
  LiteLLMCompletionConfigInputJsonSchema,
  LiteLLMCompletionConfigInputSchema,
  LiteLLMEmbeddingConfigInputJsonSchema,
  LiteLLMEmbeddingConfigInputSchema,
  LiteLLMProviderOptionsInputJsonSchema,
  LiteLLMProviderOptionsInputSchema,
} from '../../src/contracts';

describe('LiteLLM portable configuration contracts', () => {
  const proxy = {
    id: 'proxy-label',
    apiBaseUrl: '{{ env.PROXY_URL }}',
    apiKeyEnvar: 'CUSTOM_PROXY_KEY',
    headers: { 'x-tenant': 'test' },
  };
  const chat = {
    ...proxy,
    temperature: 0,
    max_completion_tokens: 100,
    tools: 'file://tools.yaml',
    passthrough: { metadata: { tags: ['evals'] } },
  };
  const completion = { ...proxy, best_of: 2, stop: ['end'], max_tokens: 32 };
  const embedding = { ...proxy, passthrough: { dimensions: 128, encoding_format: 'float' } };
  const invalidCommon = [{ apiKeyEnvar: 123 }, { unknown: true }, { model: 'from-id' }, null];

  for (const { name, schema, jsonSchema, valid, invalid } of [
    {
      name: 'chat',
      schema: LiteLLMChatConfigInputSchema,
      jsonSchema: LiteLLMChatConfigInputJsonSchema,
      valid: [{}, chat],
      invalid: [
        ...invalidCommon,
        { max_output_tokens: 64 },
        { max_completion_tokens: '100' },
        { tools: [{ type: 'function', function: { name: 1 } }] },
      ],
    },
    {
      name: 'completion',
      schema: LiteLLMCompletionConfigInputSchema,
      jsonSchema: LiteLLMCompletionConfigInputJsonSchema,
      valid: [{}, completion],
      invalid: [...invalidCommon, { max_completion_tokens: 100 }, { tools: 'file://tools.yaml' }],
    },
    {
      name: 'embedding',
      schema: LiteLLMEmbeddingConfigInputSchema,
      jsonSchema: LiteLLMEmbeddingConfigInputJsonSchema,
      valid: [{}, embedding],
      invalid: [...invalidCommon, { temperature: 0 }, { passthrough: 'dimensions' }],
    },
    {
      name: 'provider options',
      schema: LiteLLMProviderOptionsInputSchema,
      jsonSchema: LiteLLMProviderOptionsInputJsonSchema,
      valid: [
        { id: 'litellm:gateway/model:v2', label: 'Proxy target', config: chat },
        { id: 'litellm:chat:gateway/model:v2' },
        { id: 'litellm:completion:deployment', config: completion },
        { id: 'litellm:embedding:embedding-model', config: embedding },
        { id: 'litellm:embeddings:embedding-model', config: embedding },
      ],
      invalid: [
        { id: 'openai:chat:model' },
        { id: 'litellm:' },
        { id: 'litellm:chat:' },
        { id: 'litellm:completion' },
        { id: 'litellm:embedding:' },
        { id: 'litellm:embeddings' },
        { id: 'litellm:completion:deployment', config: chat },
        { id: 'litellm:embeddings:deployment', config: chat },
        { id: 'litellm:my-model', config: { extra: 'put proxy fields under passthrough' } },
      ],
    },
  ]) {
    it(`validates ${name} with Zod and Draft 7 JSON Schema`, () => {
      expect(jsonSchema.$schema).toBe('http://json-schema.org/draft-07/schema#');
      const validate = new Ajv({ strict: false }).compile(jsonSchema);
      for (const value of valid) {
        expect(schema.parse(value)).toEqual(value);
        expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
      }
      for (const value of invalid) {
        expect(schema.safeParse(value).success, JSON.stringify(value)).toBe(false);
        expect(validate(value), JSON.stringify(value)).toBe(false);
      }
    });
  }

  it('rejects runtime callbacks and other non-JSON request values', () => {
    expect(
      LiteLLMChatConfigInputSchema.safeParse({ functionToolCallbacks: { f() {} } }).success,
    ).toBe(false);
    expect(
      LiteLLMChatConfigInputSchema.safeParse({ passthrough: { value: undefined } }).success,
    ).toBe(false);
  });
});
