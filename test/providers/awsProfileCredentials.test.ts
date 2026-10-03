import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { fromSSO } from '@aws-sdk/credential-provider-sso';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import {
  getAwsCredentialCacheNamespace,
  resolveAwsCredentials,
} from '../../src/providers/awsCredentials';
import { getScopedAwsProfileCredentials } from '../../src/providers/awsProfileCredentials';
import { AwsBedrockCompletionProvider } from '../../src/providers/bedrock';
import { mockProcessEnv } from '../util/utils';

let dir: string;
let restore: () => void;
let configFilepath: string;
let filepath: string;

const sourceKeys = {
  AWS_ACCESS_KEY_ID: 'scoped-access',
  AWS_SECRET_ACCESS_KEY: 'scoped-secret',
  AWS_SESSION_TOKEN: 'scoped-session',
};
const expiration = new Date('2100-01-01T00:00:00Z');
const assumedCredentials = {
  accessKeyId: 'assumed-access',
  secretAccessKey: 'assumed-secret',
  sessionToken: 'assumed-session',
  expiration,
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-aws-profile-'));
  configFilepath = path.join(dir, 'scoped-config');
  filepath = path.join(dir, 'scoped-credentials');
  fs.writeFileSync(filepath, '');
  restore = mockProcessEnv(
    {
      HOME: dir,
      AWS_CONFIG_FILE: path.join(dir, 'host-config'),
      AWS_SHARED_CREDENTIALS_FILE: path.join(dir, 'host-credentials'),
      AWS_EC2_METADATA_DISABLED: 'true',
      AWS_ACCESS_KEY_ID: 'host-access',
      AWS_SECRET_ACCESS_KEY: 'host-secret',
      AWS_SESSION_TOKEN: 'host-session',
    },
    { clear: true },
  );
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network access'));
});

afterEach(() => {
  restore();
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

const options = () => ({ profile: 'fixture', configFilepath, filepath, ignoreCache: true });

describe('scoped AWS profile source credentials', () => {
  it.each(
    ['suite', 'provider'].flatMap((upper) =>
      ['undefined', 'override', 'empty'].map((value) => ({ upper, value })),
    ),
  )('preserves Environment role sources with $upper $value values', async ({ upper, value }) => {
    fs.writeFileSync(
      configFilepath,
      '[profile fixture]\nrole_arn=arn:aws:iam::123456789012:role/Fixture\ncredential_source=Environment\n',
    );
    const roleAssumer = vi.fn().mockResolvedValue(assumedCredentials);
    const higher =
      value === 'override'
        ? { AWS_ACCESS_KEY_ID: 'other-access', AWS_SECRET_ACCESS_KEY: 'other-secret' }
        : {
            AWS_ACCESS_KEY_ID: value === 'empty' ? '' : undefined,
            AWS_SECRET_ACCESS_KEY: value === 'empty' ? '' : undefined,
          };
    await cliState.withEnvFileOverrides(sourceKeys, () =>
      cliState.withEnv(upper === 'suite' ? higher : undefined, async () => {
        const provider = await getScopedAwsProfileCredentials(
          { ...options(), roleAssumer },
          upper === 'provider' ? higher : undefined,
        );
        expect(provider).toBeTypeOf('function');
        if (value === 'empty') {
          await expect(provider?.()).rejects.toThrow('AWS role source credentials are incomplete');
          expect(roleAssumer).not.toHaveBeenCalled();
        } else {
          expect(await provider?.()).toEqual(assumedCredentials);
          expect(roleAssumer.mock.calls[0][0]).toMatchObject({
            accessKeyId: value === 'override' ? 'other-access' : 'scoped-access',
            sessionToken: 'scoped-session',
          });
        }
      }),
    );
  });

  it.each(['host-present', 'host-absent'])(
    'assumes a role using scoped Environment credentials with %s',
    async (hostState) => {
      const restoreKeys =
        hostState === 'host-absent'
          ? mockProcessEnv({ AWS_ACCESS_KEY_ID: undefined, AWS_SECRET_ACCESS_KEY: undefined })
          : () => {};
      fs.writeFileSync(
        configFilepath,
        '[profile fixture]\nrole_arn = arn:aws:iam::123456789012:role/Fixture\ncredential_source = Environment\nrole_session_name = fixture-session\nexternal_id = fixture-external\nduration_seconds = 1800\n',
      );
      const roleAssumer = vi.fn().mockResolvedValue(assumedCredentials);
      try {
        await cliState.withEnvFileOverrides(sourceKeys, async () => {
          const provider = await getScopedAwsProfileCredentials({ ...options(), roleAssumer });
          expect(await provider?.()).toEqual(assumedCredentials);
          expect(roleAssumer).toHaveBeenCalledWith(
            {
              accessKeyId: 'scoped-access',
              secretAccessKey: 'scoped-secret',
              sessionToken: 'scoped-session',
            },
            {
              RoleArn: 'arn:aws:iam::123456789012:role/Fixture',
              RoleSessionName: 'fixture-session',
              ExternalId: 'fixture-external',
              DurationSeconds: 1800,
            },
          );
          expect(process.env.AWS_ACCESS_KEY_ID).toBe(
            hostState === 'host-absent' ? undefined : 'host-access',
          );
        });
      } finally {
        restoreKeys();
      }
    },
  );

  it('preserves per-key host defaults and clears a blank optional session token', async () => {
    fs.writeFileSync(
      configFilepath,
      '[profile fixture]\nrole_arn = arn:aws:iam::123456789012:role/Fixture\ncredential_source = Environment\n',
    );
    const roleAssumer = vi.fn().mockResolvedValue(assumedCredentials);
    const provider = await getScopedAwsProfileCredentials(
      { ...options(), roleAssumer },
      { AWS_ACCESS_KEY_ID: 'scoped-access', AWS_SESSION_TOKEN: '  ' },
    );
    await provider?.();
    expect(roleAssumer.mock.calls[0][0]).toEqual({
      accessKeyId: 'scoped-access',
      secretAccessKey: 'host-secret',
      sessionToken: undefined,
    });
  });

  it('clears an ambient profile when the scoped profile is explicitly blank', async () => {
    const restoreProfile = mockProcessEnv({ AWS_PROFILE: 'host' });
    fs.writeFileSync(
      configFilepath,
      '[default]\nrole_arn = arn:aws:iam::123456789012:role/Default\ncredential_source = Environment\n[profile host]\nrole_arn = arn:aws:iam::123456789012:role/Host\ncredential_source = Environment\n',
    );
    const roleAssumer = vi.fn().mockResolvedValue(assumedCredentials);
    try {
      const provider = await getScopedAwsProfileCredentials(
        { ...options(), profile: '', roleAssumer },
        sourceKeys,
      );
      await provider?.();
      expect(roleAssumer.mock.calls[0][1].RoleArn).toBe('arn:aws:iam::123456789012:role/Default');
      expect(process.env.AWS_PROFILE).toBe('host');
    } finally {
      restoreProfile();
    }
  });

  it('rejects incomplete selected source credentials before attempting STS', async () => {
    fs.writeFileSync(
      configFilepath,
      '[profile fixture]\nrole_arn = arn:aws:iam::123456789012:role/Fixture\ncredential_source = Environment\n',
    );
    const roleAssumer = vi.fn();
    const provider = await getScopedAwsProfileCredentials(
      { ...options(), roleAssumer },
      { AWS_SECRET_ACCESS_KEY: '' },
    );
    await expect(provider?.()).rejects.toThrow('AWS role source credentials are incomplete');
    expect(roleAssumer).not.toHaveBeenCalled();
  });

  it('preserves nested source profiles and MFA with an Environment leaf without role_arn', async () => {
    fs.writeFileSync(
      configFilepath,
      '[profile fixture]\nrole_arn = arn:aws:iam::123456789012:role/Outer\nsource_profile = inner\nmfa_serial = fixture-mfa\nrole_session_name = outer-session\n[profile inner]\nrole_arn = arn:aws:iam::123456789012:role/Inner\nsource_profile = source\nrole_session_name = inner-session\n[profile source]\ncredential_source = Environment\n',
    );
    const innerCredentials = { ...assumedCredentials, accessKeyId: 'inner-access' };
    const roleAssumer = vi
      .fn()
      .mockResolvedValueOnce(innerCredentials)
      .mockResolvedValueOnce(assumedCredentials);
    const mfaCodeProvider = vi.fn().mockResolvedValue('123456');
    const provider = await getScopedAwsProfileCredentials(
      { ...options(), roleAssumer, mfaCodeProvider },
      sourceKeys,
    );
    expect(await provider?.()).toEqual(assumedCredentials);
    expect(roleAssumer.mock.calls[0][0].accessKeyId).toBe('scoped-access');
    expect(roleAssumer.mock.calls[1]).toEqual([
      innerCredentials,
      expect.objectContaining({
        RoleArn: 'arn:aws:iam::123456789012:role/Outer',
        RoleSessionName: 'outer-session',
        SerialNumber: 'fixture-mfa',
        TokenCode: '123456',
      }),
    ]);
    expect(mfaCodeProvider).toHaveBeenCalledWith('fixture-mfa');
  });

  it('requires an MFA callback before assuming a selected role that requires MFA', async () => {
    fs.writeFileSync(
      configFilepath,
      '[profile fixture]\nrole_arn = arn:aws:iam::123456789012:role/Fixture\ncredential_source = Environment\nmfa_serial = fixture-mfa\n',
    );
    const roleAssumer = vi.fn();
    const provider = await getScopedAwsProfileCredentials(
      { ...options(), roleAssumer },
      sourceKeys,
    );
    await expect(provider?.()).rejects.toThrow('requires an MFA code provider');
    expect(roleAssumer).not.toHaveBeenCalled();
  });

  it('uses the real SDK STS assumer with the calling client region and local transport', async () => {
    fs.writeFileSync(
      configFilepath,
      '[profile fixture]\nrole_arn = arn:aws:iam::123456789012:role/Fixture\ncredential_source = Environment\n',
    );
    const handle = vi.fn().mockResolvedValue({
      response: {
        statusCode: 200,
        headers: { 'content-type': 'text/xml' },
        body: Buffer.from(
          '<AssumeRoleResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/"><AssumeRoleResult><Credentials><AccessKeyId>assumed-access</AccessKeyId><SecretAccessKey>assumed-secret</SecretAccessKey><SessionToken>assumed-session</SessionToken><Expiration>2100-01-01T00:00:00Z</Expiration></Credentials></AssumeRoleResult></AssumeRoleResponse>',
        ),
      },
    });
    const provider = await getScopedAwsProfileCredentials(
      { ...options(), clientConfig: { requestHandler: { handle }, maxAttempts: 1 } },
      sourceKeys,
    );
    expect(
      await provider?.({ callerClientConfig: { region: async () => 'eu-west-1' } }),
    ).toMatchObject(assumedCredentials);
    expect(handle).toHaveBeenCalledOnce();
    expect(handle.mock.calls[0][0].hostname).toBe('sts.eu-west-1.amazonaws.com');
    expect(handle.mock.calls[0][0].headers.authorization).toContain('Credential=scoped-access/');
  });

  it('resolves the scoped Environment role source through the actual Bedrock provider', async () => {
    fs.writeFileSync(
      configFilepath,
      '[profile fixture]\nrole_arn = arn:aws:iam::123456789012:role/Fixture\ncredential_source = Environment\n',
    );
    const handle = vi.spyOn(NodeHttpHandler.prototype, 'handle').mockResolvedValue({
      response: {
        statusCode: 200,
        headers: { 'content-type': 'text/xml' },
        body: Buffer.from(
          '<AssumeRoleResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/"><AssumeRoleResult><Credentials><AccessKeyId>assumed-access</AccessKeyId><SecretAccessKey>assumed-secret</SecretAccessKey><SessionToken>assumed-session</SessionToken><Expiration>2100-01-01T00:00:00Z</Expiration></Credentials></AssumeRoleResult></AssumeRoleResponse>',
        ),
      },
    });
    const provider = new AwsBedrockCompletionProvider('fixture', {
      config: { region: 'eu-west-1' },
      env: {
        ...sourceKeys,
        AWS_PROFILE: 'fixture',
        AWS_CONFIG_FILE: configFilepath,
        AWS_SHARED_CREDENTIALS_FILE: filepath,
      },
    });
    const client = await provider.getBedrockInstance();
    try {
      expect(await client.config.credentials()).toMatchObject(assumedCredentials);
      expect(handle).toHaveBeenCalledOnce();
      expect(handle.mock.calls[0][0].hostname).toBe('sts.eu-west-1.amazonaws.com');
      expect(handle.mock.calls[0][0].headers.authorization).toContain('Credential=scoped-access/');
      expect(process.env.AWS_ACCESS_KEY_ID).toBe('host-access');
    } finally {
      client.destroy();
    }
  });

  it.each([
    'aws_access_key_id = profile-access\naws_secret_access_key = profile-secret',
    'credential_process = fixture-command',
    'role_arn = arn:aws:iam::123456789012:role/Fixture\nweb_identity_token_file = /fixture/token',
    'role_arn = arn:aws:iam::123456789012:role/Fixture\ncredential_source = Ec2InstanceMetadata',
    'role_arn = arn:aws:iam::123456789012:role/Fixture\nsource_profile = fixture',
  ])('leaves ordinary SDK profile resolution unchanged for %s', async (profileData) => {
    fs.writeFileSync(configFilepath, `[profile fixture]\n${profileData}\n`);
    expect(await getScopedAwsProfileCredentials(options(), sourceKeys)).toBeUndefined();
  });

  it('keeps nested static credentials ahead of source-profile role and SSO fields', async () => {
    fs.writeFileSync(
      configFilepath,
      '[profile fixture]\nrole_arn = arn:aws:iam::123456789012:role/Fixture\nsource_profile = source\n[profile source]\naws_access_key_id = profile-access\naws_secret_access_key = profile-secret\nrole_arn = arn:aws:iam::123456789012:role/Source\ncredential_source = Environment\nsso_start_url = https://fixture.awsapps.com/start\n',
    );
    expect(await getScopedAwsProfileCredentials(options(), sourceKeys)).toBeUndefined();
  });
});

describe('scoped SSO profile files with the installed AWS SDK', () => {
  it.each([
    { accessKeyId: '', secretAccessKey: '' },
    { sessionToken: '' },
    { accessKeyId: 'partial' },
    { secretAccessKey: 'partial', sessionToken: 'leftover' },
  ])('retains configured SSO fallback with incomplete static fields %j', async (staticConfig) => {
    const startUrl = 'https://fixture.awsapps.com/start';
    fs.writeFileSync(
      configFilepath,
      `[profile fixture]\nsso_account_id=123456789012\nsso_role_name=FixtureRole\nsso_start_url=${startUrl}\nsso_region=us-east-1\n`,
    );
    const cacheDir = path.join(dir, '.aws', 'sso', 'cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(cacheDir, `${createHash('sha1').update(startUrl).digest('hex')}.json`),
      JSON.stringify({
        startUrl,
        region: 'us-east-1',
        accessToken: 'fixture-sso-token',
        expiresAt: expiration.toISOString(),
      }),
    );
    const handle = vi.spyOn(NodeHttpHandler.prototype, 'handle').mockResolvedValue({
      response: {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(
          JSON.stringify({
            roleCredentials: { ...assumedCredentials, expiration: expiration.getTime() },
          }),
        ),
      },
    });
    const native = fromSSO(options());
    const actual = await resolveAwsCredentials(
      { profile: 'fixture', ...staticConfig },
      {
        AWS_CONFIG_FILE: configFilepath,
        AWS_SHARED_CREDENTIALS_FILE: filepath,
      },
    );
    expect(typeof actual).toBe('function');
    expect(await (actual as () => Promise<unknown>)()).toEqual(await native());
    expect(handle).toHaveBeenCalledTimes(2);
    const explicit = await resolveAwsCredentials({
      profile: 'fixture',
      accessKeyId: 'configured-access',
      secretAccessKey: 'configured-secret',
    });
    expect(explicit).toMatchObject({
      accessKeyId: 'configured-access',
      secretAccessKey: 'configured-secret',
    });
    expect(handle).toHaveBeenCalledTimes(2);
  });
  it.each(['legacy', 'session'])(
    'keeps scoped config and credential files for a %s SSO profile and nested role',
    async (kind) => {
      const startUrl = 'https://fixture.awsapps.com/start';
      const sso =
        kind === 'session'
          ? 'sso_session = fixture-session\nsso_account_id = 123456789012\nsso_role_name = FixtureRole\n[sso-session fixture-session]\nsso_start_url = https://fixture.awsapps.com/start\nsso_region = us-east-1\n'
          : 'sso_account_id = 123456789012\nsso_role_name = FixtureRole\nsso_start_url = https://fixture.awsapps.com/start\nsso_region = us-east-1\n';
      fs.writeFileSync(
        configFilepath,
        `[profile fixture]\nrole_arn = arn:aws:iam::123456789012:role/Outer\nsource_profile = scoped-sso\n[profile scoped-sso]\n${sso}`,
      );
      const cacheDir = path.join(dir, '.aws', 'sso', 'cache');
      fs.mkdirSync(cacheDir, { recursive: true });
      const tokenId = kind === 'session' ? 'fixture-session' : startUrl;
      fs.writeFileSync(
        path.join(cacheDir, `${createHash('sha1').update(tokenId).digest('hex')}.json`),
        JSON.stringify({
          startUrl,
          region: 'us-east-1',
          accessToken: 'fixture-sso-token',
          expiresAt: expiration.toISOString(),
        }),
      );
      const handle = vi.fn().mockResolvedValue({
        response: {
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body: Buffer.from(
            JSON.stringify({
              roleCredentials: { ...assumedCredentials, expiration: expiration.getTime() },
            }),
          ),
        },
      });
      const roleAssumer = vi
        .fn()
        .mockResolvedValue({ ...assumedCredentials, accessKeyId: 'outer-access' });
      const settings = {
        ...options(),
        roleAssumer,
        clientConfig: { requestHandler: { handle }, maxAttempts: 1 },
      };
      const nested = await getScopedAwsProfileCredentials(settings);
      expect((await nested?.())?.accessKeyId).toBe('outer-access');
      expect(roleAssumer.mock.calls[0][0]).toMatchObject(assumedCredentials);
      const direct = await getScopedAwsProfileCredentials({ ...settings, profile: 'scoped-sso' });
      expect(await direct?.()).toMatchObject(assumedCredentials);
      fs.writeFileSync(configFilepath, `[default]\n${sso}`);
      const defaultProfile = await getScopedAwsProfileCredentials({
        ...settings,
        profile: undefined,
      });
      expect(await defaultProfile?.()).toMatchObject(assumedCredentials);
      vi.spyOn(NodeHttpHandler.prototype, 'handle').mockImplementation(handle);
      const filesOnly = {
        AWS_CONFIG_FILE: configFilepath,
        AWS_SHARED_CREDENTIALS_FILE: filepath,
      };
      const ambient = new AwsBedrockCompletionProvider('fixture', {
        config: { region: 'us-east-1' },
        env: filesOnly,
      });
      const ambientClient = await ambient.getBedrockInstance();
      try {
        expect((await ambientClient.config.credentials()).accessKeyId).toBe('host-access');
        expect(handle).toHaveBeenCalledTimes(3);
        expect(getAwsCredentialCacheNamespace({}, filesOnly)).toBeUndefined();
        expect(Reflect.get(ambient, 'responseCacheNamespace')).toBeUndefined();
      } finally {
        ambientClient.destroy();
      }
      const bedrock = new AwsBedrockCompletionProvider('fixture', {
        config: { region: 'us-east-1' },
        env: {
          AWS_PROFILE: 'default',
          AWS_CONFIG_FILE: configFilepath,
          AWS_SHARED_CREDENTIALS_FILE: filepath,
        },
      });
      const client = await bedrock.getBedrockInstance();
      try {
        expect(await client.config.credentials()).toMatchObject(assumedCredentials);
      } finally {
        client.destroy();
      }
      expect(handle).toHaveBeenCalledTimes(4);
      const restoreKeys = mockProcessEnv({
        AWS_ACCESS_KEY_ID: undefined,
        AWS_SECRET_ACCESS_KEY: undefined,
      });
      const webTokenFile = path.join(dir, 'web-token');
      fs.writeFileSync(webTokenFile, 'fixture-web-token');
      try {
        const ssoBeforeWeb = new AwsBedrockCompletionProvider('fixture', {
          config: { region: 'us-east-1' },
          env: {
            ...filesOnly,
            AWS_WEB_IDENTITY_TOKEN_FILE: webTokenFile,
            AWS_ROLE_ARN: 'arn:aws:iam::123456789012:role/WebIdentity',
          },
        });
        const selected = await ssoBeforeWeb.getBedrockInstance();
        try {
          expect(await selected.config.credentials()).toMatchObject(assumedCredentials);
        } finally {
          selected.destroy();
        }
        expect(handle).toHaveBeenCalledTimes(5);
      } finally {
        restoreKeys();
      }
      for (const [request] of handle.mock.calls) {
        expect(request.query).toMatchObject({
          account_id: '123456789012',
          role_name: 'FixtureRole',
        });
        expect(request.headers['x-amz-sso_bearer_token']).toBe('fixture-sso-token');
      }
      expect(process.env.AWS_CONFIG_FILE).toBe(path.join(dir, 'host-config'));
    },
  );

  it('surfaces selected SSO errors instead of resolving an ambient host identity', async () => {
    fs.writeFileSync(
      configFilepath,
      '[profile fixture]\nsso_start_url = https://fixture.awsapps.com/start\n',
    );
    const provider = await getScopedAwsProfileCredentials(options());
    await expect(provider?.()).rejects.toThrow('invalid SSO credentials');
  });
});
