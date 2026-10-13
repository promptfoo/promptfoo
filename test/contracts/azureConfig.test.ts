import Ajv from 'ajv';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import {
  AzureChatConfigInputJsonSchema,
  AzureChatConfigInputSchema,
  AzureCompletionConfigInputJsonSchema,
  AzureCompletionConfigInputSchema,
  AzureEmbeddingConfigInputJsonSchema,
  AzureEmbeddingConfigInputSchema,
  AzureProviderOptionsInputJsonSchema,
  AzureProviderOptionsInputSchema,
  AzureResponsesConfigInputJsonSchema,
  AzureResponsesConfigInputSchema,
  AzureSharedConfigInputJsonSchema,
  AzureSharedConfigInputSchema,
} from '../../src/contracts';

import type { AzureChatConfigInput, AzureProviderOptionsInput } from '../../src/contracts';
import type { AzureCompletionOptions, AzureProviderOptions } from '../../src/providers/azure/types';
import type { ProviderOptions } from '../../src/types/providers';

const shared = {
  apiKey: '{{ env.KEY }}',
  apiKeyEnvar: 'CUSTOM_KEY',
  apiHost: '{{ env.HOST }}',
  apiBaseUrl: '{{ env.URL }}',
  apiVersion: 'custom-version',
  headers: { 'X-Custom': 'value' },
  azureClientId: '{{ CLIENT }}',
  azureClientSecret: '{{ SECRET }}',
  azureTenantId: '{{ TENANT }}',
  azureAuthorityHost: '{{ AUTHORITY }}',
  azureTokenScope: '{{ SCOPE }}',
  deployment_id: 'deployment',
};
const commonInvalid: unknown[] = [
  null,
  [],
  'azure',
  { apiKey: 1 },
  { headers: { Authorization: 1 } },
  { azureTenantId: 1 },
  { apiVersion: 1 },
  { unknown: true },
];
const nestedFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'result',
    strict: false,
    schema: { type: 'object', $defs: { item: { type: 'string' } }, additionalProperties: true },
  },
};
const chat = {
  ...shared,
  temperature: 0,
  max_tokens: 1,
  max_completion_tokens: 2,
  top_p: 0,
  frequency_penalty: 0,
  presence_penalty: 0,
  best_of: 1,
  functions: 'file://functions.json',
  function_call: { name: 'lookup' },
  tools: 'file://tools.yaml',
  tool_choice: { type: 'function', function: { name: 'lookup' } },
  response_format: nestedFormat,
  stop: ['end'],
  seed: 1,
  reasoning_effort: 'high',
  verbosity: 'low',
  functionToolCallbacks: { lookup: 'file://callback.js' },
  passthrough: { extra: true },
  mcp: { enabled: true, server: { command: 'node' } },
  omitDefaults: true,
  modelName: 'underlying-model',
  systemPrompt: '{{ prompt }}',
  dataSources: [{ type: 'AzureCognitiveSearch', parameters: { endpoint: '{{ ENDPOINT }}' } }],
  isReasoningModel: false,
  isClaudeOpus47OrLater: true,
  o1: false,
};

describe('Azure portable configuration contracts', () => {
  for (const { name, schema, jsonSchema, valid, invalid } of [
    {
      name: 'shared',
      schema: AzureSharedConfigInputSchema,
      jsonSchema: AzureSharedConfigInputJsonSchema,
      valid: [{}, shared],
      invalid: commonInvalid,
    },
    {
      name: 'chat',
      schema: AzureChatConfigInputSchema,
      jsonSchema: AzureChatConfigInputJsonSchema,
      valid: [{}, chat, { response_format: 'file://format.json' }],
      invalid: [
        ...commonInvalid,
        { temperature: 'warm' },
        { o1: 1 },
        {
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'result', strict: 'false', schema: {} },
          },
        },
        { mcp: { server: { url: 123 } } },
        { functionToolCallbacks: { lookup: () => {} } },
        { max_output_tokens: 10 },
      ],
    },
    {
      name: 'responses',
      schema: AzureResponsesConfigInputSchema,
      jsonSchema: AzureResponsesConfigInputJsonSchema,
      valid: [
        {},
        {
          ...shared,
          modelName: 'underlying-model',
          response_format: {
            ...nestedFormat,
            json_schema: { ...nestedFormat.json_schema, strict: true },
          },
          tools: 'file://tools.yaml',
          functionToolCallbacks: { lookup: 'file://callback.js' },
          mcp: { enabled: true, server: { command: 'node' } },
        },
        {
          instructions: '{{ prompt }}',
          model: 'configured-model',
          max_output_tokens: 0,
          max_tool_calls: 4,
          previous_response_id: 'resp',
          truncation: 'disabled',
          metadata: { user: 'value' },
          parallel_tool_calls: false,
          stream: false,
          store: false,
          service_tier: null,
          response_format: {
            type: 'json_schema',
            name: 'result',
            strict: true,
            schema: 'file://schema.json',
          },
        },
      ],
      invalid: [
        ...commonInvalid,
        { max_output_tokens: '10' },
        { max_tokens: 32 },
        { max_completion_tokens: 32 },
        { service_tier: 'standard_only' },
        { response_format: { type: 'json_schema', schema: [] } },
      ],
    },
    {
      name: 'completion',
      schema: AzureCompletionConfigInputSchema,
      jsonSchema: AzureCompletionConfigInputJsonSchema,
      valid: [
        {},
        shared,
        {
          temperature: 0,
          max_tokens: 10,
          top_p: 0,
          presence_penalty: 0,
          frequency_penalty: 0,
          best_of: 1,
          stop: 'end',
          passthrough: { suffix: 'tail' },
        },
      ],
      invalid: [...commonInvalid, { tools: [] }, { max_tokens: '10' }],
    },
    {
      name: 'embedding',
      schema: AzureEmbeddingConfigInputSchema,
      jsonSchema: AzureEmbeddingConfigInputJsonSchema,
      valid: [{}, shared, { dimensions: 128 }],
      invalid: [...commonInvalid, { dimensions: '128' }, { temperature: 0 }],
    },
  ]) {
    describe(name, () => {
      const validateJson = new Ajv({ strict: true }).compile(jsonSchema);
      it.each(valid.map((input) => ({ input })))(
        'preserves authoring input in Zod and JSON Schema: %j',
        ({ input }) => {
          expect(schema.parse(input)).toEqual(input);
          expect(validateJson(input), JSON.stringify(validateJson.errors)).toBe(true);
        },
      );
      it.each(invalid.map((input) => ({ input })))(
        'rejects malformed known fields in both contracts: %j',
        ({ input }) => {
          expect(schema.safeParse(input).success).toBe(false);
          expect(validateJson(input)).toBe(false);
        },
      );
      it('exports representable input without runtime defaults', () => {
        expect(
          z.toJSONSchema(schema, { target: 'draft-07', io: 'input', unrepresentable: 'throw' }),
        ).toEqual(jsonSchema);
        expect(schema.parse({})).toEqual({});
      });
    });
  }
  const validateOptions = new Ajv({ strict: true }).compile(AzureProviderOptionsInputJsonSchema);
  it.each(['azure', 'azureopenai'])('supports the %s alias for every covered API', (prefix) => {
    for (const route of ['chat', 'responses', 'completion', 'embedding', 'embeddings']) {
      const input = { id: `${prefix}:${route}:deployment:with:colons`, config: {} };
      expect(AzureProviderOptionsInputSchema.parse(input)).toEqual(input);
      expect(validateOptions(input)).toBe(true);
    }
  });
  it.each(['azure:embedding', 'azureopenai:embeddings', 'azure:embedding:'])(
    'retains the legacy embedding deployment default for %s',
    (id) => {
      expect(AzureProviderOptionsInputSchema.parse({ id })).toEqual({ id });
      expect(validateOptions({ id })).toBe(true);
    },
  );
  it.each([
    { id: 'azure:chat:deployment', config: { temperature: 'warm' } },
    { id: 'azure:chat:deployment', config: { max_output_tokens: 10 } },
    { id: 'azureopenai:embeddings:deployment', config: { temperature: 0 } },
    { id: 'azure:chat:' },
    { id: 'azure:chat' },
    { id: 'azure:responses:' },
    { id: 'azure:chatty:deployment' },
    { id: 'azure:foundry-agent:deployment' },
    { id: 'openai:chat:deployment' },
  ])('cannot escape through another API or an unrestricted fallback: %j', (input) => {
    expect(AzureProviderOptionsInputSchema.safeParse(input).success).toBe(false);
    expect(validateOptions(input)).toBe(false);
  });
  it('preserves deprecation metadata and typed options', () => {
    expect(AzureChatConfigInputJsonSchema.properties?.o1).toMatchObject({ deprecated: true });
    expectTypeOf<AzureChatConfigInput>().toEqualTypeOf<
      z.input<typeof AzureChatConfigInputSchema>
    >();
    expectTypeOf<AzureProviderOptionsInput>().not.toBeAny();
    expectTypeOf<AzureProviderOptions<AzureCompletionOptions>>().toEqualTypeOf<
      Pick<ProviderOptions<AzureCompletionOptions>, 'config' | 'id' | 'env'>
    >();
    expectTypeOf<{
      id: 'azure:chat:deployment';
      config: { temperature: string };
    }>().not.toExtend<AzureProviderOptionsInput>();
  });
});
