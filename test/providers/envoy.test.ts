import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import cliState from '../../src/cliState';
import { ProviderEnvOverridesSchema } from '../../src/contracts/env';
import { createEnvoyProvider } from '../../src/providers/envoy';
import { loadApiProvider, loadApiProviders } from '../../src/providers/index';
import { getProviderFactories } from '../../src/providers/registry';
import { mockProcessEnv } from '../util/utils';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));

describe('Envoy gateway URLs', () => {
  let restoreEnv: () => void;
  let previousConfig: typeof cliState.config;

  beforeEach(() => {
    previousConfig = cliState.config;
    cliState.config = undefined;
    restoreEnv = mockProcessEnv({
      ENVOY_API_BASE_URL: 'https://env.example/v1/',
      OPENAI_API_KEY: 'test-envoy-key',
      OPENAI_API_BASE_URL: undefined,
      OPENAI_BASE_URL: undefined,
      OPENAI_API_HOST: undefined,
      OPENAI_ORGANIZATION: undefined,
      ENVOY_TEST_KEY: 'test-process-key',
      MISSING_ENVOY_TEST_KEY: undefined,
    });
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: {
        choices: [{ message: { role: 'assistant', content: 'Hello' }, finish_reason: 'stop' }],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
    restoreEnv();
    cliState.config = previousConfig;
  });

  it.each([
    'https://gateway.example',
    'https://gateway.example/',
    'https://gateway.example//',
    'https://gateway.example/v1',
    'https://gateway.example/v1/',
    'https://gateway.example/v1//',
  ])('uses one /v1 path for environment URL %s', async (url) => {
    mockProcessEnv({ ENVOY_API_BASE_URL: url });
    const provider = createEnvoyProvider('envoy:route:stable');

    const response = await provider.callApi('Hello');

    expect(response.output).toBe('Hello');
    expect(fetchWithCache).toHaveBeenCalledTimes(1);
    const [requestUrl, request] = vi.mocked(fetchWithCache).mock.calls[0];
    expect(requestUrl).toBe('https://gateway.example/v1/chat/completions');
    expect(JSON.parse(request?.body as string)).toMatchObject({ model: 'route:stable' });
  });

  it('inserts /v1 before gateway URL search and hash', async () => {
    mockProcessEnv({ ENVOY_API_BASE_URL: 'https://gateway.example?token=x#route' });
    const provider = createEnvoyProvider('envoy:route:stable');

    await provider.callApi('Hello');

    expect(vi.mocked(fetchWithCache).mock.calls[0][0]).toBe(
      'https://gateway.example/v1/chat/completions?token=x#route',
    );
  });

  it.each([
    ['https://configured.example', 'https://configured.example/chat/completions'],
    ['https://configured.example/v1/', 'https://configured.example/v1/chat/completions'],
    ['https://configured.example/custom/', 'https://configured.example/custom/chat/completions'],
  ])('preserves explicit URL %s over the environment', async (apiBaseUrl, expectedUrl) => {
    const provider = createEnvoyProvider('envoy:route:stable', {
      id: 'custom-id',
      config: {
        config: {
          apiBaseUrl,
          headers: { 'X-Gateway': 'configured' },
          temperature: 0.25,
        },
      },
    });

    const response = await provider.callApi('Hello');

    expect(response.output).toBe('Hello');
    expect(provider.id()).toBe('custom-id');
    expect(fetchWithCache).toHaveBeenCalledTimes(1);
    const [requestUrl, request] = vi.mocked(fetchWithCache).mock.calls[0];
    expect(requestUrl).toBe(expectedUrl);
    expect(request?.headers).toMatchObject({ 'X-Gateway': 'configured' });
    expect(JSON.parse(request?.body as string)).toMatchObject({
      model: 'route:stable',
      temperature: 0.25,
    });
  });

  it.each([
    [
      'provider',
      'https://provider.example/v1//',
      'https://suite.example',
      undefined,
      'https://provider.example/v1/chat/completions',
    ],
    [
      'suite',
      undefined,
      'https://suite.example/',
      undefined,
      'https://suite.example/v1/chat/completions',
    ],
    [
      'registered',
      undefined,
      undefined,
      'https://registered.example/v1/',
      'https://registered.example/v1/chat/completions',
    ],
    ['empty provider', '', undefined, undefined, 'https://env.example/v1/chat/completions'],
    [
      'empty provider with registered value',
      '',
      undefined,
      'https://registered.example/',
      'https://registered.example/v1/chat/completions',
    ],
  ] as const)(
    'uses the %s native URL through the loader',
    async (_, providerUrl, suiteUrl, registeredUrl, expectedUrl) => {
      if (registeredUrl !== undefined) {
        cliState.config = { env: { ENVOY_API_BASE_URL: registeredUrl } };
      }
      const [provider] = await loadApiProviders(
        [
          {
            id: 'envoy:route:stable',
            env: providerUrl === undefined ? undefined : { ENVOY_API_BASE_URL: providerUrl },
          },
        ],
        { env: suiteUrl === undefined ? undefined : { ENVOY_API_BASE_URL: suiteUrl } },
      );

      expect((await provider.callApi('Hello')).output).toBe('Hello');
      expect(fetchWithCache).toHaveBeenCalledTimes(1);
      expect(vi.mocked(fetchWithCache).mock.calls[0][0]).toBe(expectedUrl);
    },
  );

  it.each([
    ['provider over suite', 'test-provider-key', 'test-suite-key', undefined, 'test-provider-key'],
    ['provider over process', 'test-provider-key', undefined, undefined, 'test-provider-key'],
    ['suite over process', undefined, 'test-suite-key', undefined, 'test-suite-key'],
    ['process', undefined, undefined, undefined, 'test-process-key'],
    [
      'explicit config',
      'test-provider-key',
      'test-suite-key',
      'test-explicit-key',
      'test-explicit-key',
    ],
  ] as const)(
    'uses the %s key in an actual loader request',
    async (_, providerKey, suiteKey, apiKey, expectedKey) => {
      const [provider] = await loadApiProviders(
        [
          {
            id: 'envoy:route:stable',
            env: providerKey === undefined ? undefined : { ENVOY_TEST_KEY: providerKey },
            config: {
              apiBaseUrl: 'https://configured.example/custom/',
              apiKeyEnvar: 'ENVOY_TEST_KEY',
              apiKey,
              headers: { 'X-Gateway': 'configured' },
              temperature: 0.25,
            },
          },
        ],
        { env: suiteKey === undefined ? undefined : { ENVOY_TEST_KEY: suiteKey } },
      );

      expect((await provider.callApi('Hello')).output).toBe('Hello');
      expect(fetchWithCache).toHaveBeenCalledTimes(1);
      const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
      expect(url).toBe('https://configured.example/custom/chat/completions');
      expect(request?.headers).toMatchObject({
        Authorization: `Bearer ${expectedKey}`,
        'X-Gateway': 'configured',
      });
      expect(JSON.parse(request?.body as string)).toEqual({
        model: 'route:stable',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 1024,
        temperature: 0.25,
      });
    },
  );

  it('preserves context-only direct factory callers', async () => {
    const factories = await getProviderFactories('envoy:route:stable');
    const factory = factories.find((entry) => entry.test('envoy:route:stable'))!;
    const provider = await factory.create(
      'envoy:route:stable',
      {},
      {
        env: { ENVOY_API_BASE_URL: 'https://context.example/', OPENAI_API_KEY: 'test-context-key' },
      },
    );

    expect((await provider.callApi('Hello')).output).toBe('Hello');
    const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
    expect(url).toBe('https://context.example/v1/chat/completions');
    expect(request?.headers).toMatchObject({ Authorization: 'Bearer test-context-key' });
  });

  it('does not borrow the OpenAI key when the selected variable is missing', async () => {
    const provider = await loadApiProvider('envoy:route:stable', {
      options: { config: { apiKeyEnvar: 'MISSING_ENVOY_TEST_KEY' } },
    });

    await expect(provider.callApi('Hello')).rejects.toThrow('API key');
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('preserves optional authentication with configured headers', async () => {
    const provider = await loadApiProvider('envoy:route:stable', {
      options: {
        config: {
          apiKeyEnvar: 'MISSING_ENVOY_TEST_KEY',
          apiKeyRequired: false,
          headers: { 'x-api-key': 'test-header-key' },
        },
      },
    });

    expect((await provider.callApi('Hello')).output).toBe('Hello');
    const request = vi.mocked(fetchWithCache).mock.calls[0][1];
    expect(request?.headers).toMatchObject({ 'x-api-key': 'test-header-key' });
    expect(request?.headers).not.toHaveProperty('Authorization');
  });

  it('treats an empty registered URL as masking the process URL', async () => {
    cliState.config = { env: { ENVOY_API_BASE_URL: '' } };

    await expect(loadApiProvider('envoy:route:stable')).rejects.toThrow('requires a gateway URL');
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('still requires a native URL when no explicit URL is provided', async () => {
    mockProcessEnv({
      ENVOY_API_BASE_URL: undefined,
      OPENAI_API_BASE_URL: 'https://openai.example/v1',
    });

    await expect(loadApiProvider('envoy:route:stable')).rejects.toThrow('requires a gateway URL');
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('preserves generic URL fallback for an explicitly empty config URL', async () => {
    mockProcessEnv({ OPENAI_API_BASE_URL: 'https://openai.example/custom' });
    const provider = await loadApiProvider('envoy:route:stable', {
      options: { config: { apiBaseUrl: '' } },
    });

    expect((await provider.callApi('Hello')).output).toBe('Hello');
    expect(vi.mocked(fetchWithCache).mock.calls[0][0]).toBe(
      'https://openai.example/custom/chat/completions',
    );
  });

  it('preserves the native URL through the public environment schema', () => {
    const env = { ENVOY_API_BASE_URL: 'https://gateway.example/v1/' };
    expect(ProviderEnvOverridesSchema.parse(env)).toEqual(env);
  });
});
