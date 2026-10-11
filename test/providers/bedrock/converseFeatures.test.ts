import {
  BedrockRuntime,
  ConverseCommand,
  ConverseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as blobStorage from '../../../src/blobs';
import { extractAndStoreBinaryData } from '../../../src/blobs/extractor';
import { materializeImageOutputsForGrading } from '../../../src/matchers/rubric';
import { getTableCellMedia } from '../../../src/presentation/evalTableCells';
import {
  AwsBedrockConverseProvider,
  type BedrockConverseOptions,
  parseConverseMessages,
} from '../../../src/providers/bedrock/converse';
import * as genaiTracer from '../../../src/tracing/genaiTracer';

import type { CallApiContextParams } from '../../../src/types/providers';

const cache = vi.hoisted(() => ({ enabled: false, get: vi.fn(), set: vi.fn() }));
vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/cache')>()),
  isCacheEnabled: () => cache.enabled,
  getCache: async () => cache,
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

beforeEach(() => {
  cache.enabled = false;
  cache.get.mockReset();
  cache.set.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('Converse native request features', () => {
  it('omits empty OpenAI tool descriptions while preserving strict schemas', async () => {
    const { provider, send } = fixture({
      tools: [
        {
          type: 'function',
          function: {
            name: 'lookup',
            description: '',
            strict: true,
            parameters: { type: 'object', properties: {} },
          },
        },
      ],
    });
    expect((await provider.callApi('hello')).error).toBeUndefined();
    const spec = send.mock.calls[0][0].input.toolConfig.tools[0].toolSpec;
    expect(spec).not.toHaveProperty('description');
    expect(spec.strict).toBe(true);
  });

  it('keeps text-only max-token responses without invoking tools', async () => {
    const { provider, send } = fixture({ streaming: true });
    send.mockResolvedValueOnce(
      stream([
        { contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'Partial answer' } } },
        { contentBlockStop: { contentBlockIndex: 0 } },
        { messageStop: { stopReason: 'max_tokens' } },
        { metadata: { usage: reply.usage } },
      ]),
    );
    const response = await provider.callApi('hello');
    expect(response.error).toBeUndefined();
    expect(response.output).toBe('Partial answer');
  });

  it('preserves unknown token counts when usage is absent', async () => {
    const { provider, send } = fixture();
    send.mockResolvedValueOnce({ ...reply, usage: undefined });
    const response = await provider.callApi('hello');
    expect(response.tokenUsage).toEqual({
      prompt: undefined,
      completion: undefined,
      total: undefined,
      numRequests: 1,
    });
  });

  it.each(
    ['malformed_tool_use', 'malformed_model_output', 'tool_use'].flatMap((stopReason) =>
      [false, true].map((hasText) => ({ stopReason, hasText })),
    ),
  )('rejects $stopReason without tool blocks (text: $hasText)', async ({ stopReason, hasText }) => {
    cache.enabled = true;
    const callback = vi.fn();
    const mcpCall = vi.fn();
    const { provider, send } = fixture({
      streaming: true,
      functionToolCallbacks: { lookup: callback },
    });
    Object.assign(provider, {
      mcpClient: { getAllTools: () => [{ name: 'remote' }], callTool: mcpCall },
    });
    send.mockResolvedValueOnce(
      stream([
        ...(hasText
          ? [
              { contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'Partial answer' } } },
              { contentBlockStop: { contentBlockIndex: 0 } },
            ]
          : []),
        { messageStop: { stopReason } },
        { metadata: { usage: reply.usage } },
      ]),
    );
    const response = await provider.callApi('hello');
    expect(response.error).toBeDefined();
    expect(response.output).toBe(hasText ? 'Partial answer' : '');
    expect(response.metadata?.content).toEqual(hasText ? [{ text: 'Partial answer' }] : []);
    expect(response.tokenUsage).toMatchObject({ prompt: 3, completion: 2, total: 5 });
    expect(response.cost).toBeGreaterThan(0);
    expect(callback).not.toHaveBeenCalled();
    expect(mcpCall).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it.each([
    'max_tokens',
    'malformed_tool_use',
    'malformed_model_output',
    'guardrail_intervened',
    'end_turn',
  ])('does not cache or execute interrupted streamed client tools after %s', async (stopReason) => {
    cache.enabled = true;
    const callback = vi.fn().mockResolvedValue('side effect');
    const mcpCall = vi.fn().mockResolvedValue({ content: [] });
    const { provider, send } = fixture({
      streaming: true,
      functionToolCallbacks: { local: callback },
    });
    Object.assign(provider, {
      mcpClient: { getAllTools: () => [{ name: 'remote' }], callTool: mcpCall },
    });
    send.mockResolvedValueOnce(
      stream([
        {
          contentBlockStart: {
            contentBlockIndex: 0,
            start: { toolUse: { toolUseId: 'local-1', name: 'local' } },
          },
        },
        { contentBlockDelta: { contentBlockIndex: 0, delta: { toolUse: { input: '{}' } } } },
        { contentBlockStop: { contentBlockIndex: 0 } },
        {
          contentBlockStart: {
            contentBlockIndex: 1,
            start: { toolUse: { toolUseId: 'remote-1', name: 'remote' } },
          },
        },
        { contentBlockStop: { contentBlockIndex: 1 } },
        { messageStop: { stopReason } },
        { metadata: { usage: reply.usage } },
      ]),
    );
    const response = await provider.callApi('hello');
    expect(response.error).toContain(`stopped with ${stopReason}`);
    expect(response.tokenUsage).toMatchObject({ prompt: 3, completion: 2, total: 5 });
    expect(response.cost).toBeGreaterThan(0);
    expect(callback).not.toHaveBeenCalled();
    expect(mcpCall).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it.each(['end_turn', 'tool_use'])(
    'preserves completed server tool streams ending in %s without executing matching local callbacks',
    async (stopReason) => {
      cache.enabled = true;
      const callback = vi.fn();
      const { provider, send } = fixture({
        streaming: true,
        functionToolCallbacks: { search: callback },
      });
      send.mockResolvedValueOnce(
        stream([
          {
            contentBlockStart: {
              contentBlockIndex: 0,
              start: {
                toolUse: { type: 'server_tool_use', toolUseId: 'search-1', name: 'search' },
              },
            },
          },
          {
            contentBlockDelta: {
              contentBlockIndex: 0,
              delta: { toolUse: { input: '{"query":"hello"}' } },
            },
          },
          { contentBlockStop: { contentBlockIndex: 0 } },
          { messageStop: { stopReason } },
          { metadata: { usage: reply.usage } },
        ]),
      );
      const response = await provider.callApi('hello');
      expect(response.error).toBeUndefined();
      expect(response.metadata?.content).toEqual([
        {
          toolUse: {
            type: 'server_tool_use',
            toolUseId: 'search-1',
            name: 'search',
            input: { query: 'hello' },
          },
        },
      ]);
      expect(callback).not.toHaveBeenCalled();
      expect(cache.set).toHaveBeenCalledOnce();
    },
  );

  it.each(
    ['service_unavailable', 'invalid_query', 'max_tool_invocations'].flatMap((stopReason) =>
      [false, true].map((streaming) => ({ stopReason, streaming })),
    ),
  )(
    'rejects server tool failure $stopReason with streaming=$streaming',
    async ({ stopReason, streaming }) => {
      cache.enabled = true;
      const callback = vi.fn();
      const mcpCall = vi.fn();
      const { provider, send } = fixture({
        streaming,
        functionToolCallbacks: { search: callback },
      });
      Object.assign(provider, {
        mcpClient: { getAllTools: () => [{ name: 'search' }], callTool: mcpCall },
      });
      const toolUse = { type: 'server_tool_use', toolUseId: 'search-1', name: 'search', input: {} };
      send.mockResolvedValueOnce(
        streaming
          ? stream([
              { contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'Partial answer' } } },
              { contentBlockStop: { contentBlockIndex: 0 } },
              { contentBlockStart: { contentBlockIndex: 1, start: { toolUse } } },
              { contentBlockStop: { contentBlockIndex: 1 } },
              { messageStop: { stopReason } },
              { metadata: { usage: reply.usage } },
            ])
          : {
              ...reply,
              stopReason,
              output: {
                message: { role: 'assistant', content: [{ text: 'Partial answer' }, { toolUse }] },
              },
            },
      );
      const response = await provider.callApi('hello');
      expect(response.error).toContain(stopReason);
      expect(response.output).toContain('Partial answer');
      expect(response.metadata).toMatchObject({
        stopReason,
        isModelError: true,
        content: [{ text: 'Partial answer' }, { toolUse }],
      });
      expect(response.tokenUsage).toMatchObject({
        prompt: 3,
        completion: 2,
        total: 5,
        numRequests: 1,
      });
      expect(response.cost).toBeGreaterThan(0);
      expect(callback).not.toHaveBeenCalled();
      expect(mcpCall).not.toHaveBeenCalled();
      expect(cache.set).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    'retries previously cached model failures with streaming=%s',
    async (streaming) => {
      cache.enabled = true;
      cache.get.mockResolvedValueOnce(
        JSON.stringify({ ...reply, stopReason: 'service_unavailable' }),
      );
      const { provider, send } = fixture({ streaming });
      if (streaming) {
        send.mockResolvedValueOnce(
          stream([
            { contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'READY' } } },
            { contentBlockStop: { contentBlockIndex: 0 } },
            { messageStop: { stopReason: 'end_turn' } },
            { metadata: { usage: reply.usage } },
          ]),
        );
      }
      const response = await provider.callApi('hello');
      expect(response.error).toBeUndefined();
      expect(response.cached).not.toBe(true);
      expect(response.output).toBe('READY');
      expect(response.tokenUsage?.numRequests).toBe(1);
      expect(send).toHaveBeenCalledOnce();
      expect(cache.set).toHaveBeenCalledOnce();
    },
  );

  it.each([false, true])('accounts for all cached input with streaming=%s', async (streaming) => {
    const { provider, send } = fixture({ streaming }, 'global.anthropic.claude-opus-5-5');
    const usage = {
      inputTokens: 100,
      outputTokens: 10,
      cacheReadInputTokens: 200,
      cacheWriteInputTokens: 300,
    };
    send.mockResolvedValueOnce(
      streaming
        ? stream([
            { contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'READY' } } },
            { contentBlockStop: { contentBlockIndex: 0 } },
            { messageStop: { stopReason: 'end_turn' } },
            { metadata: { usage } },
          ])
        : { ...reply, usage },
    );
    const response = await provider.callApi('hello');
    expect(response.tokenUsage).toMatchObject({
      prompt: 600,
      completion: 10,
      total: 610,
      completionDetails: { cacheReadInputTokens: 200, cacheCreationInputTokens: 300 },
    });
    expect(response.cost).toBeCloseTo((100 * 4 + 200 * 0.2 + 300 * 5 + 10 * 20) / 1e6);
  });

  it('keeps compatibility adapters for untyped content blocks', () => {
    const content = [
      { image: { source: { media_type: 'image/jpeg', data: 'YWJj' } } },
      { image: { source: { bytes: 'YWJj' } } },
      { image: { format: 'jpg', source: { bytes: 'YWJj' } } },
      { document: { source: { bytes: 'YWJj' } } },
      { toolUse: { id: 'call-1', name: 'lookup', input: { query: 'hello' } } },
      { toolResult: { tool_use_id: 'call-1', content: 'ok' } },
      { toolResult: { toolUseId: 'call-2', content: ['first', 'second'] } },
    ];
    const { messages } = parseConverseMessages(JSON.stringify([{ role: 'user', content }]));
    expect(messages[0].content).toEqual([
      { image: { format: 'jpeg', source: { bytes: Buffer.from('abc') } } },
      { image: { format: 'png', source: { bytes: Buffer.from('abc') } } },
      { image: { format: 'jpeg', source: { bytes: Buffer.from('abc') } } },
      { document: { format: 'txt', name: 'document', source: { bytes: Buffer.from('abc') } } },
      { toolUse: { toolUseId: 'call-1', name: 'lookup', input: { query: 'hello' } } },
      { toolResult: { toolUseId: 'call-1', content: [{ text: 'ok' }] } },
      { toolResult: { toolUseId: 'call-2', content: [{ text: 'first' }, { text: 'second' }] } },
    ]);
  });

  it.each([false, true])(
    'normalizes YAML metadata scalars with streaming=%s',
    async (streaming) => {
      const { provider, send } = fixture({
        streaming,
        requestMetadata: { build: 123, enabled: true, label: 'run' } as never,
      });
      if (streaming) {
        send.mockResolvedValueOnce(
          stream([
            { messageStop: { stopReason: 'end_turn' } },
            { metadata: { usage: reply.usage } },
          ]),
        );
      }
      expect((await provider.callApi('hello')).error).toBeUndefined();
      expect(send.mock.calls[0][0].input.requestMetadata).toEqual({
        build: '123',
        enabled: 'true',
        label: 'run',
      });
      expect(provider.config.requestMetadata).toEqual({ build: 123, enabled: true, label: 'run' });
    },
  );

  it.each(
    [false, true].flatMap((streaming) => [false, true].map((fails) => ({ streaming, fails }))),
  )(
    'keeps mixed tool output in response order (streaming=$streaming, failures=$fails)',
    async ({ streaming, fails }) => {
      const callback = fails
        ? vi.fn().mockRejectedValue(new Error('local failed'))
        : vi.fn().mockResolvedValue('LOCAL');
      const mcpCall = vi
        .fn()
        .mockResolvedValue(
          fails
            ? { isError: true, error: 'remote failed', content: 'remote failed' }
            : { content: [{ type: 'text', text: 'REMOTE' }] },
        );
      const { provider, send } = fixture({ streaming, functionToolCallbacks: { local: callback } });
      Object.assign(provider, {
        mcpClient: { getAllTools: () => [{ name: 'remote' }], callTool: mcpCall },
      });
      const content = ['unhandled', 'local', 'remote', 'unhandled-again'].map((name, idx) => ({
        toolUse: { toolUseId: `call-${idx}`, name, input: { idx } },
      }));
      send.mockResolvedValueOnce(
        streaming
          ? stream([
              ...content.flatMap(({ toolUse }, contentBlockIndex) => [
                {
                  contentBlockStart: {
                    contentBlockIndex,
                    start: { toolUse: { name: toolUse.name, toolUseId: toolUse.toolUseId } },
                  },
                },
                {
                  contentBlockDelta: {
                    contentBlockIndex,
                    delta: { toolUse: { input: JSON.stringify(toolUse.input) } },
                  },
                },
                { contentBlockStop: { contentBlockIndex } },
              ]),
              { messageStop: { stopReason: 'tool_use' } },
              { metadata: { usage: reply.usage } },
            ])
          : {
              ...reply,
              output: { message: { role: 'assistant', content } },
              stopReason: 'tool_use',
            },
      );
      const result = await provider.callApi('hello');
      const fallback = (idx: number) =>
        JSON.stringify({
          type: 'tool_use',
          id: `call-${idx}`,
          name: content[idx].toolUse.name,
          input: { idx },
        });
      expect(result.output).toBe(
        [
          fallback(0),
          fails ? fallback(1) : 'LOCAL',
          fails ? 'MCP Tool Error (remote): remote failed' : 'MCP Tool Result (remote): REMOTE',
          fallback(3),
        ].join('\n'),
      );
      expect(callback).toHaveBeenCalledTimes(1);
      expect(mcpCall).toHaveBeenCalledTimes(1);
      expect(result.error).toBe(fails ? 'MCP Tool Error (remote): remote failed' : undefined);
      expect(result.tokenUsage).toMatchObject({ prompt: 3, completion: 2, total: 5 });
    },
  );

  it.each([false, true])(
    'excludes logging metadata from cache keys with streaming=%s',
    async (streaming) => {
      cache.enabled = true;
      const { provider, send } = fixture({
        streaming,
        requestMetadata: { tenantToken: 'first-token' },
      });
      const events = [
        { messageStop: { stopReason: 'end_turn' } },
        { metadata: { usage: reply.usage } },
      ];
      if (streaming) {
        send.mockImplementation(async () => stream(events));
      }
      await provider.callApi('hello');
      provider.config.requestMetadata = { tenantToken: 'rotated-token' };
      await provider.callApi('hello');
      expect(cache.get.mock.calls[0][0]).toBe(cache.get.mock.calls[1][0]);
      expect(send.mock.calls.map(([command]) => command.input.requestMetadata)).toEqual([
        { tenantToken: 'first-token' },
        { tenantToken: 'rotated-token' },
      ]);
    },
  );

  it.each([false, true])('reports the required IAM action with streaming=%s', async (streaming) => {
    const { provider, send } = fixture({ streaming });
    send.mockRejectedValueOnce(new Error('AccessDeniedException: not authorized'));
    const response = await provider.callApi('hello');
    expect(response.error).toContain(
      `bedrock:${streaming ? 'InvokeModelWithResponseStream' : 'InvokeModel'} permission`,
    );
  });

  it('concatenates citation text fragments without adding separators', async () => {
    const { provider, send } = fixture();
    send.mockResolvedValueOnce({
      ...reply,
      output: {
        message: {
          role: 'assistant',
          content: [
            {
              citationsContent: {
                content: [{ text: 'The answer ' }, { text: 'is READY.' }],
                citations: [],
              },
            },
          ],
        },
      },
    });
    expect((await provider.callApi('hello')).output).toBe('The answer is READY.');
  });

  it.each(['none', 'auto'])(
    'lets prompt-native tool choice override provider %s',
    async (toolChoice) => {
      const { provider, send } = fixture({ tool_choice: toolChoice as 'none' | 'auto' });
      const toolConfig = {
        tools: [{ toolSpec: { name: 'lookup', inputSchema: { json: { type: 'object' } } } }],
        toolChoice: { any: {} },
      };
      const result = await provider.callApi('hello', {
        prompt: { raw: 'hello', label: 'hello', config: { toolConfig } },
        vars: {},
      });
      expect(result.error).toBeUndefined();
      expect(send.mock.calls[0][0].input.toolConfig).toEqual(toolConfig);
    },
  );

  it('normalizes thinking with native output effort', async () => {
    const { provider, send } = fixture(
      { thinking: { type: 'disabled' }, outputConfig: { effort: 'max' } },
      'us.anthropic.claude-opus-5',
    );
    expect((await provider.callApi('hello')).error).toBeUndefined();
    expect(send.mock.calls[0][0].input.additionalModelRequestFields?.thinking).toBeUndefined();
  });

  it('coerces native guardrail values loaded as YAML numbers', async () => {
    const { provider, send } = fixture({
      guardrailConfig: {
        guardrailIdentifier: 123 as unknown as string,
        guardrailVersion: 2 as unknown as string,
      },
    });
    expect((await provider.callApi('hello')).error).toBeUndefined();
    expect(send.mock.calls[0][0].input.guardrailConfig).toEqual({
      guardrailIdentifier: '123',
      guardrailVersion: '2',
    });
  });

  it('renders managed prompt variables separately for each test and permits an MCP executor', async () => {
    const { provider, send } = fixture(
      { promptVariables: { question: { text: '{{question}}' } } },
      'arn:aws:bedrock:us-east-1:123456789012:prompt/ABCDEFGHIJ:1',
    );
    Object.assign(provider, { mcpClient: { getAllTools: () => [] } });
    for (const question of ['first', 'second']) {
      expect(
        (await provider.callApi('', { prompt: { raw: '', label: '' }, vars: { question } })).error,
      ).toBeUndefined();
    }
    expect(send.mock.calls.map(([command]) => command.input.promptVariables.question.text)).toEqual(
      ['first', 'second'],
    );
    expect(send.mock.calls[0][0].input).not.toHaveProperty('toolConfig');
  });

  it('traces the native inference configuration sent to AWS', async () => {
    const span = vi.spyOn(genaiTracer, 'withGenAISpan');
    const { provider } = fixture({
      inferenceConfig: { maxTokens: 12, temperature: 0.1, topP: 0.9, stopSequences: ['END'] },
    });
    await provider.callApi('hello');
    expect(span.mock.calls[0][0]).toMatchObject({
      maxTokens: 12,
      temperature: 0.1,
      topP: 0.9,
      stopSequences: ['END'],
    });
  });

  it.each([false, true])(
    'decodes native system guard images from config=%s',
    async (fromConfig) => {
      const system = [
        {
          guardContent: {
            image: { format: 'png' as const, source: { bytes: 'YWJj' as unknown as Uint8Array } },
          },
        },
      ];
      const { provider, send } = fixture(fromConfig ? { system } : {});
      await provider.callApi(
        fromConfig
          ? 'hello'
          : JSON.stringify([
              { role: 'system', content: system },
              { role: 'user', content: 'hello' },
            ]),
      );
      expect(send.mock.calls[0][0].input.system[0].guardContent.image.source.bytes).toEqual(
        Buffer.from('abc'),
      );
      expect(system[0].guardContent.image.source.bytes).toBe('YWJj');
    },
  );
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
      send.mockResolvedValue(
        stream([
          { messageStop: { stopReason: 'end_turn' } },
          { metadata: { usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } } },
        ]),
      );
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

  it('serializes native tool-change messages, binary content and structured output through the real AWS SDK', async () => {
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
    const toolChanges = [
      { toolRemoval: { tool: { type: 'tool_reference', name: 'lookup' } } },
      { toolAddition: { tool: { type: 'tool_reference', name: 'lookup' } } },
      { text: 'Tool set updated.' },
    ];
    try {
      const result = await provider.callApi(
        JSON.stringify([
          { role: 'system', content: 'Initial instructions' },
          {
            role: 'user',
            content: [
              { text: 'Describe this' },
              { image: { format: 'png', source: { bytes: 'YWJj' } } },
            ],
          },
          { role: 'system', content: toolChanges },
          { role: 'assistant', content: 'Tools updated.' },
          { role: 'user', content: 'Continue.' },
        ]),
      );
      expect(result.output).toBe('READY');
      const body = JSON.parse(String(handle.mock.calls[0][0].body));
      expect(body.messages[0].content[1].image.source.bytes).toBe('YWJj');
      expect(body.system).toEqual([{ text: 'Initial instructions' }]);
      expect(body.messages.map((message: { role: string }) => message.role)).toEqual([
        'user',
        'system',
        'assistant',
        'user',
      ]);
      expect(body.messages[1].content).toEqual(toolChanges);
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
  it('caches complete streams and preserves replay usage', async () => {
    cache.enabled = true;
    const { provider, send } = fixture({ streaming: true });
    send.mockResolvedValue(
      stream([
        { contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'READY' } } },
        { contentBlockStop: { contentBlockIndex: 0 } },
        { messageStop: { stopReason: 'end_turn' } },
        { metadata: { usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 } } },
      ]),
    );
    const first = await provider.callApi('hello');
    expect(first.output).toBe('READY');
    expect(cache.set).toHaveBeenCalledOnce();
    cache.get.mockResolvedValue(cache.set.mock.calls[0][1]);
    const second = await provider.callApi('hello');
    expect(second.cached).toBe(true);
    expect(second.tokenUsage).toMatchObject({
      prompt: 3,
      completion: 2,
      total: 5,
      cached: 5,
      numRequests: 0,
    });
    expect(send).toHaveBeenCalledOnce();
  });

  it.each([false, true])('honors cache busting with streaming=%s', async (streaming) => {
    cache.enabled = true;
    const { provider, send } = fixture({ streaming });
    if (streaming) {
      send.mockResolvedValue(
        stream([
          { messageStop: { stopReason: 'end_turn' } },
          { metadata: { usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } } },
        ]),
      );
    }
    expect(
      (await provider.callApi('hello', { bustCache: true } as CallApiContextParams)).error,
    ).toBeUndefined();
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'assembles redacted reasoning with linear copying (showThinking=%s)',
    async (showThinking) => {
      const { provider, send } = fixture({ streaming: true, showThinking });
      const chunk = Buffer.alloc(1024, 7);
      const count = 64;
      const events: unknown[] = [];
      for (let i = 0; i < count; i++) {
        for (const contentBlockIndex of [1, 0]) {
          events.push({
            contentBlockDelta: {
              contentBlockIndex,
              delta: { reasoningContent: { redactedContent: chunk } },
            },
          });
        }
      }
      events.push(
        ...[1, 0].map((contentBlockIndex) => ({ contentBlockStop: { contentBlockIndex } })),
        { messageStop: { stopReason: 'end_turn' } },
        { metadata: { usage: reply.usage } },
      );
      send.mockResolvedValueOnce(stream(events));
      const concat = vi.spyOn(Buffer, 'concat');
      const response = await provider.callApi('hello');
      const copiedBytes = concat.mock.calls.reduce(
        (total, [chunks]) => total + chunks.reduce((size, bytes) => size + bytes.length, 0),
        0,
      );
      concat.mockRestore();
      expect(response.error).toBeUndefined();
      expect(copiedBytes).toBeLessThanOrEqual(2 * count * chunk.length);
      expect(response.metadata?.content).toEqual(
        [0, 1].map(() => ({
          reasoningContent: {
            redactedContent: Buffer.alloc(count * chunk.length, 7).toString('base64'),
          },
        })),
      );
      expect(response.output).toBe(
        showThinking ? '<thinking>[Redacted]</thinking>\n\n<thinking>[Redacted]</thinking>' : '',
      );
    },
  );

  it.each([false, true])(
    'exposes native media to grading and table consumers (tools=%s)',
    async (tools) => {
      const { provider, send } = fixture({
        functionToolCallbacks: { local: vi.fn().mockResolvedValue('LOCAL') },
      });
      const image = { image: { format: 'png', source: { bytes: Buffer.from([1, 2, 3]) } } };
      const audio = { audio: { format: 'wav', source: { bytes: Buffer.from([4, 5, 6]) } } };
      const content = [
        image,
        audio,
        { toolResult: { toolUseId: 'server', content: [image, { json: image }] } },
        { image: { format: 'png', source: { s3Location: { uri: 's3://example/image.png' } } } },
        ...(tools ? [{ toolUse: { toolUseId: 'local', name: 'local', input: {} } }] : []),
      ];
      send.mockResolvedValueOnce({
        ...reply,
        output: { message: { role: 'assistant', content } },
        stopReason: tools ? 'tool_use' : 'end_turn',
      });
      const response = await provider.callApi('hello');
      expect(response.error).toBeUndefined();
      expect(response.images).toEqual([0, 1].map(() => ({ data: 'AQID', mimeType: 'image/png' })));
      expect(response.audio).toEqual({ data: 'BAUG', format: 'wav' });
      expect(getTableCellMedia({ response })).toMatchObject({
        images: response.images,
        audio: response.audio,
      });
      expect(materializeImageOutputsForGrading(response.images).imageOutputs).toHaveLength(2);
      expect(response.metadata?.content).toHaveLength(content.length);
      expect(content[0]).toEqual(image);
    },
  );

  it.each([false, true])(
    'keeps large images gradeable after blob extraction (streaming=%s)',
    async (streaming) => {
      vi.stubEnv('PROMPTFOO_INLINE_MEDIA', 'false');
      const bytes = Buffer.alloc(2048, 7);
      const storeBlob = vi.spyOn(blobStorage, 'storeBlob').mockResolvedValue({
        ref: {
          uri: 'promptfoo://blob/image',
          hash: 'image',
          mimeType: 'image/png',
          sizeBytes: bytes.length,
          provider: 'filesystem',
        },
        deduplicated: false,
      });
      const { provider, send } = fixture({ streaming });
      send.mockResolvedValueOnce(
        streaming
          ? stream([
              { messageStart: { role: 'assistant' } },
              { contentBlockStart: { contentBlockIndex: 0, start: { image: { format: 'png' } } } },
              {
                contentBlockDelta: {
                  contentBlockIndex: 0,
                  delta: { image: { source: { bytes } } },
                },
              },
              { contentBlockStop: { contentBlockIndex: 0 } },
              { messageStop: { stopReason: 'end_turn' } },
              { metadata: { usage: reply.usage } },
            ])
          : {
              ...reply,
              output: {
                message: {
                  role: 'assistant',
                  content: [{ image: { format: 'png', source: { bytes } } }],
                },
              },
            },
      );
      const response = await provider.callApi('hello');
      expect(response.error).toBeUndefined();
      const extracted = await extractAndStoreBinaryData(response);
      const { imageData } = materializeImageOutputsForGrading(extracted?.images);
      expect(imageData).toHaveLength(1);
      expect(Buffer.from(imageData[0].base64Data, 'base64')).toEqual(bytes);
      expect(imageData[0].mimeType).toBe('image/png');
      expect(storeBlob).not.toHaveBeenCalled();
    },
  );

  it('retains completed media on generation failure without caching or dispatching tools', async () => {
    cache.enabled = true;
    const callback = vi.fn();
    const { provider, send } = fixture({ functionToolCallbacks: { local: callback } });
    send.mockResolvedValueOnce({
      ...reply,
      stopReason: 'tool_use',
      output: {
        message: {
          role: 'assistant',
          content: [
            { image: { format: 'png', source: { bytes: Buffer.from([1, 2, 3]) } } },
            {
              audio: {
                format: 'wav',
                source: { bytes: Buffer.from([4, 5, 6]) },
                error: { message: 'audio failed' },
              },
            },
            { toolUse: { toolUseId: 'local', name: 'local', input: {} } },
          ],
        },
      },
    });
    const response = await provider.callApi('hello');
    expect(response.error).toContain('audio failed');
    expect(response.images).toEqual([{ data: 'AQID', mimeType: 'image/png' }]);
    expect(response).not.toHaveProperty('audio');
    expect(response.tokenUsage).toMatchObject({ prompt: 3, completion: 2, total: 5 });
    expect(response.cost).toBeGreaterThan(0);
    expect(callback).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('does not normalize errored native media or media-shaped tool JSON', async () => {
    const { provider, send } = fixture();
    const image = {
      format: 'png',
      source: { bytes: Buffer.from([1, 2, 3]) },
      error: { message: 'image failed' },
    };
    const audio = {
      format: 'wav',
      source: { bytes: Buffer.from([4, 5, 6]) },
      error: { message: 'audio failed' },
    };
    send.mockResolvedValueOnce({
      ...reply,
      output: {
        message: {
          role: 'assistant',
          content: [
            { image },
            { audio },
            { toolResult: { toolUseId: 'server', content: [{ json: { image, audio } }] } },
          ],
        },
      },
    });
    const response = await provider.callApi('hello');
    expect(response.error).toContain('image failed');
    expect(response).not.toHaveProperty('images');
    expect(response).not.toHaveProperty('audio');
    expect(response.tokenUsage).toMatchObject({ prompt: 3, completion: 2, total: 5 });
  });

  it('assembles interleaved image chunks with linear copying and preserves source variants', async () => {
    const { provider, send } = fixture({ streaming: true });
    const chunk = Buffer.alloc(1024, 7);
    const count = 128;
    const location = { s3Location: { uri: 's3://example/generated.png' } };
    const events: unknown[] = [0, 1, 2].map((contentBlockIndex) => ({
      contentBlockStart: { contentBlockIndex, start: { image: { format: 'png' } } },
    }));
    for (let i = 0; i < count; i++) {
      for (const contentBlockIndex of [1, 0]) {
        events.push({
          contentBlockDelta: { contentBlockIndex, delta: { image: { source: { bytes: chunk } } } },
        });
      }
    }
    events.push(
      {
        contentBlockDelta: { contentBlockIndex: 2, delta: { image: { source: { bytes: chunk } } } },
      },
      { contentBlockDelta: { contentBlockIndex: 2, delta: { image: { source: location } } } },
      ...[2, 1, 0].map((contentBlockIndex) => ({ contentBlockStop: { contentBlockIndex } })),
      { messageStop: { stopReason: 'end_turn' } },
      { metadata: { usage: reply.usage } },
    );
    send.mockResolvedValueOnce(stream(events));
    const concat = vi.spyOn(Buffer, 'concat');
    const response = await provider.callApi('hello');
    const copiedBytes = concat.mock.calls.reduce(
      (total, [chunks]) => total + chunks.reduce((size, bytes) => size + bytes.length, 0),
      0,
    );
    concat.mockRestore();
    expect(response.error).toBeUndefined();
    expect(copiedBytes).toBeLessThanOrEqual(2 * count * chunk.length);
    expect(response.metadata?.content).toEqual([
      {
        image: {
          format: 'png',
          source: { bytes: Buffer.alloc(count * chunk.length, 7).toString('base64') },
        },
      },
      {
        image: {
          format: 'png',
          source: { bytes: Buffer.alloc(count * chunk.length, 7).toString('base64') },
        },
      },
      { image: { format: 'png', source: location } },
    ]);
  });

  it.each(['buffer', 'uint8array'])(
    'keeps %s media out of text output and preserves native content on cache replay',
    async (kind) => {
      cache.enabled = true;
      const { provider, send } = fixture();
      const bytes =
        kind === 'buffer' ? Buffer.alloc(64 * 1024, 7) : new Uint8Array(64 * 1024).fill(7);
      const json = {
        type: 'Buffer',
        data: [7, 8],
        bytes: { 0: 9 },
        note: 'tool JSON remains intact',
      };
      const content = [
        { text: 'Before media' },
        { image: { format: 'png', source: { bytes } } },
        { audio: { format: 'mp3', source: { bytes } } },
        { video: { format: 'mp4', source: { bytes } } },
        {
          toolResult: {
            toolUseId: 'lookup',
            content: [
              { text: 'Tool text' },
              { json },
              { image: { format: 'png', source: { bytes } } },
              { video: { format: 'mp4', source: { bytes } } },
              { document: { format: 'pdf', name: 'report', source: { bytes } } },
              { document: { name: 'retrieval', source: { text: 'Document evidence' } } },
              { document: { name: 'search', source: { content: [{ text: 'Document content' }] } } },
            ],
          },
        },
        { text: 'After media' },
        { reasoningContent: { redactedContent: bytes } },
      ];
      send.mockResolvedValueOnce({ ...reply, output: { message: { role: 'assistant', content } } });
      const first = await provider.callApi('hello');
      expect(first.error).toBeUndefined();
      expect(first.output).toContain('Before media');
      expect(first.output).toContain('After media');
      expect(first.output).toContain('Tool text');
      expect(first.output).toContain('Document evidence');
      expect(first.output).toContain('Document content');
      expect(first.output).toContain(JSON.stringify(json));
      for (const type of ['Image', 'Audio', 'Video', 'Document']) {
        expect(first.output).toContain(`[${type} output]`);
      }
      expect(first.output.length).toBeLessThan(1024);
      const serializedContent = JSON.parse(JSON.stringify(first.metadata?.content));
      const roundTrip = parseConverseMessages(
        JSON.stringify([{ role: 'assistant', content: serializedContent }]),
      );
      expect(roundTrip.messages[0].content).toEqual(content);
      expect(JSON.stringify(first.metadata).length).toBeLessThan(bytes.length * 10);
      await expect(send.mock.results[0].value).resolves.toMatchObject({
        output: { message: { content } },
      });
      cache.get.mockResolvedValueOnce(cache.set.mock.calls[0][1]);
      const second = await provider.callApi('hello');
      expect(second.cached).toBe(true);
      expect(second.output).toBe(first.output);
      expect(second.metadata?.content).toEqual(first.metadata?.content);
      expect(send).toHaveBeenCalledOnce();
    },
  );

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
        { contentBlockStop: { contentBlockIndex: 0 } },
        { contentBlockStop: { contentBlockIndex: 1 } },
        { messageStop: { stopReason: 'end_turn' } },
        { metadata: { usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } } },
      ]),
    );
    const result = await provider.callApi('hello');
    expect(result.error).toBeUndefined();
    expect(result.metadata?.content).toEqual([
      { image: { format: 'png', source: { bytes: 'YWJjZA==' } } },
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

  it.each(['end_turn', 'tool_use'])(
    'retains terminal usage and partial text after a streamed image error ending in %s',
    async (stopReason) => {
      cache.enabled = true;
      const callback = vi.fn();
      const { provider, send } = fixture({
        streaming: true,
        functionToolCallbacks: { lookup: callback },
      });
      send.mockResolvedValueOnce(
        stream([
          { contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'Partial answer' } } },
          { contentBlockStop: { contentBlockIndex: 0 } },
          { contentBlockStart: { contentBlockIndex: 1, start: { image: { format: 'png' } } } },
          {
            contentBlockDelta: {
              contentBlockIndex: 1,
              delta: { image: { error: { message: 'Generation failed' } } },
            },
          },
          { contentBlockStop: { contentBlockIndex: 1 } },
          {
            contentBlockStart: {
              contentBlockIndex: 2,
              start: { toolUse: { name: 'lookup', toolUseId: 'call-1' } },
            },
          },
          {
            contentBlockDelta: {
              contentBlockIndex: 2,
              delta: { toolUse: { input: '{"value":"retained"}' } },
            },
          },
          { contentBlockStop: { contentBlockIndex: 2 } },
          { messageStop: { stopReason } },
          { metadata: { usage: reply.usage } },
        ]),
      );
      const response = await provider.callApi('hello');
      expect(response.error).toContain('image generation failed: Generation failed');
      expect(response.output).toContain('Partial answer');
      expect(response.output).not.toContain('[Image output]');
      expect(response.metadata?.content).toContainEqual({
        image: { format: 'png', source: undefined, error: { message: 'Generation failed' } },
      });
      expect(response.metadata?.content).toContainEqual({
        toolUse: { name: 'lookup', toolUseId: 'call-1', input: { value: 'retained' } },
      });
      expect(response.tokenUsage).toMatchObject({ prompt: 3, completion: 2, total: 5 });
      expect(response.cost).toBeGreaterThan(0);
      expect(callback).not.toHaveBeenCalled();
      expect(cache.set).not.toHaveBeenCalled();
    },
  );

  it.each(['image', 'audio', 'tool-result-image'])(
    'rejects and retries %s response errors without caching or executing tools',
    async (kind) => {
      cache.enabled = true;
      const callback = vi.fn();
      const { provider, send } = fixture({ functionToolCallbacks: { lookup: callback } });
      const media = {
        [kind === 'audio' ? 'audio' : 'image']: { error: { message: 'Generation failed' } },
      };
      const content = [
        { text: 'Partial answer' },
        kind === 'tool-result-image'
          ? { toolResult: { toolUseId: 'server-1', content: [media] } }
          : media,
        { toolUse: { name: 'lookup', toolUseId: 'call-1', input: { value: 'retained' } } },
      ];
      const failed = {
        ...reply,
        stopReason: 'tool_use',
        output: { message: { role: 'assistant', content } },
      };
      cache.get.mockResolvedValue(JSON.stringify(failed));
      send.mockResolvedValueOnce(failed);
      const response = await provider.callApi('hello');
      expect(response.error).toContain('generation failed: Generation failed');
      expect(response.output).toContain('Partial answer');
      expect(response.output).not.toContain('[Image output]');
      expect(response.output).not.toContain('[Audio output]');
      expect(response.cached).not.toBe(true);
      expect(response.metadata?.isModelError).toBe(true);
      expect(response.tokenUsage).toMatchObject({
        prompt: 3,
        completion: 2,
        total: 5,
        numRequests: 1,
      });
      expect(response.cost).toBeGreaterThan(0);
      expect(send).toHaveBeenCalledOnce();
      expect(callback).not.toHaveBeenCalled();
      expect(cache.set).not.toHaveBeenCalled();
    },
  );

  it('does not classify error-shaped tool JSON as a media failure', async () => {
    const { provider, send } = fixture();
    const json = {
      image: { error: { message: 'application data' } },
      audio: { error: { message: 'application data' } },
    };
    send.mockResolvedValueOnce({
      ...reply,
      output: {
        message: {
          role: 'assistant',
          content: [{ toolResult: { toolUseId: 'call-1', content: [{ json }] } }],
        },
      },
    });
    const response = await provider.callApi('hello');
    expect(response.error).toBeUndefined();
    expect(response.output).toContain(JSON.stringify(json));
  });

  it.each(['malformed_tool_use', 'service_unavailable', 'max_tokens'])(
    'retains valid and invalid tool arguments after %s without dispatch or caching',
    async (stopReason) => {
      cache.enabled = true;
      const callback = vi.fn();
      const { provider, send } = fixture({
        streaming: true,
        functionToolCallbacks: { lookup: callback },
      });
      const inputs = ['{"query":"diagnostic value"}', '{"broken":diagnostic'];
      send.mockResolvedValueOnce(
        stream([
          ...inputs.flatMap((input, contentBlockIndex) => [
            {
              contentBlockStart: {
                contentBlockIndex,
                start: { toolUse: { name: 'lookup', toolUseId: String(contentBlockIndex) } },
              },
            },
            { contentBlockDelta: { contentBlockIndex, delta: { toolUse: { input } } } },
            { contentBlockStop: { contentBlockIndex } },
          ]),
          { messageStop: { stopReason } },
          { metadata: { usage: reply.usage } },
        ]),
      );
      const response = await provider.callApi('hello');
      expect(response.error).toContain(stopReason);
      expect(response.metadata?.content).toEqual([
        { toolUse: { name: 'lookup', toolUseId: '0', input: { query: 'diagnostic value' } } },
        { toolUse: { name: 'lookup', toolUseId: '1', input: inputs[1] } },
      ]);
      expect(response.output).toContain('diagnostic value');
      expect(response.output).toContain('broken');
      expect(response.tokenUsage).toMatchObject({ prompt: 3, completion: 2, total: 5 });
      expect(response.cost).toBeGreaterThan(0);
      expect(callback).not.toHaveBeenCalled();
      expect(cache.set).not.toHaveBeenCalled();
    },
  );

  it.each(['{broken', 'null', '[]', '1'])(
    'rejects invalid local tool arguments %s without invoking the callback',
    async (input) => {
      cache.enabled = true;
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
          { contentBlockDelta: { contentBlockIndex: 0, delta: { toolUse: { input } } } },
          { contentBlockStop: { contentBlockIndex: 0 } },
          { messageStop: { stopReason: 'tool_use' } },
          { metadata: { usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } } },
        ]),
      );
      const response = await provider.callApi('hello');
      expect(response.error).toContain('invalid JSON arguments');
      expect(response.tokenUsage).toMatchObject({ prompt: 0, completion: 0, total: 0 });
      expect(response.cost).toBe(0);
      expect(cache.set).not.toHaveBeenCalled();
      expect(callback).not.toHaveBeenCalled();
    },
  );

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
        { contentBlockStop: { contentBlockIndex: 0 } },
        { contentBlockStop: { contentBlockIndex: 1 } },
        { contentBlockStop: { contentBlockIndex: 2 } },
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
              totalTokens: 18,
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
    expect(result.tokenUsage).toMatchObject({ prompt: 10, completion: 8, total: 18, cached: 2 });
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
      { reasoningContent: { redactedContent: 'YWJj' } },
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
        { contentBlockStop: { contentBlockIndex: 0 } },
        { contentBlockStop: { contentBlockIndex: 1 } },
        { messageStop: { stopReason: 'tool_use' } },
        { metadata: { usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } } },
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
    expect(result.tokenUsage).toBeUndefined();
    expect(result.cost).toBeUndefined();
  });
});

describe('native Converse configuration and cached binary parity', () => {
  it('retains provider-native tools when a prompt overrides only tool choice', async () => {
    const tools = [{ toolSpec: { name: 'lookup', inputSchema: { json: { type: 'object' } } } }];
    const { provider, send } = fixture({ toolConfig: { tools } });
    await provider.callApi('hello', {
      vars: {},
      prompt: { raw: 'hello', label: 'hello', config: { toolConfig: { toolChoice: { any: {} } } } },
    });
    expect(send.mock.calls[0][0].input.toolConfig).toEqual({ tools, toolChoice: { any: {} } });
  });

  it.each(['direct', 'additional'])(
    'normalizes native inferenceConfig for %s Nova reasoning',
    async (source) => {
      const reasoningConfig = { type: 'enabled', maxReasoningEffort: 'high' } as const;
      const { provider, send } = fixture({
        inferenceConfig: { maxTokens: 100, temperature: 0.5, topP: 0.9, stopSequences: ['END'] },
        ...(source === 'direct'
          ? { reasoningConfig }
          : { additionalModelRequestFields: { reasoningConfig } }),
      });
      await provider.callApi('hello');
      expect(send.mock.calls[0][0].input.inferenceConfig).toEqual({ stopSequences: ['END'] });
    },
  );

  it('normalizes deprecated Claude sampling in native inferenceConfig', async () => {
    const { provider, send } = fixture(
      { inferenceConfig: { maxTokens: 100, temperature: 0.5, topP: 0.9 } },
      'us.anthropic.claude-opus-4-7',
    );
    await provider.callApi('hello');
    expect(send.mock.calls[0][0].input.inferenceConfig).toEqual({ maxTokens: 100 });
  });

  it.each(['typed', 'legacy'])(
    'keeps %s cached native binary content compact without changing tool JSON',
    async (kind) => {
      cache.enabled = true;
      const { provider, send } = fixture();
      const content = [
        { text: 'READY' },
        { image: { format: 'png', source: { bytes: new Uint8Array([1, 2, 3]) } } },
        { reasoningContent: { redactedContent: Buffer.from([4, 5]) } },
        {
          toolResult: {
            toolUseId: 'tool',
            content: [{ json: { bytes: { 0: 1, 1: 2 }, type: 'Buffer', data: [7] } }],
          },
        },
      ];
      send.mockResolvedValue({ ...reply, output: { message: { role: 'assistant', content } } });
      const first = await provider.callApi('hello');
      cache.get.mockResolvedValue(
        kind === 'legacy'
          ? JSON.stringify({ ...reply, output: { message: { role: 'assistant', content } } })
          : cache.set.mock.calls[0][1],
      );
      const second = await provider.callApi('hello');
      expect(second.error).toBeUndefined();
      expect(second.cached).toBe(true);
      expect(second.output).toEqual(first.output);
      const cachedContent = second.metadata?.content as any[];
      expect(cachedContent[1].image.source.bytes).toBe('AQID');
      expect(cachedContent[2].reasoningContent.redactedContent).toBe('BAU=');
      expect(cachedContent[3].toolResult.content[0].json).toEqual(
        content[3].toolResult?.content[0].json,
      );
    },
  );
});

it.each(['metadata', 'contentBlockStop'])(
  'rejects missing %s without executing or caching a pending tool',
  async (missing) => {
    cache.enabled = true;
    const callback = vi.fn();
    const { provider, send } = fixture({
      streaming: true,
      functionToolCallbacks: { lookup: callback },
    });
    const events = [
      {
        contentBlockStart: {
          contentBlockIndex: 0,
          start: { toolUse: { name: 'lookup', toolUseId: 'id' } },
        },
      },
      { contentBlockDelta: { contentBlockIndex: 0, delta: { toolUse: { input: '{}' } } } },
      { contentBlockStop: { contentBlockIndex: 0 } },
      { messageStop: { stopReason: 'tool_use' } },
      { metadata: { usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } } },
    ].filter((event) => !(missing in event));
    send.mockResolvedValue(stream(events));
    const result = await provider.callApi('hello');
    expect(result.error).toContain(
      missing === 'metadata' ? 'terminal metadata' : 'contentBlockStop',
    );
    expect(result.output).toBeUndefined();
    expect(callback).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  },
);

it.each(['toolChoice', 'tool_choice'])(
  'rejects managed prompt %s overrides from both config levels',
  async (key) => {
    for (const promptLevel of [false, true]) {
      const override = { [key]: 'auto' };
      const { provider, send } = fixture(
        promptLevel ? {} : override,
        'arn:aws:bedrock:us-east-1:123456789012:prompt/ABCDEFGHIJ:1',
      );
      const result = await provider.callApi(
        'hello',
        promptLevel
          ? { prompt: { raw: 'hello', label: 'hello', config: override }, vars: {} }
          : undefined,
      );
      expect(result.error).toContain('Prompt management');
      expect(send).not.toHaveBeenCalled();
    }
  },
);
