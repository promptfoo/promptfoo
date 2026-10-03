import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { NodeHttp2Handler, NodeHttpHandler } from '@smithy/node-http-handler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCacheEnabled } from '../../src/cache';
import cliState from '../../src/cliState';
import { getAwsCredentialCacheNamespace } from '../../src/providers/awsCredentials';
import {
  SageMakerCompletionProvider,
  SageMakerEmbeddingProvider,
} from '../../src/providers/sagemaker';
import { mockProcessEnv } from '../util/utils';
import type { HttpRequest } from '@smithy/types';

const roles = {
  first: 'arn:aws:iam::111111111111:role/First',
  second: 'arn:aws:iam::222222222222:role/Second',
  denied: 'arn:aws:iam::333333333333:role/Denied',
};
let dir: string;
let tokenFile: string;
let restore: () => void;
let assumedRoles: string[];
let endpointKeys: string[];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-web-identity-cache-'));
  tokenFile = path.join(dir, 'token');
  fs.writeFileSync(tokenFile, 'synthetic-web-token');
  fs.writeFileSync(path.join(dir, 'empty'), '');
  restore = mockProcessEnv(
    {
      HOME: dir,
      AWS_ROLE_ARN: roles.first,
      AWS_CONFIG_FILE: path.join(dir, 'empty'),
      AWS_SHARED_CREDENTIALS_FILE: path.join(dir, 'empty'),
      AWS_EC2_METADATA_DISABLED: 'true',
      PROMPTFOO_CACHE_TYPE: 'memory',
    },
    { clear: true },
  );
  assumedRoles = [];
  endpointKeys = [];
  const handle = async (request: HttpRequest) => {
    if (request.hostname.startsWith('sts.')) {
      const params = new URLSearchParams(String(request.body));
      expect(params.get('Action')).toBe('AssumeRoleWithWebIdentity');
      const role = params.get('RoleArn')!;
      assumedRoles.push(role);
      if (role === roles.denied) {
        return {
          response: {
            statusCode: 403,
            headers: { 'content-type': 'text/xml' },
            body: Buffer.from(
              '<ErrorResponse><Error><Code>AccessDenied</Code><Message>fixture role denied</Message></Error></ErrorResponse>',
            ),
          },
        };
      }
      const accessKey = role === roles.first ? 'first-access' : 'second-access';
      return {
        response: {
          statusCode: 200,
          headers: { 'content-type': 'text/xml' },
          body: Buffer.from(
            '<AssumeRoleWithWebIdentityResponse><AssumeRoleWithWebIdentityResult><Credentials>' +
              `<AccessKeyId>${accessKey}</AccessKeyId><SecretAccessKey>fixture-secret</SecretAccessKey>` +
              '<SessionToken>fixture-session</SessionToken><Expiration>2100-01-01T00:00:00Z</Expiration>' +
              '</Credentials></AssumeRoleWithWebIdentityResult></AssumeRoleWithWebIdentityResponse>',
          ),
        },
      };
    }
    expect(request.hostname).toContain('sagemaker');
    const key = request.headers.authorization.match(/Credential=([^/]+)/)?.[1]!;
    endpointKeys.push(key);
    return {
      response: {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(
          JSON.stringify({ generated_text: key, embedding: [key === 'first-access' ? 1 : 2] }),
        ),
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

describe('AWS web identity response cache isolation', () => {
  it.each(
    ['completion', 'embedding'].flatMap((kind) =>
      ['second', 'denied'].map((next) => ({ kind, next })),
    ),
  )('does not reuse $kind results for a $next ambient role', async ({ kind, next }) => {
    const invoke = async () => {
      const options = {
        config: { region: 'us-east-1', modelType: 'custom' as const },
        env: { AWS_WEB_IDENTITY_TOKEN_FILE: tokenFile },
      };
      const provider =
        kind === 'completion'
          ? new SageMakerCompletionProvider('same-endpoint', options)
          : new SageMakerEmbeddingProvider('same-endpoint', options);
      const client = await provider.getSageMakerRuntimeInstance();
      try {
        return kind === 'completion'
          ? await provider.callApi('same input')
          : await (provider as SageMakerEmbeddingProvider).callEmbeddingApi('same input');
      } finally {
        client.destroy();
      }
    };
    await withCacheEnabled(true, async () => {
      const first = await invoke();
      expect(first).toMatchObject(
        kind === 'completion' ? { output: 'first-access' } : { embedding: [1] },
      );
      expect(await invoke()).toMatchObject({ cached: true });
      mockProcessEnv({ AWS_ROLE_ARN: next === 'second' ? roles.second : roles.denied });
      const other = await invoke();
      expect(other.cached).not.toBe(true);
      if (next === 'denied') {
        expect(other.error).toContain('fixture role denied');
        expect(endpointKeys).toEqual(['first-access']);
      } else {
        expect(other).toMatchObject(
          kind === 'completion' ? { output: 'second-access' } : { embedding: [2] },
        );
        expect(await invoke()).toMatchObject({ cached: true });
        expect(endpointKeys).toEqual(['first-access', 'second-access']);
      }
      expect(assumedRoles).toEqual([roles.first, next === 'second' ? roles.second : roles.denied]);
    });
  });

  it.each(['file', 'suite', 'provider', 'empty'])(
    'keeps %s role selection ahead of ambient role changes',
    async (scope) => {
      const role = scope === 'empty' ? '' : roles.first;
      const env = {
        AWS_WEB_IDENTITY_TOKEN_FILE: tokenFile,
        ...(scope === 'provider' || scope === 'empty' ? { AWS_ROLE_ARN: role } : {}),
      };
      await cliState.withEnvFileOverrides(
        scope === 'file' ? { AWS_ROLE_ARN: role } : undefined,
        () =>
          cliState.withEnv(scope === 'suite' ? { AWS_ROLE_ARN: role } : undefined, async () => {
            const firstNamespace = getAwsCredentialCacheNamespace({}, env);
            for (const hostRole of [roles.first, roles.second]) {
              mockProcessEnv({ AWS_ROLE_ARN: hostRole });
              expect(getAwsCredentialCacheNamespace({}, env)).toBe(firstNamespace);
              const client = await new SageMakerCompletionProvider('fixture', {
                config: { region: 'us-east-1', modelType: 'custom' },
                env,
              }).getSageMakerRuntimeInstance();
              try {
                if (scope === 'empty') {
                  await expect(client.config.credentials()).rejects.toThrow();
                } else {
                  expect(await client.config.credentials()).toMatchObject({
                    accessKeyId: 'first-access',
                  });
                }
              } finally {
                client.destroy();
              }
            }
          }),
      );
      expect(assumedRoles).toEqual(scope === 'empty' ? [] : [roles.first, roles.first]);
    },
  );

  it('tracks token-file revisions and paths without changing ambient-key cache behavior', () => {
    const env = { AWS_WEB_IDENTITY_TOKEN_FILE: tokenFile };
    const first = getAwsCredentialCacheNamespace({}, env);
    expect(first).toBeDefined();
    fs.writeFileSync(`${tokenFile}.next`, 'replacement synthetic token');
    fs.renameSync(`${tokenFile}.next`, tokenFile);
    expect(getAwsCredentialCacheNamespace({}, env)).not.toBe(first);
    const otherFile = path.join(dir, 'other-token');
    fs.writeFileSync(otherFile, 'replacement synthetic token');
    expect(getAwsCredentialCacheNamespace({}, { AWS_WEB_IDENTITY_TOKEN_FILE: otherFile })).not.toBe(
      getAwsCredentialCacheNamespace({}, env),
    );
    mockProcessEnv({ AWS_ACCESS_KEY_ID: 'host-access', AWS_SECRET_ACCESS_KEY: 'host-secret' });
    expect(getAwsCredentialCacheNamespace({}, env)).toBeUndefined();
    mockProcessEnv({ AWS_ROLE_ARN: roles.second });
    expect(getAwsCredentialCacheNamespace({}, env)).toBeUndefined();
  });
});
