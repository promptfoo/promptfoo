import { fromSSO } from '@aws-sdk/credential-provider-sso';
import { NodeHttp2Handler, NodeHttpHandler } from '@smithy/node-http-handler';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AwsBedrockAgentsProvider } from '../../../src/providers/bedrock/agents';
import { AwsBedrockKnowledgeBaseProvider } from '../../../src/providers/bedrock/knowledgeBase';
import { mockProcessEnv } from '../../util/utils';

const credentials = { accessKeyId: 'synthetic-profile', secretAccessKey: 'synthetic' };
vi.mock('@aws-sdk/credential-provider-sso', () => ({
  fromSSO: vi.fn(() => async () => credentials),
}));
afterEach(() => vi.restoreAllMocks());

describe('Agent Runtime authentication', () => {
  it.each(['agent', 'knowledge-base'] as const)(
    'keeps the configured SSO profile for %s when a Runtime bearer token is present',
    async (kind) => {
      const restore = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: 'synthetic-bearer' });
      try {
        const config = { region: 'us-east-1', profile: 'synthetic-profile' };
        const client =
          kind === 'agent'
            ? await new AwsBedrockAgentsProvider('AGENT12345', {
                config: { ...config, agentId: 'AGENT12345', agentAliasId: 'ALIAS12345' },
              }).getAgentRuntimeClient()
            : await new AwsBedrockKnowledgeBaseProvider('default', {
                config: { ...config, knowledgeBaseId: 'KB12345678' },
              }).getKnowledgeBaseClient();
        expect(await client.config.credentials()).toEqual(expect.objectContaining(credentials));
        expect(fromSSO).toHaveBeenCalledWith({ profile: 'synthetic-profile' });
        client.destroy();
      } finally {
        restore();
      }
    },
  );

  it('signs Knowledge Base requests with SigV4 without overwriting it with a bearer token', async () => {
    const handle = vi.spyOn(NodeHttpHandler.prototype, 'handle').mockResolvedValue({
      response: {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from('{"retrievalResults":[]}'),
      },
    });
    vi.spyOn(NodeHttp2Handler.prototype, 'handle').mockImplementation(handle as any);
    const provider = new AwsBedrockKnowledgeBaseProvider('default', {
      config: {
        knowledgeBaseId: 'KB12345678',
        operation: 'retrieve',
        region: 'us-east-1',
        apiKey: 'synthetic-bearer',
        ...credentials,
      },
    });
    const result = await provider.callApi('synthetic question');
    expect(result.error).toBeUndefined();
    const headers = handle.mock.calls[0][0].headers;
    expect(headers.authorization).toMatch(/^AWS4-HMAC-SHA256 /);
    expect(Object.values(headers).join(' ')).not.toContain('synthetic-bearer');
    (await provider.getKnowledgeBaseClient()).destroy();
  });
});
