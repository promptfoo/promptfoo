import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { getBedrockTextRoute } from '../../../src/providers/bedrock/routing';
import {
  BedrockRuntimeChatProvider,
  BedrockRuntimeResponsesProvider,
} from '../../../src/providers/bedrock/runtimeOpenai';
import { mockProcessEnv } from '../../util/utils';

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));

const chatReply = {
  choices: [{ message: { role: 'assistant', content: 'READY' }, finish_reason: 'stop' }],
  usage: {
    prompt_tokens: 100,
    completion_tokens: 20,
    total_tokens: 120,
    prompt_tokens_details: { cached_tokens: 40, cache_write_tokens: 0 },
  },
};
const responsesReply = {
  id: 'response',
  status: 'completed',
  output: [
    { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'READY' }] },
  ],
  usage: {
    input_tokens: 100,
    output_tokens: 20,
    total_tokens: 120,
    input_tokens_details: { cached_tokens: 40, cache_write_tokens: 0 },
  },
};

let restoreEnv: (() => void) | undefined;
beforeEach(() => {
  vi.mocked(fetchWithCache).mockReset();
  restoreEnv = mockProcessEnv({
    AWS_BEDROCK_REGION: undefined,
    AWS_REGION: undefined,
    AWS_DEFAULT_REGION: undefined,
    AWS_BEARER_TOKEN_BEDROCK: undefined,
    OPENAI_API_KEY: 'unrelated-openai-key',
    OPENAI_API_HOST: 'unrelated.example.com',
  });
});
afterEach(() => {
  restoreEnv?.();
  vi.restoreAllMocks();
});

describe.each([
  ['chat', BedrockRuntimeChatProvider, chatReply, 'chat/completions'],
  ['responses', BedrockRuntimeResponsesProvider, responsesReply, 'responses'],
] as const)('Bedrock Runtime %s', (mode, Provider, reply, path) => {
  it('pins the Runtime endpoint and preserves profile IDs and Bedrock authentication', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: reply,
      status: 200,
      statusText: 'OK',
      cached: false,
    });
    const provider = new Provider('us.openai.gpt-5.6-sol', {
      config: {
        apiKey: 'bedrock-fixture',
        region: 'us-east-1',
        reasoning_effort: 'low',
        max_completion_tokens: 64,
        max_output_tokens: 64,
      },
    });
    const result = await provider.callApi('hello');
    expect(result.error).toBeUndefined();
    expect(result.output).toBe('READY');
    const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
    expect(url).toBe(`https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1/${path}`);
    expect(await request?.getAuthHeaders?.()).toEqual({ Authorization: 'Bearer bedrock-fixture' });
    const body = JSON.parse(String(request?.body));
    expect(body.model).toBe('us.openai.gpt-5.6-sol');
    expect(body.temperature).toBeUndefined();
    expect(mode === 'chat' ? body.reasoning_effort : body.reasoning.effort).toBe('low');
    expect(result.tokenUsage).toMatchObject({ prompt: 100, completion: 20, total: 120 });
  });

  it('preserves client functions, structured output and explicit extra request fields', async () => {
    const provider = new Provider('us.openai.gpt-5.6-sol', {
      config: {
        apiKey: 'bedrock-fixture',
        tools: [
          {
            type: 'function',
            function: {
              name: 'lookup',
              description: 'Lookup',
              parameters: { type: 'object', properties: {} },
            },
          },
        ],
        passthrough: {
          metadata: { suite: 'fixture' },
          ...(mode === 'chat'
            ? { response_format: { type: 'json_object' } }
            : { text: { format: { type: 'json_object' } } }),
        },
      },
    });
    const { body } = await provider.getOpenAiBody('hello');
    expect(body).toMatchObject({ metadata: { suite: 'fixture' } });
    expect(body.tools).toHaveLength(1);
    expect(mode === 'chat' ? body.response_format : body.text?.format).toEqual({
      type: 'json_object',
    });
  });

  it('distinguishes Runtime global and geographic GPT pricing', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: reply,
      status: 200,
      statusText: 'OK',
      cached: false,
    });
    const global = await new Provider('global.openai.gpt-5.6-sol', {
      config: { region: 'us-east-1', apiKey: 'fixture' },
    }).callApi('hello');
    const us = await new Provider('us.openai.gpt-5.6-sol', {
      config: { region: 'us-east-1', apiKey: 'fixture' },
    }).callApi('hello');
    expect(global.cost).toBeGreaterThan(0);
    expect(us.cost).toBeCloseTo(global.cost! * 1.1, 10);
  });

  it('does not invent prices for unknown Runtime models and honors manual rates', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: reply,
      status: 200,
      statusText: 'OK',
      cached: false,
    });
    const unknown = await new Provider('example.new-model', {
      config: { apiKey: 'fixture' },
    }).callApi('hello');
    expect(unknown.cost).toBeUndefined();
    const manual = await new Provider('example.new-model', {
      config: { apiKey: 'fixture', inputCost: 0.001, outputCost: 0.002 },
    }).callApi('hello');
    expect(manual.cost).toBeCloseTo(0.14, 10);
  });

  it('supports GovCloud and China endpoint suffixes and rejects malformed regions', () => {
    expect(new Provider('example.model', { config: { region: 'us-gov-west-1' } }).getApiUrl()).toBe(
      'https://bedrock-runtime.us-gov-west-1.amazonaws.com/openai/v1',
    );
    expect(new Provider('example.model', { config: { region: 'cn-north-1' } }).getApiUrl()).toBe(
      'https://bedrock-runtime.cn-north-1.amazonaws.com.cn/openai/v1',
    );
    expect(
      () => new Provider('example.model', { config: { region: 'evil.example/path' } }),
    ).toThrow('Invalid AWS region');
  });
});

describe('Runtime Responses restrictions and state', () => {
  it('preserves stored conversation controls and Runtime service tiers', async () => {
    const provider = new BedrockRuntimeResponsesProvider('us.openai.gpt-5.6-sol', {
      config: {
        apiKey: 'fixture',
        service_tier: 'priority',
        passthrough: { store: false, previous_response_id: 'previous' },
      },
    });
    const { body } = await provider.getOpenAiBody('hello');
    expect(body).toMatchObject({
      model: 'us.openai.gpt-5.6-sol',
      service_tier: 'priority',
      store: false,
      previous_response_id: 'previous',
    });
  });

  it.each([
    [{ background: true }, 'background=true'],
    [
      { model: 'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/fixture' },
      'application inference profiles',
    ],
    [{ tools: [{ type: 'web_search' }] }, 'server-side tools'],
    [{ tools: [{ type: 'code_interpreter', container: { type: 'auto' } }] }, 'server-side tools'],
  ] as const)('rejects unavailable Runtime features %j', async (passthrough, error) => {
    const provider = new BedrockRuntimeResponsesProvider('us.openai.gpt-5.6-sol', {
      config: { apiKey: 'fixture', passthrough },
    });
    await expect(provider.getOpenAiBody('hello')).rejects.toThrow(error);
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('preserves Grok reasoning and explicit sampling for profile IDs', async () => {
    const provider = new BedrockRuntimeResponsesProvider('global.xai.grok-4.7', {
      config: { apiKey: 'fixture', reasoning_effort: 'high', top_p: 0.8, temperature: 0.2 },
    });
    const { body } = await provider.getOpenAiBody('hello');
    expect(body).toMatchObject({
      model: 'global.xai.grok-4.7',
      reasoning: { effort: 'high' },
      top_p: 0.8,
      temperature: 0.2,
    });
  });
});

it.each(['chat', 'responses'] as const)(
  'parses the Runtime %s route without discarding model version colons',
  (api) => {
    expect(getBedrockTextRoute(`bedrock:runtime:${api}:openai.gpt-oss-120b-1:0`)).toEqual({
      apiMode: `runtime-${api}`,
      modelId: 'openai.gpt-oss-120b-1:0',
    });
  },
);

describe('Runtime Chat streaming', () => {
  const sse = (chunks: unknown[], done = true) =>
    chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\r\n\r\n`).join('') +
    (done ? 'data: [DONE]\r\n\r\n' : '');

  it('collects reasoning, text, usage and actual service tier before shared normalization', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: sse([
        { choices: [{ index: 0, delta: { reasoning_content: 'Consider.' } }] },
        { choices: [{ index: 0, delta: { content: 'REA' } }] },
        { choices: [{ index: 0, delta: { content: 'DY' }, finish_reason: 'stop' }] },
        { choices: [], usage: chatReply.usage, service_tier: 'default' },
      ]),
      status: 200,
      statusText: 'OK',
      cached: false,
    });
    const provider = new BedrockRuntimeChatProvider('us.openai.gpt-5.6-sol', {
      config: { apiKey: 'fixture', stream: true, service_tier: 'priority' },
    });
    const result = await provider.callApi('hello');
    expect(result.error).toBeUndefined();
    expect(result.output).toContain('READY');
    expect(result.tokenUsage).toMatchObject({ prompt: 100, completion: 20 });
    const args = vi.mocked(fetchWithCache).mock.calls[0];
    expect(args[3]).toBe('text');
    expect(JSON.parse(String(args[1]?.body))).toMatchObject({
      stream: true,
      stream_options: { include_usage: true },
    });
    expect(result.cost).toBeGreaterThan(0);
  });

  it('joins fragmented client tool arguments', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: sse([
        {
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call-1',
                    type: 'function',
                    function: { name: 'lookup', arguments: '{"x":' },
                  },
                ],
              },
            },
          ],
        },
        {
          choices: [
            {
              index: 0,
              delta: { tool_calls: [{ index: 0, function: { arguments: '1}' } }] },
              finish_reason: 'tool_calls',
            },
          ],
        },
      ]),
      status: 200,
      statusText: 'OK',
      cached: false,
    });
    const provider = new BedrockRuntimeChatProvider('openai.gpt-oss-120b-1:0', {
      config: { apiKey: 'fixture', stream: true },
    });
    const result = await provider.callApi('hello');
    expect(result.error).toBeUndefined();
    expect(result.output).toEqual([
      { id: 'call-1', type: 'function', function: { name: 'lookup', arguments: '{"x":1}' } },
    ]);
  });

  it.each([
    [
      sse([{ choices: [{ index: 0, delta: { content: 'partial' } }] }], false),
      'before a complete response',
    ],
    [
      sse([{ choices: [{ index: 0, delta: { content: 'partial' } }] }]),
      'before a complete response',
    ],
    [sse([{ error: { message: 'Service failed' } }]), 'Service failed'],
    ['data: {broken}\n\ndata: [DONE]\n\n', 'SyntaxError'],
  ])('rejects failed or incomplete SSE without returning partial output', async (data, error) => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data,
      status: 200,
      statusText: 'OK',
      cached: false,
    });
    const provider = new BedrockRuntimeChatProvider('openai.gpt-oss-120b-1:0', {
      config: { apiKey: 'fixture', stream: true },
    });
    const result = await provider.callApi('hello');
    expect(result.error).toContain(error);
    expect(result.output).toBeUndefined();
  });
});

it('preserves an explicit completion cap for models outside the reasoning catalog', async () => {
  const provider = new BedrockRuntimeChatProvider('example.future-model', {
    config: { apiKey: 'fixture', max_completion_tokens: 64 },
  });
  const { body } = await provider.getOpenAiBody('hello');
  expect(body.max_completion_tokens).toBe(64);
  expect(body.max_tokens).toBeUndefined();
});
