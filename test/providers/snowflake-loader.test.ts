import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadApiProvider, loadApiProviders } from '../../src/providers';
import { SnowflakeCortexProvider } from '../../src/providers/snowflake';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { mockProcessEnv } from '../util/utils';

const model = 'tenant/custom-model:stable';
const providerId = `snowflake:${model}`;
const completion = {
  choices: [{ message: { content: 'Snowflake response' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
};

describe('Snowflake public provider loading', () => {
  let restoreEnv: () => void;
  let tempDir: string | undefined;
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    restoreEnv = mockProcessEnv({
      SNOWFLAKE_ACCOUNT_IDENTIFIER: undefined,
      SNOWFLAKE_API_KEY: 'process-token',
      PROMPTFOO_CACHE_ENABLED: 'false',
      PROMPTFOO_RETRY_5XX: 'true',
      PROMPTFOO_REQUEST_BACKOFF_MS: '1',
      HTTP_PROXY: undefined,
      HTTPS_PROXY: undefined,
      ALL_PROXY: undefined,
      http_proxy: undefined,
      https_proxy: undefined,
      all_proxy: undefined,
    });
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => Response.json(completion));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    restoreEnv();
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('forwards an explicit account, custom ID, credentials, and request options', async () => {
    const provider = await loadApiProvider(providerId, {
      options: {
        id: 'customer-cortex',
        config: {
          accountIdentifier: 'org-account_123',
          apiKey: 'configured-token',
          temperature: 0.25,
          max_tokens: 27,
          headers: { 'X-Cortex-Test': 'configured-header' },
          passthrough: { top_k: 4 },
        },
      },
    });

    expect(provider).toBeInstanceOf(SnowflakeCortexProvider);
    expect(provider.id()).toBe('customer-cortex');
    const result = await provider.callApi('Hello', {
      vars: {},
      prompt: { raw: 'Hello', label: 'Hello' },
      bustCache: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://org-account_123.snowflakecomputing.com/api/v2/cortex/inference:complete',
    );
    expect(options).toMatchObject({
      method: 'POST',
      headers: {
        Authorization: 'Bearer configured-token',
        'X-Cortex-Test': 'configured-header',
      },
    });
    expect(JSON.parse(options!.body as string)).toMatchObject({
      model,
      messages: [{ role: 'user', content: 'Hello' }],
      temperature: 0.25,
      max_tokens: 27,
      top_k: 4,
    });
    expect(result).toMatchObject({
      output: 'Snowflake response',
      cached: false,
      tokenUsage: { prompt: 3, completion: 2, total: 5 },
    });
  });

  it('loads a custom base URL without an account and prefers the configured key', async () => {
    const [provider] = await loadApiProviders(
      [
        {
          id: providerId,
          config: { apiBaseUrl: 'http://localhost:1234/cortex', apiKey: 'explicit' },
          env: { SNOWFLAKE_API_KEY: 'provider-token' },
        },
      ],
      { env: { SNOWFLAKE_API_KEY: 'suite-token' } },
    );

    await provider.callApi('Hello', {
      vars: {},
      prompt: { raw: 'Hello', label: 'Hello' },
      bustCache: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:1234/cortex/api/v2/cortex/inference:complete',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer explicit' }),
      }),
    );
  });

  it.each([undefined, 'provider-token'])(
    'merges provider and suite environment with provider key %s',
    async (providerKey) => {
      const [provider] = await loadApiProviders(
        [
          {
            id: providerId,
            config: {
              accountIdentifier: 'configured-account',
              headers: { 'X-Suite': '{{ env.OPENAI_ORGANIZATION }}' },
            },
            env: providerKey ? { SNOWFLAKE_API_KEY: providerKey } : {},
          },
        ],
        { env: { SNOWFLAKE_API_KEY: 'suite-token', OPENAI_ORGANIZATION: 'suite-organization' } },
      );

      await provider.callApi('Hello', {
        vars: {},
        prompt: { raw: 'Hello', label: 'Hello' },
        bustCache: true,
      });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://configured-account.snowflakecomputing.com/api/v2/cortex/inference:complete',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${providerKey ?? 'suite-token'}`,
            'X-Suite': 'suite-organization',
          }),
        }),
      );
    },
  );

  it('loads a YAML provider file with caller environment overriding file defaults', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snowflake-loader-'));
    fs.writeFileSync(
      path.join(tempDir, 'provider.yaml'),
      `id: ${providerId}\nconfig:\n  accountIdentifier: file-account\nenv:\n  SNOWFLAKE_API_KEY: file-token\n`,
    );
    const provider = await loadApiProvider('file://provider.yaml', {
      basePath: tempDir,
      env: { SNOWFLAKE_API_KEY: 'caller-token' },
    });

    await provider.callApi('Hello', {
      vars: {},
      prompt: { raw: 'Hello', label: 'Hello' },
      bustCache: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://file-account.snowflakecomputing.com/api/v2/cortex/inference:complete',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer caller-token' }),
      }),
    );
  });

  it('keeps the missing-account error when no endpoint is configured', async () => {
    await expect(loadApiProvider(providerId)).rejects.toThrow(
      'Snowflake provider requires an account identifier',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [false, 0],
    [false, 2],
    [true, 0],
    [true, 2],
  ])(
    'honors retry budget %s/%s through the evaluation registry',
    async (disableScheduler, maxRetries) => {
      const restoreSchedulerEnv = mockProcessEnv({
        PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: String(disableScheduler),
        SNOWFLAKE_ACCOUNT_IDENTIFIER: 'fallback-account',
      });
      vi.useFakeTimers();
      fetchMock.mockImplementation(async () =>
        Response.json({ error: 'temporarily unavailable' }, { status: 503 }),
      );
      const registry = new RateLimitRegistry({ maxConcurrency: 1 });
      try {
        const [provider] = await loadApiProviders([
          {
            id: providerId,
            config: { apiBaseUrl: 'http://localhost:1234', apiKey: 'retry-token', maxRetries },
          },
        ]);
        const pending = registry.execute(provider, () =>
          provider.callApi('Hello', {
            vars: {},
            prompt: { raw: 'Hello', label: 'Hello' },
            bustCache: true,
          }),
        );
        await vi.runAllTimersAsync();
        const result = await pending;
        expect(result.error).toContain('503');
        expect(fetchMock).toHaveBeenCalledTimes(Number(maxRetries) + 1);
      } finally {
        registry.dispose();
        restoreSchedulerEnv();
      }
    },
  );
});
