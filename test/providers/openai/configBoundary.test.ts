import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import {
  OpenAiChatConfigInputSchema,
  OpenAiResponsesConfigInputSchema,
} from '../../../src/contracts/providerConfig/openai';
import { InvalidToolCallError } from '../../../src/contracts/providers';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';
import { OpenAiResponsesProvider } from '../../../src/providers/openai/responses';
import { validateFunctionCall } from '../../../src/providers/openai/util';
import { providerRegistry } from '../../../src/providers/providerRegistry';
import { InvalidToolSchemaError } from '../../../src/providers/toolSchemaError';
import { mockProcessEnv } from '../../util/utils';
import { createMockFetchResponse } from '../mockProviderResponses';
import type OpenAI from 'openai';

import type { CallApiContextParams } from '../../../src/types/providers';

vi.mock('../../../src/cache', async (original) => ({
  ...(await original<typeof import('../../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));
let directory: string;
let restoreEnvironment: () => void;
beforeEach(() => {
  restoreEnvironment = mockProcessEnv({ CONSTRUCTOR_TEMPLATE_SECRET: 'fixture-sensitive-value' });
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'openai-config-boundary-'));
  vi.mocked(fetchWithCache).mockReset();
});
afterEach(async () => {
  await providerRegistry.shutdownAll();
  restoreEnvironment();
  vi.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});
function fixture(name: string, value: unknown) {
  const file = path.join(directory, name);
  fs.writeFileSync(file, JSON.stringify(value));
  return `file://${file}` as const;
}
function context(vars: CallApiContextParams['vars'], config = {}): CallApiContextParams {
  return { vars, prompt: { raw: 'fixture', label: 'fixture', config } };
}
function chatResponse(content: string) {
  return createMockFetchResponse({
    choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  });
}

describe('portable config enters real OpenAI constructors', () => {
  it('accepts complete parsed Chat config types, including functions without parameters', async () => {
    const config = OpenAiChatConfigInputSchema.parse({
      apiKey: 'fixture-key',
      temperature: 0,
      functions: [{ name: 'ping' }],
      tools: [{ type: 'function', function: { name: 'ping' } }],
    });
    // The entire parse result must fit, rather than a hand-picked compatible subset.
    const provider = new OpenAiChatCompletionProvider('gpt-4.1', { config });
    const { body } = await provider.getOpenAiBody('fixture');
    expect(body.functions).toEqual([{ name: 'ping' }]);
    expect(body.tools).toEqual([{ type: 'function', function: { name: 'ping' } }]);
    provider.validateFunctionToolCall({ name: 'ping', arguments: '{}' });
    expect(() => provider.validateFunctionToolCall({ name: 'ping', arguments: '{"x":1}' })).toThrow(
      InvalidToolCallError,
    );
  });
  it('accepts parsed Responses config and preserves native hosted and flat function tools', async () => {
    const nativeTools = [
      {
        type: 'mcp',
        server_label: 'fixture',
        server_url: 'https://fixture.example.test/mcp',
        require_approval: 'never',
      },
      { type: 'function', name: 'ping', parameters: null, strict: null },
      { type: 'code_interpreter', container: { type: 'auto', memory_limit: '4g' } },
    ] satisfies OpenAI.Responses.Tool[];
    const config = OpenAiResponsesConfigInputSchema.parse({
      apiKey: 'fixture-key',
      tools: nativeTools,
    });
    const provider = new OpenAiResponsesProvider('gpt-4.1', { config });
    const { body } = await provider.getOpenAiBody('fixture');
    expect(body.tools).toEqual(nativeTools);
  });
  it.each(['chat', 'responses'] as const)(
    'loads %s tool files after prompt overrides and renders each test separately',
    async (endpoint) => {
      const reference = fixture('tools.json', [
        { type: 'function', function: { name: '{{ toolName }}' } },
      ]);
      const config = { apiKey: 'fixture-key', tools: 'file://missing-provider-tools.json' };
      const provider =
        endpoint === 'chat'
          ? new OpenAiChatCompletionProvider('gpt-4.1', {
              config: OpenAiChatConfigInputSchema.parse(config),
            })
          : new OpenAiResponsesProvider('gpt-4.1', {
              config: OpenAiResponsesConfigInputSchema.parse(config),
            });
      for (const toolName of ['first', 'second']) {
        const { body } = await provider.getOpenAiBody(
          'fixture',
          context({ toolName }, { tools: reference }),
        );
        expect(body.tools).toEqual(
          endpoint === 'chat'
            ? [{ type: 'function', function: { name: toolName } }]
            : [{ type: 'function', name: toolName }],
        );
      }
      expect(provider.config.tools).toBe('file://missing-provider-tools.json');
    },
  );
  it.each(['chat', 'responses'] as const)(
    'awaits %s executable tool loaders and renders their results',
    async (endpoint) => {
      const file = path.join(directory, 'tools.cjs');
      fs.writeFileSync(
        file,
        'exports.getTools = async () => [{ type: "function", function: { name: "{{ toolName }}" } }];',
      );
      const config = { apiKey: 'fixture-key', tools: `file://${file}:getTools` };
      const provider =
        endpoint === 'chat'
          ? new OpenAiChatCompletionProvider('gpt-4.1', {
              config: OpenAiChatConfigInputSchema.parse(config),
            })
          : new OpenAiResponsesProvider('gpt-4.1', {
              config: OpenAiResponsesConfigInputSchema.parse(config),
            });
      const { body } = await provider.getOpenAiBody('fixture', context({ toolName: 'loaded' }));
      expect(body.tools).toEqual(
        endpoint === 'chat'
          ? [{ type: 'function', function: { name: 'loaded' } }]
          : [{ type: 'function', name: 'loaded' }],
      );
    },
  );
  it('prepares function references with prompt priority and per-test variables', async () => {
    const reference = fixture('functions.json', [{ name: '{{ functionName }}' }]);
    const config = OpenAiChatConfigInputSchema.parse({
      apiKey: 'fixture-key',
      functions: 'file://missing-functions.json',
    });
    const provider = new OpenAiChatCompletionProvider('gpt-4.1', { config });
    for (const functionName of ['first', 'second']) {
      const { body } = await provider.getOpenAiBody(
        'fixture',
        context({ functionName }, { functions: reference }),
      );
      expect(body.functions).toEqual([{ name: functionName }]);
      validateFunctionCall({ name: functionName, arguments: '{}' }, reference, { functionName });
    }
  });
  it.each(['chat', 'responses'] as const)(
    'uses loaded %s response formats for output parsing and per-test overrides',
    async (endpoint) => {
      const schema = fixture('schema.json', {
        type: 'object',
        properties: { value: { type: 'string' } },
      });
      const format = fixture('format.json', {
        type: 'json_schema',
        json_schema: { name: '{{ formatName }}', schema },
      });
      const config = { apiKey: 'fixture-key', response_format: 'file://missing-format.json' };
      const provider =
        endpoint === 'chat'
          ? new OpenAiChatCompletionProvider('gpt-4.1', {
              config: OpenAiChatConfigInputSchema.parse(config),
            })
          : new OpenAiResponsesProvider('gpt-4.1', {
              config: OpenAiResponsesConfigInputSchema.parse(config),
            });
      for (const formatName of ['first', 'second']) {
        vi.mocked(fetchWithCache).mockResolvedValue(
          endpoint === 'chat'
            ? chatResponse('{"value":"ok"}')
            : createMockFetchResponse({
                id: 'resp_fixture',
                status: 'completed',
                output: [
                  {
                    type: 'message',
                    role: 'assistant',
                    content: [{ type: 'output_text', text: '{"value":"ok"}', annotations: [] }],
                  },
                ],
                usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
              }),
        );
        const callContext = context({ formatName }, { response_format: format });
        const { body, config: prepared } = await provider.getOpenAiBody('fixture', callContext);
        expect(prepared.response_format?.json_schema?.name).toBe(formatName);
        expect(JSON.stringify(body)).not.toContain('file://');
        const result = await provider.callApi('fixture', callContext);
        expect(result.error).toBeUndefined();
        expect(result.output).toEqual({ value: 'ok' });
      }
    },
  );
  it.each(['chat', 'responses'] as const)('preserves an empty %s tools file', async (endpoint) => {
    const reference = fixture('empty-tools.json', null);
    const config = { apiKey: 'fixture-key', tools: reference };
    const provider =
      endpoint === 'chat'
        ? new OpenAiChatCompletionProvider('gpt-4.1', {
            config: OpenAiChatConfigInputSchema.parse(config),
          })
        : new OpenAiResponsesProvider('gpt-4.1', {
            config: OpenAiResponsesConfigInputSchema.parse(config),
          });
    expect((await provider.getOpenAiBody('fixture')).body.tools).toBeUndefined();
  });
  it('uses the effective wire format when passthrough overrides a loaded Chat format', async () => {
    const format = fixture('format.json', {
      type: 'json_schema',
      json_schema: { name: 'fixture', schema: { type: 'object' } },
    });
    const config = OpenAiChatConfigInputSchema.parse({
      apiKey: 'fixture-key',
      response_format: format,
      passthrough: { response_format: { type: 'text' } },
    });
    const provider = new OpenAiChatCompletionProvider('gpt-4.1', { config });
    vi.mocked(fetchWithCache).mockResolvedValue(chatResponse('{"value":"unparsed"}'));
    const result = await provider.callApi('fixture');
    expect(result.error).toBeUndefined();
    expect(result.output).toBe('{"value":"unparsed"}');
  });
  it.each(['inline', 'file', 'file-array'] as const)(
    'renders Chat definitions once with untrusted template text (%s)',
    async (source) => {
      const payload = '{{ env.CONSTRUCTOR_TEMPLATE_SECRET }}';
      const tool = { type: 'function', function: { name: 'ping', description: '{{ payload }}' } };
      const functions = [{ name: 'ping', description: '{{ payload }}' }];
      const schema = { type: 'object', description: '{{ payload }}' };
      const format = {
        type: 'json_schema',
        json_schema: {
          name: 'fixture',
          description: '{{ payload }}',
          schema: source === 'file-array' ? fixture('schema.json', schema) : schema,
        },
      };
      const toolRef = fixture('tools.json', [tool]);
      const config = OpenAiChatConfigInputSchema.parse({
        apiKey: 'fixture-key',
        tools: source === 'inline' ? [tool] : source === 'file' ? toolRef : [toolRef],
        functions: source === 'inline' ? functions : fixture('functions.json', functions),
        response_format: source === 'inline' ? format : fixture('format.json', format),
      });
      const provider = new OpenAiChatCompletionProvider('gpt-4.1', { config });
      const { body } = await provider.getOpenAiBody('fixture', context({ payload }));
      expect(body).toMatchObject({
        tools: [{ function: { description: payload } }],
        functions: [{ description: payload }],
        response_format: {
          json_schema: { description: payload, schema: { description: payload } },
        },
      });
      expect(JSON.stringify(body)).not.toContain('fixture-sensitive-value');
    },
  );
  it.each(['inline', 'file', 'file-array'] as const)(
    'renders Responses definitions once with untrusted template text (%s)',
    async (source) => {
      const payload = '{{ env.CONSTRUCTOR_TEMPLATE_SECRET }}';
      const tool = { type: 'function', function: { name: 'ping', description: '{{ payload }}' } };
      const schema = { type: 'object', description: '{{ payload }}' };
      const format = {
        type: 'json_schema',
        json_schema: {
          name: 'fixture',
          schema: source === 'file-array' ? fixture('schema.json', schema) : schema,
        },
      };
      const toolRef = fixture('tools.json', [tool]);
      const config = OpenAiResponsesConfigInputSchema.parse({
        apiKey: 'fixture-key',
        tools: source === 'inline' ? [tool] : source === 'file' ? toolRef : [toolRef],
        response_format: source === 'inline' ? format : fixture('format.json', format),
      });
      const provider = new OpenAiResponsesProvider('gpt-4.1', { config });
      const { body } = await provider.getOpenAiBody('fixture', context({ payload }));
      expect(body).toMatchObject({
        tools: [{ description: payload }],
        text: { format: { schema: { description: payload } } },
      });
      expect(JSON.stringify(body)).not.toContain('fixture-sensitive-value');
    },
  );
  it.each(['root', 'nested'] as const)(
    'evaluates %s reasoning callbacks without request vars',
    async (form) => {
      const root = vi.fn(() => ({ effort: 'high' as const }));
      const nested = vi.fn(() => 'high' as const);
      const provider = new OpenAiResponsesProvider('o3', {
        config: {
          apiKey: 'fixture-key',
          reasoning: form === 'root' ? root : { effort: nested },
        },
      });
      const { body } = await provider.getOpenAiBody('fixture');
      expect(body.reasoning).toEqual({ effort: 'high' });
      expect(form === 'root' ? root : nested).toHaveBeenCalledWith({ vars: {} });
    },
  );
  it('evaluates Chat reasoning effort callbacks without request vars', async () => {
    const effort = vi.fn(() => 'high' as const);
    const provider = new OpenAiChatCompletionProvider('o3', {
      config: { apiKey: 'fixture-key', reasoning_effort: effort },
    });
    const { body } = await provider.getOpenAiBody('fixture');
    expect(body.reasoning_effort).toBe('high');
    expect(effort).toHaveBeenCalledWith({ vars: {} });
  });
  it('evaluates OpenRouter reasoning callbacks without request vars', async () => {
    const effort = vi.fn(() => 'high' as const);
    const provider = new OpenAiChatCompletionProvider('gpt-6-sol', {
      config: {
        apiBaseUrl: 'https://openrouter.ai/api/v1',
        reasoning_effort: effort,
      },
    });
    const { body } = await provider.getOpenAiBody('fixture');
    expect(body.reasoning_effort ?? body.reasoning?.effort).toBe('high');
    expect(effort).toHaveBeenCalledWith({ vars: {} });
  });
  it('preserves explicit callable config and callback execution', async () => {
    const effort = vi.fn(() => 'high' as const);
    const callback = vi.fn(async (args: string) => `callback:${args}`);
    const provider = new OpenAiChatCompletionProvider('o3', {
      config: {
        apiKey: 'fixture-key',
        reasoning_effort: effort,
        tools: [{ type: 'function', function: { name: 'ping' } }],
        functionToolCallbacks: { ping: callback },
      },
    });
    expect(effort).not.toHaveBeenCalled();
    vi.mocked(fetchWithCache).mockResolvedValue(
      createMockFetchResponse({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{ type: 'function', function: { name: 'ping', arguments: '{}' } }],
            },
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
    );
    const result = await provider.callApi('fixture', context({ test: true }));
    expect(result.error).toBeUndefined();
    expect(callback).toHaveBeenCalledExactlyOnceWith('{}');
    expect(effort).toHaveBeenCalled();
  });
  it('renders Responses callable reasoning fields with each test context', async () => {
    const effort = vi.fn(() => 'high' as const);
    const summary = vi.fn(() => 'auto' as const);
    const provider = new OpenAiResponsesProvider('o3', {
      config: {
        apiKey: 'fixture-key',
        reasoning: { effort, summary },
      },
    });
    expect(effort).not.toHaveBeenCalled();
    for (const name of ['first', 'second']) {
      const { body } = await provider.getOpenAiBody('fixture', context({ name }));
      expect(body.reasoning).toEqual({ effort: 'high', summary: 'auto' });
    }
    expect(effort).toHaveBeenCalledTimes(2);
    expect(effort).toHaveBeenNthCalledWith(1, { vars: { name: 'first' } });
    expect(effort).toHaveBeenNthCalledWith(2, { vars: { name: 'second' } });
  });
  it.each(['', '   '])('rejects an empty loaded function name (%j)', (name) => {
    const reference = fixture('invalid-name.json', [{ name }]);
    expect(() => validateFunctionCall({ name: 'ping', arguments: '{}' }, reference)).toThrow(
      InvalidToolSchemaError,
    );
  });
  it.each([null, { type: 'not-a-json-schema-type' }])(
    'keeps malformed parameters as schema errors (%j)',
    (parameters) => {
      const reference = fixture('invalid.json', [{ name: 'ping', parameters }]);
      expect(() => validateFunctionCall({ name: 'ping', arguments: '{}' }, reference)).toThrow(
        InvalidToolSchemaError,
      );
    },
  );
});

describe('hosted MCP request serialization', () => {
  it.each([true, false, undefined])(
    'preserves deferred loading %s and nullable filters on the wire',
    async (deferLoading) => {
      const tools = [
        {
          type: 'mcp',
          server_label: 'fixture',
          server_url: 'https://fixture.example.test/mcp',
          ...(deferLoading === undefined ? {} : { defer_loading: deferLoading }),
          allowed_tools: null,
          headers: null,
          require_approval: null,
        },
      ];
      const config = OpenAiResponsesConfigInputSchema.parse({ apiKey: 'fixture-key', tools });
      const provider = new OpenAiResponsesProvider('gpt-4.1', { config });
      vi.mocked(fetchWithCache).mockResolvedValue(
        createMockFetchResponse({
          output: [
            { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'ok' }] },
          ],
          usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
        }),
      );
      const result = await provider.callApi('fixture');
      expect(result.error).toBeUndefined();
      expect(result.output).toBe('ok');
      const request = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string);
      expect(request.tools).toEqual(tools);
    },
  );

  it('retains future hosted MCP fields through explicit passthrough', async () => {
    const tools = [
      {
        type: 'mcp',
        server_label: 'fixture',
        tunnel_id: 'tunnel_fixture',
        future_field: { nested: true },
      },
    ];
    const config = OpenAiResponsesConfigInputSchema.parse({ passthrough: { tools } });
    const { body } = await new OpenAiResponsesProvider('gpt-4.1', { config }).getOpenAiBody(
      'fixture',
    );
    expect(JSON.parse(JSON.stringify(body)).tools).toEqual(tools);
  });
});

it.each(['inline', 'file'] as const)(
  'preserves %s Chat response-format strict:null through callApi',
  async (source) => {
    const format = {
      type: 'json_schema',
      json_schema: {
        name: 'result',
        strict: null,
        schema: { type: 'object', properties: { value: { type: 'string' } } },
      },
    };
    const config = OpenAiChatConfigInputSchema.parse({
      apiKey: 'fixture-key',
      response_format: source === 'file' ? fixture('nullable-format.json', format) : format,
    });
    const provider = new OpenAiChatCompletionProvider('gpt-4.1', { config });
    vi.mocked(fetchWithCache).mockResolvedValue(chatResponse('{"value":"ok"}'));
    const result = await provider.callApi('fixture');
    expect(result.error).toBeUndefined();
    expect(result.output).toEqual({ value: 'ok' });
    const request = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string);
    expect(request.response_format).toEqual(format);
  },
);
