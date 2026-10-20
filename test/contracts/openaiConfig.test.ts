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
import {
  InputDefinitionObjectSchema,
  InputsInputSchema,
  InputsSchema,
} from '../../src/contracts/shared';
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
  { mcp: { enabled: false } },
  {
    tools: [{ type: 'custom', custom: { name: 'grammar', format: { type: 'text' } } }],
    tool_choice: { type: 'custom', custom: { name: 'grammar' } },
  },
  ...baseValid,
  {
    model: 'custom-model',
    temperature: 0,
    max_tokens: 0,
    max_completion_tokens: 10,
    top_p: 0,
    frequency_penalty: 0,
    presence_penalty: 0,
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
    tools: ['file://tools.yaml', 'file://other-tools.json'],
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
      enabled: true,
      servers: [
        { command: 'node', args: ['./server.js'] },
        { url: '{{ env.MCP_URL }}', auth: { type: 'bearer', token: '{{ env.TOKEN }}' } },
      ],
    },
  },
];
const responseValid = [
  { tools: [{ type: 'web_search_2025_08_26' }, { type: 'web_search_preview_2025_03_11' }] },
  {
    tools: [
      {
        type: 'mcp',
        server_label: 'remote',
        tunnel_id: 'tunnel',
        allowed_callers: ['programmatic'],
        require_approval: { never: { read_only: true } },
      },
    ],
  },
  { tools: [{ type: 'programmatic_tool_calling' }] },
  {
    tools: [
      { type: 'code_interpreter', container: { type: 'auto', file_ids: ['id'] } },
      { type: 'file_search', vector_store_ids: ['id'], max_num_results: 5 },
      { type: 'custom', name: 'new_tool', format: { type: 'text' } },
    ],
    tool_choice: { type: 'function', name: 'lookup' },
  },

  {
    tools: [
      {
        type: 'function',
        name: 'no_args',
        parameters: null,
        strict: null,
        description: null,
        output_schema: { type: 'object' },
      },
    ],
  },
  {
    tools: [
      {
        type: 'function',
        name: 'lookup',
        defer_loading: true,
        async: false,
        allowed_callers: ['direct'],
        parameters: { type: 'object' },
      },
    ],
    tool_choice: { type: 'custom', name: 'lookup', future: { keep: true } },
  },
  ...baseValid,
  {
    model: 'custom-model',
    temperature: 0,
    max_output_tokens: 16,
    top_p: 0,
    service_tier: 'scale',
    omitDefaults: true,
    passthrough: { future_field: { keep: true } },
  },
  {
    response_format: {
      ...nestedFormat,
      json_schema: { ...nestedFormat.json_schema, strict: true },
    },
    tools: 'file://tools.yaml',
  },
  {
    reasoning: {
      effort: '{{ effort }}',
      summary: '{{ summary }}',
      context: '{{ context }}',
      mode: '{{ mode }}',
    },
  },
  {
    tools: [
      {
        type: 'namespace',
        name: 'crm',
        description: 'CRM tools',
        tools: [{ type: 'function', name: 'lookup', parameters: { type: 'object' } }],
      },
      { type: 'tool_search', execution: 'client', parameters: { type: 'object' } },
      { type: 'custom', name: 'command', format: { type: 'text' } },
    ],
  },
  {
    max_output_tokens: 16,
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
    response_format: { type: 'json_schema', name: 'result', schema: schemaDocument, strict: true },
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
const invalidCommon = [
  { tools: [{ type: 'function', function: { name: 'lookup' } }, 'file://tools.yaml'] },
  { tool_choice: { type: 'mcp', server_label: 123 } },
  { tool_choice: { type: 'allowed_tools', mode: 7, tools: [] } },
  {
    tool_choice: { type: 'allowed_tools', mode: 'auto', tools: [{ type: 'function', name: 123 }] },
  },
  { tools: [{ type: 'custom' }] },
  { tools: [{ type: 'namespace', name: 'crm', tools: [] }] },
  { tools: [{ type: 'tool_search', execution: 'invalid' }] },
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
  { reasoning_effort: 'unknown' },
  { reasoning: { effort: 'unknown' } },
  { prompt_cache_options: { ttl: '1h' } },
  { metadata: { key: 1 } },
  { store: 0 },
  { mcp: { server: { url: 123 } } },
  { mcp: { server: { command: 'node' } } },
  { response_format: { type: 'json_schema', json_schema: { name: 'result', schema: true } } },
];

const invalidChat = [
  { best_of: 1 },
  ...invalidCommon,
  { tools: [{ type: 'function', name: 'lookup' }] },
  { tool_choice: { type: 'function', name: 'lookup' } },
  { response_format: { type: 'json_schema', schema: schemaDocument } },
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
        ...invalidCommon,
        { max_output_tokens: '20' },
        { include: [123] },
        { access_programs: { cyber: 'unknown' } },
        { max_tokens: 32 },
        { max_completion_tokens: 32 },
        { mcp: { enabled: true, server: { command: 'node' } } },
        { functionToolCallbacks: { lookup: 'file://callback.js' } },
        { seed: 1 },
        { showThinking: true },
        {
          response_format: { type: 'json_schema', schema: schemaDocument, description: 'ignored' },
        },
        { tools: [{ type: 'code_interpreter' }] },
        { tools: [{ type: 'code_interpreter', container: {} }] },
        { tools: [{ type: 'mcp', server_label: 'remote', tunnel_id: 123 }] },
        ...[0, 15, 16.5].map((max_output_tokens) => ({ max_output_tokens })),
        { response_format: { type: 'json_schema', schema: true } },
        {
          response_format: {
            type: 'json_schema',
            name: 'result',
            schema: schemaDocument,
            strict: false,
          },
        },
        { response_format: nestedFormat },
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
    expectTypeOf<{ reasoning: { effort: 'unknown' } }>().not.toExtend<OpenAiChatConfigInput>();
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

describe('shared input definitions', () => {
  it('preserves input-type and placement relationships in inferred authoring types', () => {
    type PortableInputs = z.input<typeof InputsInputSchema>;
    const valid: PortableInputs = {
      prompt: {
        description: 'question',
        type: 'docx',
        config: { injectionPlacements: ['comment'] },
      },
    };
    expect(InputsInputSchema.parse(valid)).toEqual(valid);
    const invalid = {
      prompt: {
        description: 'question',
        type: 'pdf',
        config: { injectionPlacements: ['comment'] },
      },
    };
    expectTypeOf<{
      prompt: { description: string; type: 'pdf'; config: { injectionPlacements: ['comment'] } };
    }>().not.toExtend<PortableInputs>();
    expect(InputsInputSchema.safeParse(invalid).success).toBe(false);
  });

  const validate = new Ajv({ strict: false }).compile(
    z.toJSONSchema(InputsInputSchema, {
      target: 'draft-07',
      io: 'input',
      unrepresentable: 'throw',
    }),
  );
  it.each([
    { prompt: 'question' },
    { prompt: { description: 'question' } },
    ...['text', 'pdf', 'image', 'docx'].map((type) => ({
      prompt: {
        type,
        description: 'question',
        config: { injectionPlacements: ['body'], benign: true, inputPurpose: 'summarize' },
      },
    })),
    {
      prompt: {
        type: 'text',
        description: 'question',
        config: { injectionPlacements: ['anything'] },
      },
    },
    {
      prompt: {
        type: 'docx',
        description: 'question',
        config: { injectionPlacements: ['comment', 'footnote'] },
      },
    },
  ])('accepts canonical inputs in both contracts: %j', (input) => {
    expect(InputsSchema.safeParse(input).success).toBe(true);
    expect(InputsInputSchema.parse(input)).toEqual(input);
    expect(validate(input)).toBe(true);
  });
  it.each([
    { 'invalid-name': 'question' },
    { prompt: '' },
    { prompt: { description: '' } },
    { prompt: { type: 'audio', description: 'question' } },
    { prompt: { description: 'question', config: { inputPurpose: '' } } },
    { prompt: { description: 'question', config: { injectionPlacements: [] } } },
    {
      prompt: {
        type: 'image',
        description: 'question',
        config: { injectionPlacements: ['comment'] },
      },
    },
    {
      prompt: {
        type: 'pdf',
        description: 'question',
        config: { injectionPlacements: ['footnote'] },
      },
    },
    {
      prompt: {
        type: 'docx',
        description: 'question',
        config: { injectionPlacements: ['unknown'] },
      },
    },
  ])('rejects invalid canonical inputs in both contracts: %j', (input) => {
    expect(InputsSchema.safeParse(input).success).toBe(false);
    expect(InputsInputSchema.safeParse(input).success).toBe(false);
    expect(validate(input)).toBe(false);
  });
  it('preserves runtime unknown-key stripping and placement diagnostics', () => {
    const input = { description: 'question', extra: true, config: { benign: true, extra: true } };
    expect(InputDefinitionObjectSchema.parse(input)).toEqual({
      description: 'question',
      config: { benign: true },
    });
    expect(InputsInputSchema.safeParse({ prompt: input }).success).toBe(false);
    const result = InputDefinitionObjectSchema.safeParse({
      description: 'question',
      type: 'pdf',
      config: { injectionPlacements: ['comment'] },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual([
        expect.objectContaining({
          code: 'custom',
          path: ['config', 'injectionPlacements'],
          message:
            'Invalid PDF injection placements: comment. Expected one of: body, header, footer',
        }),
      ]);
    }
  });
});

describe('OpenAI local and provider-hosted MCP contracts', () => {
  const chatJson = new Ajv({ strict: false }).compile(OpenAiChatConfigInputJsonSchema);
  const responsesJson = new Ajv({ strict: false }).compile(OpenAiResponsesConfigInputJsonSchema);
  it.each(['defaultArgs', 'transformResponse', 'responseParser', 'serverName'])(
    'rejects standalone %s in nested Chat client config',
    (field) => {
      const input = {
        mcp: {
          enabled: true,
          server: { command: 'fixture' },
          [field]: field === 'defaultArgs' ? { session: 'ignored' } : 'ignored',
        },
      };
      expect(OpenAiChatConfigInputSchema.safeParse(input).success).toBe(false);
      expect(chatJson(input)).toBe(false);
    },
  );
  it('keeps local MCP client setup distinct from Responses hosted tool definitions', () => {
    const local = { mcp: { enabled: true, server: { command: 'fixture' }, tools: ['lookup'] } };
    const hosted = {
      tools: [
        {
          type: 'mcp',
          server_label: 'fixture',
          server_url: 'https://mcp.example.test',
          require_approval: 'never',
        },
      ],
    };
    expect(OpenAiChatConfigInputSchema.parse(local)).toEqual(local);
    expect(chatJson(local)).toBe(true);
    expect(OpenAiResponsesConfigInputSchema.safeParse(local).success).toBe(false);
    expect(responsesJson(local)).toBe(false);
    expect(OpenAiResponsesConfigInputSchema.parse(hosted)).toEqual(hosted);
    expect(responsesJson(hosted)).toBe(true);
    expect(OpenAiChatConfigInputSchema.safeParse(hosted).success).toBe(false);
    expect(chatJson(hosted)).toBe(false);
  });
});

describe('hosted MCP portable compatibility', () => {
  const validate = new Ajv({ strict: false }).compile(OpenAiResponsesConfigInputJsonSchema);
  const base = { type: 'mcp', server_label: 'fixture' };

  it.each([
    { server_url: 'https://fixture.example.test/mcp' },
    { connector_id: 'connector_googledrive' },
    { tunnel_id: 'tunnel_fixture' },
  ])('preserves deferred tools and explicit nulls with selector %j', (selector) => {
    for (const defer_loading of [true, false]) {
      const config = {
        tools: [
          {
            ...base,
            ...selector,
            defer_loading,
            allowed_tools: null,
            headers: null,
            require_approval: null,
          },
        ],
      };
      expect(OpenAiResponsesConfigInputSchema.parse(config)).toEqual(config);
      expect(validate(config)).toBe(true);
    }
    const omitted = { tools: [{ ...base, ...selector }] };
    expect(OpenAiResponsesConfigInputSchema.parse(omitted)).toEqual(omitted);
    expect(validate(omitted)).toBe(true);
  });

  it.each([
    { defer_loading: 'true' },
    { allowed_tools: 1 },
    { headers: { Authorization: 123 } },
    { require_approval: 'sometimes' },
    { future_field: true },
  ])('rejects malformed or unknown typed fields: %j', (fields) => {
    const config = {
      tools: [{ ...base, server_url: 'https://fixture.example.test/mcp', ...fields }],
    };
    expect(OpenAiResponsesConfigInputSchema.safeParse(config).success).toBe(false);
    expect(validate(config)).toBe(false);
  });

  it('requires a connection selector and preserves explicit passthrough extensions', () => {
    expect(OpenAiResponsesConfigInputSchema.safeParse({ tools: [base] }).success).toBe(false);
    expect(validate({ tools: [base] })).toBe(false);
    const config = {
      passthrough: {
        tools: [
          {
            ...base,
            server_url: 'https://fixture.example.test/mcp',
            future_field: { nested: true },
          },
        ],
      },
    };
    expect(OpenAiResponsesConfigInputSchema.parse(config)).toEqual(config);
    expect(validate(config)).toBe(true);
  });
});

it('preserves nullable Chat response-format strictness in both portable schemas', () => {
  const config = {
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'result',
        schema: schemaDocument,
        strict: null,
      },
    },
  };
  expect(OpenAiChatConfigInputSchema.parse(config)).toEqual(config);
  const validate = new Ajv({ strict: false }).compile(OpenAiChatConfigInputJsonSchema);
  expect(validate(config)).toBe(true);
  const invalid = {
    response_format: {
      ...config.response_format,
      json_schema: { ...config.response_format.json_schema, strict: 'false' },
    },
  };
  expect(OpenAiChatConfigInputSchema.safeParse(invalid).success).toBe(false);
  expect(validate(invalid)).toBe(false);
});
