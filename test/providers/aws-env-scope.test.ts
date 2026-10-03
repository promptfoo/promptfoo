import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { NodeHttp2Handler, NodeHttpHandler } from '@smithy/node-http-handler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache, withCacheEnabled } from '../../src/cache';
import cliState from '../../src/cliState';
import { getEnvString } from '../../src/envars';
import { loadApiProvider } from '../../src/providers';
import {
  getAwsCredentialCacheNamespace,
  resolveAwsCredentials,
} from '../../src/providers/awsCredentials';
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
  it.each(['file', 'suite'] as const)(
    'does not restore a host bearer cleared by the %s environment',
    async (scope) => {
      mockProcessEnv({ ...keys('host'), AWS_BEARER_TOKEN_BEDROCK: 'host-bearer' });
      const handle = vi
        .spyOn(NodeHttpHandler.prototype, 'handle')
        .mockRejectedValue(new Error('Unexpected transport request'));
      const run = async () => {
        const provider = new AwsBedrockCompletionProvider('fixture');
        const client = await provider.getBedrockInstance();
        try {
          await expect(
            client.invokeModel({
              modelId: 'fixture',
              body: Buffer.from('{}'),
              contentType: 'application/json',
            }),
          ).rejects.toThrow('token');
          expect(handle).not.toHaveBeenCalled();
        } finally {
          client.destroy();
        }
      };
      const env = { AWS_BEARER_TOKEN_BEDROCK: '' };
      await (scope === 'file'
        ? cliState.withEnvFileOverrides(env, run)
        : cliState.withEnv(env, run));
    },
  );

  it.each(['config-keys', 'config-api-key', 'scoped-keys', 'scoped-profile', 'harmless-empty'])(
    'preserves %s authentication with an empty scoped bearer placeholder',
    async (mode) => {
      mockProcessEnv({
        ...keys('host'),
        AWS_BEARER_TOKEN_BEDROCK: mode === 'harmless-empty' ? undefined : 'host-bearer',
      });
      const dir = fs.mkdtempSync(path.join(fixtureTempRoot, 'promptfoo-empty-bearer-'));
      const file = path.join(dir, 'credentials');
      fs.writeFileSync(
        file,
        '[fixture]\naws_access_key_id=profile-access\naws_secret_access_key=profile-secret\n',
      );
      const handle = vi
        .spyOn(NodeHttpHandler.prototype, 'handle')
        .mockResolvedValue({ response: { statusCode: 200, headers: {}, body: Buffer.from('{}') } });
      try {
        await cliState.withEnvFileOverrides(
          {
            AWS_BEARER_TOKEN_BEDROCK: '',
            ...(mode === 'scoped-keys' ? keys('scoped') : {}),
            ...(mode === 'scoped-profile'
              ? { AWS_PROFILE: 'fixture', AWS_SHARED_CREDENTIALS_FILE: file }
              : {}),
          },
          async () => {
            const config =
              mode === 'config-keys'
                ? { accessKeyId: 'configured-access', secretAccessKey: 'configured-secret' }
                : mode === 'config-api-key'
                  ? { apiKey: 'configured-bearer' }
                  : {};
            const client = await new AwsBedrockCompletionProvider('fixture', {
              config,
            }).getBedrockInstance();
            try {
              await client.invokeModel({
                modelId: 'fixture',
                body: Buffer.from('{}'),
                contentType: 'application/json',
              });
              const authorization = new Headers(handle.mock.calls[0][0].headers).get(
                'authorization',
              );
              if (mode === 'config-api-key') {
                expect(authorization).toBe('Bearer configured-bearer');
              } else {
                const accessKey =
                  mode === 'config-keys'
                    ? 'configured-access'
                    : mode === 'scoped-keys'
                      ? 'scoped-access'
                      : mode === 'scoped-profile'
                        ? 'profile-access'
                        : 'host-access';
                expect(authorization).toContain(`Credential=${accessKey}/`);
              }
            } finally {
              client.destroy();
            }
          },
        );
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  it.each([
    { AWS_SESSION_TOKEN: '' },
    { AWS_SESSION_TOKEN: ' \t ' },
    { AWS_ACCESS_KEY_ID: '', AWS_SECRET_ACCESS_KEY: '', AWS_SESSION_TOKEN: '' },
  ])(
    'preserves default SDK discovery and cache identity for harmless placeholders %j',
    async (env) => {
      const dir = fs.mkdtempSync(path.join(fixtureTempRoot, 'promptfoo-empty-aws-'));
      const file = path.join(dir, 'credentials');
      fs.writeFileSync(
        file,
        '[default]\naws_access_key_id=shared-access\naws_secret_access_key=shared-secret\n',
      );
      mockProcessEnv({ AWS_SHARED_CREDENTIALS_FILE: file });
      try {
        await cliState.withEnvFileOverrides(env, async () => {
          expect(await resolveAwsCredentials()).toBeUndefined();
          expect(getAwsCredentialCacheNamespace()).toBeUndefined();
          const provider = new AwsBedrockCompletionProvider('fixture');
          const client = await provider.getBedrockInstance();
          try {
            expect((await client.config.credentials()).accessKeyId).toBe('shared-access');
          } finally {
            client.destroy();
          }
        });
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  it.each([
    { name: 'lone session token', host: {}, env: { AWS_SESSION_TOKEN: 'file-session' } },
    { name: 'lone access key', host: {}, env: { AWS_ACCESS_KEY_ID: 'file-access' } },
    { name: 'lone secret key', host: {}, env: { AWS_SECRET_ACCESS_KEY: 'file-secret' } },
    {
      name: 'session token with incomplete host keys',
      host: { AWS_ACCESS_KEY_ID: 'host-access' },
      env: { AWS_SESSION_TOKEN: 'file-session' },
    },
    {
      name: 'cleared access key with a complete host tuple',
      host: keys('host'),
      env: { AWS_ACCESS_KEY_ID: '' },
    },
    {
      name: 'cleared secret key with a complete host tuple',
      host: keys('host'),
      env: { AWS_SECRET_ACCESS_KEY: '' },
    },
    {
      name: 'cleared host access key without a secret',
      host: { AWS_ACCESS_KEY_ID: 'host-access' },
      env: { AWS_ACCESS_KEY_ID: '' },
    },
    {
      name: 'cleared host secret key without an access key',
      host: { AWS_SECRET_ACCESS_KEY: 'host-secret' },
      env: { AWS_SECRET_ACCESS_KEY: '' },
    },
  ])('keeps native shared-file discovery for $name', async ({ host, env }) => {
    const dir = fs.mkdtempSync(path.join(fixtureTempRoot, 'promptfoo-incomplete-aws-'));
    const file = path.join(dir, 'credentials');
    fs.writeFileSync(
      file,
      '[default]\naws_access_key_id=shared-access\naws_secret_access_key=shared-secret\n',
    );
    mockProcessEnv({ ...host, AWS_SHARED_CREDENTIALS_FILE: file });
    try {
      const provider = new AwsBedrockCompletionProvider('fixture', { env });
      const client = await provider.getBedrockInstance();
      try {
        expect(Reflect.get(client.config, 'profile')).toBe('default');
        expect((await client.config.credentials()).accessKeyId).toBe('shared-access');
        expect(process.env.AWS_ACCESS_KEY_ID).toBe(host.AWS_ACCESS_KEY_ID);
        expect(process.env.AWS_SECRET_ACCESS_KEY).toBe(host.AWS_SECRET_ACCESS_KEY);
      } finally {
        client.destroy();
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps incomplete Environment role sources from restoring a cleared host tuple', async () => {
    const dir = fs.mkdtempSync(path.join(fixtureTempRoot, 'promptfoo-incomplete-role-'));
    const config = path.join(dir, 'config');
    const credentials = path.join(dir, 'credentials');
    fs.writeFileSync(credentials, '');
    fs.writeFileSync(
      config,
      '[default]\nrole_arn=arn:aws:iam::123456789012:role/Fixture\ncredential_source=Environment\n',
    );
    mockProcessEnv(keys('host'));
    const handle = vi
      .spyOn(NodeHttpHandler.prototype, 'handle')
      .mockRejectedValue(new Error('Unexpected STS request'));
    try {
      const provider = new AwsBedrockCompletionProvider('fixture', {
        env: {
          AWS_ACCESS_KEY_ID: '',
          AWS_CONFIG_FILE: config,
          AWS_SHARED_CREDENTIALS_FILE: credentials,
        },
      });
      const client = await provider.getBedrockInstance();
      try {
        await expect(client.config.credentials()).rejects.toThrow(
          'AWS role source credentials are incomplete',
        );
        expect(handle).not.toHaveBeenCalled();
      } finally {
        client.destroy();
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('clears an optional session token while retaining the complete host keypair', async () => {
    mockProcessEnv(keys('host'));
    mockProcessEnv({ AWS_SESSION_TOKEN: 'host-session' });
    expect(await resolveAwsCredentials({}, { AWS_SESSION_TOKEN: '' })).toEqual({
      accessKeyId: 'host-access',
      secretAccessKey: 'host-secret',
      sessionToken: undefined,
    });
  });

  it('clears a host profile to default shared-file discovery when no static keypair is available', async () => {
    const dir = fs.mkdtempSync(path.join(fixtureTempRoot, 'promptfoo-cleared-profile-'));
    const file = path.join(dir, 'credentials');
    const write = (label: string) =>
      fs.writeFileSync(
        file,
        `[default]\naws_access_key_id=${label}-access\naws_secret_access_key=${label}-secret\n[host]\naws_access_key_id=host-access\naws_secret_access_key=host-secret\n`,
      );
    write('default');
    mockProcessEnv({ AWS_PROFILE: 'host', AWS_SHARED_CREDENTIALS_FILE: file });
    try {
      const provider = new SageMakerCompletionProvider('fixture', {
        config: { modelType: 'custom' },
        env: { AWS_PROFILE: '' },
      });
      const client = await provider.getSageMakerRuntimeInstance();
      try {
        expect((await client.config.credentials()).accessKeyId).toBe('default-access');
        const firstNamespace = Reflect.get(provider, 'responseCacheNamespace');
        write('replacement');
        const nextProvider = new SageMakerCompletionProvider('fixture', {
          config: { modelType: 'custom' },
          env: { AWS_PROFILE: '' },
        });
        const nextClient = await nextProvider.getSageMakerRuntimeInstance();
        try {
          expect((await nextClient.config.credentials()).accessKeyId).toBe('replacement-access');
          expect(Reflect.get(nextProvider, 'responseCacheNamespace')).not.toBe(firstNamespace);
        } finally {
          nextClient.destroy();
        }
        expect(process.env.AWS_PROFILE).toBe('host');
      } finally {
        client.destroy();
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each(['AWS_SHARED_CREDENTIALS_FILE', 'AWS_CONFIG_FILE'] as const)(
    'clears an overridden %s to the SDK default and tracks its file revision',
    async (selector) => {
      const dir = fs.mkdtempSync(path.join(fixtureTempRoot, 'promptfoo-default-aws-'));
      fs.mkdirSync(path.join(dir, '.aws'));
      const file = path.join(
        dir,
        '.aws',
        selector === 'AWS_CONFIG_FILE' ? 'config' : 'credentials',
      );
      const write = (label: string) =>
        fs.writeFileSync(
          file,
          `[default]\naws_access_key_id=${label}-access\naws_secret_access_key=${label}-secret\n`,
        );
      mockProcessEnv({ HOME: dir });
      write('first');
      const resolve = async () => {
        const provider = new AwsBedrockCompletionProvider('fixture', { env: { [selector]: '' } });
        const client = await provider.getBedrockInstance();
        try {
          return {
            accessKeyId: (await client.config.credentials()).accessKeyId,
            namespace: Reflect.get(provider, 'responseCacheNamespace'),
          };
        } finally {
          client.destroy();
        }
      };
      try {
        const first = await resolve();
        write('replacement');
        const second = await resolve();
        expect(first.accessKeyId).toBe('first-access');
        expect(second.accessKeyId).toBe('replacement-access');
        expect(second.namespace).not.toBe(first.namespace);
        expect(process.env[selector]).toContain('nonexistent-promptfoo-fixture');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  it.each(['AWS_SHARED_CREDENTIALS_FILE', 'AWS_CONFIG_FILE'] as const)(
    'expands home-relative %s for both SDK resolution and cache revision metadata',
    async (selector) => {
      const dir = fs.mkdtempSync(path.join(fixtureTempRoot, 'promptfoo-tilde-aws-'));
      const file = path.join(dir, 'selected-profile');
      mockProcessEnv({ HOME: dir });
      const env = { [selector]: '~/selected-profile' };
      const write = (label: string) =>
        fs.writeFileSync(
          file,
          `[default]\naws_access_key_id=${label}-access\naws_secret_access_key=${label}-secret\n`,
        );
      try {
        write('first');
        const before = getAwsCredentialCacheNamespace({}, env);
        const client = await new AwsBedrockCompletionProvider('fixture', {
          env,
        }).getBedrockInstance();
        try {
          expect((await client.config.credentials()).accessKeyId).toBe('first-access');
        } finally {
          client.destroy();
        }
        write('replacement');
        expect(getAwsCredentialCacheNamespace({}, env)).not.toBe(before);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  it.each(
    ['runtime', 'knowledge-base'].flatMap((kind) =>
      ['config', 'provider', 'file', 'ambient'].flatMap((source) =>
        [false, true].map((configuredKeys) => ({ kind, source, configuredKeys })),
      ),
    ),
  )(
    'preserves $kind auth with $source bearer and configured keys=$configuredKeys through the real handler',
    async ({ kind, source, configuredKeys }) => {
      mockProcessEnv({
        ...keys('host'),
        ...(source === 'ambient' ? { AWS_BEARER_TOKEN_BEDROCK: 'lower-bearer' } : {}),
      });
      const handle = vi.spyOn(NodeHttpHandler.prototype, 'handle').mockResolvedValue({
        response: { statusCode: 200, headers: {}, body: new TextEncoder().encode('{}') },
      });
      vi.spyOn(NodeHttp2Handler.prototype, 'handle').mockImplementation(handle);
      await cliState.withEnvFileOverrides(
        source === 'file' ? { AWS_BEARER_TOKEN_BEDROCK: 'lower-bearer' } : undefined,
        async () => {
          const options = {
            config: {
              knowledgeBaseId: 'fixture-kb',
              ...(configuredKeys
                ? { accessKeyId: 'explicit-access', secretAccessKey: 'explicit-secret' }
                : {}),
              ...(source === 'config' ? { apiKey: 'lower-bearer' } : {}),
            },
            env: source === 'provider' ? { AWS_BEARER_TOKEN_BEDROCK: 'lower-bearer' } : undefined,
          };
          if (kind === 'runtime') {
            const client = await new AwsBedrockCompletionProvider(
              'fixture',
              options,
            ).getBedrockInstance();
            try {
              await client.invokeModel({
                modelId: 'fixture',
                body: new TextEncoder().encode('{}'),
                contentType: 'application/json',
              });
            } finally {
              client.destroy();
            }
          } else {
            const { RetrieveAndGenerateCommand } = await import(
              '@aws-sdk/client-bedrock-agent-runtime'
            );
            const client = await new AwsBedrockKnowledgeBaseProvider(
              'fixture',
              options,
            ).getKnowledgeBaseClient();
            try {
              await client.send(
                new RetrieveAndGenerateCommand({
                  input: { text: 'fixture' },
                  retrieveAndGenerateConfiguration: {
                    type: 'KNOWLEDGE_BASE',
                    knowledgeBaseConfiguration: {
                      knowledgeBaseId: 'fixture-kb',
                      modelArn: 'arn:aws:bedrock:us-east-1::foundation-model/fixture',
                    },
                  },
                }),
              );
            } finally {
              client.destroy();
            }
          }
          expect(handle).toHaveBeenCalledOnce();
          const authorization = new Headers(handle.mock.calls[0][0].headers).get('authorization');
          if (configuredKeys) {
            expect(authorization).toContain('Credential=explicit-access/');
            expect(authorization).not.toContain('Bearer');
          } else {
            expect(authorization).toContain('Bearer lower-bearer');
          }
        },
      );
    },
  );

  it.each(['bedrock', 'sagemaker', 'agent', 'knowledge-base'])(
    'binds %s cache identity to its live client and reloads scoped files for a new lifetime',
    async (kind) => {
      const dir = fs.mkdtempSync(path.join(fixtureTempRoot, 'promptfoo-live-rotation-'));
      const filename = path.join(dir, 'credentials');
      const write = (label: string) =>
        fs.writeFileSync(
          filename,
          `[fixture]\naws_access_key_id = ${label}-access\naws_secret_access_key = ${label}-secret\n`,
        );
      write('before');
      const provider =
        kind === 'bedrock'
          ? new AwsBedrockCompletionProvider('fixture')
          : kind === 'sagemaker'
            ? new SageMakerCompletionProvider('fixture', { config: { modelType: 'custom' } })
            : kind === 'agent'
              ? new AwsBedrockAgentsProvider('fixture')
              : new AwsBedrockKnowledgeBaseProvider('fixture', {
                  config: { knowledgeBaseId: 'fixture' },
                });
      const method =
        kind === 'bedrock'
          ? 'getBedrockInstance'
          : kind === 'sagemaker'
            ? 'getSageMakerRuntimeInstance'
            : kind === 'agent'
              ? 'getAgentRuntimeClient'
              : 'getKnowledgeBaseClient';
      const env = { AWS_PROFILE: 'fixture', AWS_SHARED_CREDENTIALS_FILE: filename };
      try {
        await cliState.withEnvFileOverrides(env, async () => {
          const first = await Reflect.get(provider, method).call(provider);
          try {
            expect((await first.config.credentials()).accessKeyId).toBe('before-access');
            const originalNamespace = Reflect.get(provider, 'responseCacheNamespace');
            write('after');
            expect(await Reflect.get(provider, method).call(provider)).toBe(first);
            expect((await first.config.credentials()).accessKeyId).toBe('before-access');
            expect(Reflect.get(provider, 'responseCacheNamespace')).toBe(originalNamespace);
            await cliState.withEnvFileOverrides(env, async () => {
              const next = await Reflect.get(provider, method).call(provider);
              try {
                expect(next).not.toBe(first);
                expect((await next.config.credentials()).accessKeyId).toBe('after-access');
                expect(Reflect.get(provider, 'responseCacheNamespace')).not.toBe(originalNamespace);
              } finally {
                next.destroy();
              }
            });
            // An SDK refresh can re-resolve credentials, but never writes into the new lifetime's namespace.
            await first.config.credentials({ forceRefresh: true });
            expect(Reflect.get(provider, 'responseCacheNamespace')).toBe(originalNamespace);
          } finally {
            first.destroy();
          }
        });
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  );

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

  it('preserves Nova Sonic validation errors for complete whitespace-only credentials', async () => {
    const provider = new NovaSonicProvider('amazon.nova-sonic-v1:0', {
      env: { AWS_ACCESS_KEY_ID: 'fixture-access', AWS_SECRET_ACCESS_KEY: ' \t ' },
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

  it.each(
    ['bedrock', 'sagemaker', 'agent'].flatMap((kind) =>
      [true, false].map((scopedKeys) => ({ kind, scopedKeys })),
    ),
  )(
    'preserves empty-profile clearing for $kind with scoped keys=$scopedKeys',
    async ({ kind, scopedKeys }) => {
      mockProcessEnv({ AWS_PROFILE: 'ignored-host-profile', ...keys('host') });
      await cliState.withEnvFileOverrides(
        { AWS_PROFILE: '', ...(scopedKeys ? keys('file') : {}) },
        async () => {
          const provider =
            kind === 'bedrock'
              ? new AwsBedrockCompletionProvider('fixture')
              : kind === 'sagemaker'
                ? new SageMakerCompletionProvider('fixture', { config: { modelType: 'custom' } })
                : new AwsBedrockAgentsProvider('fixture');
          const method =
            kind === 'bedrock'
              ? 'getBedrockInstance'
              : kind === 'sagemaker'
                ? 'getSageMakerRuntimeInstance'
                : 'getAgentRuntimeClient';
          const client = await Reflect.get(provider, method).call(provider);
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
