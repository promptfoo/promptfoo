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

const flags = [
  {
    env: 'AWS_USE_FIPS_ENDPOINT',
    config: 'use_fips_endpoint',
    host: 'runtime-fips.sagemaker.us-east-1.amazonaws.com',
  },
  {
    env: 'AWS_USE_DUALSTACK_ENDPOINT',
    config: 'use_dualstack_endpoint',
    host: 'runtime.sagemaker.us-east-1.api.aws',
  },
] as const;

describe('SageMaker effective endpoint flags', () => {
  let directory: string;
  let restoreEnv: () => void;
  const providers = new Set<SageMakerCompletionProvider>();

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'promptfoo-sage-flags-'));
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
        throw new Error('Unexpected network in SDK flag test');
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

  it.each(
    flags.flatMap((flag) =>
      ['environment', 'profile', 'unchanged'].map((source) => ({ ...flag, source })),
    ),
  )(
    'uses effective $env from $source on return to a held region',
    async ({ env, config, host, source }) => {
      await writeFile(path.join(directory, 'config'), `[default]\n${config} = true\n`);
      vi.stubEnv(env, 'false');
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
                body: Buffer.from('{"output":"offline response"}'),
              }),
            };
          });
        }
        return client;
      });
      const pending = provider.callApi('held east');
      try {
        await started;
        if (source !== 'unchanged') {
          vi.stubEnv(env, source === 'profile' ? undefined : 'true');
        }
        vi.stubEnv('AWS_REGION', 'us-west-2');
        expect(await provider.callApi('west')).toMatchObject({ output: 'offline response' });
        vi.stubEnv('AWS_REGION', 'us-east-1');
        expect(await provider.callApi('return east')).toMatchObject({ output: 'offline response' });
        expect(requests).toHaveLength(3);
        expect(requests[0].hostname).toBe('runtime.sagemaker.us-east-1.amazonaws.com');
        expect(requests[2].hostname).toBe(source === 'unchanged' ? requests[0].hostname : host);
        expect(clients.size).toBe(source === 'unchanged' ? 2 : 3);
        for (const [index, region] of ['us-east-1', 'us-west-2', 'us-east-1'].entries()) {
          expect(requests[index].headers.authorization).toContain(`/${region}/sagemaker/`);
        }
        expect([...clients][0].destroy).not.toHaveBeenCalled();
      } finally {
        release();
        await expect(pending).resolves.toMatchObject({ output: 'offline response' });
      }
      for (const client of clients) {
        expect(client.destroy).toHaveBeenCalledOnce();
      }
    },
  );
});
