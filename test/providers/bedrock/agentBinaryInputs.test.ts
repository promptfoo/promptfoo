import { randomUUID } from 'crypto';
import { runInNewContext } from 'vm';

import { BedrockAgentRuntimeClient } from '@aws-sdk/client-bedrock-agent-runtime';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { runDbMigrations } from '../../../src/migrate';
import Eval from '../../../src/models/eval';
import { sanitizeResultForJsonlArtifact } from '../../../src/models/evalResult';
import { evaluate } from '../../../src/node';
import { AwsBedrockAgentsProvider } from '../../../src/providers/bedrock/agents';
import { AwsBedrockKnowledgeBaseProvider } from '../../../src/providers/bedrock/knowledgeBase';
import { decodeBedrockBytes } from '../../../src/providers/bedrock/util';
import { loadApiProvider } from '../../../src/providers/index';
import { sanitizeConfigForOutput } from '../../../src/util/sanitizer';
import { mockProcessEnv } from '../../util/utils';

import type { UnifiedConfig } from '../../../src/types';
import type { ProviderOptions } from '../../../src/types/providers';

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/cache')>()),
  isCacheEnabled: () => false,
}));

beforeAll(async () => runDbMigrations());
afterEach(() => vi.restoreAllMocks());

function binaryConfig(kind: string, data: unknown) {
  if (kind === 'agent') {
    return {
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
    };
  }
  if (kind === 'functionResult' || kind === 'apiResult') {
    return {
      agentAliasId: 'ALIAS12345',
      sessionState: {
        invocationId: 'invocation',
        returnControlInvocationResults: [
          {
            [kind]: {
              actionGroup: 'computer',
              function: 'screenshot',
              apiPath: '/screenshot',
              httpMethod: 'GET',
              httpStatusCode: 200,
              responseBody: {
                IMAGES: {
                  body: 'preserved annotation',
                  images: [{ format: 'PNG', source: { bytes: data } }],
                },
              },
            },
          },
        ],
      },
    };
  }
  return {
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
}

describe.each(['Uint8Array', 'Buffer', 'base64', 'emptyUint8Array'])(
  'Agent Runtime native %s inputs',
  (type) => {
    it.each(['agent', 'functionResult', 'apiResult', 'knowledge-base', 'knowledge-base-stream'])(
      'preserves bytes and identity through exported and imported %s config replay',
      async (kind) => {
        const base64 = Buffer.from('known document content '.repeat(8)).toString('base64');
        const data =
          type === 'emptyUint8Array'
            ? new Uint8Array()
            : type === 'base64'
              ? base64
              : type === 'Buffer'
                ? Buffer.from('abc')
                : new Uint8Array([0, 97, 98, 99, 0]).subarray(1, 4);
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
        const config = binaryConfig(kind, data);
        const isAgent = !kind.startsWith('knowledge-base');
        try {
          const reference = {
            id: isAgent ? 'bedrock-agent:AGENT12345' : 'bedrock:kb:default',
            config: { region: 'us-east-1', ...config },
          };
          const original = await loadApiProvider(reference.id, { options: reference });
          const saved = await Eval.create({ providers: [reference] }, [], { id: randomUUID() });
          const exported = JSON.parse(JSON.stringify(await saved.toResultsFile()));
          const imported = await Eval.create(exported.config, [], { id: randomUUID() });
          const loaded = await Eval.findById(imported.id);
          const [restoredReference] = loaded!.config.providers as ProviderOptions[];
          const replay = await loadApiProvider(restoredReference.id!, {
            options: restoredReference,
          });
          expect(replay.id()).toBe(original.id());
          for (const provider of [original, replay]) {
            if (isAgent) {
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
                : isAgent
                  ? body.sessionState.returnControlInvocationResults[0][kind].responseBody.IMAGES
                      .images[0].source.bytes
                  : body.retrieveAndGenerateConfiguration.externalSourcesConfiguration.sources[0]
                      .byteContent.data;
            expect(sent).toBe(
              type === 'emptyUint8Array' ? '' : type === 'base64' ? base64 : 'YWJj',
            );
            if (kind === 'functionResult' || kind === 'apiResult') {
              const result = body.sessionState.returnControlInvocationResults[0][kind];
              expect(result.actionGroup).toBe('computer');
              expect(result.responseBody.IMAGES.body).toBe('preserved annotation');
              expect(result.responseBody.IMAGES.images[0].format).toBe('PNG');
            }
          }
        } finally {
          client.destroy();
        }
      },
    );
  },
);

describe('raw provider config exports', () => {
  const bytes = Buffer.from('ordinary declarative document '.repeat(6));
  const data = bytes.toString('base64');
  const serializedBytes = { type: 'Buffer', data: [...bytes] };
  const provider = {
    id: 'bedrock-agent:AGENT12345',
    label: 'documents',
    config: {
      ...binaryConfig('agent', data),
      apiKey: 'synthetic-key',
      secretAccessKey: 'synthetic-secret',
      unrelated: data,
      headers: { Authorization: 'Bearer synthetic-token' },
    },
  };
  const expected = {
    ...provider,
    config: {
      ...binaryConfig('agent', serializedBytes),
      apiKey: '[REDACTED]',
      secretAccessKey: '[REDACTED]',
      unrelated: '[REDACTED]',
      headers: { Authorization: '[REDACTED]' },
    },
  };

  it.each([
    ['bedrock-agent:AGENT12345', 'agent'],
    ['bedrock:agents:AGENT12345', 'agent'],
    ['bedrock:agents', 'agent'],
    ['bedrock:kb:default', 'knowledge-base'],
    ['bedrock:kb', 'knowledge-base'],
    ['bedrock:knowledge-base:default', 'knowledge-base'],
    ['bedrock:knowledge-base', 'knowledge-base'],
  ])('preserves inline blobs for %s options and provider-ID maps', (id, kind) => {
    const config = binaryConfig(kind, data);
    const input = {
      providers: [
        { id, label: 'inline', config },
        { [id]: { id: 'custom-id', label: 'mapped', config } },
      ],
    };
    const original = JSON.stringify(input);
    expect(sanitizeConfigForOutput(input)).toEqual({
      providers: [
        { id, label: 'inline', config: binaryConfig(kind, serializedBytes) },
        { [id]: { id: 'custom-id', label: 'mapped', config: binaryConfig(kind, serializedBytes) } },
      ],
    });
    expect(JSON.stringify(input)).toBe(original);
  });

  it('projects only known provider slots, retaining credential redaction and caller data', () => {
    const input = {
      providers: [provider, { ...provider, id: 'http' }],
      defaultTest: { options: { provider: { text: provider } } },
      tests: [
        { provider, assert: [{ type: 'assert-set', assert: [{ type: 'llm-rubric', provider }] }] },
      ],
      scenarios: [{ config: [{ options: { provider } }], tests: [{ provider }] }],
      metadata: { provider },
    };
    const original = JSON.stringify(input);
    const output = sanitizeConfigForOutput(input as unknown as UnifiedConfig) as typeof input;
    expect(output.providers[0]).toEqual(expected);
    expect(output.defaultTest.options.provider.text).toEqual(expected);
    expect(output.tests[0].provider).toEqual(expected);
    expect(output.tests[0].assert[0].assert[0].provider).toEqual(expected);
    expect(output.scenarios[0].config[0].options.provider).toEqual(expected);
    expect(output.scenarios[0].tests[0].provider).toEqual(expected);
    for (const ordinary of [output.providers[1], output.metadata.provider]) {
      expect(ordinary.config).toEqual({
        ...expected.config,
        ...binaryConfig('agent', '[REDACTED]'),
      });
    }
    expect(JSON.stringify(input)).toBe(original);
  });

  it('preserves raw target, test, prompt, and grading references in result artifacts', () => {
    const input = {
      provider,
      testCase: { options: { provider: { text: provider } } },
      prompt: { raw: 'question', config: { provider } },
      gradingResult: { componentResults: [{ assertion: { provider } }] },
    };
    const original = JSON.stringify(input);
    const output = sanitizeResultForJsonlArtifact(input);
    expect(output.provider).toEqual(expected);
    expect(output.testCase.options.provider.text).toEqual(expected);
    expect(output.prompt.config.provider).toEqual(expected);
    expect(output.gradingResult.componentResults[0].assertion.provider).toEqual(expected);
    expect(JSON.stringify(input)).toBe(original);
  });

  it('preserves providers in exported prompts and individual prompt configs', () => {
    const config = { provider };
    const input = { prompts: [{ raw: 'question', config }] };
    expect(sanitizeConfigForOutput(config as unknown as UnifiedConfig)).toEqual({
      provider: expected,
    });
    expect(sanitizeConfigForOutput(input as unknown as UnifiedConfig)).toEqual({
      prompts: [{ raw: 'question', config: { provider: expected } }],
    });
    expect(config.provider).toBe(provider);
  });

  it.each(['AB', 'AA=A', 'file://fixtures/document.bin', '{{ vars.document }}', data + '!'])(
    'does not interpret invalid, template, or file content %j during export',
    (value) => {
      const input = { providers: [{ ...provider, config: binaryConfig('agent', value) }] };
      expect(sanitizeConfigForOutput(input)).toEqual(input);
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
    const send = vi
      .spyOn(BedrockAgentRuntimeClient.prototype, 'send')
      .mockRejectedValue(new Error('Unexpected SDK dispatch'));
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

describe.each(['agent', 'functionResult', 'apiResult', 'knowledge-base'])(
  '%s binary input validation',
  (kind) => {
    it.each([
      new DataView(new Uint8Array([97, 98, 99]).buffer),
      new Uint16Array([97, 98, 99]),
      new Int8Array([97]),
      new Float32Array([1]),
      new ArrayBuffer(3),
      new SharedArrayBuffer(3),
    ])(
      'rejects unsupported native views through the public loader before persistence: %s',
      async (data) => {
        const save = vi.spyOn(Eval, 'create');
        const send = vi.spyOn(BedrockAgentRuntimeClient.prototype, 'send');
        const reference = {
          id: kind === 'knowledge-base' ? 'bedrock:kb:default' : 'bedrock-agent:AGENT12345',
          config: binaryConfig(kind, data),
        };
        await expect(async () => {
          await loadApiProvider(reference.id, { options: reference });
          await Eval.create({ providers: [reference] }, [], { id: randomUUID() });
        }).rejects.toThrow('use a Uint8Array, Buffer, or base64 string');
        expect(save).not.toHaveBeenCalled();
        expect(send).not.toHaveBeenCalled();
      },
    );

    it.each([new ArrayBuffer(3), new SharedArrayBuffer(3)])(
      'rejects visible raw array buffers',
      async (data) => {
        const restore = mockProcessEnv({ PROMPTFOO_DISABLE_TEMPLATING: 'true' });
        try {
          await expect(
            loadApiProvider(
              kind === 'knowledge-base' ? 'bedrock:kb:default' : 'bedrock-agent:AGENT12345',
              {
                options: { config: binaryConfig(kind, data) },
              },
            ),
          ).rejects.toThrow('use a Uint8Array, Buffer, or base64 string');
          expect(() => decodeBedrockBytes(data)).toThrow(
            'use a Uint8Array, Buffer, or base64 string',
          );
        } finally {
          restore();
        }
      },
    );
  },
);

it('accepts cross-realm Uint8Array and serialized empty bytes', () => {
  expect(decodeBedrockBytes(runInNewContext('new Uint8Array([97, 98, 99])'))).toEqual(
    Buffer.from('abc'),
  );
  expect(decodeBedrockBytes({})).toEqual(new Uint8Array());
});

describe.each(['agent', 'functionResult', 'apiResult', 'knowledge-base', 'knowledge-base-stream'])(
  '%s live-provider binary persistence',
  (kind) => {
    it.each(['base64', 'Buffer', 'Uint8Array', 'emptyUint8Array'])(
      'preserves %s bytes through evaluate and replay while redacting credentials',
      async (form) => {
        const bytes = Buffer.from(Array.from({ length: 97 }, (_, index) => index));
        const data =
          form === 'base64'
            ? bytes.toString('base64')
            : form === 'Buffer'
              ? bytes
              : form === 'emptyUint8Array'
                ? new Uint8Array()
                : new Uint8Array([255, ...bytes, 255]).subarray(1, 98);
        const config = {
          region: 'us-east-1',
          ...binaryConfig(kind, data),
          apiKey: 'synthetic-api-key',
          secretAccessKey: 'synthetic-secret-key',
        };
        const originalConfig = JSON.stringify(config);
        const isAgent = !kind.startsWith('knowledge-base');
        const original = await loadApiProvider(
          isAgent ? 'bedrock-agent:AGENT12345' : 'bedrock:kb:default',
          { options: { config } },
        );
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
        const attachClient = (provider: typeof original) => {
          if (isAgent) {
            vi.spyOn(
              provider as AwsBedrockAgentsProvider,
              'getAgentRuntimeClient',
            ).mockResolvedValue(client);
          } else {
            vi.spyOn(
              provider as AwsBedrockKnowledgeBaseProvider,
              'getKnowledgeBaseClient',
            ).mockResolvedValue(client);
          }
        };
        attachClient(original);
        try {
          const evaluated = await evaluate(
            {
              providers: [original],
              prompts: ['fixture'],
              tests: [{ description: 'live binary persistence' }],
              writeLatestResults: true,
            },
            { cache: false, maxConcurrency: 1 },
          );
          const saved = await Eval.findById(evaluated.id);
          const [reference] = saved!.config.providers as ProviderOptions[];
          expect(reference.config?.apiKey).toBe('[REDACTED]');
          expect(reference.config?.secretAccessKey).toBe('[REDACTED]');
          const replay = await loadApiProvider(reference.id!, { options: reference });
          attachClient(replay);
          expect((await replay.callApi('fixture')).error).toContain('fixture request captured');
          expect(handle).toHaveBeenCalledTimes(2);
          for (const [request] of handle.mock.calls) {
            const body = JSON.parse(String(request.body));
            const sent =
              kind === 'agent'
                ? body.sessionState.files[0].source.byteContent.data
                : isAgent
                  ? body.sessionState.returnControlInvocationResults[0][kind].responseBody.IMAGES
                      .images[0].source.bytes
                  : body.retrieveAndGenerateConfiguration.externalSourcesConfiguration.sources[0]
                      .byteContent.data;
            expect(sent).toBe(form === 'emptyUint8Array' ? '' : bytes.toString('base64'));
          }
          expect(JSON.stringify(config)).toBe(originalConfig);
        } finally {
          client.destroy();
        }
      },
    );
  },
);
