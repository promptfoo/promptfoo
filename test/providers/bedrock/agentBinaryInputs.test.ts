import { BedrockAgentRuntimeClient } from '@aws-sdk/client-bedrock-agent-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AwsBedrockAgentsProvider } from '../../../src/providers/bedrock/agents';
import { AwsBedrockKnowledgeBaseProvider } from '../../../src/providers/bedrock/knowledgeBase';
import { loadApiProvider } from '../../../src/providers/index';

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/cache')>()),
  isCacheEnabled: () => false,
}));

afterEach(() => vi.restoreAllMocks());

describe.each(['Uint8Array', 'Buffer'])('Agent Runtime native %s inputs', (type) => {
  it.each(['agent', 'knowledge-base', 'knowledge-base-stream'])(
    'preserves bytes through the public %s loader and SDK serializer',
    async (kind) => {
      const data = type === 'Buffer'
        ? Buffer.from('abc')
        : new Uint8Array([0, 97, 98, 99, 0]).subarray(1, 4);
      const handle = vi.fn(async (_request: {body?: unknown}) => ({response: {
        statusCode: 400,
        headers: {'content-type': 'application/json', 'x-amzn-errortype': 'ValidationException'},
        body: Buffer.from('{"message":"fixture request captured"}'),
      }}));
      const client = new BedrockAgentRuntimeClient({
        region: 'us-east-1', maxAttempts: 1,
        credentials: {accessKeyId: 'LOCAL_FIXTURE', secretAccessKey: 'LOCAL_FIXTURE'},
        requestHandler: {handle},
      });
      const config = kind === 'agent' ? {
        agentAliasId: 'ALIAS12345',
        sessionState: {files: [{
          name: 'reference.txt', useCase: 'CHAT',
          source: {sourceType: 'BYTE_CONTENT', byteContent: {mediaType: 'text/plain', data}},
        }]},
      } : {
        streaming: kind === 'knowledge-base-stream',
        retrieveAndGenerateConfiguration: {
          type: 'EXTERNAL_SOURCES',
          externalSourcesConfiguration: {
            modelArn: 'model', sources: [{sourceType: 'BYTE_CONTENT', byteContent: {
              identifier: 'reference.txt', contentType: 'text/plain', data,
            }}],
          },
        },
      };
      try {
        const provider = await loadApiProvider(
          kind === 'agent' ? 'bedrock-agent:AGENT12345' : 'bedrock:kb:default',
          {options: {config: {region: 'us-east-1', ...config}}},
        );
        if (kind === 'agent') {
          expect(provider).toBeInstanceOf(AwsBedrockAgentsProvider);
          vi.spyOn(provider as AwsBedrockAgentsProvider, 'getAgentRuntimeClient').mockResolvedValue(client);
        } else {
          expect(provider).toBeInstanceOf(AwsBedrockKnowledgeBaseProvider);
          vi.spyOn(provider as AwsBedrockKnowledgeBaseProvider, 'getKnowledgeBaseClient').mockResolvedValue(client);
        }
        expect((await provider.callApi('fixture')).error).toContain('fixture request captured');
        const raw = handle.mock.calls[0][0].body;
        const body = JSON.parse(typeof raw === 'string' ? raw : Buffer.from(raw as Uint8Array).toString());
        const sent = kind === 'agent'
          ? body.sessionState.files[0].source.byteContent.data
          : body.retrieveAndGenerateConfiguration.externalSourcesConfiguration.sources[0].byteContent.data;
        expect(sent).toBe('YWJj');
      } finally {
        client.destroy();
      }
    },
  );
});
