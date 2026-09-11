import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { loadApiProvider } from '../../../src/providers';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';
import { OpenAiResponsesProvider } from '../../../src/providers/openai/responses';
import { mockProcessEnv } from '../../util/utils';

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
}));

describe.each([
  { api: 'Chat', Provider: OpenAiChatCompletionProvider, tokenLimit: 'max_completion_tokens' },
  { api: 'Responses', Provider: OpenAiResponsesProvider, tokenLimit: 'max_output_tokens' },
])('Daybreak $api requests', ({ Provider, tokenLimit }) => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = mockProcessEnv({
      OPENAI_MAX_TOKENS: undefined,
      OPENAI_MAX_COMPLETION_TOKENS: undefined,
      OPENAI_TEMPERATURE: undefined,
      OPENAI_TOP_P: undefined,
    });
  });

  afterEach(() => {
    restoreEnv();
  });

  it.each([
    'gpt-daybreak-blue-latest',
    'gpt-daybreak-red-latest',
    'openai/gpt-daybreak-blue-latest',
    'openai/gpt-daybreak-red-latest',
  ])('preserves reasoning effort and omits incompatible defaults for %s', async (model) => {
    const { body } = await new Provider(model, {
      config: { reasoning_effort: 'high' },
    }).getOpenAiBody('Hello');

    expect(body.model).toBe(model);
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('max_tokens');
    expect(body).not.toHaveProperty('max_completion_tokens');
    expect(body).not.toHaveProperty('max_output_tokens');
    if (Provider === OpenAiChatCompletionProvider) {
      expect(body.reasoning_effort).toBe('high');
    } else {
      expect(body.reasoning).toEqual({ effort: 'high' });
    }
  });

  it.each(['gpt-daybreak-blue-latest', 'gpt-daybreak-red-latest'])(
    'respects explicit reasoning token limits and omits temperature for %s',
    async (model) => {
      const { body } = await new Provider(model, {
        config: { [tokenLimit]: 8192, max_tokens: 100, temperature: 0.7 },
      }).getOpenAiBody('Hello');

      expect(body[tokenLimit]).toBe(8192);
      expect(body).not.toHaveProperty('max_tokens');
      expect(body).not.toHaveProperty('temperature');
    },
  );

  it.each(['gpt-4.1', 'gpt-daybreak-red-latest-custom', 'custom-gpt-daybreak-blue-latest'])(
    'keeps standard-model defaults for %s',
    async (model) => {
      const { body } = await new Provider(model, {
        config: { reasoning_effort: 'high' },
      }).getOpenAiBody('Hello');

      expect(body.temperature).toBe(0);
      expect(
        body[Provider === OpenAiChatCompletionProvider ? 'max_tokens' : 'max_output_tokens'],
      ).toBe(1024);
      expect(body).not.toHaveProperty('reasoning_effort');
      expect(body).not.toHaveProperty('reasoning');
    },
  );
});

describe('Daybreak provider boundary', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = mockProcessEnv({
      OPENAI_API_HOST: undefined,
      OPENAI_API_BASE_URL: undefined,
      OPENAI_BASE_URL: undefined,
      OPENAI_MAX_TOKENS: undefined,
      OPENAI_MAX_COMPLETION_TOKENS: undefined,
      OPENAI_TEMPERATURE: undefined,
    });
    vi.mocked(fetchWithCache).mockReset();
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: {
        id: 'daybreak-response',
        status: 'completed',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'fixture answer' }],
          },
        ],
        choices: [{ message: { role: 'assistant', content: 'fixture answer' } }],
        usage: {
          input_tokens: 2000,
          output_tokens: 1000,
          input_tokens_details: { cached_tokens: 500, cache_write_tokens: 250 },
        },
        service_tier: 'default',
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });
  });

  afterEach(() => {
    vi.mocked(fetchWithCache).mockReset();
    restoreEnv();
  });

  it.each([
    ['gpt-daybreak-blue-latest', (1250 * 4 + 500 * 0.4 + 250 * 5 + 1000 * 20) / 1e6],
    ['gpt-daybreak-red-latest', (1250 * 12.5 + 500 * 1.25 + 250 * 15.625 + 1000 * 75) / 1e6],
  ] as const)('loads native %s and sends its unchanged alias to Responses', async (model, cost) => {
    const provider = await loadApiProvider(`openai:${model}`, {
      options: {
        id: 'daybreak-fixture',
        config: { apiKey: 'test-key', reasoning_effort: 'high', background: false },
      },
    });
    const result = await provider.callApi('Hello');
    expect(provider).toBeInstanceOf(OpenAiResponsesProvider);
    expect(provider.id()).toBe('daybreak-fixture');
    expect(result.error).toBeUndefined();
    expect(result.output).toBe('fixture answer');
    expect(result.cost).toBeCloseTo(cost, 10);
    expect(fetchWithCache).toHaveBeenCalledTimes(1);
    const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses');
    const body = JSON.parse(String(request?.body));
    expect(body.model).toBe(model);
    expect(body.reasoning).toEqual({ effort: 'high' });
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('max_tokens');
  });

  it.each([false, true])(
    'bills the effective passthrough alias (per-prompt: %s)',
    async (perPrompt) => {
      const model = 'gpt-daybreak-red-latest';
      const provider = await loadApiProvider('openai:gpt-daybreak-blue-latest', {
        options: {
          config: {
            apiKey: 'test-key',
            background: false,
            ...(!perPrompt && { passthrough: { model } }),
          },
        },
      });
      const result = await provider.callApi(
        'Hello',
        perPrompt
          ? {
              vars: {},
              prompt: { raw: 'Hello', label: 'override', config: { passthrough: { model } } },
            }
          : undefined,
      );
      expect(result.error).toBeUndefined();
      expect(result.cost).toBeCloseTo(
        (1250 * 12.5 + 500 * 1.25 + 250 * 15.625 + 1000 * 75) / 1e6,
        10,
      );
      const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
      expect(url).toBe('https://api.openai.com/v1/responses');
      expect(JSON.parse(String(request?.body)).model).toBe(model);
    },
  );

  it.each([
    ['openai:gpt-daybreak-blue-latest', 'chat/completions'],
    ['openai:responses:gpt-daybreak-blue-latest', 'responses'],
    ['openai:chat:gpt-daybreak-blue-latest', 'chat/completions'],
  ])('preserves the gateway route for %s without inferring native prices', async (id, endpoint) => {
    const provider = await loadApiProvider(id, {
      options: {
        env: { OPENAI_API_BASE_URL: 'https://gateway.example/v1' },
        config: { apiKey: 'test-key', background: false },
      },
    });
    const result = await provider.callApi('Hello');
    expect(result.error).toBeUndefined();
    expect(result.output).toBe('fixture answer');
    expect(result.cost).toBeUndefined();
    const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
    expect(url).toBe(`https://gateway.example/v1/${endpoint}`);
    expect(JSON.parse(String(request?.body)).model).toBe('gpt-daybreak-blue-latest');
  });

  it('uses the resolved host precedence for native shorthand', async () => {
    const provider = await loadApiProvider('openai:gpt-daybreak-blue-latest', {
      options: {
        env: { OPENAI_API_BASE_URL: 'https://gateway.example/v1' },
        config: {
          apiKey: 'test-key',
          apiHost: 'api.openai.com',
          apiBaseUrl: 'https://other-gateway.example/v1',
          background: false,
        },
      },
    });
    expect(provider).toBeInstanceOf(OpenAiResponsesProvider);
    const result = await provider.callApi('Hello');
    expect(result.error).toBeUndefined();
    expect(vi.mocked(fetchWithCache).mock.calls[0][0]).toBe('https://api.openai.com/v1/responses');
  });
});
