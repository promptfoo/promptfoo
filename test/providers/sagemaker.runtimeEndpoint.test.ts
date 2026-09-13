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
