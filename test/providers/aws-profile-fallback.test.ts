import fs from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { AddressInfo } from 'node:net';

import { NodeHttpHandler } from '@smithy/node-http-handler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getScopedAwsProfileCredentials } from '../../src/providers/awsProfileCredentials';
import { AwsBedrockCompletionProvider } from '../../src/providers/bedrock';
import { mockProcessEnv } from '../util/utils';
import type { HttpRequest } from '@smithy/types';

const require = createRequire(import.meta.url);
const clientRequire = createRequire(require.resolve('@aws-sdk/client-bedrock-runtime'));
const nodeRequire = createRequire(clientRequire.resolve('@aws-sdk/credential-provider-node'));
const { defaultProvider } = nodeRequire('@aws-sdk/credential-provider-node');
const { fromIni } = nodeRequire('@aws-sdk/credential-provider-ini');
const { fromProcess } = nodeRequire('@aws-sdk/credential-provider-process');
const expiration = new Date('2100-01-01T00:00:00Z');
const credential = (label: string) => ({
  accessKeyId: `${label}-access`,
  secretAccessKey: 'fixture-secret',
  sessionToken: 'fixture-session',
  expiration,
});
let dir: string;
let configFilepath: string;
let filepath: string;
let restore: () => void;
let actions: string[];
let hosts: string[];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-profile-fallback-'));
  configFilepath = path.join(dir, 'config');
  filepath = path.join(dir, 'credentials');
  fs.writeFileSync(filepath, '');
  fs.writeFileSync(path.join(dir, 'token'), 'synthetic-web-token');
  fs.writeFileSync(
    configFilepath,
    '[profile fixture]\nrole_arn=arn:aws:iam::111111111111:role/Profile\ncredential_source=Environment\n',
  );
  restore = mockProcessEnv(
    {
      // credential_process launches the real shell; retain only its OS inputs.
      ComSpec: process.env.ComSpec,
      SystemRoot: process.env.SystemRoot,
      PATH: process.env.PATH,
      HOME: dir,
      AWS_PROFILE: 'fixture',
      AWS_CONFIG_FILE: configFilepath,
      AWS_SHARED_CREDENTIALS_FILE: filepath,
      AWS_WEB_IDENTITY_TOKEN_FILE: path.join(dir, 'token'),
      AWS_ROLE_ARN: 'arn:aws:iam::222222222222:role/Web',
      AWS_EC2_METADATA_DISABLED: 'true',
    },
    { clear: true },
  );
  actions = [];
  hosts = [];
  vi.spyOn(NodeHttpHandler.prototype, 'handle').mockImplementation(async (request: HttpRequest) => {
    const params = new URLSearchParams(String(request.body));
    const action = params.get('Action')!;
    actions.push(action);
    hosts.push(request.hostname);
    expect(action).toBe('AssumeRoleWithWebIdentity');
    return {
      response: {
        statusCode: 200,
        headers: { 'content-type': 'text/xml' },
        body: Buffer.from(
          '<AssumeRoleWithWebIdentityResponse><AssumeRoleWithWebIdentityResult><Credentials>' +
            '<AccessKeyId>web-access</AccessKeyId><SecretAccessKey>fixture-secret</SecretAccessKey>' +
            `<SessionToken>fixture-session</SessionToken><Expiration>${expiration.toISOString()}</Expiration>` +
            '</Credentials></AssumeRoleWithWebIdentityResult></AssumeRoleWithWebIdentityResponse>',
        ),
      },
    };
  });
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network access'));
});

afterEach(() => {
  restore();
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

const options = () => ({ profile: 'fixture', configFilepath, filepath, ignoreCache: true });

describe('scoped AWS profile fallback', () => {
  it.each(['token-only', 'cleared-host-secret'])(
    'matches native web identity fallback for %s without restoring host credentials',
    async (mode) => {
      if (mode === 'cleared-host-secret') {
        mockProcessEnv({ AWS_ACCESS_KEY_ID: 'host-access', AWS_SECRET_ACCESS_KEY: 'host-secret' });
      }
      const env =
        mode === 'token-only'
          ? { AWS_SESSION_TOKEN: 'scoped-session' }
          : { AWS_SECRET_ACCESS_KEY: '' };
      const restoreScoped = mockProcessEnv(env);
      try {
        // A profile-only provider stops here; the SDK's default chain must continue.
        await expect(fromIni(options())()).rejects.toMatchObject({ tryNextLink: true });
        expect(
          await defaultProvider(options())({ callerClientConfig: { region: 'eu-west-1' } }),
        ).toMatchObject(credential('web'));
      } finally {
        restoreScoped();
      }
      const client = await new AwsBedrockCompletionProvider('fixture', {
        config: { region: 'eu-west-1' },
        env,
      }).getBedrockInstance();
      try {
        const [first, concurrent] = await Promise.all([
          client.config.credentials(),
          client.config.credentials(),
        ]);
        expect(first).toMatchObject(credential('web'));
        expect(concurrent).toEqual(first);
        expect(await client.config.credentials()).toEqual(first);
        expect(actions).toHaveLength(2); // native baseline plus one memoized scoped request
        await client.config.credentials({ forceRefresh: true });
        expect(actions).toHaveLength(3);
        expect(actions).toEqual(Array(3).fill('AssumeRoleWithWebIdentity'));
        expect(hosts).toEqual(Array(3).fill('sts.eu-west-1.amazonaws.com'));
      } finally {
        client.destroy();
      }
      expect(process.env.AWS_SECRET_ACCESS_KEY).toBe(
        mode === 'cleared-host-secret' ? 'host-secret' : undefined,
      );
    },
  );

  it('retains process-before-web ordering after an unavailable role source', async () => {
    const script = path.join(dir, 'credentials.cjs');
    fs.writeFileSync(
      script,
      `process.stdout.write(JSON.stringify({Version:1,AccessKeyId:'process-access',SecretAccessKey:'fixture-secret'}));`,
    );
    fs.appendFileSync(
      configFilepath,
      `credential_process=${JSON.stringify(process.execPath.replaceAll('\\', '/'))} ${JSON.stringify(script.replaceAll('\\', '/'))}\n`,
    );
    // Check the fixture directly so a shell failure cannot hide as web fallback.
    expect(await fromProcess(options())()).toMatchObject({ accessKeyId: 'process-access' });
    expect(await defaultProvider(options())()).toMatchObject({ accessKeyId: 'process-access' });
    const provider = await getScopedAwsProfileCredentials(options(), {
      AWS_SESSION_TOKEN: 'scoped',
    });
    expect(await provider?.()).toMatchObject({ accessKeyId: 'process-access' });
    expect(actions).toEqual([]);
  });

  it.each(['imds', 'ecs'])(
    'retains native %s fallback after an unavailable role source',
    async (remote) => {
      const requests: string[] = [];
      const metadata = JSON.stringify({
        AccessKeyId: 'metadata-access',
        SecretAccessKey: 'fixture-secret',
        Token: 'fixture-session',
        Expiration: expiration.toISOString(),
      });
      const server = createServer((request, response) => {
        requests.push(request.url!);
        if (request.url === '/latest/api/token') {
          response.end('fixture-imds-token');
        } else if (request.url === '/latest/meta-data/iam/security-credentials/') {
          response.end('fixture-role');
        } else {
          response.end(metadata);
        }
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      mockProcessEnv({
        AWS_WEB_IDENTITY_TOKEN_FILE: undefined,
        AWS_ROLE_ARN: undefined,
        AWS_EC2_METADATA_DISABLED: remote === 'imds' ? 'false' : 'true',
        AWS_EC2_METADATA_SERVICE_ENDPOINT: endpoint,
        ...(remote === 'ecs' ? { AWS_CONTAINER_CREDENTIALS_FULL_URI: `${endpoint}/ecs` } : {}),
      });
      // Metadata providers use both SDK HTTP handlers and node:http. Restrict
      // the former to this local fixture as well.
      vi.mocked(NodeHttpHandler.prototype.handle).mockImplementation(async (request) => {
        expect(request.hostname).toBe('127.0.0.1');
        requests.push(request.path);
        return { response: { statusCode: 200, headers: {}, body: Readable.from([metadata]) } };
      });
      try {
        expect(await defaultProvider(options())()).toMatchObject({
          accessKeyId: 'metadata-access',
        });
        const provider = await getScopedAwsProfileCredentials(options(), {
          AWS_SESSION_TOKEN: 'scoped',
        });
        expect(await provider?.()).toMatchObject({ accessKeyId: 'metadata-access' });
        expect(
          requests.filter(
            (url) =>
              url ===
              (remote === 'ecs'
                ? '/ecs'
                : '/latest/meta-data/iam/security-credentials/fixture-role'),
          ),
        ).toHaveLength(2);
      } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    },
  );

  it('retains native fallthrough when a reloaded profile introduces a cycle', async () => {
    const provider = await getScopedAwsProfileCredentials(options(), {
      AWS_SESSION_TOKEN: 'scoped',
    });
    fs.writeFileSync(
      configFilepath,
      '[profile fixture]\nrole_arn=arn:aws:iam::111111111111:role/Outer\nsource_profile=inner\n' +
        '[profile inner]\nrole_arn=arn:aws:iam::111111111111:role/Inner\nsource_profile=fixture\n',
    );
    await expect(fromIni(options())()).rejects.toMatchObject({ tryNextLink: true });
    const properties = { callerClientConfig: { region: 'eu-west-1' } };
    expect(await defaultProvider(options())(properties)).toMatchObject(credential('web'));
    expect(await provider?.(properties)).toMatchObject(credential('web'));
    expect(actions).toEqual(['AssumeRoleWithWebIdentity', 'AssumeRoleWithWebIdentity']);
  });

  it.each(['sts', 'sso', 'mfa', 'mfa-rejection', 'malformed-source'])(
    'keeps %s errors terminal despite available web identity credentials',
    async (mode) => {
      if (mode === 'sso') {
        fs.writeFileSync(
          configFilepath,
          '[profile fixture]\nsso_start_url=https://fixture.awsapps.com/start\n',
        );
      } else if (mode.startsWith('mfa')) {
        fs.appendFileSync(configFilepath, 'mfa_serial=fixture-mfa\n');
      }
      const roleAssumer = vi.fn().mockRejectedValue(new Error('fixture STS denied'));
      const env = mode.startsWith('mfa')
        ? { AWS_SESSION_TOKEN: 'scoped' }
        : {
            AWS_ACCESS_KEY_ID: mode === 'malformed-source' ? ' ' : 'scoped-access',
            AWS_SECRET_ACCESS_KEY: 'scoped-secret',
          };
      const mfaCodeProvider = vi.fn().mockRejectedValue(new Error('fixture MFA rejected'));
      const provider = await getScopedAwsProfileCredentials(
        { ...options(), roleAssumer, ...(mode === 'mfa-rejection' ? { mfaCodeProvider } : {}) },
        env,
      );
      const expected: Record<string, string> = {
        sts: 'fixture STS denied',
        sso: 'invalid SSO credentials',
        mfa: 'requires an MFA code provider',
        'mfa-rejection': 'fixture MFA rejected',
        'malformed-source': 'AWS role source credentials are incomplete',
      };
      const result = provider?.();
      await expect(result).rejects.toThrow(expected[mode]);
      if (mode === 'mfa') {
        await expect(result).rejects.toMatchObject({
          name: 'CredentialsProviderError',
          tryNextLink: false,
        });
      }
      expect(mfaCodeProvider).toHaveBeenCalledTimes(mode === 'mfa-rejection' ? 1 : 0);
      expect(roleAssumer).toHaveBeenCalledTimes(mode === 'sts' ? 1 : 0);
      expect(actions).toEqual([]);
    },
  );
});
