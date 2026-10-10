import { randomUUID } from 'crypto';

import { BedrockAgentRuntimeClient } from '@aws-sdk/client-bedrock-agent-runtime';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { runDbMigrations } from '../../../src/migrate';
import Eval from '../../../src/models/eval';
import { AwsBedrockAgentsProvider } from '../../../src/providers/bedrock/agents';
import { AwsBedrockKnowledgeBaseProvider } from '../../../src/providers/bedrock/knowledgeBase';
import { decodeBedrockBytes } from '../../../src/providers/bedrock/util';
import { loadApiProvider } from '../../../src/providers/index';

import type { ProviderOptions } from '../../../src/types/providers';

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/cache')>()),
  isCacheEnabled: () => false,
}));

beforeAll(async () => runDbMigrations());
afterEach(() => vi.restoreAllMocks());

describe.each(['Uint8Array', 'Buffer'])('Agent Runtime native %s inputs', (type) => {
  it.each(['agent', 'knowledge-base', 'knowledge-base-stream'])(
    'preserves bytes and identity through persisted %s config replay',
    async (kind) => {
      const data =
        type === 'Buffer' ? Buffer.from('abc') : new Uint8Array([0, 97, 98, 99, 0]).subarray(1, 4);
      const handle = vi.fn(async (_request: { body?: unknown }) => ({
        response: {
          statusCode: 400,
          headers: {
            'content-type': 'application/json',
            'x-amzn-errortype': 'ValidationException',
          },
          body: Buffer.from('{"message":"fixture request captured"}'),
        },
      }));
      const client = new BedrockAgentRuntimeClient({
        region: 'us-east-1',
        maxAttempts: 1,
        credentials: { accessKeyId: 'LOCAL_FIXTURE', secretAccessKey: 'LOCAL_FIXTURE' },
        requestHandler: { handle },
      });
      const config =
        kind === 'agent'
          ? {
              agentAliasId: 'ALIAS12345',
              sessionState: {
                files: [
                  {
                    name: 'reference.txt',
                    useCase: 'CHAT',
                    source: {
                      sourceType: 'BYTE_CONTENT',
                      byteContent: { mediaType: 'text/plain', data },
                    },
                  },
                ],
              },
            }
          : {
              streaming: kind === 'knowledge-base-stream',
              retrieveAndGenerateConfiguration: {
                type: 'EXTERNAL_SOURCES',
                externalSourcesConfiguration: {
                  modelArn: 'model',
                  sources: [
                    {
                      sourceType: 'BYTE_CONTENT',
                      byteContent: {
                        identifier: 'reference.txt',
                        contentType: 'text/plain',
                        data,
                      },
                    },
                  ],
                },
              },
            };
      try {
        const reference = {
          id: kind === 'agent' ? 'bedrock-agent:AGENT12345' : 'bedrock:kb:default',
          config: { region: 'us-east-1', ...config },
        };
        const original = await loadApiProvider(reference.id, { options: reference });
        const saved = await Eval.create({ providers: [reference] }, [], { id: randomUUID() });
        const loaded = await Eval.findById(saved.id);
        const [restoredReference] = loaded!.config.providers as ProviderOptions[];
        const replay = await loadApiProvider(restoredReference.id!, { options: restoredReference });
        expect(replay.id()).toBe(original.id());
        for (const provider of [original, replay]) {
          if (kind === 'agent') {
            expect(provider).toBeInstanceOf(AwsBedrockAgentsProvider);
            vi.spyOn(
              provider as AwsBedrockAgentsProvider,
              'getAgentRuntimeClient',
            ).mockResolvedValue(client);
          } else {
            expect(provider).toBeInstanceOf(AwsBedrockKnowledgeBaseProvider);
            vi.spyOn(
              provider as AwsBedrockKnowledgeBaseProvider,
              'getKnowledgeBaseClient',
            ).mockResolvedValue(client);
          }
          expect((await provider.callApi('fixture')).error).toContain('fixture request captured');
        }
        expect(handle).toHaveBeenCalledTimes(2);
        for (const [request] of handle.mock.calls) {
          const raw = request.body;
          const body = JSON.parse(
            typeof raw === 'string' ? raw : Buffer.from(raw as Uint8Array).toString(),
          );
          const sent =
            kind === 'agent'
              ? body.sessionState.files[0].source.byteContent.data
              : body.retrieveAndGenerateConfiguration.externalSourcesConfiguration.sources[0]
                  .byteContent.data;
          expect(sent).toBe('YWJj');
        }
      } finally {
        client.destroy();
      }
    },
  );
});

it.each([
  { 0: 97, 2: 99 },
  { 0: -1 },
  { 0: 256 },
  { 0: 0.5 },
  { 0: '97' },
  { type: 'Buffer', data: [97, null] },
  { type: 'Buffer', data: [97], extra: true },
])('rejects malformed serialized Bedrock byte content %j', (data) => {
  expect(() => decodeBedrockBytes(data)).toThrow('Invalid Bedrock byte content');
});

it.each(['', 'AA==', 'AA', 'AAA=', 'AAA', 'AAAA'])(
  'accepts canonical padded or unpadded base64 %j',
  (data) => {
    expect(decodeBedrockBytes(data)).toEqual(Buffer.from(data, 'base64'));
  },
);

it.each(['%%%', 'not-base64!', 'A', 'AB', 'AA=A', 'AA===', ' YQ==', 'YQ==\n', '-_=='])(
  'rejects malformed base64 %j',
  (data) => {
    expect(() => decodeBedrockBytes(data)).toThrow('Invalid Bedrock byte content');
  },
);

it('validates large base64 documents without recursive regular expressions', () => {
  const bytes = Buffer.alloc(4 * 1024 * 1024, 65);
  const base64 = bytes.toString('base64');
  expect(Buffer.compare(decodeBedrockBytes(base64)!, bytes)).toBe(0);
  expect(() => decodeBedrockBytes(base64 + '%')).toThrow('Invalid Bedrock byte content');
});

it.each(['agent', 'knowledge-base'])(
  'rejects malformed %s file bytes through the public loader before SDK dispatch',
  async (kind) => {
    const config =
      kind === 'agent'
        ? {
            agentAliasId: 'ALIAS12345',
            sessionState: {
              files: [
                {
                  name: 'file.txt',
                  useCase: 'CHAT',
                  source: {
                    sourceType: 'BYTE_CONTENT',
                    byteContent: { mediaType: 'text/plain', data: '%%%' },
                  },
                },
              ],
            },
          }
        : {
            retrieveAndGenerateConfiguration: {
              type: 'EXTERNAL_SOURCES',
              externalSourcesConfiguration: {
                modelArn: 'model',
                sources: [
                  {
                    sourceType: 'BYTE_CONTENT',
                    byteContent: { identifier: 'file.txt', contentType: 'text/plain', data: '%%%' },
                  },
                ],
              },
            },
          };
    const send = vi.spyOn(BedrockAgentRuntimeClient.prototype, 'send');
    await expect(async () => {
      const provider = await loadApiProvider(
        kind === 'agent' ? 'bedrock-agent:AGENT12345' : 'bedrock:kb:default',
        { options: { config } },
      );
      const result = await provider.callApi('hello');
      if (result.error) {
        throw new Error(result.error);
      }
    }).rejects.toThrow('Invalid Bedrock byte content');
    expect(send).not.toHaveBeenCalled();
  },
);
