import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import cliState from '../../src/cliState';
import { loadApiProvider } from '../../src/providers';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
}));

let originalConfig: typeof cliState.config;

function expectRequest(url: string, token: string) {
  expect(fetchWithCache).toHaveBeenCalledTimes(1);
  const [actualUrl, request] = vi.mocked(fetchWithCache).mock.calls[0];
  expect(actualUrl).toBe(url);
  expect(request?.headers).toMatchObject({ Authorization: `Bearer ${token}` });
}

beforeEach(() => {
  originalConfig = cliState.config;
  cliState.config = undefined;
  vi.mocked(fetchWithCache).mockReset();
  vi.mocked(fetchWithCache).mockResolvedValue({
    data: { choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }] },
    cached: false,
    status: 200,
    statusText: 'OK',
  });
});
afterEach(() => {
  cliState.config = originalConfig;
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

describe('Databricks loader request configuration', () => {
  it.each([true, false])(
    'uses Databricks chat endpoint for isPayPerToken=%s with usage metadata',
    async (isPayPerToken) => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: {
          choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });
      const provider = await loadApiProvider('databricks:customer-endpoint', {
        options: {
          config: {
            workspaceUrl: 'https://workspace.example.test',
            apiKey: 'fixture-token',
            isPayPerToken,
            usageContext: { project: 'fixture' },
            passthrough: { custom_field: 'preserved' },
          },
        },
      });
      expect(await provider.callApi('hello')).toMatchObject({
        output: 'hello',
        cached: false,
        tokenUsage: { total: 5, prompt: 3, completion: 2 },
      });
      const [url, init] = vi.mocked(fetchWithCache).mock.calls[0];
      expect(url).toBe('https://workspace.example.test/serving-endpoints/chat/completions');
      expect(JSON.parse(init?.body as string)).toMatchObject({
        model: 'customer-endpoint',
        usage_context: { project: 'fixture' },
        custom_field: 'preserved',
      });
    },
  );

  it.each(['process', 'registered suite'])(
    'keeps the %s workspace and token paired when provider env also supplies a pair',
    async (source) => {
      vi.stubEnv('DATABRICKS_WORKSPACE_URL', 'https://process.example.test');
      vi.stubEnv('DATABRICKS_TOKEN', 'process-token');
      if (source === 'registered suite') {
        cliState.config = {
          env: {
            DATABRICKS_WORKSPACE_URL: 'https://suite.example.test',
            DATABRICKS_TOKEN: 'suite-token',
          },
        };
      }
      const provider = await loadApiProvider('databricks:customer-endpoint', {
        options: {
          env: {
            DATABRICKS_WORKSPACE_URL: 'https://provider.example.test',
            DATABRICKS_TOKEN: 'provider-token',
          },
        },
      });

      expect(await provider.callApi('hello')).toMatchObject({ output: 'hello' });
      const expectedSource = source === 'registered suite' ? 'suite' : 'process';
      expectRequest(
        `https://${expectedSource}.example.test/serving-endpoints/chat/completions`,
        `${expectedSource}-token`,
      );
    },
  );

  it('uses the registered suite workspace and token over the process pair', async () => {
    vi.stubEnv('DATABRICKS_WORKSPACE_URL', 'https://process.example.test');
    vi.stubEnv('DATABRICKS_TOKEN', 'process-token');
    cliState.config = {
      env: {
        DATABRICKS_WORKSPACE_URL: 'https://suite.example.test',
        DATABRICKS_TOKEN: 'suite-token',
      },
    };
    const provider = await loadApiProvider('databricks:customer-endpoint');
    expect(await provider.callApi('hello')).toMatchObject({ output: 'hello' });
    expectRequest('https://suite.example.test/serving-endpoints/chat/completions', 'suite-token');
  });

  it('keeps explicit workspace and credentials ahead of environment values', async () => {
    vi.stubEnv('DATABRICKS_WORKSPACE_URL', 'https://process.example.test');
    vi.stubEnv('DATABRICKS_TOKEN', 'process-token');
    const provider = await loadApiProvider('databricks:customer-endpoint', {
      options: {
        env: {
          DATABRICKS_WORKSPACE_URL: 'https://provider.example.test',
          DATABRICKS_TOKEN: 'provider-token',
        },
        config: { workspaceUrl: 'https://configured.example.test', apiKey: 'configured-token' },
      },
    });
    expect(await provider.callApi('hello')).toMatchObject({ output: 'hello' });
    expectRequest(
      'https://configured.example.test/serving-endpoints/chat/completions',
      'configured-token',
    );
  });

  it('preserves custom apiKeyEnvar precedence alongside the workspace', async () => {
    vi.stubEnv('DATABRICKS_WORKSPACE_URL', 'https://process.example.test');
    vi.stubEnv('AZURE_API_KEY', 'custom-process-token');
    const provider = await loadApiProvider('databricks:customer-endpoint', {
      options: {
        env: {
          DATABRICKS_WORKSPACE_URL: 'https://provider.example.test',
          AZURE_API_KEY: 'custom-provider-token',
        },
        config: { apiKeyEnvar: 'AZURE_API_KEY' },
      },
    });
    expect(await provider.callApi('hello')).toMatchObject({ output: 'hello' });
    expectRequest(
      'https://process.example.test/serving-endpoints/chat/completions',
      'custom-process-token',
    );
  });

  it('uses suite credentials when the process token is absent and preserves API errors', async () => {
    vi.stubEnv('DATABRICKS_TOKEN', '');
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: { error: { message: 'Fixture rate limit', type: 'rate_limit' } },
      cached: false,
      status: 429,
      statusText: 'Too Many Requests',
    });
    const provider = await loadApiProvider('databricks:external-endpoint', {
      env: {
        DATABRICKS_TOKEN: 'fixture-suite',
      },
      options: {
        id: 'customer-chat',
        config: { isPayPerToken: true, workspaceUrl: 'https://configured.example.test' },
      },
    });
    expect(provider.id()).toBe('customer-chat');
    expect(await provider.callApi('hello')).toHaveProperty(
      'error',
      expect.stringContaining('Fixture rate limit'),
    );
    expect(vi.mocked(fetchWithCache).mock.calls[0][1]?.headers).toMatchObject({
      Authorization: 'Bearer fixture-suite',
    });
  });
});
