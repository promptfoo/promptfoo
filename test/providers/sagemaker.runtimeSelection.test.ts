import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { HttpResponse } from '@smithy/core/transport';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest } from '@smithy/core/transport';
import type { NodeHttpHandler as HttpHandler } from '@smithy/node-http-handler';

import type { SageMakerCompletionProvider } from '../../src/providers/sagemaker';

vi.mock('../../src/cache', () => ({ isCacheEnabled: () => false, getCache: vi.fn() }));
vi.mock('../../src/telemetry', () => ({ default: { record: vi.fn() } }));

const requireFromTest = createRequire(import.meta.url);
const { NodeHttpHandler } = requireFromTest(
  '@smithy/node-http-handler',
) as typeof import('@smithy/node-http-handler');

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('SageMaker selections across a pending SDK import', () => {
  let directory: string;
  let provider: SageMakerCompletionProvider | undefined;
  let importStarted: ReturnType<typeof deferred>;
  let releaseImport: ReturnType<typeof deferred>;
  let firstSent: ReturnType<typeof deferred>;
  let releaseFirst: ReturnType<typeof deferred>;
  let rows: { request: HttpRequest; handler: HttpHandler; connectionTimeout: number | undefined }[];

  beforeEach(async () => {
    vi.resetModules();
    directory = await mkdtemp(path.join(tmpdir(), 'sage-selection-'));
    const configFile = path.join(directory, 'config');
    await writeFile(
      configFile,
      '[default]\ndefaults_mode = standard\nendpoint_url = https://profile-a.invalid\n',
    );
    await writeFile(path.join(directory, 'credentials'), '');
    // The fixture intentionally changes SDK inputs while its actual module import is held.
    for (const name of Object.keys(process.env).filter((name) => name.startsWith('AWS_'))) {
      vi.stubEnv(name, undefined);
    }
    vi.stubEnv('AWS_CONFIG_FILE', configFile);
    vi.stubEnv('AWS_SHARED_CREDENTIALS_FILE', path.join(directory, 'credentials'));
    vi.stubEnv('AWS_EC2_METADATA_DISABLED', 'true');
    vi.stubEnv('AWS_DEFAULTS_MODE', 'legacy');
    vi.stubEnv('AWS_REGION', 'us-east-1');
    vi.stubEnv('AWS_SAGEMAKER_MAX_RETRIES', '1');
    for (const transport of [http, https]) {
      vi.spyOn(transport, 'request').mockImplementation(() => {
        throw new Error('Unexpected network in selection fixture');
      });
    }
    importStarted = deferred();
    releaseImport = deferred();
    firstSent = deferred();
    releaseFirst = deferred();
    rows = [];
    vi.doMock('@aws-sdk/client-sagemaker-runtime', async (importOriginal) => {
      importStarted.resolve();
      await releaseImport.promise;
      return importOriginal();
    });
    vi.spyOn(NodeHttpHandler.prototype, 'handle').mockImplementation(async function (
      this: HttpHandler,
      request,
    ) {
      const settings = await (
        this as unknown as { configProvider: Promise<{ connectionTimeout?: number }> }
      ).configProvider;
      rows.push({ request, handler: this, connectionTimeout: settings.connectionTimeout });
      if (rows.length === 1) {
        firstSent.resolve();
        await releaseFirst.promise;
      }
      return {
        response: new HttpResponse({
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body: Buffer.from('{"output":"selected"}'),
        }),
      };
    });
    const { SageMakerCompletionProvider: Provider } = await import('../../src/providers/sagemaker');
    provider = new Provider('deployment', {
      config: { modelType: 'custom', accessKeyId: 'OFFLINE', secretAccessKey: 'offline-secret' },
    });
  });

  afterEach(async () => {
    releaseImport.resolve();
    releaseFirst.resolve();
    provider?.cleanup();
    provider = undefined;
    vi.doUnmock('@aws-sdk/client-sagemaker-runtime');
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });

  it.each(['service', 'ignored', 'profile', 'stable'] as const)(
    'keeps the captured %s destination when a held east client is reused',
    async (mode) => {
      const setEast = () => {
        vi.stubEnv('AWS_REGION', 'us-east-1');
        vi.stubEnv(
          'AWS_ENDPOINT_URL_SAGEMAKER_RUNTIME',
          mode === 'profile' ? undefined : 'https://service-a.invalid',
        );
        vi.stubEnv('AWS_IGNORE_CONFIGURED_ENDPOINT_URLS', mode === 'ignored' ? 'true' : undefined);
      };
      setEast();
      const first = provider!.callApi('first east');
      try {
        await importStarted.promise;
        vi.stubEnv('AWS_REGION', 'us-west-2');
        vi.stubEnv(
          'AWS_ENDPOINT_URL_SAGEMAKER_RUNTIME',
          mode === 'stable' ? 'https://service-a.invalid' : 'https://service-b.invalid',
        );
        vi.stubEnv('AWS_IGNORE_CONFIGURED_ENDPOINT_URLS', undefined);
        releaseImport.resolve();
        await firstSent.promise;
        expect(await provider!.callApi('west')).toMatchObject({ output: 'selected' });
        setEast();
        expect(await provider!.callApi('return east')).toMatchObject({ output: 'selected' });
        expect(rows).toHaveLength(3);
        const expected =
          mode === 'ignored'
            ? 'runtime.sagemaker.us-east-1.amazonaws.com'
            : mode === 'profile'
              ? 'profile-a.invalid'
              : 'service-a.invalid';
        expect(rows[0].request.hostname).toBe(expected);
        expect(rows[2].request.hostname).toBe(expected);
        expect(rows[2].handler).toBe(rows[0].handler);
        expect(rows[1].handler).not.toBe(rows[0].handler);
        expect(rows.map(({ request }) => request.headers.authorization)).toEqual([
          expect.stringContaining('/us-east-1/sagemaker/'),
          expect.stringContaining('/us-west-2/sagemaker/'),
          expect.stringContaining('/us-east-1/sagemaker/'),
        ]);
      } finally {
        releaseImport.resolve();
        releaseFirst.resolve();
        await expect(first).resolves.toMatchObject({ output: 'selected' });
      }
    },
  );

  it.each(['environment', 'shared-profile', 'stable'] as const)(
    'retains the selected %s defaults through east-west-east and idle cleanup',
    async (mode) => {
      vi.stubEnv('AWS_DEFAULTS_MODE', mode === 'shared-profile' ? undefined : 'standard');
      const first = provider!.callApi('cold east');
      try {
        await importStarted.promise;
        vi.stubEnv('AWS_REGION', 'us-west-2');
        vi.stubEnv('AWS_DEFAULTS_MODE', mode === 'stable' ? 'standard' : 'mobile');
        releaseImport.resolve();
        await firstSent.promise;
        expect(await provider!.callApi('west')).toMatchObject({ output: 'selected' });
      } finally {
        releaseImport.resolve();
        releaseFirst.resolve();
        await expect(first).resolves.toMatchObject({ output: 'selected' });
      }
      expect(provider!.sagemakerRuntime).toBeUndefined();
      vi.stubEnv('AWS_REGION', 'us-east-1');
      vi.stubEnv('AWS_DEFAULTS_MODE', mode === 'shared-profile' ? undefined : 'standard');
      expect(await provider!.callApi('east after idle')).toMatchObject({ output: 'selected' });
      expect(rows).toHaveLength(3);
      expect(rows.map(({ connectionTimeout }) => connectionTimeout)).toEqual([
        3100,
        mode === 'stable' ? 3100 : 30000,
        3100,
      ]);
      expect(rows[2].handler).not.toBe(rows[0].handler);
    },
  );
});

it.each(['discard stale', 'preserve newer'] as const)(
  'does %s defaults state after actual automatic discovery overlaps a changed selection',
  async (mode) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'sage-pending-auto-'));
    const config = path.join(directory, 'config');
    await writeFile(config, '');
    const metadataStarted = deferred();
    const releaseMetadata = deferred();
    const newerStarted = deferred();
    const releaseNewer = deferred();
    const metadataRequests: string[] = [];
    const requests: { handler: HttpHandler; timeout?: number }[] = [];
    const server = http.createServer(async (request, response) => {
      metadataRequests.push(request.url!);
      if (request.url === '/latest/api/token') {
        response.end('offline-token');
      } else {
        if (metadataRequests.length === 2) {
          metadataStarted.resolve();
          await releaseMetadata.promise;
        }
        response.end('us-east-1');
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('No loopback listener');
    }
    for (const name of Object.keys(process.env).filter((name) => name.startsWith('AWS_'))) {
      vi.stubEnv(name, undefined);
    }
    vi.stubEnv('AWS_CONFIG_FILE', config);
    vi.stubEnv('AWS_SHARED_CREDENTIALS_FILE', config);
    vi.stubEnv('AWS_DEFAULTS_MODE', 'auto');
    vi.stubEnv('AWS_EC2_METADATA_SERVICE_ENDPOINT', `http://127.0.0.1:${address.port}`);
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
    vi.spyOn(NodeHttpHandler.prototype, 'handle').mockImplementation(async function (
      this: HttpHandler,
    ) {
      const settings = await (
        this as unknown as { configProvider: Promise<{ connectionTimeout?: number }> }
      ).configProvider;
      requests.push({ handler: this, timeout: settings.connectionTimeout });
      if (mode === 'preserve newer' && requests.length === 1) {
        newerStarted.resolve();
        await releaseNewer.promise;
      }
      return {
        response: new HttpResponse({
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body: Buffer.from('{"output":"selected"}'),
        }),
      };
    });
    const { SageMakerCompletionProvider: Provider } = await import('../../src/providers/sagemaker');
    const provider = new Provider('deployment', {
      config: {
        modelType: 'custom',
        region: 'us-east-1',
        accessKeyId: 'OFFLINE',
        secretAccessKey: 'offline-secret',
      },
    });
    const first = provider.callApi('discover auto');
    let newer: ReturnType<typeof provider.callApi> | undefined;
    try {
      await metadataStarted.promise;
      vi.stubEnv('AWS_EXECUTION_ENV', 'offline-test');
      vi.stubEnv('AWS_REGION', 'us-west-2');
      if (mode === 'preserve newer') {
        newer = provider.callApi('newer same-region selection');
        await newerStarted.promise;
      }
      releaseMetadata.resolve();
      expect(await first).toMatchObject({ output: 'selected' });
      if (mode === 'discard stale') {
        expect(provider.sagemakerRuntime).toBeUndefined();
        vi.stubEnv('AWS_EXECUTION_ENV', undefined);
        vi.stubEnv('AWS_REGION', undefined);
      }
      expect(await provider.callApi('next selection')).toMatchObject({ output: 'selected' });
      if (mode === 'preserve newer') {
        expect(requests).toHaveLength(3);
        expect(requests[2].handler).toBe(requests[0].handler);
        expect(requests[1].handler).not.toBe(requests[0].handler);
        expect(metadataRequests).toHaveLength(2);
      } else {
        expect(requests).toHaveLength(2);
        expect(metadataRequests).toHaveLength(4);
      }
    } finally {
      releaseMetadata.resolve();
      releaseNewer.resolve();
      await Promise.allSettled([first, ...(newer ? [newer] : [])]);
      provider.cleanup();
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await rm(directory, { recursive: true });
    }
  },
);
