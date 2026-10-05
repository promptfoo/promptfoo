import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { NodeHttp2Handler, NodeHttpHandler } from '@smithy/node-http-handler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { getAwsCredentialCacheNamespace } from '../../src/providers/awsCredentials';
import { AwsBedrockKnowledgeBaseProvider } from '../../src/providers/bedrock/knowledgeBase';
import { getCredentialCacheNamespace } from '../../src/providers/credentialCache';
import { mockProcessEnv } from '../util/utils';

const fixtures = vi.hoisted(() => ({ cache: new Map<string, unknown>() }));
vi.mock('../../src/cache', () => ({
  isCacheEnabled: () => true,
  getCache: async () => ({
    get: async (key: string) => fixtures.cache.get(key),
    set: async (key: string, value: unknown) => fixtures.cache.set(key, value),
  }),
}));
let dir: string;
let configFilepath: string;
let filepath: string;
let restore: () => void;
let authorizations: string[];
const providers: AwsBedrockKnowledgeBaseProvider[] = [];
const selected = () => ({
  AWS_PROFILE: 'fixture',
  AWS_CONFIG_FILE: configFilepath,
  AWS_SHARED_CREDENTIALS_FILE: filepath,
});

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-process-cache-'));
  configFilepath = path.join(dir, 'config');
  filepath = path.join(dir, 'credentials');
  const script = path.join(dir, 'process.cjs');
  fs.writeFileSync(filepath, '');
  fs.writeFileSync(
    configFilepath,
    `[profile fixture]\ncredential_process=${JSON.stringify(process.execPath.replaceAll('\\', '/'))} ${JSON.stringify(script.replaceAll('\\', '/'))}\n`,
  );
  fs.writeFileSync(
    script,
    `process.stdout.write(JSON.stringify({Version:1,AccessKeyId:process.env.FIXTURE_IDENTITY,SecretAccessKey:'fixture-secret'}));`,
  );
  restore = mockProcessEnv(
    {
      ComSpec: process.env.ComSpec,
      SystemRoot: process.env.SystemRoot,
      PATH: process.env.PATH,
      HOME: dir,
      ...selected(),
      AWS_EC2_METADATA_DISABLED: 'true',
      AWS_BEDROCK_MAX_RETRIES: '1',
      FIXTURE_IDENTITY: 'host-access',
    },
    { clear: true },
  );
  fixtures.cache.clear();
  authorizations = [];
  const handle = async (request: { headers: Record<string, string> }) => {
    const authorization = request.headers.authorization;
    authorizations.push(authorization);
    const identity = authorization.match(/Credential=([^/]+)\//)?.[1];
    return {
      response: {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(JSON.stringify({ output: { text: identity } })),
      },
    };
  };
  vi.spyOn(NodeHttpHandler.prototype, 'handle').mockImplementation(handle);
  vi.spyOn(NodeHttp2Handler.prototype, 'handle').mockImplementation(handle);
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network'));
});

afterEach(() => {
  for (const provider of providers.splice(0)) {
    provider.knowledgeBaseClient?.destroy();
  }
  restore();
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('scoped credential-process response caching', () => {
  it.each(['file', 'suite', 'provider'])(
    'partitions %s process identities and reuses the first identity',
    async (scope) => {
      const rows = [];
      for (const identity of ['first-access', 'second-access', 'first-access']) {
        const env = { FIXTURE_IDENTITY: identity };
        const run = () => {
          const provider = new AwsBedrockKnowledgeBaseProvider(
            'anthropic.claude-3-sonnet-20240229-v1:0',
            {
              config: { knowledgeBaseId: 'fixture-kb', region: 'us-east-1' },
              env: scope === 'provider' ? env : undefined,
            },
          );
          providers.push(provider);
          return provider.callApi('fixture prompt');
        };
        rows.push(
          await (scope === 'file'
            ? cliState.withEnvFileOverrides(env, run)
            : scope === 'suite'
              ? cliState.withEnv(env, run)
              : run()),
        );
      }
      expect(rows).toMatchObject([
        { output: 'first-access' },
        { output: 'second-access' },
        { output: 'first-access', cached: true },
      ]);
      expect(authorizations).toHaveLength(2);
      expect(authorizations[0]).toContain('Credential=first-access/');
      expect(authorizations[1]).toContain('Credential=second-access/');
      for (const key of fixtures.cache.keys()) {
        expect(key).not.toContain('first-access');
        expect(key).not.toContain('second-access');
        expect(key).not.toContain('fixture-secret');
      }
    },
  );

  it('canonicalizes process variables and distinguishes empty values without storing secrets', () => {
    const first = getAwsCredentialCacheNamespace(
      {},
      { CUSTOM_SECRET: 'first-secret', AWS_CUSTOM_ACCOUNT: 'first' },
    );
    expect(first).toBeDefined();
    expect(
      getAwsCredentialCacheNamespace(
        {},
        { AWS_CUSTOM_ACCOUNT: 'first', CUSTOM_SECRET: 'first-secret', UNSET_VALUE: undefined },
      ),
    ).toBe(first);
    expect(
      getAwsCredentialCacheNamespace({}, { CUSTOM_SECRET: '', AWS_CUSTOM_ACCOUNT: 'first' }),
    ).not.toBe(first);
    expect(
      getAwsCredentialCacheNamespace(
        {},
        { CUSTOM_SECRET: 'second-secret', AWS_CUSTOM_ACCOUNT: 'first' },
      ),
    ).not.toBe(first);
    expect(first).not.toContain('first-secret');
  });

  it('retains public profile/file-only namespaces without introducing an opaque process selector', () => {
    const expected = getCredentialCacheNamespace(
      [undefined, 'fixture', undefined, undefined, undefined, 'source-unavailable'],
      [filepath, configFilepath],
    );
    const namespace = getAwsCredentialCacheNamespace({}, selected());
    expect(namespace).toMatch(new RegExp(`^${expected}:aws-endpoint:[a-f0-9]{64}$`));
    expect(namespace).not.toContain('aws-process:');
  });

  it('keeps custom process variables out of a winning static IAM identity', () => {
    const config = { accessKeyId: 'configured-access', secretAccessKey: 'configured-secret' };
    expect(getAwsCredentialCacheNamespace(config, { CUSTOM_SECRET: 'first' })).toBeUndefined();
    expect(getAwsCredentialCacheNamespace(config, { CUSTOM_SECRET: 'second' })).toBeUndefined();
    const restoreKeys = mockProcessEnv({
      AWS_PROFILE: undefined,
      AWS_ACCESS_KEY_ID: 'host-access',
      AWS_SECRET_ACCESS_KEY: 'host-secret',
    });
    try {
      expect(getAwsCredentialCacheNamespace({}, { CUSTOM_SECRET: 'first' })).toBeUndefined();
      expect(getAwsCredentialCacheNamespace({}, { CUSTOM_SECRET: 'second' })).toBeUndefined();
    } finally {
      restoreKeys();
    }
  });
});
