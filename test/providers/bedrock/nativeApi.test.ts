import { BedrockAgentRuntime } from '@aws-sdk/client-bedrock-agent-runtime';
import { BedrockRuntime } from '@aws-sdk/client-bedrock-runtime';
import { NumericValue } from '@smithy/core/serde';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AwsBedrockNativeApiProvider } from '../../../src/providers/bedrock/nativeApi';

async function* events(items: unknown[]) {
  yield* items;
}
const metadata = { requestId: 'synthetic-request' };
afterEach(() => vi.restoreAllMocks());

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

  it.each(['null', '[]', 'not json', '{"blob":{"$base64":"invalid!"}}'])(
    'rejects invalid request %s before AWS calls',
    async (prompt) => {
      const { provider, invoke } = fixture('Converse', {});
      expect((await provider.callApi(prompt)).error).toBeTruthy();
      expect(invoke).not.toHaveBeenCalled();
    },
  );

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
