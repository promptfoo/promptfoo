import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { ProviderEnvOverridesSchema } from '../../src/contracts/env';
import { loadApiProvider } from '../../src/providers';
import { ProviderOptionsSchema } from '../../src/validators/providers';

import type { ApiEmbeddingProvider } from '../../src/types/providers';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(fetchWithCache).mockReset();
  vi.stubEnv('SNOWFLAKE_ACCOUNT_IDENTIFIER', 'process-account');
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

describe('cloud provider loader configuration', () => {
  it('forwards Cloudera domain config while preserving the deployed endpoint and model', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: { choices: [{ message: { content: 'hello' } }] },
      cached: false,
      status: 200,
      statusText: 'OK',
    });
    const provider = await loadApiProvider('cloudera:customer:model', {
      options: {
        config: {
          domain: 'deployment.example.test',
          apiKey: 'fixture-token',
          endpoint: 'endpoint-name',
        },
      },
    });
    expect(await provider.callApi('hello')).toMatchObject({ output: 'hello' });
    const [url, init] = vi.mocked(fetchWithCache).mock.calls[0];
    expect(url).toBe(
      'https://deployment.example.test/namespaces/serving-default/endpoints/endpoint-name/v1/chat/completions',
    );
    expect(JSON.parse(init?.body as string)).toMatchObject({ model: 'customer:model' });
  });

  it('forwards Voyage config, full model ID, custom label and cached response', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: { data: [{ embedding: [0.1, 0.2] }], usage: { total_tokens: 2 } },
      cached: true,
      status: 200,
      statusText: 'OK',
      latencyMs: 12,
    });
    const provider = (await loadApiProvider('voyage:private:embedding', {
      options: {
        id: 'retrieval',
        config: {
          apiKey: 'fixture-explicit',
          apiBaseUrl: 'https://voyage.example.test/v1',
          headers: { 'X-Fixture': 'yes' },
        },
      },
    })) as unknown as ApiEmbeddingProvider;
    expect(provider.id()).toBe('retrieval');
    expect(await provider.callEmbeddingApi('hello')).toMatchObject({
      embedding: [0.1, 0.2],
      cached: true,
      latencyMs: 12,
    });
    const [url, init] = vi.mocked(fetchWithCache).mock.calls[0];
    expect(url).toBe('https://voyage.example.test/v1/embeddings');
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer fixture-explicit',
      'X-Fixture': 'yes',
    });
    expect(JSON.parse(init?.body as string)).toEqual({
      input: ['hello'],
      model: 'private:embedding',
    });
  });

  it.each([
    { apiKey: undefined, scopedKey: 'fixture-scoped', expected: 'fixture-scoped' },
    { apiKey: 'fixture-explicit', scopedKey: 'fixture-scoped', expected: 'fixture-explicit' },
    { apiKey: undefined, scopedKey: undefined, expected: 'fixture-process' },
  ])(
    'pairs the Voyage destination with its selected key: $expected',
    async ({ apiKey, scopedKey, expected }) => {
      vi.stubEnv('VOYAGE_API_KEY', 'fixture-process');
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: { data: [{ embedding: [0.1, 0.2] }] },
        cached: false,
        status: 200,
        statusText: 'OK',
      });
      const provider = (await loadApiProvider('voyage:private:embedding', {
        options: {
          config: { apiKey, apiKeyEnvar: 'VOYAGE_API_KEY' },
          env: {
            VOYAGE_API_KEY: scopedKey,
            VOYAGE_API_BASE_URL: 'https://scoped-voyage.example.test/v1',
          },
        },
      })) as ApiEmbeddingProvider;

      await provider.callEmbeddingApi('hello');
      const [url, init] = vi.mocked(fetchWithCache).mock.calls[0];
      expect(url).toBe('https://scoped-voyage.example.test/v1/embeddings');
      expect(init?.headers).toMatchObject({ Authorization: `Bearer ${expected}` });
    },
  );

  it('uses provider Voyage env overrides and preserves HTTP errors', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: { error: { message: 'Fixture rate limit' } },
      cached: false,
      status: 429,
      statusText: 'Too Many Requests',
    });
    const provider = (await loadApiProvider('voyage:voyage-4', {
      env: { VOYAGE_API_KEY: 'fixture-suite' },
      options: {
        env: {
          VOYAGE_API_KEY: 'fixture-provider',
          VOYAGE_API_BASE_URL: 'https://voyage-env.example.test/v1',
        },
      },
    })) as unknown as ApiEmbeddingProvider;
    await expect(provider.callEmbeddingApi('hello')).rejects.toThrow(
      'Voyage API rate limit exceeded: 429',
    );
    expect(vi.mocked(fetchWithCache).mock.calls[0]).toEqual(
      expect.arrayContaining([
        'https://voyage-env.example.test/v1/embeddings',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer fixture-provider' }),
        }),
      ]),
    );
  });

  it('forwards Snowflake account config, full model ID and completion parameters', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: {
        choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });
    const provider = await loadApiProvider('snowflake:private:model', {
      options: {
        id: 'warehouse',
        config: {
          accountIdentifier: 'configured-account',
          apiKey: 'fixture-explicit',
          temperature: 0.25,
        },
      },
    });
    expect(provider.id()).toBe('warehouse');
    expect(await provider.callApi('hello')).toMatchObject({
      output: 'hello',
      cached: false,
      tokenUsage: { total: 5 },
    });
    const [url, init] = vi.mocked(fetchWithCache).mock.calls[0];
    expect(url).toBe(
      'https://configured-account.snowflakecomputing.com/api/v2/cortex/inference:complete',
    );
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer fixture-explicit' });
    expect(JSON.parse(init?.body as string)).toMatchObject({
      model: 'private:model',
      temperature: 0.25,
    });
  });

  it('uses explicit Snowflake account config ahead of process env', async () => {
    const provider = await loadApiProvider('snowflake:mistral-large2', {
      env: { SNOWFLAKE_ACCOUNT_IDENTIFIER: 'suite-account' },
      options: {
        config: { accountIdentifier: 'configured-account', apiKey: 'fixture-key' },
      },
    });
    expect((provider as unknown as { getApiUrl(): string }).getApiUrl()).toBe(
      'https://configured-account.snowflakecomputing.com',
    );
  });

  it.each([
    ['cloudera:customer:model', 'CDP_DOMAIN', 'CDP_TOKEN', 'deployment.example.test', 'domain'],
    [
      'snowflake:private:model',
      'SNOWFLAKE_ACCOUNT_IDENTIFIER',
      'SNOWFLAKE_API_KEY',
      'provider-account',
      'accountIdentifier',
    ],
  ])(
    'retains parsed credentials with explicit deployment config for %s',
    async (id, locationKey, tokenKey, location, configKey) => {
      vi.stubEnv(tokenKey, '');
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: { choices: [{ message: { content: 'hello' } }] },
        cached: false,
        status: 200,
        statusText: 'OK',
      });
      const env = { [locationKey]: location, [tokenKey]: 'fixture-provider' };
      const options = ProviderOptionsSchema.parse({
        id: 'custom-label',
        env,
        config: { [configKey]: location },
      });
      expect(options.env).toEqual(env);
      const provider = await loadApiProvider(id, { options });
      expect(provider.id()).toBe('custom-label');
      expect(await provider.callApi('hello')).toMatchObject({ output: 'hello' });
      const [url, init] = vi.mocked(fetchWithCache).mock.calls[0];
      expect(String(url)).toContain(location);
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer fixture-provider' });
    },
  );

  it.each(['CDP_DOMAIN', 'CDP_TOKEN', 'SNOWFLAKE_ACCOUNT_IDENTIFIER', 'SNOWFLAKE_API_KEY'])(
    'accepts only string overrides for %s',
    (key) => {
      expect(ProviderEnvOverridesSchema.safeParse({ [key]: 123 }).success).toBe(false);
      expect(ProviderEnvOverridesSchema.parse({ [key]: '' })).toEqual({ [key]: '' });
    },
  );

  it('preserves explicit Cloudera domain and credentials ahead of environment', async () => {
    vi.stubEnv('CDP_TOKEN', 'fixture-process');
    const provider = await loadApiProvider('cloudera:customer:model', {
      env: { CDP_DOMAIN: 'suite.example.test', CDP_TOKEN: 'fixture-suite' },
      options: { config: { domain: 'explicit.example.test', apiKey: 'fixture-explicit' } },
    });
    expect((provider as unknown as { getApiUrl(): string }).getApiUrl()).toContain(
      'explicit.example.test',
    );
    expect((provider as unknown as { getApiKey(): string }).getApiKey()).toBe('fixture-explicit');
  });
});
