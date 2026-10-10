import { BedrockAgentRuntime } from '@aws-sdk/client-bedrock-agent-runtime';
import { BedrockRuntime } from '@aws-sdk/client-bedrock-runtime';
import { EventStreamCodec } from '@smithy/core/event-streams';
import { NumericValue } from '@smithy/core/serde';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AwsBedrockNativeApiProvider } from '../../../src/providers/bedrock/nativeApi';
import { providerRegistry } from '../../../src/providers/providerRegistry';

async function* events(items: unknown[]) {
  yield* items;
}
const metadata = { requestId: 'synthetic-request' };
afterEach(async () => {
  await providerRegistry.shutdownAll();
  vi.restoreAllMocks();
});

function fixture(operation: string, response: any) {
  const provider = new AwsBedrockNativeApiProvider(operation);
  const method = operation[0].toLowerCase() + operation.slice(1);
  const invoke = vi.fn().mockResolvedValue(response);
  const client = { [method]: invoke, destroy: vi.fn() };
  vi.spyOn(provider, 'getBedrockInstance').mockResolvedValue(client as any);
  vi.spyOn(provider, 'getAgentRuntimeClient').mockResolvedValue(client as any);
  return { provider, invoke, client };
}

describe('native Bedrock APIs', () => {
  it.each(['CreateGuardrail', '__proto__', 'invokeModel', ''])(
    'rejects unsupported operations %s',
    (operation) => {
      expect(() => new AwsBedrockNativeApiProvider(operation)).toThrow(
        'Unsupported Bedrock native API',
      );
    },
  );

  it('preserves every InvokeModel transport option and an unfamiliar model body', async () => {
    const { provider, invoke } = fixture('InvokeModel', {
      body: Buffer.from('{"answer":"READY"}'),
      contentType: 'application/json',
      serviceTier: 'flex',
      $metadata: metadata,
    });
    const body = {
      messages: [{ role: 'user', content: 'hello' }],
      new_model_field: { level: 'high' },
      image: 'aGVsbG8=',
    };
    const request = {
      modelId: 'new-provider.future-model:1',
      body,
      trace: 'ENABLED_FULL',
      guardrailIdentifier: 'guardrail',
      guardrailVersion: '1',
      serviceTier: 'flex',
      performanceConfigLatency: 'optimized',
      requestMetadata: '{"suite":"fixture"}',
    };
    const result = await provider.callApi(JSON.stringify(request));
    expect(result.error).toBeUndefined();
    expect(invoke).toHaveBeenCalledWith(
      {
        ...request,
        body: JSON.stringify(body),
        contentType: 'application/json',
        accept: 'application/json',
      },
      { abortSignal: undefined },
    );
    expect(JSON.parse(String(result.output))).toMatchObject({
      body: { answer: 'READY' },
      serviceTier: 'flex',
    });
    expect(result.metadata).toEqual({ operation: 'InvokeModel', aws: metadata });
    expect(result.cost).toBeUndefined();
  });

  it.each(['InvokeModel', 'InvokeModelWithResponseStream'])(
    'distinguishes literal model fields from single-key binary wrappers for %s',
    async (operation) => {
      const literal = { $base64: 'literal metadata', messages: [] };
      const modelJson = JSON.stringify(literal);
      const codec = new EventStreamCodec(
        (bytes) => Buffer.from(bytes).toString('utf8'),
        (text) => Buffer.from(text),
      );
      const encodedEvent = codec.encode({
        headers: {
          ':message-type': { type: 'string', value: 'event' },
          ':event-type': { type: 'string', value: 'chunk' },
          ':content-type': { type: 'string', value: 'application/json' },
        },
        body: Buffer.from(
          JSON.stringify({ bytes: Buffer.from('{"answer":"READY"}').toString('base64') }),
        ),
      });
      const handle = vi.spyOn(NodeHttpHandler.prototype, 'handle').mockImplementation(async () => ({
        response: {
          statusCode: 200,
          headers: {
            'content-type':
              operation === 'InvokeModel'
                ? 'application/json'
                : 'application/vnd.amazon.eventstream',
          },
          body:
            operation === 'InvokeModel'
              ? Buffer.from('{"answer":"READY"}')
              : events([encodedEvent]),
        },
      }));
      const provider = new AwsBedrockNativeApiProvider(operation, {
        config: {
          region: 'us-east-1',
          accessKeyId: 'synthetic',
          secretAccessKey: 'synthetic',
          maxRetries: 0,
        },
      });
      try {
        for (const body of [literal, { $base64: Buffer.from(modelJson).toString('base64') }]) {
          handle.mockClear();
          const result = await provider.callApi(JSON.stringify({ modelId: 'test.model', body }));
          expect(result.error).toBeUndefined();
          expect(result.output).toContain('READY');
          expect(handle).toHaveBeenCalledOnce();
          expect(Buffer.from(handle.mock.calls[0][0].body).toString('utf8')).toBe(modelJson);
        }
        handle.mockClear();
        const invalid = await provider.callApi(
          JSON.stringify({ modelId: 'test.model', body: { $base64: 'not base64' } }),
        );
        expect(invalid.error).toContain('valid padded base64');
        expect(handle).not.toHaveBeenCalled();
      } finally {
        await provider.cleanup();
      }
    },
  );

  it.each([
    'Converse',
    'CountTokens',
    'ApplyGuardrail',
    'InvokeGuardrailChecks',
    'ListAsyncInvokes',
    'GenerateQuery',
    'StartFlowExecution',
    'GetFlowExecution',
    'ListFlowExecutionEvents',
    'StartAsyncInvoke',
    'GetAsyncInvoke',
    'Retrieve',
    'RetrieveAndGenerate',
    'Rerank',
  ])('passes native %s inputs and outputs without narrowing fields', async (operation) => {
    const { provider, invoke } = fixture(operation, {
      result: { extension: true },
      $metadata: metadata,
    });
    const request = { nested: { arbitrary: ['value', 2] }, nextToken: 'cursor' };
    const result = await provider.callApi(JSON.stringify(request));
    expect(result.error).toBeUndefined();
    expect(invoke).toHaveBeenCalledWith(request, { abortSignal: undefined });
    expect(JSON.parse(String(result.output))).toEqual({ result: { extension: true } });
  });

  it.each([
    [
      'InvokeModelWithResponseStream',
      'body',
      { chunk: { bytes: Buffer.from('{"delta":"READY"}') } },
      { chunk: { bytes: { delta: 'READY' } } },
    ],
    [
      'ConverseStream',
      'stream',
      { contentBlockDelta: { delta: { text: 'READY' } } },
      { contentBlockDelta: { delta: { text: 'READY' } } },
    ],
    [
      'RetrieveAndGenerateStream',
      'stream',
      { output: { text: 'READY' } },
      { output: { text: 'READY' } },
    ],
    [
      'InvokeAgent',
      'completion',
      { chunk: { bytes: Buffer.from('READY') } },
      { chunk: { bytes: { $base64: 'UkVBRFk=' } } },
    ],
    [
      'InvokeFlow',
      'responseStream',
      { flowOutputEvent: { content: { document: { result: 'READY' } } } },
      { flowOutputEvent: { content: { document: { result: 'READY' } } } },
    ],
  ] as const)(
    'collects %s native events and metadata',
    async (operation, stream, event, expected) => {
      const { provider } = fixture(operation, {
        [stream]: events([event]),
        executionId: 'execution',
        $metadata: metadata,
      });
      const result = await provider.callApi('{}');
      expect(result.error).toBeUndefined();
      expect(JSON.parse(String(result.output))).toEqual({
        [stream]: [expected],
        executionId: 'execution',
      });
    },
  );

  it.each([
    ['AgenticRetrieveStream', 'stream'],
    ['InvokeInlineAgent', 'completion'],
    ['OptimizePrompt', 'optimizedPrompt'],
  ])('collects %s inference events', async (operation, stream) => {
    const event = { output: { text: 'READY' } };
    const { provider } = fixture(operation, { [stream]: events([event]) });
    const result = await provider.callApi('{}');
    expect(result.error).toBeUndefined();
    expect(JSON.parse(String(result.output))).toEqual({ [stream]: [event] });
  });

  it('decodes only explicit blob wrappers and preserves JSON document bytes fields', async () => {
    const { provider, invoke } = fixture('Converse', {});
    await provider.callApi(
      JSON.stringify({
        messages: [
          {
            content: [
              { image: { source: { bytes: { $base64: 'aGk=' } } } },
              { toolResult: { content: [{ json: { bytes: 'literal' } }] } },
            ],
          },
        ],
      }),
    );
    const input = invoke.mock.calls[0][0];
    expect(input.messages[0].content[0].image.source.bytes).toEqual(Buffer.from('hi'));
    expect(input.messages[0].content[1].toolResult.content[0].json.bytes).toBe('literal');
  });

  it('decodes a multi-megabyte document without overflowing the stack', async () => {
    const bytes = Buffer.alloc(4 * 1024 * 1024, 'a');
    const { provider, invoke } = fixture('Converse', {});
    const result = await provider.callApi(
      JSON.stringify({
        modelId: 'test.model',
        messages: [
          {
            role: 'user',
            content: [
              { text: 'Summarize this document' },
              {
                document: {
                  name: 'fixture',
                  format: 'txt',
                  source: { bytes: { $base64: bytes.toString('base64') } },
                },
              },
            ],
          },
        ],
      }),
    );
    expect(result.error).toBeUndefined();
    const decoded = invoke.mock.calls[0][0].messages[0].content[1].document.source.bytes;
    expect(Buffer.isBuffer(decoded)).toBe(true);
    expect(decoded.equals(bytes)).toBe(true);
  });

  it.each(['A', 'AAA', 'A===', 'AA=A', 'AA==\n', 'AA\r\n', 'AA-_'])(
    'rejects malformed base64 %j before dispatch',
    async (encoded) => {
      const { provider, invoke } = fixture('Converse', {});
      expect(
        (await provider.callApi(JSON.stringify({ blob: { $base64: encoded } }))).error,
      ).toContain('valid padded base64');
      expect(invoke).not.toHaveBeenCalled();
    },
  );

  it('rejects an invalid character after a multi-megabyte base64 prefix', async () => {
    const { provider, invoke } = fixture('Converse', {});
    const encoded =
      Buffer.alloc(4 * 1024 * 1024)
        .toString('base64')
        .slice(0, -1) + '!';
    expect(
      (await provider.callApi(JSON.stringify({ blob: { $base64: encoded } }))).error,
    ).toContain('valid padded base64');
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each(['', 'AA==', 'AAA=', 'AAAA'])('accepts valid base64 %j', async (encoded) => {
    const { provider, invoke } = fixture('Converse', {});
    const result = await provider.callApi(JSON.stringify({ blob: { $base64: encoded } }));
    expect(result.error).toBeUndefined();
    expect(invoke.mock.calls[0][0].blob).toEqual(Buffer.from(encoded, 'base64'));
  });

  it.each(['Converse', 'Retrieve'])(
    'preserves SDK numeric document values for %s',
    async (operation) => {
      const document =
        '"large":9007199254740993,"precise":0.123456789012345678901,"lookalike":{"type":"bigDecimal","string":"2.5"}';
      const body =
        operation === 'Converse'
          ? '{"output":{"message":{"role":"assistant","content":[{"toolUse":{"toolUseId":"tool-id","name":"fixture","input":{' +
            document +
            '}}}]}},"stopReason":"tool_use","usage":{"inputTokens":1,"outputTokens":1,"totalTokens":2},"metrics":{"latencyMs":1}}'
          : '{"retrievalResults":[{"content":{"type":"TEXT","text":"READY"},"metadata":{' +
            document +
            '}}]}';
      const handle = vi.spyOn(NodeHttpHandler.prototype, 'handle').mockResolvedValue({
        response: {
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body: Buffer.from(body),
        },
      });
      const provider = new AwsBedrockNativeApiProvider(operation, {
        config: { region: 'us-east-1', accessKeyId: 'synthetic', secretAccessKey: 'synthetic' },
      });
      try {
        const request =
          operation === 'Converse'
            ? { modelId: 'test.model', messages: [{ role: 'user', content: [{ text: 'hello' }] }] }
            : { knowledgeBaseId: 'KB12345678', retrievalQuery: { text: 'hello' } };
        const result = await provider.callApi(JSON.stringify(request));
        expect(result.error).toBeUndefined();
        expect(result.output).toContain('"large":9007199254740993');
        expect(result.output).toContain('"precise":0.123456789012345678901');
        expect(result.output).toContain('"lookalike":{"type":"bigDecimal","string":"2.5"}');
        expect(handle).toHaveBeenCalledOnce();
      } finally {
        await provider.cleanup();
      }
    },
  );

  it('preserves numeric document values when encoding collected stream events', async () => {
    const { provider } = fixture('AgenticRetrieveStream', {
      stream: events([
        {
          result: {
            results: [
              {
                metadata: {
                  large: 9007199254740993n,
                  precise: new NumericValue('0.123456789012345678901', 'bigDecimal'),
                  lookalike: { type: 'bigDecimal', string: '2.5' },
                },
              },
            ],
          },
        },
      ]),
    });
    const result = await provider.callApi('{}');
    expect(result.error).toBeUndefined();
    expect(result.output).toContain('"large":9007199254740993');
    expect(result.output).toContain('"precise":0.123456789012345678901');
    expect(result.output).toContain('"lookalike":{"type":"bigDecimal","string":"2.5"}');
  });

  it.each(['9007199254740993', '0.123456789012345678901'])(
    'preserves numeric retrieval filter value %s through the actual SDK',
    async (literal) => {
      const handle = vi.spyOn(NodeHttpHandler.prototype, 'handle').mockResolvedValue({
        response: {
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body: Buffer.from('{"retrievalResults":[]}'),
        },
      });
      const provider = new AwsBedrockNativeApiProvider('Retrieve', {
        config: { region: 'us-east-1', accessKeyId: 'synthetic', secretAccessKey: 'synthetic' },
      });
      try {
        const result = await provider.callApi(
          '{"knowledgeBaseId":"KB12345678","retrievalQuery":{"text":"hello"},"retrievalConfiguration":{"vectorSearchConfiguration":{"filter":{"equals":{"key":"number","value":' +
            literal +
            '}}}}}',
        );
        expect(result.error).toBeUndefined();
        expect(handle).toHaveBeenCalledOnce();
        expect(Buffer.from(handle.mock.calls[0][0].body).toString('utf8')).toContain(
          '"value":' + literal,
        );
      } finally {
        await provider.cleanup();
      }
    },
  );

  it('preserves precise InvokeModel request and response JSON', async () => {
    const body =
      '{"large":9007199254740993,"precise":0.123456789012345678901,"max_tokens":1e3,"temperature":1.00e-3,"__proto__":{"nativeFixture":true},"nested":[{"__proto__":null},{"__proto__":"retained"}],"constructor":{"prototype":{"nativeFixture":true}},"lookalike":{"type":"bigDecimal","string":"2.5"}}';
    const handle = vi.spyOn(NodeHttpHandler.prototype, 'handle').mockResolvedValue({
      response: {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(body),
      },
    });
    const provider = new AwsBedrockNativeApiProvider('InvokeModel', {
      config: { region: 'us-east-1', accessKeyId: 'synthetic', secretAccessKey: 'synthetic' },
    });
    try {
      const result = await provider.callApi('{"modelId":"test.model","body":' + body + '}');
      expect(result.error).toBeUndefined();
      const request = Buffer.from(handle.mock.calls[0][0].body).toString('utf8');
      for (const text of [request, String(result.output)]) {
        expect(text).toContain('"large":9007199254740993');
        expect(text).toContain('"precise":0.123456789012345678901');
        expect(text).toContain('"max_tokens":1000');
        expect(text).toContain('"temperature":0.001');
        expect(text).toContain('"__proto__":{"nativeFixture":true}');
        expect(text).toContain('"nested":[{"__proto__":null},{"__proto__":"retained"}]');
        expect(text).toContain('"constructor":{"prototype":{"nativeFixture":true}}');
        expect(Object.prototype).not.toHaveProperty('nativeFixture');
        expect(text).toContain('"lookalike":{"type":"bigDecimal","string":"2.5"}');
      }
    } finally {
      await provider.cleanup();
    }
  });

  it.each(['1e100000', '1e-100000', '-1e100000', '-1e-100000', '-0'])(
    'preserves native numeric literal %s without exponent expansion',
    async (literal) => {
      const body = '{"value":' + literal + '}';
      const { provider, invoke } = fixture('InvokeModel', {
        body: Buffer.from(body),
        contentType: 'application/json',
      });
      const result = await provider.callApi('{"modelId":"test.model","body":' + body + '}');
      expect(result.error).toBeUndefined();
      expect(invoke.mock.calls[0][0].body).toBe(body);
      expect(result.output).toContain(body);
      expect(String(result.output).length).toBeLessThan(100);
    },
  );

  it.each([
    ['ListAsyncInvokes', 'maxResults', '1e1', '10'],
    ['ListAsyncInvokes', 'maxResults', '1.0', '1'],
    ['ListAsyncInvokes', 'submitTimeAfter', '1e3', '1000'],
    ['ListAsyncInvokes', 'submitTimeBefore', '1000.0', '1000'],
    ['ListFlowExecutionEvents', 'maxResults', '1e1', '10'],
    ['ListFlowExecutionEvents', 'maxResults', '1.0', '1'],
  ])('retains primitive query numbers for %s %s=%s', async (operation, key, literal, expected) => {
    const handle = vi.spyOn(NodeHttpHandler.prototype, 'handle').mockResolvedValue({
      response: {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from('{}'),
      },
    });
    const provider = new AwsBedrockNativeApiProvider(operation, {
      config: { region: 'us-east-1', accessKeyId: 'synthetic', secretAccessKey: 'synthetic' },
    });
    try {
      const prefix =
        operation === 'ListFlowExecutionEvents'
          ? '"flowIdentifier":"FLOW123456","flowAliasIdentifier":"TSTALIASID","executionIdentifier":"execution","eventType":"OUTPUT",'
          : '';
      const result = await provider.callApi('{' + prefix + '"' + key + '":' + literal + '}');
      expect(result.error).toBeUndefined();
      expect(handle).toHaveBeenCalledOnce();
      expect(handle.mock.calls[0][0].query[key]).toBe(expected);
    } finally {
      await provider.cleanup();
    }
  });

  it('preserves precise model-native JSON in streaming response chunks', async () => {
    const { provider } = fixture('InvokeModelWithResponseStream', {
      body: events([
        {
          chunk: {
            bytes: Buffer.from(
              '{"large":9007199254740993,"precise":0.123456789012345678901,"nested":{"__proto__":"retained"}}',
            ),
          },
        },
      ]),
    });
    const result = await provider.callApi('{"modelId":"test.model","body":{}}');
    expect(result.error).toBeUndefined();
    expect(result.output).toContain('"large":9007199254740993');
    expect(result.output).toContain('"precise":0.123456789012345678901');
    expect(result.output).toContain('"nested":{"__proto__":"retained"}');
  });

  it.each(
    ['Converse', 'Retrieve'].flatMap((operation) =>
      ['null', '"retained"', '{"nativeFixture":true}'].map((value) => [operation, value]),
    ),
  )(
    'rejects a %s response whose own __proto__ value %s was discarded by the SDK',
    async (operation, value) => {
      const document = '"__proto__":' + value + ',"retained":1';
      const body =
        operation === 'Converse'
          ? '{"output":{"message":{"role":"assistant","content":[{"toolUse":{"toolUseId":"tool-id","name":"fixture","input":{' +
            document +
            '}}}]}},"stopReason":"tool_use","usage":{"inputTokens":1,"outputTokens":1,"totalTokens":2},"metrics":{"latencyMs":1}}'
          : '{"retrievalResults":[{"content":{"type":"TEXT","text":"READY"},"metadata":{"nested":{' +
            document +
            '}}}]}';
      vi.spyOn(NodeHttpHandler.prototype, 'handle').mockResolvedValue({
        response: {
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body: Buffer.from(body),
        },
      });
      const provider = new AwsBedrockNativeApiProvider(operation, {
        config: { region: 'us-east-1', accessKeyId: 'synthetic', secretAccessKey: 'synthetic' },
      });
      try {
        const request =
          operation === 'Converse'
            ? { modelId: 'test.model', messages: [{ role: 'user', content: [{ text: 'hello' }] }] }
            : { knowledgeBaseId: 'KB12345678', retrievalQuery: { text: 'hello' } };
        const result = await provider.callApi(JSON.stringify(request));
        expect(result.error).toContain('SDK discarded an own __proto__ field');
        expect(result.output).toBeUndefined();
        expect(Object.prototype).not.toHaveProperty('nativeFixture');
      } finally {
        await provider.cleanup();
      }
    },
  );

  it('preserves own document keys in a Converse request through the actual SDK', async () => {
    const handle = vi.spyOn(NodeHttpHandler.prototype, 'handle').mockResolvedValue({
      response: {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from('{}'),
      },
    });
    const provider = new AwsBedrockNativeApiProvider('Converse', {
      config: { region: 'us-east-1', accessKeyId: 'synthetic', secretAccessKey: 'synthetic' },
    });
    try {
      const result = await provider.callApi(
        '{"modelId":"test.model","messages":[{"role":"user","content":[{"toolResult":{"toolUseId":"tool","content":[{"json":{"__proto__":{"nativeFixture":true},"constructor":{"prototype":{"nativeFixture":true}},"large":9007199254740993}}]}}]}]}',
      );
      expect(result.error).toBeUndefined();
      const request = Buffer.from(handle.mock.calls[0][0].body).toString('utf8');
      expect(request).toContain('"__proto__":{"nativeFixture":true}');
      expect(request).toContain('"constructor":{"prototype":{"nativeFixture":true}}');
      expect(request).toContain('"large":9007199254740993');
      expect(Object.prototype).not.toHaveProperty('nativeFixture');
    } finally {
      await provider.cleanup();
    }
  });

  it.each(['InvokeModel', 'InvokeModelWithResponseStream'])(
    'rejects an empty %s JSON body',
    async (operation) => {
      const response =
        operation === 'InvokeModel'
          ? { body: Buffer.alloc(0), contentType: 'application/json' }
          : { body: events([{ chunk: { bytes: Buffer.alloc(0) } }]) };
      const { provider } = fixture(operation, response);
      const result = await provider.callApi('{"modelId":"test.model","body":{}}');
      expect(result.error).toContain('Unexpected end of JSON input');
      expect(result.output).toBeUndefined();
    },
  );

  it.each(['Converse', 'Rerank', 'InvokeFlow'])(
    'rejects SDK decimal-shaped document objects before %s dispatch',
    async (operation) => {
      const document = { value: { type: 'bigDecimal', string: '2.5', extra: 'keep' } };
      const requests: Record<string, unknown> = {
        Converse: {
          modelId: 'test.model',
          messages: [
            {
              role: 'user',
              content: [{ toolResult: { toolUseId: 'tool', content: [{ json: document }] } }],
            },
          ],
        },
        Rerank: {
          queries: [{ type: 'TEXT', textQuery: { text: 'hello' } }],
          sources: [
            { type: 'INLINE', inlineDocumentSource: { type: 'JSON', jsonDocument: document } },
          ],
          rerankingConfiguration: {
            type: 'BEDROCK_RERANKING_MODEL',
            bedrockRerankingConfiguration: { modelConfiguration: { modelArn: 'test.model' } },
          },
        },
        InvokeFlow: {
          flowIdentifier: 'FLOW123456',
          flowAliasIdentifier: 'TSTALIASID',
          inputs: [{ nodeName: 'input', nodeOutputName: 'document', content: { document } }],
        },
      };
      const handle = vi.spyOn(NodeHttpHandler.prototype, 'handle').mockResolvedValue({
        response: {
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body: Buffer.from('{}'),
        },
      });
      const provider = new AwsBedrockNativeApiProvider(operation, {
        config: { region: 'us-east-1', accessKeyId: 'synthetic', secretAccessKey: 'synthetic' },
      });
      try {
        const result = await provider.callApi(JSON.stringify(requests[operation]));
        expect(result.error).toContain('SDK reserved bigDecimal shape');
        expect(result.output).toBeUndefined();
        expect(handle).not.toHaveBeenCalled();
      } finally {
        await provider.cleanup();
      }
    },
  );

  it('preserves harmless near-lookalike objects through the actual SDK', async () => {
    const document = {
      nonnumeric: { type: 'bigDecimal', string: 'not-a-number', extra: 'keep' },
      otherType: { type: 'text', string: '2.5' },
    };
    const handle = vi.spyOn(NodeHttpHandler.prototype, 'handle').mockResolvedValue({
      response: {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from('{}'),
      },
    });
    const provider = new AwsBedrockNativeApiProvider('Converse', {
      config: { region: 'us-east-1', accessKeyId: 'synthetic', secretAccessKey: 'synthetic' },
    });
    try {
      const result = await provider.callApi(
        JSON.stringify({
          modelId: 'test.model',
          messages: [{ role: 'user', content: [{ text: 'hello' }] }],
          additionalModelRequestFields: document,
        }),
      );
      expect(result.error).toBeUndefined();
      const body = JSON.parse(Buffer.from(handle.mock.calls[0][0].body).toString('utf8'));
      expect(body.additionalModelRequestFields).toEqual(document);
    } finally {
      await provider.cleanup();
    }
  });

  it('preserves binary InvokeModel outputs without trying to parse image bytes', async () => {
    const { provider } = fixture('InvokeModel', {
      body: Buffer.from([1, 2, 3]),
      contentType: 'image/png',
    });
    const result = await provider.callApi('{"modelId":"image-model","body":{}}');
    expect(JSON.parse(String(result.output))).toEqual({
      body: { $base64: 'AQID' },
      contentType: 'image/png',
    });
  });

  it.each([
    '',
    '   ',
    'null',
    '[]',
    '9007199254740993',
    '0.123456789012345678901',
    'not json',
    '{"blob":{"$base64":"invalid!"}}',
  ])('rejects invalid request %s before AWS calls', async (prompt) => {
    const { provider, invoke } = fixture('Converse', {});
    expect((await provider.callApi(prompt)).error).toBeTruthy();
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each(['throttlingException', 'modelStreamErrorException', 'validationException'])(
    'fails %s events without returning partial results',
    async (name) => {
      const { provider } = fixture('InvokeFlow', {
        responseStream: events([
          { flowOutputEvent: { content: { document: 'partial' } } },
          { [name]: { message: 'failed' } },
        ]),
      });
      const result = await provider.callApi('{}');
      expect(result.error).toContain(name);
      expect(result.output).toBeUndefined();
    },
  );

  it.each([undefined, events([])])('rejects missing and empty streams', async (stream) => {
    const { provider } = fixture('ConverseStream', { stream });
    expect((await provider.callApi('{}')).error).toMatch(/no event stream|empty event stream/);
  });

  it('bypasses response caching and forwards cancellation', async () => {
    const { provider, invoke } = fixture('CountTokens', { inputTokens: 4 });
    const controller = new AbortController();
    await provider.callApi('{}', undefined, { abortSignal: controller.signal });
    await provider.callApi('{}', undefined, { abortSignal: controller.signal });
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls[0][1].abortSignal).toBe(controller.signal);
    controller.abort();
    const result = await provider.callApi('{}', undefined, { abortSignal: controller.signal });
    expect(result.error).toBeTruthy();
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('cleans up SDK clients', async () => {
    const { provider, client } = fixture('InvokeModel', {});
    provider.bedrock = client as any;
    await provider.cleanup();
    expect(client.destroy).toHaveBeenCalledOnce();
    expect(provider.bedrock).toBeUndefined();
  });

  it.each(['CountTokens', 'Rerank'])(
    'closes %s clients after library evaluation scopes and supports reuse',
    async (operation) => {
      const handle = vi.spyOn(NodeHttpHandler.prototype, 'handle').mockResolvedValue({
        response: {
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body: Buffer.from('{}'),
        },
      });
      const destroy = vi.spyOn(NodeHttpHandler.prototype, 'destroy');
      const provider = new AwsBedrockNativeApiProvider(operation, {
        config: { region: 'us-east-1', accessKeyId: 'synthetic', secretAccessKey: 'synthetic' },
      });
      const prompt =
        operation === 'CountTokens'
          ? '{"modelId":"test.model","input":{"converse":{"messages":[{"role":"user","content":[{"text":"hello"}]}]}}}'
          : '{"queries":[],"sources":[]}';
      for (let batch = 0; batch < 2; batch++) {
        await providerRegistry.withEvaluation(async () => {
          await providerRegistry.useProvider(provider);
          const result = await providerRegistry.withProvider(provider, () =>
            provider.callApi(prompt),
          );
          expect(result.error).toBeUndefined();
          expect(providerRegistry.has(provider)).toBe(true);
          expect(destroy).toHaveBeenCalledTimes(batch);
        });
        expect(providerRegistry.has(provider)).toBe(false);
        expect(destroy).toHaveBeenCalledTimes(batch + 1);
      }
      expect(handle).toHaveBeenCalledTimes(2);
    },
  );

  it.each(['CountTokens', 'Rerank'])(
    'does not dispatch %s when the evaluation ends during initialization',
    async (operation) => {
      const provider = new AwsBedrockNativeApiProvider(operation, {
        config: { region: 'us-east-1' },
      });
      let releaseCredentials!: () => void;
      let signalStarted!: () => void;
      const started = new Promise<void>((resolve) => {
        signalStarted = resolve;
      });
      const credentials = new Promise<{ accessKeyId: string; secretAccessKey: string }>(
        (resolve) => {
          releaseCredentials = () =>
            resolve({ accessKeyId: 'synthetic', secretAccessKey: 'synthetic' });
        },
      );
      vi.spyOn(provider, 'getCredentials').mockImplementation(() => {
        signalStarted();
        return credentials;
      });
      const handle = vi.spyOn(NodeHttpHandler.prototype, 'handle').mockResolvedValue({
        response: {
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body: Buffer.from('{}'),
        },
      });
      const prompt =
        operation === 'CountTokens'
          ? '{"modelId":"test.model","input":{"converse":{"messages":[{"role":"user","content":[{"text":"hello"}]}]}}}'
          : '{"queries":[],"sources":[]}';
      let call!: ReturnType<typeof provider.callApi>;
      const evaluation = providerRegistry.withEvaluation(async () => {
        call = providerRegistry.withProvider(provider, () => provider.callApi(prompt));
        await started;
      });
      await started;
      await new Promise<void>((resolve) => setImmediate(resolve));
      releaseCredentials();
      const result = await call;
      await evaluation;
      expect(result.error).toContain('Evaluation ended before the provider call started');
      expect(handle).not.toHaveBeenCalled();
      expect(providerRegistry.has(provider)).toBe(false);
    },
  );

  it.each(['CountTokens', 'Rerank'])(
    'registers pending %s initialization for process cleanup',
    async (operation) => {
      const provider = new AwsBedrockNativeApiProvider(operation, {
        config: { region: 'us-east-1' },
      });
      let releaseCredentials!: () => void;
      vi.spyOn(provider, 'getCredentials').mockReturnValue(
        new Promise<undefined>((resolve) => {
          releaseCredentials = () => resolve(undefined);
        }),
      );
      const destroy = vi.spyOn(NodeHttpHandler.prototype, 'destroy');
      const initialization =
        operation === 'CountTokens'
          ? provider.getBedrockInstance()
          : provider.getAgentRuntimeClient();
      expect(providerRegistry.has(provider)).toBe(true);
      const shutdown = providerRegistry.shutdownAll();
      releaseCredentials();
      await initialization;
      await shutdown;
      expect(destroy).toHaveBeenCalledOnce();
      expect(providerRegistry.has(provider)).toBe(false);
    },
  );

  it('shares concurrent Runtime initialization across repeated cleanup and reuse', async () => {
    const provider = new AwsBedrockNativeApiProvider('CountTokens', {
      config: { region: 'us-east-1', accessKeyId: 'synthetic', secretAccessKey: 'synthetic' },
    });
    const initialized = new Set<BedrockRuntime>();
    for (let batch = 0; batch < 3; batch++) {
      const clients = await Promise.all(
        Array.from({ length: 4 }, () => provider.getBedrockInstance()),
      );
      expect(new Set(clients).size).toBe(1);
      initialized.add(clients[0]);
      const destroy = vi.spyOn(clients[0], 'destroy');
      await provider.cleanup();
      expect(destroy).toHaveBeenCalledOnce();
      expect(provider.bedrock).toBeUndefined();
    }
    expect(initialized.size).toBe(3);
  });

  it('waits for pending Runtime initialization before cleanup', async () => {
    const provider = new AwsBedrockNativeApiProvider('CountTokens', {
      config: { region: 'us-east-1' },
    });
    let releaseCredentials!: () => void;
    const credentials = new Promise<undefined>((resolve) => {
      releaseCredentials = () => resolve(undefined);
    });
    vi.spyOn(provider, 'getCredentials').mockReturnValue(credentials);
    const destroy = vi.spyOn(BedrockRuntime.prototype, 'destroy');
    const initialization = provider.getBedrockInstance();
    let finished = false;
    const cleanup = provider.cleanup().then(() => {
      finished = true;
    });
    await Promise.resolve();
    expect(finished).toBe(false);
    releaseCredentials();
    await initialization;
    await cleanup;
    expect(destroy).toHaveBeenCalledOnce();
    expect(provider.bedrock).toBeUndefined();
  });

  it('cleans up after failed Runtime initialization and allows another attempt', async () => {
    const provider = new AwsBedrockNativeApiProvider('CountTokens', {
      config: { region: 'us-east-1' },
    });
    vi.spyOn(provider, 'getCredentials')
      .mockRejectedValueOnce(new Error('Credentials unavailable'))
      .mockResolvedValue(undefined);
    const initialization = provider.getBedrockInstance();
    const cleanup = provider.cleanup();
    await expect(initialization).rejects.toThrow('required as a peer dependency');
    await expect(cleanup).resolves.toBeUndefined();
    const client = await provider.getBedrockInstance();
    const destroy = vi.spyOn(client, 'destroy');
    await provider.cleanup();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('shares concurrent Agent Runtime initialization and cleans up the shared client', async () => {
    const provider = new AwsBedrockNativeApiProvider('Rerank', {
      config: { region: 'us-east-1', accessKeyId: 'synthetic', secretAccessKey: 'synthetic' },
    });
    const clients = await Promise.all([
      provider.getAgentRuntimeClient(),
      provider.getAgentRuntimeClient(),
    ]);
    const destroy = vi.spyOn(clients[0], 'destroy');
    try {
      await provider.cleanup();
      expect(new Set(clients).size).toBe(1);
      expect(destroy).toHaveBeenCalledOnce();
    } finally {
      for (const client of new Set(clients)) {
        client.destroy();
      }
    }
  });

  it('retries Agent Runtime initialization after a credential failure', async () => {
    const provider = new AwsBedrockNativeApiProvider('Retrieve', {
      config: { region: 'us-east-1' },
    });
    vi.spyOn(provider, 'getCredentials')
      .mockRejectedValueOnce(new Error('Credentials unavailable'))
      .mockResolvedValue(undefined);
    await expect(provider.getAgentRuntimeClient()).rejects.toThrow('Credentials unavailable');
    const client = await provider.getAgentRuntimeClient();
    const destroy = vi.spyOn(client, 'destroy');
    await provider.cleanup();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('preserves native managed search and user context through the SDK', async () => {
    const handle = vi.fn().mockResolvedValue({
      response: {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from('{"retrievalResults":[]}'),
      },
    });
    const client = new BedrockAgentRuntime({
      region: 'us-east-1',
      credentials: { accessKeyId: 'synthetic', secretAccessKey: 'synthetic' },
      requestHandler: { handle },
    });
    const provider = new AwsBedrockNativeApiProvider('Retrieve');
    vi.spyOn(provider, 'getAgentRuntimeClient').mockResolvedValue(client);
    const request = {
      knowledgeBaseId: 'fixture',
      retrievalQuery: { text: 'hello' },
      userContext: { userId: 'fixture-user' },
      retrievalConfiguration: {
        managedSearchConfiguration: {
          numberOfResults: 3,
          filter: { equals: { key: 'tenant', value: 'fixture' } },
        },
      },
    };
    try {
      const result = await provider.callApi(JSON.stringify(request));
      expect(result.error).toBeUndefined();
      expect(JSON.parse(handle.mock.calls[0][0].body)).toMatchObject({
        userContext: request.userContext,
        retrievalConfiguration: request.retrievalConfiguration,
      });
    } finally {
      client.destroy();
    }
  });

  it('serializes InvokeModel native controls through the real SDK', async () => {
    const handle = vi.fn().mockResolvedValue({
      response: {
        statusCode: 200,
        headers: { 'content-type': 'application/json', 'x-amzn-bedrock-service-tier': 'flex' },
        body: Buffer.from('{"result":"READY"}'),
      },
    });
    const client = new BedrockRuntime({
      region: 'us-east-1',
      credentials: { accessKeyId: 'synthetic', secretAccessKey: 'synthetic' },
      requestHandler: { handle },
    });
    const provider = new AwsBedrockNativeApiProvider('InvokeModel');
    vi.spyOn(provider, 'getBedrockInstance').mockResolvedValue(client);
    const result = await provider.callApi(
      JSON.stringify({
        modelId: 'test.model:0',
        body: { prompt: 'hello', custom: true },
        serviceTier: 'flex',
        performanceConfigLatency: 'optimized',
        trace: 'ENABLED_FULL',
        requestMetadata: '{"suite":"test"}',
      }),
    );
    expect(result.error).toBeUndefined();
    const request = handle.mock.calls[0][0];
    expect(request.path).toContain('/model/test.model%3A0/invoke');
    expect(request.headers).toMatchObject({
      'x-amzn-bedrock-service-tier': 'flex',
      'x-amzn-bedrock-performanceconfig-latency': 'optimized',
      'x-amzn-bedrock-trace': 'ENABLED_FULL',
      'x-amzn-bedrock-request-metadata': '{"suite":"test"}',
    });
    expect(JSON.parse(request.body)).toEqual({ prompt: 'hello', custom: true });
    client.destroy();
  });
});

it('rejects malformed native metadata filters before the SDK can drop them', async () => {
  const { provider, invoke } = fixture('Retrieve', {});
  const result = await provider.callApi(
    JSON.stringify({
      knowledgeBaseId: 'fixture',
      retrievalQuery: { text: 'hello' },
      retrievalConfiguration: { vectorSearchConfiguration: { filter: { tenant: 'fixture' } } },
    }),
  );
  expect(result.error).toContain('Invalid Bedrock retrieval filter');
  expect(invoke).not.toHaveBeenCalled();
});

it.each([
  [
    'Retrieve',
    { retrievalConfiguration: { managedSearchConfiguration: { filter: { tenant: 'invalid' } } } },
  ],
  [
    'InvokeInlineAgent',
    {
      knowledgeBases: [
        {
          retrievalConfiguration: { managedSearchConfiguration: { filter: { tenant: 'invalid' } } },
        },
      ],
    },
  ],
  [
    'AgenticRetrieveStream',
    {
      retrievers: [
        {
          configuration: {
            knowledgeBase: { retrievalOverrides: { filter: { tenant: 'invalid' } } },
          },
        },
      ],
    },
  ],
] as const)('validates %s native retrieval restrictions', async (operation, request) => {
  const { provider, invoke } = fixture(operation, {});
  expect((await provider.callApi(JSON.stringify(request))).error).toContain(
    'Invalid Bedrock retrieval filter',
  );
  expect(invoke).not.toHaveBeenCalled();
});

it('explains when an older AWS SDK lacks the selected operation', async () => {
  const provider = new AwsBedrockNativeApiProvider('InvokeGuardrailChecks');
  vi.spyOn(provider, 'getBedrockInstance').mockResolvedValue({} as any);
  expect((await provider.callApi('{}')).error).toContain(
    'Installed AWS SDK does not expose InvokeGuardrailChecks',
  );
});

it.each(['inlineSessionState', 'collaborators'])(
  'validates inline-agent filters in %s before dispatch',
  async (path) => {
    const { provider, invoke } = fixture('InvokeInlineAgent', {});
    const kb = {
      retrievalConfiguration: { vectorSearchConfiguration: { filter: { tenant: 'invalid' } } },
    };
    const request =
      path === 'inlineSessionState'
        ? { inlineSessionState: { knowledgeBaseConfigurations: [kb] } }
        : { collaborators: [{ knowledgeBases: [kb] }] };
    expect((await provider.callApi(JSON.stringify(request))).error).toContain(
      'Invalid Bedrock retrieval filter',
    );
    expect(invoke).not.toHaveBeenCalled();
  },
);

it('uses SigV4 for Agent Runtime even when a Bedrock API key is configured', async () => {
  const handle = vi.spyOn(NodeHttpHandler.prototype, 'handle').mockResolvedValue({
    response: {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: Buffer.from('{"results":[]}'),
    },
  });
  const provider = new AwsBedrockNativeApiProvider('Rerank', {
    config: {
      region: 'us-east-1',
      apiKey: 'synthetic-bearer',
      accessKeyId: 'synthetic',
      secretAccessKey: 'synthetic',
    },
  });
  const result = await provider.callApi('{"queries":[],"sources":[]}');
  expect(result.error).toBeUndefined();
  const headers = handle.mock.calls[0][0].headers;
  expect(headers.authorization).toMatch(/^AWS4-HMAC-SHA256 /);
  expect(Object.values(headers).join(' ')).not.toContain('synthetic-bearer');
  await provider.cleanup();
});
