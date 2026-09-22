import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { HttpResponse } from '@smithy/core/transport';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SageMakerCompletionProvider } from '../../src/providers/sagemaker';
import { mockProcessEnv } from '../util/utils';
import type { HttpRequest } from '@smithy/core/transport';
import type { NodeHttpHandler as HttpHandler } from '@smithy/node-http-handler';

vi.mock('../../src/cache', () => ({ isCacheEnabled: () => false, getCache: vi.fn() }));
vi.mock('../../src/telemetry', () => ({ default: { record: vi.fn() } }));

// These are the CJS instances used by the actual SDK credential providers.
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

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function response(body: unknown) {
  return {
    response: new HttpResponse({
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: Buffer.from(JSON.stringify(body)),
    }),
  };
}

type SignedCall = { request: HttpRequest; handler: HttpHandler };

describe('SageMaker ownership of reusable SDK credentials', () => {
  let directory: string;
  let configFile: string;
  let provider: SageMakerCompletionProvider | undefined;
  let restoreEnvironments: (() => void)[];
  let server: http.Server | undefined;
  let metadataAddress: { port: number } | undefined;
  let metadataStarted: ReturnType<typeof deferred>;
  let releaseMetadata: ReturnType<typeof deferred>;
  let credentialsStarted: ReturnType<typeof deferred>;
  let releaseCredentials: ReturnType<typeof deferred>;
  let pauseCredentials: boolean;
  let firstSigned: ReturnType<typeof deferred>;
  let releaseFirst: ReturnType<typeof deferred>;
  let pending: Promise<unknown>[];
  let metadataPaths: string[];
  let sageCalls: SignedCall[];
  let ssoCalls: SignedCall[];
  let handlers: Set<HttpHandler>;
  let destroyedHandlers: Set<HttpHandler>;
  let startUrl: string;

  function setEnvironment(values: Record<string, string | undefined>) {
    restoreEnvironments.push(mockProcessEnv(values));
  }

  function renewLogin(expiresAt: number) {
    externalDataInterceptor.interceptToken(startUrl, {
      accessToken: 'synthetic-ownership-login',
      expiresAt: new Date(expiresAt).toISOString(),
    });
  }

  async function expectSignedRow(label: string, key: string, region: string) {
    expect(await provider!.callApi(label)).toMatchObject({ output: 'signed response' });
    expect(sageCalls.at(-1)!.request.headers.authorization).toContain(
      `Credential=${key}/20260101/${region}/sagemaker/`,
    );
  }

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(startTime);
    directory = await mkdtemp(path.join(tmpdir(), 'sage-credential-ownership-'));
    configFile = path.join(directory, 'config');
    await writeFile(configFile, '');
    await writeFile(path.join(directory, 'credentials'), '');
    restoreEnvironments = [];
    setEnvironment({
      ...Object.fromEntries(
        Object.keys(process.env)
          .filter((name) => name.startsWith('AWS_'))
          .map((name) => [name, undefined]),
      ),
      AWS_CONFIG_FILE: configFile,
      AWS_SHARED_CREDENTIALS_FILE: path.join(directory, 'credentials'),
      AWS_EC2_METADATA_DISABLED: 'true',
      AWS_DEFAULTS_MODE: 'legacy',
      AWS_REGION: 'us-east-1',
      AWS_MAX_ATTEMPTS: '1',
      AWS_SAGEMAKER_MAX_RETRIES: '1',
    });
    metadataStarted = deferred();
    releaseMetadata = deferred();
    credentialsStarted = deferred();
    releaseCredentials = deferred();
    pauseCredentials = false;
    firstSigned = deferred();
    releaseFirst = deferred();
    pending = [];
    metadataPaths = [];
    sageCalls = [];
    ssoCalls = [];
    handlers = new Set();
    destroyedHandlers = new Set();
    startUrl = `https://offline.example/${path.basename(directory)}`;
    const originalRequest = http.request;
    vi.spyOn(http, 'request').mockImplementation(((
      options: http.RequestOptions,
      callback: Parameters<typeof http.request>[1],
    ) => {
      if (
        !metadataAddress ||
        options.hostname !== '127.0.0.1' ||
        String(options.port) !== String(metadataAddress.port)
      ) {
        throw new Error('Unexpected HTTP in credential ownership test');
      }
      return originalRequest(options, callback as never);
    }) as typeof http.request);
    vi.spyOn(https, 'request').mockImplementation(() => {
      throw new Error('Unexpected HTTPS in credential ownership test');
    });
    const destroy = NodeHttpHandler.prototype.destroy;
    vi.spyOn(NodeHttpHandler.prototype, 'destroy').mockImplementation(function (this: HttpHandler) {
      destroyedHandlers.add(this);
      return destroy.call(this);
    });
    const handle = NodeHttpHandler.prototype.handle;
    vi.spyOn(NodeHttpHandler.prototype, 'handle').mockImplementation(async function (
      this: HttpHandler,
      request,
      options,
    ) {
      expect(destroyedHandlers.has(this)).toBe(false);
      handlers.add(this);
      if (
        metadataAddress &&
        request.hostname === '127.0.0.1' &&
        request.port === metadataAddress.port
      ) {
        return handle.call(this, request, options);
      }
      const call = { request, handler: this };
      if (request.hostname === 'portal.sso.eu-west-1.amazonaws.com') {
        expect(request.path).toBe('/federation/credentials');
        ssoCalls.push(call);
        return response({
          roleCredentials: {
            accessKeyId: `SSO_${ssoCalls.length}`,
            secretAccessKey: 'synthetic-role-secret',
            sessionToken: 'synthetic-role-session',
            expiration: Date.now() + hour,
          },
        });
      }
      expect(request.hostname).toMatch(
        /^(runtime\.sagemaker\.(us-east-1|us-west-2)\.amazonaws\.com|sage-[ab]\.example)$/,
      );
      sageCalls.push(call);
      if (sageCalls.length === 1) {
        firstSigned.resolve();
        await releaseFirst.promise;
      }
      return response({ output: 'signed response' });
    });
  });

  afterEach(async () => {
    releaseMetadata.resolve();
    releaseCredentials.resolve();
    releaseFirst.resolve();
    await Promise.allSettled(pending);
    provider?.cleanup();
    provider = undefined;
    for (const handler of handlers) {
      if (!destroyedHandlers.has(handler)) {
        handler.destroy();
      }
    }
    Reflect.deleteProperty(externalDataInterceptor.getTokenRecord(), startUrl);
    if (server) {
      await new Promise<void>((resolve, reject) =>
        server!.close((error) => (error ? reject(error) : resolve())),
      );
      server = undefined;
    }
    metadataAddress = undefined;
    vi.restoreAllMocks();
    vi.useRealTimers();
    for (const restore of restoreEnvironments.reverse()) {
      restore();
    }
    await rm(directory, { recursive: true, force: true });
  });

  async function startMetadataServer() {
    server = http.createServer(async (request, reply) => {
      metadataPaths.push(request.url!);
      if (request.url === '/latest/api/token') {
        reply.end('synthetic-imds-token');
      } else if (request.url === '/latest/meta-data/placement/region') {
        if (metadataPaths.length === 2) {
          metadataStarted.resolve();
          await releaseMetadata.promise;
        }
        reply.end('us-east-1');
      } else if (request.url === '/credentials/a' || request.url === '/credentials/b') {
        if (pauseCredentials && request.url === '/credentials/a') {
          credentialsStarted.resolve();
          await releaseCredentials.promise;
        }
        const account = request.url.endsWith('/a') ? 'A' : 'B';
        reply.setHeader('content-type', 'application/json');
        reply.end(
          JSON.stringify({
            AccessKeyId: `ACCOUNT_${account}`,
            SecretAccessKey: `synthetic-secret-${account.toLowerCase()}`,
            Token: `synthetic-token-${account.toLowerCase()}`,
            Expiration: new Date(Date.now() + hour).toISOString(),
          }),
        );
      } else {
        reply.writeHead(404).end();
      }
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('No metadata loopback listener');
    }
    metadataAddress = address;
    return address;
  }

  it.each([
    'credentials only',
    'stable source',
    'explicit keys',
    'region during discovery',
  ] as const)('restores east A after real defaults discovery with %s', async (mode) => {
    const address = await startMetadataServer();
    setEnvironment({
      AWS_EC2_METADATA_DISABLED: undefined,
      AWS_EC2_METADATA_SERVICE_ENDPOINT: `http://127.0.0.1:${address.port}`,
      AWS_DEFAULTS_MODE: 'auto',
      AWS_ACCESS_KEY_ID: 'ACCOUNT_A',
      AWS_SECRET_ACCESS_KEY: 'synthetic-secret-a',
      AWS_SESSION_TOKEN: 'synthetic-token-a',
    });
    provider = new SageMakerCompletionProvider('endpoint', {
      config: {
        modelType: 'custom',
        ...(mode === 'explicit keys'
          ? { accessKeyId: 'ACCOUNT_A', secretAccessKey: 'explicit-secret-a' }
          : {}),
      },
    });
    const first = provider.callApi('east A before discovery');
    pending.push(first);
    void first.catch(() => {});
    await metadataStarted.promise;
    expect(metadataPaths).toEqual(['/latest/api/token', '/latest/meta-data/placement/region']);
    // Only the region case changes the defaults inputs while discovery is running.
    if (mode !== 'stable source') {
      setEnvironment({
        AWS_ACCESS_KEY_ID: 'ACCOUNT_B',
        AWS_SECRET_ACCESS_KEY: 'synthetic-secret-b',
        AWS_SESSION_TOKEN: 'synthetic-token-b',
        ...(mode === 'region during discovery' ? { AWS_REGION: 'us-west-2' } : {}),
      });
    }
    expect(process.env.AWS_REGION).toBe(
      mode === 'region during discovery' ? 'us-west-2' : 'us-east-1',
    );
    releaseMetadata.resolve();
    if (mode === 'region during discovery') {
      await expect(first).rejects.toThrow(
        'SageMaker defaults inputs changed during initialization; retry with stable inputs',
      );
      expect(sageCalls).toHaveLength(0);
      releaseFirst.resolve();
      await expectSignedRow('fresh west after rejected discovery', 'ACCOUNT_B', 'us-west-2');
      setEnvironment({
        AWS_REGION: 'us-east-1',
        AWS_ACCESS_KEY_ID: 'ACCOUNT_A',
        AWS_SECRET_ACCESS_KEY: 'synthetic-secret-a',
        AWS_SESSION_TOKEN: 'synthetic-token-a',
      });
      await expectSignedRow('restored east after rejected discovery', 'ACCOUNT_A', 'us-east-1');
      expect(sageCalls).toHaveLength(2);
      expect(sageCalls[1].handler).not.toBe(sageCalls[0].handler);
      expect(metadataPaths).toHaveLength(6);
      expect(provider.sagemakerRuntime).toBeUndefined();
      expect(sageCalls.every(({ handler }) => destroyedHandlers.has(handler))).toBe(true);
      await expectSignedRow('east A after idle', 'ACCOUNT_A', 'us-east-1');
      return;
    }
    await Promise.race([
      firstSigned.promise,
      first.then(() => {
        throw new Error('Request completed before it could be held');
      }),
    ]);
    expect(sageCalls[0].request.headers.authorization).toContain(
      'Credential=ACCOUNT_A/20260101/us-east-1/sagemaker/',
    );
    setEnvironment({ AWS_REGION: 'us-west-2' });
    await expectSignedRow(
      'west after discovery',
      mode === 'stable source' || mode === 'explicit keys' ? 'ACCOUNT_A' : 'ACCOUNT_B',
      'us-west-2',
    );
    setEnvironment({
      AWS_REGION: 'us-east-1',
      AWS_ACCESS_KEY_ID: 'ACCOUNT_A',
      AWS_SECRET_ACCESS_KEY: 'synthetic-secret-a',
      AWS_SESSION_TOKEN: 'synthetic-token-a',
    });
    await expectSignedRow(
      'restored east A while original entry is active',
      'ACCOUNT_A',
      'us-east-1',
    );
    expect(sageCalls).toHaveLength(3);
    expect(destroyedHandlers.size).toBe(0);
    expect(sageCalls[1].handler).not.toBe(sageCalls[0].handler);
    if (mode === 'stable source' || mode === 'explicit keys') {
      expect(sageCalls[2].handler).toBe(sageCalls[0].handler);
    }
    expect(metadataPaths).toHaveLength(4);
    releaseFirst.resolve();
    expect(await first).toMatchObject({ output: 'signed response' });
    expect(provider.sagemakerRuntime).toBeUndefined();
    expect(sageCalls.every(({ handler }) => destroyedHandlers.has(handler))).toBe(true);
    // A rejected entry must not poison the retained credential chain either.
    await expectSignedRow('east A after idle', 'ACCOUNT_A', 'us-east-1');
  });

  it.each(['during discovery', 'during credentials', 'stable inputs', 'abort'] as const)(
    'keeps default-chain serving coherent after delayed resolution: %s',
    async (mode) => {
      const address = await startMetadataServer();
      const credentialBase = `http://127.0.0.1:${address.port}/credentials`;
      setEnvironment({
        AWS_EC2_METADATA_DISABLED: undefined,
        AWS_EC2_METADATA_SERVICE_ENDPOINT: `http://127.0.0.1:${address.port}`,
        AWS_DEFAULTS_MODE: 'auto',
        AWS_CONTAINER_CREDENTIALS_FULL_URI: `${credentialBase}/a`,
        AWS_ENDPOINT_URL_SAGEMAKER_RUNTIME: 'https://sage-a.example',
      });
      provider = new SageMakerCompletionProvider('endpoint', { config: { modelType: 'custom' } });
      pauseCredentials = mode === 'during credentials';
      releaseFirst.resolve();
      const controller = new AbortController();
      const abortReason = new Error('Cancel delayed default-chain request');
      const first = provider.callApi('delayed default chain', undefined, {
        abortSignal: controller.signal,
      });
      pending.push(first);
      void first.catch(() => {});
      const unfinished = first.then(() => {
        throw new Error('Request completed before its delayed input boundary');
      });
      void unfinished.catch(() => {});
      await Promise.race([metadataStarted.promise, unfinished]);
      if (mode === 'during credentials') {
        releaseMetadata.resolve();
        await Promise.race([credentialsStarted.promise, unfinished]);
      }
      const changed = mode === 'during discovery' || mode === 'during credentials';
      if (changed) {
        setEnvironment({
          AWS_CONTAINER_CREDENTIALS_FULL_URI: `${credentialBase}/b`,
          AWS_ENDPOINT_URL_SAGEMAKER_RUNTIME: 'https://sage-b.example',
          AWS_REGION: 'us-west-2',
        });
      } else if (mode === 'abort') {
        controller.abort(abortReason);
      }
      releaseMetadata.resolve();
      releaseCredentials.resolve();
      if (changed) {
        if (mode === 'during discovery') {
          await expect(first).rejects.toThrow(
            'SageMaker defaults inputs changed during initialization; retry with stable inputs',
          );
        } else {
          await expect(first).resolves.toMatchObject({
            error: expect.stringContaining(
              'SageMaker credential inputs changed during initialization',
            ),
          });
        }
        expect(sageCalls).toHaveLength(0);
        expect(metadataPaths.filter((item) => item.startsWith('/credentials/'))).toEqual(
          mode === 'during credentials' ? ['/credentials/a'] : [],
        );
        expect(provider.sagemakerRuntime).toBeUndefined();
        await expectSignedRow(
          'fresh west B after rejected initialization',
          'ACCOUNT_B',
          'us-west-2',
        );
        expect(sageCalls.at(-1)!.request.hostname).toBe('sage-b.example');
        expect(sageCalls.at(-1)!.request.headers['x-amz-security-token']).toBe('synthetic-token-b');
        setEnvironment({
          AWS_CONTAINER_CREDENTIALS_FULL_URI: `${credentialBase}/a`,
          AWS_ENDPOINT_URL_SAGEMAKER_RUNTIME: 'https://sage-a.example',
          AWS_REGION: 'us-east-1',
        });
      } else if (mode === 'abort') {
        await expect(first).rejects.toBe(abortReason);
        expect(sageCalls).toHaveLength(0);
      } else {
        await expect(first).resolves.toMatchObject({ output: 'signed response' });
        expect(sageCalls[0].request.headers.authorization).toContain(
          'Credential=ACCOUNT_A/20260101/us-east-1/sagemaker/',
        );
      }
      await expectSignedRow('fresh east A after idle', 'ACCOUNT_A', 'us-east-1');
      expect(sageCalls.at(-1)!.request.hostname).toBe('sage-a.example');
      expect(sageCalls.at(-1)!.request.headers['x-amz-security-token']).toBe('synthetic-token-a');
      if (mode === 'stable inputs') {
        expect(metadataPaths.filter((item) => item === '/credentials/a')).toHaveLength(1);
      }
      expect(provider.sagemakerRuntime).toBeUndefined();
      expect(sageCalls.every(({ handler }) => destroyedHandlers.has(handler))).toBe(true);
    },
  );

  it('retains the selected east SSO credentials after west initialization, a pool hit, and idle cleanup', async () => {
    await writeFile(
      configFile,
      `[profile retained]\nsso_start_url = ${startUrl}\nsso_account_id = 123456789012\nsso_region = eu-west-1\nsso_role_name = TestRole\n`,
    );
    const loginExpiry = startTime.getTime() + 60_000;
    renewLogin(loginExpiry);
    provider = new SageMakerCompletionProvider('endpoint', {
      config: { modelType: 'custom', profile: 'retained' },
    });
    const first = provider.callApi('held east');
    pending.push(first);
    await firstSigned.promise;
    expect(sageCalls[0].request.headers.authorization).toContain('Credential=SSO_1/');
    setEnvironment({ AWS_REGION: 'us-west-2' });
    await expectSignedRow('west initialized before east pool hit', 'SSO_2', 'us-west-2');
    expect(ssoCalls).toHaveLength(2);
    setEnvironment({ AWS_REGION: 'us-east-1' });
    await expectSignedRow('east pool hit before login expiry', 'SSO_1', 'us-east-1');
    expect(sageCalls[2].handler).toBe(sageCalls[0].handler);
    expect(sageCalls[1].handler).not.toBe(sageCalls[0].handler);
    expect(destroyedHandlers.size).toBe(0);
    releaseFirst.resolve();
    expect(await first).toMatchObject({ output: 'signed response' });
    expect(provider.sagemakerRuntime).toBeUndefined();
    expect(sageCalls.every(({ handler }) => destroyedHandlers.has(handler))).toBe(true);

    vi.setSystemTime(startTime.getTime() + 120_000);
    expect(Date.now()).toBeGreaterThan(loginExpiry);
    expect(startTime.getTime() + hour - Date.now()).toBeGreaterThan(5 * 60_000);
    await expectSignedRow('east after idle and expired login', 'SSO_1', 'us-east-1');
    expect(sageCalls[3].handler).not.toBe(sageCalls[0].handler);
    expect(ssoCalls).toHaveLength(2);
    expect(ssoCalls.every(({ handler }) => !destroyedHandlers.has(handler))).toBe(true);

    // Actual role expiration still requires the SDK to authenticate again.
    vi.setSystemTime(startTime.getTime() + 70 * 60_000);
    renewLogin(Date.now() + hour);
    await expectSignedRow('east after role expiration and renewed login', 'SSO_3', 'us-east-1');
    expect(ssoCalls).toHaveLength(3);
    expect(ssoCalls.every(({ handler }) => !destroyedHandlers.has(handler))).toBe(true);
  });
});
