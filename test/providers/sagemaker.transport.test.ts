import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { SageMakerRuntimeClient } from '@aws-sdk/client-sagemaker-runtime';
import { HttpRequest } from '@smithy/core/transport';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SageMakerCompletionProvider,
  SageMakerEmbeddingProvider,
} from '../../src/providers/sagemaker';
import { mockProcessEnv } from '../util/utils';
import type { NodeHttpHandler } from '@smithy/node-http-handler';

vi.mock('../../src/cache', () => ({ isCacheEnabled: () => false, getCache: vi.fn() }));

vi.mock('../../src/telemetry', () => ({ default: { record: vi.fn() } }));

describe('SageMaker SDK transport configuration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.doUnmock('@smithy/core/client');
    vi.doUnmock('@aws-sdk/client-sagemaker-runtime');
    vi.doUnmock('@aws-sdk/credential-provider-node');
  });

  it.each([
    ['completion', 'environment'],
    ['embedding', 'environment'],
    ['completion', 'profile'],
    ['embedding', 'profile'],
  ] as const)(
    'retains successful auto discovery across idle %s rows from %s',
    async (kind, source) => {
      const directory = await mkdtemp(path.join(tmpdir(), 'promptfoo-sagemaker-auto-'));
      const configFile = path.join(directory, 'config');
      const credentialsFile = path.join(directory, 'credentials');
      await writeFile(configFile, '[default]\ndefaults_mode = auto\n');
      await writeFile(credentialsFile, '');
      const metadataRequests: string[] = [];
      const server = http.createServer((request, response) => {
        metadataRequests.push(`${request.method} ${request.url}`);
        if (request.url === '/latest/api/token') {
          response.end('offline-metadata-token');
        } else {
          expect(request.headers['x-aws-ec2-metadata-token']).toBe('offline-metadata-token');
          response.end('us-east-1');
        }
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Missing loopback address');
      }
      const restoreEnv = mockProcessEnv({
        AWS_CONFIG_FILE: configFile,
        AWS_SHARED_CREDENTIALS_FILE: credentialsFile,
        AWS_PROFILE: undefined,
        AWS_DEFAULTS_MODE: source === 'environment' ? 'auto' : undefined,
        AWS_EXECUTION_ENV: undefined,
        AWS_REGION: undefined,
        AWS_DEFAULT_REGION: undefined,
        AWS_EC2_METADATA_DISABLED: undefined,
        AWS_EC2_METADATA_SERVICE_ENDPOINT: `http://127.0.0.1:${address.port}`,
        AWS_SAGEMAKER_MAX_RETRIES: '1',
      });
      const originalRequest = http.request;
      vi.spyOn(http, 'request').mockImplementation(((
        options: http.RequestOptions,
        callback: Parameters<typeof http.request>[1],
      ) => {
        expect(options.hostname).toBe('127.0.0.1');
        expect(options.port).toBe(address.port);
        return originalRequest(options, callback as never);
      }) as typeof http.request);
      vi.spyOn(https, 'request').mockImplementation(() => {
        throw new Error('Unexpected HTTPS');
      });
      const require = createRequire(import.meta.url);
      const { NodeHttpHandler: ActualHandler } = require('@smithy/node-http-handler');
      const { HttpResponse } = require('@smithy/core/transport');
      vi.spyOn(ActualHandler.prototype, 'handle').mockImplementation(async () => ({
        response: new HttpResponse({
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body: Buffer.from(JSON.stringify({ output: 'offline response', embedding: [0.1, 0.2] })),
        }),
      }));
      const Provider =
        kind === 'completion' ? SageMakerCompletionProvider : SageMakerEmbeddingProvider;
      const provider = new Provider('endpoint', {
        config: {
          modelType: 'custom',
          region: 'us-east-1',
          accessKeyId: 'OFFLINE',
          secretAccessKey: 'offline-secret',
        },
      });
      const clients: SageMakerRuntimeClient[] = [];
      const destroyed = new Set<SageMakerRuntimeClient>();
      const initialize = provider.getSageMakerRuntimeInstance.bind(provider);
      vi.spyOn(provider, 'getSageMakerRuntimeInstance').mockImplementation(async (...args) => {
        const client: SageMakerRuntimeClient = await initialize(...args);
        const destroy = client.destroy.bind(client);
        vi.spyOn(client, 'destroy').mockImplementation(() => {
          destroyed.add(client);
          destroy();
        });
        clients.push(client);
        return client;
      });
      try {
        for (const row of ['first', 'second']) {
          if (provider instanceof SageMakerEmbeddingProvider) {
            expect(await provider.callEmbeddingApi(row)).toMatchObject({ embedding: [0.1, 0.2] });
          } else {
            expect(await provider.callApi(row)).toMatchObject({ output: 'offline response' });
          }
          expect(destroyed.has(clients.at(-1)!)).toBe(true);
        }
        expect(clients).toHaveLength(2);
        expect(clients[0]).not.toBe(clients[1]);
        expect(
          await Promise.all(
            clients.map(({ config: { defaultsMode } }) =>
              typeof defaultsMode === 'function' ? defaultsMode() : defaultsMode,
            ),
          ),
        ).toEqual(['in-region', 'in-region']);
        expect(metadataRequests).toEqual([
          'PUT /latest/api/token',
          'GET /latest/meta-data/placement/region',
        ]);
      } finally {
        provider.cleanup();
        restoreEnv();
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
        await rm(directory, { recursive: true });
      }
    },
  );

  it('replaces defaults for changed inputs without reusing a ready client or keeping failures', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'promptfoo-sagemaker-defaults-'));
    const configFile = path.join(directory, 'config');
    const credentialsFile = path.join(directory, 'credentials');
    await writeFile(configFile, '[default]\ndefaults_mode = mobile\n');
    await writeFile(credentialsFile, '');
    const restoreEnv = mockProcessEnv({
      AWS_CONFIG_FILE: configFile,
      AWS_SHARED_CREDENTIALS_FILE: credentialsFile,
      AWS_PROFILE: undefined,
      AWS_DEFAULTS_MODE: 'standard',
      AWS_EC2_METADATA_DISABLED: 'true',
    });
    const provider = new SageMakerCompletionProvider('endpoint', {
      config: {
        modelType: 'custom',
        region: 'us-east-1',
        accessKeyId: 'OFFLINE',
        secretAccessKey: 'offline-secret',
      },
    });
    try {
      const first = await provider.getSageMakerRuntimeInstance();
      expect(await first.config.defaultsMode()).toBe('standard');
      vi.stubEnv('AWS_DEFAULTS_MODE', 'invalid-defaults-mode');
      for (let attempt = 0; attempt < 2; attempt++) {
        await expect(provider.getSageMakerRuntimeInstance()).rejects.toThrow(
          'Invalid parameter for "defaultsMode"',
        );
      }
      vi.stubEnv('AWS_DEFAULTS_MODE', undefined);
      const mobile = await provider.getSageMakerRuntimeInstance();
      expect(mobile).not.toBe(first);
      expect(await mobile.config.defaultsMode()).toBe('mobile');
      vi.stubEnv('AWS_DEFAULTS_MODE', 'auto');
      vi.stubEnv('AWS_EXECUTION_ENV', 'offline-test');
      vi.stubEnv('AWS_REGION', 'us-east-1');
      const sameRegion = await provider.getSageMakerRuntimeInstance();
      expect(await sameRegion.config.defaultsMode()).toBe('in-region');
      vi.stubEnv('AWS_REGION', 'us-west-2');
      const crossRegion = await provider.getSageMakerRuntimeInstance();
      expect(crossRegion).not.toBe(sameRegion);
      expect(await crossRegion.config.defaultsMode()).toBe('cross-region');
      expect(
        await (await provider.getSageMakerRuntimeInstance('us-west-2')).config.defaultsMode(),
      ).toBe('in-region');
      expect(await first.config.defaultsMode()).toBe('standard');
    } finally {
      provider.cleanup();
      restoreEnv();
      await rm(directory, { recursive: true });
    }
  });

  it.each(['AWS_DEFAULTS_MODE', 'profile defaults_mode'])(
    'preserves the SDK configuration error for invalid %s',
    async (source) => {
      const invalidDefaultsMode = 'invalid-defaults-mode';
      const configDirectory = await mkdtemp(path.join(tmpdir(), 'promptfoo-sagemaker-sdk-'));
      const configFile = path.join(configDirectory, 'config');
      const credentialsFile = path.join(configDirectory, 'credentials');
      const restoreEnv = mockProcessEnv({
        AWS_DEFAULTS_MODE: source === 'AWS_DEFAULTS_MODE' ? invalidDefaultsMode : undefined,
        AWS_CONFIG_FILE: configFile,
        AWS_SHARED_CREDENTIALS_FILE: credentialsFile,
        AWS_PROFILE: 'sagemaker-proof',
      });
      const provider = new SageMakerCompletionProvider('endpoint', {
        config: {
          modelType: 'custom',
          region: 'us-east-1',
          accessKeyId: 'offline-placeholder',
          secretAccessKey: 'offline-placeholder',
        },
      });

      try {
        await writeFile(
          configFile,
          `[profile sagemaker-proof]\ndefaults_mode = ${
            source === 'profile defaults_mode' ? invalidDefaultsMode : 'standard'
          }\n`,
        );
        await writeFile(credentialsFile, '');

        const initialization = provider.getSageMakerRuntimeInstance();
        await expect(initialization).rejects.toMatchObject({
          name: 'Error',
          message:
            'Invalid parameter for "defaultsMode", expect in-region, cross-region, mobile, standard, legacy, ' +
            `got ${invalidDefaultsMode}`,
        });
        await expect(initialization).rejects.not.toThrow('npm install');
      } finally {
        provider.cleanup();
        restoreEnv();
        await rm(configDirectory, { recursive: true });
      }
    },
  );

  it.each([
    'legacy',
    'standard',
    'mobile',
    'in-region',
    'cross-region',
    'auto-same-region',
    'auto-cross-region',
    'profile',
  ])('shares and cleans up the HTTP agent with %s SDK defaults', async (defaultsMode) => {
    vi.useFakeTimers();
    vi.stubEnv(
      'AWS_DEFAULTS_MODE',
      defaultsMode === 'profile'
        ? undefined
        : defaultsMode.startsWith('auto')
          ? 'auto'
          : defaultsMode,
    );
    vi.stubEnv('AWS_EXECUTION_ENV', 'AWS_Lambda_nodejs24.x');
    vi.stubEnv('AWS_REGION', defaultsMode === 'auto-cross-region' ? 'us-west-2' : 'us-east-1');
    const configDirectory = await mkdtemp(path.join(tmpdir(), 'promptfoo-sagemaker-sdk-'));
    const configFile = path.join(configDirectory, 'config');
    const credentialsFile = path.join(configDirectory, 'credentials');
    await writeFile(configFile, '[profile sagemaker-proof]\ndefaults_mode = cross-region\n');
    await writeFile(credentialsFile, '');
    vi.stubEnv('AWS_CONFIG_FILE', configFile);
    vi.stubEnv('AWS_SHARED_CREDENTIALS_FILE', credentialsFile);
    vi.stubEnv('AWS_PROFILE', 'sagemaker-proof');
    const intercepted = new Error('Intercepted the HTTP request before any network connection');
    const request = vi.spyOn(http, 'request').mockImplementation(() => {
      throw intercepted;
    });
    const credentials = {
      accessKeyId: 'offline-placeholder',
      secretAccessKey: 'offline-placeholder',
    };
    const provider = new SageMakerCompletionProvider('endpoint', {
      config: { modelType: 'custom', region: 'us-east-1', ...credentials },
    });
    const reference = new SageMakerRuntimeClient({ region: 'us-east-1', credentials });
    try {
      const runtime = await provider.getSageMakerRuntimeInstance();
      const handler = runtime.config.requestHandler as NodeHttpHandler;
      const referenceHandler = reference.config.requestHandler as NodeHttpHandler;
      const requestInput = new HttpRequest({
        protocol: 'http:',
        hostname: '127.0.0.1',
        path: '/',
        method: 'POST',
        headers: {},
      });
      await Promise.all(
        [handler.handle(requestInput, {}), handler.handle(requestInput, {})].map((pending) =>
          expect(pending).rejects.toBe(intercepted),
        ),
      );
      expect(request).toHaveBeenCalledTimes(2);
      const firstAgent = (request.mock.calls[0][0] as http.RequestOptions).agent as http.Agent;
      const secondAgent = (request.mock.calls[1][0] as http.RequestOptions).agent;
      expect(firstAgent).toBeInstanceOf(http.Agent);
      expect(secondAgent, 'Concurrent first HTTP requests must share one agent').toBe(firstAgent);
      expect(handler.httpHandlerConfigs().httpAgent).toBe(firstAgent);

      await expect(referenceHandler.handle(requestInput, {})).rejects.toBe(intercepted);
      const actual = handler.httpHandlerConfigs();
      const expected = referenceHandler.httpHandlerConfigs();
      expect(actual.connectionTimeout).toBe(expected.connectionTimeout);
      expect(actual.httpsAgent).toMatchObject({
        keepAlive: true,
        maxSockets: 50,
      });
      expect(actual.httpAgent).toMatchObject({ keepAlive: true, maxSockets: 50 });
      expect(request).toHaveBeenCalledTimes(3);

      const destroyAgent = vi.spyOn(firstAgent, 'destroy');
      provider.cleanup();
      provider.cleanup();
      expect(destroyAgent).toHaveBeenCalledTimes(1);
    } finally {
      provider.cleanup();
      reference.destroy();
      await rm(configDirectory, { recursive: true });
    }
  });

  it.each([
    '@smithy/core/client',
    '@aws-sdk/client-sagemaker-runtime',
    '@aws-sdk/credential-provider-node',
  ])('loads the optional %s package only when creating an owned client', async (dependency) => {
    const loadPackage = vi.fn(() => {
      throw new Error(`Cannot find package ${dependency}`);
    });
    vi.doMock(dependency, loadPackage);
    const provider = new SageMakerCompletionProvider('endpoint', {
      config: { modelType: 'custom', region: 'us-east-1' },
    });
    const borrowed = { send: vi.fn(), destroy: vi.fn() };
    provider.sagemakerRuntime = borrowed;
    expect(await provider.getSageMakerRuntimeInstance()).toBe(borrowed);
    expect(loadPackage).not.toHaveBeenCalled();
    provider.sagemakerRuntime = undefined;
    await expect(provider.getSageMakerRuntimeInstance()).rejects.toThrow(
      'The @aws-sdk/client-sagemaker-runtime package is required',
    );
    expect(loadPackage).toHaveBeenCalledOnce();
    expect(borrowed.destroy).not.toHaveBeenCalled();
  });
});
