import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache, withCacheEnabled } from '../../src/cache';
import cliState from '../../src/cliState';
import { loadApiProvider } from '../../src/providers';
import { AwsBedrockCompletionProvider } from '../../src/providers/bedrock';
import { NovaSonicProvider } from '../../src/providers/bedrock/nova-sonic';
import {
  SageMakerCompletionProvider,
  SageMakerEmbeddingProvider,
} from '../../src/providers/sagemaker';
import { mockProcessEnv } from '../util/utils';

const keys = (label: string) => ({
  AWS_ACCESS_KEY_ID: `${label}-access`,
  AWS_SECRET_ACCESS_KEY: `${label}-secret`,
});
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
  it('signs with each concurrent scope key pair without inheriting an ambient bearer or session token', async () => {
    mockProcessEnv({
      AWS_BEARER_TOKEN_BEDROCK: 'shell-bearer',
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
            expect(request.headers['x-amz-security-token']).toBeUndefined();
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

  it('keeps provider credential tuples together through the actual loader', async () => {
    const suite = { ...keys('suite'), AWS_SESSION_TOKEN: 'suite-session' };
    const provider = (await loadApiProvider('sagemaker:custom:fixture', {
      env: suite,
      options: { env: keys('provider') },
    })) as SageMakerCompletionProvider;
    expect(await provider.getCredentials()).toEqual({
      accessKeyId: 'provider-access',
      secretAccessKey: 'provider-secret',
    });
    const partial = (await loadApiProvider('sagemaker:custom:fixture', {
      env: suite,
      options: { env: { AWS_ACCESS_KEY_ID: 'partial-access' } },
    })) as SageMakerCompletionProvider;
    await expect(partial.getCredentials()).rejects.toThrow('incomplete');
  });

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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-aws-profile-'));
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
    mockProcessEnv({ AWS_SHARED_CREDENTIALS_FILE: file, ...keys('host') });
    try {
      await Promise.all(
        ['a', 'b'].map((label) =>
          cliState.withEnvFileOverrides({ AWS_PROFILE: label }, async () => {
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
          }),
        ),
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    { AWS_ACCESS_KEY_ID: '' },
    { AWS_SECRET_ACCESS_KEY: '' },
    { AWS_ACCESS_KEY_ID: '', AWS_SECRET_ACCESS_KEY: '', AWS_SESSION_TOKEN: '' },
    { AWS_PROFILE: '' },
  ])(
    'rejects an explicitly empty provider auth context instead of borrowing suite keys: %j',
    async (env) => {
      const provider = (await loadApiProvider('sagemaker:custom:fixture', {
        env: keys('suite'),
        options: { env },
      })) as SageMakerCompletionProvider;
      await expect(provider.getCredentials()).rejects.toThrow(/incomplete|empty/);
    },
  );

  it('rejects empty file credentials and an empty provider bearer before ambient SDK discovery', async () => {
    mockProcessEnv({ ...keys('host'), AWS_BEARER_TOKEN_BEDROCK: 'host-bearer' });
    await cliState.withEnvFileOverrides(
      { AWS_ACCESS_KEY_ID: '', AWS_SECRET_ACCESS_KEY: '' },
      async () => {
        await expect(
          new AwsBedrockCompletionProvider('anthropic.claude-v2').getCredentials(),
        ).rejects.toThrow('incomplete');
      },
    );
    const provider = (await loadApiProvider('bedrock:anthropic.claude-v2', {
      env: keys('suite'),
      options: { env: { AWS_BEARER_TOKEN_BEDROCK: '' } },
    })) as AwsBedrockCompletionProvider;
    await expect(provider.getCredentials()).rejects.toThrow('empty');
  });

  it('forwards scoped credentials to the separate Nova Sonic SDK constructor', async () => {
    mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: 'shell-bearer' });
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
    'isolates %s response caches across SDK owners and preserves reuse, bypass and clearing',
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
          // The same named profile can refer to rotated credentials; a new owner cannot
          // reuse a previous owner's response without an established principal identity.
          const second = makeProvider();
          expect(await second.callApi('same prompt')).toMatchObject({ output: 'fixture' });
          expect(send).toHaveBeenCalledTimes(2);
          await withCacheEnabled(false, () => first.callApi('same prompt'));
          expect(send).toHaveBeenCalledTimes(3);
          await clearCache();
          await first.callApi('same prompt');
          expect(send).toHaveBeenCalledTimes(4);
        }),
      );
    },
  );
  it('isolates embedding caches across SageMaker credential owners while reusing the same owner', async () => {
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
        expect(send).toHaveBeenCalledTimes(2);
      }),
    );
  });
});
