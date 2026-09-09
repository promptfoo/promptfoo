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

vi.mock('../../src/cache', () => ({
  isCacheEnabled: () => false,
  getCache: () => ({ get: vi.fn(), set: vi.fn() }),
}));
vi.mock('../../src/telemetry', () => ({ default: { record: vi.fn() } }));

const startTime = new Date('2026-01-01T00:00:00Z');
const clockSkew = 10 * 60_000;
const providers = new Set<SageMakerCompletionProvider>();

function signingDate(time: number): string {
  return new Date(time).toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function createProvider(serverOffset: (request: HttpRequest) => number) {
  const provider = new SageMakerCompletionProvider('endpoint', {
    config: {
      region: 'us-east-1',
      modelType: 'custom',
      accessKeyId: 'OFFLINE_KEY',
      secretAccessKey: 'offline-secret',
    },
  });
  providers.add(provider);
  const clients = new Set<SageMakerRuntimeClient>();
  const requests: HttpRequest[] = [];
  const initialize = provider.getSageMakerRuntimeInstance.bind(provider);
  vi.spyOn(provider, 'getSageMakerRuntimeInstance').mockImplementation(async (...args) => {
    const client: SageMakerRuntimeClient = await initialize(...args);
    if (!clients.has(client)) {
      clients.add(client);
      vi.spyOn(client, 'destroy');
      // Keep the SDK serializer, signer and retry middleware; replace only HTTP handling.
      vi.spyOn(client.config.requestHandler, 'handle').mockImplementation(async (request) => {
        requests.push(request);
        const serverTime = Date.now() + serverOffset(request);
        const signatureMatches = request.headers['x-amz-date'] === signingDate(serverTime);
        return {
          response: new HttpResponse({
            statusCode: signatureMatches ? 200 : 403,
            headers: signatureMatches
              ? { 'content-type': 'application/json' }
              : {
                  'content-type': 'application/json',
                  'x-amzn-errortype': 'RequestTimeTooSkewed',
                  date: new Date(serverTime).toUTCString(),
                },
            body: new TextEncoder().encode(
              JSON.stringify(
                signatureMatches
                  ? { output: 'offline response' }
                  : { __type: 'RequestTimeTooSkewed', message: 'Clock skew fixture' },
              ),
            ),
          }),
        };
      });
    }
    return client;
  });
  return { provider, clients, requests };
}

describe('SageMaker clock correction across idle cleanup', () => {
  let restoreEnv: () => void;
  let configDirectory: string;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(startTime);
    configDirectory = await mkdtemp(path.join(tmpdir(), 'promptfoo-sagemaker-clock-'));
    const emptyConfig = path.join(configDirectory, 'empty-config');
    await writeFile(emptyConfig, '');
    restoreEnv = mockProcessEnv({
      ...Object.fromEntries(
        Object.keys(process.env)
          .filter((name) => name.startsWith('AWS_'))
          .map((name) => [name, undefined]),
      ),
      AWS_CONFIG_FILE: emptyConfig,
      AWS_SHARED_CREDENTIALS_FILE: emptyConfig,
      AWS_DEFAULTS_MODE: 'legacy',
      AWS_DISABLE_CLOCK_SKEW_CORRECTION: 'false',
      AWS_EC2_METADATA_DISABLED: 'true',
      AWS_SAGEMAKER_MAX_RETRIES: '1',
    });
    for (const transport of [http, https]) {
      vi.spyOn(transport, 'request').mockImplementation(() => {
        throw new Error('Unexpected network request in offline clock-skew test');
      });
    }
  });

  afterEach(async () => {
    for (const provider of providers) {
      provider.cleanup();
    }
    providers.clear();
    vi.restoreAllMocks();
    restoreEnv();
    vi.useRealTimers();
    await rm(configDirectory, { recursive: true, force: true });
  });

  it.each([clockSkew, -clockSkew])(
    'retains a %i ms correction learned by a failed request when the next client is created',
    async (offset) => {
      const { provider, clients, requests } = createProvider(() => offset);

      expect(await provider.callApi('first row')).toMatchObject({
        error: expect.stringContaining('Clock skew fixture'),
      });
      expect(requests).toHaveLength(1);
      expect(requests[0].headers['x-amz-date']).toBe(signingDate(startTime.getTime()));
      expect(provider.sagemakerRuntime).toBeUndefined();
      const [first] = [...clients];
      expect(first.config.systemClockOffset).toBe(offset);
      expect(first.destroy).toHaveBeenCalledOnce();

      expect(await provider.callApi('second row')).toMatchObject({ output: 'offline response' });
      expect(clients.size).toBe(2);
      const [, second] = [...clients];
      expect(second).not.toBe(first);
      expect(second.destroy).toHaveBeenCalledOnce();
      expect(requests).toHaveLength(2);
      expect(requests[1].headers['x-amz-date']).toBe(signingDate(startTime.getTime() + offset));
    },
  );

  it('replaces a retained correction with zero when the host clock is corrected', async () => {
    let serverOffset = clockSkew;
    const { provider, clients, requests } = createProvider(() => serverOffset);
    expect(await provider.callApi('learn correction')).toMatchObject({
      error: expect.stringContaining('Clock skew fixture'),
    });
    expect(await provider.callApi('use correction')).toMatchObject({ output: 'offline response' });

    vi.setSystemTime(startTime.getTime() + clockSkew);
    serverOffset = 0;
    expect(await provider.callApi('clock corrected')).toMatchObject({
      error: expect.stringContaining('Clock skew fixture'),
    });
    expect(requests).toHaveLength(3);
    expect(requests[2].headers['x-amz-date']).toBe(signingDate(Date.now() + clockSkew));
    const [, , relearned] = [...clients];
    expect(relearned.config.systemClockOffset).toBe(0);

    expect(await provider.callApi('use zero correction')).toMatchObject({
      output: 'offline response',
    });
    expect(requests).toHaveLength(4);
    expect(requests[3].headers['x-amz-date']).toBe(signingDate(Date.now()));
    expect(clients.size).toBe(4);
    for (const client of clients) {
      expect(client.destroy).toHaveBeenCalledOnce();
    }
  });

  it('retains corrections per region and provider across cleanup and credential changes', async () => {
    const serverOffset = (request: HttpRequest) =>
      request.headers.authorization.includes('/us-east-1/sagemaker/') ? clockSkew : -clockSkew;
    const { provider, clients, requests } = createProvider(serverOffset);
    expect(await provider.callApi('learn east')).toMatchObject({
      error: expect.stringContaining('Clock skew fixture'),
    });

    provider.cleanup();
    provider.config.accessKeyId = 'ROTATED_KEY';
    expect(await provider.callApi('east after cleanup')).toMatchObject({
      output: 'offline response',
    });
    expect(requests[1].headers.authorization).toContain('Credential=ROTATED_KEY/');
    expect(requests[1].headers['x-amz-date']).toBe(signingDate(Date.now() + clockSkew));

    provider.config.region = 'us-west-2';
    expect(await provider.callApi('learn west')).toMatchObject({
      error: expect.stringContaining('Clock skew fixture'),
    });
    expect(requests[2].headers.authorization).toContain('/us-west-2/sagemaker/');
    expect(requests[2].headers['x-amz-date']).toBe(signingDate(Date.now()));
    expect(await provider.callApi('use west correction')).toMatchObject({
      output: 'offline response',
    });
    expect(requests[3].headers['x-amz-date']).toBe(signingDate(Date.now() - clockSkew));

    provider.config.region = 'us-east-1';
    expect(await provider.callApi('return east')).toMatchObject({ output: 'offline response' });
    expect(requests[4].headers['x-amz-date']).toBe(signingDate(Date.now() + clockSkew));
    expect(requests).toHaveLength(5);
    expect(clients.size).toBe(5);
    for (const client of clients) {
      expect(client.destroy).toHaveBeenCalledOnce();
    }

    const fresh = createProvider(serverOffset);
    expect(await fresh.provider.callApi('fresh east')).toMatchObject({
      error: expect.stringContaining('Clock skew fixture'),
    });
    expect(fresh.requests).toHaveLength(1);
    expect(fresh.requests[0].headers['x-amz-date']).toBe(signingDate(Date.now()));
  });
});
