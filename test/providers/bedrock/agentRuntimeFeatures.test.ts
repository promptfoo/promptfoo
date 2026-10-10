import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
  RetrieveAndGenerateStreamCommand,
  RetrieveCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AwsBedrockAgentsProvider } from '../../../src/providers/bedrock/agents';
import { AwsBedrockKnowledgeBaseProvider } from '../../../src/providers/bedrock/knowledgeBase';
import { mockProcessEnv } from '../../util/utils';

const cache = vi.hoisted(() => ({ enabled: false, get: vi.fn(), set: vi.fn() }));
vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/cache')>()),
  isCacheEnabled: () => cache.enabled,
  getCache: async () => cache,
}));

type KBConfig = NonNullable<
  ConstructorParameters<typeof AwsBedrockKnowledgeBaseProvider>[1]
>['config'];
type AgentConfig = NonNullable<ConstructorParameters<typeof AwsBedrockAgentsProvider>[1]>['config'];

function kb(config: KBConfig = {}) {
  const provider = new AwsBedrockKnowledgeBaseProvider('default', {
    config: {
      knowledgeBaseId: 'KB12345678',
      modelArn: 'us.amazon.nova-2-lite-v1:0',
      region: 'us-east-1',
      ...config,
    },
  });
  const send = vi.fn().mockResolvedValue({ output: { text: 'answer' }, sessionId: 'session' });
  vi.spyOn(provider, 'getKnowledgeBaseClient').mockResolvedValue({
    send,
  } as unknown as BedrockAgentRuntimeClient);
  return { provider, send };
}

function agent(config: Partial<AgentConfig> = {}) {
  const provider = new AwsBedrockAgentsProvider('AGENT12345', {
    config: { agentId: 'AGENT12345', agentAliasId: 'ALIAS12345', region: 'us-east-1', ...config },
  });
  const send = vi.fn();
  vi.spyOn(provider, 'getAgentRuntimeClient').mockResolvedValue({
    send,
  } as unknown as BedrockAgentRuntimeClient);
  return { provider, send };
}

async function* events(values: unknown[]) {
  yield* values;
}

let restoreEnv: (() => void) | undefined;
beforeEach(() => {
  cache.enabled = false;
  cache.get.mockReset();
  cache.set.mockReset();
  restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: undefined });
});
afterEach(() => {
  restoreEnv?.();
  vi.restoreAllMocks();
});

describe('Knowledge Base runtime features', () => {
  it.each([
    ['amazon.nova-lite-v1:0', 'arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-lite-v1:0'],
    ['us.amazon.nova-2-lite-v1:0', 'us.amazon.nova-2-lite-v1:0'],
  ])('falls back to provider model %s when modelArn is empty', async (model, expected) => {
    const provider = new AwsBedrockKnowledgeBaseProvider(model, {
      config: { knowledgeBaseId: 'KB12345678', region: 'us-east-1', modelArn: '' },
    });
    const send = vi.fn().mockResolvedValue({ output: { text: 'answer' } });
    vi.spyOn(provider, 'getKnowledgeBaseClient').mockResolvedValue({
      send,
    } as unknown as BedrockAgentRuntimeClient);
    expect((await provider.callApi('question')).output).toBe('answer');
    expect(
      send.mock.calls[0][0].input.retrieveAndGenerateConfiguration.knowledgeBaseConfiguration
        .modelArn,
    ).toBe(expected);
  });

  it.each(['retrieve', 'retrieveAndGenerate', 'streaming'] as const)(
    'serializes user access context and managed-search restrictions for %s',
    async (operation) => {
      const filter = { equals: { key: 'tenant', value: 'fixture' } };
      const { provider } = kb({
        operation: operation === 'retrieve' ? 'retrieve' : 'retrieveAndGenerate',
        streaming: operation === 'streaming',
        userContext: { userId: 'fixture-user' },
        retrievalConfiguration: { managedSearchConfiguration: { filter, numberOfResults: 3 } },
      });
      const handle = vi.fn(async (_request: { body?: unknown }) => ({
        response: {
          statusCode: 400,
          headers: {
            'content-type': 'application/json',
            'x-amzn-errortype': 'ValidationException',
          },
          body: new TextEncoder().encode('{"message":"fixture request captured"}'),
        },
      }));
      const client = new BedrockAgentRuntimeClient({
        region: 'us-east-1',
        credentials: { accessKeyId: 'LOCAL_FIXTURE', secretAccessKey: 'LOCAL_FIXTURE' },
        requestHandler: { handle },
        maxAttempts: 1,
      });
      vi.spyOn(provider, 'getKnowledgeBaseClient').mockResolvedValue(client);
      try {
        expect((await provider.callApi('question')).error).toContain('fixture request captured');
        const rawBody = handle.mock.calls[0][0].body;
        const body = JSON.parse(
          typeof rawBody === 'string' ? rawBody : Buffer.from(rawBody as Uint8Array).toString(),
        );
        expect(body.userContext).toEqual({ userId: 'fixture-user' });
        const retrieval =
          operation === 'retrieve'
            ? body.retrievalConfiguration
            : body.retrieveAndGenerateConfiguration.knowledgeBaseConfiguration
                .retrievalConfiguration;
        expect(retrieval).toEqual({ managedSearchConfiguration: { filter, numberOfResults: 3 } });
      } finally {
        client.destroy();
      }
    },
  );

  it.each(['retrieve', 'retrieveAndGenerate'] as const)(
    'overrides result counts in managed search for %s',
    async (operation) => {
      const { provider, send } = kb({
        operation,
        numberOfResults: 7,
        retrievalConfiguration: {
          managedSearchConfiguration: {
            numberOfResults: 3,
            filter: { equals: { key: 'tenant', value: 'fixture' } },
          },
        },
      });
      await provider.callApi('question');
      const input = send.mock.calls[0][0].input;
      const retrieval =
        operation === 'retrieve'
          ? input.retrievalConfiguration
          : input.retrieveAndGenerateConfiguration.knowledgeBaseConfiguration
              .retrievalConfiguration;
      expect(retrieval).toEqual({
        managedSearchConfiguration: {
          numberOfResults: 7,
          filter: { equals: { key: 'tenant', value: 'fixture' } },
        },
      });
    },
  );
  it.each(['retrieve', 'retrieveAndGenerate', 'native'] as const)(
    'rejects malformed %s filters before reaching AWS',
    async (operation) => {
      const retrievalConfiguration = {
        vectorSearchConfiguration: { filter: { team: 'private' } as never },
      };
      const { provider, send } = kb(
        operation === 'native'
          ? {
              retrieveAndGenerateConfiguration: {
                type: 'KNOWLEDGE_BASE',
                knowledgeBaseConfiguration: {
                  knowledgeBaseId: 'KB12345678',
                  modelArn: 'model',
                  retrievalConfiguration,
                },
              },
            }
          : { operation, retrievalConfiguration },
      );
      expect((await provider.callApi('question')).error).toContain(
        'Invalid Knowledge Base retrieval filter',
      );
      expect(send).not.toHaveBeenCalled();
    },
  );

  it('does not expose resumable session handles from cache', async () => {
    cache.enabled = true;
    const { provider } = kb();
    const live = await provider.callApi('question');
    expect(live.metadata?.sessionId).toBe('session');
    const stored = JSON.parse(cache.set.mock.calls[0][1]);
    expect(stored.metadata).not.toHaveProperty('sessionId');
    cache.get.mockResolvedValue(
      JSON.stringify({ ...stored, metadata: { ...stored.metadata, sessionId: 'old-handle' } }),
    );
    const cached = await provider.callApi('question');
    expect(cached.cached).toBe(true);
    expect(cached.metadata).not.toHaveProperty('sessionId');
  });

  it('gives external-source configurations distinct, stable default identities', () => {
    const create = (uri: string) =>
      kb({
        knowledgeBaseId: undefined,
        retrieveAndGenerateConfiguration: {
          type: 'EXTERNAL_SOURCES',
          externalSourcesConfiguration: {
            modelArn: 'model',
            sources: [{ sourceType: 'S3', s3Location: { uri } }],
          },
        },
      }).provider.id();
    expect(create('s3://fixture/a')).toBe(create('s3://fixture/a'));
    expect(create('s3://fixture/a')).not.toBe(create('s3://fixture/b'));
    expect(create('s3://fixture/a')).not.toContain('undefined');
  });
  it('forwards retrieval, generation, orchestration, session and user options', async () => {
    const config: KBConfig = {
      sessionId: 'existing-session',
      sessionConfiguration: { kmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/fixture' },
      userContext: { userId: 'fixture-user' },
      numberOfResults: 3,
      retrievalConfiguration: {
        vectorSearchConfiguration: {
          overrideSearchType: 'HYBRID',
          filter: { equals: { key: 'team', value: 'support' } },
          rerankingConfiguration: {
            type: 'BEDROCK_RERANKING_MODEL',
            bedrockRerankingConfiguration: {
              modelConfiguration: {
                modelArn: 'arn:aws:bedrock:us-east-1::foundation-model/amazon.rerank-v1:0',
              },
              numberOfRerankedResults: 2,
            },
          },
        },
      },
      generationConfiguration: {
        promptTemplate: { textPromptTemplate: '$search_results$ $query$' },
        guardrailConfiguration: { guardrailId: 'guardrail', guardrailVersion: '1' },
        additionalModelRequestFields: { custom: true },
      },
      orchestrationConfiguration: {
        queryTransformationConfiguration: { type: 'QUERY_DECOMPOSITION' },
      },
    };
    const { provider, send } = kb(config);
    send.mockResolvedValue({
      output: { text: 'blocked' },
      sessionId: 'existing-session',
      guardrailAction: 'INTERVENED',
      citations: [{ retrievedReferences: [{ content: { text: 'reference' } }] }],
    });
    const result = await provider.callApi('question');
    expect(result.error).toBeUndefined();
    expect(send.mock.calls[0][0].input).toMatchObject({
      input: { text: 'question' },
      sessionId: config.sessionId,
      sessionConfiguration: config.sessionConfiguration,
      userContext: config.userContext,
      retrieveAndGenerateConfiguration: {
        type: 'KNOWLEDGE_BASE',
        knowledgeBaseConfiguration: {
          generationConfiguration: config.generationConfiguration,
          orchestrationConfiguration: config.orchestrationConfiguration,
          retrievalConfiguration: {
            vectorSearchConfiguration: {
              ...config.retrievalConfiguration!.vectorSearchConfiguration,
              numberOfResults: 3,
            },
          },
        },
      },
    });
    expect(result.metadata).toMatchObject({
      sessionId: 'existing-session',
      guardrailAction: 'INTERVENED',
    });
    expect(result.guardrails?.flagged).toBe(true);
  });

  it('uses Retrieve without requiring a generation model and preserves pagination', async () => {
    const { provider, send } = kb({
      operation: 'retrieve',
      modelArn: undefined,
      nextToken: 'page-two',
      guardrailConfiguration: { guardrailId: 'guardrail', guardrailVersion: '1' },
    });
    const retrievalResults = [
      { content: { text: 'reference' }, score: 0.9, metadata: { team: 'support' } },
    ];
    send.mockResolvedValue({
      retrievalResults,
      nextToken: 'page-three',
      guardrailAction: 'INTERVENED',
    });
    const result = await provider.callApi('question');
    expect(send.mock.calls[0][0]).toBeInstanceOf(RetrieveCommand);
    expect(send.mock.calls[0][0].input).toMatchObject({
      retrievalQuery: { text: 'question' },
      nextToken: 'page-two',
      guardrailConfiguration: { guardrailId: 'guardrail', guardrailVersion: '1' },
    });
    expect(JSON.parse(String(result.output))).toEqual(retrievalResults);
    expect(result.metadata?.nextToken).toBe('page-three');
    expect(result.guardrails?.flagged).toBe(true);
  });

  it('collects streamed text, both citation event shapes, session ID and guardrails', async () => {
    const { provider, send } = kb({ streaming: true });
    send.mockResolvedValue({
      sessionId: 'stream-session',
      stream: events([
        { output: { text: 'part ' } },
        { output: { text: 'two' } },
        { citation: { citation: { retrievedReferences: [{ content: { text: 'first' } }] } } },
        { citation: { retrievedReferences: [{ content: { text: 'second' } }] } },
        { guardrail: { action: 'INTERVENED' } },
      ]),
    });
    const result = await provider.callApi('question');
    expect(send.mock.calls[0][0]).toBeInstanceOf(RetrieveAndGenerateStreamCommand);
    expect(result.output).toBe('part two');
    expect(result.metadata?.sessionId).toBe('stream-session');
    expect(result.metadata?.citations).toHaveLength(2);
    expect(result.guardrails?.flagged).toBe(true);
  });

  it('surfaces stream exceptions instead of returning a successful partial answer', async () => {
    const { provider, send } = kb({ streaming: true });
    send.mockResolvedValue({
      stream: events([
        { output: { text: 'partial' } },
        { throttlingException: { message: 'fixture throttle' } },
      ]),
    });
    const result = await provider.callApi('question');
    expect(result.error).toContain('throttlingException');
    expect(result.output).toBeUndefined();
  });

  it('serializes external-source bytes using the actual SDK without requiring a KB', async () => {
    const { provider } = kb({
      knowledgeBaseId: undefined,
      retrieveAndGenerateConfiguration: {
        type: 'EXTERNAL_SOURCES',
        externalSourcesConfiguration: {
          modelArn: 'us.anthropic.claude-sonnet-4-6',
          sources: [
            {
              sourceType: 'BYTE_CONTENT',
              byteContent: {
                identifier: 'reference.txt',
                contentType: 'text/plain',
                data: 'YWJj' as unknown as Uint8Array,
              },
            },
          ],
        },
      },
    });
    const handle = vi.fn(async (_request: { body?: unknown }) => ({
      response: {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: new TextEncoder().encode('{"output":{"text":"answer"},"sessionId":"session"}'),
      },
    }));
    const client = new BedrockAgentRuntimeClient({
      region: 'us-east-1',
      credentials: { accessKeyId: 'LOCAL_FIXTURE', secretAccessKey: 'LOCAL_FIXTURE' },
      requestHandler: { handle },
    });
    vi.spyOn(provider, 'getKnowledgeBaseClient').mockResolvedValue(client);
    try {
      expect((await provider.callApi('question')).output).toBe('answer');
      const body = JSON.parse(String(handle.mock.calls[0][0].body));
      expect(
        body.retrieveAndGenerateConfiguration.externalSourcesConfiguration.sources[0].byteContent
          .data,
      ).toBe('YWJj');
      expect(body.retrieveAndGenerateConfiguration).not.toHaveProperty(
        'knowledgeBaseConfiguration',
      );
    } finally {
      client.destroy();
    }
  });

  it('distinguishes nested filters while sharing cache keys across object-key order', async () => {
    cache.enabled = true;
    for (const filter of [
      { equals: { key: 'team', value: 'a' } },
      { equals: { key: 'team', value: 'b' } },
      { equals: { value: 'a', key: 'team' } },
    ]) {
      const { provider } = kb({
        retrievalConfiguration: { vectorSearchConfiguration: { filter } },
      });
      await provider.callApi('same question');
    }
    const keys = cache.get.mock.calls.map(([key]) => key);
    expect(keys).toHaveLength(3);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys[0]).toBe(keys[2]);
  });

  it('does not replay or store explicit session calls', async () => {
    cache.enabled = true;
    const { provider, send } = kb({ sessionId: 'existing-session' });
    await provider.callApi('next turn');
    await provider.callApi('next turn');
    expect(send).toHaveBeenCalledTimes(2);
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });
});

it('uses the same Agent cache key for equivalent nested configuration order', async () => {
  cache.enabled = true;
  const first = agent({
    promptCreationConfigurations: {
      excludePreviousThinkingSteps: true,
      previousConversationTurnsToInclude: 2,
    },
  });
  const second = agent({
    promptCreationConfigurations: {
      previousConversationTurnsToInclude: 2,
      excludePreviousThinkingSteps: true,
    },
  });
  first.send.mockResolvedValue({
    completion: events([{ chunk: { bytes: Buffer.from('answer') } }]),
  });
  second.send.mockResolvedValue({
    completion: events([{ chunk: { bytes: Buffer.from('answer') } }]),
  });
  expect((await first.provider.callApi('question')).error).toBeUndefined();
  expect((await second.provider.callApi('question')).error).toBeUndefined();
  expect(cache.get.mock.calls[0][0]).toBe(cache.get.mock.calls[1][0]);
});

describe('Agent runtime features', () => {
  it('rejects malformed filters in native session knowledge-base overrides', async () => {
    const { provider, send } = agent({
      sessionState: {
        knowledgeBaseConfigurations: [
          {
            knowledgeBaseId: 'KB12345678',
            retrievalConfiguration: {
              vectorSearchConfiguration: { filter: { team: 'private' } as never },
            },
          },
        ],
      },
    });
    expect((await provider.callApi('question')).error).toContain(
      'Invalid sessionState.knowledgeBaseConfigurations',
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('does not cache pending return-control invocations', async () => {
    cache.enabled = true;
    const { provider, send } = agent();
    send.mockResolvedValue({
      sessionId: 'session',
      completion: events([{ returnControl: { invocationId: 'invocation', invocationInputs: [] } }]),
    });
    expect((await provider.callApi('question')).metadata?.returnControl).toBeDefined();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('does not replay or store explicit session turns', async () => {
    cache.enabled = true;
    const { provider, send } = agent({ sessionId: 'existing-session' });
    send.mockImplementation(async () => ({
      completion: events([{ chunk: { bytes: Buffer.from('answer') } }]),
    }));
    await provider.callApi('next turn');
    await provider.callApi('next turn');
    expect(send).toHaveBeenCalledTimes(2);
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('forwards native runtime controls and the complete session state', async () => {
    const config: Partial<AgentConfig> = {
      streamingConfigurations: { streamFinalResponse: true, applyGuardrailInterval: 50 },
      promptCreationConfigurations: {
        excludePreviousThinkingSteps: true,
        previousConversationTurnsToInclude: 2,
      },
      bedrockModelConfigurations: { performanceConfig: { latency: 'optimized' } },
      sourceArn: 'arn:aws:bedrock:us-east-1:123456789012:agent/COLLABORATOR',
      sessionState: {
        invocationId: 'invocation',
        conversationHistory: { messages: [{ role: 'user', content: [{ text: 'prior turn' }] }] },
        files: [
          {
            name: 'reference.txt',
            useCase: 'CHAT',
            source: {
              sourceType: 'BYTE_CONTENT',
              byteContent: { mediaType: 'text/plain', data: 'YWJj' as unknown as Uint8Array },
            },
          },
        ],
        returnControlInvocationResults: [
          {
            functionResult: {
              actionGroup: 'lookup',
              function: 'search',
              responseBody: { TEXT: { body: 'result' } },
              confirmationState: 'CONFIRM',
              responseState: 'REPROMPT',
            },
          },
        ],
      },
    };
    const { provider, send } = agent(config);
    send.mockResolvedValue({ completion: events([{ chunk: { bytes: Buffer.from('answer') } }]) });
    expect((await provider.callApi('question')).output).toBe('answer');
    const command = send.mock.calls[0][0];
    expect(command).toBeInstanceOf(InvokeAgentCommand);
    expect(command.input).toMatchObject({
      ...config,
      sessionState: {
        ...config.sessionState,
        files: [
          {
            ...config.sessionState!.files![0],
            source: {
              sourceType: 'BYTE_CONTENT',
              byteContent: { mediaType: 'text/plain', data: Buffer.from('abc') },
            },
          },
        ],
      },
    });
  });

  it('retains attribution, files, return control, session, memory and guardrail traces', async () => {
    const { provider, send } = agent({ enableTrace: true });
    const citation = { retrievedReferences: [{ content: { text: 'evidence' } }] };
    const control = {
      invocationId: 'invocation',
      invocationInputs: [
        { functionInvocationInput: { actionGroup: 'lookup', function: 'search' } },
      ],
    };
    send.mockResolvedValue({
      sessionId: 'session',
      memoryId: 'memory',
      contentType: 'application/json',
      completion: events([
        { chunk: { bytes: new Uint8Array([0xc3]), attribution: { citations: [citation] } } },
        { chunk: { bytes: new Uint8Array([0xa9]) } },
        { trace: { trace: { guardrailTrace: { action: 'INTERVENED' } } } },
        { returnControl: control },
        {
          files: { files: [{ name: 'result.txt', type: 'text/plain', bytes: Buffer.from('abc') }] },
        },
      ]),
    });
    const result = await provider.callApi('question');
    expect(result.output).toBe('é');
    expect(result.metadata).toMatchObject({
      sessionId: 'session',
      memoryId: 'memory',
      contentType: 'application/json',
      citations: [citation],
      returnControl: [control],
      files: [{ name: 'result.txt', type: 'text/plain', bytes: 'YWJj' }],
    });
    expect(result.guardrails?.flagged).toBe(true);
  });

  it('returns return-control-only responses as structured output without executing actions', async () => {
    const { provider, send } = agent();
    const control = { invocationId: 'invocation', invocationInputs: [] };
    send.mockResolvedValue({ completion: events([{ returnControl: control }]) });
    const result = await provider.callApi('question');
    expect(result.error).toBeUndefined();
    expect(JSON.parse(String(result.output))).toEqual([control]);
  });

  it.each([
    'accessDeniedException',
    'badGatewayException',
    'conflictException',
    'dependencyFailedException',
    'internalServerException',
    'modelNotReadyException',
    'resourceNotFoundException',
    'serviceQuotaExceededException',
    'throttlingException',
    'validationException',
  ])('surfaces agent %s events', async (name) => {
    const { provider, send } = agent();
    send.mockResolvedValue({
      completion: events([
        { chunk: { bytes: Buffer.from('partial') } },
        { [name]: { message: 'fixture failure' } },
      ]),
    });
    const result = await provider.callApi('question');
    expect(result.error).toContain(name);
    expect(result.output).toBeUndefined();
  });
});

describe('managed-search filter validation', () => {
  const invalid = { managedSearchConfiguration: { filter: { team: 'private' } as never } };
  it('rejects malformed managed retrieval filters', async () => {
    const { provider, send } = kb({ operation: 'retrieve', retrievalConfiguration: invalid });
    expect((await provider.callApi('question')).error).toContain(
      'Invalid Knowledge Base retrieval filter',
    );
    expect(send).not.toHaveBeenCalled();
  });
  it.each(['root', 'session'] as const)(
    'rejects malformed agent %s managed-search filters',
    async (scope) => {
      const knowledgeBaseConfigurations = [
        { knowledgeBaseId: 'KB12345678', retrievalConfiguration: invalid },
      ];
      const { provider, send } = agent(
        scope === 'root'
          ? { knowledgeBaseConfigurations }
          : { sessionState: { knowledgeBaseConfigurations } },
      );
      expect((await provider.callApi('question')).error).toContain('Invalid');
      expect(send).not.toHaveBeenCalled();
    },
  );
});
