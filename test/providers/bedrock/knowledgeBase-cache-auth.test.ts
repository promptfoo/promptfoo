import { NodeHttp2Handler, NodeHttpHandler } from '@smithy/node-http-handler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import { AwsBedrockKnowledgeBaseProvider } from '../../../src/providers/bedrock/knowledgeBase';
import { sha256 } from '../../../src/util/createHash';
import { mockProcessEnv } from '../../util/utils';

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
    const output = authorization.startsWith('Bearer ') ? authorization.slice(7) : 'sigv4-fixture';
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
  vi.restoreAllMocks();
  restore();
});

describe('Knowledge Base selected-auth cache partition', () => {
  it('isolates new provider bearers from ambient cache entries and each other', async () => {
    expect(await provider().callApi('fixture prompt')).toMatchObject({ output: 'sigv4-fixture' });
    expect(await provider('fixture-one').callApi('fixture prompt')).toMatchObject({
      output: 'fixture-one',
    });
    expect(await provider('fixture-two').callApi('fixture prompt')).toMatchObject({
      output: 'fixture-two',
    });
    expect(await provider('fixture-one').callApi('fixture prompt')).toMatchObject({
      output: 'fixture-one',
      cached: true,
    });
    expect(authorizations).toHaveLength(3);
    expect(
      [...fixtures.cache.keys()].every(
        (key) => !key.includes('fixture-one') && !key.includes('fixture-two'),
      ),
    ).toBe(true);
  });
  it('uses the same opaque partition across equivalent provider instances and evaluation scopes', async () => {
    const first = await cliState.withEnv({}, () =>
      provider('same-fixture').callApi('fixture prompt'),
    );
    const second = await cliState.withEnv({}, () =>
      provider('same-fixture').callApi('fixture prompt'),
    );
    expect(first).toMatchObject({ output: 'same-fixture' });
    expect(second).toMatchObject({ output: 'same-fixture', cached: true });
    expect(authorizations).toEqual(['Bearer same-fixture']);
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
    expect([...fixtures.cache.keys()]).toEqual([legacyKey(config)]);
  });
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
  it.each(['ambient', 'file', 'suite'] as const)(
    'retains the exact released %s bearer cache key',
    async (source) => {
      const selected = { AWS_BEARER_TOKEN_BEDROCK: 'legacy-fixture' };
      const run = async () => {
        await provider().callApi('fixture prompt');
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
