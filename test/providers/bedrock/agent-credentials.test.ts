import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import {
  InvokeAgentCommand,
  RetrieveAndGenerateCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';
import { NodeHttp2Handler, NodeHttpHandler } from '@smithy/node-http-handler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import { AwsBedrockAgentsProvider } from '../../../src/providers/bedrock/agents';
import { AwsBedrockKnowledgeBaseProvider } from '../../../src/providers/bedrock/knowledgeBase';
import { mockProcessEnv } from '../../util/utils';
import type { BedrockAgentRuntimeClient } from '@aws-sdk/client-bedrock-agent-runtime';
import type { HttpRequest } from '@smithy/types';

const fixtures = vi.hoisted(() => ({ cache: new Map<string, unknown>() }));
vi.mock('../../../src/cache', () => ({
  isCacheEnabled: () => true,
  getCache: async () => ({
    get: async (key: string) => fixtures.cache.get(key),
    set: async (key: string, value: unknown) => fixtures.cache.set(key, value),
  }),
}));
const kinds = ['agent', 'knowledge-base'] as const;
const model = 'anthropic.claude-3-sonnet-20240229-v1:0';
let dir: string;
let restore: () => void;
let authorizations: string[][];
const clients: BedrockAgentRuntimeClient[] = [];
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-agent-credentials-'));
  fs.writeFileSync(
    path.join(dir, 'credentials'),
    '[default]\naws_access_key_id=default-access\naws_secret_access_key=default-secret\n[ambient]\naws_access_key_id=ambient-profile-access\naws_secret_access_key=ambient-profile-secret\n[selected]\naws_access_key_id=scoped-profile-access\naws_secret_access_key=scoped-profile-secret\n',
  );
  fs.writeFileSync(path.join(dir, 'config'), '');
  restore = mockProcessEnv(
    {
      AWS_CONFIG_FILE: path.join(dir, 'config'),
      AWS_SHARED_CREDENTIALS_FILE: path.join(dir, 'credentials'),
      AWS_EC2_METADATA_DISABLED: 'true',
      AWS_BEDROCK_MAX_RETRIES: '1',
    },
    { clear: true },
  );
  authorizations = [];
  fixtures.cache.clear();
  const handle = async (request: HttpRequest) => {
    authorizations.push(
      Object.entries(request.headers)
        .filter(([name]) => name.toLowerCase() === 'authorization')
        .map(([, value]) =>
          value.startsWith('Bearer ')
            ? value
            : (value.match(/Credential=([^/]+)/)?.[1] ?? 'missing'),
        ),
    );
    return {
      response: {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: request.path.startsWith('/agents/')
          ? Readable.from([])
          : Buffer.from(JSON.stringify({ output: { text: 'fixture-output' } })),
      },
    };
  };
  vi.spyOn(NodeHttpHandler.prototype, 'handle').mockImplementation(handle);
  vi.spyOn(NodeHttp2Handler.prototype, 'handle').mockImplementation(handle);
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network access'));
});
afterEach(() => {
  for (const client of clients.splice(0)) {
    client.destroy();
  }
  vi.resetAllMocks();
  vi.restoreAllMocks();
  restore();
  fs.rmSync(dir, { recursive: true, force: true });
});
function provider(
  kind: (typeof kinds)[number],
  config: object,
  env?: Record<string, string | undefined>,
) {
  const options = {
    config: {
      region: 'us-east-1',
      agentId: 'fixture-agent',
      agentAliasId: 'fixture-alias',
      knowledgeBaseId: 'fixture-kb',
      ...config,
    },
    env,
  };
  return kind === 'agent'
    ? new AwsBedrockAgentsProvider('fixture-agent', options)
    : new AwsBedrockKnowledgeBaseProvider(model, options);
}
async function clientFor(instance: AwsBedrockAgentsProvider | AwsBedrockKnowledgeBaseProvider) {
  const client =
    instance instanceof AwsBedrockAgentsProvider
      ? await instance.getAgentRuntimeClient()
      : await instance.getKnowledgeBaseClient();
  clients.push(client);
  return client;
}
async function invoke(
  kind: (typeof kinds)[number],
  config: object,
  env?: Record<string, string | undefined>,
) {
  const client = await clientFor(provider(kind, config, env));
  if (kind === 'agent') {
    await client.send(
      new InvokeAgentCommand({
        agentId: 'fixture-agent',
        agentAliasId: 'fixture-alias',
        sessionId: 'fixture-session',
        inputText: 'fixture',
      }),
    );
  } else {
    await client.send(
      new RetrieveAndGenerateCommand({
        input: { text: 'fixture' },
        retrieveAndGenerateConfiguration: {
          type: 'KNOWLEDGE_BASE',
          knowledgeBaseConfiguration: {
            knowledgeBaseId: 'fixture-kb',
            modelArn: `arn:aws:bedrock:us-east-1::foundation-model/${model}`,
          },
        },
      }),
    );
  }
}

describe('Bedrock agent-runtime released IAM selection', () => {
  it.each(
    kinds.flatMap((kind) =>
      ['absent', 'ambient', 'config', 'provider', 'file', 'suite', 'file-blank'].flatMap((bearer) =>
        ['none', 'profile', 'profile-partial', 'explicit'].flatMap((configured) =>
          ['keys', 'profile', 'default'].map((ambient) => ({ kind, bearer, configured, ambient })),
        ),
      ),
    ),
  )(
    '$kind bearer=$bearer config=$configured ambient=$ambient',
    async ({ kind, bearer, configured, ambient }) => {
      mockProcessEnv({
        ...(ambient === 'keys'
          ? { AWS_ACCESS_KEY_ID: 'host-access', AWS_SECRET_ACCESS_KEY: 'host-secret' }
          : {}),
        ...(ambient === 'profile' ? { AWS_PROFILE: 'ambient' } : {}),
        ...(bearer === 'ambient' || bearer === 'file-blank'
          ? { AWS_BEARER_TOKEN_BEDROCK: 'fixture-token' }
          : {}),
      });
      const config = {
        ...(configured === 'profile' || configured === 'profile-partial'
          ? { profile: 'missing-sso' }
          : {}),
        ...(configured === 'profile-partial' ? { accessKeyId: '', secretAccessKey: '' } : {}),
        ...(configured === 'explicit'
          ? {
              profile: 'missing-sso',
              accessKeyId: 'explicit-access',
              secretAccessKey: 'explicit-secret',
            }
          : {}),
        ...(bearer === 'config' ? { apiKey: 'fixture-token' } : {}),
      };
      const run = () =>
        invoke(
          kind,
          config,
          bearer === 'provider' ? { AWS_BEARER_TOKEN_BEDROCK: 'fixture-token' } : undefined,
        );
      const scoped = { AWS_BEARER_TOKEN_BEDROCK: bearer === 'file-blank' ? '' : 'fixture-token' };
      const result =
        bearer === 'file' || bearer === 'file-blank'
          ? cliState.withEnvFileOverrides(scoped, run)
          : bearer === 'suite'
            ? cliState.withEnv(scoped, run)
            : run();
      const profileBypassed = ['ambient', 'config', 'file', 'suite'].includes(bearer);
      if (['profile', 'profile-partial'].includes(configured) && !profileBypassed) {
        await expect(result).rejects.toThrow('missing-sso');
        expect(authorizations).toEqual([]);
      } else {
        await expect(result).resolves.toBeUndefined();
        const iamKey =
          configured === 'explicit'
            ? 'explicit-access'
            : ambient === 'keys'
              ? 'host-access'
              : ambient === 'profile'
                ? 'ambient-profile-access'
                : 'default-access';
        const handlerBearer =
          kind === 'knowledge-base' &&
          configured !== 'explicit' &&
          !['absent', 'file-blank'].includes(bearer);
        expect(authorizations).toEqual([
          [iamKey, ...(handlerBearer ? ['Bearer fixture-token'] : [])],
        ]);
      }
      expect(process.env.AWS_BEARER_TOKEN_BEDROCK).toBe(
        bearer === 'ambient' || bearer === 'file-blank' ? 'fixture-token' : undefined,
      );
    },
  );

  it.each(
    kinds.flatMap((kind) =>
      ['keys', 'profile', 'cleared-profile', 'cleared-keys'].map((source) => ({ kind, source })),
    ),
  )(
    'forwards $kind $source independently of a bypassed configured profile',
    async ({ kind, source }) => {
      mockProcessEnv({
        AWS_ACCESS_KEY_ID: 'host-access',
        AWS_SECRET_ACCESS_KEY: 'host-secret',
        ...(source === 'cleared-profile' ? { AWS_PROFILE: 'ambient' } : {}),
      });
      const env =
        source === 'keys'
          ? { AWS_ACCESS_KEY_ID: 'scoped-access', AWS_SECRET_ACCESS_KEY: 'scoped-secret' }
          : source === 'profile'
            ? { AWS_PROFILE: 'selected' }
            : source === 'cleared-profile'
              ? { AWS_PROFILE: '' }
              : { AWS_ACCESS_KEY_ID: '', AWS_SECRET_ACCESS_KEY: '' };
      await cliState.withEnvFileOverrides(env, () =>
        invoke(kind, { apiKey: 'fixture-token', profile: 'missing-sso' }),
      );
      expect(authorizations).toEqual([
        [
          source === 'keys'
            ? 'scoped-access'
            : source === 'profile'
              ? 'scoped-profile-access'
              : source === 'cleared-profile'
                ? 'host-access'
                : 'default-access',
          ...(kind === 'knowledge-base' ? ['Bearer fixture-token'] : []),
        ],
      ]);
    },
  );

  it('binds Agent response caches to the scoped IAM identity after profile bypass', async () => {
    const usedKeys: string[] = [];
    const call = async (key: string) =>
      cliState.withEnvFileOverrides(
        { AWS_ACCESS_KEY_ID: key, AWS_SECRET_ACCESS_KEY: 'scoped-secret' },
        async () => {
          const instance = provider('agent', { apiKey: 'ignored-api-key', profile: 'missing-sso' });
          const client = await clientFor(instance);
          vi.spyOn(client, 'send').mockImplementation(async () => {
            const credentials = await client.config.credentials();
            usedKeys.push(credentials.accessKeyId);
            return {
              completion: (async function* () {
                yield { chunk: { bytes: new TextEncoder().encode(credentials.accessKeyId) } };
              })(),
            };
          });
          return instance.callApi('same prompt');
        },
      );
    expect(await call('first-access')).toMatchObject({ output: 'first-access' });
    expect(await call('first-access')).toMatchObject({ output: 'first-access', cached: true });
    expect(await call('second-access')).toMatchObject({ output: 'second-access' });
    expect(usedKeys).toEqual(['first-access', 'second-access']);
  });
});
