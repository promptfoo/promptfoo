import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { NodeHttp2Handler, NodeHttpHandler } from '@smithy/node-http-handler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { AwsBedrockKnowledgeBaseProvider } from '../../src/providers/bedrock/knowledgeBase';
import { mockProcessEnv } from '../util/utils';

const fixtures = vi.hoisted(() => ({ cache: new Map<string, unknown>() }));
vi.mock('../../src/cache', () => ({
  isCacheEnabled: () => true,
  getCache: async () => ({
    get: async (key: string) => fixtures.cache.get(key),
    set: async (key: string, value: unknown) => fixtures.cache.set(key, value),
  }),
}));
let directory: string;
let restore: () => void;
let destinations: string[];
let authorizations: string[];

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-endpoint-cache-'));
  fs.writeFileSync(path.join(directory, 'credentials'), '');
  fs.writeFileSync(path.join(directory, 'config'), '');
  for (const owner of ['first', 'second']) {
    fs.writeFileSync(
      path.join(directory, owner),
      `[default]\nendpoint_url=https://${owner}.invalid\n`,
    );
  }
  restore = mockProcessEnv(
    {
      AWS_ACCESS_KEY_ID: 'ambient-access',
      AWS_SECRET_ACCESS_KEY: 'ambient-secret',
      AWS_CONFIG_FILE: path.join(directory, 'config'),
      AWS_SHARED_CREDENTIALS_FILE: path.join(directory, 'credentials'),
      AWS_EC2_METADATA_DISABLED: 'true',
      AWS_BEDROCK_MAX_RETRIES: '1',
    },
    { clear: true },
  );
  fixtures.cache.clear();
  destinations = [];
  authorizations = [];
  const handle = async (request: { hostname: string; headers: Record<string, string> }) => {
    destinations.push(request.hostname);
    authorizations.push(
      Object.entries(request.headers)
        .filter(([name]) => name.toLowerCase() === 'authorization')
        .at(-1)?.[1] ?? '',
    );
    return {
      response: {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(JSON.stringify({ output: { text: request.hostname } })),
      },
    };
  };
  vi.spyOn(NodeHttpHandler.prototype, 'handle').mockImplementation(handle);
  vi.spyOn(NodeHttp2Handler.prototype, 'handle').mockImplementation(handle);
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network access'));
});
afterEach(() => {
  vi.restoreAllMocks();
  restore();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe('scoped AWS endpoint cache identity', () => {
  it.each(
    ['provider', 'suite', 'file'].flatMap((scope) =>
      ['explicit', 'ambient', 'bearer'].flatMap((auth) =>
        ['config-file', 'direct-url'].map((source) => ({ scope, auth, source })),
      ),
    ),
  )(
    'partitions $scope $source destinations with $auth credentials',
    async ({ scope, auth, source }) => {
      const rows = [];
      for (const owner of ['first', 'second', 'first']) {
        const env =
          source === 'config-file'
            ? { AWS_CONFIG_FILE: path.join(directory, owner) }
            : { AWS_ENDPOINT_URL: `https://${owner}.invalid` };
        const provider = new AwsBedrockKnowledgeBaseProvider(
          'anthropic.claude-3-sonnet-20240229-v1:0',
          {
            config: {
              knowledgeBaseId: 'fixture',
              region: 'us-east-1',
              ...(auth === 'explicit'
                ? { accessKeyId: 'config-access', secretAccessKey: 'config-secret' }
                : {}),
              ...(auth === 'bearer' ? { apiKey: 'configured-bearer' } : {}),
            },
            env: scope === 'provider' ? env : undefined,
          },
        );
        const run = () => provider.callApi('same prompt');
        try {
          rows.push(
            await (scope === 'file'
              ? cliState.withEnvFileOverrides(env, run)
              : scope === 'suite'
                ? cliState.withEnv(env, run)
                : run()),
          );
        } finally {
          provider.knowledgeBaseClient?.destroy();
        }
      }
      expect(rows).toMatchObject([
        { output: 'first.invalid' },
        { output: 'second.invalid' },
        { output: 'first.invalid', cached: true },
      ]);
      expect(destinations).toEqual(['first.invalid', 'second.invalid']);
      expect(authorizations).toHaveLength(2);
      for (const authorization of authorizations) {
        expect(authorization).toContain(
          auth === 'bearer'
            ? 'Bearer configured-bearer'
            : `Credential=${auth === 'explicit' ? 'config' : 'ambient'}-access/`,
        );
      }
      const persisted = JSON.stringify([...fixtures.cache.keys()]);
      expect(persisted).not.toContain('.invalid');
      expect(persisted).not.toContain('configured-bearer');
      expect(persisted).not.toContain('secret');
    },
  );
});
