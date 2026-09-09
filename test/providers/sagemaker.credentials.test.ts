import http from 'node:http';
import https from 'node:https';

import { HttpResponse } from '@smithy/core/transport';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SageMakerCompletionProvider } from '../../src/providers/sagemaker';
import type { SageMakerRuntimeClient } from '@aws-sdk/client-sagemaker-runtime';
import type { HttpRequest } from '@smithy/core/transport';

const { fromSSO } = vi.hoisted(() => ({ fromSSO: vi.fn() }));

vi.mock('@aws-sdk/credential-provider-sso', () => ({ fromSSO }));
vi.mock('../../src/cache', () => ({
  isCacheEnabled: () => false,
  getCache: () => ({ get: vi.fn(), set: vi.fn() }),
}));
vi.mock('../../src/telemetry', () => ({ default: { record: vi.fn() } }));

const startTime = new Date('2026-01-01T00:00:00Z');

function credentials(accessKeyId: string, expiration = new Date(Date.now() + 3_600_000)) {
  return {
    accessKeyId,
    secretAccessKey: 'offline-secret',
    sessionToken: 'offline-token',
    expiration,
  };
}

function createProvider() {
  const provider = new SageMakerCompletionProvider('endpoint', {
    config: { profile: 'first-profile', region: 'us-east-1', modelType: 'custom' },
  });
  const clients = new Set<SageMakerRuntimeClient>();
  const requests: HttpRequest[] = [];
  const initialize = provider.getSageMakerRuntimeInstance.bind(provider);
  vi.spyOn(provider, 'getSageMakerRuntimeInstance').mockImplementation(async (...args) => {
    const client: SageMakerRuntimeClient = await initialize(...args);
    if (!clients.has(client)) {
      clients.add(client);
      vi.spyOn(client, 'destroy');
      // Keep the real SDK serializer, signer, credential memoizer, and retry middleware.
      // Replace only the transport boundary; no request reaches AWS.
      vi.spyOn(client.config.requestHandler, 'handle').mockImplementation(async (request) => {
        requests.push(request);
        return {
          response: new HttpResponse({
            statusCode: 200,
            headers: { 'content-type': 'application/json' },
            body: new TextEncoder().encode(JSON.stringify({ output: 'offline response' })),
          }),
        };
      });
    }
    return client;
  });
  return { provider, clients, requests };
}

describe('SageMaker profile credentials across idle cleanup', () => {
  beforeEach(() => {
    fromSSO.mockReset();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(startTime);
    vi.stubEnv('AWS_DEFAULTS_MODE', 'legacy');
    vi.stubEnv('AWS_SAGEMAKER_MAX_RETRIES', '1');
    for (const transport of [http, https]) {
      vi.spyOn(transport, 'request').mockImplementation(() => {
        throw new Error('Unexpected network request in offline credential test');
      });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it.each([
    ['AWS_SAGEMAKER_TEMPERATURE', '0.2'],
    ['AWS_SAGEMAKER_MAX_TOKENS', '64'],
    ['AWS_SAGEMAKER_TOP_P', '0.8'],
    ['AWS_SAGEMAKER_MAX_RETRIES', '2'],
  ] as const)(
    'keeps valid role credentials when %s changes after SSO login expiry',
    async (key, value) => {
      vi.stubEnv(key, undefined);
      const roleCredentials = credentials('FIRST_ROLE');
      const resolveSSO = vi.fn(async () => {
        if (Date.now() > startTime.getTime() + 60_000) {
          throw new Error('The SSO session associated with this profile has expired');
        }
        return roleCredentials;
      });
      fromSSO.mockReturnValue(resolveSSO);
      const { provider, clients, requests } = createProvider();

      expect(await provider.callApi('first row')).toMatchObject({ output: 'offline response' });
      expect(provider.sagemakerRuntime).toBeUndefined();
      vi.setSystemTime(startTime.getTime() + 120_000);
      vi.stubEnv(key, value);
      const secondResponse = await provider.callApi('second row');
      expect(secondResponse.error).toBeUndefined();
      expect(secondResponse.output).toBe('offline response');

      expect(clients.size).toBe(2);
      for (const client of clients) {
        expect(client.destroy).toHaveBeenCalledOnce();
      }
      expect(requests).toHaveLength(2);
      expect(
        requests.every((request) =>
          request.headers.authorization.includes('Credential=FIRST_ROLE/'),
        ),
      ).toBe(true);
      expect(fromSSO).toHaveBeenCalledOnce();
      expect(resolveSSO).toHaveBeenCalledOnce();
      const [first, second] = [...clients];
      expect(second.config.credentials).toBe(first.config.credentials);
    },
  );

  it('coalesces refreshes and retries after a refresh failure', async () => {
    const resolveSSO = vi.fn().mockResolvedValueOnce(credentials('FIRST_ROLE'));
    fromSSO.mockReturnValue(resolveSSO);
    const { provider, requests } = createProvider();
    expect(await provider.callApi('first row')).toMatchObject({ output: 'offline response' });

    vi.setSystemTime(startTime.getTime() + 56 * 60_000);
    resolveSSO.mockRejectedValueOnce(new Error('SSO login expired during refresh'));
    expect(await provider.callApi('failed refresh')).toMatchObject({
      error: expect.stringContaining('SSO login expired during refresh'),
    });
    expect(requests).toHaveLength(1);

    const refreshedCredentials = credentials('REFRESHED_ROLE');
    resolveSSO.mockResolvedValue(refreshedCredentials);
    const responses = await Promise.all([
      provider.callApi('retry one'),
      provider.callApi('retry two'),
    ]);
    expect(responses).toEqual([
      expect.objectContaining({ output: 'offline response' }),
      expect.objectContaining({ output: 'offline response' }),
    ]);
    expect(fromSSO).toHaveBeenCalledOnce();
    expect(resolveSSO).toHaveBeenCalledTimes(3);
    expect(requests).toHaveLength(3);
    expect(
      requests
        .slice(1)
        .every((request) => request.headers.authorization.includes('Credential=REFRESHED_ROLE/')),
    ).toBe(true);

    const client: SageMakerRuntimeClient = await provider.getSageMakerRuntimeInstance();
    await client.config.credentials({ forceRefresh: true });
    expect(resolveSSO).toHaveBeenCalledTimes(4);
    provider.cleanup();
  });

  it.each([
    ['profile', 'second-profile'],
    ['region', 'us-west-2'],
    ['sessionToken', 'changed-token'],
    ['accessKeyId', 'incomplete-explicit-key'],
    ['secretAccessKey', 'incomplete-explicit-secret'],
  ] as const)('replaces the retained provider when %s changes', async (key, value) => {
    fromSSO.mockImplementation(
      ({ profile }) =>
        async () =>
          credentials(`${profile}_${fromSSO.mock.calls.length}`),
    );
    const { provider, requests } = createProvider();
    expect(await provider.callApi('first row')).toMatchObject({ output: 'offline response' });
    provider.config[key] = value;
    expect(await provider.callApi('second row')).toMatchObject({ output: 'offline response' });
    expect(fromSSO).toHaveBeenCalledTimes(2);
    expect(fromSSO).toHaveBeenLastCalledWith({ profile: provider.config.profile });
    expect(requests[1].headers.authorization).toContain(`Credential=${provider.config.profile}_2/`);
    expect(requests[1].headers.authorization).toContain(`/${provider.config.region}/sagemaker/`);
  });

  it('gives complete explicit credentials priority and clears the retained profile', async () => {
    const resolveSSO = vi.fn(async () => credentials('PROFILE_ROLE'));
    fromSSO.mockReturnValue(resolveSSO);
    const { provider, requests } = createProvider();
    expect(await provider.callApi('profile row')).toMatchObject({ output: 'offline response' });
    provider.config.accessKeyId = 'EXPLICIT_KEY';
    provider.config.secretAccessKey = 'explicit-secret';
    provider.config.sessionToken = 'explicit-token';
    expect(await provider.callApi('explicit row')).toMatchObject({ output: 'offline response' });
    expect(requests[1].headers.authorization).toContain('Credential=EXPLICIT_KEY/');
    expect(requests[1].headers['x-amz-security-token']).toBe('explicit-token');
    expect(fromSSO).toHaveBeenCalledOnce();
    provider.config.accessKeyId = undefined;
    provider.config.secretAccessKey = undefined;
    provider.config.sessionToken = undefined;
    expect(await provider.callApi('profile again')).toMatchObject({ output: 'offline response' });
    expect(fromSSO).toHaveBeenCalledTimes(2);
    expect(resolveSSO).toHaveBeenCalledTimes(2);
  });

  it('clears retained profile credentials when returning to the default chain', async () => {
    fromSSO.mockReturnValue(async () => credentials('PROFILE_ROLE'));
    const { provider, requests } = createProvider();
    expect(await provider.callApi('profile row')).toMatchObject({ output: 'offline response' });
    vi.stubEnv('AWS_PROFILE', undefined);
    vi.stubEnv('AWS_ACCESS_KEY_ID', 'ENVIRONMENT_KEY');
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'environment-secret');
    vi.stubEnv('AWS_SESSION_TOKEN', 'environment-token');
    provider.config.profile = undefined;
    expect(await provider.callApi('default row')).toMatchObject({ output: 'offline response' });
    expect(requests[1].headers.authorization).toContain('Credential=ENVIRONMENT_KEY/');
    expect(requests[1].headers['x-amz-security-token']).toBe('environment-token');
    provider.config.profile = 'first-profile';
    expect(await provider.callApi('profile again')).toMatchObject({ output: 'offline response' });
    expect(fromSSO).toHaveBeenCalledTimes(2);
  });

  it('captures the profile before the credential package loads', async () => {
    fromSSO.mockReturnValue(async () => credentials('PROFILE_ROLE'));
    const { provider } = createProvider();
    const pending = provider.getCredentials();
    provider.config.profile = 'second-profile';
    await pending;
    expect(fromSSO).toHaveBeenCalledWith({ profile: 'first-profile' });
  });

  it('never reads credentials from a borrowed client', async () => {
    const provider = new SageMakerCompletionProvider('endpoint', {
      config: { profile: 'first-profile', modelType: 'custom' },
    });
    const readConfig = vi.fn(() => {
      throw new Error('Borrowed client credentials must not be read');
    });
    const borrowed = {
      get config() {
        return readConfig();
      },
      destroy: vi.fn(),
    };
    provider.sagemakerRuntime = borrowed;
    expect(await provider.getSageMakerRuntimeInstance()).toBe(borrowed);
    provider.cleanup();
    expect(fromSSO).not.toHaveBeenCalled();
    expect(readConfig).not.toHaveBeenCalled();
    expect(borrowed.destroy).not.toHaveBeenCalled();
  });
});
