import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { HttpResponse } from '@smithy/core/transport';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SageMakerCompletionProvider } from '../../src/providers/sagemaker';
import type { SageMakerRuntimeClient } from '@aws-sdk/client-sagemaker-runtime';
import type { HttpRequest } from '@smithy/core/transport';
import type { NodeHttpHandler as HttpHandler } from '@smithy/node-http-handler';

vi.mock('../../src/cache', () => ({
  isCacheEnabled: () => false,
  getCache: () => ({ get: vi.fn(), set: vi.fn() }),
}));
vi.mock('../../src/telemetry', () => ({ default: { record: vi.fn() } }));

// Resolve the CJS instances used by the real credential helpers. The internal
// interceptor replaces only token-cache contents and credential_process output.
const requireFromTest = createRequire(import.meta.url);
const requireFromSso = createRequire(requireFromTest.resolve('@aws-sdk/credential-provider-sso'));
const { externalDataInterceptor } = requireFromSso(
  '@smithy/core/config',
) as typeof import('@smithy/core/config');
const { NodeHttpHandler } = requireFromSso(
  '@smithy/node-http-handler',
) as typeof import('@smithy/node-http-handler');
const startTime = new Date('2026-01-01T00:00:00Z');
const hour = 3_600_000;

type TransportCall = {
  handler: HttpHandler;
  request: HttpRequest;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function response(body: unknown, contentType = 'application/json') {
  return {
    response: new HttpResponse({
      statusCode: 200,
      headers: { 'content-type': contentType },
      body: new TextEncoder().encode(typeof body === 'string' ? body : JSON.stringify(body)),
    }),
  };
}

describe('SageMaker default SDK credentials across idle cleanup', () => {
  let directory: string;
  let configFile: string;
  let startUrl: string;
  let ssoCalls: TransportCall[];
  let stsCalls: TransportCall[];
  let sageCalls: TransportCall[];
  let handlers: Set<HttpHandler>;
  let destroyedHandlers: Set<HttpHandler>;
  let providers: SageMakerCompletionProvider[];
  let ssoReply: (generation: number) => Promise<ReturnType<typeof response>>;
  let originalProcessInterceptor: unknown;

  function renewToken(expiresAt = Date.now() + hour) {
    externalDataInterceptor.interceptToken(startUrl, {
      accessToken: 'offline-sso-token',
      expiresAt: new Date(expiresAt).toISOString(),
    });
  }

  function ssoProfile(name = 'named') {
    return `[${name === 'default' ? name : `profile ${name}`}]
sso_start_url = ${startUrl}
sso_account_id = 123456789012
sso_region = eu-west-1
sso_role_name = TestRole
`;
  }

  async function configure(contents = ssoProfile(), profile: string | null = 'named') {
    await writeFile(configFile, contents);
    vi.stubEnv('AWS_PROFILE', profile ?? undefined);
  }

  function createProvider(config: SageMakerCompletionProvider['config'] = {}) {
    const provider = new SageMakerCompletionProvider('endpoint', {
      config: { region: 'us-west-2', modelType: 'custom', ...config },
    });
    providers.push(provider);
    return provider;
  }

  async function expectSignedRow(provider: SageMakerCompletionProvider, key: string) {
    const result = await provider.callApi(`row ${sageCalls.length}`);
    expect(result.error, 'valid role credentials survive idle cleanup').toBeUndefined();
    expect(result.output).toBe('offline response');
    expect(sageCalls.at(-1)?.request.headers.authorization).toContain(`Credential=${key}/`);
    expect(provider.sagemakerRuntime).toBeUndefined();
    expect(destroyedHandlers.has(sageCalls.at(-1)!.handler)).toBe(true);
  }

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(startTime);
    directory = await mkdtemp(path.join(tmpdir(), 'sagemaker-default-credentials-'));
    configFile = path.join(directory, 'config');
    startUrl = `https://offline.example/${path.basename(directory)}`;
    const credentialsFile = path.join(directory, 'credentials');
    await writeFile(credentialsFile, '');
    // Stub behavior is intentional: individual tests change the live SDK inputs
    // between requests. Never inspect account files or inherit ambient AWS keys.
    for (const key of Object.keys(process.env).filter((key) => key.startsWith('AWS_'))) {
      vi.stubEnv(key, undefined);
    }
    vi.stubEnv('AWS_CONFIG_FILE', configFile);
    vi.stubEnv('AWS_SHARED_CREDENTIALS_FILE', credentialsFile);
    vi.stubEnv('AWS_EC2_METADATA_DISABLED', 'true');
    vi.stubEnv('AWS_DEFAULTS_MODE', 'legacy');
    vi.stubEnv('AWS_MAX_ATTEMPTS', '1');
    vi.stubEnv('AWS_SAGEMAKER_MAX_RETRIES', '1');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const transport of [http, https]) {
      vi.spyOn(transport, 'request').mockImplementation(() => {
        throw new Error('Unexpected network request in offline default credential test');
      });
    }
    ssoCalls = [];
    stsCalls = [];
    sageCalls = [];
    handlers = new Set();
    destroyedHandlers = new Set();
    providers = [];
    originalProcessInterceptor = externalDataInterceptor.getTokenRecord().exec;
    externalDataInterceptor.interceptToken(
      'exec',
      Object.assign(() => {}, {
        [promisify.custom]: async () => {
          throw new Error('Unexpected credential_process in offline credential test');
        },
      }),
    );
    renewToken(startTime.getTime() + 60_000);
    ssoReply = async (generation) =>
      response({
        roleCredentials: {
          accessKeyId: `SSO_${generation}`,
          secretAccessKey: 'offline-secret',
          sessionToken: 'offline-session',
          expiration: Date.now() + hour,
        },
      });
    const destroy = NodeHttpHandler.prototype.destroy;
    vi.spyOn(NodeHttpHandler.prototype, 'destroy').mockImplementation(function (this: HttpHandler) {
      destroyedHandlers.add(this);
      return destroy.call(this);
    });
    vi.spyOn(NodeHttpHandler.prototype, 'handle').mockImplementation(async function (
      this: HttpHandler,
      request,
    ) {
      expect(destroyedHandlers.has(this)).toBe(false);
      handlers.add(this);
      // Keep the SDK serializers, signers, and credential providers; replace
      // only the public HTTP boundary, recording its handler identity.
      const call = { handler: this, request };
      if (request.hostname.startsWith('portal.sso.')) {
        ssoCalls.push(call);
        return ssoReply(ssoCalls.length);
      }
      if (request.hostname.startsWith('sts.')) {
        stsCalls.push(call);
        const action = new URLSearchParams(String(request.body)).get('Action');
        expect(['AssumeRole', 'AssumeRoleWithWebIdentity']).toContain(action);
        return response(
          `<${action}Response xmlns="https://sts.amazonaws.com/doc/2011-06-15/">
<${action}Result><Credentials>
<AccessKeyId>STS_${stsCalls.length}</AccessKeyId><SecretAccessKey>offline-sts-secret</SecretAccessKey>
<SessionToken>offline-sts-session</SessionToken><Expiration>${new Date(Date.now() + hour).toISOString()}</Expiration>
</Credentials></${action}Result></${action}Response>`,
          'text/xml',
        );
      }
      expect(request.hostname).toMatch(/^runtime\.sagemaker\./);
      sageCalls.push(call);
      return response({ output: 'offline response' });
    });
  });

  afterEach(async () => {
    for (const provider of providers) {
      provider.cleanup();
    }
    // Credential helper handlers belong to the SDK. Fixture cleanup is separate
    // from assertions about which handlers production Sage cleanup destroys.
    for (const handler of handlers) {
      if (!destroyedHandlers.has(handler)) {
        handler.destroy();
      }
    }
    Reflect.deleteProperty(externalDataInterceptor.getTokenRecord(), startUrl);
    if (originalProcessInterceptor === undefined) {
      Reflect.deleteProperty(externalDataInterceptor.getTokenRecord(), 'exec');
    } else {
      externalDataInterceptor.interceptToken('exec', originalProcessInterceptor);
    }
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    await rm(directory, { recursive: true, force: true });
  });

  it.each(['AWS_PROFILE', 'default', 'assume-role'] as const)(
    'keeps valid %s role credentials after the login expires and Sage is destroyed',
    async (source) => {
      const isRole = source === 'assume-role';
      const contents = isRole
        ? `[profile named]\nrole_arn = arn:aws:iam::123456789012:role/Target\nsource_profile = source\n${ssoProfile('source')}`
        : ssoProfile(source === 'default' ? 'default' : 'named');
      await configure(contents, source === 'default' ? null : 'named');
      const provider = createProvider();
      await expectSignedRow(provider, isRole ? 'STS_1' : 'SSO_1');
      const firstHandler = sageCalls[0].handler;
      if (isRole) {
        expect(
          stsCalls[0].handler,
          'credential transport must not be a SageMaker handler',
        ).not.toBe(firstHandler);
      }

      vi.setSystemTime(startTime.getTime() + 120_000);
      await expectSignedRow(provider, isRole ? 'STS_1' : 'SSO_1');
      expect(sageCalls[1].handler).not.toBe(firstHandler);
      expect(ssoCalls).toHaveLength(1);
      expect(stsCalls).toHaveLength(isRole ? 1 : 0);

      vi.setSystemTime(startTime.getTime() + 70 * 60_000);
      renewToken();
      await expectSignedRow(provider, isRole ? 'STS_2' : 'SSO_2');
      expect(ssoCalls).toHaveLength(2);
      expect(stsCalls).toHaveLength(isRole ? 2 : 0);
      for (const helper of [...ssoCalls, ...stsCalls]) {
        expect(destroyedHandlers.has(helper.handler)).toBe(false);
        for (const sage of sageCalls) {
          expect(helper.handler, 'credential transport must not be a SageMaker handler').not.toBe(
            sage.handler,
          );
        }
      }
      expect(
        ssoCalls.every(({ request }) => request.hostname === 'portal.sso.eu-west-1.amazonaws.com'),
      ).toBe(true);
      if (isRole) {
        expect(stsCalls[1].handler).toBe(stsCalls[0].handler);
        expect(stsCalls[0].request.headers.authorization).toContain('/us-west-2/sts/');
      }
    },
  );

  it.each(['SDK baseline', 'SageMaker'] as const)(
    '%s preserves passive refresh, forced coalescing, and recovery after expiry',
    async (mode) => {
      await configure();
      const provider = createProvider();
      let client: SageMakerRuntimeClient | undefined;
      const resolve =
        mode === 'SDK baseline'
          ? defaultProvider()
          : async (options?: { forceRefresh?: boolean }) => {
              const runtime: SageMakerRuntimeClient =
                client ?? (await provider.getSageMakerRuntimeInstance());
              client = runtime;
              return runtime.config.credentials(options);
            };
      expect((await resolve()).accessKeyId).toBe('SSO_1');
      if (mode === 'SageMaker') {
        provider.cleanup();
        client = undefined;
      }
      vi.setSystemTime(startTime.getTime() + 56 * 60_000);
      renewToken();
      const pending = deferred<ReturnType<typeof response>>();
      const started = deferred<void>();
      const normalReply = ssoReply;
      ssoReply = async () => {
        started.resolve();
        return pending.promise;
      };
      const cached = await Promise.all([resolve(), resolve()]);
      expect(cached.map(({ accessKeyId }) => accessKeyId)).toEqual(['SSO_1', 'SSO_1']);
      await started.promise;
      expect(ssoCalls).toHaveLength(2);
      pending.resolve(await normalReply(2));
      await vi.waitFor(async () => expect((await resolve()).accessKeyId).toBe('SSO_2'));

      const forced = deferred<ReturnType<typeof response>>();
      const forceStarted = deferred<void>();
      ssoReply = async () => {
        forceStarted.resolve();
        return forced.promise;
      };
      const forceRequests = [resolve({ forceRefresh: true }), resolve({ forceRefresh: true })];
      await forceStarted.promise;
      expect(ssoCalls).toHaveLength(3);
      forced.resolve(await normalReply(3));
      expect((await Promise.all(forceRequests)).map(({ accessKeyId }) => accessKeyId)).toEqual([
        'SSO_3',
        'SSO_3',
      ]);

      vi.setSystemTime(startTime.getTime() + 120 * 60_000);
      await expect(resolve()).rejects.toThrow(
        'The SSO session associated with this profile has expired',
      );
      expect(ssoCalls).toHaveLength(3);
      renewToken();
      ssoReply = normalReply;
      expect((await resolve()).accessKeyId).toBe('SSO_4');
      expect(ssoCalls).toHaveLength(4);
    },
  );

  it.each([
    [
      'explicit keys',
      'named',
      { accessKeyId: 'EXPLICIT', secretAccessKey: 'explicit-secret', profile: 'configured' },
      'EXPLICIT',
    ],
    ['explicit profile', 'named', { profile: 'configured' }, 'SSO_1'],
    ['named profile before environment keys', 'named', {}, 'SSO_1'],
    ['environment keys before unnamed default', null, {}, 'ENVIRONMENT'],
  ] as const)('preserves %s precedence', async (_label, profile, config, expected) => {
    await configure(
      ssoProfile('named') + ssoProfile('configured') + ssoProfile('default'),
      profile,
    );
    vi.stubEnv('AWS_ACCESS_KEY_ID', 'ENVIRONMENT');
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'environment-secret');
    await expectSignedRow(createProvider(config), expected);
    expect(ssoCalls).toHaveLength(expected === 'SSO_1' ? 1 : 0);
  });

  it('preserves static and credential_process precedence over SSO fields', async () => {
    await configure(
      `${ssoProfile()}aws_access_key_id = FILE_STATIC\naws_secret_access_key = file-secret\ncredential_process = offline-process\n`,
    );
    const processOutput = vi.fn(async (command: string) => {
      expect(command).toBe('offline-process');
      return {
        stdout: JSON.stringify({
          Version: 1,
          AccessKeyId: 'PROCESS',
          SecretAccessKey: 'process-secret',
        }),
        stderr: '',
      };
    });
    externalDataInterceptor.interceptToken(
      'exec',
      Object.assign(() => {}, { [promisify.custom]: processOutput }),
    );
    const provider = createProvider();
    await expectSignedRow(provider, 'FILE_STATIC');
    expect(processOutput).not.toHaveBeenCalled();
    const processConfig = path.join(directory, 'process-config');
    await writeFile(processConfig, `${ssoProfile()}credential_process = offline-process\n`);
    vi.stubEnv('AWS_CONFIG_FILE', processConfig);
    await expectSignedRow(provider, 'PROCESS');
    expect(processOutput).toHaveBeenCalledOnce();
    expect(ssoCalls).toHaveLength(0);
  });

  it('preserves web identity precedence and keeps its STS handler separate', async () => {
    const tokenFile = path.join(directory, 'web-identity-token');
    await writeFile(tokenFile, 'offline-web-identity-token');
    await configure(
      `${ssoProfile()}role_arn = arn:aws:iam::123456789012:role/Web\nweb_identity_token_file = ${tokenFile}\ncredential_process = must-not-run\n`,
    );
    await expectSignedRow(createProvider(), 'STS_1');
    expect(ssoCalls).toHaveLength(0);
    expect(stsCalls).toHaveLength(1);
    expect(new URLSearchParams(String(stsCalls[0].request.body)).get('WebIdentityToken')).toBe(
      'offline-web-identity-token',
    );
    expect(stsCalls[0].handler).not.toBe(sageCalls[0].handler);
    expect(destroyedHandlers.has(stsCalls[0].handler)).toBe(false);
  });

  it('uses the assume-role profile region before the Sage runtime region', async () => {
    await configure(
      `[profile named]\nrole_arn = arn:aws:iam::123456789012:role/Target\nsource_profile = source\nregion = ap-southeast-2\n${ssoProfile('source')}`,
    );
    await expectSignedRow(createProvider(), 'STS_1');
    expect(stsCalls[0].request.headers.authorization).toContain('/ap-southeast-2/sts/');
    expect(sageCalls[0].request.headers.authorization).toContain('/us-west-2/sagemaker/');
  });

  it.each(['profile', 'region', 'config file', 'credentials file'] as const)(
    'replaces the retained chain when %s changes',
    async (input) => {
      await configure(ssoProfile() + ssoProfile('second'));
      const provider = createProvider();
      await expectSignedRow(provider, 'SSO_1');
      if (input === 'profile') {
        vi.stubEnv('AWS_PROFILE', 'second');
      } else if (input === 'region') {
        provider.config.region = 'ap-southeast-2';
      } else if (input === 'config file') {
        const nextConfig = path.join(directory, 'next-config');
        await writeFile(nextConfig, ssoProfile());
        vi.stubEnv('AWS_CONFIG_FILE', nextConfig);
      } else {
        const nextCredentials = path.join(directory, 'next-credentials');
        await writeFile(nextCredentials, '');
        vi.stubEnv('AWS_SHARED_CREDENTIALS_FILE', nextCredentials);
      }
      await expectSignedRow(provider, 'SSO_2');
      expect(ssoCalls).toHaveLength(2);
      expect(sageCalls[1].request.headers.authorization).toContain(
        `/${provider.config.region}/sagemaker/`,
      );
    },
  );

  it.each(['key', 'token'] as const)(
    'replaces cached environment credentials when the %s changes',
    async (input) => {
      await configure(ssoProfile('default'), null);
      vi.stubEnv('AWS_ACCESS_KEY_ID', 'ENVIRONMENT_1');
      vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'environment-secret');
      vi.stubEnv('AWS_SESSION_TOKEN', 'token-1');
      const provider = createProvider();
      await expectSignedRow(provider, 'ENVIRONMENT_1');
      if (input === 'key') {
        vi.stubEnv('AWS_ACCESS_KEY_ID', 'ENVIRONMENT_2');
      } else {
        vi.stubEnv('AWS_SESSION_TOKEN', 'token-2');
      }
      await expectSignedRow(provider, input === 'key' ? 'ENVIRONMENT_2' : 'ENVIRONMENT_1');
      expect(sageCalls[1].request.headers['x-amz-security-token']).toBe(
        input === 'token' ? 'token-2' : 'token-1',
      );
      expect(ssoCalls).toHaveLength(0);
    },
  );
});
