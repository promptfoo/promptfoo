import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache, withCacheEnabled } from '../../src/cache';
import cliState from '../../src/cliState';
import { getEnvString } from '../../src/envars';
import { loadApiProvider } from '../../src/providers';
import { AwsBedrockCompletionProvider } from '../../src/providers/bedrock';
import { AwsBedrockAgentsProvider } from '../../src/providers/bedrock/agents';
import { AwsBedrockKnowledgeBaseProvider } from '../../src/providers/bedrock/knowledgeBase';
import { NovaSonicProvider } from '../../src/providers/bedrock/nova-sonic';
import {
  SageMakerCompletionProvider,
  SageMakerEmbeddingProvider,
} from '../../src/providers/sagemaker';
import { mockProcessEnv } from '../util/utils';

import type { EnvOverrides } from '../../src/contracts/env';

const keys = (label: string) => ({
  AWS_ACCESS_KEY_ID: `${label}-access`,
  AWS_SECRET_ACCESS_KEY: `${label}-secret`,
});
const fixtureTempRoot = os.tmpdir();
let restore: () => void;
beforeEach(() => {
  restore = mockProcessEnv(
    {
      AWS_EC2_METADATA_DISABLED: 'true',
      AWS_CONFIG_FILE: '/nonexistent-promptfoo-fixture/config',
      AWS_SHARED_CREDENTIALS_FILE: '/nonexistent-promptfoo-fixture/credentials',
    },
    { clear: true },
  );
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network access'));
});
afterEach(() => {
  restore();
  vi.restoreAllMocks();
});

// Use real SDK constructors and a local request-handler stub: no credential or model service calls.
describe('scoped AWS SDK authentication', () => {
  it('signs with each concurrent scope key pair while preserving the host session-token default', async () => {
    mockProcessEnv({
      AWS_SESSION_TOKEN: 'shell-session',
    });
    await Promise.all(
      ['a', 'b'].map((label) =>
        cliState.withEnvFileOverrides(keys(label), async () => {
          const provider = new AwsBedrockCompletionProvider('anthropic.claude-v2', {
            config: { region: 'us-east-1' },
          });
          const client = await provider.getBedrockInstance();
          const handle = vi.spyOn(client.config.requestHandler, 'handle').mockResolvedValue({
            response: { statusCode: 200, headers: {}, body: new TextEncoder().encode('{}') },
          });
          try {
            await client.invokeModel({
              modelId: 'fixture',
              body: new TextEncoder().encode('{}'),
              contentType: 'application/json',
            });
            const request = handle.mock.calls[0][0];
            expect(request.headers.authorization).toContain(`Credential=${label}-access/`);
            expect(request.headers['x-amz-security-token']).toBe('shell-session');
          } finally {
            client.destroy();
          }
        }),
      ),
    );
  });

  it('passes the provider bearer to the real SDK token signer', async () => {
    mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: 'shell-bearer' });
    const provider = new AwsBedrockCompletionProvider('anthropic.claude-v2', {
      env: { AWS_BEARER_TOKEN_BEDROCK: 'provider-bearer' },
    });
    const client = await provider.getBedrockInstance();
    const handle = vi.spyOn(client.config.requestHandler, 'handle').mockResolvedValue({
      response: { statusCode: 200, headers: {}, body: new TextEncoder().encode('{}') },
    });
    try {
      await client.invokeModel({
        modelId: 'fixture',
        body: new TextEncoder().encode('{}'),
        contentType: 'application/json',
      });
      expect(new Headers(handle.mock.calls[0][0].headers).get('authorization')).toBe(
        'Bearer provider-bearer',
      );
    } finally {
      client.destroy();
    }
  });

  it('preserves per-key provider and suite environment merging through the loader', async () => {
    const suite = { ...keys('suite'), AWS_SESSION_TOKEN: 'suite-session' };
    const provider = (await loadApiProvider('sagemaker:custom:fixture', {
      env: suite,
      options: { env: keys('provider') },
    })) as SageMakerCompletionProvider;
    expect(await provider.getCredentials()).toEqual({
      accessKeyId: 'provider-access',
      secretAccessKey: 'provider-secret',
      sessionToken: 'suite-session',
    });
    const partial = (await loadApiProvider('sagemaker:custom:fixture', {
      env: suite,
      options: { env: { AWS_ACCESS_KEY_ID: 'partial-access' } },
    })) as SageMakerCompletionProvider;
    expect(await partial.getCredentials()).toEqual({
      accessKeyId: 'partial-access',
      secretAccessKey: 'suite-secret',
      sessionToken: 'suite-session',
    });
  });

  it('signs a Knowledge Base request with scoped AWS credentials ahead of an ambient bearer', async () => {
    mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: undefined });
    const provider = new AwsBedrockKnowledgeBaseProvider('fixture', {
      config: { knowledgeBaseId: 'fixture-kb', region: 'us-east-1' },
      env: keys('selected'),
    });
    const client = await provider.getKnowledgeBaseClient();
    const handle = vi.spyOn(client.config.requestHandler, 'handle').mockResolvedValue({
      response: {
        statusCode: 200,
        headers: {},
        body: new TextEncoder().encode(JSON.stringify({ output: { text: 'fixture' } })),
      },
    });
    try {
      expect(await withCacheEnabled(false, () => provider.callApi('fixture'))).toMatchObject({
        output: 'fixture',
      });
      expect(handle).toHaveBeenCalledOnce();
      expect(handle.mock.calls[0][0].headers.authorization).toContain(
        'Credential=selected-access/',
      );
      expect(handle.mock.calls[0][0].headers.authorization).not.toContain('host-bearer');
    } finally {
      client.destroy();
    }
  });

  it('preserves Nova Sonic scoped credential validation errors', async () => {
    const provider = new NovaSonicProvider('amazon.nova-sonic-v1:0', {
      env: { AWS_ACCESS_KEY_ID: 'partial' },
    });
    await expect(Reflect.get(provider, 'getBedrockClient').call(provider)).rejects.toThrow(
      'incomplete',
    );
  });

  it.each(['agent', 'knowledge-base'])(
    'isolates %s response caches across scoped credential owners',
    async (kind) => {
      await cliState.withEnv({ PROMPTFOO_CACHE_TYPE: 'memory' }, () =>
        withCacheEnabled(true, async () => {
          const requests = vi.fn();
          const makeProvider = (label: string) => {
            if (kind === 'agent') {
              const provider = new AwsBedrockAgentsProvider('fixture-cache-agent', {
                config: { agentId: 'fixture-cache-agent', agentAliasId: 'same-alias' },
                env: keys(label),
              });
              vi.spyOn(provider, 'getAgentRuntimeClient').mockResolvedValue({
                send: async () => {
                  requests(label);
                  return {
                    completion: (async function* () {
                      yield { chunk: { bytes: new TextEncoder().encode(label) } };
                    })(),
                  };
                },
              } as never);
              return provider;
            }
            const provider = new AwsBedrockKnowledgeBaseProvider('fixture-model', {
              config: { knowledgeBaseId: 'fixture-cache-kb' },
              env: keys(label),
            });
            vi.spyOn(provider, 'getKnowledgeBaseClient').mockResolvedValue({
              send: async () => {
                requests(label);
                return { output: { text: label } };
              },
            } as never);
            return provider;
          };
          const first = makeProvider('first');
          expect(await first.callApi('same prompt')).toMatchObject({ output: 'first' });
          expect(await first.callApi('same prompt')).toMatchObject({
            output: 'first',
            cached: true,
          });
          expect(await makeProvider('second').callApi('same prompt')).toMatchObject({
            output: 'second',
          });
          expect(requests.mock.calls).toEqual([['first'], ['second']]);
        }),
      );
    },
  );

  it('passes a scoped named profile to SDK discovery and retains ambient discovery when absent', async () => {
    const provider = new SageMakerCompletionProvider('fixture', {
      config: { modelType: 'custom' },
      env: { AWS_PROFILE: 'fixture-profile' },
    });
    const client = await provider.getSageMakerRuntimeInstance();
    try {
      expect(Reflect.get(client.config, 'profile')).toBe('fixture-profile');
      expect(await provider.getCredentials()).toBeUndefined();
      expect(
        await new AwsBedrockCompletionProvider('anthropic.claude-v2').getCredentials(),
      ).toBeUndefined();
    } finally {
      client.destroy();
    }
  });

  it('resolves scoped profiles from a local shared file ahead of ambient key credentials', async () => {
    const dir = fs.mkdtempSync(path.join(fixtureTempRoot, 'promptfoo-aws-profile-'));
    const file = path.join(dir, 'credentials');
    fs.writeFileSync(
      file,
      ['a', 'b']
        .map(
          (label) =>
            `[${label}]\naws_access_key_id = ${label}-access\naws_secret_access_key = ${label}-secret\n`,
        )
        .join('\n'),
    );
    mockProcessEnv({ AWS_SHARED_CREDENTIALS_FILE: '/absent-host-credentials', ...keys('host') });
    try {
      await Promise.all(
        ['a', 'b'].map((label) =>
          cliState.withEnvFileOverrides(
            { AWS_PROFILE: label, AWS_SHARED_CREDENTIALS_FILE: file },
            async () => {
              const providers = [
                new AwsBedrockCompletionProvider('anthropic.claude-v2'),
                new SageMakerCompletionProvider('fixture', { config: { modelType: 'custom' } }),
              ];
              for (const provider of providers) {
                const client =
                  provider instanceof AwsBedrockCompletionProvider
                    ? await provider.getBedrockInstance()
                    : await provider.getSageMakerRuntimeInstance();
                try {
                  expect(await client.config.credentials()).toMatchObject({
                    accessKeyId: `${label}-access`,
                    secretAccessKey: `${label}-secret`,
                  });
                } finally {
                  client.destroy();
                }
              }
            },
          ),
        ),
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('preserves ambient profile priority when only the shared credential filename is scoped', async () => {
    const dir = fs.mkdtempSync(path.join(fixtureTempRoot, 'promptfoo-file-only-profile-'));
    const file = path.join(dir, 'credentials');
    fs.writeFileSync(
      file,
      '[ambient-profile]\naws_access_key_id = profile-access\naws_secret_access_key = profile-secret\n',
    );
    mockProcessEnv({ AWS_PROFILE: 'ambient-profile', ...keys('host') });
    try {
      await cliState.withEnvFileOverrides({ AWS_SHARED_CREDENTIALS_FILE: file }, async () => {
        const provider = new AwsBedrockCompletionProvider('fixture');
        expect(await provider.getCredentials()).toBeUndefined();
        const client = await provider.getBedrockInstance();
        try {
          expect(await client.config.credentials()).toMatchObject({
            accessKeyId: 'profile-access',
          });
        } finally {
          client.destroy();
        }
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([true, false])(
    'preserves empty-profile clearing with scoped keys=%s',
    async (scopedKeys) => {
      mockProcessEnv({ AWS_PROFILE: 'ignored-host-profile', ...keys('host') });
      await cliState.withEnvFileOverrides(
        { AWS_PROFILE: '', ...(scopedKeys ? keys('file') : {}) },
        async () => {
          const provider = new AwsBedrockCompletionProvider('fixture');
          const client = await provider.getBedrockInstance();
          try {
            expect(await client.config.credentials()).toMatchObject({
              accessKeyId: `${scopedKeys ? 'file' : 'host'}-access`,
            });
          } finally {
            client.destroy();
          }
        },
      );
    },
  );

  it.each(['config', 'provider', 'suite', 'file'] as const)(
    'rejects whitespace-only AWS credentials from %s before constructing a client',
    async (scope) => {
      mockProcessEnv(keys('host'));
      for (const field of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_PROFILE'] as const) {
        const env: EnvOverrides =
          field === 'AWS_PROFILE'
            ? { AWS_PROFILE: ' \t ' }
            : { ...keys('scoped'), [field]: ' \t ' };
        const config =
          scope === 'config'
            ? field === 'AWS_PROFILE'
              ? { profile: env.AWS_PROFILE }
              : { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY }
            : {};
        const verify = async () => {
          const provider = new SageMakerCompletionProvider('fixture', {
            config: { modelType: 'custom', ...config },
            env: scope === 'provider' ? env : undefined,
          });

          await expect(provider.getCredentials()).rejects.toThrow(/incomplete|empty/);
          await expect(provider.getSageMakerRuntimeInstance()).rejects.toThrow(/incomplete|empty/);
        };
        if (scope === 'file') {
          await cliState.withEnvFileOverrides(env, verify);
        } else {
          await cliState.withEnv(scope === 'suite' ? env : keys('lower'), verify);
        }
      }
    },
  );

  it.each([
    [
      'bedrock',
      () => new AwsBedrockCompletionProvider('anthropic.claude-v2'),
      'getBedrockInstance',
    ],
    [
      'sagemaker',
      () => new SageMakerCompletionProvider('fixture', { config: { modelType: 'custom' } }),
      'getSageMakerRuntimeInstance',
    ],
    ['agent', () => new AwsBedrockAgentsProvider('fixture'), 'getAgentRuntimeClient'],
    [
      'knowledge-base',
      () =>
        new AwsBedrockKnowledgeBaseProvider('fixture', { config: { knowledgeBaseId: 'fixture' } }),
      'getKnowledgeBaseClient',
    ],
    ['sonic', () => new NovaSonicProvider(), 'getBedrockClient'],
  ] as const)(
    'keeps a reused %s provider client owned by each concurrent invocation',
    async (_kind, create, method) => {
      const provider = create();
      const clients = await Promise.all(
        ['first', 'second'].map((label) =>
          cliState.withEnv(keys(label), async () => {
            const getClient = () => Reflect.get(provider, method).call(provider);
            const [first, repeated] = await Promise.all([getClient(), getClient()]);
            expect(first).toBe(repeated);
            expect(await first.config.credentials()).toMatchObject({
              accessKeyId: `${label}-access`,
              secretAccessKey: `${label}-secret`,
            });
            expect(await getClient()).toBe(first);
            return first;
          }),
        ),
      );
      try {
        expect(clients[0]).not.toBe(clients[1]);
      } finally {
        clients.forEach((client) => client.destroy());
      }
      expect(process.env.AWS_ACCESS_KEY_ID).toBeUndefined();
    },
  );

  it.each(['bedrock', 'sagemaker', 'agent', 'knowledge-base'])(
    'keeps cached %s responses separate when one provider is reused across invocations',
    async (kind) => {
      const send = vi.fn(async () => {
        const label = getEnvString('AWS_ACCESS_KEY_ID');
        const payload = JSON.stringify({
          content: [{ type: 'text', text: label }],
          usage: { input_tokens: 1, output_tokens: 1 },
        });
        const body = Object.assign(new TextEncoder().encode(payload), {
          transformToString: () => payload,
        });
        return {
          body,
          Body: new TextEncoder().encode(JSON.stringify({ generated_text: label })),
          output: { text: label },
          completion: (async function* () {
            yield { chunk: { bytes: new TextEncoder().encode(label) } };
          })(),
        };
      });
      let provider;
      if (kind === 'bedrock') {
        provider = new AwsBedrockCompletionProvider('us.anthropic.claude-3-7-sonnet-20250219-v1:0');
        vi.spyOn(provider, 'getBedrockInstance').mockResolvedValue({ invokeModel: send } as never);
      } else if (kind === 'sagemaker') {
        provider = new SageMakerCompletionProvider('fixture', { config: { modelType: 'custom' } });
        vi.spyOn(provider, 'getSageMakerRuntimeInstance').mockResolvedValue({ send });
      } else if (kind === 'agent') {
        provider = new AwsBedrockAgentsProvider('fixture', {
          config: { agentId: 'fixture', agentAliasId: 'alias' },
        });
        vi.spyOn(provider, 'getAgentRuntimeClient').mockResolvedValue({ send } as never);
      } else {
        provider = new AwsBedrockKnowledgeBaseProvider('fixture', {
          config: { knowledgeBaseId: 'fixture' },
        });
        vi.spyOn(provider, 'getKnowledgeBaseClient').mockResolvedValue({ send } as never);
      }
      await withCacheEnabled(true, async () => {
        for (const label of ['first', 'second']) {
          await cliState.withEnv({ ...keys(label), PROMPTFOO_CACHE_TYPE: 'memory' }, async () => {
            expect(await provider.callApi('same prompt')).toMatchObject({
              output: `${label}-access`,
            });
            expect(await provider.callApi('same prompt')).toMatchObject({
              output: `${label}-access`,
              cached: true,
            });
          });
        }
      });
      expect(send).toHaveBeenCalledTimes(2);
    },
  );

  it('forwards scoped credentials to the separate Nova Sonic SDK constructor', async () => {
    const provider = new NovaSonicProvider('amazon.nova-sonic-v1:0', { env: keys('sonic') });
    const client = await Reflect.get(provider, 'getBedrockClient').call(provider);
    try {
      expect(await client.config.credentials()).toMatchObject({
        accessKeyId: 'sonic-access',
        secretAccessKey: 'sonic-secret',
      });
      expect(await client.config.authSchemePreference()).toEqual(['sigv4']);
    } finally {
      client.destroy();
    }
  });
  it.each(['bedrock', 'sagemaker'])(
    'reuses %s responses for unchanged scoped credentials and honors bypass and clearing',
    async (kind) => {
      await cliState.withEnv({ PROMPTFOO_CACHE_TYPE: 'memory' }, () =>
        withCacheEnabled(true, async () => {
          const send = vi.fn();
          const makeProvider = () => {
            if (kind === 'bedrock') {
              const provider = new AwsBedrockCompletionProvider(
                'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
                { env: { AWS_PROFILE: 'same-profile' } },
              );
              const response = JSON.stringify({
                content: [{ type: 'text', text: 'fixture' }],
                usage: { input_tokens: 1, output_tokens: 1 },
              });
              const body = Object.assign(new TextEncoder().encode(response), {
                transformToString: () => response,
              });
              send.mockResolvedValue({ body });
              vi.spyOn(provider, 'getBedrockInstance').mockResolvedValue({
                invokeModel: send,
              } as never);
              return provider;
            }
            const provider = new SageMakerCompletionProvider('fixture', {
              config: { modelType: 'custom' },
              env: { AWS_PROFILE: 'same-profile' },
            });
            send.mockResolvedValue({ Body: new TextEncoder().encode(JSON.stringify('fixture')) });
            vi.spyOn(provider, 'getSageMakerRuntimeInstance').mockResolvedValue({ send } as never);
            return provider;
          };
          const first = makeProvider();
          expect(await first.callApi('same prompt')).toMatchObject({ output: 'fixture' });
          expect(await first.callApi('same prompt')).toMatchObject({
            output: 'fixture',
            cached: true,
          });
          expect(send).toHaveBeenCalledTimes(1);
          // A fresh provider with the same configured identity retains response-cache reuse.
          const second = makeProvider();
          expect(await second.callApi('same prompt')).toMatchObject({ output: 'fixture' });
          expect(send).toHaveBeenCalledTimes(1);
          await withCacheEnabled(false, () => first.callApi('same prompt'));
          expect(send).toHaveBeenCalledTimes(2);
          await clearCache();
          await first.callApi('same prompt');
          expect(send).toHaveBeenCalledTimes(3);
        }),
      );
    },
  );
  it('reuses embedding caches for unchanged SageMaker scoped credentials', async () => {
    await cliState.withEnv({ PROMPTFOO_CACHE_TYPE: 'memory' }, () =>
      withCacheEnabled(true, async () => {
        const send = vi.fn().mockResolvedValue({
          Body: new TextEncoder().encode(JSON.stringify({ embedding: [0.1, 0.2] })),
        });
        const makeProvider = () => {
          const provider = new SageMakerEmbeddingProvider('fixture', {
            env: { AWS_PROFILE: 'rotating-profile' },
          });
          vi.spyOn(provider, 'getSageMakerRuntimeInstance').mockResolvedValue({ send } as never);
          return provider;
        };
        const first = makeProvider();
        expect(await first.callEmbeddingApi('same input')).toMatchObject({ embedding: [0.1, 0.2] });
        expect(await first.callEmbeddingApi('same input')).toMatchObject({
          embedding: [0.1, 0.2],
          cached: true,
        });
        expect(send).toHaveBeenCalledTimes(1);
        expect(await makeProvider().callEmbeddingApi('same input')).toMatchObject({
          embedding: [0.1, 0.2],
        });
        expect(send).toHaveBeenCalledTimes(1);
      }),
    );
  });
});
