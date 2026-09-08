import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { loadApiProvider } from '../../src/providers';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(fetchWithCache).mockReset();
});
afterEach(() => {
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

  it('uses per-provider Databricks workspace env overrides', async () => {
    const provider = await loadApiProvider('databricks:customer-endpoint', {
      env: { DATABRICKS_WORKSPACE_URL: 'https://suite.example.test' },
      options: { env: { DATABRICKS_WORKSPACE_URL: 'https://provider.example.test' } },
    });
    expect((provider as unknown as { getApiUrl(): string }).getApiUrl()).toBe(
      'https://provider.example.test/serving-endpoints',
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
        DATABRICKS_WORKSPACE_URL: 'https://suite.example.test',
      },
      options: { id: 'customer-chat', config: { isPayPerToken: true } },
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
