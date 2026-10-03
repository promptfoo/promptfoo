import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import {
  BedrockRuntimeClient,
  InvokeModelWithBidirectionalStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { NodeHttp2Handler } from '@smithy/node-http-handler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import { NovaSonicProvider } from '../../../src/providers/bedrock/nova-sonic';
import { mockProcessEnv } from '../../util/utils';
import type { HttpRequest } from '@smithy/types';

let dir: string;
let restore: () => void;
let authorizations: string[];
const clients: BedrockRuntimeClient[] = [];
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-sonic-auth-'));
  const file = path.join(dir, 'credentials');
  fs.writeFileSync(
    file,
    '[default]\naws_access_key_id=default-access\naws_secret_access_key=default-secret\n[selected]\naws_access_key_id=profile-access\naws_secret_access_key=profile-secret\n',
  );
  restore = mockProcessEnv(
    {
      AWS_ACCESS_KEY_ID: 'host-access',
      AWS_SECRET_ACCESS_KEY: 'host-secret',
      AWS_CONFIG_FILE: path.join(dir, 'config'),
      AWS_SHARED_CREDENTIALS_FILE: file,
      AWS_EC2_METADATA_DISABLED: 'true',
    },
    { clear: true },
  );
  authorizations = [];
  vi.spyOn(NodeHttp2Handler.prototype, 'handle').mockImplementation(
    async (request: HttpRequest) => {
      const raw =
        Object.entries(request.headers)
          .filter(([name]) => name.toLowerCase() === 'authorization')
          .at(-1)?.[1] ?? '';
      authorizations.push(
        raw.startsWith('Bearer ') ? raw : (raw.match(/Credential=([^/]+)/)?.[1] ?? 'missing'),
      );
      return {
        response: {
          statusCode: 200,
          headers: { 'content-type': 'application/vnd.amazon.eventstream' },
          body: Readable.from([]),
        },
      };
    },
  );
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected external request'));
});
afterEach(() => {
  for (const client of clients.splice(0)) {
    client.destroy();
  }
  vi.restoreAllMocks();
  restore();
  fs.rmSync(dir, { recursive: true, force: true });
});
async function send(client: BedrockRuntimeClient) {
  clients.push(client);
  try {
    await client.send(
      new InvokeModelWithBidirectionalStreamCommand({
        modelId: 'fixture',
        body: (async function* () {})(),
      }),
    );
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
async function sonic(config: object, env?: Record<string, string | undefined>) {
  const provider = new NovaSonicProvider('fixture', {
    config: { region: 'us-east-1', ...config },
    env,
  });
  return send(await Reflect.get(provider, 'getBedrockClient').call(provider));
}
function native() {
  return send(
    new BedrockRuntimeClient({ region: 'us-east-1', requestHandler: new NodeHttp2Handler() }),
  );
}

describe('Nova Sonic released command authentication', () => {
  // The service accepts SigV4, not Bedrock API keys:
  // https://docs.aws.amazon.com/bedrock/latest/userguide/models-api-compatibility.html
  // Keep the previously valid SigV4 paths; ambient SDK bearer behavior remains unchanged.
  it.each(
    ['absent', 'config', 'provider', 'ambient', 'file', 'suite', 'file-blank'].flatMap((source) =>
      ['absent', 'keys', 'profile', 'partial'].flatMap((configured) =>
        [false, true].map((shared) => ({ source, configured, shared })),
      ),
    ),
  )(
    'matches native bidirectional signing for $source, ignored config=$configured, shared=$shared',
    async ({ source, configured, shared }) => {
      mockProcessEnv({
        ...(shared ? { AWS_ACCESS_KEY_ID: undefined, AWS_SECRET_ACCESS_KEY: undefined } : {}),
        ...(source === 'ambient' || source === 'file-blank'
          ? { AWS_BEARER_TOKEN_BEDROCK: 'host-token' }
          : {}),
      });
      const config = {
        ...(source === 'config' ? { apiKey: 'ignored-config-token' } : {}),
        ...(configured === 'keys'
          ? { accessKeyId: 'ignored-access', secretAccessKey: 'ignored-secret' }
          : configured === 'profile'
            ? { profile: 'missing-sso' }
            : configured === 'partial'
              ? { profile: 'missing-sso', accessKeyId: '', secretAccessKey: '' }
              : {}),
      };
      const scoped = { AWS_BEARER_TOKEN_BEDROCK: source === 'file-blank' ? '' : 'scoped-token' };
      const hasScope = ['file', 'suite', 'file-blank'].includes(source);
      const restoreScope = hasScope ? mockProcessEnv(scoped) : () => {};
      let expectedError;
      try {
        expectedError = await native();
      } finally {
        restoreScope();
      }
      const expected = [...authorizations];
      authorizations = [];
      const run = () =>
        sonic(
          config,
          source === 'provider'
            ? { AWS_BEARER_TOKEN_BEDROCK: 'ignored-provider-token' }
            : undefined,
        );
      const actualError = await (source === 'suite'
        ? cliState.withEnv(scoped, run)
        : hasScope
          ? cliState.withEnvFileOverrides(scoped, run)
          : run());
      expect(actualError).toBe(expectedError);
      expect(authorizations).toEqual(expected);
      if (['absent', 'config', 'provider'].includes(source)) {
        expect(actualError).toBeUndefined();
        expect(authorizations).toEqual([shared ? 'default-access' : 'host-access']);
      }
      if (source === 'file-blank') {
        expect(actualError).toContain('token');
        expect(authorizations).toEqual([]);
      }
      expect(process.env.AWS_BEARER_TOKEN_BEDROCK).toBe(
        source === 'ambient' || source === 'file-blank' ? 'host-token' : undefined,
      );
    },
  );

  it.each(
    ['file', 'suite', 'provider'].flatMap((source) =>
      ['keys', 'profile', 'cleared-profile', 'cleared-keys'].map((mode) => ({ source, mode })),
    ),
  )('forwards $source $mode through the bidirectional SigV4 signer', async ({ source, mode }) => {
    if (mode === 'cleared-profile') {
      mockProcessEnv({ AWS_PROFILE: 'selected' });
    }
    const scoped =
      mode === 'keys'
        ? { AWS_ACCESS_KEY_ID: 'scoped-access', AWS_SECRET_ACCESS_KEY: 'scoped-secret' }
        : mode === 'profile'
          ? { AWS_PROFILE: 'selected' }
          : mode === 'cleared-profile'
            ? { AWS_PROFILE: '' }
            : { AWS_ACCESS_KEY_ID: '', AWS_SECRET_ACCESS_KEY: '' };
    const run = () =>
      sonic(
        {
          apiKey: 'ignored-token',
          profile: 'missing-sso',
          accessKeyId: 'ignored-access',
          secretAccessKey: 'ignored-secret',
        },
        source === 'provider' ? scoped : undefined,
      );
    const error = await (source === 'file'
      ? cliState.withEnvFileOverrides(scoped, run)
      : source === 'suite'
        ? cliState.withEnv(scoped, run)
        : run());
    expect(error).toBeUndefined();
    expect(authorizations).toEqual([
      mode === 'keys'
        ? 'scoped-access'
        : mode === 'profile'
          ? 'profile-access'
          : mode === 'cleared-profile'
            ? 'host-access'
            : 'default-access',
    ]);
    expect(process.env.AWS_ACCESS_KEY_ID).toBe('host-access');
  });
});
