import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { HttpResponse } from '@smithy/core/transport';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SageMakerCompletionProvider } from '../../src/providers/sagemaker';
import { mockProcessEnv } from '../util/utils';
import type { SageMakerRuntimeClient } from '@aws-sdk/client-sagemaker-runtime';
import type { HttpRequest } from '@smithy/core/transport';

const parsing = vi.hoisted(() => ({ pause: undefined as undefined | (() => Promise<void>) }));
vi.mock('@smithy/core/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@smithy/core/config')>();
  return {
    ...actual,
    parseKnownFiles: async (...args: Parameters<typeof actual.parseKnownFiles>) => {
      const result = await actual.parseKnownFiles(...args);
      const pause = parsing.pause;
      parsing.pause = undefined;
      await pause?.();
      return result;
    },
  };
});
vi.mock('../../src/cache', () => ({ isCacheEnabled: () => false, getCache: vi.fn() }));
vi.mock('../../src/telemetry', () => ({ default: { record: vi.fn() } }));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('SageMaker initialization policy snapshot', () => {
  let directory: string;
  let restoreEnv: () => void;
  const providers = new Set<SageMakerCompletionProvider>();
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'promptfoo-sage-snapshot-'));
    const config = path.join(directory, 'config');
    const credentials = path.join(directory, 'credentials');
    await writeFile(
      config,
      '[profile runtime-before]\nendpoint_url = https://profile-before.invalid\ndefaults_mode = legacy\n[profile runtime-after]\nendpoint_url = https://profile-after.invalid\ndefaults_mode = standard\n',
    );
    await writeFile(
      credentials,
      '[request-auth]\naws_access_key_id = OFFLINE_KEY\naws_secret_access_key = offline-secret\n',
    );
    restoreEnv = mockProcessEnv({
      AWS_CONFIG_FILE: config,
      AWS_SHARED_CREDENTIALS_FILE: credentials,
      AWS_PROFILE: 'runtime-before',
      AWS_REGION: 'us-east-1',
      AWS_DEFAULTS_MODE: undefined,
      AWS_EC2_METADATA_DISABLED: 'true',
      AWS_SAGEMAKER_MAX_RETRIES: '1',
      AWS_USE_FIPS_ENDPOINT: 'false',
      AWS_USE_DUALSTACK_ENDPOINT: 'false',
      AWS_IGNORE_CONFIGURED_ENDPOINT_URLS: 'false',
      AWS_ENDPOINT_URL: undefined,
      AWS_ENDPOINT_URL_SAGEMAKER_RUNTIME: undefined,
    });
    for (const transport of [http, https]) {
      vi.spyOn(transport, 'request').mockImplementation(() => {
        throw new Error('Unexpected external request');
      });
    }
  });
  afterEach(async () => {
    for (const provider of providers) {
      provider.cleanup();
    }
    providers.clear();
    parsing.pause = undefined;
    vi.resetAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    restoreEnv();
    await rm(directory, { recursive: true, force: true });
  });

  it.each(['service', 'profile'] as const)(
    'keeps the initial %s policy across delayed credential scope resolution',
    async (mode) => {
      if (mode === 'service') {
        vi.stubEnv('AWS_ENDPOINT_URL_SAGEMAKER_RUNTIME', 'https://service-before.invalid');
      }
      const provider = new SageMakerCompletionProvider('deployment', {
        config: { modelType: 'custom', profile: 'request-auth' },
      });
      providers.add(provider);
      const clients: SageMakerRuntimeClient[] = [];
      const requests: HttpRequest[] = [];
      const initialize = provider.getSageMakerRuntimeInstance.bind(provider);
      vi.spyOn(provider, 'getSageMakerRuntimeInstance').mockImplementation(async (...args) => {
        const client: SageMakerRuntimeClient = await initialize(...args);
        if (!clients.includes(client)) {
          clients.push(client);
          vi.spyOn(client.config.requestHandler, 'handle').mockImplementation(async (request) => {
            requests.push(request);
            return {
              response: new HttpResponse({
                statusCode: 200,
                headers: { 'content-type': 'application/json' },
                body: Buffer.from('{"output":"offline response"}'),
              }),
            };
          });
        }
        return client;
      });
      const entered = deferred();
      const release = deferred();
      parsing.pause = async () => {
        entered.resolve();
        await release.promise;
      };
      const pending = provider.callApi('first request');
      try {
        await entered.promise;
        vi.stubEnv('AWS_PROFILE', 'runtime-after');
        vi.stubEnv('AWS_DEFAULTS_MODE', 'standard');
        vi.stubEnv('AWS_USE_FIPS_ENDPOINT', 'true');
        vi.stubEnv('AWS_SAGEMAKER_MAX_RETRIES', '5');
        vi.stubEnv('AWS_REGION', 'us-west-2');
        if (mode === 'service') {
          vi.stubEnv('AWS_ENDPOINT_URL_SAGEMAKER_RUNTIME', 'https://service-after.invalid');
        }
        release.resolve();
        expect(await pending).toMatchObject({ output: 'offline response' });
        expect(requests[0].hostname).toBe(`${mode}-before.invalid`);
        expect(requests[0].headers.authorization).toContain('Credential=OFFLINE_KEY/');
        expect(requests[0].headers.authorization).toContain('/us-east-1/sagemaker/aws4_request');
        const initialDefaultsMode = clients[0].config.defaultsMode;
        expect(
          await (typeof initialDefaultsMode === 'function'
            ? initialDefaultsMode()
            : initialDefaultsMode),
        ).toBe('legacy');
        expect(await clients[0].config.maxAttempts()).toBe(1);
        expect(await clients[0].config.useFipsEndpoint()).toBe(false);
        // A later request must observe the now-invalid policy, without forwarding it.
        expect(await provider.callApi('invalid later policy')).toMatchObject({
          error: expect.stringContaining('FIPS'),
        });
        expect(requests).toHaveLength(1);
        vi.stubEnv('AWS_USE_FIPS_ENDPOINT', 'false');
        expect(await provider.callApi('later request')).toMatchObject({
          output: 'offline response',
        });
        expect(requests[1].hostname).toBe(`${mode}-after.invalid`);
        expect(requests[1].headers.authorization).toContain('/us-west-2/sagemaker/aws4_request');
        const laterDefaultsMode = clients.at(-1)!.config.defaultsMode;
        expect(
          await (typeof laterDefaultsMode === 'function' ? laterDefaultsMode() : laterDefaultsMode),
        ).toBe('standard');
        expect(await clients.at(-1)!.config.maxAttempts()).toBe(5);
        expect(await clients.at(-1)!.config.useFipsEndpoint()).toBe(false);
      } finally {
        release.resolve();
        await pending;
      }
    },
  );

  it('keeps captured environment credentials when signing starts after another request changes them', async () => {
    vi.stubEnv('AWS_PROFILE', undefined);
    vi.stubEnv('AWS_ACCESS_KEY_ID', 'BEFORE_KEY');
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'before-secret');
    vi.stubEnv('AWS_SESSION_TOKEN', 'before-token');
    vi.stubEnv('AWS_ENDPOINT_URL_SAGEMAKER_RUNTIME', 'https://service-before.invalid');
    const provider = new SageMakerCompletionProvider('deployment', {
      config: { modelType: 'custom' },
    });
    providers.add(provider);
    const entered = deferred();
    const release = deferred();
    const requests: HttpRequest[] = [];
    const initialize = provider.getSageMakerRuntimeInstance.bind(provider);
    vi.spyOn(provider, 'getSageMakerRuntimeInstance').mockImplementation(async (...args) => {
      const client: SageMakerRuntimeClient = await initialize(...args);
      vi.spyOn(client.config.requestHandler, 'handle').mockImplementation(async (request) => {
        requests.push(request);
        return {
          response: new HttpResponse({
            statusCode: 200,
            headers: { 'content-type': 'application/json' },
            body: Buffer.from('{"output":"offline response"}'),
          }),
        };
      });
      entered.resolve();
      await release.promise;
      return client;
    });
    const pending = provider.callApi('first request');
    try {
      await entered.promise;
      vi.stubEnv('AWS_ACCESS_KEY_ID', 'AFTER_KEY');
      vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'after-secret');
      vi.stubEnv('AWS_SESSION_TOKEN', 'after-token');
      vi.stubEnv('AWS_REGION', 'us-west-2');
      release.resolve();
      expect(await pending).toMatchObject({ output: 'offline response' });
      expect(requests[0].headers.authorization).toContain('Credential=BEFORE_KEY/');
      expect(requests[0].headers.authorization).toContain('/us-east-1/sagemaker/aws4_request');
      expect(requests[0].headers['x-amz-security-token']).toBe('before-token');
      expect(await provider.callApi('later request')).toMatchObject({ output: 'offline response' });
      expect(requests[1].headers.authorization).toContain('Credential=AFTER_KEY/');
      expect(requests[1].headers.authorization).toContain('/us-west-2/sagemaker/aws4_request');
      expect(requests[1].headers['x-amz-security-token']).toBe('after-token');
    } finally {
      release.resolve();
      await pending;
    }
  });
});
