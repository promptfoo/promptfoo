import Ajv from 'ajv';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import {
  AnthropicCompletionConfigInputJsonSchema,
  AnthropicCompletionConfigInputSchema,
  AnthropicMessagesConfigInputJsonSchema,
  AnthropicMessagesConfigInputSchema,
  AnthropicProviderOptionsInputJsonSchema,
  AnthropicProviderOptionsInputSchema,
  AnthropicSharedConfigInputJsonSchema,
  AnthropicSharedConfigInputSchema,
} from '../../src/contracts';

import type {
  AnthropicMessagesConfigInput,
  AnthropicProviderOptionsInput,
  AnthropicSharedConfigInput,
} from '../../src/contracts';
import type { AnthropicBaseOptions } from '../../src/providers/anthropic/types';

const shared = {
  apiKey: '{{ env.KEY }}',
  apiBaseUrl: '{{ env.URL }}',
  apiKeyRequired: false,
  headers: { 'X-Custom': 'value' },
  cost: 1,
  inputCost: 2,
  outputCost: 3,
};
const commonInvalid: unknown[] = [
  null,
  [],
  'anthropic',
  { apiKey: 1 },
  { apiKeyRequired: 'false' },
  { headers: { Authorization: 1 } },
  { inputCost: '1' },
  { unknown: true },
  { model: 'ignored-model' },
];
const validMessages = [
  { max_tool_calls: 1 },
  { max_tool_calls: 8 },
  { tools: [{ type: 'web_search_20260209' }, { type: 'web_fetch_20260209' }] },
  { apiKeyEnvar: 'CUSTOM_ANTHROPIC_KEY' },
  { tools: [{ type: 'function', function: { name: 'ping' } }] },
  { tools: ['file://tools.json', 'file://other-tools.yaml'] },
  {},
  shared,
  {
    max_tokens: 0,
    temperature: 0,
    top_p: 0,
    top_k: 1,
    stop_sequences: ['end'],
    cache_control: { type: 'ephemeral', ttl: '1h' },
    effort: 'max',
    extra_body: { future_field: { keep: [1, true, null] } },
    metadata: { user_id: 'id' },
    service_tier: 'standard_only',
    stream: true,
    beta: ['future-beta'],
    showThinking: true,
    max_tool_calls: 0,
    mcp: { enabled: true, server: { command: 'node' } },
    output_format: {
      type: 'json_schema',
      schema: { type: 'object', $defs: { item: { type: 'string' } }, additionalProperties: false },
    },
  },
  { cache_control: null, metadata: { user_id: null }, output_format: 'file://format.json' },
  {
    output_format: { type: 'json_schema', schema: 'file://schema.json' },
    tools: 'file://tools.py:get_tools',
  },
  { thinking: { type: 'enabled', budget_tokens: 1024, display: 'summarized' } },
  { thinking: { type: 'adaptive', display: 'omitted' } },
  { thinking: { type: 'disabled' } },
  { thinking: { type: 'between_tools' } },
  {
    tools: [
      {
        name: 'lookup',
        input_schema: { type: 'object' },
        cache_control: { type: 'ephemeral' },
        strict: false,
        defer_loading: true,
        allowed_callers: ['direct'],
        input_examples: [{ query: 'test' }],
      },
    ],
    tool_choice: { type: 'tool', name: 'lookup', disable_parallel_tool_use: true },
  },
  {
    tools: [
      { type: 'web_fetch_20260318', name: 'web_fetch', future: { keep: true } },
      { type: 'memory_20250818', name: 'memory' },
    ],
    tool_choice: { type: 'any', disable_parallel_tool_use: false },
  },
  {
    tools: [
      {
        type: 'function',
        function: {
          name: 'lookup',
          description: 'lookup',
          parameters: { type: 'object' },
        },
      },
    ],
    tool_choice: { type: 'function', function: { name: 'lookup' } },
  },
  { tool_choice: 'auto' },
  { tool_choice: 'required' },
  { tool_choice: { type: 'none' } },
];
const invalidMessages: unknown[] = [
  { max_tool_calls: -1 },
  { max_tool_calls: 1.5 },
  { tools: [{ type: 'function', function: { name: 'lookup', strict: true } }] },
  { tools: [{ type: 'bash_20250124' }] },
  { apiKeyEnvar: 123 },
  { mcp: { server: { command: 'node' } } },
  {
    tools: [
      { name: 'native', input_schema: {} },
      { type: 'function', function: { name: 'ping' } },
    ],
  },
  {
    tools: [
      { type: 'function', function: { name: 'ping' } },
      { name: 'native', input_schema: {} },
    ],
  },
  { tools: [{ name: 'lookup', input_schema: {} }, 'file://tools.json'] },
  ...commonInvalid,
  { temperature: 'warm' },
  { max_tokens: '10' },
  { stop_sequences: [1] },
  { cache_control: { type: 'ephemeral', ttl: '2h' } },
  { effort: 'unknown' },
  { thinking: { type: 'enabled' } },
  { thinking: { type: 'enabled', budget_tokens: '1024' } },
  { thinking: { type: 'disabled', budget_tokens: 1024 } },
  { thinking: { type: 'unknown' } },
  { tools: [{ name: 'lookup' }] },
  { tools: [{ name: 123, input_schema: {} }] },
  { tools: [{ type: 'unknown', name: 'lookup' }] },
  { tools: ['tools.json'] },
  { tool_choice: { type: 'tool' } },
  { tool_choice: { type: 'auto', disable_parallel_tool_use: 'false' } },
  { output_format: { type: 'json_schema', schema: [] } },
  { output_format: { type: 'json_schema' } },
  { metadata: { user_id: 123 } },
  { extra_body: { callback: () => {} } },
  { mcp: { server: { url: 123 } } },
  { max_tokens_to_sample: 10 },
];

describe('Anthropic portable configuration contracts', () => {
  for (const { name, schema, jsonSchema, valid, invalid } of [
    {
      name: 'shared',
      schema: AnthropicSharedConfigInputSchema,
      jsonSchema: AnthropicSharedConfigInputJsonSchema,
      valid: [{}, shared],
      invalid: commonInvalid,
    },
    {
      name: 'messages',
      schema: AnthropicMessagesConfigInputSchema,
      jsonSchema: AnthropicMessagesConfigInputJsonSchema,
      valid: validMessages,
      invalid: invalidMessages,
    },
    {
      name: 'completion',
      schema: AnthropicCompletionConfigInputSchema,
      jsonSchema: AnthropicCompletionConfigInputJsonSchema,
      valid: [
        {},
        {
          apiKey: shared.apiKey,
          apiKeyEnvar: 'CUSTOM_KEY',
          apiBaseUrl: shared.apiBaseUrl,
          headers: shared.headers,
        },
        { max_tokens_to_sample: 10, temperature: 0 },
      ],
      invalid: [
        ...commonInvalid,
        { max_tokens_to_sample: '10' },
        { tools: [] },
        { mcp: {} },
        { apiKeyRequired: false },
        { cost: 1 },
        { inputCost: 1 },
        { outputCost: 1 },
        { top_p: 0.9 },
        { top_k: 1 },
      ],
    },
  ]) {
    describe(name, () => {
      const validateJson = new Ajv({ strict: true }).compile(jsonSchema);
      it.each(valid.map((input) => ({ input })))(
        'preserves serializable input in both contracts: %j',
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
      it('exports representable input without execution defaults', () => {
        expect(
          z.toJSONSchema(schema, { target: 'draft-07', io: 'input', unrepresentable: 'throw' }),
        ).toEqual(jsonSchema);
        expect(schema.parse({})).toEqual({});
      });
    });
  }
  const validateOptions = new Ajv({ strict: true }).compile(
    AnthropicProviderOptionsInputJsonSchema,
  );
  it.each(['anthropic:messages:model', 'anthropic:completion:model'])(
    'accepts %s without resolving credentials',
    (id) => {
      expect(AnthropicProviderOptionsInputSchema.parse({ id })).toEqual({ id });
      expect(validateOptions({ id })).toBe(true);
    },
  );
  it.each([
    { id: 'anthropic:messages:model', config: { max_tokens: '10' } },
    { id: 'anthropic:completion:model', config: { max_tokens: 10 } },
    { id: 'anthropic:messages:' },
    { id: 'anthropic:messages' },
    { id: 'anthropic:claude-agent-sdk' },
    { id: 'anthropic:claude-model' },
    { id: 'openai:chat:model' },
  ])('cannot fall back to an unrelated provider contract: %j', (input) => {
    expect(AnthropicProviderOptionsInputSchema.safeParse(input).success).toBe(false);
    expect(validateOptions(input)).toBe(false);
  });
  it('retains useful exported TypeScript config types', () => {
    expectTypeOf<AnthropicSharedConfigInput>().toEqualTypeOf<AnthropicBaseOptions>();
    expectTypeOf<AnthropicMessagesConfigInput>().toEqualTypeOf<
      z.input<typeof AnthropicMessagesConfigInputSchema>
    >();
    expectTypeOf<AnthropicProviderOptionsInput>().not.toBeAny();
    expectTypeOf<{
      id: 'anthropic:messages:model';
      config: { max_tokens: string };
    }>().not.toExtend<AnthropicProviderOptionsInput>();
  });
});

describe('nested MCP client contract', () => {
  const validate = new Ajv({ strict: false }).compile(AnthropicMessagesConfigInputJsonSchema);
  it.each(['defaultArgs', 'transformResponse', 'responseParser', 'serverName'])(
    'rejects standalone %s inside model MCP settings',
    (field) => {
      const config = {
        mcp: {
          enabled: true,
          server: { command: 'fixture' },
          [field]: field === 'defaultArgs' ? { session: 'ignored' } : 'ignored',
        },
      };
      expect(AnthropicMessagesConfigInputSchema.safeParse(config).success).toBe(false);
      expect(validate(config)).toBe(false);
    },
  );
  it('accepts supported connection, timeout and tool-filter settings', () => {
    const config = {
      mcp: {
        enabled: true,
        server: { command: 'fixture' },
        timeout: 0,
        tools: ['lookup'],
        exclude_tools: ['delete'],
      },
    };
    expect(AnthropicMessagesConfigInputSchema.parse(config)).toEqual(config);
    expect(validate(config)).toBe(true);
  });
});

it('rejects model overrides in portable config types as well as validation', () => {
  // @ts-expect-error Model selection belongs in the provider ID, not portable config.
  const config: AnthropicMessagesConfigInput = { model: 'ignored-model' };
  expect(AnthropicMessagesConfigInputSchema.safeParse(config).success).toBe(false);
  expectTypeOf<'model'>().not.toExtend<keyof AnthropicMessagesConfigInput>();
});
