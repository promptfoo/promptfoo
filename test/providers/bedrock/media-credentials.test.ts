import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import { NodeHttp2Handler, NodeHttpHandler } from '@smithy/node-http-handler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import { LumaRayVideoProvider } from '../../../src/providers/bedrock/luma-ray';
import { NovaReelVideoProvider } from '../../../src/providers/bedrock/nova-reel';
import { mockProcessEnv } from '../../util/utils';
import type { HttpRequest } from '@smithy/types';

vi.mock('../../../src/blobs', () => ({
  storeBlob: async () => ({ ref: { uri: 'fixture-video', hash: 'fixture' } }),
}));
const kinds = ['nova-reel', 'luma-ray'] as const;
const methods = ['startVideoGeneration', 'pollForCompletion', 'downloadAndStoreVideo'] as const;
const invocationArn = 'arn:aws:bedrock:us-east-1:123456789012:async-invoke/fixture';
let dir: string;
let restore: () => void;
let authorizations: string[];
let destinations: string[];

beforeEach(() => {
  // These cases verify credential selection; SDK initialization time must not
  // consume the polling fixture's deadline on slower CI machines.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-media-credentials-'));
  const credentialsFile = path.join(dir, 'credentials');
  fs.writeFileSync(
    credentialsFile,
    '[default]\naws_access_key_id=default-access\naws_secret_access_key=default-secret\n[ambient]\naws_access_key_id=ambient-profile-access\naws_secret_access_key=ambient-profile-secret\n[scoped]\naws_access_key_id=scoped-profile-access\naws_secret_access_key=scoped-profile-secret\n',
  );
  fs.writeFileSync(path.join(dir, 'config'), '');
  restore = mockProcessEnv(
    {
      AWS_CONFIG_FILE: path.join(dir, 'config'),
      AWS_SHARED_CREDENTIALS_FILE: credentialsFile,
      AWS_EC2_METADATA_DISABLED: 'true',
    },
    { clear: true },
  );
  authorizations = [];
  destinations = [];
  const handle = async (request: HttpRequest) => {
    destinations.push(request.hostname);
    const authorization =
      Object.entries(request.headers)
        .filter(([name]) => name.toLowerCase() === 'authorization')
        .at(-1)?.[1] ?? '';
    authorizations.push(
      authorization.startsWith('Bearer ')
        ? 'bearer'
        : (authorization.match(/Credential=([^/]+)/)?.[1] ?? 'missing'),
    );
    return {
      response: {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: request.hostname.includes('s3')
          ? Readable.from(['fixture-video'])
          : Buffer.from(JSON.stringify({ invocationArn, status: 'Completed' })),
      },
    };
  };
  vi.spyOn(NodeHttpHandler.prototype, 'handle').mockImplementation(handle);
  vi.spyOn(NodeHttp2Handler.prototype, 'handle').mockImplementation(handle);
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected external request'));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  restore();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function invoke(
  provider: NovaReelVideoProvider | LumaRayVideoProvider,
  method: (typeof methods)[number],
) {
  const args =
    method === 'startVideoGeneration'
      ? [{}, 's3://fixture-bucket/output']
      : method === 'pollForCompletion'
        ? [invocationArn, 1, 100]
        : ['s3://fixture-bucket/output'];
  return Reflect.get(provider, method).apply(provider, args);
}
function createProvider(
  kind: (typeof kinds)[number],
  config: object,
  env?: Record<string, string>,
) {
  const options = {
    config: { region: 'us-east-1', s3OutputUri: 's3://fixture-bucket/output', ...config },
    env,
  };
  return kind === 'nova-reel'
    ? new NovaReelVideoProvider('fixture', options)
    : new LumaRayVideoProvider('fixture', options);
}

describe('released async media credential precedence', () => {
  // Counterfactual matrix verified against the actual 0.123.1 classes and SDK.
  // The SDK's native runtime bearer priority is separate from the SigV4 S3 path.
  it.each(
    kinds.flatMap((kind) =>
      methods.flatMap((method) =>
        ['absent', 'ambient', 'config', 'provider', 'file', 'suite', 'file-blank'].flatMap(
          (bearer) =>
            ['none', 'profile', 'profile-partial', 'explicit'].flatMap((configured) =>
              ['keys', 'profile', 'default'].map((ambient) => ({
                kind,
                method,
                bearer,
                configured,
                ambient,
              })),
            ),
        ),
      ),
    ),
  )(
    '$kind $method bearer=$bearer config=$configured ambient=$ambient',
    async ({ kind, method, bearer, configured, ambient }) => {
      mockProcessEnv({
        ...(ambient === 'keys'
          ? { AWS_ACCESS_KEY_ID: 'host-access', AWS_SECRET_ACCESS_KEY: 'host-secret' }
          : {}),
        ...(ambient === 'profile' ? { AWS_PROFILE: 'ambient' } : {}),
        ...(bearer === 'ambient' || bearer === 'file-blank'
          ? { AWS_BEARER_TOKEN_BEDROCK: 'fixture-bearer' }
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
        ...(bearer === 'config' ? { apiKey: 'fixture-bearer' } : {}),
      };
      const provider = createProvider(
        kind,
        config,
        bearer === 'provider' ? { AWS_BEARER_TOKEN_BEDROCK: 'provider-token' } : undefined,
      );
      const run = () => invoke(provider, method);
      const scoped = { AWS_BEARER_TOKEN_BEDROCK: bearer === 'file-blank' ? '' : 'fixture-bearer' };
      const result = await (bearer === 'file' || bearer === 'file-blank'
        ? cliState.withEnvFileOverrides(scoped, run)
        : bearer === 'suite'
          ? cliState.withEnv(scoped, run)
          : run());
      const nativeRuntimeBearer =
        method !== 'downloadAndStoreVideo' &&
        ['ambient', 'file', 'suite', 'file-blank'].includes(bearer);
      const profileBypassed = ['ambient', 'config', 'file', 'suite'].includes(bearer);
      if (nativeRuntimeBearer && bearer === 'file-blank') {
        expect(result.error).toContain('token');
        expect(authorizations).toEqual([]);
      } else if (
        !nativeRuntimeBearer &&
        ['profile', 'profile-partial'].includes(configured) &&
        !profileBypassed
      ) {
        expect(result.error).toContain('missing-sso');
        expect(authorizations).toEqual([]);
      } else {
        expect(result.error).toBeUndefined();
        expect(authorizations).toEqual([
          nativeRuntimeBearer
            ? 'bearer'
            : configured === 'explicit'
              ? 'explicit-access'
              : ambient === 'keys'
                ? 'host-access'
                : ambient === 'profile'
                  ? 'ambient-profile-access'
                  : 'default-access',
        ]);
      }
      expect(process.env.AWS_BEARER_TOKEN_BEDROCK).toBe(
        bearer === 'ambient' || bearer === 'file-blank' ? 'fixture-bearer' : undefined,
      );
    },
  );

  it.each(
    kinds.flatMap((kind) =>
      methods.flatMap((method) =>
        ['keys', 'profile', 'file', 'cleared-keys'].map((source) => ({ kind, method, source })),
      ),
    ),
  )(
    'forwards $source while bypassing configured SSO for $kind $method',
    async ({ kind, method, source }) => {
      mockProcessEnv({ AWS_ACCESS_KEY_ID: 'host-access', AWS_SECRET_ACCESS_KEY: 'host-secret' });
      const credentialsFile = path.join(dir, 'scoped-credentials');
      fs.writeFileSync(
        credentialsFile,
        '[default]\naws_access_key_id=scoped-file-access\naws_secret_access_key=scoped-file-secret\n',
      );
      const scoped =
        source === 'keys'
          ? { AWS_ACCESS_KEY_ID: 'scoped-access', AWS_SECRET_ACCESS_KEY: 'scoped-secret' }
          : source === 'profile'
            ? { AWS_PROFILE: 'scoped' }
            : source === 'file'
              ? { AWS_PROFILE: 'default', AWS_SHARED_CREDENTIALS_FILE: credentialsFile }
              : { AWS_ACCESS_KEY_ID: '', AWS_SECRET_ACCESS_KEY: '' };
      const provider = createProvider(kind, {
        apiKey: 'configured-bearer',
        profile: 'missing-sso',
      });
      const result = await cliState.withEnvFileOverrides(scoped, () => invoke(provider, method));
      expect(result.error).toBeUndefined();
      expect(authorizations).toEqual([
        source === 'keys'
          ? 'scoped-access'
          : source === 'profile'
            ? 'scoped-profile-access'
            : source === 'file'
              ? 'scoped-file-access'
              : 'default-access',
      ]);
      expect(process.env.AWS_ACCESS_KEY_ID).toBe('host-access');
    },
  );
  it.each(kinds.flatMap((kind) => methods.map((method) => ({ kind, method }))))(
    'selects the scoped service endpoint for $kind $method',
    async ({ kind, method }) => {
      const configFile = path.join(dir, 'endpoint-config');
      fs.writeFileSync(
        configFile,
        '[profile scoped]\nservices=media\n[services media]\nbedrock_runtime =\n  endpoint_url=https://bedrock.invalid\ns3 =\n  endpoint_url=https://s3.invalid\n',
      );
      const provider = createProvider(kind, {});
      const result = await cliState.withEnvFileOverrides(
        { AWS_PROFILE: 'scoped', AWS_CONFIG_FILE: configFile },
        () => invoke(provider, method),
      );
      expect(result.error).toBeUndefined();
      expect(authorizations).toEqual(['scoped-profile-access']);
      expect(destinations).toEqual([
        method === 'downloadAndStoreVideo' ? 'fixture-bucket.s3.invalid' : 'bedrock.invalid',
      ]);
    },
  );
});
