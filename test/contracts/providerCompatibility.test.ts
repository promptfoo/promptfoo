import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Ajv from 'ajv';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import * as cache from '../../src/cache';
import {
  AnthropicMessagesConfigInputJsonSchema,
  AnthropicMessagesConfigInputSchema,
  AzureChatConfigInputSchema,
  AzureResponsesConfigInputJsonSchema,
  AzureResponsesConfigInputSchema,
} from '../../src/contracts';
import { AnthropicMessagesProvider } from '../../src/providers/anthropic/messages';
import { AzureChatCompletionProvider } from '../../src/providers/azure/chat';
import { AzureResponsesProvider } from '../../src/providers/azure/responses';
import { mockProcessEnv } from '../util/utils';
import type Anthropic from '@anthropic-ai/sdk';

import type { AzureResponsesConfigInput } from '../../src/contracts';
import type { AnthropicMessageOptions } from '../../src/providers/anthropic/types';
import type { AzureResponsesOptions } from '../../src/providers/azure/types';

// Independent corpus: pinned @anthropic-ai/sdk@0.131.0 Messages.ToolUnion.
// These values are checked against the SDK and provider options, not inferred from our schema.
const nativeTools = [
  { type: 'browser_toolset_20260801' },
  { type: 'computer_toolset_20260801', cache_control: { type: 'ephemeral' } },
  { name: 'lookup', input_schema: { type: 'object' }, eager_input_streaming: false },
  { type: null, name: 'lookup', input_schema: { type: 'object' }, eager_input_streaming: null },
  { type: 'custom', name: 'lookup', input_schema: { type: 'object' }, eager_input_streaming: true },
] satisfies Anthropic.Messages.ToolUnion[];

// Documented Azure structured-output/reasoning configuration, also used by provider tests.
const azureConfig = {
  modelName: 'o3',
  max_output_tokens: 128,
  reasoning_effort: 'low',
  tools: [
    {
      type: 'function',
      function: { name: 'lookup', parameters: { type: 'object', properties: {} } },
    },
  ],
  tool_choice: { type: 'function', name: 'lookup' },
  metadata: { experiment: 'compatibility' },
  parallel_tool_calls: false,
} satisfies AzureResponsesConfigInput & AzureResponsesOptions;

const ajv = new Ajv({ strict: false });
const validateAnthropic = ajv.compile(AnthropicMessagesConfigInputJsonSchema);
const validateAzure = ajv.compile(AzureResponsesConfigInputJsonSchema);

beforeEach(() => {
  mockProcessEnv({
    OPENAI_TEMPERATURE: undefined,
    OPENAI_MAX_TOKENS: undefined,
    OPENAI_MAX_COMPLETION_TOKENS: undefined,
  });
  vi.spyOn(cache, 'isCacheEnabled').mockReturnValue(false);
});
afterEach(() => vi.restoreAllMocks());

describe('portable inputs reach native request construction', () => {
  it.each(nativeTools)('preserves a native SDK tool: %j', async (tool) => {
    const config = { apiKey: 'test-key', tools: [tool] };
    expectTypeOf(config).toExtend<AnthropicMessageOptions>();
    expect(AnthropicMessagesConfigInputSchema.parse(config)).toEqual(config);
    expect(validateAnthropic(config)).toBe(true);
    const provider = new AnthropicMessagesProvider('claude-3-5-sonnet-20241022', { config });
    const send = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    } as Anthropic.Messages.Message);
    const result = await provider.callApi('Hello');
    expect(result.error).toBeUndefined();
    expect(result.output).toBe('ok');
    expect(send).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ tools: [tool], messages: expect.any(Array) }),
      expect.any(Object),
    );
  });

  it('preserves documented Azure Responses options through the transport boundary', async () => {
    expectTypeOf(azureConfig).toExtend<AzureResponsesOptions>();
    expect(AzureResponsesConfigInputSchema.parse(azureConfig)).toEqual(azureConfig);
    expect(validateAzure(azureConfig)).toBe(true);
    const provider = new AzureResponsesProvider('deployment', {
      config: { ...azureConfig, apiKey: 'test-key', apiHost: 'fixture.openai.azure.com' },
    });
    const send = vi.spyOn(cache, 'fetchWithCache').mockResolvedValue({
      data: {
        output: [
          { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'ok' }] },
        ],
        usage: { input_tokens: 1, output_tokens: 1 },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });
    const result = await provider.callApi('Hello');
    expect(result.error).toBeUndefined();
    expect(result.output).toBe('ok');
    const body = JSON.parse(send.mock.calls[0][1]?.body as string);
    expect(body).toMatchObject({
      max_output_tokens: 128,
      reasoning: { effort: 'low' },
      tools: [{ type: 'function', name: 'lookup', parameters: { type: 'object', properties: {} } }],
      tool_choice: azureConfig.tool_choice,
      metadata: azureConfig.metadata,
      parallel_tool_calls: false,
    });
    expect(body).not.toHaveProperty('max_tokens');
    expect(body).not.toHaveProperty('max_completion_tokens');
  });

  it.each([
    { tools: [{ name: 'lookup', input_schema: { type: 'object' }, eager_input_streaming: 'yes' }] },
    { tools: [{ type: 'custom', input_schema: { type: 'object' } }] },
    { tools: [{ type: 'computer_toolset_invalid' }] },
  ])('rejects malformed native tools in both validators: %j', (config) => {
    expect(AnthropicMessagesConfigInputSchema.safeParse(config).success).toBe(false);
    expect(validateAnthropic(config)).toBe(false);
  });
});

it('passes complete parsed authoring types into every provider constructor', async () => {
  const anthropic = new AnthropicMessagesProvider('claude-3-5-sonnet-20241022', {
    config: AnthropicMessagesConfigInputSchema.parse({ temperature: 0 }),
  });
  const chat = new AzureChatCompletionProvider('deployment', {
    config: AzureChatConfigInputSchema.parse({ temperature: 0 }),
  });
  const responses = new AzureResponsesProvider('deployment', {
    config: AzureResponsesConfigInputSchema.parse({ temperature: 0 }),
  });
  expect(anthropic.config.temperature).toBe(0);
  expect((await chat.getOpenAiBody('Hello')).body.temperature).toBe(0);
  expect((await responses.getAzureResponsesBody('Hello')).temperature).toBe(0);
});

it('loads parsed Anthropic tool and output-format references before the SDK boundary', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'anthropic-contract-'));
  try {
    fs.writeFileSync(
      path.join(directory, 'tools.json'),
      JSON.stringify([{ type: 'function', function: { name: 'ping' } }]),
    );
    const format = {
      type: 'json_schema',
      schema: { type: 'object', properties: { value: { type: 'string' } } },
    };
    fs.writeFileSync(path.join(directory, 'format.json'), JSON.stringify(format));
    const config = AnthropicMessagesConfigInputSchema.parse({
      apiKey: 'test-key',
      tools: `file://${directory}/tools.json`,
      output_format: `file://${directory}/format.json`,
    });
    const provider = new AnthropicMessagesProvider('claude-3-5-sonnet-20241022', { config });
    const send = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
      content: [{ type: 'text', text: '{"value":"ok"}' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    } as Anthropic.Messages.Message);
    const result = await provider.callApi('Hello');
    expect(result.error).toBeUndefined();
    expect(send.mock.calls[0][0]).toMatchObject({
      tools: [{ name: 'ping', input_schema: { type: 'object', properties: {} } }],
      output_config: { format },
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it('renders parsed Azure authoring fields without narrowing to SDK wire types', async () => {
  const chat = new AzureChatCompletionProvider('gpt-4.1', {
    config: AzureChatConfigInputSchema.parse({ functions: [{ name: 'ping' }], stop: 'END' }),
  });
  expect((await chat.getOpenAiBody('Hello')).body).toMatchObject({
    functions: [{ name: 'ping' }],
    stop: 'END',
  });
  const responses = new AzureResponsesProvider('gpt-6', {
    config: AzureResponsesConfigInputSchema.parse({ reasoning: { summary: '{{ summary }}' } }),
  });
  expect(
    await responses.getAzureResponsesBody('Hello', {
      vars: { summary: 'auto' },
      prompt: { raw: 'Hello', label: 'Hello' },
    }),
  ).toMatchObject({ reasoning: { summary: 'auto' } });
});

// Characterization only: these inherited request semantics need a separate behavior change.
it('documents that Anthropic model selection still comes from the provider ID', async () => {
  const config = AnthropicMessagesConfigInputSchema.parse({
    apiKey: 'test-key',
    model: 'different-model',
  });
  const provider = new AnthropicMessagesProvider('claude-3-5-sonnet-20241022', { config });
  const send = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
    content: [{ type: 'text', text: 'ok' }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 1, output_tokens: 1 },
  } as Anthropic.Messages.Message);
  await provider.callApi('Hello');
  expect(send.mock.calls[0][0].model).toBe('claude-3-5-sonnet-20241022');
});

it('documents that Azure Responses still omits a zero tool-call limit', async () => {
  const config = AzureResponsesConfigInputSchema.parse({ max_tool_calls: 0 });
  const provider = new AzureResponsesProvider('gpt-4.1', { config });
  expect(await provider.getAzureResponsesBody('Hello')).not.toHaveProperty('max_tool_calls');
});
