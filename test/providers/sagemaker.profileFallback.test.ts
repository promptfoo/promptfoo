import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { createRequire } from 'node:module';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockProcessEnv } from '../util/utils';
import type { HttpRequest } from '@smithy/core/transport';
import type { NodeHttpHandler as HttpHandler } from '@smithy/node-http-handler';

import type { SageMakerCompletionProvider } from '../../src/providers/sagemaker';

vi.mock('../../src/cache', () => ({ isCacheEnabled: () => false, getCache: vi.fn() }));
vi.mock('../../src/telemetry', () => ({ default: { record: vi.fn() } }));

const requireFromTest = createRequire(import.meta.url);
const requireFromWebIdentity = createRequire(
  requireFromTest.resolve('@aws-sdk/credential-provider-web-identity'),
);
const requireFromLogin = createRequire(
  requireFromTest.resolve('@aws-sdk/credential-provider-login'),
);
const { SigninClient, CreateOAuth2TokenCommand } = requireFromLogin(
  '@aws-sdk/nested-clients/signin',
) as typeof import('@aws-sdk/nested-clients/signin');
const { externalDataInterceptor, getHomeDir } = requireFromWebIdentity(
  '@smithy/core/config',
) as typeof import('@smithy/core/config');
const { HttpResponse } = requireFromWebIdentity(
  '@smithy/core/transport',
) as typeof import('@smithy/core/transport');
const { NodeHttpHandler } = requireFromWebIdentity(
  '@smithy/node-http-handler',
) as typeof import('@smithy/node-http-handler');
const roleA = 'arn:aws:iam::123456789012:role/FallbackA';
const roleB = 'arn:aws:iam::123456789012:role/FallbackB';
const profileRole = 'arn:aws:iam::123456789012:role/Profile';
const tokenA = '/synthetic-sage-fallback/token-a';
const tokenB = '/synthetic-sage-fallback/token-b';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function response(body: string, contentType = 'application/json') {
  return {
    response: new HttpResponse({
      statusCode: 200,
      headers: { 'content-type': contentType },
      body: Buffer.from(body),
    }),
  };
}

describe('SageMaker implicit profile fallback ownership', () => {
  let provider: SageMakerCompletionProvider | undefined;
  let restores: (() => void)[];
  let savedFiles: Map<string, PropertyDescriptor | undefined>;
  let savedTokens: Map<string, PropertyDescriptor | undefined>;
  let originalFilePrototype: object | null;
  let unexpectedReads: number;
  let handlers: Set<HttpHandler>;
  let destroyed: Set<HttpHandler>;
  let sageRequests: { handler: HttpHandler; request: HttpRequest }[];
  let stsRequests: { request: HttpRequest; params: URLSearchParams }[];
  let firstDispatched: ReturnType<typeof deferred>;
  let releaseFirst: ReturnType<typeof deferred>;
  let holdFirst: boolean;
  let metadataRequests: http.RequestOptions[];

  function useMetadataProfile() {
    externalDataInterceptor.interceptFile(
      '/synthetic-sage-fallback/config',
      `[profile fallback]\nrole_arn = ${profileRole}\ncredential_source = Ec2InstanceMetadata\n`,
    );
    setEnvironment({ AWS_EC2_METADATA_SERVICE_ENDPOINT: 'http://synthetic-metadata.invalid' });
  }

  function useLoginProfile(mode: 'transient' | 'missing' | 'denied' = 'transient') {
    const session = 'synthetic-fallback-login-session';
    const directory = '/synthetic-sage-fallback/login';
    const filename = path.join(
      directory,
      `${createHash('sha256').update(session).digest('hex')}.json`,
    );
    externalDataInterceptor.interceptFile(
      '/synthetic-sage-fallback/config',
      `[profile fallback]\nlogin_session = ${session}\nregion = us-east-1\n`,
    );
    setEnvironment({ AWS_LOGIN_CACHE_DIRECTORY: directory });
    // The real login provider reads this promises object's method at call time,
    // including when its native CJS module was loaded by an earlier test file.
    const readToken = vi.spyOn(fs, 'readFile').mockImplementation(async (requested, encoding) => {
      if (requested !== filename) {
        unexpectedReads++;
        throw new Error('Unexpected login-file read in fallback fixture');
      }
      expect(encoding).toBe('utf8');
      if (mode === 'missing') {
        throw new Error('Synthetic login token is missing');
      }
      return JSON.stringify({
        accessToken: {
          accessKeyId: 'LOGIN',
          secretAccessKey: 'synthetic-login-secret',
          sessionToken: 'synthetic-login-session',
          accountId: '123456789012',
          expiresAt: new Date(Date.now() - 60_000).toISOString(),
        },
        clientId: 'synthetic-login-client',
        refreshToken: 'synthetic-login-refresh',
        dpopKey: 'unused-synthetic-key-send-is-mocked',
      });
    });
    // Only the Signin service send boundary is mocked. The SDK validates and
    // expires the token, constructs the command, and determines continuability;
    // STS parsing and Sage signing still use the existing real SDK HTTP fixture.
    const send = vi.spyOn(SigninClient.prototype, 'send').mockImplementation(async (command) => {
      expect(command).toBeInstanceOf(CreateOAuth2TokenCommand);
      expect(command.input).toEqual({
        tokenInput: {
          clientId: 'synthetic-login-client',
          refreshToken: 'synthetic-login-refresh',
          grantType: 'refresh_token',
        },
      });
      if (mode === 'denied') {
        throw Object.assign(new Error('Synthetic login denial'), {
          name: 'AccessDeniedException',
          error: 'INSUFFICIENT_PERMISSIONS',
        });
      }
      throw new Error('Synthetic transient Signin failure');
    });
    return { readToken, send };
  }

  function setEnvironment(values: Record<string, string | undefined>) {
    restores.push(mockProcessEnv(values));
  }

  async function loadProvider(config: SageMakerCompletionProvider['config'] = {}) {
    const { loadApiProvider } = await import('../../src/providers');
    provider = (await loadApiProvider('sagemaker:custom:fallback-endpoint', {
      options: { config: { region: 'us-east-1', ...config } },
    })) as SageMakerCompletionProvider;
    return provider;
  }

  beforeEach(() => {
    restores = [];
    savedFiles = new Map();
    savedTokens = new Map();
    handlers = new Set();
    destroyed = new Set();
    sageRequests = [];
    stsRequests = [];
    metadataRequests = [];
    unexpectedReads = 0;
    firstDispatched = deferred();
    releaseFirst = deferred();
    holdFirst = false;
    setEnvironment({
      ...Object.fromEntries(
        Object.keys(process.env)
          .filter((name) => name.startsWith('AWS_'))
          .map((name) => [name, undefined]),
      ),
      AWS_PROFILE: 'fallback',
      AWS_CONFIG_FILE: '/synthetic-sage-fallback/config',
      AWS_SHARED_CREDENTIALS_FILE: '/synthetic-sage-fallback/credentials',
      AWS_WEB_IDENTITY_TOKEN_FILE: tokenA,
      AWS_ROLE_ARN: roleA,
      AWS_ROLE_SESSION_NAME: 'synthetic-fallback',
      AWS_EC2_METADATA_DISABLED: 'true',
      AWS_DEFAULTS_MODE: 'legacy',
      AWS_SAGEMAKER_MAX_RETRIES: '1',
      AWS_MAX_ATTEMPTS: '1',
    });
    const files = externalDataInterceptor.getFileRecord();
    originalFilePrototype = Object.getPrototypeOf(files);
    const deniedReads = new Map<string, Promise<string>>();
    Object.setPrototypeOf(
      files,
      new Proxy(Object.create(null), {
        get: (_target, filename) => {
          if (typeof filename !== 'string') {
            return undefined;
          }
          let denied = deniedReads.get(filename);
          if (!denied) {
            unexpectedReads++;
            denied = Promise.reject(new Error('Unexpected shared-file read in fallback fixture'));
            void denied.catch(() => {});
            deniedReads.set(filename, denied);
          }
          return denied;
        },
      }),
    );
    // Home supplies only opaque fallback lookup keys; these never reach real fs.
    const homeDirectory = getHomeDir();
    for (const [filename, contents] of [
      [
        '/synthetic-sage-fallback/config',
        `[profile fallback]\nrole_arn = ${profileRole}\ncredential_source = Environment\n`,
      ],
      ['/synthetic-sage-fallback/credentials', ''],
      [path.join(homeDirectory, '.aws', 'config'), ''],
      [path.join(homeDirectory, '.aws', 'credentials'), ''],
    ]) {
      savedFiles.set(filename, Object.getOwnPropertyDescriptor(files, filename));
      externalDataInterceptor.interceptFile(filename, contents);
    }
    const tokens = externalDataInterceptor.getTokenRecord();
    for (const [filename, contents] of [
      [tokenA, 'synthetic-token-a'],
      [tokenB, 'synthetic-token-b'],
    ]) {
      savedTokens.set(filename, Object.getOwnPropertyDescriptor(tokens, filename));
      externalDataInterceptor.interceptToken(filename, contents);
    }
    for (const transport of [http, https]) {
      vi.spyOn(transport, 'request').mockImplementation(() => {
        throw new Error('Unexpected network in fallback fixture');
      });
    }
    vi.mocked(http.request).mockImplementation((options) => {
      const requestOptions = options as http.RequestOptions;
      expect(requestOptions.hostname).toBe('synthetic-metadata.invalid');
      expect(requestOptions.method).toBe('PUT');
      expect(requestOptions.path).toBe('/latest/api/token');
      metadataRequests.push(requestOptions);
      const request = Object.assign(new EventEmitter(), {
        end: () => {
          queueMicrotask(() => {
            // Let the actual SDK httpRequest construct its continuable ProviderError.
            request.emit('response', Object.assign(new EventEmitter(), { statusCode: 400 }));
          });
          return request;
        },
        destroy: vi.fn(),
      });
      return request as unknown as http.ClientRequest;
    });
    const destroy = NodeHttpHandler.prototype.destroy;
    vi.spyOn(NodeHttpHandler.prototype, 'destroy').mockImplementation(function (this: HttpHandler) {
      destroyed.add(this);
      return destroy.call(this);
    });
    vi.spyOn(NodeHttpHandler.prototype, 'handle').mockImplementation(async function (
      this: HttpHandler,
      request,
    ) {
      handlers.add(this);
      expect(destroyed.has(this)).toBe(false);
      if (/^sts\.(us-east-1|us-west-2)\.amazonaws\.com$/.test(request.hostname)) {
        const params = new URLSearchParams(String(request.body));
        stsRequests.push({ request, params });
        const action = params.get('Action');
        expect(['AssumeRole', 'AssumeRoleWithWebIdentity']).toContain(action);
        const key =
          action === 'AssumeRole'
            ? 'PROFILE'
            : params.get('RoleArn') === roleB ||
                params.get('WebIdentityToken') === 'synthetic-token-b'
              ? 'FALLBACK_B'
              : 'FALLBACK_A';
        if (action === 'AssumeRole') {
          expect(params.get('RoleArn')).toBe(profileRole);
          expect(request.headers.authorization).toContain('Credential=ENVIRONMENT_SOURCE/');
        }
        return response(
          `<${action}Response xmlns="https://sts.amazonaws.com/doc/2011-06-15/"><${action}Result><Credentials><AccessKeyId>${key}</AccessKeyId><SecretAccessKey>synthetic-${key}-secret</SecretAccessKey><SessionToken>synthetic-${key}-session</SessionToken><Expiration>${new Date(Date.now() + 3_600_000).toISOString()}</Expiration></Credentials></${action}Result></${action}Response>`,
          'text/xml',
        );
      }
      expect(request.hostname).toMatch(
        /^runtime\.sagemaker\.(us-east-1|us-west-2)\.amazonaws\.com$/,
      );
      expect(request.headers['x-amz-content-sha256']).toBe(
        createHash('sha256')
          .update(request.body as Uint8Array)
          .digest('hex'),
      );
      sageRequests.push({ handler: this, request });
      if (sageRequests.length === 1) {
        firstDispatched.resolve();
        if (holdFirst) {
          await releaseFirst.promise;
        }
      }
      return response('{"output":"synthetic fallback response"}');
    });
  });

  afterEach(() => {
    releaseFirst.resolve();
    provider?.cleanup();
    provider = undefined;
    for (const handler of handlers) {
      if (!destroyed.has(handler)) {
        handler.destroy();
      }
    }
    const files = externalDataInterceptor.getFileRecord();
    Object.setPrototypeOf(files, originalFilePrototype);
    for (const [filename, descriptor] of savedFiles) {
      if (descriptor) {
        Object.defineProperty(files, filename, descriptor);
      } else {
        Reflect.deleteProperty(files, filename);
      }
    }
    const tokens = externalDataInterceptor.getTokenRecord();
    for (const [filename, descriptor] of savedTokens) {
      if (descriptor) {
        Object.defineProperty(tokens, filename, descriptor);
      } else {
        Reflect.deleteProperty(tokens, filename);
      }
    }
    vi.restoreAllMocks();
    for (const restore of restores.reverse()) {
      restore();
    }
    expect(unexpectedReads).toBe(0);
  });

  async function overlap(rotate: () => void, expectedKeys: string[], reuseEast: boolean) {
    const selected = provider!;
    holdFirst = true;
    const first = selected.callApi('first east');
    try {
      await Promise.race([
        firstDispatched.promise,
        first.then((result) => {
          throw new Error(`First inference did not remain pending: ${JSON.stringify(result)}`);
        }),
      ]);
      rotate();
      selected.config.region = 'us-west-2';
      expect(await selected.callApi('west')).toMatchObject({
        output: 'synthetic fallback response',
      });
      selected.config.region = 'us-east-1';
      expect(await selected.callApi('return east')).toMatchObject({
        output: 'synthetic fallback response',
      });
      expect(sageRequests).toHaveLength(3);
      for (const [index, key] of expectedKeys.entries()) {
        expect(sageRequests[index].request.headers.authorization).toContain(`Credential=${key}/`);
        expect(sageRequests[index].request.headers['x-amz-security-token']).toBe(
          `synthetic-${key}-session`,
        );
      }
      expect(sageRequests[2].handler === sageRequests[0].handler).toBe(reuseEast);
      expect(sageRequests.every(({ handler }) => !destroyed.has(handler))).toBe(true);
    } finally {
      releaseFirst.resolve();
      expect(await first).toMatchObject({ output: 'synthetic fallback response' });
    }
    expect(selected.sagemakerRuntime).toBeUndefined();
    expect(sageRequests.every(({ handler }) => destroyed.has(handler))).toBe(true);
  }

  it.each(['role', 'token'] as const)(
    'keeps reachable %s fallback inputs when returning to an active region',
    async (input) => {
      await loadProvider();
      await overlap(
        () =>
          setEnvironment(
            input === 'role' ? { AWS_ROLE_ARN: roleB } : { AWS_WEB_IDENTITY_TOKEN_FILE: tokenB },
          ),
        ['FALLBACK_A', 'FALLBACK_B', 'FALLBACK_B'],
        false,
      );
      expect(stsRequests).toHaveLength(3);
      expect(stsRequests.map(({ params }) => params.get('Action'))).toEqual(
        Array(3).fill('AssumeRoleWithWebIdentity'),
      );
      expect(stsRequests.map(({ params }) => params.get('RoleArn'))).toEqual(
        input === 'role' ? [roleA, roleB, roleB] : [roleA, roleA, roleA],
      );
      expect(stsRequests.map(({ params }) => params.get('WebIdentityToken'))).toEqual(
        input === 'token'
          ? ['synthetic-token-a', 'synthetic-token-b', 'synthetic-token-b']
          : Array(3).fill('synthetic-token-a'),
      );
    },
  );

  it('reuses the active east client when fallback inputs stay stable', async () => {
    await loadProvider();
    await overlap(() => {}, ['FALLBACK_A', 'FALLBACK_A', 'FALLBACK_A'], true);
    expect(stsRequests).toHaveLength(2);
  });

  it.each(['role', 'token'] as const)(
    'keeps reachable %s fallback inputs after an expired login refresh fails transiently',
    async (input) => {
      await loadProvider();
      const login = useLoginProfile();
      await overlap(
        () =>
          setEnvironment(
            input === 'role' ? { AWS_ROLE_ARN: roleB } : { AWS_WEB_IDENTITY_TOKEN_FILE: tokenB },
          ),
        ['FALLBACK_A', 'FALLBACK_B', 'FALLBACK_B'],
        false,
      );
      expect(login.send).toHaveBeenCalledTimes(3);
      expect(login.readToken).toHaveBeenCalledTimes(6);
      expect(stsRequests.map(({ params }) => params.get('Action'))).toEqual(
        Array(3).fill('AssumeRoleWithWebIdentity'),
      );
      expect(stsRequests.map(({ params }) => params.get('RoleArn'))).toEqual(
        input === 'role' ? [roleA, roleB, roleB] : [roleA, roleA, roleA],
      );
      expect(stsRequests.map(({ params }) => params.get('WebIdentityToken'))).toEqual(
        input === 'token'
          ? ['synthetic-token-a', 'synthetic-token-b', 'synthetic-token-b']
          : Array(3).fill('synthetic-token-a'),
      );
      expect(metadataRequests).toHaveLength(0);
    },
  );

  it('reuses stable login fallback credentials while the original request remains active', async () => {
    await loadProvider();
    const login = useLoginProfile();
    await overlap(() => {}, ['FALLBACK_A', 'FALLBACK_A', 'FALLBACK_A'], true);
    expect(login.send).toHaveBeenCalledTimes(2);
    expect(login.readToken).toHaveBeenCalledTimes(4);
    expect(stsRequests).toHaveLength(2);
    expect(metadataRequests).toHaveLength(0);
  });

  it('does not continue an explicit login profile after an expired transient refresh failure', async () => {
    const selected = await loadProvider({ profile: 'fallback' });
    const login = useLoginProfile();
    expect(await selected.callApi('explicit login profile')).toMatchObject({
      error: expect.stringContaining(
        'Failed to refresh token: Error: Synthetic transient Signin failure',
      ),
    });
    expect(login.send).toHaveBeenCalledTimes(1);
    expect(login.readToken).toHaveBeenCalledTimes(2);
    expect(stsRequests).toHaveLength(0);
    expect(sageRequests).toHaveLength(0);
    expect(metadataRequests).toHaveLength(0);
    expect(selected.sagemakerRuntime).toBeUndefined();
  });

  it.each(['missing', 'denied'] as const)(
    'does not continue a terminal %s login failure into web identity',
    async (mode) => {
      const selected = await loadProvider();
      const login = useLoginProfile(mode);
      expect(await selected.callApi('terminal login failure')).toMatchObject({
        error: expect.stringContaining(
          mode === 'missing'
            ? 'Synthetic login token is missing'
            : 'Unable to refresh credentials due to insufficient permissions',
        ),
      });
      expect(login.send).toHaveBeenCalledTimes(mode === 'missing' ? 0 : 1);
      expect(login.readToken).toHaveBeenCalledTimes(mode === 'missing' ? 1 : 2);
      expect(stsRequests).toHaveLength(0);
      expect(sageRequests).toHaveLength(0);
      expect(metadataRequests).toHaveLength(0);
      expect(selected.sagemakerRuntime).toBeUndefined();
    },
  );

  it('keeps configured static credentials ahead of an expired login profile', async () => {
    const selected = await loadProvider({
      accessKeyId: 'CONFIG',
      secretAccessKey: 'synthetic-config-secret',
    });
    const login = useLoginProfile();
    expect(await selected.callApi('configured credentials with login profile')).toMatchObject({
      output: 'synthetic fallback response',
    });
    expect(sageRequests[0].request.headers.authorization).toContain('Credential=CONFIG/');
    expect(login.readToken).not.toHaveBeenCalled();
    expect(login.send).not.toHaveBeenCalled();
    expect(stsRequests).toHaveLength(0);
    expect(metadataRequests).toHaveLength(0);
    expect(selected.sagemakerRuntime).toBeUndefined();
    expect(sageRequests.every(({ handler }) => destroyed.has(handler))).toBe(true);
  });

  it('retains reachable fallback inputs after a continuable metadata failure', async () => {
    useMetadataProfile();
    await loadProvider();
    await overlap(
      () => setEnvironment({ AWS_ROLE_ARN: roleB, AWS_WEB_IDENTITY_TOKEN_FILE: tokenB }),
      ['FALLBACK_A', 'FALLBACK_B', 'FALLBACK_B'],
      false,
    );
    expect(metadataRequests).toHaveLength(3);
    expect(stsRequests.map(({ params }) => params.get('Action'))).toEqual(
      Array(3).fill('AssumeRoleWithWebIdentity'),
    );
    expect(stsRequests.map(({ params }) => params.get('RoleArn'))).toEqual([roleA, roleB, roleB]);
    expect(stsRequests.map(({ params }) => params.get('WebIdentityToken'))).toEqual([
      'synthetic-token-a',
      'synthetic-token-b',
      'synthetic-token-b',
    ]);
  });

  it('reuses stable metadata fallback credentials without disrupting the active request', async () => {
    useMetadataProfile();
    await loadProvider();
    await overlap(() => {}, ['FALLBACK_A', 'FALLBACK_A', 'FALLBACK_A'], true);
    expect(metadataRequests).toHaveLength(2);
    expect(stsRequests).toHaveLength(2);
  });

  it('does not continue an explicit metadata profile into web identity', async () => {
    useMetadataProfile();
    const selected = await loadProvider({ profile: 'fallback' });
    expect(await selected.callApi('explicit metadata profile')).toMatchObject({
      error: expect.stringContaining('EC2 Metadata token request returned error'),
    });
    expect(metadataRequests).toHaveLength(1);
    expect(stsRequests).toHaveLength(0);
    expect(sageRequests).toHaveLength(0);
  });

  it('keeps configured static credentials ahead of the metadata profile', async () => {
    useMetadataProfile();
    const selected = await loadProvider({
      accessKeyId: 'CONFIG',
      secretAccessKey: 'synthetic-config-secret',
    });
    expect(await selected.callApi('configured credentials')).toMatchObject({
      output: 'synthetic fallback response',
    });
    expect(sageRequests[0].request.headers.authorization).toContain('Credential=CONFIG/');
    expect(metadataRequests).toHaveLength(0);
    expect(stsRequests).toHaveLength(0);
  });

  it('does not give an explicit profile the default chain web-identity fallback', async () => {
    const selected = await loadProvider({ profile: 'fallback' });
    expect(await selected.callApi('explicit profile')).toMatchObject({
      error: expect.stringContaining('Unable to find environment variable credentials'),
    });
    expect(stsRequests).toHaveLength(0);
    expect(sageRequests).toHaveLength(0);
  });

  it('keeps configured static credentials ahead of the selected implicit profile', async () => {
    const selected = await loadProvider({
      accessKeyId: 'CONFIG',
      secretAccessKey: 'synthetic-config-secret',
    });
    expect(await selected.callApi('configured credentials')).toMatchObject({
      output: 'synthetic fallback response',
    });
    expect(sageRequests[0].request.headers.authorization).toContain('Credential=CONFIG/');
    expect(stsRequests).toHaveLength(0);
  });

  it.each([false, true])(
    'prunes shadowed fallback inputs after successful Environment-source selection (explicit=%s)',
    async (explicit) => {
      setEnvironment({
        AWS_ACCESS_KEY_ID: 'ENVIRONMENT_SOURCE',
        AWS_SECRET_ACCESS_KEY: 'synthetic-environment-secret',
      });
      await loadProvider(explicit ? { profile: 'fallback' } : {});
      await overlap(
        () => setEnvironment({ AWS_ROLE_ARN: roleB, AWS_WEB_IDENTITY_TOKEN_FILE: tokenB }),
        ['PROFILE', 'PROFILE', 'PROFILE'],
        true,
      );
      expect(stsRequests).toHaveLength(2);
      expect(stsRequests.every(({ params }) => params.get('Action') === 'AssumeRole')).toBe(true);
    },
  );
});
