import {
  BedrockRuntime,
  ConverseCommand,
  ConverseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AwsBedrockConverseProvider,
  type BedrockConverseOptions,
  parseConverseMessages,
} from '../../../src/providers/bedrock/converse';

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/cache')>()),
  isCacheEnabled: () => false,
  getCache: async () => ({}),
}));

const model = 'us.amazon.nova-2-lite-v1:0';
const reply = {
  output: { message: { role: 'assistant', content: [{ text: 'READY' }] } },
  stopReason: 'end_turn',
  usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
};

function fixture(config: BedrockConverseOptions = {}, modelId = model) {
  const provider = new AwsBedrockConverseProvider(modelId, {
    config: { region: 'us-east-1', ...config },
  });
  const send = vi.fn().mockResolvedValue(reply);
  vi.spyOn(provider, 'getBedrockInstance').mockResolvedValue({ send } as unknown as BedrockRuntime);
  return { provider, send };
}

function stream(events: unknown[]) {
  return {
    stream: (async function* () {
      yield* events;
    })(),
  };
}

afterEach(() => vi.restoreAllMocks());

describe('Converse native request features', () => {
  it.each([false, true])('forwards native options with streaming=%s', async (streaming) => {
    const config: BedrockConverseOptions = {
      streaming,
      system: [{ text: 'Be brief' }, { cachePoint: { type: 'default' } }],
      inferenceConfig: { maxTokens: 12 },
      toolConfig: {
        tools: [
          {
            toolSpec: {
              name: 'lookup',
              inputSchema: { json: { type: 'object', properties: {} } },
              strict: true,
            },
          },
          { cachePoint: { type: 'default' } },
          { systemTool: { name: 'web_search' } },
        ],
        toolChoice: { auto: {} },
      },
      outputConfig: {
        textFormat: {
          type: 'json_schema',
          structure: { jsonSchema: { name: 'answer', schema: '{"type":"object"}' } },
        },
      },
      requestMetadata: { suite: 'parity' },
      promptVariables: { topic: { text: 'gardens' } },
      additionalModelResponseFieldPaths: ['/stop_sequence'],
      guardrailConfig: {
        guardrailIdentifier: 'guardrail',
        guardrailVersion: '1',
        trace: 'enabled',
        streamProcessingMode: 'async',
      },
    };
    const { provider, send } = fixture(config);
    if (streaming) {
      send.mockResolvedValue(stream([{ messageStop: { stopReason: 'end_turn' } }]));
    }
    expect((await provider.callApi('hello')).error).toBeUndefined();
    const command = send.mock.calls[0][0];
    expect(command).toBeInstanceOf(streaming ? ConverseStreamCommand : ConverseCommand);
    for (const key of [
      'system',
      'inferenceConfig',
      'toolConfig',
      'outputConfig',
      'requestMetadata',
      'promptVariables',
      'additionalModelResponseFieldPaths',
    ] as const) {
      expect(command.input[key]).toEqual(config[key]);
    }
    expect(command.input.guardrailConfig).toEqual(
      streaming
        ? config.guardrailConfig
        : {
            guardrailIdentifier: 'guardrail',
            guardrailVersion: '1',
            trace: 'enabled',
          },
    );
    expect(command.input).not.toHaveProperty('region');
  });

  it('preserves native system, multimodal, cache, reasoning, and tool blocks', () => {
    const native = [
      { text: 'hello' },
      {
        image: {
          format: 'png',
          source: { s3Location: { uri: 's3://fixture/image.png', bucketOwner: '123456789012' } },
        },
      },
      {
        document: {
          name: 'reference',
          format: 'txt',
          source: { text: 'reference text' },
          citations: { enabled: true },
          context: 'context',
        },
      },
      { document: { name: 'parts', source: { content: [{ text: 'part' }] } } },
      { video: { format: 'mp4', source: { bytes: 'YWJj' } } },
      { audio: { format: 'wav', source: { bytes: 'YWJj' } } },
      { cachePoint: { type: 'default', ttl: '1h' } },
      { reasoningContent: { reasoningText: { text: 'thought', signature: 'signature' } } },
      { reasoningContent: { redactedContent: 'YWJj' } },
      { guardContent: { text: { text: 'check me', qualifiers: ['query'] } } },
      {
        searchResult: {
          title: 'source',
          source: 'https://example.com',
          content: [{ text: 'evidence' }],
        },
      },
      {
        toolUse: {
          toolUseId: 'tool-1',
          name: 'lookup',
          input: { source: { bytes: 'leave unchanged' } },
        },
      },
      {
        toolResult: {
          toolUseId: 'tool-1',
          content: [
            { image: { format: 'png', source: { bytes: 'YWJj' } } },
            { json: { source: { bytes: 'leave unchanged' } } },
          ],
          type: 'custom',
          status: 'success',
        },
      },
      { toolAddition: { tools: [] } },
      { toolRemoval: { toolNames: ['lookup'] } },
    ];
    const system = [{ text: 'instructions' }, { cachePoint: { type: 'default' } }];
    const parsed = parseConverseMessages(
      JSON.stringify([
        { role: 'system', content: system },
        { role: 'user', content: native },
      ]),
    );
    expect(parsed.system).toEqual(system);
    const expected = structuredClone(native);
    for (const index of [4, 5]) {
      const content = expected[index] as unknown as Record<string, { source: { bytes: unknown } }>;
      Object.values(content)[0].source.bytes = Buffer.from('abc');
    }
    (expected[8].reasoningContent as unknown as { redactedContent: unknown }).redactedContent =
      Buffer.from('abc');
    (expected[12].toolResult!.content[0].image!.source as { bytes: unknown }).bytes =
      Buffer.from('abc');
    expect(parsed.messages[0].content).toEqual(expected);
  });

  it('serializes binary content and structured output through the real AWS SDK', async () => {
    const handle = vi.fn(async (_request: { body?: unknown }) => ({
      response: {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: new TextEncoder().encode(JSON.stringify(reply)),
      },
    }));
    const client = new BedrockRuntime({
      region: 'us-east-1',
      credentials: { accessKeyId: 'LOCAL_FIXTURE', secretAccessKey: 'LOCAL_FIXTURE' },
      requestHandler: { handle },
    });
    const { provider } = fixture({
      outputConfig: { effort: 'low' },
      requestMetadata: { suite: 'parity' },
    });
    vi.spyOn(provider, 'getBedrockInstance').mockResolvedValue(client);
    try {
      const result = await provider.callApi(
        JSON.stringify([
          {
            role: 'user',
            content: [
              { text: 'Describe this' },
              { image: { format: 'png', source: { bytes: 'YWJj' } } },
            ],
          },
        ]),
      );
      expect(result.output).toBe('READY');
      const body = JSON.parse(String(handle.mock.calls[0][0].body));
      expect(body.messages[0].content[1].image.source.bytes).toBe('YWJj');
      expect(body.outputConfig).toEqual({ effort: 'low' });
      expect(body.requestMetadata).toEqual({ suite: 'parity' });
    } finally {
      client.destroy();
    }
  });

  it('supports Prompt management without sending prohibited inference defaults', async () => {
    const { provider, send } = fixture(
      { promptVariables: { question: { text: 'hello' } } },
      'arn:aws:bedrock:us-east-1:123456789012:prompt/ABCDEFGHIJ:1',
    );
    expect((await provider.callApi('')).error).toBeUndefined();
    const { input } = send.mock.calls[0][0];
    for (const key of [
      'inferenceConfig',
      'additionalModelRequestFields',
      'system',
      'toolConfig',
      'messages',
    ]) {
      expect(input).not.toHaveProperty(key);
    }
    expect(input.promptVariables.question.text).toBe('hello');
  });

  it('rejects explicit overrides prohibited by Prompt management', async () => {
    const { provider, send } = fixture(
      { maxTokens: 10 },
      'arn:aws:bedrock:us-east-1:123456789012:prompt/ABCDEFGHIJ:1',
    );
    expect((await provider.callApi('hello')).error).toContain('Prompt management');
    expect(send).not.toHaveBeenCalled();
  });
});

describe('ConverseStream response parity', () => {
  it('collects generated image bytes and server tool results', async () => {
    const { provider, send } = fixture({ streaming: true });
    send.mockResolvedValue(
      stream([
        { contentBlockStart: { contentBlockIndex: 0, start: { image: { format: 'png' } } } },
        {
          contentBlockDelta: {
            contentBlockIndex: 0,
            delta: { image: { source: { bytes: Buffer.from('ab') } } },
          },
        },
        {
          contentBlockDelta: {
            contentBlockIndex: 0,
            delta: { image: { source: { bytes: Buffer.from('cd') } } },
          },
        },
        {
          contentBlockStart: {
            contentBlockIndex: 1,
            start: { toolResult: { toolUseId: 'lookup', status: 'success', type: 'web_search' } },
          },
        },
        { contentBlockDelta: { contentBlockIndex: 1, delta: { toolResult: [{ text: 'part ' }] } } },
        {
          contentBlockDelta: {
            contentBlockIndex: 1,
            delta: { toolResult: [{ text: 'two' }, { json: { source: 'example' } }] },
          },
        },
        { messageStop: { stopReason: 'end_turn' } },
      ]),
    );
    const result = await provider.callApi('hello');
    expect(result.error).toBeUndefined();
    expect(result.metadata?.content).toEqual([
      { image: { format: 'png', source: { bytes: Buffer.from('abcd') } } },
      {
        toolResult: {
          toolUseId: 'lookup',
          status: 'success',
          type: 'web_search',
          content: [{ text: 'part two' }, { json: { source: 'example' } }],
        },
      },
    ]);
    expect(result.output).toContain('part two');
  });

  it('rejects invalid local tool arguments without invoking the callback', async () => {
    const callback = vi.fn();
    const { provider, send } = fixture({
      streaming: true,
      functionToolCallbacks: { lookup: callback },
    });
    send.mockResolvedValue(
      stream([
        {
          contentBlockStart: {
            contentBlockIndex: 0,
            start: { toolUse: { name: 'lookup', toolUseId: 'id' } },
          },
        },
        { contentBlockDelta: { contentBlockIndex: 0, delta: { toolUse: { input: '{broken' } } } },
        { messageStop: { stopReason: 'tool_use' } },
      ]),
    );
    expect((await provider.callApi('hello')).error).toContain('invalid JSON arguments');
    expect(callback).not.toHaveBeenCalled();
  });

  it('keeps citations, signatures, redacted blocks, usage, guardrails and metadata', async () => {
    const { provider, send } = fixture({ streaming: true });
    send.mockResolvedValue(
      stream([
        {
          contentBlockDelta: {
            contentBlockIndex: 0,
            delta: { reasoningContent: { text: 'thinking' } },
          },
        },
        {
          contentBlockDelta: {
            contentBlockIndex: 0,
            delta: { reasoningContent: { signature: 'signed' } },
          },
        },
        {
          contentBlockDelta: {
            contentBlockIndex: 1,
            delta: { reasoningContent: { redactedContent: Buffer.from('abc') } },
          },
        },
        { contentBlockDelta: { contentBlockIndex: 2, delta: { text: 'Answer' } } },
        {
          contentBlockDelta: {
            contentBlockIndex: 2,
            delta: { citation: { title: 'source', sourceContent: [{ text: 'evidence' }] } },
          },
        },
        { contentBlockDelta: { contentBlockIndex: 2, delta: { text: ' with evidence' } } },
        {
          messageStop: {
            stopReason: 'guardrail_intervened',
            additionalModelResponseFields: { stop_sequence: 'END' },
          },
        },
        {
          metadata: {
            usage: {
              inputTokens: 5,
              outputTokens: 8,
              totalTokens: 13,
              cacheReadInputTokens: 2,
              cacheWriteInputTokens: 3,
            },
            metrics: { latencyMs: 42 },
            trace: { guardrail: {} },
            serviceTier: { type: 'default' },
            performanceConfig: { latency: 'standard' },
          },
        },
      ]),
    );
    const result = await provider.callApi('hello');
    expect(result.error).toBeUndefined();
    expect(result.output).toContain('Answer with evidence');
    expect(result.output).toContain('Signature: signed');
    expect(result.guardrails?.flagged).toBe(true);
    expect(result.tokenUsage).toMatchObject({ prompt: 5, completion: 8, total: 13, cached: 2 });
    expect(result.metadata).toMatchObject({
      latencyMs: 42,
      trace: { guardrail: {} },
      cacheTokens: { read: 2, write: 3 },
      additionalModelResponseFields: { stop_sequence: 'END' },
      serviceTier: { type: 'default' },
      performanceConfig: { latency: 'standard' },
    });
    expect(result.metadata?.content).toEqual([
      { reasoningContent: { reasoningText: { text: 'thinking', signature: 'signed' } } },
      { reasoningContent: { redactedContent: Buffer.from('abc') } },
      {
        citationsContent: {
          content: [{ text: 'Answer with evidence' }],
          citations: [{ title: 'source', sourceContent: [{ text: 'evidence' }] }],
        },
      },
    ]);
  });

  it('executes local callbacks after collecting tool arguments', async () => {
    const callback = vi.fn().mockResolvedValue('Tool result');
    const { provider, send } = fixture({
      streaming: true,
      functionToolCallbacks: { lookup: callback },
    });
    send.mockResolvedValue(
      stream([
        { contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'Checking' } } },
        {
          contentBlockStart: {
            contentBlockIndex: 1,
            start: { toolUse: { name: 'lookup', toolUseId: 'id' } },
          },
        },
        { contentBlockDelta: { contentBlockIndex: 1, delta: { toolUse: { input: '{"x":' } } } },
        { contentBlockDelta: { contentBlockIndex: 1, delta: { toolUse: { input: '1}' } } } },
        { messageStop: { stopReason: 'tool_use' } },
      ]),
    );
    const result = await provider.callApi('hello');
    expect(result.error).toBeUndefined();
    expect(callback).toHaveBeenCalledOnce();
    expect(result.output).toContain('Checking');
    expect(result.output).toContain('Tool result');
  });

  it.each([
    'internalServerException',
    'modelStreamErrorException',
    'serviceUnavailableException',
    'throttlingException',
    'validationException',
  ])('reports %s without executing a pending tool', async (name) => {
    const callback = vi.fn();
    const { provider, send } = fixture({
      streaming: true,
      functionToolCallbacks: { lookup: callback },
    });
    send.mockResolvedValue(
      stream([
        {
          contentBlockStart: {
            contentBlockIndex: 0,
            start: { toolUse: { name: 'lookup', toolUseId: 'id' } },
          },
        },
        { contentBlockDelta: { contentBlockIndex: 0, delta: { toolUse: { input: '{}' } } } },
        { [name]: { message: 'fixture failure' } },
      ]),
    );
    expect((await provider.callApi('hello')).error).toContain(name);
    expect(callback).not.toHaveBeenCalled();
  });

  it.each([
    {},
    stream([{ contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'partial' } } }]),
  ])('rejects missing or incomplete streams', async (response) => {
    const { provider, send } = fixture({ streaming: true });
    send.mockResolvedValue(response);
    const result = await provider.callApi('hello');
    expect(result.error).toBeDefined();
    expect(result.output).toBeUndefined();
  });
});
