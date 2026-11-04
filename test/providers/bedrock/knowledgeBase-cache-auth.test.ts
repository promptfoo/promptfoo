import { NodeHttp2Handler, NodeHttpHandler } from '@smithy/node-http-handler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import { AwsBedrockKnowledgeBaseProvider } from '../../../src/providers/bedrock/knowledgeBase';
import { sha256 } from '../../../src/util/createHash';
import { mockProcessEnv } from '../../util/utils';

vi.mock('@aws-sdk/credential-provider-sso', () => ({
  fromSSO: () => async () => ({ accessKeyId: 'profile-access', secretAccessKey: 'profile-secret' }),
}));

const fixtures = vi.hoisted(() => ({ cache: new Map<string, unknown>() }));
vi.mock('../../../src/cache', () => ({
  isCacheEnabled: () => true,
  getCache: async () => ({
    get: async (key: string) => fixtures.cache.get(key),
    set: async (key: string, value: unknown) => fixtures.cache.set(key, value),
  }),
}));
const modelName = 'anthropic.claude-3-sonnet-20240229-v1:0';
const baseConfig = { knowledgeBaseId: 'fixture-kb', region: 'us-east-1' };
let restore: () => void;
let authorizations: string[];
const providers: AwsBedrockKnowledgeBaseProvider[] = [];
function provider(bearer?: string, config = {}) {
  const instance = new AwsBedrockKnowledgeBaseProvider(modelName, {
    config: { ...baseConfig, ...config },
    env: bearer === undefined ? undefined : { AWS_BEARER_TOKEN_BEDROCK: bearer },
  });
  providers.push(instance);
  return instance;
}
function legacyKey(config = {}) {
  const selected = { ...baseConfig, ...config };
  const cacheConfig = {
    region: 'us-east-1',
    modelName,
    ...Object.fromEntries(
      Object.entries(selected).filter(
        ([key]) => !['accessKeyId', 'secretAccessKey', 'sessionToken'].includes(key),
      ),
    ),
  };
  const configStr = JSON.stringify(cacheConfig, Object.keys(cacheConfig).sort());
  return `bedrock-kb:v2:fixture-kb:arn:aws:bedrock:us-east-1::foundation-model/${modelName}:us-east-1:${sha256(JSON.stringify({ configStr, prompt: 'fixture prompt' }))}`;
}
beforeEach(() => {
  restore = mockProcessEnv(
    {
      AWS_ACCESS_KEY_ID: 'host-access',
      AWS_SECRET_ACCESS_KEY: 'host-secret',
      AWS_EC2_METADATA_DISABLED: 'true',
      AWS_BEDROCK_MAX_RETRIES: '1',
    },
    { clear: true },
  );
  fixtures.cache.clear();
  authorizations = [];
  const handle = async (request: { headers: Record<string, string> }) => {
    // Node's outgoing headers are case insensitive: the handler's final
    // Authorization replaces the SDK's lower-case SigV4 authorization.
    const authorization =
      Object.entries(request.headers)
        .filter(([name]) => name.toLowerCase() === 'authorization')
        .at(-1)?.[1] ?? '';
    authorizations.push(authorization);
    const scopedOwner = authorization.match(/Credential=(first|second)-access\//)?.[1];
    const sessionOwner =
      request.headers['x-amz-security-token']?.match(/^(first|second)-session$/)?.[1];
    const output = authorization.startsWith('Bearer ')
      ? authorization.slice(7)
      : sessionOwner || scopedOwner || 'sigv4-fixture';
    return {
      response: {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(JSON.stringify({ output: { text: output } })),
      },
    };
  };
  vi.spyOn(NodeHttpHandler.prototype, 'handle').mockImplementation(handle);
  vi.spyOn(NodeHttp2Handler.prototype, 'handle').mockImplementation(handle);
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network access.'));
});
afterEach(() => {
  for (const instance of providers.splice(0)) {
    instance.knowledgeBaseClient?.destroy();
  }
  vi.resetAllMocks();
  vi.restoreAllMocks();
  restore();
});

describe('Knowledge Base selected-auth cache partition', () => {
  it.each(['', 'fixture-one', 'fixture-two'])(
    'ignores provider-only bearer %s while reusing the selected ambient IAM cache',
    async (bearer) => {
      expect(await provider().callApi('fixture prompt')).toMatchObject({ output: 'sigv4-fixture' });
      expect(await provider(bearer).callApi('fixture prompt')).toMatchObject({
        output: 'sigv4-fixture',
        cached: true,
      });
      expect(authorizations).toHaveLength(1);
      expect(authorizations[0]).toContain('Credential=host-access/');
      expect([...fixtures.cache.keys()]).toEqual([legacyKey()]);
    },
  );

  it.each(['', 'fixture-one'])(
    'retains configured-profile IAM credentials and cache with provider-only bearer %s',
    async (bearer) => {
      const config = { profile: 'fixture-profile' };
      expect(await provider(bearer, config).callApi('fixture prompt')).toMatchObject({
        output: 'sigv4-fixture',
      });
      expect(await provider(undefined, config).callApi('fixture prompt')).toMatchObject({
        output: 'sigv4-fixture',
        cached: true,
      });
      expect(authorizations).toHaveLength(1);
      expect(authorizations[0]).toContain('Credential=profile-access/');
      expect([...fixtures.cache.keys()]).toEqual([legacyKey(config)]);
    },
  );

  it('partitions actual scoped IAM identities while ignoring provider bearer changes', async () => {
    const rows = [];
    for (const [owner, bearer] of [
      ['first', 'ignored-one'],
      ['second', 'ignored-two'],
      ['first', 'ignored-three'],
    ]) {
      rows.push(
        await cliState.withEnv(
          { AWS_ACCESS_KEY_ID: `${owner}-access`, AWS_SECRET_ACCESS_KEY: `${owner}-secret` },
          () => provider(bearer).callApi('fixture prompt'),
        ),
      );
    }
    expect(rows).toMatchObject([
      { output: 'first' },
      { output: 'second' },
      { output: 'first', cached: true },
    ]);
    expect(authorizations).toHaveLength(2);
    expect(authorizations[0]).toContain('Credential=first-access/');
    expect(authorizations[1]).toContain('Credential=second-access/');
    expect([...fixtures.cache.keys()].every((key) => !key.includes('ignored-'))).toBe(true);
  });
  it('ignores provider bearers when an explicit configured keypair wins', async () => {
    const config = { accessKeyId: 'config-access', secretAccessKey: 'config-secret' };
    expect(await provider('fixture-one', config).callApi('fixture prompt')).toMatchObject({
      output: 'sigv4-fixture',
    });
    expect(await provider('fixture-two', config).callApi('fixture prompt')).toMatchObject({
      output: 'sigv4-fixture',
      cached: true,
    });
    expect(authorizations).toHaveLength(1);
    expect(authorizations[0]).toContain('Credential=config-access/');
    const keys = [...fixtures.cache.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^bedrock-kb:v2:bedrock-iam-v1:[0-9a-f-]{36}:/);
    expect(keys[0].endsWith(legacyKey(config).slice('bedrock-kb:v2:'.length))).toBe(true);
  });
  it.each(
    ['config', 'ambient', 'file', 'suite', 'none'].flatMap((bearer) =>
      ['keys', 'session'].map((identity) => ({ bearer, identity })),
    ),
  )(
    'partitions configured IAM $identity with a shared $bearer bearer',
    async ({ bearer, identity }) => {
      const selected = { AWS_BEARER_TOKEN_BEDROCK: 'shared-bearer' };
      if (bearer === 'ambient') {
        mockProcessEnv(selected);
      }
      const run = async () => {
        const rows = [];
        for (const owner of ['first', 'second', 'first']) {
          rows.push(
            await provider(undefined, {
              accessKeyId: identity === 'keys' ? `${owner}-access` : 'session-access',
              secretAccessKey: identity === 'keys' ? `${owner}-secret` : 'session-secret',
              ...(identity === 'session' ? { sessionToken: `${owner}-session` } : {}),
              ...(bearer === 'config' ? { apiKey: 'shared-bearer' } : {}),
            }).callApi('fixture prompt'),
          );
        }
        expect(rows).toMatchObject([
          { output: 'first' },
          { output: 'second' },
          { output: 'first', cached: true },
        ]);
        expect(authorizations).toHaveLength(2);
        expect(authorizations.every((value) => value.startsWith('AWS4-HMAC-SHA256'))).toBe(true);
        const keys = [...fixtures.cache.keys()];
        expect(keys).toHaveLength(2);
        for (const key of keys) {
          for (const credential of [
            'first-access',
            'second-access',
            'first-secret',
            'second-secret',
            'session-access',
            'session-secret',
            'first-session',
            'second-session',
          ]) {
            expect(key).not.toContain(credential);
            expect(key).not.toContain(sha256(credential));
          }
        }
      };
      if (bearer === 'file') {
        await cliState.withEnvFileOverrides(selected, run);
      } else if (bearer === 'suite') {
        await cliState.withEnv(selected, run);
      } else {
        await run();
      }
    },
  );
  it('retains configured bearer priority and its existing key despite provider overrides', async () => {
    const config = { apiKey: 'configured-fixture' };
    await provider('fixture-one', config).callApi('fixture prompt');
    expect(await provider('fixture-two', config).callApi('fixture prompt')).toMatchObject({
      output: 'configured-fixture',
      cached: true,
    });
    expect(authorizations).toEqual(['Bearer configured-fixture']);
    expect([...fixtures.cache.keys()]).toEqual([legacyKey(config)]);
  });
  it.each(
    ['ambient', 'file', 'suite'].flatMap((source) =>
      [undefined, '', 'ignored-provider'].map((bearer) => ({ source, bearer })),
    ),
  )(
    'retains the exact released $source bearer cache key with provider-only value $bearer',
    async ({ source, bearer }) => {
      const selected = { AWS_BEARER_TOKEN_BEDROCK: 'legacy-fixture' };
      const run = async () => {
        await provider(bearer).callApi('fixture prompt');
        expect([...fixtures.cache.keys()]).toEqual([legacyKey()]);
        expect(authorizations).toEqual(['Bearer legacy-fixture']);
      };
      if (source === 'ambient') {
        mockProcessEnv(selected);
        await run();
      } else if (source === 'file') {
        await cliState.withEnvFileOverrides(selected, run);
      } else {
        await cliState.withEnv(selected, run);
      }
    },
  );
});
