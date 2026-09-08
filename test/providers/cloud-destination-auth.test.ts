import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { setEnvOverridesProvider } from '../../src/envOverrides';
import { loadApiProvider } from '../../src/providers';
import { mockProcessEnv } from '../util/utils';

import type { EnvOverrides } from '../../src/types/env';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
}));

describe.each([
  {
    providerName: 'cloudera',
    destinationKey: 'CDP_DOMAIN',
    tokenKey: 'CDP_TOKEN',
    configKey: 'domain',
    destinationA: 'deployment-a.example.test',
    destinationB: 'deployment-b.example.test',
    destinationC: 'deployment-c.example.test',
    requestUrl: (destination: string) =>
      `https://${destination}/namespaces/serving-default/endpoints/fixture-model/v1/chat/completions`,
  },
  {
    providerName: 'snowflake',
    destinationKey: 'SNOWFLAKE_ACCOUNT_IDENTIFIER',
    tokenKey: 'SNOWFLAKE_API_KEY',
    configKey: 'accountIdentifier',
    destinationA: 'account-a',
    destinationB: 'account-b',
    destinationC: 'account-c',
    requestUrl: (destination: string) =>
      `https://${destination}.snowflakecomputing.com/api/v2/cortex/inference:complete`,
  },
] as const)(
  '$providerName destination and credential pairing',
  ({
    providerName,
    destinationKey,
    tokenKey,
    configKey,
    destinationA,
    destinationB,
    destinationC,
    requestUrl,
  }) => {
    const providerPath = `${providerName}:fixture-model`;
    let restoreProcessEnv: () => void;

    const scopeEnv = (destination: string, token: string): EnvOverrides => ({
      [destinationKey]: destination,
      [tokenKey]: token,
    });
    const providerEnvB = scopeEnv(destinationB, 'fixture-provider-token-b');

    beforeEach(() => {
      setEnvOverridesProvider(undefined);
      restoreProcessEnv = mockProcessEnv({
        CDP_DOMAIN: undefined,
        CDP_TOKEN: undefined,
        SNOWFLAKE_ACCOUNT_IDENTIFIER: undefined,
        SNOWFLAKE_API_KEY: undefined,
        [destinationKey]: destinationA,
        [tokenKey]: 'fixture-process-token-a',
      });
      vi.mocked(fetchWithCache).mockReset();
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: {
          choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });
    });

    afterEach(() => {
      setEnvOverridesProvider(undefined);
      restoreProcessEnv();
      vi.resetAllMocks();
    });

    function expectRequest(destination: string, token: string) {
      expect(fetchWithCache).toHaveBeenCalledTimes(1);
      const [url, init] = vi.mocked(fetchWithCache).mock.calls[0];
      expect({ url, authorization: new Headers(init?.headers).get('Authorization') }).toEqual({
        url: requestUrl(destination),
        authorization: `Bearer ${token}`,
      });
      expect(JSON.parse(init?.body as string)).toMatchObject({
        model: 'fixture-model',
        messages: [{ role: 'user', content: 'hello' }],
      });
    }

    const successResponse = {
      output: 'hello',
      cached: false,
      tokenUsage: { prompt: 3, completion: 2, total: 5 },
    };

    it('uses the provider destination and token ahead of the process pair', async () => {
      const provider = await loadApiProvider(providerPath, { options: { env: providerEnvB } });

      expect(await provider.callApi('hello')).toMatchObject(successResponse);
      expectRequest(destinationB, 'fixture-provider-token-b');
    });

    it('uses the provider destination and token ahead of the suite pair', async () => {
      const suiteEnv = scopeEnv(destinationA, 'fixture-suite-token-a');
      setEnvOverridesProvider(() => suiteEnv);
      const provider = await loadApiProvider(providerPath, {
        env: suiteEnv,
        options: { env: providerEnvB },
      });

      expect(await provider.callApi('hello')).toMatchObject(successResponse);
      expectRequest(destinationB, 'fixture-provider-token-b');
    });

    it('uses the registered suite destination and token ahead of the process pair', async () => {
      const suiteEnv = scopeEnv(destinationB, 'fixture-suite-token-b');
      setEnvOverridesProvider(() => suiteEnv);
      const provider = await loadApiProvider(providerPath, { env: suiteEnv });

      expect(await provider.callApi('hello')).toMatchObject(successResponse);
      expectRequest(destinationB, 'fixture-suite-token-b');
    });

    it('uses an explicit config destination and token ahead of all environment pairs', async () => {
      const suiteEnv = scopeEnv(destinationA, 'fixture-suite-token-a');
      setEnvOverridesProvider(() => suiteEnv);
      const provider = await loadApiProvider(providerPath, {
        env: suiteEnv,
        options: {
          env: providerEnvB,
          config: { [configKey]: destinationC, apiKey: 'fixture-config-token-c' },
        },
      });

      expect(await provider.callApi('hello')).toMatchObject(successResponse);
      expectRequest(destinationC, 'fixture-config-token-c');
    });

    it.each([
      { status: 401, statusText: 'Unauthorized', registeredSuite: false },
      { status: 403, statusText: 'Forbidden', registeredSuite: true },
    ])(
      'preserves $status errors with a coherent destination and token',
      async ({ status, statusText, registeredSuite }) => {
        const suiteEnv = registeredSuite
          ? scopeEnv(destinationA, 'fixture-suite-token-a')
          : undefined;
        setEnvOverridesProvider(suiteEnv ? () => suiteEnv : undefined);
        const errorData = { error: { message: 'Fixture authentication failure' } };
        vi.mocked(fetchWithCache).mockResolvedValue({
          data: errorData,
          cached: false,
          status,
          statusText,
        });
        const provider = await loadApiProvider(providerPath, {
          env: suiteEnv,
          options: { env: providerEnvB },
        });

        const response = await provider.callApi('hello');
        expect(response.error).toBe(
          `API error: ${status} ${statusText}\n${JSON.stringify(errorData)}`,
        );
        expect(response.output).toBeUndefined();
        expectRequest(destinationB, 'fixture-provider-token-b');
      },
    );
  },
);
