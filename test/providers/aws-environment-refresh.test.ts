import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { SageMakerRuntimeClient } from '@aws-sdk/client-sagemaker-runtime';
import { NodeHttp2Handler, NodeHttpHandler } from '@smithy/node-http-handler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { AwsBedrockCompletionProvider } from '../../src/providers/bedrock';
import { SageMakerCompletionProvider } from '../../src/providers/sagemaker';
import { mockProcessEnv } from '../util/utils';
import type { AwsCredentialIdentityProvider } from '@smithy/types';

import type { EnvOverrides } from '../../src/contracts/env';

const now = Date.parse('2026-01-01T00:00:00Z');
let directory: string;
let restore: () => void;
const clients: { destroy: () => void }[] = [];
const host = (label: string, expiration: number) => ({
  AWS_ACCESS_KEY_ID: `${label}-access`,
  AWS_SECRET_ACCESS_KEY: `${label}-secret`,
  AWS_SESSION_TOKEN: `${label}-session`,
  AWS_CREDENTIAL_EXPIRATION: new Date(expiration).toISOString(),
  AWS_ACCOUNT_ID: `${label}-account`,
  AWS_CREDENTIAL_SCOPE: `${label}-scope`,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-environment-refresh-'));
  fs.writeFileSync(path.join(directory, 'config'), '');
  fs.writeFileSync(path.join(directory, 'credentials'), '');
  restore = mockProcessEnv(
    {
      ...host('first', now + 600_000),
      AWS_PROFILE: 'masked-host-profile',
      AWS_EC2_METADATA_DISABLED: 'true',
      AWS_CONFIG_FILE: path.join(directory, 'config'),
      AWS_SHARED_CREDENTIALS_FILE: path.join(directory, 'credentials'),
    },
    { clear: true },
  );
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network access'));
  vi.spyOn(NodeHttpHandler.prototype, 'handle').mockRejectedValue(
    new Error('Unexpected AWS request'),
  );
  vi.spyOn(NodeHttp2Handler.prototype, 'handle').mockRejectedValue(
    new Error('Unexpected AWS request'),
  );
});

afterEach(() => {
  for (const client of clients.splice(0)) {
    client.destroy();
  }
  vi.resetAllMocks();
  vi.restoreAllMocks();
  vi.useRealTimers();
  restore();
  fs.rmSync(directory, { recursive: true, force: true });
});

async function createCredentials(
  service: string,
  scope: string,
  env: EnvOverrides = { AWS_PROFILE: '' },
  config: Record<string, string> = {},
): Promise<AwsCredentialIdentityProvider> {
  const create = async () => {
    const options = {
      config: { region: 'us-east-1', ...config },
      env: scope === 'provider' ? env : {},
    };
    const client =
      scope === 'native'
        ? service === 'bedrock'
          ? new BedrockRuntimeClient({ region: 'us-east-1' })
          : new SageMakerRuntimeClient({ region: 'us-east-1' })
        : service === 'bedrock'
          ? await new AwsBedrockCompletionProvider('fixture', options).getBedrockInstance()
          : await new SageMakerCompletionProvider(
              'custom:fixture',
              options,
            ).getSageMakerRuntimeInstance();
    clients.push(client);
    return client.config.credentials;
  };
  // The released env-file loader overwrote the host profile before SDK discovery.
  if (scope === 'native') {
    mockProcessEnv(env);
  }
  return scope === 'file'
    ? cliState.withEnvFileOverrides(env, create)
    : scope === 'suite'
      ? cliState.withEnv(env, create)
      : create();
}

describe.each(['bedrock', 'sagemaker'])('%s direct environment credential refresh', (service) => {
  describe.each(['native', 'file', 'suite', 'provider'])('%s scope', (scope) => {
    it.each(['forced', 'expired', 'background'])(
      'preserves %s refresh and environment metadata',
      async (mode) => {
        const credentials = await createCredentials(service, scope);
        const first = await credentials();
        expect(first).toMatchObject({
          accessKeyId: 'first-access',
          secretAccessKey: 'first-secret',
          sessionToken: 'first-session',
          expiration: new Date(now + 600_000),
          accountId: 'first-account',
          credentialScope: 'first-scope',
        });
        mockProcessEnv(host('second', now + 1_800_000));
        let next;
        if (mode === 'forced') {
          next = await credentials({ forceRefresh: true });
        } else {
          vi.setSystemTime(now + (mode === 'expired' ? 600_001 : 400_000));
          next = await credentials();
          if (mode === 'background') {
            expect(next).toEqual(first);
            await new Promise<void>((resolve) => setImmediate(resolve));
            next = await credentials();
          }
        }
        expect(next).toMatchObject({
          accessKeyId: 'second-access',
          secretAccessKey: 'second-secret',
          sessionToken: 'second-session',
          expiration: new Date(now + 1_800_000),
          accountId: 'second-account',
          credentialScope: 'second-scope',
        });
        await expect(credentials()).resolves.toEqual(next);
      },
    );

    it('retains non-expiring credentials until an explicit refresh', async () => {
      mockProcessEnv({ AWS_CREDENTIAL_EXPIRATION: undefined });
      const credentials = await createCredentials(service, scope);
      const first = await credentials();
      expect(first.expiration).toBeUndefined();
      mockProcessEnv(host('second', now + 1_800_000));
      await expect(credentials()).resolves.toEqual(first);
      await expect(credentials({ forceRefresh: true })).resolves.toMatchObject({
        accessKeyId: 'second-access',
      });
    });
  });

  it.each(['file', 'suite', 'provider'])(
    'binds partial %s overrides while refreshing inherited fields outside their invocation',
    async (scope) => {
      const env = {
        AWS_PROFILE: '',
        AWS_ACCESS_KEY_ID: 'bound-access',
        AWS_SESSION_TOKEN: '',
        AWS_ACCOUNT_ID: 'bound-account',
      };
      const credentials = await createCredentials(service, scope, env);
      await expect(credentials()).resolves.toMatchObject({
        accessKeyId: 'bound-access',
        secretAccessKey: 'first-secret',
        sessionToken: undefined,
      });
      mockProcessEnv(host('second', now + 1_800_000));
      const next = await cliState.withEnv(host('foreign', now + 3_600_000), () =>
        credentials({ forceRefresh: true }),
      );
      expect(next).toMatchObject({
        accessKeyId: 'bound-access',
        secretAccessKey: 'second-secret',
        sessionToken: undefined,
        expiration: new Date(now + 1_800_000),
        accountId: 'bound-account',
      });
    },
  );

  it.each(['forced', 'expired', 'background'])(
    'preserves valid credentials and recovers after %s refresh fails',
    async (mode) => {
      const credentials = await createCredentials(service, 'provider');
      const first = await credentials();
      mockProcessEnv({ AWS_SECRET_ACCESS_KEY: undefined });
      if (mode === 'background') {
        vi.setSystemTime(now + 400_000);
        await expect(credentials()).resolves.toEqual(first);
        await new Promise<void>((resolve) => setImmediate(resolve));
        vi.setSystemTime(now + 600_001);
        await expect(credentials()).rejects.toThrow('AWS access credentials are incomplete');
      } else {
        if (mode === 'expired') {
          vi.setSystemTime(now + 600_001);
        }
        await expect(
          credentials(mode === 'forced' ? { forceRefresh: true } : undefined),
        ).rejects.toThrow('AWS access credentials are incomplete');
      }
      mockProcessEnv(host('second', now + 1_800_000));
      await expect(credentials({ forceRefresh: true })).resolves.toMatchObject({
        accessKeyId: 'second-access',
      });
    },
  );

  it.each(['file', 'suite', 'provider'])(
    'keeps empty %s metadata masks bound during refresh',
    async (scope) => {
      const credentials = await createCredentials(service, scope, {
        AWS_PROFILE: '',
        AWS_CREDENTIAL_EXPIRATION: '',
        AWS_CREDENTIAL_SCOPE: '',
        AWS_ACCOUNT_ID: '',
      });
      const first = await credentials();
      mockProcessEnv(host('second', now + 1_800_000));
      const second = await credentials({ forceRefresh: true });
      for (const identity of [first, second]) {
        expect(identity.expiration).toBeUndefined();
        expect(identity.credentialScope).toBeUndefined();
        expect(identity.accountId).toBeUndefined();
      }
      await expect(credentials()).resolves.toMatchObject({ accessKeyId: 'second-access' });
    },
  );

  it.each(['file', 'suite', 'provider'])(
    'keeps explicit configured credentials static over %s environment credentials',
    async (scope) => {
      const credentials = await createCredentials(
        service,
        scope,
        { AWS_PROFILE: '' },
        {
          accessKeyId: 'configured-access',
          secretAccessKey: 'configured-secret',
          sessionToken: 'configured-session',
        },
      );
      const first = await credentials();
      expect(first).toMatchObject({
        accessKeyId: 'configured-access',
        secretAccessKey: 'configured-secret',
        sessionToken: 'configured-session',
      });
      expect(first.expiration).toBeUndefined();
      expect(first.accountId).toBeUndefined();
      mockProcessEnv(host('second', now + 1_800_000));
      await expect(credentials({ forceRefresh: true })).resolves.toEqual(first);
    },
  );
});
