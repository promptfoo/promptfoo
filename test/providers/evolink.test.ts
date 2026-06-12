import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearCache } from '../../src/cache';
import { createEvoLinkProvider, EvoLinkProvider } from '../../src/providers/evolink';
import { loadApiProvider } from '../../src/providers/index';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import * as fetchModule from '../../src/util/fetch/index';
import { mockProcessEnv } from '../util/utils';

const EVOLINK_API_BASE = 'https://direct.evolink.ai/v1';

vi.mock('../../src/util', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    maybeLoadFromExternalFile: vi.fn((x) => x),
    renderVarsInObject: vi.fn((x) => x),
  };
});

vi.mock('../../src/util/fetch/index');

describe('EvoLinkProvider', () => {
  const mockedFetchWithRetries = vi.mocked(fetchModule.fetchWithRetries);

  afterEach(async () => {
    await clearCache();
    vi.clearAllMocks();
  });

  it('initializes with EvoLink defaults', () => {
    const provider = new EvoLinkProvider('evolink/auto', {});

    expect(provider.modelName).toBe('evolink/auto');
    expect(provider.id()).toBe('evolink:evolink/auto');
    expect(provider.toString()).toBe('[EvoLink Provider evolink/auto]');
    expect(provider.config.apiBaseUrl).toBe(EVOLINK_API_BASE);
    expect(provider.config.apiKeyEnvar).toBe('EVOLINK_API_KEY');
  });

  it('serializes to JSON without exposing inline API keys', () => {
    const provider = new EvoLinkProvider('gpt-5.4', {
      config: {
        apiKey: 'secret-key',
        temperature: 0.2,
      },
    });

    expect(provider.toJSON()).toEqual({
      provider: 'evolink',
      model: 'gpt-5.4',
      config: {
        apiKey: undefined,
        temperature: 0.2,
        apiBaseUrl: EVOLINK_API_BASE,
        apiKeyEnvar: 'EVOLINK_API_KEY',
      },
    });
  });

  it('does not fall back to OpenAI API key or organization settings', async () => {
    const restoreEnv = mockProcessEnv({
      EVOLINK_API_KEY: undefined,
      OPENAI_API_KEY: 'openai-secret',
      OPENAI_ORGANIZATION: 'org-leak',
    });

    try {
      const provider = new EvoLinkProvider('gpt-5.4', {});

      expect(provider.getApiKey()).toBeUndefined();
      expect(provider.getOrganization()).toBeUndefined();
      await expect(provider.callApi('Test prompt')).rejects.toThrow(/EVOLINK_API_KEY/);
    } finally {
      restoreEnv();
    }
  });

  it('prefers provider env overrides over process API keys', () => {
    const restoreEnv = mockProcessEnv({ EVOLINK_API_KEY: 'global-test-key' });

    try {
      const provider = new EvoLinkProvider('gpt-5.4', {
        env: { EVOLINK_API_KEY: 'provider-test-key' },
      });

      expect(provider.getApiKey()).toBe('provider-test-key');
    } finally {
      restoreEnv();
    }
  });

  it('preserves custom apiBaseUrl and apiKeyEnvar overrides', () => {
    const restoreEnv = mockProcessEnv({ CUSTOM_EVOLINK_KEY: 'custom-test-key' });

    try {
      const provider = new EvoLinkProvider('gpt-5.4', {
        config: {
          apiBaseUrl: 'https://proxy.example.com/evolink/v1',
          apiKeyEnvar: 'CUSTOM_EVOLINK_KEY',
        },
      });

      expect(provider.config.apiBaseUrl).toBe('https://proxy.example.com/evolink/v1');
      expect(provider.config.apiKeyEnvar).toBe('CUSTOM_EVOLINK_KEY');
      expect(provider.getApiKey()).toBe('custom-test-key');
    } finally {
      restoreEnv();
    }
  });

  it('ignores OpenAI base URL env vars', () => {
    const restoreEnv = mockProcessEnv({
      OPENAI_API_BASE_URL: 'https://proxy.example.com/openai/v1',
      OPENAI_BASE_URL: 'https://proxy.example.com/openai-base/v1',
      OPENAI_API_HOST: 'proxy.example.com',
    });

    try {
      const provider = new EvoLinkProvider('gpt-5.4', {});
      expect(provider.getApiUrl()).toBe(EVOLINK_API_BASE);
    } finally {
      restoreEnv();
    }
  });

  it('calls the EvoLink chat completions endpoint', async () => {
    const restoreEnv = mockProcessEnv({ EVOLINK_API_KEY: 'evolink-test-key' });

    try {
      const provider = new EvoLinkProvider('gpt-5.4', {});
      mockedFetchWithRetries.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
            usage: { total_tokens: 4, prompt_tokens: 2, completion_tokens: 2 },
          }),
          {
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'Content-Type': 'application/json' }),
          },
        ),
      );

      await provider.callApi('Test prompt');

      const [url, init] = mockedFetchWithRetries.mock.calls[0] ?? [];
      expect(url).toBe(`${EVOLINK_API_BASE}/chat/completions`);
      expect((init as RequestInit | undefined)?.headers).toMatchObject({
        Authorization: 'Bearer evolink-test-key',
      });
      expect((init as RequestInit | undefined)?.headers).not.toHaveProperty('OpenAI-Organization');
    } finally {
      restoreEnv();
    }
  });

  it('creates providers from EvoLink provider paths', () => {
    expect(createEvoLinkProvider('evolink')).toBeInstanceOf(EvoLinkProvider);
    expect(createEvoLinkProvider('evolink').id()).toBe('evolink:evolink/auto');
    expect(createEvoLinkProvider('evolink:').id()).toBe('evolink:evolink/auto');
    expect(createEvoLinkProvider('evolink:gpt-5.4').id()).toBe('evolink:gpt-5.4');
    expect(createEvoLinkProvider('evolink:chat:gpt-5.4').id()).toBe('evolink:gpt-5.4');
    expect(createEvoLinkProvider('evolink:chat:org:model:name').id()).toBe(
      'evolink:org:model:name',
    );
  });

  it('loads through the provider registry', async () => {
    const provider = await loadApiProvider('evolink:gpt-5.4');

    expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(provider.id()).toBe('evolink:gpt-5.4');
    expect(provider.config.apiBaseUrl).toBe(EVOLINK_API_BASE);
    expect(provider.config.apiKeyEnvar).toBe('EVOLINK_API_KEY');
  });
});
