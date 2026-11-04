import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  BedrockRuntimeClient,
  GetAsyncInvokeCommand,
  StartAsyncInvokeCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { NodeHttp2Handler, NodeHttpHandler } from '@smithy/node-http-handler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import { LumaRayVideoProvider } from '../../../src/providers/bedrock/luma-ray';
import { NovaReelVideoProvider } from '../../../src/providers/bedrock/nova-reel';
import { mockProcessEnv } from '../../util/utils';
import type { HttpRequest } from '@smithy/types';

const invocationArn = 'arn:aws:bedrock:us-east-1:123456789012:async-invoke/fixture';
const explicitKeys = { accessKeyId: 'explicit-access', secretAccessKey: 'explicit-secret' };
let dir: string;
let restore: () => void;
let auth: string[];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-media-auth-'));
  const credentialsFile = path.join(dir, 'credentials');
  fs.writeFileSync(
    credentialsFile,
    '[default]\naws_access_key_id=shared-access\naws_secret_access_key=shared-secret\n',
  );
  restore = mockProcessEnv(
    {
      AWS_ACCESS_KEY_ID: 'host-access',
      AWS_SECRET_ACCESS_KEY: 'host-secret',
      AWS_CONFIG_FILE: path.join(dir, 'empty-config'),
      AWS_SHARED_CREDENTIALS_FILE: credentialsFile,
      AWS_EC2_METADATA_DISABLED: 'true',
    },
    { clear: true },
  );
  auth = [];
  const handle = async (request: HttpRequest) => {
    const header =
      Object.entries(request.headers).find(
        ([name]) => name.toLowerCase() === 'authorization',
      )?.[1] ?? '';
    auth.push(
      header.startsWith('Bearer ') ? header : `SigV4 ${header.match(/Credential=([^/]+)/)?.[1]}`,
    );
    return {
      response: {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(JSON.stringify({ invocationArn, status: 'Completed' })),
      },
    };
  };
  vi.spyOn(NodeHttpHandler.prototype, 'handle').mockImplementation(handle);
  vi.spyOn(NodeHttp2Handler.prototype, 'handle').mockImplementation(handle);
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network request'));
});

afterEach(() => {
  restore();
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function nativeRequests(configuredKeys: boolean) {
  const client = new BedrockRuntimeClient({
    region: 'us-east-1',
    ...(configuredKeys ? { credentials: explicitKeys } : {}),
  });
  try {
    await client.send(
      new StartAsyncInvokeCommand({
        modelId: 'fixture',
        modelInput: {},
        outputDataConfig: { s3OutputDataConfig: { s3Uri: 's3://fixture-bucket/output' } },
      }),
    );
    await client.send(new GetAsyncInvokeCommand({ invocationArn }));
  } finally {
    client.destroy();
  }
}

async function providerRequests(
  kind: string,
  configuredKeys: boolean,
  bearerSource?: string,
  expectedError?: string,
) {
  const options = {
    config: {
      region: 'us-east-1',
      s3OutputUri: 's3://fixture-bucket/output',
      ...(configuredKeys ? explicitKeys : {}),
      ...(bearerSource === 'config' ? { apiKey: 'legacy-config-token' } : {}),
    },
    env:
      bearerSource === 'provider'
        ? { AWS_BEARER_TOKEN_BEDROCK: 'legacy-provider-token' }
        : undefined,
  };
  const provider =
    kind === 'nova-reel'
      ? new NovaReelVideoProvider('amazon.nova-reel-v1:1', options)
      : new LumaRayVideoProvider('luma.ray-v2:0', options);
  const start = await Reflect.get(provider, 'startVideoGeneration').call(
    provider,
    {},
    's3://fixture-bucket/output',
  );
  const poll = await Reflect.get(provider, 'pollForCompletion').call(
    provider,
    invocationArn,
    1000,
    60_000,
  );
  if (expectedError) {
    expect(start.error).toContain(expectedError);
    expect(poll.error).toContain(expectedError);
  } else {
    expect(start).toEqual({ invocationArn });
    expect(poll).toMatchObject({ response: { invocationArn, status: 'Completed' } });
  }
}

describe('Bedrock media native authentication priority', () => {
  it.each(
    ['nova-reel', 'luma-ray'].flatMap((kind) =>
      ['file', 'suite', 'file-with-undefined-suite'].flatMap((source) =>
        ['explicit', 'ambient-complete', 'ambient-incomplete'].flatMap((keys) =>
          ['scoped-token', ''].flatMap((token) =>
            [undefined, 'host-token'].map((hostToken) => ({
              kind,
              source,
              keys,
              token,
              hostToken,
            })),
          ),
        ),
      ),
    ),
  )(
    'matches the ambient SDK for $kind $source token=$token and $keys keys with host token=$hostToken',
    async ({ kind, source, keys, token, hostToken }) => {
      mockProcessEnv({
        AWS_BEARER_TOKEN_BEDROCK: hostToken,
        ...(keys === 'ambient-incomplete' ? { AWS_SECRET_ACCESS_KEY: undefined } : {}),
      });
      const restoreToken = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: token });
      let nativeError: string | undefined;
      try {
        await nativeRequests(keys === 'explicit');
      } catch (error) {
        nativeError = error instanceof Error ? error.message : String(error);
      } finally {
        restoreToken();
      }
      const expected = [...auth];
      auth = [];
      const scoped = { AWS_BEARER_TOKEN_BEDROCK: token };
      const run = () => providerRequests(kind, keys === 'explicit', undefined, nativeError);
      await (source === 'file'
        ? cliState.withEnvFileOverrides(scoped, run)
        : source === 'suite'
          ? cliState.withEnv(scoped, run)
          : cliState.withEnvFileOverrides(scoped, () =>
              cliState.withEnv({ AWS_BEARER_TOKEN_BEDROCK: undefined }, run),
            ));
      expect(auth).toEqual(expected);
      expect(process.env.AWS_BEARER_TOKEN_BEDROCK).toBe(hostToken);
      if (token) {
        expect(nativeError).toBeUndefined();
        expect(auth).toEqual(['Bearer scoped-token', 'Bearer scoped-token']);
      } else {
        expect(nativeError).toContain('token');
        expect(auth).toEqual([]);
      }
    },
  );

  it.each(
    ['nova-reel', 'luma-ray'].flatMap((kind) =>
      ['config', 'provider'].flatMap((source) =>
        [false, true].flatMap((configuredKeys) =>
          [undefined, 'host-token'].map((hostToken) => ({
            kind,
            source,
            configuredKeys,
            hostToken,
          })),
        ),
      ),
    ),
  )(
    'retains $kind legacy $source bearer behavior with configured keys=$configuredKeys and host token=$hostToken',
    async ({ kind, source, configuredKeys, hostToken }) => {
      mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: hostToken });
      await nativeRequests(configuredKeys);
      const expected = [...auth];
      auth = [];
      await providerRequests(kind, configuredKeys, source);
      expect(auth).toEqual(expected);
      expect(auth).toHaveLength(2);
      expect(auth).not.toContain('Bearer legacy-config-token');
      expect(auth).not.toContain('Bearer legacy-provider-token');
    },
  );
});
