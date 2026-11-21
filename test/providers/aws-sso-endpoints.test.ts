import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { NodeHttpHandler } from '@smithy/node-http-handler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveAwsCredentials } from '../../src/providers/awsCredentials';
import { createScopedSsoProvider } from '../../src/providers/awsSsoCredentials';
import { mockProcessEnv } from '../util/utils';
import type { FromSSOInit } from '@aws-sdk/credential-provider-sso';
import type { HttpRequest } from '@smithy/types';

const require = createRequire(import.meta.url);
const ssoRequire = createRequire(require.resolve('@aws-sdk/credential-provider-sso'));
const { externalDataInterceptor } = ssoRequire('@smithy/core/config');
const { SSOClient } = ssoRequire('@aws-sdk/nested-clients/sso');
const identity = { accessKeyId: 'fixture-access', secretAccessKey: 'fixture-secret' };
let directory: string;
let startUrl: string;
let scoped: Record<string, string>;
let restore: () => void;
let hosts: string[];

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-sso-endpoints-'));
  startUrl = `https://fixture.invalid/${path.basename(directory)}`;
  fs.writeFileSync(path.join(directory, 'credentials'), '');
  fs.writeFileSync(
    path.join(directory, 'config'),
    `[profile fixture]\nsso_start_url=${startUrl}\nsso_region=us-east-1\nsso_account_id=111111111111\nsso_role_name=Fixture\n`,
  );
  externalDataInterceptor.interceptToken(startUrl, {
    accessToken: 'fixture-token',
    expiresAt: '2100-01-01T00:00:00Z',
  });
  scoped = {
    AWS_PROFILE: 'fixture',
    AWS_CONFIG_FILE: path.join(directory, 'config'),
    AWS_SHARED_CREDENTIALS_FILE: path.join(directory, 'credentials'),
    AWS_ENDPOINT_URL_SSO: 'https://scoped-sso.invalid',
  };
  restore = mockProcessEnv(
    { AWS_EC2_METADATA_DISABLED: 'true', SystemRoot: process.env.SystemRoot },
    { clear: true },
  );
  hosts = [];
  vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(() => {
    throw new Error('Unexpected socket access');
  });
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network access'));
  vi.spyOn(NodeHttpHandler.prototype, 'handle').mockImplementation(async (request: HttpRequest) => {
    hosts.push(request.hostname);
    return {
      response: {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(
          JSON.stringify({
            roleCredentials: {
              ...identity,
              sessionToken: 'fixture-session',
              expiration: Date.now() + 3600000,
            },
          }),
        ),
      },
    };
  });
});

afterEach(() => {
  delete externalDataInterceptor.getTokenRecord()[startUrl];
  vi.restoreAllMocks();
  restore();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe('scoped SSO credential endpoints', () => {
  it.each(['scoped-profile', 'configured-profile'] as const)(
    'uses the SSO endpoint for %s',
    async (mode) => {
      const destroy = vi.spyOn(SSOClient.prototype, 'destroy');
      const provider = await resolveAwsCredentials(
        mode === 'configured-profile' ? { profile: 'fixture' } : {},
        scoped,
      );
      expect(typeof provider).toBe('function');
      expect(await (provider as () => Promise<unknown>)()).toMatchObject(identity);
      expect(hosts).toEqual(['scoped-sso.invalid']);
      expect(destroy).toHaveBeenCalledOnce();
    },
  );

  it('destroys its SSO client when credentials fail', async () => {
    const destroy = vi.spyOn(SSOClient.prototype, 'destroy');
    const failure = new Error('fixture auth failure');
    const factory = () => async () => {
      throw failure;
    };
    const provider = createScopedSsoProvider(
      factory,
      { profile: 'fixture', configFilepath: scoped.AWS_CONFIG_FILE },
      scoped,
    );
    await expect(provider()).rejects.toBe(failure);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('preserves caller-owned SSO clients and explicit OIDC configuration', async () => {
    const client = new SSOClient({ region: 'us-west-2' });
    const destroy = vi.spyOn(client, 'destroy');
    const factory = vi.fn((_options: FromSSOInit) => async () => identity);
    const provider = createScopedSsoProvider(
      factory,
      {
        profile: 'fixture',
        ssoClient: client,
        clientConfig: { endpoint: 'https://explicit.invalid', useFipsEndpoint: false },
      },
      {
        ...scoped,
        AWS_ENDPOINT_URL_SSO_OIDC: 'https://scoped-oidc.invalid',
        AWS_USE_FIPS_ENDPOINT: 'true',
      },
    );
    try {
      expect(await provider()).toEqual(identity);
      expect(factory.mock.calls[0][0]).toMatchObject({
        ssoClient: client,
        clientConfig: { endpoint: 'https://explicit.invalid', useFipsEndpoint: false },
      });
      expect(destroy).not.toHaveBeenCalled();
    } finally {
      client.destroy();
    }
  });

  it('does not restore the host endpoint profile when the invocation clears AWS_PROFILE', async () => {
    mockProcessEnv({ AWS_PROFILE: 'host' });
    fs.appendFileSync(
      path.join(directory, 'config'),
      '[default]\nuse_fips_endpoint=false\n[profile host]\nuse_fips_endpoint=true\n',
    );
    const factory = vi.fn((options: FromSSOInit) => async () => {
      expect(await options.ssoClient!.config.useFipsEndpoint()).toBe(false);
      expect(options.clientConfig?.useFipsEndpoint).toBe(false);
      return identity;
    });
    const provider = createScopedSsoProvider(
      factory,
      {
        profile: 'fixture',
        configFilepath: scoped.AWS_CONFIG_FILE,
      },
      { ...scoped, AWS_PROFILE: '' },
    );
    expect(await provider()).toEqual(identity);
  });

  it('honors the scoped switch that ignores configured endpoints', async () => {
    const provider = await resolveAwsCredentials(
      { profile: 'fixture' },
      {
        ...scoped,
        AWS_IGNORE_CONFIGURED_ENDPOINT_URLS: 'true',
      },
    );
    expect(await (provider as () => Promise<unknown>)()).toMatchObject(identity);
    expect(hosts).toEqual(['portal.sso.us-east-1.amazonaws.com']);
  });

  it('keeps OIDC token refresh and SSO role requests on separate scoped endpoints', () => {
    const moduleUrl = pathToFileURL(path.resolve('src/providers/awsCredentials.ts')).href;
    const session = `session-${path.basename(directory)}`;
    fs.writeFileSync(
      path.join(directory, 'config'),
      `[profile fixture]\nsso_session=${session}\nsso_account_id=111111111111\nsso_role_name=Fixture\n[sso-session ${session}]\nsso_region=us-east-1\nsso_start_url=${startUrl}\n`,
    );
    const script = `
      import assert from 'node:assert/strict';
      import { createRequire } from 'node:module';
      import fs from 'node:fs';
      // Isolate the SDK's token persistence in this short-lived process; never touch user SSO files.
      fs.promises.writeFile = async () => {};
      globalThis.fetch = async () => { throw new Error('Unexpected network access'); };
      const require = createRequire(${JSON.stringify(path.resolve('package.json'))});
      const ssoRequire = createRequire(require.resolve('@aws-sdk/credential-provider-sso'));
      const { externalDataInterceptor } = ssoRequire('@smithy/core/config');
      externalDataInterceptor.interceptToken(${JSON.stringify(session)}, {
        accessToken: 'old-fixture-token', expiresAt: new Date(Date.now() + 60000).toISOString(),
        clientId: 'fixture-client', clientSecret: 'fixture-secret', refreshToken: 'fixture-refresh',
      });
      require('node:net').Socket.prototype.connect = () => { throw new Error('Unexpected socket access'); };
      const { NodeHttpHandler } = require('@smithy/node-http-handler');
      const hosts = [];
      NodeHttpHandler.prototype.handle = async request => {
        hosts.push(request.hostname);
        const body = request.path === '/token'
          ? { accessToken: 'new-fixture-token', expiresIn: 3600, refreshToken: 'next-fixture-refresh' }
          : { roleCredentials: { accessKeyId: 'fixture-access', secretAccessKey: 'fixture-secret', sessionToken: 'fixture-session', expiration: Date.now() + 3600000 } };
        return { response: { statusCode: 200, headers: { 'content-type': 'application/json' }, body: Buffer.from(JSON.stringify(body)) } };
      };
      // Model an isolated SDK install: the selected SDK sees SSO, Promptfoo's source cannot.
      const Module = require('node:module');
      const resolveFilename = Module._resolveFilename;
      const sourceRoot = ${JSON.stringify(path.resolve('src') + path.sep)};
      Module._resolveFilename = function(specifier, parent, ...args) {
        if (specifier === '@aws-sdk/credential-provider-sso' && parent?.filename?.startsWith(sourceRoot)) {
          throw Object.assign(new Error('Optional root SSO package is absent'), { code: 'MODULE_NOT_FOUND' });
        }
        return resolveFilename.call(this, specifier, parent, ...args);
      };
      const { resolveAwsCredentials } = await import(${JSON.stringify(moduleUrl)});
      const credentials = await resolveAwsCredentials({}, ${JSON.stringify({ ...scoped, AWS_ENDPOINT_URL_SSO_OIDC: 'https://scoped-oidc.invalid' })});
      assert.equal((await credentials()).accessKeyId, 'fixture-access');
      assert.deepEqual(hosts, ['scoped-oidc.invalid', 'scoped-sso.invalid']);
      process.stdout.write(JSON.stringify(hosts));
    `;
    const output = execFileSync(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e', script],
      { encoding: 'utf8' },
    );
    expect(JSON.parse(output)).toEqual(['scoped-oidc.invalid', 'scoped-sso.invalid']);
  });
});
