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

vi.mock('../../src/cache', () => ({ isCacheEnabled: () => false, getCache: vi.fn() }));
vi.mock('../../src/telemetry', () => ({ default: { record: vi.fn() } }));

describe('SageMaker effective runtime endpoint reuse', () => {
  let directory: string;
  let restoreEnv: () => void;
  const providers = new Set<SageMakerCompletionProvider>();

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'promptfoo-sage-route-'));
    const config = path.join(directory, 'config');
    await writeFile(config, '');
    restoreEnv = mockProcessEnv({
      ...Object.fromEntries(
        Object.keys(process.env)
          .filter((name) => name.startsWith('AWS_'))
          .map((name) => [name, undefined]),
      ),
      AWS_CONFIG_FILE: config,
      AWS_SHARED_CREDENTIALS_FILE: config,
      AWS_REGION: 'us-east-1',
      AWS_DEFAULTS_MODE: 'legacy',
      AWS_EC2_METADATA_DISABLED: 'true',
      AWS_SAGEMAKER_MAX_RETRIES: '1',
    });
    for (const transport of [http, https]) {
      vi.spyOn(transport, 'request').mockImplementation(() => {
        throw new Error('Unexpected network in SDK endpoint test');
      });
    }
  });

  afterEach(async () => {
    for (const provider of providers) {
      provider.cleanup();
    }
    providers.clear();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    restoreEnv();
    await rm(directory, { recursive: true, force: true });
  });

  it('keeps adaptive retry quota and throttling separate across runtime endpoints', async () => {
    vi.stubEnv('AWS_SAGEMAKER_MAX_RETRIES', '3');
    const provider = new SageMakerCompletionProvider('endpoint', {
      config: {
        region: 'us-east-1',
        modelType: 'custom',
        accessKeyId: 'OFFLINE_KEY',
        secretAccessKey: 'offline-secret',
      },
    });
    providers.add(provider);

    vi.stubEnv('AWS_ENDPOINT_URL_SAGEMAKER_RUNTIME', 'https://retry-a.invalid');
    const first: SageMakerRuntimeClient = await provider.getSageMakerRuntimeInstance();
    const strategyA = await first.config.retryStrategy();
    if (!('acquireInitialRetryToken' in strategyA)) {
      throw new Error('Expected the SDK adaptive retry strategy');
    }
    const adaptiveA = strategyA as typeof strategyA & {
      standardRetryStrategy: { getCapacity(): number };
      rateLimiter: { getSendToken(): Promise<void> };
    };
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const initial = await strategyA.acquireInitialRetryToken('');
    await strategyA.refreshRetryTokenForRetry(initial, { errorType: 'THROTTLING' });
    const remainingA = adaptiveA.standardRetryStrategy.getCapacity();
    expect(remainingA).toBeLessThan(500);
    const throttleA = vi.spyOn(adaptiveA.rateLimiter, 'getSendToken').mockResolvedValue(undefined);

    vi.stubEnv('AWS_ENDPOINT_URL_SAGEMAKER_RUNTIME', 'https://retry-b.invalid');
    const second: SageMakerRuntimeClient = await provider.getSageMakerRuntimeInstance();
    const strategyB = await second.config.retryStrategy();
    expect(strategyB).not.toBe(strategyA);
    if (!('acquireInitialRetryToken' in strategyB)) {
      throw new Error('Expected the SDK adaptive retry strategy');
    }
    const adaptiveB = strategyB as typeof strategyB & {
      standardRetryStrategy: { getCapacity(): number };
    };
    await strategyB.acquireInitialRetryToken('');
    expect(throttleA).not.toHaveBeenCalled();
    expect(adaptiveB.standardRetryStrategy.getCapacity()).toBe(500);

    vi.stubEnv('AWS_ENDPOINT_URL_SAGEMAKER_RUNTIME', 'https://retry-a.invalid');
    const resumed = await provider.getSageMakerRuntimeInstance();
    expect(await resumed.config.retryStrategy()).toBe(strategyA);
    await strategyA.acquireInitialRetryToken('');
    expect(throttleA).toHaveBeenCalledOnce();
    expect(adaptiveA.standardRetryStrategy.getCapacity()).toBe(remainingA);
  });

  it.each([
    'deployment',
    'configured credentials',
    'environment credentials',
    'profile credentials',
  ] as const)(
    'keeps adaptive throttling separate for a changed %s on the same runtime host',
    async (mode) => {
      vi.stubEnv('AWS_SAGEMAKER_MAX_RETRIES', '3');
      vi.stubEnv('AWS_ENDPOINT_URL_SAGEMAKER_RUNTIME', 'https://same-retry-host.invalid');
      if (mode === 'profile credentials') {
        const credentials = path.join(directory, 'retry-credentials');
        await writeFile(
          credentials,
          '[account-a]\naws_access_key_id = ACCOUNT_A_KEY\naws_secret_access_key = synthetic-a\n' +
            '[account-b]\naws_access_key_id = ACCOUNT_B_KEY\naws_secret_access_key = synthetic-b\n',
        );
        vi.stubEnv('AWS_SHARED_CREDENTIALS_FILE', credentials);
      }
      const provider = new SageMakerCompletionProvider('fallback-deployment', {
        config: { region: 'us-east-1', modelType: 'custom' },
      });
      providers.add(provider);
      const select = (variant: 'A' | 'B') => {
        provider.config.endpoint =
          mode === 'deployment' ? `deployment-${variant}` : 'same-deployment';
        if (mode === 'deployment' || mode === 'configured credentials') {
          const signer = mode === 'deployment' ? 'A' : variant;
          provider.config.accessKeyId = `ACCOUNT_${signer}_KEY`;
          provider.config.secretAccessKey = `synthetic-${signer}`;
        } else if (mode === 'environment credentials') {
          vi.stubEnv('AWS_ACCESS_KEY_ID', `ACCOUNT_${variant}_KEY`);
          vi.stubEnv('AWS_SECRET_ACCESS_KEY', `synthetic-${variant}`);
        } else {
          provider.config.profile = `account-${variant.toLowerCase()}`;
        }
      };
      select('A');
      const first: SageMakerRuntimeClient = await provider.getSageMakerRuntimeInstance();
      const strategyA = await first.config.retryStrategy();
      if (!('acquireInitialRetryToken' in strategyA)) {
        throw new Error('Expected the SDK adaptive retry strategy');
      }
      const adaptiveA = strategyA as typeof strategyA & {
        standardRetryStrategy: { getCapacity(): number };
        rateLimiter: { getSendToken(): Promise<void> };
      };
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const initial = await strategyA.acquireInitialRetryToken('');
      await strategyA.refreshRetryTokenForRetry(initial, { errorType: 'THROTTLING' });
      const remainingA = adaptiveA.standardRetryStrategy.getCapacity();
      expect(remainingA).toBeLessThan(500);
      const throttleA = vi
        .spyOn(adaptiveA.rateLimiter, 'getSendToken')
        .mockResolvedValue(undefined);
      first.config.systemClockOffset = 12_345;

      select('B');
      const second: SageMakerRuntimeClient = await provider.getSageMakerRuntimeInstance();
      const strategyB = await second.config.retryStrategy();
      expect(strategyB).not.toBe(strategyA);
      if (!('acquireInitialRetryToken' in strategyB)) {
        throw new Error('Expected the SDK adaptive retry strategy');
      }
      const adaptiveB = strategyB as typeof strategyB & {
        standardRetryStrategy: { getCapacity(): number };
      };
      await strategyB.acquireInitialRetryToken('');
      expect(throttleA).not.toHaveBeenCalled();
      expect(adaptiveB.standardRetryStrategy.getCapacity()).toBe(500);
      expect(second.config.systemClockOffset).toBe(12_345);

      select('A');
      const resumed: SageMakerRuntimeClient = await provider.getSageMakerRuntimeInstance();
      expect(await resumed.config.retryStrategy()).toBe(strategyA);
      await strategyA.acquireInitialRetryToken('');
      expect(throttleA).toHaveBeenCalledOnce();
      expect(adaptiveA.standardRetryStrategy.getCapacity()).toBe(remainingA);
    },
  );

  it.each(['configured', 'environment'] as const)(
    'does not retain rotated %s credentials in the retry state after idle cleanup',
    async (source) => {
      const provider = new SageMakerCompletionProvider('same-deployment', {
        config: { region: 'us-east-1', modelType: 'custom' },
      });
      providers.add(provider);
      const values: string[] = [];
      for (const variant of ['first', 'second']) {
        const accessKeyId = `RETRY_ACCESS_${variant}`;
        const secretAccessKey = `synthetic-retry-secret-${variant}`;
        const sessionToken = `synthetic-retry-session-${variant}`;
        values.push(accessKeyId, secretAccessKey, sessionToken);
        if (source === 'configured') {
          Object.assign(provider.config, { accessKeyId, secretAccessKey, sessionToken });
        } else {
          vi.stubEnv('AWS_ACCESS_KEY_ID', accessKeyId);
          vi.stubEnv('AWS_SECRET_ACCESS_KEY', secretAccessKey);
          vi.stubEnv('AWS_SESSION_TOKEN', sessionToken);
        }
        await provider.getSageMakerRuntimeInstance();
        provider.cleanup({ reason: 'evaluation-complete' });
      }

      const retryStates = Reflect.get(provider, 'runtimeRetryStates') as Map<string, unknown>;
      expect(retryStates.size).toBe(2);
      const retained = JSON.stringify([...retryStates]);
      for (const value of values) {
        expect(retained).not.toContain(value);
      }
    },
  );

  it('does not retain credential-bearing URLs in retry or clock keys across endpoint rotation', async () => {
    const provider = new SageMakerCompletionProvider('same-deployment', {
      config: {
        region: 'us-east-1',
        modelType: 'custom',
        accessKeyId: 'OFFLINE_KEY',
        secretAccessKey: 'offline-secret',
      },
    });
    providers.add(provider);
    const url = (variant: string) =>
      `https://user-${variant}:password-${variant}@private.invalid/routing-${variant}?X-Amz-Signature=signature-${variant}`;
    vi.stubEnv('AWS_ENDPOINT_URL_SAGEMAKER_RUNTIME', url('first'));
    const first: SageMakerRuntimeClient = await provider.getSageMakerRuntimeInstance();
    const firstRetry = await first.config.retryStrategy();
    first.config.systemClockOffset = 123;
    provider.cleanup({ reason: 'evaluation-complete' });

    vi.stubEnv('AWS_ENDPOINT_URL_SAGEMAKER_RUNTIME', url('second'));
    const second: SageMakerRuntimeClient = await provider.getSageMakerRuntimeInstance();
    expect(await second.config.retryStrategy()).not.toBe(firstRetry);
    expect(second.config.systemClockOffset).not.toBe(123);
    second.config.systemClockOffset = 456;
    provider.cleanup({ reason: 'evaluation-complete' });

    const retries = Reflect.get(provider, 'runtimeRetryStates') as Map<string, unknown>;
    const clocks = Reflect.get(provider, 'runtimeClockOffsets') as Map<string, number>;
    expect(retries.size).toBe(2);
    expect(clocks.size).toBe(2);
    const retainedKeys = JSON.stringify([[...retries.keys()], [...clocks.keys()]]);
    expect(retainedKeys).not.toContain('private.invalid');
    for (const variant of ['first', 'second']) {
      for (const part of ['user', 'password', 'routing', 'signature']) {
        expect(retainedKeys).not.toContain(`${part}-${variant}`);
      }
    }

    vi.stubEnv('AWS_ENDPOINT_URL_SAGEMAKER_RUNTIME', url('first'));
    const resumed: SageMakerRuntimeClient = await provider.getSageMakerRuntimeInstance();
    expect(await resumed.config.retryStrategy()).toBe(firstRetry);
    expect(resumed.config.systemClockOffset).toBe(123);
  });

  it.each([
    'service',
    'unchanged',
    'ignored',
    'shared-ignore',
    'shadowed',
    'blank-service',
    'profile-fallback',
    'shared-service',
  ] as const)('uses the effective %s endpoint when returning to a held region', async (mode) => {
    vi.stubEnv('AWS_ENDPOINT_URL', 'https://common-before.invalid');
    vi.stubEnv(
      'AWS_ENDPOINT_URL_SAGEMAKER_RUNTIME',
      mode === 'blank-service' ? '' : 'https://service-before.invalid',
    );
    if (mode === 'ignored') {
      vi.stubEnv('AWS_IGNORE_CONFIGURED_ENDPOINT_URLS', 'true');
    }
    if (mode === 'shared-ignore') {
      await writeFile(
        path.join(directory, 'config'),
        '[default]\nignore_configured_endpoint_urls = true\n',
      );
    }
    if (mode === 'profile-fallback' || mode === 'shared-service') {
      vi.stubEnv('AWS_ENDPOINT_URL', '');
      vi.stubEnv('AWS_ENDPOINT_URL_SAGEMAKER_RUNTIME', '');
      await writeFile(
        path.join(directory, 'config'),
        mode === 'profile-fallback'
          ? '[default]\nendpoint_url = https://profile-before.invalid\n'
          : '[default]\nservices = runtime\nendpoint_url = https://profile-before.invalid\n[services runtime]\nsagemaker_runtime =\n  endpoint_url = https://shared-before.invalid\n',
      );
    }
    const provider = new SageMakerCompletionProvider('endpoint', {
      config: {
        modelType: 'custom',
        accessKeyId: 'OFFLINE_KEY',
        secretAccessKey: 'offline-secret',
      },
    });
    providers.add(provider);
    const clients = new Set<SageMakerRuntimeClient>();
    const requests: HttpRequest[] = [];
    let start!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      start = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const initialize = provider.getSageMakerRuntimeInstance.bind(provider);
    vi.spyOn(provider, 'getSageMakerRuntimeInstance').mockImplementation(async (...args) => {
      const client: SageMakerRuntimeClient = await initialize(...args);
      if (!clients.has(client)) {
        clients.add(client);
        vi.spyOn(client, 'destroy');
        vi.spyOn(client.config.requestHandler, 'handle').mockImplementation(async (request) => {
          requests.push(request);
          if (requests.length === 1) {
            start();
            await held;
          }
          return {
            response: new HttpResponse({
              statusCode: 200,
              headers: { 'content-type': 'application/json' },
              body: Buffer.from(JSON.stringify({ output: 'offline response' })),
            }),
          };
        });
      }
      return client;
    });
    const pending = provider.callApi('held east');
    try {
      await started;
      const [first] = [...clients];
      const changed = mode !== 'unchanged';
      if (changed) {
        vi.stubEnv(
          mode === 'shadowed' || mode === 'blank-service'
            ? 'AWS_ENDPOINT_URL'
            : 'AWS_ENDPOINT_URL_SAGEMAKER_RUNTIME',
          'https://after.invalid',
        );
      }
      vi.stubEnv('AWS_REGION', 'us-west-2');
      expect(await provider.callApi('west')).toMatchObject({ output: 'offline response' });
      vi.stubEnv('AWS_REGION', 'us-east-1');
      expect(await provider.callApi('return east')).toMatchObject({ output: 'offline response' });
      expect(requests).toHaveLength(3);
      const expected =
        mode === 'ignored' || mode === 'shared-ignore'
          ? 'runtime.sagemaker.us-east-1.amazonaws.com'
          : ['service', 'blank-service', 'profile-fallback', 'shared-service'].includes(mode)
            ? 'after.invalid'
            : 'service-before.invalid';
      expect(requests[2].hostname).toBe(expected);
      if (mode === 'profile-fallback' || mode === 'shared-service') {
        expect(requests[0].hostname).toBe(
          mode === 'profile-fallback' ? 'profile-before.invalid' : 'shared-before.invalid',
        );
      }
      expect(clients.size).toBe(expected === 'after.invalid' ? 3 : 2);
      expect(requests[0].headers.authorization).toContain('/us-east-1/sagemaker/');
      expect(requests[1].headers.authorization).toContain('/us-west-2/sagemaker/');
      expect(requests[2].headers.authorization).toContain('/us-east-1/sagemaker/');
      expect(first.destroy).not.toHaveBeenCalled();
    } finally {
      release();
      await expect(pending).resolves.toMatchObject({ output: 'offline response' });
    }
    for (const client of clients) {
      expect(client.destroy).toHaveBeenCalledOnce();
    }
  });
});
