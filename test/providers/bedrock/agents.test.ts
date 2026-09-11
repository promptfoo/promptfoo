import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AwsBedrockAgentsProvider } from '../../../src/providers/bedrock/agents';
import { sha256 } from '../../../src/util/createHash';

const mockSend = vi.fn();
const mockBedrockClient = {
  send: mockSend,
};

vi.mock('@aws-sdk/client-bedrock-agent-runtime', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    BedrockAgentRuntimeClient: vi.fn().mockImplementation(function () {
      return mockBedrockClient;
    }),
    InvokeAgentCommand: vi.fn().mockImplementation(function (params) {
      return params;
    }),
  };
});

let BedrockAgentRuntimeClient: typeof import('@aws-sdk/client-bedrock-agent-runtime').BedrockAgentRuntimeClient;

vi.mock('@smithy/node-http-handler', () => ({
  __esModule: true,
  NodeHttpHandler: vi.fn().mockImplementation(function () {
    return {
      handle: vi.fn(),
    };
  }),
  default: vi.fn().mockImplementation(function () {
    return {
      handle: vi.fn(),
    };
  }),
}));

vi.mock('proxy-agent', () => ({
  __esModule: true,
  ProxyAgent: vi.fn(function ProxyAgentMock() {}),
  default: vi.fn(function ProxyAgentMock() {}),
}));

const mockGet = vi.hoisted(() => vi.fn());
const mockSet = vi.hoisted(() => vi.fn());
const mockIsCacheEnabled = vi.fn().mockReturnValue(false);

vi.mock('../../../src/cache', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    getCache: vi.fn().mockImplementation(function () {
      return {
        get: mockGet,
        set: mockSet,
      };
    }),
    isCacheEnabled: () => mockIsCacheEnabled(),
  };
});

function buildAgentCacheKey({
  agentId,
  agentAliasId,
  prompt,
  region,
  actionGroups,
  enableTrace,
  endSession,
  guardrailConfiguration,
  inferenceConfig,
  inputDataConfig,
  knowledgeBaseConfigurations,
  memoryId,
  promptOverrideConfiguration,
  sessionId,
  sessionState,
}: {
  agentId: string;
  agentAliasId: string;
  prompt: string;
  region: string;
  actionGroups?: Array<Record<string, unknown>>;
  enableTrace?: boolean;
  endSession?: boolean;
  guardrailConfiguration?: Record<string, unknown>;
  inferenceConfig?: Record<string, unknown>;
  inputDataConfig?: Record<string, unknown>;
  knowledgeBaseConfigurations?: Array<Record<string, unknown>>;
  memoryId?: string;
  promptOverrideConfiguration?: Record<string, unknown>;
  sessionId?: string;
  sessionState?: Record<string, unknown>;
}) {
  return `bedrock-agent:v2:${agentId}:${agentAliasId}:${region}:${sha256(
    JSON.stringify({
      prompt,
      actionGroups,
      enableTrace,
      endSession,
      guardrailConfiguration,
      inferenceConfig,
      inputDataConfig,
      knowledgeBaseConfigurations,
      memoryId,
      promptOverrideConfiguration,
      sessionId,
      sessionState,
    }),
  )}`;
}

function makeCompletionResponse(output: string) {
  return {
    completion: (async function* () {
      yield {
        chunk: {
          bytes: new TextEncoder().encode(output),
        },
      };
    })(),
    sessionId: 'agent-session-id',
  };
}

describe('AwsBedrockAgentsProvider', () => {
  beforeAll(async () => {
    const bedrockModule = await import('@aws-sdk/client-bedrock-agent-runtime');
    BedrockAgentRuntimeClient = bedrockModule.BedrockAgentRuntimeClient;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockReset();
    mockGet.mockReset();
    mockSet.mockReset();
    mockIsCacheEnabled.mockReset().mockReturnValue(false);
    vi.unstubAllEnvs();
    vi.stubEnv('AWS_BEDROCK_MAX_RETRIES', '');
    vi.stubEnv('AWS_BEARER_TOKEN_BEDROCK', '');
    vi.stubEnv('HTTPS_PROXY', '');
    vi.stubEnv('https_proxy', '');
    vi.stubEnv('HTTP_PROXY', '');
    vi.stubEnv('http_proxy', '');
    vi.stubEnv('npm_config_https_proxy', '');
    vi.stubEnv('npm_config_http_proxy', '');
    vi.stubEnv('npm_config_proxy', '');
    vi.stubEnv('all_proxy', '');
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('places knowledge-base retrieval overrides in sessionState without explicit session attributes', async () => {
    const knowledgeBaseConfigurations = [
      {
        knowledgeBaseId: 'kb-123',
        retrievalConfiguration: { vectorSearchConfiguration: { numberOfResults: 3 } },
      },
      { knowledgeBaseId: 'kb-deployed-defaults' },
    ];
    const provider = new AwsBedrockAgentsProvider('agent-123', {
      config: {
        agentId: 'agent-123',
        agentAliasId: 'alias-456',
        region: 'us-east-1',
        knowledgeBaseConfigurations,
        guardrailConfiguration: { guardrailId: 'configured-only', guardrailVersion: '1' },
      },
    });
    mockSend.mockResolvedValueOnce(makeCompletionResponse('A quiet garden'));
    const result = await provider.callApi('Describe the garden');
    expect(result.output).toBe('A quiet garden');
    expect(mockSend.mock.calls[0][0].sessionState.knowledgeBaseConfigurations).toEqual([
      knowledgeBaseConfigurations[0],
    ]);
    expect(knowledgeBaseConfigurations).toHaveLength(2);
    expect(mockSend.mock.calls[0][0]).not.toHaveProperty('knowledgeBaseConfigurations');
    expect(result.metadata).not.toHaveProperty('guardrails');
  });

  it('uses deployed knowledge-base defaults for legacy ID-only configuration', async () => {
    const provider = new AwsBedrockAgentsProvider('agent-123', {
      config: {
        agentId: 'agent-123',
        agentAliasId: 'alias-456',
        knowledgeBaseConfigurations: [{ knowledgeBaseId: 'kb-123' }],
      },
    });
    mockSend.mockResolvedValueOnce(makeCompletionResponse('A quiet garden'));

    const result = await provider.callApi('Describe the garden');

    expect(result.output).toBe('A quiet garden');
    expect(mockSend.mock.calls[0][0].sessionState).toBeUndefined();
  });

  it.each([
    { category: 'technical' },
    { documentType: 'manual', product: 'widget-pro' },
    {},
    null,
    [],
    'category',
    { equals: 'technical' },
    { equals: { key: 'category' } },
    { equals: { key: 'category', value: 'technical' }, product: 'widget-pro' },
    {
      equals: { key: 'category', value: 'technical' },
      notEquals: { key: 'product', value: 'old' },
    },
    { andAll: [{ equals: { key: 'category', value: 'technical' } }] },
    { orAll: [{ equals: { key: 'category', value: 'technical' } }, { product: 'widget-pro' }] },
  ])(
    'rejects unsupported retrieval filter %j before client creation or cache lookup',
    async (filter) => {
      const provider = new AwsBedrockAgentsProvider('agent-123', {
        config: {
          agentId: 'agent-123',
          agentAliasId: 'alias-456',
          knowledgeBaseConfigurations: [
            {
              knowledgeBaseId: 'kb-123',
              retrievalConfiguration: { vectorSearchConfiguration: { filter: filter as any } },
            },
          ],
        },
      });
      const getClient = vi.spyOn(provider, 'getAgentRuntimeClient');
      mockIsCacheEnabled.mockReturnValue(true);
      mockGet.mockResolvedValueOnce(JSON.stringify({ output: 'cached response' }));

      const result = await provider.callApi('Describe a quiet garden');

      expect(result).toEqual({
        error:
          'Invalid knowledgeBaseConfigurations[0].retrievalConfiguration.vectorSearchConfiguration.filter: use an AWS RetrievalFilter with one operator, such as equals, or andAll/orAll with at least two operands. Flat metadata maps are not supported.',
      });
      expect(getClient).not.toHaveBeenCalled();
      expect(mockGet).not.toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
    },
  );

  it('does not replay legacy cached guardrail claims', async () => {
    mockIsCacheEnabled.mockReturnValue(true);
    mockGet.mockImplementation(async (key: string) =>
      key.startsWith('bedrock-agent:v2:')
        ? null
        : JSON.stringify({
            output: 'legacy response',
            metadata: { guardrails: { applied: true } },
          }),
    );
    const provider = new AwsBedrockAgentsProvider('agent-123', {
      config: { agentId: 'agent-123', agentAliasId: 'alias-456', region: 'us-east-1' },
    });
    mockSend.mockResolvedValueOnce(makeCompletionResponse('fresh response'));

    const result = await provider.callApi('Describe a quiet garden');

    expect(result.output).toBe('fresh response');
    expect(result.metadata).not.toHaveProperty('guardrails');
    expect(result.cached).not.toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('should hash prompt and config values while reusing the same cache key', async () => {
    mockIsCacheEnabled.mockReturnValue(true);

    const provider = new AwsBedrockAgentsProvider('agent-123', {
      config: {
        agentId: 'agent-123',
        agentAliasId: 'alias-456',
        region: 'us-east-1',
        sessionState: {
          promptSessionAttributes: {
            tenant: 'SECRET_SESSION_ATTRIBUTE',
          },
        },
        knowledgeBaseConfigurations: [
          {
            knowledgeBaseId: 'kb-123',
            retrievalConfiguration: {
              vectorSearchConfiguration: {
                filter: {
                  equals: { key: 'sensitiveFilter', value: 'SECRET_FILTER_VALUE' },
                },
              },
            },
          },
        ],
      },
    });

    mockGet.mockResolvedValueOnce(null).mockResolvedValueOnce(
      JSON.stringify({
        output: 'cached response',
        metadata: { sessionId: 'cached-session-id' },
      }),
    );
    mockSend.mockResolvedValueOnce(makeCompletionResponse('fresh response'));

    const prompt = 'SECRET_PROMPT_VALUE';
    const firstResult = await provider.callApi(prompt);
    const secondResult = await provider.callApi(prompt);

    const firstKey = mockGet.mock.calls[0][0];
    const secondKey = mockGet.mock.calls[1][0];

    expect(firstKey).toBe(
      buildAgentCacheKey({
        agentId: 'agent-123',
        agentAliasId: 'alias-456',
        prompt,
        region: 'us-east-1',
        sessionState: {
          promptSessionAttributes: {
            tenant: 'SECRET_SESSION_ATTRIBUTE',
          },
        },
        knowledgeBaseConfigurations: [
          {
            knowledgeBaseId: 'kb-123',
            retrievalConfiguration: {
              vectorSearchConfiguration: {
                filter: {
                  equals: { key: 'sensitiveFilter', value: 'SECRET_FILTER_VALUE' },
                },
              },
            },
          },
        ],
      }),
    );
    expect(firstKey).not.toContain(prompt);
    expect(firstKey).not.toContain('SECRET_FILTER_VALUE');
    expect(firstKey).not.toContain('SECRET_SESSION_ATTRIBUTE');
    expect(secondKey).toBe(firstKey);
    expect(mockSet).toHaveBeenCalledWith(firstKey, expect.any(String));
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(firstResult).toEqual({
      output: 'fresh response',
      metadata: {
        sessionId: 'agent-session-id',
      },
    });
    expect(secondResult).toEqual({
      output: 'cached response',
      metadata: {
        sessionId: 'cached-session-id',
      },
      cached: true,
    });

    mockIsCacheEnabled.mockReturnValue(false);
  });

  it('should separate cache keys for response-shaping agent configuration', async () => {
    mockIsCacheEnabled.mockReturnValue(true);

    const firstProvider = new AwsBedrockAgentsProvider('agent-123', {
      config: {
        agentId: 'agent-123',
        agentAliasId: 'alias-456',
        region: 'us-east-1',
        sessionState: {
          promptSessionAttributes: {
            tenant: 'SECRET_TENANT_A',
          },
        },
      },
    });
    const secondProvider = new AwsBedrockAgentsProvider('agent-123', {
      config: {
        agentId: 'agent-123',
        agentAliasId: 'alias-456',
        region: 'us-east-1',
        sessionState: {
          promptSessionAttributes: {
            tenant: 'SECRET_TENANT_B',
          },
        },
      },
    });

    mockGet.mockResolvedValue(null);
    mockSend.mockImplementation(async () => makeCompletionResponse('fresh response'));

    await firstProvider.callApi('same prompt');
    await secondProvider.callApi('same prompt');

    const firstKey = mockGet.mock.calls[0][0];
    const secondKey = mockGet.mock.calls[1][0];

    expect(firstKey).not.toBe(secondKey);
    expect(firstKey).not.toContain('SECRET_TENANT_A');
    expect(secondKey).not.toContain('SECRET_TENANT_B');

    mockIsCacheEnabled.mockReturnValue(false);
  });

  it('should create the agent runtime client with the expected region', async () => {
    const provider = new AwsBedrockAgentsProvider('agent-123', {
      config: {
        agentId: 'agent-123',
        agentAliasId: 'alias-456',
        region: 'us-east-1',
      },
    });

    await provider.getAgentRuntimeClient();

    expect(BedrockAgentRuntimeClient).toHaveBeenCalledWith({
      region: 'us-east-1',
      retryMode: 'adaptive',
      maxAttempts: 10,
    });
  });
});
