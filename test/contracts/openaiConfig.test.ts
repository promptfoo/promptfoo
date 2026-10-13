import Ajv from 'ajv';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { z } from 'zod';
import {
  OpenAiChatConfigInputJsonSchema,
  OpenAiChatConfigInputSchema,
  OpenAiCompletionConfigInputJsonSchema,
  OpenAiCompletionConfigInputSchema,
  OpenAiEmbeddingConfigInputJsonSchema,
  OpenAiEmbeddingConfigInputSchema,
  OpenAiProviderOptionsInputJsonSchema,
  OpenAiProviderOptionsInputSchema,
  OpenAiResponsesConfigInputJsonSchema,
  OpenAiResponsesConfigInputSchema,
  OpenAiSharedConfigInputJsonSchema,
  OpenAiSharedConfigInputSchema,
} from '../../src/contracts';
import { ProviderOptionsSchema } from '../../src/validators/providers';

import type {
  OpenAiChatConfigInput,
  OpenAiProviderOptionsInput,
  OpenAiResponsesConfigInput,
  OpenAiSharedConfigInput,
} from '../../src/contracts';
import type { OpenAiSharedOptions } from '../../src/providers/openai/types';
import type { ProviderOptions } from '../../src/types/providers';

const schemaDocument = {
  type: 'object',
  properties: { result: { type: 'string' } },
  $defs: { item: { type: 'string' } },
  additionalProperties: false,
};
const functionDefinition = { name: 'lookup', parameters: schemaDocument, strict: false };
const nestedFormat = {
  type: 'json_schema',
  json_schema: { name: 'result', schema: schemaDocument, strict: false },
};
const baseValid = [
  {},
  {
    apiKey: '{{ env.OPENAI_API_KEY }}',
    apiKeyEnvar: 'CUSTOM_KEY',
    apiKeyRequired: false,
    useDefaultApiKey: false,
    apiHost: '{{ env.HOST }}',
    apiBaseUrl: '{{ env.URL }}',
    organization: 'org',
    headers: { 'X-Custom': '{{ env.VALUE }}' },
    maxRetries: -1,
    cost: 0,
    inputCost: 1,
    outputCost: 2,
    audioCost: 3,
    audioInputCost: 4,
    audioOutputCost: 5,
  },
];
const chatValid = [
  ...baseValid,
  {
    model: 'custom-model',
    temperature: 0,
    max_tokens: 0,
    max_completion_tokens: 10,
    top_p: 0,
    frequency_penalty: 0,
    presence_penalty: 0,
    best_of: 1,
    stop: ['end'],
    seed: 0,
    service_tier: null,
    omitDefaults: true,
    passthrough: { future_field: { nested: [1, true, null] } },
  },
  {
    functions: [functionDefinition],
    function_call: { name: 'lookup' },
    tools: [{ type: 'function', function: functionDefinition }],
    tool_choice: { type: 'function', function: { name: 'lookup' } },
    tool_resources: { file_search: { vector_store_ids: ['id'] } },
  },
  {
    functions: 'file://functions.json',
    tools: ['file://tools.yaml', { type: 'function', function: { name: 'no_args' } }],
    response_format: 'file://formats/{{ name }}.json',
    functionToolCallbacks: { lookup: 'file://callback.js', other: 'return args;' },
  },
  { tools: 'file://tools.py:get_tools', response_format: nestedFormat },
  {
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'result', schema: 'file://schema.json' },
    },
  },
  { response_format: { type: 'text' } },
  { response_format: { type: 'json_object' } },
  {
    tools: [
      { type: 'code_interpreter', container: { type: 'auto', file_ids: ['id'] } },
      { type: 'file_search', vector_store_ids: ['id'], max_num_results: 5 },
      { type: 'custom', name: 'new_tool', format: { type: 'text' } },
    ],
    tool_choice: { type: 'function', name: 'lookup' },
    stop: 'end',
  },
  {
    reasoning: { effort: 'max', context: 'all_turns', summary: 'detailed', mode: 'pro' },
    reasoning_effort: '{{ effort }}',
    verbosity: 'high',
    showThinking: true,
  },
  { reasoning: { effort: null, context: null, summary: null, mode: null }, reasoning_effort: null },
  {
    prompt_cache_key: 'cache',
    prompt_cache_retention: '24h',
    prompt_cache_options: { mode: 'explicit', ttl: '30m' },
    safety_identifier: 'user',
    user: 'user',
    metadata: { key: 'value' },
    store: false,
    modalities: ['audio'],
    audio: { format: 'wav', voice: 'alloy', speed: 1, bitrate: '64k' },
  },
  {
    mcp: {
      servers: [
        { command: 'node', args: ['./server.js'] },
        { url: '{{ env.MCP_URL }}', auth: { type: 'bearer', token: '{{ env.TOKEN }}' } },
      ],
    },
  },
];
const responseValid = [
  ...chatValid,
  {
    max_output_tokens: 0,
    max_tool_calls: 4,
    instructions: '{{ instructions }}',
    previous_response_id: 'resp_1',
    include: ['future.response.field'],
    parallel_tool_calls: false,
    stream: false,
    truncation: 'disabled',
    background: false,
    webhook_url: '{{ env.WEBHOOK }}',
    access_programs: { cyber: 'standard' },
  },
  {
    include: null,
    response_format: { type: 'json_schema', name: 'result', schema: true, strict: false },
  },
  {
    tools: [
      { type: 'function', ...functionDefinition },
      {
        type: 'mcp',
        server_label: 'remote',
        server_url: 'https://example.test',
        allowed_tools: ['lookup'],
        require_approval: 'never',
      },
      { type: 'web_search', external_web_access: false, future: { keep: true } },
    ],
    tool_choice: {
      type: 'allowed_tools',
      mode: 'auto',
      tools: [{ type: 'function', name: 'lookup' }],
    },
  },
  {
    tools: [
      {
        type: 'mcp',
        server_label: 'remote',
        server_url: '{{ env.URL }}',
        authorization: '{{ env.TOKEN }}',
        server_description: 'tools',
        headers: { 'X-Custom': 'value' },
        allowed_tools: { read_only: true, tool_names: ['lookup'] },
        require_approval: { always: { tool_names: ['delete'] }, never: { tool_names: ['lookup'] } },
      },
    ],
    tool_choice: { type: 'mcp', server_label: 'remote', name: 'lookup' },
  },
];
const invalidShared = [
  null,
  [],
  'openai',
  { apiKey: 1 },
  { apiKeyRequired: 'false' },
  { headers: { Authorization: 123 } },
  { maxRetries: '4' },
  { inputCost: '1' },
  { unknown: true },
];
const invalidChat = [
  ...invalidShared,
  { temperature: 'warm' },
  { temperature: Infinity },
  { max_tokens: '100' },
  { stop: [1] },
  { model: 123 },
  { passthrough: { callback: () => {} } },
  { passthrough: [] },
  { tools: [{ type: 'function', function: { name: 1 } }] },
  { tools: [{ type: 'function' }] },
  { tools: [{ type: 'web_search', external_web_access: 'false' }] },
  { tools: [{ type: 'file_search', vector_store_ids: [123] }] },
  { tools: [{ type: 'code_interpreter', container: 123 }] },
  { tools: [{ type: 'mcp', server_label: 'remote' }] },
  { tool_choice: { type: 'function' } },
  { tools: [{ type: 'unknown', name: 'lookup' }] },
  { tools: ['tools.json'] },
  { tools: [{ type: 'mcp', server_label: 'remote', server_url: 123 }] },
  { functionToolCallbacks: { lookup: () => 'result' } },
  {
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'result', schema: schemaDocument, strict: 'false' },
    },
  },
  { response_format: { type: 'json_schema', json_schema: { name: 'result' } } },
  { response_format: { type: 'json_schema', schema: schemaDocument } },
  { reasoning_effort: 'unknown' },
  { reasoning: { effort: 'unknown' } },
  { prompt_cache_options: { ttl: '1h' } },
  { metadata: { key: 1 } },
  { store: 0 },
  { mcp: { server: { url: 123 } } },
  { max_output_tokens: 20 },
];

describe('OpenAI portable configuration contracts', () => {
  for (const { name, schema, jsonSchema, valid, invalid } of [
    {
      name: 'shared',
      schema: OpenAiSharedConfigInputSchema,
      jsonSchema: OpenAiSharedConfigInputJsonSchema,
      valid: baseValid,
      invalid: invalidShared,
    },
    {
      name: 'chat',
      schema: OpenAiChatConfigInputSchema,
      jsonSchema: OpenAiChatConfigInputJsonSchema,
      valid: chatValid,
      invalid: invalidChat,
    },
    {
      name: 'responses',
      schema: OpenAiResponsesConfigInputSchema,
      jsonSchema: OpenAiResponsesConfigInputJsonSchema,
      valid: responseValid,
      invalid: [
        ...invalidChat.filter(
          (value) =>
            !('max_output_tokens' in Object(value)) &&
            !(
              typeof value === 'object' &&
              value !== null &&
              'response_format' in value &&
              'schema' in Object(value.response_format)
            ),
        ),
        { max_output_tokens: '20' },
        { include: [123] },
        { access_programs: { cyber: 'unknown' } },
      ],
    },
    {
      name: 'completion',
      schema: OpenAiCompletionConfigInputSchema,
      jsonSchema: OpenAiCompletionConfigInputJsonSchema,
      valid: [...baseValid, { max_tokens: 10, stop: 'end', passthrough: { suffix: 'tail' } }],
      invalid: [...invalidShared, { temperature: 'warm' }, { tools: [] }],
    },
    {
      name: 'embeddings',
      schema: OpenAiEmbeddingConfigInputSchema,
      jsonSchema: OpenAiEmbeddingConfigInputJsonSchema,
      valid: [
        ...baseValid,
        { model: 'custom', passthrough: { dimensions: 256, encoding_format: 'float' } },
      ],
      invalid: [...invalidShared, { dimensions: 256 }, { temperature: 0 }],
    },
  ]) {
    describe(name, () => {
      const validateJson = new Ajv({ strict: true }).compile(jsonSchema);
      it.each(valid.map((input) => ({ input })))(
        'accepts and preserves authoring input in Zod and JSON Schema: %j',
        ({ input }) => {
          expect(schema.parse(input)).toEqual(input);
          expect(validateJson(input), JSON.stringify(validateJson.errors)).toBe(true);
        },
      );
      it.each(invalid.map((input) => ({ input })))(
        'rejects malformed owned fields in Zod and JSON Schema: %j',
        ({ input }) => {
          expect(schema.safeParse(input).success).toBe(false);
          expect(validateJson(input)).toBe(false);
        },
      );
      it('exports JSON Schema without unrepresentable fallback or runtime defaults', () => {
        expect(
          z.toJSONSchema(schema, {
            target: 'draft-07',
            io: 'input',
            unrepresentable: 'throw',
          }),
        ).toEqual(jsonSchema);
        expect(schema.parse({})).toEqual({});
      });
    });
  }

  const validateOptions = new Ajv({ strict: true }).compile(OpenAiProviderOptionsInputJsonSchema);
  it.each([
    'openai:chat',
    'openai:chat:model',
    'openai:completion',
    'openai:completion:model',
    'openai:responses',
    'openai:responses:model',
    'openai:embedding',
    'openai:embedding:model',
    'openai:embeddings',
    'openai:embeddings:model',
  ])('accepts the explicit route %s without requiring credentials', (id) => {
    expect(OpenAiProviderOptionsInputSchema.parse({ id })).toEqual({ id });
    expect(validateOptions({ id })).toBe(true);
  });
  it('preserves provider metadata and input definitions', () => {
    const input = {
      id: 'openai:chat:model',
      label: 'target',
      prompts: ['greeting'],
      transform: 'output.trim()',
      delay: 10,
      env: { OPENAI_API_KEY: '{{ TOKEN }}', CUSTOM_KEY: 'value' },
      inputs: { text: 'user prompt' },
      config: { temperature: 0 },
    };
    expect(OpenAiProviderOptionsInputSchema.parse(input)).toEqual(input);
    expect(validateOptions(input), JSON.stringify(validateOptions.errors)).toBe(true);
  });
  it.each([
    { report: { type: 'pdf', description: 'report', config: { injectionPlacements: ['body'] } } },
    {
      document: { type: 'docx', description: 'doc', config: { injectionPlacements: ['comment'] } },
    },
    {
      image: {
        type: 'image',
        description: 'image',
        config: { benign: true, inputPurpose: 'receipt' },
      },
    },
    { text: { description: 'text', config: { injectionPlacements: ['custom'] } } },
  ])('preserves typed input definitions in Zod and JSON Schema: %j', (inputs) => {
    const input = { id: 'openai:chat:model', inputs };
    expect(OpenAiProviderOptionsInputSchema.parse(input)).toEqual(input);
    expect(validateOptions(input)).toBe(true);
  });
  it.each([
    { id: 'openai:chat:model', config: { temperature: 'warm' } },
    { id: 'openai:chat:model', config: { max_output_tokens: 10 } },
    { id: 'openai:embedding:model', config: { temperature: 0 } },
    { id: 'openai:responses:model', config: { max_output_tokens: '10' } },
    { id: 'openai:chatty:model', config: {} },
    { id: 'openai:model', config: {} },
    { id: 'azure:chat:model', config: {} },
    {
      id: 'openai:chat:model',
      inputs: {
        report: {
          type: 'pdf',
          description: 'report',
          config: { injectionPlacements: ['comment'] },
        },
      },
    },
    { id: 'openai:chat:model', inputs: { 'invalid-name': 'prompt' } },
    { id: 1 },
    { config: {} },
  ])('does not allow a malformed config to escape into another route: %j', (input) => {
    expect(OpenAiProviderOptionsInputSchema.safeParse(input).success).toBe(false);
    expect(validateOptions(input)).toBe(false);
  });
  it('keeps legacy runtime options compatible with functions and extensions', () => {
    const callback = vi.fn();
    const config = { functionToolCallbacks: { lookup: callback }, basePath: '/tmp', custom: true };
    expect(ProviderOptionsSchema.parse({ id: 'openai:chat:model', config }).config).toBe(config);
    expect(OpenAiChatConfigInputSchema.safeParse(config).success).toBe(false);
    expect(callback).not.toHaveBeenCalled();
  });
  it('keeps config inference and the generic provider options typed', () => {
    expectTypeOf<OpenAiSharedConfigInput>().toEqualTypeOf<OpenAiSharedOptions>();
    expectTypeOf<OpenAiChatConfigInput>().toEqualTypeOf<
      z.input<typeof OpenAiChatConfigInputSchema>
    >();
    expectTypeOf<OpenAiResponsesConfigInput>().toEqualTypeOf<
      z.input<typeof OpenAiResponsesConfigInputSchema>
    >();
    expectTypeOf<OpenAiProviderOptionsInput>().not.toBeAny();
    expectTypeOf<
      NonNullable<ProviderOptions<OpenAiChatConfigInput>['config']>
    >().toEqualTypeOf<OpenAiChatConfigInput>();
    expectTypeOf<{
      id: 'openai:chat:model';
      config: { temperature: string };
    }>().not.toExtend<OpenAiProviderOptionsInput>();
    // @ts-expect-error Known config fields must retain their types.
    const invalid: ProviderOptions<OpenAiChatConfigInput> = { config: { temperature: 'warm' } };
    expect(invalid.config?.temperature).toBe('warm');
  });
});
