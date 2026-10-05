import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { NodeHttpHandler } from '@smithy/node-http-handler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { getScopedAwsProfileCredentials } from '../../src/providers/awsProfileCredentials';
import { AwsBedrockCompletionProvider } from '../../src/providers/bedrock';
import { mockProcessEnv } from '../util/utils';

const require = createRequire(import.meta.url);
const clientRequire = createRequire(require.resolve('@aws-sdk/client-bedrock-runtime'));
const nodeRequire = createRequire(clientRequire.resolve('@aws-sdk/credential-provider-node'));
const { fromIni } = nodeRequire('@aws-sdk/credential-provider-ini');
const { fromProcess } = nodeRequire('@aws-sdk/credential-provider-process');
let dir: string;
let configFilepath: string;
let filepath: string;
let script: string;
let restore: () => void;

const options = () => ({ profile: 'fixture', configFilepath, filepath, ignoreCache: true });
const scoped = () => ({
  AWS_PROFILE: 'fixture',
  AWS_CONFIG_FILE: configFilepath,
  AWS_SHARED_CREDENTIALS_FILE: filepath,
  FIXTURE_PROCESS_VALUE: 'scoped-value',
});
const command = () =>
  `${JSON.stringify(process.execPath.replaceAll('\\', '/'))} ${JSON.stringify(script.replaceAll('\\', '/'))}`;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-profile-process-'));
  configFilepath = path.join(dir, 'config');
  filepath = path.join(dir, 'credentials');
  script = path.join(dir, 'process.cjs');
  fs.writeFileSync(filepath, '');
  fs.writeFileSync(configFilepath, `[profile fixture]\ncredential_process=${command()}\n`);
  fs.writeFileSync(
    script,
    `process.stdout.write(JSON.stringify({Version:1,AccessKeyId:process.env.FIXTURE_PROCESS_VALUE,SecretAccessKey:'fixture-secret',SessionToken:JSON.stringify({profile:process.env.AWS_PROFILE,config:process.env.AWS_CONFIG_FILE,credentials:process.env.AWS_SHARED_CREDENTIALS_FILE})}));`,
  );
  restore = mockProcessEnv(
    {
      ComSpec: process.env.ComSpec,
      SystemRoot: process.env.SystemRoot,
      PATH: process.env.PATH,
      HOME: dir,
      AWS_PROFILE: 'host',
      AWS_CONFIG_FILE: path.join(dir, 'host-config'),
      AWS_SHARED_CREDENTIALS_FILE: path.join(dir, 'host-credentials'),
      AWS_EC2_METADATA_DISABLED: 'true',
      FIXTURE_PROCESS_VALUE: 'host-value',
    },
    { clear: true },
  );
  vi.spyOn(NodeHttpHandler.prototype, 'handle').mockRejectedValue(new Error('Unexpected network'));
});

afterEach(() => {
  restore();
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('scoped credential_process environment', () => {
  it.each(['file', 'suite', 'provider'])(
    'forwards %s variables to a real credential subprocess',
    async (scope) => {
      const run = async () => {
        const provider = new AwsBedrockCompletionProvider('fixture', {
          config: { region: 'us-east-1' },
          env: scope === 'provider' ? scoped() : undefined,
        });
        const client = await provider.getBedrockInstance();
        try {
          const credentials = await client.config.credentials();
          expect(credentials.accessKeyId).toBe('scoped-value');
          expect(JSON.parse(credentials.sessionToken!)).toEqual({
            profile: 'fixture',
            config: configFilepath,
            credentials: filepath,
          });
        } finally {
          client.destroy();
        }
      };
      if (scope === 'file') {
        await cliState.withEnvFileOverrides(scoped(), run);
      } else if (scope === 'suite') {
        await cliState.withEnv(scoped(), run);
      } else {
        await run();
      }
      expect(process.env.FIXTURE_PROCESS_VALUE).toBe('host-value');
      expect(process.env.AWS_PROFILE).toBe('host');
      expect(NodeHttpHandler.prototype.handle).not.toHaveBeenCalled();
    },
  );

  it('keeps concurrent providers isolated and preserves empty and undefined overrides', async () => {
    const values = ['first', 'second', '', undefined];
    const providers = await Promise.all(
      values.map((value) =>
        getScopedAwsProfileCredentials(options(), {
          ...scoped(),
          FIXTURE_PROCESS_VALUE: value,
        }),
      ),
    );
    const results = await Promise.all(providers.map((provider) => provider?.()));
    expect(results.map((result) => result?.accessKeyId)).toEqual([
      'first',
      'second',
      '',
      'host-value',
    ]);
    expect(process.env.FIXTURE_PROCESS_VALUE).toBe('host-value');
  });

  it('inherits lower scoped values when a provider value is undefined', async () => {
    await cliState.withEnvFileOverrides({ FIXTURE_PROCESS_VALUE: 'file-value' }, async () => {
      const provider = await getScopedAwsProfileCredentials(options(), {
        FIXTURE_PROCESS_VALUE: undefined,
      });
      expect((await provider?.())?.accessKeyId).toBe('file-value');
    });
  });

  it('forwards scoped profile alone without requiring scoped files or static credentials', async () => {
    const restoreFiles = mockProcessEnv({
      AWS_CONFIG_FILE: configFilepath,
      AWS_SHARED_CREDENTIALS_FILE: filepath,
    });
    try {
      const provider = await getScopedAwsProfileCredentials(
        { profile: 'fixture', ignoreCache: true },
        { AWS_PROFILE: 'fixture' },
      );
      expect(JSON.parse((await provider?.())!.sessionToken!).profile).toBe('fixture');
    } finally {
      restoreFiles();
    }
  });

  it.each(['profile', 'default', 'static'])(
    'preserves native %s selection with only a custom scoped variable',
    async (mode) => {
      if (mode !== 'profile') {
        fs.writeFileSync(configFilepath, `[default]\ncredential_process=${command()}\n`);
      }
      const restoreFiles = mockProcessEnv({
        AWS_PROFILE: mode === 'profile' ? 'fixture' : undefined,
        AWS_CONFIG_FILE: configFilepath,
        AWS_SHARED_CREDENTIALS_FILE: filepath,
        AWS_ACCESS_KEY_ID: mode === 'static' ? 'host-access' : undefined,
        AWS_SECRET_ACCESS_KEY: mode === 'static' ? 'host-secret' : undefined,
      });
      const provider = new AwsBedrockCompletionProvider('fixture', {
        config: { region: 'us-east-1' },
        env: { FIXTURE_PROCESS_VALUE: 'scoped-value' },
      });
      const client = await provider.getBedrockInstance();
      try {
        expect((await client.config.credentials()).accessKeyId).toBe(
          mode === 'static' ? 'host-access' : 'scoped-value',
        );
      } finally {
        client.destroy();
        restoreFiles();
      }
    },
  );

  it('keeps process source profiles and their native credential metadata when assuming roles', async () => {
    fs.writeFileSync(
      configFilepath,
      `[profile fixture]\nrole_arn=arn:aws:iam::123456789012:role/Fixture\nsource_profile=source\n[profile source]\ncredential_process=${command()}\n`,
    );
    const roleAssumer = vi.fn(async (credentials) => credentials);
    const provider = await getScopedAwsProfileCredentials({ ...options(), roleAssumer }, scoped());
    expect(await provider?.()).toMatchObject({
      accessKeyId: 'scoped-value',
      $source: { CREDENTIALS_PROCESS: 'w', CREDENTIALS_PROFILE_PROCESS: 'v' },
    });
    expect(roleAssumer).toHaveBeenCalledOnce();
  });

  it('uses scoped process fallback after an unavailable Environment source', async () => {
    fs.appendFileSync(
      configFilepath,
      'role_arn=arn:aws:iam::123456789012:role/Fixture\ncredential_source=Environment\n',
    );
    const provider = await getScopedAwsProfileCredentials(options(), {
      ...scoped(),
      AWS_SESSION_TOKEN: 'scoped-session',
    });
    expect(await provider?.()).toMatchObject({
      accessKeyId: 'scoped-value',
      $source: { CREDENTIALS_PROCESS: 'w' },
    });
  });

  it('matches native validation and metadata for supported credential output', async () => {
    const data = {
      Version: 1,
      AccessKeyId: 'fixture-access',
      SecretAccessKey: 'fixture-secret',
      SessionToken: 'fixture-session',
      Expiration: '2100-01-01T00:00:00Z',
      CredentialScope: 'fixture-scope',
      AccountId: '123456789012',
    };
    fs.writeFileSync(script, `process.stdout.write(${JSON.stringify(JSON.stringify(data))});`);
    const provider = await getScopedAwsProfileCredentials(options(), scoped());
    expect(await provider?.()).toEqual(await fromIni(options())());
  });

  it('retains profile account metadata when process output omits it', async () => {
    fs.appendFileSync(configFilepath, 'aws_account_id=123456789012\n');
    const provider = await getScopedAwsProfileCredentials(options(), scoped());
    expect(await provider?.()).toMatchObject({ accountId: '123456789012' });
  });

  it.each([
    'not-json',
    JSON.stringify({
      Version: 2,
      AccessKeyId: 'fixture-access',
      SecretAccessKey: 'fixture-secret',
    }),
    JSON.stringify({ Version: 1, AccessKeyId: 'fixture-access' }),
    JSON.stringify({
      Version: 1,
      AccessKeyId: 'fixture-access',
      SecretAccessKey: 'fixture-secret',
      Expiration: '2000-01-01T00:00:00Z',
    }),
  ])('rejects invalid process output with native fallthrough semantics: %s', async (output) => {
    fs.writeFileSync(script, `process.stdout.write(${JSON.stringify(output)});`);
    await expect(fromProcess(options())()).rejects.toMatchObject({ tryNextLink: true });
    const provider = await getScopedAwsProfileCredentials(options(), scoped());
    await expect(provider?.()).rejects.toMatchObject({
      message: 'Could not load credentials from any providers',
      tryNextLink: false,
    });
  });

  it('reloads profile changes and preserves static credentials ahead of process credentials', async () => {
    const provider = await getScopedAwsProfileCredentials(options(), scoped());
    expect((await provider?.())?.accessKeyId).toBe('scoped-value');
    fs.appendFileSync(
      configFilepath,
      'aws_access_key_id=static-access\naws_secret_access_key=static-secret\n',
    );
    expect(await provider?.()).toEqual(await fromIni(options())());
    expect((await provider?.())?.accessKeyId).toBe('static-access');
  });
});
