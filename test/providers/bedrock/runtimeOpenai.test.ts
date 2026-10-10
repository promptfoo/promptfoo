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
  vi.useRealTimers();
  restoreEnv?.();
  vi.restoreAllMocks();
});

describe.each([
  ['chat', BedrockRuntimeChatProvider, chatReply, 'chat/completions'],
  ['responses', BedrockRuntimeResponsesProvider, responsesReply, 'responses'],
] as const)('Bedrock Runtime %s', (mode, Provider, reply, path) => {
  it.each([
    { cacheWrite: 0, manual: false, expected: 0.000286 },
    { cacheWrite: 10, manual: false, expected: undefined },
    { cacheWrite: 10, manual: true, expected: 1.4 },
  ])(
    'preserves cache-write pricing uncertainty (writes: $cacheWrite, manual: $manual)',
    async ({ cacheWrite, manual, expected }) => {
      const detailKey = mode === 'chat' ? 'prompt_tokens_details' : 'input_tokens_details';
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: {
          ...reply,
          usage: {
            ...reply.usage,
            [detailKey]: { cached_tokens: 40, cache_write_tokens: cacheWrite },
          },
        },
        status: 200,
        statusText: 'OK',
        cached: false,
      });
      const provider = new Provider('us.xai.grok-4.6', {
        config: { apiKey: 'fixture', ...(manual ? { inputCost: 0.01, outputCost: 0.02 } : {}) },
      });
      const result = await provider.callApi('hello');
      expect(result.error).toBeUndefined();
      if (expected === undefined) {
        expect(result.cost).toBeUndefined();
      } else {
        expect(result.cost).toBeCloseTo(expected, 10);
      }
      expect(result.tokenUsage?.completionDetails?.cacheCreationInputTokens).toBe(cacheWrite);
    },
  );

  it('forwards the Kimi K3 profile and HTTP service tier', async () => {
    const provider = new Provider('us.moonshotai.kimi-k3', {
      config: { apiKey: 'fixture', service_tier: 'flex' },
    });
    expect((await provider.getOpenAiBody('hello')).body).toMatchObject({
      model: 'us.moonshotai.kimi-k3',
      service_tier: 'flex',
    });
  });

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

  it.each([
    ['global', { inputCost: 0.01 }, 1.0004],
    ['us', { inputCost: 0.01 }, 1.00044],
    ['global', { outputCost: 0.02 }, 0.400256],
    ['us', { outputCost: 0.02 }, 0.4002816],
    ['global', { inputCost: 0 }, 0.0004],
    ['global', { outputCost: 0 }, 0.000256],
  ] as const)(
    'preserves catalog rates with partial overrides for %s %j',
    async (profile, costs, expected) => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: reply,
        status: 200,
        statusText: 'OK',
        cached: false,
      });
      const provider = new Provider(`${profile}.openai.gpt-5.6-sol`, {
        config: { region: 'us-east-1', apiKey: 'fixture', ...costs },
      });
      expect((await provider.callApi('hello')).cost).toBeCloseTo(expected, 10);
    },
  );

  it.each(['priority', 'flex', 'reserved'])('omits unpublished GPT %s prices', async (tier) => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: { ...reply, service_tier: tier },
      status: 200,
      statusText: 'OK',
      cached: false,
    });
    const provider = new Provider('us.openai.gpt-5.6-sol', { config: { apiKey: 'fixture' } });
    expect((await provider.callApi('hello')).cost).toBeUndefined();
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
    [{ tools: [{ type: 'web_search_preview_2025_03_11' }] }, 'server-side tools'],
    [{ model: 'openai.gpt-oss-120b-1:0' }, 'GPT OSS'],
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

it('preserves streamed log probabilities for perplexity assertions', async () => {
  const chunks = [
    {
      choices: [
        {
          index: 0,
          delta: { content: 'REA' },
          logprobs: { content: [{ token: 'REA', logprob: -0.2 }] },
        },
      ],
    },
    {
      choices: [
        {
          index: 0,
          delta: { content: 'DY' },
          logprobs: { content: [{ token: 'DY', logprob: -0.1 }] },
          finish_reason: 'stop',
        },
      ],
    },
  ];
  vi.mocked(fetchWithCache).mockResolvedValue({
    data: chunks.map((part) => `data: ${JSON.stringify(part)}\n\n`).join('') + 'data: [DONE]\n\n',
    status: 200,
    statusText: 'OK',
    cached: false,
  });
  const provider = new BedrockRuntimeChatProvider('openai.gpt-oss-120b-1:0', {
    config: { apiKey: 'fixture', stream: true },
  });
  const result = await provider.callApi('hello', undefined, { includeLogProbs: true });
  expect(result.output).toBe('READY');
  expect(result.logProbs).toEqual([-0.2, -0.1]);
});

it.each(['event: error\n', ''])(
  'rejects late typed SSE errors even after a finish reason',
  async (event) => {
    const data =
      'data: {"choices":[{"index":0,"delta":{"content":"partial"},"finish_reason":"stop"}]}\n\n' +
      event +
      'data: {"type":"error","message":"late failure"}\n\ndata: [DONE]\n\n';
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
    expect(result.error).toContain('late failure');
    expect(result.output).toBeUndefined();
  },
);

it('preserves environment sampling defaults for Runtime reasoning models', async () => {
  const restore = mockProcessEnv({ OPENAI_TOP_P: '0.7' });
  try {
    const provider = new BedrockRuntimeResponsesProvider('us.xai.grok-4-7', {
      config: { apiKey: 'fixture', reasoning_effort: 'high' },
    });
    const { body } = await provider.getOpenAiBody('hello');
    expect(body.top_p).toBe(0.7);
    expect(body.reasoning).toMatchObject({ effort: 'high' });
  } finally {
    restore();
  }
});

it.each(['<html>upstream unavailable</html>', '{"error":{"message":"upstream unavailable"}}'])(
  'preserves HTTP status and diagnostic bodies for streaming failures',
  async (data) => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data,
      status: 502,
      statusText: 'Bad Gateway',
      cached: false,
    });
    const provider = new BedrockRuntimeChatProvider('openai.gpt-oss-120b-1:0', {
      config: { apiKey: 'fixture', stream: true },
    });
    const result = await provider.callApi('hello');
    expect(result.error).toContain('502 Bad Gateway');
    expect(result.error).toContain('upstream unavailable');
    expect(result.metadata?.http).toMatchObject({ status: 502 });
  },
);

it('joins legacy function-call deltas before parsing the completed response', async () => {
  const chunks = [
    { choices: [{ index: 0, delta: { function_call: { name: 'lookup', arguments: '{"x":' } } }] },
    {
      choices: [
        { index: 0, delta: { function_call: { arguments: '1}' } }, finish_reason: 'function_call' },
      ],
    },
  ];
  vi.mocked(fetchWithCache).mockResolvedValue({
    data: chunks.map((part) => `data: ${JSON.stringify(part)}\n\n`).join('') + 'data: [DONE]\n\n',
    status: 200,
    statusText: 'OK',
    cached: false,
  });
  const provider = new BedrockRuntimeChatProvider('openai.gpt-oss-120b-1:0', {
    config: { apiKey: 'fixture', stream: true },
  });
  const result = await provider.callApi('hello');
  expect(result.error).toBeUndefined();
  expect(result.output).toEqual({ name: 'lookup', arguments: '{"x":1}' });
});

it.each(['chat', 'responses'] as const)(
  'allows account-scoped system profiles for Runtime %s',
  async (mode) => {
    const Provider = mode === 'chat' ? BedrockRuntimeChatProvider : BedrockRuntimeResponsesProvider;
    const model = 'arn:aws:bedrock:us-east-1:123456789012:inference-profile/us.openai.gpt-5.6-sol';
    const provider = new Provider(model, { config: { apiKey: 'fixture' } });
    expect((await provider.getOpenAiBody('hello')).body.model).toBe(model);
  },
);

it('rejects application profiles in Runtime Chat before transport', async () => {
  const provider = new BedrockRuntimeChatProvider('openai.gpt-oss-120b-1:0', {
    config: {
      apiKey: 'fixture',
      passthrough: {
        model: 'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/fixture',
      },
    },
  });
  await expect(provider.getOpenAiBody('hello')).rejects.toThrow('application inference profiles');
  expect(fetchWithCache).not.toHaveBeenCalled();
});

it.each([
  [{ inputCost: 0.01 }, 1.000012],
  [{ outputCost: 0.02 }, 0.400009],
])('preserves GPT OSS catalog rates with a partial override %j', async (costs, expected) => {
  vi.mocked(fetchWithCache).mockResolvedValue({
    data: chatReply,
    status: 200,
    statusText: 'OK',
    cached: false,
  });
  const provider = new BedrockRuntimeChatProvider('openai.gpt-oss-120b-1:0', {
    config: { apiKey: 'fixture', region: 'us-east-1', ...costs },
  });
  expect((await provider.callApi('hello')).cost).toBeCloseTo(expected, 10);
});

describe('Runtime Chat streaming lifecycle', () => {
  const completed =
    'data: {"choices":[{"index":0,"delta":{"content":"READY"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';

  it.each(['provider', 'prompt'] as const)(
    'preserves an explicit false %s streaming override',
    async (scope) => {
      const provider = new BedrockRuntimeChatProvider('openai.gpt-oss-120b-1:0', {
        config: {
          apiKey: 'fixture',
          stream: true,
          ...(scope === 'provider' ? { passthrough: { stream: false } } : {}),
        },
      });
      const context =
        scope === 'prompt'
          ? {
              vars: {},
              prompt: { raw: 'hello', label: 'hello', config: { passthrough: { stream: false } } },
            }
          : undefined;
      const { body } = await provider.getOpenAiBody('hello', context);
      expect(body.stream).toBe(false);
      expect(body.stream_options).toBeUndefined();
    },
  );

  it.each([true, false])('measures full body latency only for streaming=%s', async (stream) => {
    vi.useFakeTimers();
    vi.mocked(fetchWithCache).mockImplementation(async () => {
      vi.advanceTimersByTime(25);
      return {
        data: stream ? completed : chatReply,
        status: 200,
        statusText: 'OK',
        cached: false,
        latencyMs: 1,
      };
    });
    const provider = new BedrockRuntimeChatProvider('openai.gpt-oss-120b-1:0', {
      config: { apiKey: 'fixture', stream },
    });
    expect((await provider.callApi('hello')).latencyMs).toBe(stream ? 25 : 1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the stream deadline active until body collection ends', async () => {
    vi.useFakeTimers();
    const restore = mockProcessEnv({ REQUEST_TIMEOUT_MS: '50' });
    let signal: AbortSignal | null | undefined;
    vi.mocked(fetchWithCache).mockImplementation(async (_url, request) => {
      signal = request?.signal;
      return new Promise((_resolve, reject) =>
        signal?.addEventListener('abort', () => reject(signal?.reason), { once: true }),
      );
    });
    try {
      const provider = new BedrockRuntimeChatProvider('openai.gpt-oss-120b-1:0', {
        config: { apiKey: 'fixture', stream: true },
      });
      const pending = provider.callApi('hello');
      await vi.advanceTimersByTimeAsync(50);
      expect(signal?.aborted).toBe(true);
      const result = await pending;
      expect(result.error).toContain('stream timed out after 50ms');
      expect(result.output).toBeUndefined();
    } finally {
      restore();
    }
  });

  it('preserves caller cancellation while a stream is pending', async () => {
    vi.useFakeTimers();
    vi.mocked(fetchWithCache).mockImplementation(
      async (_url, request) =>
        new Promise((_resolve, reject) => {
          request?.signal?.addEventListener('abort', () => reject(request?.signal?.reason), {
            once: true,
          });
        }),
    );
    const controller = new AbortController();
    const provider = new BedrockRuntimeChatProvider('openai.gpt-oss-120b-1:0', {
      config: { apiKey: 'fixture', stream: true },
    });
    const pending = provider.callApi('hello', undefined, { abortSignal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });
});

it.each([
  'openai.gpt-5.6-sol',
  'gpt-6.1-sol',
  'arn:aws:bedrock:us-east-1::foundation-model/openai.gpt-5.6-sol',
])(
  'rejects closed GPT foundation ID %s in the effective Runtime Responses request',
  async (model) => {
    const provider = new BedrockRuntimeResponsesProvider('us.openai.gpt-5.6-sol', {
      config: { apiKey: 'fixture', passthrough: { model } },
    });
    await expect(provider.getOpenAiBody('hello')).rejects.toThrow(
      'require a system inference profile',
    );
    expect(fetchWithCache).not.toHaveBeenCalled();
  },
);
