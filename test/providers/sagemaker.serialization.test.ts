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

vi.mock('../../src/cache', () => ({ isCacheEnabled: () => false, getCache: vi.fn() }));
vi.mock('../../src/telemetry', () => ({ default: { record: vi.fn() } }));

const secret = 'synthetic-process-only-serialization-secret';

describe('SageMaker supplied-instance serialization', () => {
  let directory: string;
  let restoreEnv: () => void;
  let provider: SageMakerCompletionProvider | undefined;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'promptfoo-sage-serialization-'));
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
      AWS_ACCESS_KEY_ID: 'OFFLINE_SERIALIZATION_KEY',
      AWS_SECRET_ACCESS_KEY: secret,
      AWS_DEFAULTS_MODE: 'legacy',
      AWS_EC2_METADATA_DISABLED: 'true',
      AWS_SAGEMAKER_MAX_RETRIES: '1',
    });
    for (const transport of [http, https]) {
      vi.spyOn(transport, 'request').mockImplementation(() => {
        throw new Error('Unexpected network in serialization test');
      });
    }
  });

  afterEach(async () => {
    provider?.cleanup();
    provider = undefined;
    vi.restoreAllMocks();
    restoreEnv();
    await rm(directory, { recursive: true, force: true });
  });

  it.each(['active', 'idle'])('does not serialize process credentials while %s', async (phase) => {
    provider = new SageMakerCompletionProvider('endpoint', {
      config: { region: 'us-east-1', modelType: 'custom' },
    });
    let start!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      start = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const credentials = provider.getCredentials.bind(provider);
    vi.spyOn(provider, 'getCredentials').mockImplementation(async (...args) => {
      start();
      await held;
      return credentials(...args);
    });
    const clients = new Set<SageMakerRuntimeClient>();
    const initialize = provider.getSageMakerRuntimeInstance.bind(provider);
    vi.spyOn(provider, 'getSageMakerRuntimeInstance').mockImplementation(async (...args) => {
      const client: SageMakerRuntimeClient = await initialize(...args);
      if (!clients.has(client)) {
        clients.add(client);
        vi.spyOn(client, 'destroy');
        vi.spyOn(client.config.requestHandler, 'handle').mockImplementation(async (request) => {
          expect(request.headers.authorization).toContain('Credential=OFFLINE_SERIALIZATION_KEY/');
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
    const pending = provider.callApi('synthetic row');
    try {
      await started;
      if (phase === 'idle') {
        release();
        await expect(pending).resolves.toMatchObject({ output: 'offline response' });
      }
      const serialized = JSON.stringify({ providers: [provider] });
      expect(serialized).not.toContain(secret);
      expect(JSON.parse(serialized).providers[0].config).toEqual({
        region: 'us-east-1',
        modelType: 'custom',
      });
    } finally {
      release();
      await pending;
    }
    expect(await provider.callApi('second row')).toMatchObject({ output: 'offline response' });
    for (const client of clients) {
      expect(client.destroy).toHaveBeenCalledOnce();
    }
  });
});
