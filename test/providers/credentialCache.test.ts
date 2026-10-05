import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';
import cliState from '../../src/cliState';
import {
  getAwsCredentialCacheNamespace,
  getAwsEndpointCacheNamespace,
} from '../../src/providers/awsCredentials';
import { AwsBedrockCompletionProvider } from '../../src/providers/bedrock';
import { createBedrockCacheKeyHash } from '../../src/providers/bedrock/base';
import {
  getCredentialCacheNamespace,
  getOpaqueCredentialCacheNamespace,
} from '../../src/providers/credentialCache';
import { VertexChatProvider } from '../../src/providers/google/vertex';
import { SageMakerEmbeddingProvider } from '../../src/providers/sagemaker';
import { mockProcessEnv } from '../util/utils';

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
});

describe('scoped SDK response cache compatibility', () => {
  it('tracks public role-source availability separately from opaque process inputs', () => {
    restore = mockProcessEnv({ AWS_SECRET_ACCESS_KEY: undefined, AWS_SESSION_TOKEN: undefined });
    const env = { AWS_PROFILE: 'fixture', AWS_ACCESS_KEY_ID: 'source-access' };
    const fullNamespace = (secret: string | undefined, session?: string) =>
      getAwsCredentialCacheNamespace(
        {},
        { ...env, AWS_SECRET_ACCESS_KEY: secret, AWS_SESSION_TOKEN: session },
      );
    const namespace = (secret: string | undefined, session?: string) =>
      fullNamespace(secret, session)?.split(':aws-process:')[0];
    expect(fullNamespace('first-secret')).not.toBe(fullNamespace('second-secret'));
    expect(fullNamespace('first-secret')).toBe(fullNamespace('first-secret'));
    expect(fullNamespace('first-secret')).not.toContain('first-secret');
    const available = namespace('first-secret');
    const unavailable = namespace(undefined);
    const invalid = namespace(' \t ');
    expect(new Set([available, unavailable, invalid]).size).toBe(3);
    expect(namespace('second-secret')).toBe(available);
    expect(namespace('first-secret', '')).toBe(available);
    expect(namespace('first-secret', ' \t ')).toBe(available);
    expect(namespace('')).toBe(unavailable);
    expect(getAwsCredentialCacheNamespace({}, env)?.split(':aws-process:')[0]).toBe(unavailable);
    cliState.withEnvFileOverrides({ AWS_SECRET_ACCESS_KEY: 'file-secret' }, () => {
      expect(namespace(undefined)).toBe(available);
      expect(namespace('')).toBe(unavailable);
    });
    mockProcessEnv({ AWS_SECRET_ACCESS_KEY: 'host-secret' });
    expect(namespace(undefined)).toBe(available);
    expect(namespace('')).toBe(unavailable);
  });

  it.each(['AWS_CONFIG_FILE', 'AWS_SHARED_CREDENTIALS_FILE'] as const)(
    'tracks the implicit default profile counterpart when only %s is scoped',
    async (selector) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-default-counterpart-'));
      const configFile = path.join(dir, 'config');
      const credentialsFile = path.join(dir, 'credentials');
      const selectedFile = selector === 'AWS_CONFIG_FILE' ? configFile : credentialsFile;
      const counterpartFile = selector === 'AWS_CONFIG_FILE' ? credentialsFile : configFile;
      fs.writeFileSync(selectedFile, '');
      const replaceCounterpart = (label: string) => {
        const next = `${counterpartFile}.next`;
        fs.writeFileSync(
          next,
          `[default]\naws_access_key_id=${label}-access\naws_secret_access_key=fixture-secret\n`,
        );
        fs.renameSync(next, counterpartFile);
      };
      replaceCounterpart('before');
      restore = mockProcessEnv({
        AWS_PROFILE: undefined,
        AWS_ACCESS_KEY_ID: undefined,
        AWS_SECRET_ACCESS_KEY: undefined,
        AWS_SESSION_TOKEN: undefined,
        AWS_CONFIG_FILE: configFile,
        AWS_SHARED_CREDENTIALS_FILE: credentialsFile,
        AWS_EC2_METADATA_DISABLED: 'true',
      });
      const env = { [selector]: selectedFile };
      const firstNamespace = getAwsCredentialCacheNamespace({}, env);
      const readIdentity = async () => {
        const provider = new AwsBedrockCompletionProvider('fixture', { env });
        const client = await provider.getBedrockInstance();
        try {
          expect(Reflect.get(client.config, 'profile')).toBe('default');
          expect(Reflect.get(provider, 'responseCacheNamespace')).toBe(
            getAwsCredentialCacheNamespace({}, env),
          );
          return (await client.config.credentials()).accessKeyId;
        } finally {
          client.destroy();
        }
      };
      try {
        expect(firstNamespace).toBeDefined();
        expect(await readIdentity()).toBe('before-access');
        replaceCounterpart('after');
        expect(await readIdentity()).toBe('after-access');
        expect(getAwsCredentialCacheNamespace({}, env)).not.toBe(firstNamespace);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  it('partitions effective static keys when a scoped profile clears the host selector', () => {
    restore = mockProcessEnv({
      AWS_PROFILE: 'host-profile',
      AWS_ACCESS_KEY_ID: 'first-access',
      AWS_SECRET_ACCESS_KEY: 'fixture-secret',
    });
    const first = getAwsCredentialCacheNamespace({}, { AWS_PROFILE: '' });
    mockProcessEnv({ AWS_ACCESS_KEY_ID: 'second-access' });
    expect(getAwsCredentialCacheNamespace({}, { AWS_PROFILE: '' })).not.toBe(first);
  });

  it('partitions the public source identity beneath the same scoped AWS role profile', () => {
    const env = {
      AWS_PROFILE: 'role-profile',
      AWS_CONFIG_FILE: '/fixture/role-config',
      AWS_SECRET_ACCESS_KEY: 'fixture-secret',
    };
    const first = getAwsCredentialCacheNamespace({}, { ...env, AWS_ACCESS_KEY_ID: 'first-access' });
    const second = getAwsCredentialCacheNamespace(
      {},
      { ...env, AWS_ACCESS_KEY_ID: 'second-access' },
    );
    expect(first).not.toBe(second);
    expect(getAwsCredentialCacheNamespace({}, { ...env, AWS_ACCESS_KEY_ID: 'first-access' })).toBe(
      first,
    );
    expect(getAwsCredentialCacheNamespace({ profile: 'configured-role' })).toBeUndefined();
  });

  it('retains the exact released SageMaker embedding cache key', () => {
    const provider = new SageMakerEmbeddingProvider('fixture-endpoint', {
      config: {
        region: 'us-east-1',
        modelType: 'custom',
        contentType: 'application/json',
        acceptType: 'application/json',
      },
    });
    expect(Reflect.get(provider, 'getCacheKey').call(provider, 'fixture input')).toBe(
      'sagemaker:embedding:v1:fixture-endpoint:bda3c7ef0c3f3baa:25221529',
    );
  });

  it('keeps identical public identities stable in independently started processes', () => {
    const moduleUrl = pathToFileURL(path.resolve('src/providers/credentialCache.ts')).href;
    const script = `import { getCredentialCacheNamespace } from ${JSON.stringify(moduleUrl)}; process.stdout.write(getCredentialCacheNamespace(['fixture-access-key', 'profile']));`;
    const run = () =>
      execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
        encoding: 'utf8',
      });
    expect(run()).toBe(run());
    expect(run()).toBe(getCredentialCacheNamespace(['fixture-access-key', 'profile']));
  });

  it('partitions scoped SSO files and routing files even with configured static IAM', () => {
    const config = { profile: 'fixture' };
    expect(getAwsCredentialCacheNamespace(config)).toBeUndefined();
    const first = getAwsCredentialCacheNamespace(config, {
      AWS_CONFIG_FILE: '/fixture/first-config',
    });
    const second = getAwsCredentialCacheNamespace(config, {
      AWS_CONFIG_FILE: '/fixture/second-config',
    });
    expect(first).not.toBe(second);
    expect(
      getAwsCredentialCacheNamespace(config, { AWS_CONFIG_FILE: '/fixture/first-config' }),
    ).toBe(first);
    expect(
      getAwsCredentialCacheNamespace(
        { accessKeyId: 'fixed', secretAccessKey: 'fixed' },
        { AWS_CONFIG_FILE: '/fixture/first-config' },
      ),
    ).toBe(getAwsEndpointCacheNamespace({ AWS_CONFIG_FILE: '/fixture/first-config' }));
  });

  it('keeps opaque identities isolated without persistent secret fingerprints', () => {
    const first = getOpaqueCredentialCacheNamespace('fixture-bearer-one');
    expect(getOpaqueCredentialCacheNamespace('fixture-bearer-one')).toBe(first);
    expect(getOpaqueCredentialCacheNamespace('fixture-bearer-two')).not.toBe(first);
    expect(first).not.toContain('fixture-bearer');
  });

  it('retains ambient/bearer Bedrock keys and migrates configured IAM keys', async () => {
    restore = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: undefined, AWS_PROFILE: undefined });
    for (const { config, expectedNamespace } of [
      { config: {}, expectedNamespace: undefined },
      {
        config: { accessKeyId: 'config-key', secretAccessKey: 'config-secret' },
        expectedNamespace: 'bedrock-iam-v1',
      },
      { config: { apiKey: 'config-bearer' }, expectedNamespace: undefined },
    ]) {
      const provider = new AwsBedrockCompletionProvider('fixture', { config });
      const cacheNamespace = Reflect.get(provider, 'responseCacheNamespace');
      expect(cacheNamespace).toBe(expectedNamespace);
      const input = { config, region: 'us-east-1', params: { prompt: 'fixture' } };
      const legacy = createBedrockCacheKeyHash(input);
      expect(createBedrockCacheKeyHash({ ...input, cacheNamespace })).toBe(
        expectedNamespace ? `${expectedNamespace}:${legacy}` : legacy,
      );
    }
  });

  it('keeps existing file-bearer fingerprints distinct and stable across scopes', async () => {
    const key = (token: string) =>
      cliState.withEnvFileOverrides({ AWS_BEARER_TOKEN_BEDROCK: token }, async () => {
        const provider = new AwsBedrockCompletionProvider('fixture');
        return createBedrockCacheKeyHash({
          config: {},
          params: {},
          region: 'us-east-1',
          cacheNamespace: Reflect.get(provider, 'responseCacheNamespace'),
        });
      });
    expect(await key('fixture-one')).toBe(await key('fixture-one'));
    expect(await key('fixture-one')).not.toBe(await key('fixture-two'));
  });

  it.each(['host', 'file', 'suite'])(
    'isolates a provider bearer mask from inherited %s bearer responses',
    async (scope) => {
      restore = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: 'host-bearer' });
      const run = () => {
        const key = (env: { AWS_BEARER_TOKEN_BEDROCK?: string }, config = {}) => {
          const provider = new AwsBedrockCompletionProvider('fixture', { env, config });
          return createBedrockCacheKeyHash({
            config,
            params: { prompt: 'same request' },
            region: 'us-east-1',
            cacheNamespace: Reflect.get(provider, 'responseCacheNamespace'),
          });
        };
        expect(key({ AWS_BEARER_TOKEN_BEDROCK: '' })).not.toBe(key({}));
        expect(key({ AWS_BEARER_TOKEN_BEDROCK: '' })).toBe(key({ AWS_BEARER_TOKEN_BEDROCK: '' }));
        for (const config of [
          { apiKey: 'configured-bearer' },
          { accessKeyId: 'configured-access', secretAccessKey: 'configured-secret' },
        ]) {
          expect(key({ AWS_BEARER_TOKEN_BEDROCK: '' }, config)).toBe(key({}, config));
        }
      };
      const env = { AWS_BEARER_TOKEN_BEDROCK: 'scoped-bearer' };
      await (scope === 'file'
        ? cliState.withEnvFileOverrides(env, run)
        : scope === 'suite'
          ? cliState.withEnv(env, run)
          : run());
    },
  );

  it('invalidates same-path Google ADC and AWS profile caches after file replacement', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-credential-cache-'));
    const filename = path.join(dir, 'credentials');
    try {
      fs.writeFileSync(filename, 'first fixture identity');
      restore = mockProcessEnv({ AWS_SHARED_CREDENTIALS_FILE: filename });
      const vertex = new VertexChatProvider('gemini-2.5-flash', {
        env: { GOOGLE_APPLICATION_CREDENTIALS: filename },
      });
      const beforeGoogle = Reflect.get(vertex, 'getResponseCacheNamespace').call(vertex);
      const beforeAws = getAwsCredentialCacheNamespace({}, { AWS_PROFILE: 'fixture' });
      fs.writeFileSync(filename, 'replacement fixture identity with different permissions');
      expect(Reflect.get(vertex, 'getResponseCacheNamespace').call(vertex)).not.toBe(beforeGoogle);
      expect(getAwsCredentialCacheNamespace({}, { AWS_PROFILE: 'fixture' })).not.toBe(beforeAws);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
