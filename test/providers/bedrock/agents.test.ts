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
  return `bedrock-agent:${agentId}:${agentAliasId}:${region}:${sha256(
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
                  sensitiveFilter: 'SECRET_FILTER_VALUE',
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
                  sensitiveFilter: 'SECRET_FILTER_VALUE',
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
