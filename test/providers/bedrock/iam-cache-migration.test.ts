import { BedrockAgentRuntimeClient } from '@aws-sdk/client-bedrock-agent-runtime';
import { BedrockRuntime } from '@aws-sdk/client-bedrock-runtime';
import { NodeHttp2Handler, NodeHttpHandler } from '@smithy/node-http-handler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AwsBedrockCompletionProvider } from '../../../src/providers/bedrock';
import { AwsBedrockConverseProvider } from '../../../src/providers/bedrock/converse';
import { AwsBedrockKnowledgeBaseProvider } from '../../../src/providers/bedrock/knowledgeBase';
import { mockProcessEnv } from '../../util/utils';
import type { HttpRequest } from '@smithy/types';

const fixtures = vi.hoisted(() => ({ cache: new Map<string, string>() }));
vi.mock('../../../src/cache', () => ({
  isCacheEnabled: () => true,
  getCache: async () => ({
    get: async (key: string) => fixtures.cache.get(key),
    set: async (key: string, value: string) => fixtures.cache.set(key, value),
  }),
}));
const credentials = { accessKeyId: 'configured-access', secretAccessKey: 'configured-secret' };
let restore: () => void;
let authorizations: string[];
const clients: Array<{ destroy: () => void }> = [];

beforeEach(() => {
  restore = mockProcessEnv({ AWS_EC2_METADATA_DISABLED: 'true' }, { clear: true });
  authorizations = [];
  fixtures.cache.clear();
  const handle = async (request: HttpRequest) => {
    const auth =
      Object.entries(request.headers)
        .filter(([name]) => name.toLowerCase() === 'authorization')
        .at(-1)?.[1] ?? '';
    authorizations.push(auth);
    const owner = auth.startsWith('Bearer ') ? 'legacy-bearer-owner' : 'configured-iam-owner';
    return {
      response: {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(
          JSON.stringify({
            completion: owner,
            content: [{ type: 'text', text: owner }],
            stop_reason: 'stop_sequence',
            output: { text: owner, message: { role: 'assistant', content: [{ text: owner }] } },
            stopReason: 'end_turn',
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          }),
        ),
      },
    };
  };
  vi.spyOn(NodeHttpHandler.prototype, 'handle').mockImplementation(handle);
  vi.spyOn(NodeHttp2Handler.prototype, 'handle').mockImplementation(handle);
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network access'));
});

afterEach(() => {
  for (const client of clients.splice(0)) {
    client.destroy();
  }
  vi.resetAllMocks();
  vi.restoreAllMocks();
  restore();
});

function createProvider(kind: string, configuredBearer: boolean) {
  const options = {
    config: {
      ...credentials,
      region: 'us-east-1',
      ...(configuredBearer ? { apiKey: 'legacy-bearer-token' } : {}),
    },
  };
  if (kind === 'kb') {
    return new AwsBedrockKnowledgeBaseProvider('anthropic.claude-3-sonnet-20240229-v1:0', {
      config: { ...options.config, knowledgeBaseId: 'fixture-kb' },
    });
  }
  if (kind === 'converse') {
    return new AwsBedrockConverseProvider('anthropic.claude-3-sonnet-20240229-v1:0', options);
  }
  return new AwsBedrockCompletionProvider('anthropic.claude-3-haiku-20240307-v1:0', options);
}

// Released clients applied a bearer header after SDK signing, and used no added namespace.
function useReleasedClient(provider: ReturnType<typeof createProvider>, kind: string) {
  Object.defineProperty(provider, 'responseCacheNamespace', { get: () => undefined });
  const handler = new NodeHttpHandler();
  const options = {
    region: 'us-east-1',
    credentials,
    requestHandler: {
      handle: (
        request: Parameters<NodeHttpHandler['handle']>[0],
        context?: Parameters<NodeHttpHandler['handle']>[1],
      ) => {
        request.headers.Authorization = 'Bearer legacy-bearer-token';
        return handler.handle(request, context);
      },
      destroy: () => handler.destroy(),
    },
  };
  if (kind === 'kb') {
    const client = new BedrockAgentRuntimeClient(options);
    (provider as AwsBedrockKnowledgeBaseProvider).knowledgeBaseClient = client;
    clients.push(client);
  } else {
    const client = new BedrockRuntime(options);
    provider.bedrock = client;
    clients.push(client);
  }
}

describe('configured Bedrock IAM cache migration', () => {
  it.each(
    ['completion', 'converse', 'kb'].flatMap((kind) =>
      ['config', 'ambient', 'ambient-removed'].map((bearer) => ({ kind, bearer })),
    ),
  )('does not reuse a released $kind $bearer bearer response for IAM', async ({ kind, bearer }) => {
    if (bearer !== 'config') {
      mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: 'legacy-bearer-token' });
    }
    const released = createProvider(kind, bearer === 'config');
    useReleasedClient(released, kind);
    expect(await released.callApi('fixture prompt')).toMatchObject({
      output: 'legacy-bearer-owner',
    });
    const legacyKeys = [...fixtures.cache.keys()];
    expect(legacyKeys).toHaveLength(1);
    if (bearer === 'ambient-removed') {
      mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: undefined });
    }
    const current = createProvider(kind, bearer === 'config');
    expect(await current.callApi('fixture prompt')).toMatchObject({
      output: 'configured-iam-owner',
    });
    expect(await current.callApi('fixture prompt')).toMatchObject({
      output: 'configured-iam-owner',
      cached: true,
    });
    const currentClient =
      kind === 'kb'
        ? (current as AwsBedrockKnowledgeBaseProvider).knowledgeBaseClient
        : current.bedrock;
    if (currentClient) {
      clients.push(currentClient);
    }
    expect(authorizations).toHaveLength(2);
    expect(authorizations[0]).toBe('Bearer legacy-bearer-token');
    expect(authorizations[1]).toContain('Credential=configured-access/');
    expect([...fixtures.cache.keys()].filter((key) => !legacyKeys.includes(key))).toHaveLength(1);
  });
});
