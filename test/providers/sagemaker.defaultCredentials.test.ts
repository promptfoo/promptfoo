import { EventEmitter } from 'node:events';
import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
const { externalDataInterceptor, parseKnownFiles } = requireFromSso(
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
  let stsReply: (call: TransportCall, generation: number) => Promise<ReturnType<typeof response>>;
  let sageReply: (call: TransportCall) => Promise<ReturnType<typeof response>>;
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

  function metadataTransport(identities: Record<string, string>, tokenStatus = 200) {
    const calls: { options: http.RequestOptions; destroy: ReturnType<typeof vi.fn> }[] = [];
    vi.mocked(http.request).mockImplementation((options) => {
      const selected = options as http.RequestOptions;
      const identity = identities[String(selected.hostname)];
      expect(identity, 'every metadata destination must be explicitly declared').toBeDefined();
      expect(selected.protocol).toBe('http:');
      expect(selected.timeout).toBe(1000);
      let body: string;
      let statusCode = 200;
      if (selected.path === '/latest/api/token') {
        expect(selected.method).toBe('PUT');
        expect(selected.headers).toEqual({ 'x-aws-ec2-metadata-token-ttl-seconds': '21600' });
        body = `metadata-token-${identity}`;
        statusCode = tokenStatus;
      } else {
        expect(selected.method).toBe('GET');
        expect(selected.headers).toEqual({
          'x-aws-ec2-metadata-token': `metadata-token-${identity}`,
        });
        expect([
          '/latest/meta-data/iam/security-credentials/',
          '/latest/meta-data/iam/security-credentials/instance-role',
        ]).toContain(selected.path);
        body = selected.path?.endsWith('/instance-role')
          ? JSON.stringify({
              AccessKeyId: `IMDS_${identity}`,
              SecretAccessKey: `metadata-secret-${identity}`,
              Token: `metadata-session-${identity}`,
              Expiration: new Date(Date.now() + hour).toISOString(),
            })
          : 'instance-role';
      }
      const destroy = vi.fn();
      calls.push({ options: selected, destroy });
      const request = Object.assign(new EventEmitter(), {
        end: () => {
          queueMicrotask(() => {
            const incoming = Object.assign(new EventEmitter(), { statusCode });
            request.emit('response', incoming);
            if (statusCode === 200) {
              incoming.emit('data', Buffer.from(body));
              incoming.emit('end');
            }
          });
          return request;
        },
        destroy,
      });
      return request as unknown as http.ClientRequest;
    });
    stsReply = async ({ request }) => {
      const parameters = new URLSearchParams(String(request.body));
      expect(parameters.get('Action')).toBe('AssumeRole');
      expect(parameters.get('RoleArn')).toBe('arn:aws:iam::123456789012:role/MetadataRole');
      const identity = /Credential=IMDS_([^/]+)\//.exec(request.headers.authorization)?.[1];
      expect(Object.values(identities)).toContain(identity);
      return response(
        `<AssumeRoleResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/">
<AssumeRoleResult><Credentials>
<AccessKeyId>ROLE_${identity}</AccessKeyId><SecretAccessKey>offline-sts-secret</SecretAccessKey>
<SessionToken>offline-sts-session</SessionToken><Expiration>${new Date(Date.now() + hour).toISOString()}</Expiration>
</Credentials></AssumeRoleResult></AssumeRoleResponse>`,
        'text/xml',
      );
    };
    return calls;
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
    sageReply = async () => response({ output: 'offline response' });
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
    stsReply = async ({ request }, generation) => {
      const action = new URLSearchParams(String(request.body)).get('Action');
      expect(['AssumeRole', 'AssumeRoleWithWebIdentity']).toContain(action);
      return response(
        `<${action}Response xmlns="https://sts.amazonaws.com/doc/2011-06-15/">
<${action}Result><Credentials>
<AccessKeyId>STS_${generation}</AccessKeyId><SecretAccessKey>offline-sts-secret</SecretAccessKey>
<SessionToken>offline-sts-session</SessionToken><Expiration>${new Date(Date.now() + hour).toISOString()}</Expiration>
</Credentials></${action}Result></${action}Response>`,
        'text/xml',
      );
    };
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
      if (
        request.hostname.startsWith('portal.sso.') ||
        request.path === '/federation/credentials'
      ) {
        ssoCalls.push(call);
        return ssoReply(ssoCalls.length);
      }
      if (
        request.hostname.startsWith('sts.') ||
        request.hostname === 'sts-fips.us-east-1.amazonaws.com'
      ) {
        stsCalls.push(call);
        return stsReply(call, stsCalls.length);
      }
      expect(
        request.hostname.startsWith('runtime.sagemaker.') ||
          request.hostname === 'runtime-fips.sagemaker.us-east-1.amazonaws.com' ||
          request.hostname === 'runtime.sagemaker-fips.us-east-1.amazonaws.com',
      ).toBe(true);
      sageCalls.push(call);
      return sageReply(call);
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

  it.each(['comment', 'unrelated profile'])(
    'retains valid SDK role credentials after a config %s edit',
    async (edit) => {
      await configure();
      ssoReply = async () =>
        response({
          roleCredentials: {
            accessKeyId: 'SSO_RETAINED',
            secretAccessKey: 'offline-secret',
            sessionToken: 'offline-session',
            expiration: startTime.getTime() + hour,
          },
        });
      const files = {
        profile: 'named',
        configFilepath: configFile,
        filepath: path.join(directory, 'credentials'),
      };
      const baseline = defaultProvider(files);
      const firstCredentials = await baseline();
      const parsedBefore = await parseKnownFiles(files);
      const provider = createProvider();
      await expectSignedRow(provider, 'SSO_RETAINED');
      expect(ssoCalls).toHaveLength(2);

      // Login has expired, but both providers' issued role credentials remain valid.
      vi.setSystemTime(startTime.getTime() + 120_000);
      await appendFile(
        configFile,
        edit === 'comment'
          ? '\n# unrelated comment\n'
          : '\n[profile unrelated]\nregion = ap-south-1\n',
      );
      // Observe the real SDK's path-keyed file cache; never invent parser freshness.
      expect(await parseKnownFiles(files)).toEqual(parsedBefore);
      expect(await baseline()).toBe(firstCredentials);
      await expectSignedRow(provider, 'SSO_RETAINED');
      expect(ssoCalls).toHaveLength(2);
      expect(sageCalls).toHaveLength(2);
    },
  );

  it('retains adaptive retry quota and throttle state across sequential rows', async () => {
    await configure('', null);
    vi.stubEnv('AWS_SAGEMAKER_MAX_RETRIES', '3');
    const provider = createProvider({
      accessKeyId: 'EXPLICIT',
      secretAccessKey: 'explicit-secret',
    });
    const clients: SageMakerRuntimeClient[] = [];
    const initialize = provider.getSageMakerRuntimeInstance.bind(provider);
    vi.spyOn(provider, 'getSageMakerRuntimeInstance').mockImplementation(async (...args) => {
      const client: SageMakerRuntimeClient = await initialize(...args);
      clients.push(client);
      return client;
    });
    await expectSignedRow(provider, 'EXPLICIT');
    const strategy = await clients[0].config.retryStrategy();
    if (!('acquireInitialRetryToken' in strategy)) {
      throw new Error('Expected the SDK adaptive retry strategy');
    }
    const adaptive = strategy as typeof strategy & {
      standardRetryStrategy: { getCapacity(): number };
      rateLimiter: {
        updateClientSendingRate(error: { errorType: string }): void;
        getSendToken(): Promise<void>;
      };
    };
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const initial = await strategy.acquireInitialRetryToken('');
    await strategy.refreshRetryTokenForRetry(initial, { errorType: 'TRANSIENT' });
    const capacity = adaptive.standardRetryStrategy.getCapacity();
    expect(capacity).toBeLessThan(500);
    adaptive.rateLimiter.updateClientSendingRate({ errorType: 'THROTTLING' });
    const throttleGate = vi.spyOn(adaptive.rateLimiter, 'getSendToken').mockResolvedValue();
    await expectSignedRow(provider, 'EXPLICIT');
    const nextStrategy = await clients[1].config.retryStrategy();
    expect(clients[1]).not.toBe(clients[0]);
    expect(nextStrategy).toBe(strategy);
    expect(throttleGate).toHaveBeenCalledOnce();
    expect(adaptive.standardRetryStrategy.getCapacity()).toBe(capacity + 1);

    vi.stubEnv('AWS_SAGEMAKER_MAX_RETRIES', '1');
    await expectSignedRow(provider, 'EXPLICIT');
    expect(await clients[2].config.retryStrategy()).not.toBe(strategy);
    expect(await clients[2].config.maxAttempts()).toBe(1);
  });

  it('keeps pending clients bound to the defaults inputs selected for each row', async () => {
    await configure('', null);
    vi.stubEnv('AWS_DEFAULTS_MODE', 'standard');
    const provider = createProvider({
      accessKeyId: 'EXPLICIT',
      secretAccessKey: 'explicit-secret',
    });
    const firstStarted = deferred<void>();
    const releaseFirst = deferred<void>();
    const resolveCredentials = provider.getCredentials.bind(provider);
    vi.spyOn(provider, 'getCredentials').mockImplementationOnce(async (...args) => {
      firstStarted.resolve();
      await releaseFirst.promise;
      return resolveCredentials(...args);
    });
    const clients: SageMakerRuntimeClient[] = [];
    const initialize = provider.getSageMakerRuntimeInstance.bind(provider);
    vi.spyOn(provider, 'getSageMakerRuntimeInstance').mockImplementation(async (...args) => {
      const client: SageMakerRuntimeClient = await initialize(...args);
      clients.push(client);
      return client;
    });
    const first = provider.callApi('pending standard');
    await firstStarted.promise;
    try {
      vi.stubEnv('AWS_DEFAULTS_MODE', 'mobile');
      expect(await provider.callApi('mobile')).toMatchObject({ output: 'offline response' });
    } finally {
      vi.stubEnv('AWS_DEFAULTS_MODE', 'standard');
      releaseFirst.resolve();
      expect(await first).toMatchObject({ output: 'offline response' });
    }
    expect(sageCalls).toHaveLength(2);
    expect(
      await Promise.all(
        clients.map(({ config: { defaultsMode } }) =>
          typeof defaultsMode === 'function' ? defaultsMode() : defaultsMode,
        ),
      ),
    ).toEqual(['mobile', 'standard']);
    expect(sageCalls[0].handler).not.toBe(sageCalls[1].handler);
    expect(sageCalls.every(({ handler }) => destroyedHandlers.has(handler))).toBe(true);
  });

  it('resets retry state when retry settings change during overlapping rows', async () => {
    await configure('', null);
    vi.stubEnv('AWS_SAGEMAKER_MAX_RETRIES', '3');
    const provider = createProvider({
      accessKeyId: 'EXPLICIT',
      secretAccessKey: 'explicit-secret',
    });
    const clients: SageMakerRuntimeClient[] = [];
    const initialize = provider.getSageMakerRuntimeInstance.bind(provider);
    vi.spyOn(provider, 'getSageMakerRuntimeInstance').mockImplementation(async (...args) => {
      const client: SageMakerRuntimeClient = await initialize(...args);
      clients.push(client);
      return client;
    });
    const firstSigned = deferred<void>();
    const releaseFirst = deferred<ReturnType<typeof response>>();
    sageReply = async () => {
      if (sageCalls.length === 1) {
        firstSigned.resolve();
        return releaseFirst.promise;
      }
      return response({ output: 'offline response' });
    };
    const first = provider.callApi('three attempts');
    await firstSigned.promise;
    try {
      vi.stubEnv('AWS_SAGEMAKER_MAX_RETRIES', '1');
      expect(await provider.callApi('one attempt')).toMatchObject({ output: 'offline response' });
      vi.stubEnv('AWS_SAGEMAKER_MAX_RETRIES', '3');
      expect(await provider.callApi('three attempts again')).toMatchObject({
        output: 'offline response',
      });
      expect(new Set(clients).size).toBe(3);
      expect(await clients[2].config.retryStrategy()).not.toBe(
        await clients[0].config.retryStrategy(),
      );
      expect(await Promise.all(clients.map((client) => client.config.maxAttempts()))).toEqual([
        3, 1, 3,
      ]);
    } finally {
      releaseFirst.resolve(response({ output: 'offline response' }));
      await first;
    }
    expect(sageCalls.every(({ handler }) => destroyedHandlers.has(handler))).toBe(true);
  });

  it.each(['credentials file', 'config file'] as const)(
    'resolves an explicit standard profile from the %s',
    async (source) => {
      await configure('', 'ignored');
      const fields = 'aws_access_key_id = FILE_STATIC\naws_secret_access_key = file-secret\n';
      if (source === 'credentials file') {
        await writeFile(path.join(directory, 'credentials'), `[configured]\n${fields}`);
      } else {
        await configure(`[profile configured]\n${fields}`, 'ignored');
      }
      vi.stubEnv('AWS_ACCESS_KEY_ID', 'SHADOWED');
      vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'shadowed-secret');
      await expectSignedRow(createProvider({ profile: 'configured' }), 'FILE_STATIC');
      expect(ssoCalls).toHaveLength(0);
      expect(stsCalls).toHaveLength(0);
    },
  );

  it.each(['static', 'SSO', 'environment'] as const)(
    'resolves an explicit role with a %s source and keeps its helper transport separate',
    async (source) => {
      const role =
        '[profile configured]\nrole_arn = arn:aws:iam::123456789012:role/Target\nregion = ap-southeast-2\n';
      await configure(
        role +
          (source === 'environment'
            ? 'credential_source = Environment\n'
            : 'source_profile = source\n' +
              (source === 'SSO'
                ? ssoProfile('source')
                : '[profile source]\naws_access_key_id = STATIC_SOURCE\naws_secret_access_key = static-secret\n')),
        'ignored',
      );
      vi.stubEnv('AWS_ACCESS_KEY_ID', 'ENV_SOURCE_A');
      vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'env-source-a-secret');
      const provider = createProvider({ profile: 'configured' });
      await expectSignedRow(provider, 'STS_1');
      expect(stsCalls[0].request.headers.authorization).toContain(
        `Credential=${source === 'environment' ? 'ENV_SOURCE_A' : source === 'SSO' ? 'SSO_1' : 'STATIC_SOURCE'}/`,
      );
      expect(stsCalls[0].request.headers.authorization).toContain('/ap-southeast-2/sts/');
      expect(stsCalls[0].handler).not.toBe(sageCalls[0].handler);
      expect(destroyedHandlers.has(stsCalls[0].handler)).toBe(false);
      vi.setSystemTime(startTime.getTime() + 120_000);
      vi.stubEnv('AWS_ACCESS_KEY_ID', 'ENV_SOURCE_B');
      vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'env-source-b-secret');
      await expectSignedRow(provider, source === 'environment' ? 'STS_2' : 'STS_1');
      expect(stsCalls).toHaveLength(source === 'environment' ? 2 : 1);
      if (source === 'environment') {
        expect(stsCalls[1].request.headers.authorization).toContain('Credential=ENV_SOURCE_B/');
      }
      expect(stsCalls.every(({ handler }) => !destroyedHandlers.has(handler))).toBe(true);
    },
  );

  it('preserves the SDK error for an unresolved explicit profile', async () => {
    await configure('', null);
    vi.stubEnv('AWS_ACCESS_KEY_ID', 'SHADOWED');
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'shadowed-secret');
    const result = await createProvider({ profile: 'missing' }).callApi('missing profile');
    expect(result.error).toContain('Could not resolve credentials using profile: [missing]');
    expect(result.error).not.toContain('Please install');
    expect(sageCalls).toHaveLength(0);
  });

  it.each(['changed endpoint', 'FIPS', 'dualstack', 'equivalent'] as const)(
    'refreshes an explicit role using %s effective ambient STS policy',
    async (policy) => {
      const sameEndpoint = policy === 'equivalent';
      const serviceEndpoint = policy === 'changed endpoint' || sameEndpoint;
      const firstHostname = serviceEndpoint
        ? 'sts.ambient-a.invalid'
        : 'sts.us-east-1.amazonaws.com';
      const nextHostname = sameEndpoint
        ? firstHostname
        : policy === 'FIPS'
          ? 'sts-fips.us-east-1.amazonaws.com'
          : policy === 'dualstack'
            ? 'sts.us-east-1.api.aws'
            : 'sts.ambient-b.invalid';
      // Both ambient profiles and service sections exist before the first SDK
      // parse. Only the ambient selector changes; no file-cache mutation is used.
      await configure(
        `[profile role]
role_arn = arn:aws:iam::123456789012:role/Target
source_profile = source
role_session_name = offline-profile-session
[profile source]
aws_access_key_id = STATIC_SOURCE
aws_secret_access_key = static-secret
[profile ambient-a]
${serviceEndpoint ? 'services = helper-a' : 'use_fips_endpoint = false\nuse_dualstack_endpoint = false'}
[profile ambient-b]
${serviceEndpoint ? 'services = helper-b' : `use_fips_endpoint = ${policy === 'FIPS'}\nuse_dualstack_endpoint = ${policy === 'dualstack'}`}
[services helper-a]
sts =
  endpoint_url = https://sts.ambient-a.invalid
[services helper-b]
sts =
  endpoint_url = https://sts.ambient-${sameEndpoint ? 'a' : 'b'}.invalid
`,
        'ambient-a',
      );
      stsReply = async ({ request }) => {
        const parameters = new URLSearchParams(String(request.body));
        expect(parameters.get('Action')).toBe('AssumeRole');
        expect(parameters.get('RoleArn')).toBe('arn:aws:iam::123456789012:role/Target');
        expect(parameters.get('RoleSessionName')).toBe('offline-profile-session');
        expect(request.headers.authorization).toContain('Credential=STATIC_SOURCE/');
        expect([firstHostname, nextHostname]).toContain(request.hostname);
        const identity = request.hostname === firstHostname ? 'STS_A' : 'STS_B';
        return response(
          `<AssumeRoleResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/">
<AssumeRoleResult><Credentials>
<AccessKeyId>${identity}</AccessKeyId><SecretAccessKey>offline-sts-secret</SecretAccessKey>
<SessionToken>offline-sts-session</SessionToken><Expiration>${new Date(Date.now() + hour).toISOString()}</Expiration>
</Credentials></AssumeRoleResult></AssumeRoleResponse>`,
          'text/xml',
        );
      };
      const firstSigned = deferred<void>();
      const releaseFirst = deferred<ReturnType<typeof response>>();
      sageReply = async ({ request }) => {
        if (JSON.parse(String(request.body)).prompt === 'held explicit role') {
          firstSigned.resolve();
          return releaseFirst.promise;
        }
        return response({ output: 'offline response' });
      };
      const provider = createProvider({ profile: 'role', region: 'us-east-1' });
      let firstSettled = false;
      const first = provider.callApi('held explicit role').then((result) => {
        firstSettled = true;
        return result;
      });
      try {
        await firstSigned.promise;
        expect(sageCalls[0].request.headers.authorization).toContain('Credential=STS_A/');
        expect(stsCalls[0].request.hostname).toBe(firstHostname);
        vi.stubEnv('AWS_PROFILE', 'ambient-b');
        if (sameEndpoint) {
          vi.setSystemTime(startTime.getTime() + 120_000);
          expect(await provider.callApi('equivalent policy before expiry')).toMatchObject({
            output: 'offline response',
          });
          expect(sageCalls.at(-1)!.request.headers.authorization).toContain('Credential=STS_A/');
          expect(stsCalls).toHaveLength(1);
        }
        // The real outer credential memoizer now requires a fromIni refresh.
        // Its retained roleAssumer must reflect the effective ambient policy.
        vi.setSystemTime(startTime.getTime() + 70 * 60_000);
        expect(await provider.callApi('explicit role after expiry')).toMatchObject({
          output: 'offline response',
        });
        expect(sageCalls.at(-1)!.request.headers.authorization).toContain(
          `Credential=STS_${sameEndpoint ? 'A' : 'B'}/`,
        );
        expect(stsCalls.map(({ request }) => request.hostname)).toEqual([
          firstHostname,
          nextHostname,
        ]);
        if (sameEndpoint) {
          expect(stsCalls[1].handler).toBe(stsCalls[0].handler);
        } else {
          expect(stsCalls[1].handler).not.toBe(stsCalls[0].handler);
          expect(sageCalls.at(-1)!.handler).not.toBe(sageCalls[0].handler);
        }
        expect(firstSettled).toBe(false);
        expect([...handlers].every((handler) => !destroyedHandlers.has(handler))).toBe(true);
      } finally {
        releaseFirst.resolve(response({ output: 'offline response' }));
        expect((await first).error).toBeUndefined();
      }
      expect(sageCalls.every(({ handler }) => destroyedHandlers.has(handler))).toBe(true);
      expect(stsCalls.every(({ handler }) => !destroyedHandlers.has(handler))).toBe(true);
    },
  );

  it.each(['configured keys', 'static profile'] as const)(
    'keeps %s independent of ambient STS service-profile changes',
    async (source) => {
      await configure(
        `[profile configured]
aws_access_key_id = FILE_STATIC
aws_secret_access_key = file-secret
[profile ambient-a]
services = helper-a
[profile ambient-b]
services = helper-b
[services helper-a]
sts =
  endpoint_url = https://sts.ambient-a.invalid
[services helper-b]
sts =
  endpoint_url = https://sts.ambient-b.invalid
`,
        'ambient-a',
      );
      const provider = createProvider({
        profile: 'configured',
        ...(source === 'configured keys'
          ? { accessKeyId: 'EXPLICIT', secretAccessKey: 'explicit-secret' }
          : {}),
      });
      const key = source === 'configured keys' ? 'EXPLICIT' : 'FILE_STATIC';
      await expectSignedRow(provider, key);
      vi.stubEnv('AWS_PROFILE', 'ambient-b');
      vi.setSystemTime(startTime.getTime() + 70 * 60_000);
      await expectSignedRow(provider, key);
      expect(stsCalls).toHaveLength(0);
      expect(ssoCalls).toHaveLength(0);
    },
  );

  it.each(['endpoint', 'recursive endpoint mode'] as const)(
    'selects an explicit metadata role from the changed ambient %s',
    async (selection) => {
      const mode = selection === 'recursive endpoint mode';
      const firstHost = mode ? '169.254.169.254' : 'metadata-a.invalid';
      const nextHost = mode ? 'fd00:ec2::254' : 'metadata-b.invalid';
      const metadata = metadataTransport({ [firstHost]: 'A', [nextHost]: 'B' });
      await configure(
        `[profile role]
role_arn = arn:aws:iam::123456789012:role/MetadataRole
${mode ? 'source_profile = metadata-source\n[profile metadata-source]' : ''}
credential_source = Ec2InstanceMetadata
[profile ambient-a]
${mode ? 'ec2_metadata_service_endpoint_mode = IPv4' : 'ec2_metadata_service_endpoint = http://metadata-a.invalid'}
[profile ambient-b]
${mode ? 'ec2_metadata_service_endpoint_mode = IPv6' : 'ec2_metadata_service_endpoint = http://metadata-b.invalid'}
`,
        'ambient-a',
      );
      expect(process.env.AWS_EC2_METADATA_SERVICE_ENDPOINT).toBeUndefined();
      expect(process.env.AWS_EC2_METADATA_SERVICE_ENDPOINT_MODE).toBeUndefined();
      const provider = createProvider({ profile: 'role' });
      await expectSignedRow(provider, 'ROLE_A');
      vi.setSystemTime(startTime.getTime() + 120_000);
      await expectSignedRow(provider, 'ROLE_A');
      expect(metadata).toHaveLength(3);
      expect(stsCalls).toHaveLength(1);

      // Both ambient profiles were parsed before the first call. Their STS
      // policies are identical, and the first assumed role is still valid.
      vi.stubEnv('AWS_PROFILE', 'ambient-b');
      await expectSignedRow(provider, 'ROLE_B');
      expect(metadata.map(({ options }) => options.hostname)).toEqual([
        firstHost,
        firstHost,
        firstHost,
        nextHost,
        nextHost,
        nextHost,
      ]);
      expect(stsCalls.map(({ request }) => request.headers.authorization)).toEqual([
        expect.stringContaining('Credential=IMDS_A/'),
        expect.stringContaining('Credential=IMDS_B/'),
      ]);
      expect(stsCalls[1].request.hostname).toBe(stsCalls[0].request.hostname);
      expect(stsCalls.every(({ handler }) => !destroyedHandlers.has(handler))).toBe(true);
      expect(metadata.every(({ destroy }) => destroy.mock.calls.length === 1)).toBe(true);
    },
  );

  it('keeps initialization metadata results out of a previous ambient profile scope', async () => {
    const metadata = metadataTransport({ 'metadata-a.invalid': 'A', 'metadata-b.invalid': 'B' });
    await configure(
      `[profile role]
role_arn = arn:aws:iam::123456789012:role/MetadataRole
credential_source = Ec2InstanceMetadata
[profile ambient-a]
ec2_metadata_service_endpoint = http://metadata-a.invalid
[profile ambient-b]
ec2_metadata_service_endpoint = http://metadata-b.invalid
`,
      'ambient-a',
    );
    const provider = createProvider({ profile: 'role' });
    const captured = deferred<void>();
    const resume = deferred<void>();
    const getCredentials = provider.getCredentials.bind(provider);
    const delegation = vi
      .spyOn(provider, 'getCredentials')
      .mockImplementationOnce(async (...args) => {
        captured.resolve();
        await resume.promise;
        return getCredentials(...args);
      });
    const first = provider.callApi('metadata initialization');
    try {
      await captured.promise;
      expect(metadata).toHaveLength(0);
      vi.stubEnv('AWS_PROFILE', 'ambient-b');
      resume.resolve();
      expect(await first).toMatchObject({ output: 'offline response' });
      // Keep the actual later SDK result; the fix must reject future retention,
      // not rewrite the credential profile or pretend resolution was atomic.
      expect(sageCalls[0].request.headers.authorization).toContain('Credential=ROLE_B/');
      expect(metadata.map(({ options }) => options.hostname)).toEqual([
        'metadata-b.invalid',
        'metadata-b.invalid',
        'metadata-b.invalid',
      ]);
      vi.stubEnv('AWS_PROFILE', 'ambient-a');
      await expectSignedRow(provider, 'ROLE_A');
      expect(metadata.slice(3).map(({ options }) => options.hostname)).toEqual([
        'metadata-a.invalid',
        'metadata-a.invalid',
        'metadata-a.invalid',
      ]);
      expect(stsCalls.map(({ request }) => request.headers.authorization)).toEqual([
        expect.stringContaining('Credential=IMDS_B/'),
        expect.stringContaining('Credential=IMDS_A/'),
      ]);
    } finally {
      resume.resolve();
      await first;
      delegation.mockRestore();
    }
    expect(metadata.every(({ destroy }) => destroy.mock.calls.length === 1)).toBe(true);
    expect(stsCalls.every(({ handler }) => !destroyedHandlers.has(handler))).toBe(true);
  });

  it('keeps metadata v1 disabling owned by the explicit credential profile', async () => {
    const metadata = metadataTransport({ 'metadata-a.invalid': 'A' }, 403);
    await configure(
      `[profile role]
role_arn = arn:aws:iam::123456789012:role/MetadataRole
credential_source = Ec2InstanceMetadata
ec2_metadata_v1_disabled = true
[profile ambient-a]
ec2_metadata_service_endpoint = http://metadata-a.invalid
ec2_metadata_v1_disabled = false
`,
      'ambient-a',
    );
    const result = await createProvider({ profile: 'role' }).callApi('blocked v1 fallback');
    expect(result.error).toContain('AWS EC2 Metadata v1 fallback has been blocked');
    expect(result.error).toContain('config file profile');
    expect(metadata).toHaveLength(1);
    expect(metadata[0].options.path).toBe('/latest/api/token');
    expect(metadata[0].destroy).toHaveBeenCalledOnce();
    expect(stsCalls).toHaveLength(0);
    expect(sageCalls).toHaveLength(0);
  });

  it.each([
    ['AWS_ACCESS_KEY_ID', 'SHADOWED'],
    ['AWS_SECRET_ACCESS_KEY', 'shadowed-secret'],
    ['AWS_SESSION_TOKEN', 'shadowed-token'],
    ['AWS_PROFILE', 'ignored-profile'],
    ['AWS_ROLE_ARN', 'arn:aws:iam::123456789012:role/Unused'],
    ['AWS_WEB_IDENTITY_TOKEN_FILE', '/offline/unused-token'],
    ['AWS_CONTAINER_CREDENTIALS_FULL_URI', 'http://127.0.0.1:1/unused'],
    ['AWS_EC2_METADATA_SERVICE_ENDPOINT', 'http://127.0.0.1:1/unused'],
    ['AWS_ENDPOINT_URL_STS', 'http://127.0.0.1:1/unused'],
    ['AWS_ENDPOINT_URL_SSO_OIDC', 'http://127.0.0.1:1/unused'],
    ['AWS_ENDPOINT_URL_SIGNIN', 'http://127.0.0.1:1/unused'],
  ] as const)('retains explicit SSO credentials when shadowed %s changes', async (name, value) => {
    await configure(ssoProfile('configured'));
    const provider = createProvider({ profile: 'configured' });
    await expectSignedRow(provider, 'SSO_1');
    vi.setSystemTime(startTime.getTime() + 120_000);
    vi.stubEnv(name, value);
    await expectSignedRow(provider, 'SSO_1');
    expect(ssoCalls).toHaveLength(1);
  });

  it('retains implicit default SSO credentials after unrelated STS rotation and activates environment keys', async () => {
    await configure(ssoProfile('default'), null);
    const provider = createProvider();
    await expectSignedRow(provider, 'SSO_1');
    vi.setSystemTime(startTime.getTime() + 120_000);
    vi.stubEnv('AWS_ENDPOINT_URL_STS', 'http://127.0.0.1:1/unused');
    await expectSignedRow(provider, 'SSO_1');
    expect(ssoCalls).toHaveLength(1);
    expect(stsCalls).toHaveLength(0);

    vi.stubEnv('AWS_ACCESS_KEY_ID', 'ACTIVATED_ENV');
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'activated-env-secret');
    await expectSignedRow(provider, 'ACTIVATED_ENV');
    expect(ssoCalls).toHaveLength(1);
  });

  it.each([
    ['explicit', 'AWS_ENDPOINT_URL'],
    ['explicit', 'AWS_ENDPOINT_URL_SSO'],
    ['named', 'AWS_ENDPOINT_URL'],
    ['named', 'AWS_ENDPOINT_URL_SSO'],
    ['default', 'AWS_ENDPOINT_URL'],
    ['default', 'AWS_ENDPOINT_URL_SSO'],
    ['shared-ignore', 'AWS_ENDPOINT_URL'],
    ['shared-ignore', 'AWS_ENDPOINT_URL_SSO'],
  ] as const)('retains %s SSO credentials when ignored %s changes', async (source, variable) => {
    const sharedIgnore = source === 'shared-ignore';
    await configure(
      ssoProfile(source === 'default' ? 'default' : 'named') +
        (sharedIgnore ? '[default]\nignore_configured_endpoint_urls = true\n' : ''),
      source === 'named' ? 'named' : null,
    );
    vi.stubEnv('AWS_IGNORE_CONFIGURED_ENDPOINT_URLS', sharedIgnore ? undefined : 'true');
    vi.stubEnv(variable, 'https://ignored-before.invalid');
    const provider = createProvider(
      source === 'explicit' || sharedIgnore ? { profile: 'named' } : {},
    );
    await expectSignedRow(provider, 'SSO_1');
    expect(ssoCalls[0].request.hostname).toBe('portal.sso.eu-west-1.amazonaws.com');
    vi.setSystemTime(startTime.getTime() + 120_000);
    vi.stubEnv(variable, 'https://ignored-after.invalid');
    await expectSignedRow(provider, 'SSO_1');
    expect(ssoCalls).toHaveLength(1);
  });

  it.each(['explicit', 'default'] as const)(
    'retains %s SSO credentials when the common endpoint is shadowed',
    async (source) => {
      await configure(ssoProfile(source === 'default' ? 'default' : 'named'), null);
      vi.stubEnv('AWS_IGNORE_CONFIGURED_ENDPOINT_URLS', 'false');
      vi.stubEnv('AWS_ENDPOINT_URL_SSO', 'https://selected-sso.invalid');
      vi.stubEnv(
        'AWS_ENDPOINT_URL_SAGEMAKER_RUNTIME',
        'https://runtime.sagemaker.us-west-2.amazonaws.com',
      );
      vi.stubEnv('AWS_ENDPOINT_URL', 'https://shadowed-before.invalid');
      const provider = createProvider(source === 'explicit' ? { profile: 'named' } : {});
      await expectSignedRow(provider, 'SSO_1');
      expect(ssoCalls[0].request.hostname).toBe('selected-sso.invalid');
      vi.setSystemTime(startTime.getTime() + 120_000);
      vi.stubEnv('AWS_ENDPOINT_URL', 'https://shadowed-after.invalid');
      await expectSignedRow(provider, 'SSO_1');
      expect(ssoCalls).toHaveLength(1);
    },
  );

  it('replaces retained SSO credentials when the endpoint ignore selector changes', async () => {
    await configure(ssoProfile('named'), null);
    vi.stubEnv('AWS_IGNORE_CONFIGURED_ENDPOINT_URLS', 'true');
    vi.stubEnv('AWS_ENDPOINT_URL_SSO', 'https://selected-sso.invalid');
    const provider = createProvider({ profile: 'named' });
    await expectSignedRow(provider, 'SSO_1');
    expect(ssoCalls[0].request.hostname).toBe('portal.sso.eu-west-1.amazonaws.com');
    vi.setSystemTime(startTime.getTime() + 120_000);
    vi.stubEnv('AWS_IGNORE_CONFIGURED_ENDPOINT_URLS', 'false');
    expect(await provider.callApi('changed ignore')).toMatchObject({
      error: expect.stringContaining('The SSO session associated with this profile has expired'),
    });
    expect(ssoCalls).toHaveLength(1);
    expect(sageCalls).toHaveLength(1);
  });

  it('replaces SSO credentials when a blank service URL leaves the common URL effective', async () => {
    await configure(ssoProfile('named'), null);
    vi.stubEnv('AWS_ENDPOINT_URL_SSO', '');
    vi.stubEnv('AWS_ENDPOINT_URL', 'https://selected-sso.invalid');
    vi.stubEnv(
      'AWS_ENDPOINT_URL_SAGEMAKER_RUNTIME',
      'https://runtime.sagemaker.us-west-2.amazonaws.com',
    );
    const provider = createProvider({ profile: 'named' });
    await expectSignedRow(provider, 'SSO_1');
    expect(ssoCalls[0].request.hostname).toBe('selected-sso.invalid');
    vi.setSystemTime(startTime.getTime() + 120_000);
    vi.stubEnv('AWS_ENDPOINT_URL', 'https://changed-sso.invalid');
    expect(await provider.callApi('changed common endpoint')).toMatchObject({
      error: expect.stringContaining('The SSO session associated with this profile has expired'),
    });
    expect(ssoCalls).toHaveLength(1);
    expect(sageCalls).toHaveLength(1);
  });

  it('replaces explicit SSO credentials when its effective helper endpoint changes', async () => {
    await configure(ssoProfile('configured'));
    const provider = createProvider({ profile: 'configured' });
    await expectSignedRow(provider, 'SSO_1');
    vi.setSystemTime(startTime.getTime() + 120_000);
    vi.stubEnv('AWS_ENDPOINT_URL_SSO', 'http://127.0.0.1:1/changed');
    expect(await provider.callApi('changed helper')).toMatchObject({
      error: expect.stringContaining('The SSO session associated with this profile has expired'),
    });
    expect(sageCalls).toHaveLength(1);
    expect(ssoCalls).toHaveLength(1);
  });

  it('signs a reused region with rotated environment credentials while an older row is active', async () => {
    await configure('', null);
    vi.stubEnv('AWS_REGION', 'us-east-1');
    vi.stubEnv('AWS_ACCESS_KEY_ID', 'ACCOUNT_A');
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'account-a-secret');
    const provider = createProvider({ region: undefined });
    const firstSigned = deferred<void>();
    const releaseFirst = deferred<ReturnType<typeof response>>();
    sageReply = async () => {
      if (sageCalls.length === 1) {
        firstSigned.resolve();
        return releaseFirst.promise;
      }
      return response({ output: 'offline response' });
    };
    const first = provider.callApi('east A');
    await firstSigned.promise;
    try {
      vi.stubEnv('AWS_REGION', 'us-west-2');
      vi.stubEnv('AWS_ACCESS_KEY_ID', 'ACCOUNT_B');
      vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'account-b-secret');
      expect(await provider.callApi('west B')).toMatchObject({ output: 'offline response' });
      vi.stubEnv('AWS_REGION', 'us-east-1');
      expect(await provider.callApi('east B')).toMatchObject({ output: 'offline response' });
      expect(sageCalls.map(({ request }) => request.headers.authorization)).toEqual([
        expect.stringContaining('Credential=ACCOUNT_A/'),
        expect.stringContaining('Credential=ACCOUNT_B/'),
        expect.stringContaining('Credential=ACCOUNT_B/'),
      ]);
      expect(destroyedHandlers.has(sageCalls[0].handler)).toBe(false);
    } finally {
      releaseFirst.resolve(response({ output: 'offline response' }));
      await first;
    }
    expect(new Set(sageCalls.map(({ handler }) => handler)).size).toBe(3);
    expect(sageCalls.every(({ handler }) => destroyedHandlers.has(handler))).toBe(true);
  });

  it('does not share pending clients after explicit credentials change', async () => {
    await configure('', null);
    const provider = createProvider({ accessKeyId: 'ACCOUNT_A', secretAccessKey: 'a-secret' });
    const firstStarted = deferred<void>();
    const releaseFirst = deferred<void>();
    const resolveCredentials = provider.getCredentials.bind(provider);
    vi.spyOn(provider, 'getCredentials').mockImplementation(async (config) => {
      const credentials = await resolveCredentials(config);
      if (config?.accessKeyId === 'ACCOUNT_A') {
        firstStarted.resolve();
        await releaseFirst.promise;
      }
      return credentials;
    });
    const first = provider.callApi('pending A');
    await firstStarted.promise;
    provider.config.accessKeyId = 'ACCOUNT_B';
    provider.config.secretAccessKey = 'b-secret';
    const second = provider.callApi('pending B');
    releaseFirst.resolve();
    expect(await Promise.all([first, second])).toEqual([
      expect.objectContaining({ output: 'offline response' }),
      expect.objectContaining({ output: 'offline response' }),
    ]);
    expect(sageCalls.map(({ request }) => request.headers.authorization)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Credential=ACCOUNT_A/'),
        expect.stringContaining('Credential=ACCOUNT_B/'),
      ]),
    );
    expect(new Set(sageCalls.map(({ handler }) => handler)).size).toBe(2);
    expect(sageCalls.every(({ handler }) => destroyedHandlers.has(handler))).toBe(true);
  });

  it.each(['AWS_PROFILE', 'default', 'assume-role', 'explicit profile'] as const)(
    'keeps valid %s role credentials while tuning inference after the login expires',
    async (source) => {
      const isRole = source === 'assume-role';
      const contents = isRole
        ? `[profile named]\nrole_arn = arn:aws:iam::123456789012:role/Target\nsource_profile = source\n${ssoProfile('source')}`
        : ssoProfile(source === 'default' ? 'default' : 'named');
      await configure(
        contents,
        source === 'default' || source === 'explicit profile' ? null : 'named',
      );
      const provider = createProvider({
        modelType: 'openai',
        responseFormat: { path: 'json.output' },
        ...(source === 'explicit profile' ? { profile: 'named' } : {}),
      });
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

      // The login is expired, but the issued role credentials have 58 minutes
      // left. Rebuilding Sage clients must not make inference tuning log in again.
      for (const [variable, field, value, fallback] of [
        ['AWS_SAGEMAKER_TEMPERATURE', 'temperature', '0.2', 0.7],
        ['AWS_SAGEMAKER_MAX_TOKENS', 'max_tokens', '64', 1024],
        ['AWS_SAGEMAKER_TOP_P', 'top_p', '0.8', 1],
      ] as const) {
        vi.stubEnv(variable, value);
        await expectSignedRow(provider, isRole ? 'STS_1' : 'SSO_1');
        expect(JSON.parse(String(sageCalls.at(-1)!.request.body))[field]).toBe(Number(value));
        vi.stubEnv(variable, undefined);
        await expectSignedRow(provider, isRole ? 'STS_1' : 'SSO_1');
        expect(JSON.parse(String(sageCalls.at(-1)!.request.body))[field]).toBe(fallback);
      }
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

  it('coalesces passive refresh across consecutive public calls with unchanged scope', async () => {
    await configure();
    const provider = createProvider();
    await expectSignedRow(provider, 'SSO_1');
    vi.setSystemTime(startTime.getTime() + 56 * 60_000);
    renewToken();
    const passiveStarted = deferred<void>();
    const duplicateStarted = deferred<void>();
    const passive = deferred<ReturnType<typeof response>>();
    const duplicate = deferred<ReturnType<typeof response>>();
    const normalReply = ssoReply;
    ssoReply = async (generation) => {
      if (generation === 2) {
        passiveStarted.resolve();
        return passive.promise;
      }
      expect(generation, 'no extra authentication beyond the diagnosed duplicate').toBe(3);
      duplicateStarted.resolve();
      return duplicate.promise;
    };
    const controller = new AbortController();
    let third: ReturnType<SageMakerCompletionProvider['callApi']> | undefined;
    try {
      await expectSignedRow(provider, 'SSO_1');
      await passiveStarted.promise;
      expect(ssoCalls).toHaveLength(2);
      third = provider.callApi('consecutive cached row', undefined, {
        abortSignal: controller.signal,
      });
      // A duplicate foreground request is observable without sleeping or
      // letting the failing call wait for a test timeout.
      const outcome = await Promise.race([
        third.then(() => 'cached public completion'),
        duplicateStarted.promise.then(() => 'duplicate foreground authentication'),
      ]);
      expect(outcome).toBe('cached public completion');
      expect(await third).toMatchObject({ output: 'offline response' });
      expect(sageCalls.at(-1)!.request.headers.authorization).toContain('Credential=SSO_1/');
      expect(ssoCalls).toHaveLength(2);
      expect(provider.sagemakerRuntime).toBeUndefined();

      passive.resolve(await normalReply(2));
      // Complete the buffered SDK response and its passive memoizer update.
      // The next observation remains a public call, never a saved client getter.
      await new Promise<void>((resolve) => setImmediate(resolve));
      await expectSignedRow(provider, 'SSO_2');
      expect(ssoCalls).toHaveLength(2);
    } finally {
      controller.abort(new Error('credential fixture finalizer'));
      passive.resolve(await normalReply(2));
      duplicate.resolve(await normalReply(3));
      if (third) {
        await Promise.allSettled([third]);
      }
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    expect(sageCalls.every(({ handler }) => destroyedHandlers.has(handler))).toBe(true);
    expect(ssoCalls.every(({ handler }) => !destroyedHandlers.has(handler))).toBe(true);
  });

  it('does not reuse an implicit SSO state populated after a passive token-read pause', async () => {
    await configure();
    vi.stubEnv('AWS_ENDPOINT_URL_SSO', 'https://sso-a.invalid');
    ssoReply = async (generation) => {
      const hostname = ssoCalls[generation - 1].request.hostname;
      expect(['sso-a.invalid', 'sso-b.invalid']).toContain(hostname);
      return response({
        roleCredentials: {
          accessKeyId: hostname === 'sso-a.invalid' ? 'SSO_A' : 'SSO_B',
          secretAccessKey: 'offline-secret',
          sessionToken: 'offline-session',
          expiration: Date.now() + hour,
        },
      });
    };
    const firstSigned = deferred<void>();
    const releaseFirst = deferred<ReturnType<typeof response>>();
    sageReply = async ({ request }) => {
      if (JSON.parse(String(request.body)).prompt === 'held passive east') {
        firstSigned.resolve();
        return releaseFirst.promise;
      }
      return response({ output: 'offline response' });
    };
    const provider = createProvider({ region: 'us-east-1' });
    const tokenRecord = externalDataInterceptor.getTokenRecord();
    const tokenReadStarted = deferred<void>();
    const tokenRead = deferred<{ accessToken: string; expiresAt: string }>();
    const token = {
      accessToken: 'offline-sso-token',
      expiresAt: new Date(startTime.getTime() + 2 * hour).toISOString(),
    };
    const originalToken = Object.getOwnPropertyDescriptor(tokenRecord, startUrl)!;
    let firstSettled = false;
    const first = provider.callApi('held passive east').then((result) => {
      firstSettled = true;
      return result;
    });
    try {
      await firstSigned.promise;
      expect(sageCalls[0].request.headers.authorization).toContain('Credential=SSO_A/');
      vi.setSystemTime(startTime.getTime() + 56 * 60_000);
      // getSSOTokenFromFile is still the real async SDK function. Returning a
      // pending token-cache value pauses it before SSOClient construction.
      Object.defineProperty(tokenRecord, startUrl, {
        configurable: true,
        get: () => {
          tokenReadStarted.resolve();
          return tokenRead.promise;
        },
      });
      expect(await provider.callApi('cached passive east')).toMatchObject({
        output: 'offline response',
      });
      expect(sageCalls[1].request.headers.authorization).toContain('Credential=SSO_A/');
      await tokenReadStarted.promise;
      expect(ssoCalls).toHaveLength(1);

      // The cached public call and its before/after consistency checks are over.
      // Only the still-pending SDK passive refresh can now consume endpoint B.
      vi.stubEnv('AWS_ENDPOINT_URL_SSO', 'https://sso-b.invalid');
      Object.defineProperty(tokenRecord, startUrl, { ...originalToken, value: token });
      tokenRead.resolve(token);
      await vi.waitFor(() => expect(ssoCalls).toHaveLength(2));
      expect(ssoCalls[1].request.hostname).toBe('sso-b.invalid');
      // The intercepted HTTP response is fully buffered. Drain its promise work
      // without asking the old credential provider to observe endpoint B.
      await new Promise<void>((resolve) => setImmediate(resolve));

      provider.config.region = 'us-west-2';
      expect(await provider.callApi('passive west')).toMatchObject({ output: 'offline response' });
      expect(sageCalls[2].request.headers.authorization).toContain('Credential=SSO_B/');
      vi.stubEnv('AWS_ENDPOINT_URL_SSO', 'https://sso-a.invalid');
      provider.config.region = 'us-east-1';
      expect(await provider.callApi('restored passive east')).toMatchObject({
        output: 'offline response',
      });
      expect(sageCalls[3].request.headers.authorization).toContain('Credential=SSO_A/');
      expect(sageCalls[3].handler).not.toBe(sageCalls[0].handler);
      expect(ssoCalls.map(({ request }) => request.hostname)).toEqual([
        'sso-a.invalid',
        'sso-b.invalid',
        'sso-b.invalid',
        'sso-a.invalid',
      ]);
      expect(firstSettled).toBe(false);
      expect([...handlers].every((handler) => !destroyedHandlers.has(handler))).toBe(true);
    } finally {
      Object.defineProperty(tokenRecord, startUrl, originalToken);
      tokenRead.resolve(token);
      releaseFirst.resolve(response({ output: 'offline response' }));
      expect((await first).error).toBeUndefined();
    }
    expect(sageCalls.every(({ handler }) => destroyedHandlers.has(handler))).toBe(true);
    expect(ssoCalls.every(({ handler }) => !destroyedHandlers.has(handler))).toBe(true);
  });

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
      vi.setSystemTime(startTime.getTime() + 120_000);
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
      expect(await provider.callApi('changed credential source')).toMatchObject({
        error: expect.stringContaining('The SSO session associated with this profile has expired'),
      });
      expect(sageCalls).toHaveLength(1);
      expect(ssoCalls).toHaveLength(1);
      renewToken();
      await expectSignedRow(provider, 'SSO_2');
      expect(ssoCalls).toHaveLength(2);
      expect(sageCalls[1].request.headers.authorization).toContain(
        `/${provider.config.region}/sagemaker/`,
      );
    },
  );

  it('retains valid credentials after a profile file edit and refreshes the SDK-cached profile at expiry', async () => {
    await configure(ssoProfile());
    const provider = createProvider();
    await expectSignedRow(provider, 'SSO_1');
    vi.setSystemTime(startTime.getTime() + 120_000);
    await writeFile(configFile, ssoProfile().replace('TestRole', 'ChangedRole'));

    // The SDK caches shared-file text. Editing it does not invalidate still-valid
    // role credentials or promise an in-place profile reload.
    await expectSignedRow(provider, 'SSO_1');
    expect(ssoCalls).toHaveLength(1);
    vi.setSystemTime(startTime.getTime() + hour + 1_000);
    expect(await provider.callApi('expired role after file edit')).toMatchObject({
      error: expect.stringContaining('The SSO session associated with this profile has expired'),
    });
    expect(sageCalls).toHaveLength(2);
    expect(ssoCalls).toHaveLength(1);

    renewToken();
    await expectSignedRow(provider, 'SSO_2');
    expect(ssoCalls).toHaveLength(2);
    expect(ssoCalls[1].request.query?.role_name).toBe('TestRole');
  });

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
