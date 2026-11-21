import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { NodeHttpHandler } from '@smithy/node-http-handler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { getScopedAwsProfileCredentials } from '../../src/providers/awsProfileCredentials';
import { AwsBedrockCompletionProvider } from '../../src/providers/bedrock';
import { mockProcessEnv } from '../util/utils';

import type { EnvOverrides } from '../../src/contracts/env';

let directory: string;
let restore: () => void;
let requests: Array<{ hostname: string; authorization?: string }>;
const assumed = { accessKeyId: 'assumed-access', secretAccessKey: 'assumed-secret' };

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-sts-endpoints-'));
  fs.writeFileSync(path.join(directory, 'credentials'), '');
  fs.writeFileSync(
    path.join(directory, 'host-config'),
    '[default]\nendpoint_url=https://host.invalid\n',
  );
  fs.writeFileSync(path.join(directory, 'token'), 'fixture-web-token');
  fs.writeFileSync(
    path.join(directory, 'process.cjs'),
    `process.stdout.write(JSON.stringify({Version:1,AccessKeyId:'source-access',SecretAccessKey:'source-secret'}));`,
  );
  restore = mockProcessEnv(
    {
      ComSpec: process.env.ComSpec,
      SystemRoot: process.env.SystemRoot,
      PATH: process.env.PATH,
      HOME: directory,
      AWS_CONFIG_FILE: path.join(directory, 'host-config'),
      AWS_SHARED_CREDENTIALS_FILE: path.join(directory, 'credentials'),
      AWS_ACCESS_KEY_ID: 'source-access',
      AWS_SECRET_ACCESS_KEY: 'source-secret',
      AWS_EC2_METADATA_DISABLED: 'true',
    },
    { clear: true },
  );
  requests = [];
  vi.spyOn(NodeHttpHandler.prototype, 'handle').mockImplementation(async (request) => {
    requests.push({ hostname: request.hostname, authorization: request.headers.authorization });
    const action = String(request.body).includes('Action=AssumeRoleWithWebIdentity')
      ? 'AssumeRoleWithWebIdentity'
      : 'AssumeRole';
    return {
      response: {
        statusCode: 200,
        headers: { 'content-type': 'text/xml' },
        body: Buffer.from(
          `<${action}Response xmlns="https://sts.amazonaws.com/doc/2011-06-15/"><${action}Result><Credentials><AccessKeyId>${assumed.accessKeyId}</AccessKeyId><SecretAccessKey>${assumed.secretAccessKey}</SecretAccessKey><SessionToken>assumed-session</SessionToken><Expiration>2100-01-01T00:00:00Z</Expiration></Credentials></${action}Result></${action}Response>`,
        ),
      },
    };
  });
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network access'));
});

afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
  restore();
  fs.rmSync(directory, { recursive: true, force: true });
});

function fixture(source: string, mode: string): EnvOverrides {
  const command = `${JSON.stringify(process.execPath.replaceAll('\\', '/'))} ${JSON.stringify(path.join(directory, 'process.cjs').replaceAll('\\', '/'))}`;
  const profile =
    source === 'env-web-identity'
      ? ''
      : source === 'environment'
        ? 'credential_source=Environment\n'
        : source === 'web-identity'
          ? `web_identity_token_file=${path.join(directory, 'token')}\n`
          : `source_profile=${source.startsWith('chain-') ? 'middle' : 'source'}\n`;
  const sourceProfile =
    source === 'process' || source === 'chain-process'
      ? `credential_process=${command}\n`
      : 'aws_access_key_id=source-access\naws_secret_access_key=source-secret\n';
  const endpoint =
    mode === 'service-file'
      ? 'services=fixture\n'
      : mode === 'fips'
        ? 'use_fips_endpoint=true\n'
        : mode === 'dualstack'
          ? 'use_dualstack_endpoint=true\n'
          : '';
  const configFile = path.join(directory, 'scoped-config');
  fs.writeFileSync(
    configFile,
    `[profile selected]\n${source === 'env-web-identity' ? '' : 'role_arn=arn:aws:iam::123456789012:role/Fixture\n'}${profile}${endpoint}[profile source]\n${sourceProfile}[profile middle]\nrole_arn=arn:aws:iam::123456789012:role/Middle\nsource_profile=source\n[services fixture]\nsts =\n  endpoint_url=https://scoped-sts.invalid\n`,
  );
  return {
    AWS_PROFILE: 'selected',
    AWS_CONFIG_FILE: configFile,
    AWS_SHARED_CREDENTIALS_FILE: path.join(directory, 'credentials'),
    AWS_SESSION_TOKEN: 'scoped-source-session',
    ...(source === 'env-web-identity'
      ? {
          AWS_ROLE_ARN: 'arn:aws:iam::123456789012:role/Fixture',
          AWS_WEB_IDENTITY_TOKEN_FILE: path.join(directory, 'token'),
        }
      : {}),
    ...(mode === 'service-env' ? { AWS_ENDPOINT_URL_STS: 'https://env-sts.invalid' } : {}),
    ...(mode === 'ignore'
      ? {
          AWS_ENDPOINT_URL_STS: 'https://ignored.invalid',
          AWS_IGNORE_CONFIGURED_ENDPOINT_URLS: 'true',
        }
      : {}),
  };
}

async function inspect(env?: EnvOverrides, config = {}) {
  const provider = new AwsBedrockCompletionProvider('fixture', {
    config: { region: 'us-east-1', endpoint: 'https://bedrock-only.invalid', ...config },
    env,
  });
  const client = await provider.getBedrockInstance();
  try {
    expect(await client.config.credentials()).toMatchObject(assumed);
    return requests.at(-1);
  } finally {
    client.destroy();
  }
}

describe.each([
  'environment',
  'static',
  'process',
  'chain-static',
  'chain-process',
  'web-identity',
  'env-web-identity',
])('%s STS profile endpoint discovery', (source) => {
  it.each(
    ['provider', 'suite', 'file'].flatMap((scope) =>
      ['service-file', 'service-env', 'fips', 'dualstack', 'none', 'ignore'].map((mode) => ({
        scope,
        mode,
      })),
    ),
  )('matches native discovery for $scope $mode', async ({ scope, mode }) => {
    const env = fixture(source, mode);
    const reset = mockProcessEnv(env);
    let expected;
    try {
      expected = await inspect();
    } finally {
      reset();
    }
    const expectedRequests = requests.slice();
    const run = () => inspect(scope === 'provider' ? env : undefined);
    const actual =
      scope === 'suite'
        ? await cliState.withEnv(env, run)
        : scope === 'file'
          ? await cliState.withEnvFileOverrides(env, run)
          : await run();
    expect(actual?.hostname).toBe(expected?.hostname);
    expect(actual?.hostname).not.toBe('bedrock-only.invalid');
    expect(actual?.authorization?.match(/Credential=([^/]+)/)?.[1]).toBe(
      expected?.authorization?.match(/Credential=([^/]+)/)?.[1],
    );
    const summarize = (request: (typeof requests)[number]) => ({
      hostname: request.hostname,
      signer: request.authorization?.match(/Credential=([^/]+)/)?.[1],
    });
    expect(expectedRequests).toHaveLength(source.startsWith('chain-') ? 2 : 1);
    expect(requests.slice(expectedRequests.length).map(summarize)).toEqual(
      expectedRequests.map(summarize),
    );
  });
});

it.each(['environment', 'static'])(
  'preserves an explicitly supplied %s role assumer',
  async (source) => {
    const env = fixture(source, 'service-file');
    const roleAssumer = vi.fn().mockResolvedValue({ ...assumed });
    const credentials = await getScopedAwsProfileCredentials(
      {
        profile: 'selected',
        configFilepath: env.AWS_CONFIG_FILE,
        filepath: env.AWS_SHARED_CREDENTIALS_FILE,
        roleAssumer,
      },
      { ...env, AWS_USE_FIPS_ENDPOINT: 'invalid' },
    );
    expect(await credentials?.()).toMatchObject(assumed);
    expect(roleAssumer).toHaveBeenCalledOnce();
    expect(requests).toHaveLength(0);
  },
);

it('preserves an explicitly supplied web identity assumer', async () => {
  const env = fixture('web-identity', 'service-file');
  const roleAssumerWithWebIdentity = vi.fn().mockResolvedValue({ ...assumed });
  const credentials = await getScopedAwsProfileCredentials(
    {
      profile: 'selected',
      configFilepath: env.AWS_CONFIG_FILE,
      filepath: env.AWS_SHARED_CREDENTIALS_FILE,
      roleAssumerWithWebIdentity,
    },
    { ...env, AWS_USE_FIPS_ENDPOINT: 'invalid' },
  );
  expect(await credentials?.()).toMatchObject(assumed);
  expect(roleAssumerWithWebIdentity).toHaveBeenCalledOnce();
  expect(requests).toHaveLength(0);
});

it('keeps configured IAM credentials ahead of scoped role profiles', async () => {
  const env = fixture('environment', 'service-file');
  const provider = new AwsBedrockCompletionProvider('fixture', {
    config: assumed,
    env,
  });
  const client = await provider.getBedrockInstance();
  try {
    expect(await client.config.credentials()).toMatchObject(assumed);
    expect(requests).toHaveLength(0);
  } finally {
    client.destroy();
  }
});

it('preserves explicit STS client endpoint and boolean settings', async () => {
  const env = fixture('environment', 'fips');
  const credentials = await getScopedAwsProfileCredentials(
    {
      profile: 'selected',
      configFilepath: env.AWS_CONFIG_FILE,
      filepath: env.AWS_SHARED_CREDENTIALS_FILE,
      clientConfig: {
        region: 'us-east-1',
        endpoint: 'https://explicit-sts.invalid',
        useFipsEndpoint: false,
        useDualstackEndpoint: false,
      },
    },
    { ...env, AWS_USE_FIPS_ENDPOINT: 'invalid', AWS_USE_DUALSTACK_ENDPOINT: 'invalid' },
  );
  expect(await credentials?.()).toMatchObject(assumed);
  expect(requests[0].hostname).toBe('explicit-sts.invalid');
});
