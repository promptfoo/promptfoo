import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { GroqProvider, GroqResponsesProvider } from '../../../src/providers/groq/index';
import { mockProcessEnv } from '../../util/utils';

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
}));

let restoreEnv: () => void;
beforeEach(() => {
  vi.mocked(fetchWithCache).mockReset();
  restoreEnv = mockProcessEnv({
    GROQ_API_KEY: 'groq-process-key',
    GROQ_PROXY_KEY: 'proxy-process-key',
    GROQ_SCOPED_KEY: undefined,
    GROQ_MISSING_KEY: undefined,
    OPENAI_API_KEY: 'unrelated-openai-key',
    OPENAI_API_BASE_URL: 'https://unrelated.invalid/v1',
    OPENAI_API_HOST: 'unrelated.invalid',
  });
});
afterEach(() => {
  restoreEnv();
  vi.resetAllMocks();
});

function reply(responses: boolean, status = 200) {
  const data =
    status === 200
      ? responses
        ? {
            id: 'fixture-response',
            output: [
              {
                type: 'message',
                role: 'assistant',
                content: [{ type: 'output_text', text: 'Hello' }],
              },
            ],
            usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 },
          }
        : {
            choices: [{ message: { content: 'Hello' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
          }
      : { error: { message: 'Fixture unavailable' } };
  vi.mocked(fetchWithCache).mockResolvedValue({
    data,
    cached: false,
    status,
    statusText: status === 200 ? 'OK' : 'Service Unavailable',
    headers: {},
  });
}

function request() {
  const [url, options] = vi.mocked(fetchWithCache).mock.calls[0];
  if (!options) {
    throw new Error('Expected a provider request');
  }
  return { url, headers: options.headers, body: JSON.parse(options.body as string) };
}

describe.each([
  { name: 'Chat', Provider: GroqProvider, responses: false, path: '/chat/completions' },
  { name: 'Responses', Provider: GroqResponsesProvider, responses: true, path: '/responses' },
])('Groq $name connection configuration', ({ Provider, responses, path }) => {
  it.each([undefined, 'explicit-key'])(
    'honors the custom endpoint and key variable with key %s',
    async (apiKey) => {
      reply(responses);
      const provider = new Provider('private/model:version', {
        id: 'custom-provider-id',
        config: {
          apiBaseUrl: 'http://127.0.0.1:9000/groq',
          apiKeyEnvar: 'GROQ_PROXY_KEY',
          apiKey,
        },
      });
      expect(await provider.callApi('Hello')).toMatchObject({
        output: 'Hello',
        tokenUsage: { prompt: 5, completion: 2, total: 7 },
      });
      expect(provider.id()).toBe('custom-provider-id');
      expect(request()).toMatchObject({
        url: `http://127.0.0.1:9000/groq${path}`,
        headers: { Authorization: `Bearer ${apiKey ?? 'proxy-process-key'}` },
        body: { model: 'private/model:version' },
      });
      expect(request().body).not.toHaveProperty('apiBaseUrl');
      expect(request().body).not.toHaveProperty('apiKeyEnvar');
    },
  );

  it('resolves a configured key variable from provider-scoped environment', async () => {
    reply(responses);
    await new Provider('private/model', {
      config: { apiKeyEnvar: 'GROQ_SCOPED_KEY' },
      env: { GROQ_SCOPED_KEY: 'scoped-key' },
    }).callApi('Hello');
    expect(request().headers).toHaveProperty('Authorization', 'Bearer scoped-key');
  });

  it('preserves process precedence for the selected key variable', async () => {
    reply(responses);
    await new Provider('private/model', {
      config: { apiKeyEnvar: 'GROQ_PROXY_KEY' },
      env: { GROQ_PROXY_KEY: 'scoped-key', OPENAI_API_KEY: 'unrelated-scoped-openai-key' },
    }).callApi('Hello');
    expect(request().headers).toHaveProperty('Authorization', 'Bearer proxy-process-key');
  });

  it('uses an explicit key when the selected environment variable is absent', async () => {
    reply(responses);
    await new Provider('private/model', {
      config: {
        apiBaseUrl: 'http://127.0.0.1:9000/groq',
        apiKeyEnvar: 'GROQ_MISSING_KEY',
        apiKey: 'explicit-key',
      },
      env: { OPENAI_API_KEY: 'unrelated-scoped-openai-key' },
    }).callApi('Hello');
    expect(request()).toMatchObject({
      url: `http://127.0.0.1:9000/groq${path}`,
      headers: { Authorization: 'Bearer explicit-key' },
    });
  });

  it('keeps Groq defaults when settings are absent', async () => {
    reply(responses);
    await new Provider('private/model', { config: {} }).callApi('Hello');
    expect(request()).toMatchObject({
      url: `https://api.groq.com/openai/v1${path}`,
      headers: { Authorization: 'Bearer groq-process-key' },
    });
  });

  it('keeps explicit apiHost precedence', async () => {
    reply(responses);
    await new Provider('private/model', {
      config: { apiHost: 'proxy.invalid', apiBaseUrl: 'https://secondary.invalid/v1' },
    }).callApi('Hello');
    expect(request().url).toBe(`https://proxy.invalid/v1${path}`);
  });

  it.each([undefined, 'GROQ_MISSING_KEY'])(
    'rejects missing key %s without sending unrelated OpenAI credentials',
    async (apiKeyEnvar) => {
      const restoreGroqKey = mockProcessEnv({
        GROQ_API_KEY: apiKeyEnvar ? 'unselected-groq-key' : undefined,
      });
      try {
        const provider = new Provider('private/model', {
          config: { apiBaseUrl: 'http://127.0.0.1:9000/groq', apiKeyEnvar },
          env: { OPENAI_API_KEY: 'unrelated-scoped-openai-key' },
        });
        expect(provider.getApiKey()).toBeUndefined();
        await expect(provider.callApi('Hello')).rejects.toThrow(
          `Set the ${apiKeyEnvar ?? 'GROQ_API_KEY'} environment variable`,
        );
        expect(fetchWithCache).not.toHaveBeenCalled();
      } finally {
        restoreGroqKey();
      }
    },
  );
});
