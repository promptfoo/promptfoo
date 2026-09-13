import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import {
  BedrockMantleChatProvider,
  createBedrockMantleChatProvider,
  getBedrockMantleChatBaseUrl,
} from '../../../src/providers/bedrock/mantleChat';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';
import { HttpRateLimitError } from '../../../src/util/fetch/errors';
import { mockProcessEnv } from '../../util/utils';

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));

describe('bedrock mantle Chat Completions provider', () => {
  let restoreEnv: (() => void) | undefined;

  beforeEach(() => {
    vi.mocked(fetchWithCache).mockReset();
  });

  afterEach(() => {
    restoreEnv?.();
    restoreEnv = undefined;
    vi.resetAllMocks();
  });

  describe('getBedrockMantleChatBaseUrl', () => {
    it('builds the bare /v1 mantle endpoint for ordinary mantle chat models', () => {
      expect(getBedrockMantleChatBaseUrl('us-east-1')).toBe(
        'https://bedrock-mantle.us-east-1.api.aws/v1',
      );
      expect(getBedrockMantleChatBaseUrl('us-west-2')).toBe(
        'https://bedrock-mantle.us-west-2.api.aws/v1',
      );
    });

    it('builds the /openai/v1 mantle endpoint for xAI chat models', () => {
      expect(getBedrockMantleChatBaseUrl('us-west-2', 'xai.grok-4.3')).toBe(
        'https://bedrock-mantle.us-west-2.api.aws/openai/v1',
      );
    });

    it('keeps open-weight gpt-oss chat models on the bare /v1 mantle endpoint', () => {
      expect(getBedrockMantleChatBaseUrl('us-east-1', 'openai.gpt-oss-20b-1:0')).toBe(
        'https://bedrock-mantle.us-east-1.api.aws/v1',
      );
    });

    it('routes Gemma 4 chat models through the /openai/v1 mantle endpoint', () => {
      expect(getBedrockMantleChatBaseUrl('us-east-1', 'google.gemma-4-31b')).toBe(
        'https://bedrock-mantle.us-east-1.api.aws/openai/v1',
      );
    });

    it('rejects a malformed region', () => {
      expect(() => getBedrockMantleChatBaseUrl('evil.com/x')).toThrow(/Invalid AWS region/);
    });
  });

  describe('createBedrockMantleChatProvider', () => {
    it('throws a helpful error when no Bedrock API key is configured', () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: undefined });
      expect(() => createBedrockMantleChatProvider('zai.glm-4.6', {})).toThrow(
        /AWS_BEARER_TOKEN_BEDROCK/,
      );
    });

    it('targets the mantle /v1 endpoint for the configured region with config.apiKey', () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: undefined });
      const provider = createBedrockMantleChatProvider('deepseek.v3.1', {
        config: { region: 'us-west-2', apiKey: 'bedrock-key' },
      });
      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect((provider.config as any).apiBaseUrl).toBe(
        'https://bedrock-mantle.us-west-2.api.aws/v1',
      );
      expect((provider.config as any).apiKey).toBe('bedrock-key');
    });

    it('falls back to AWS_BEARER_TOKEN_BEDROCK and the default region', () => {
      restoreEnv = mockProcessEnv({
        AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key',
        AWS_BEDROCK_REGION: undefined,
        AWS_REGION: undefined,
        AWS_DEFAULT_REGION: undefined,
      });
      const provider = createBedrockMantleChatProvider('google.gemma-4-31b', {});
      expect((provider.config as any).apiBaseUrl).toBe(
        'https://bedrock-mantle.us-east-1.api.aws/openai/v1',
      );
      expect((provider.config as any).apiKey).toBe('env-bedrock-key');
    });

    it('defaults Grok mantle chat to its launch region', () => {
      restoreEnv = mockProcessEnv({
        AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key',
        AWS_BEDROCK_REGION: undefined,
        AWS_REGION: undefined,
        AWS_DEFAULT_REGION: undefined,
      });
      const provider = createBedrockMantleChatProvider('xai.grok-4.3', {});
      expect((provider.config as any).apiBaseUrl).toBe(
        'https://bedrock-mantle.us-west-2.api.aws/openai/v1',
      );
    });

    it('omits the inherited temperature default when Grok temperature is not configured', async () => {
      restoreEnv = mockProcessEnv({
        AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key',
        OPENAI_TEMPERATURE: undefined,
      });
      const provider = createBedrockMantleChatProvider('xai.grok-4.3', {
        config: { omitDefaults: false },
      });

      const { body } = await (provider as any).getOpenAiBody('hello');

      expect((provider.config as any).omitDefaults).toBe(true);
      expect(body.temperature).toBeUndefined();
    });

    it.each(['none', 'provider', 'prompt'] as const)(
      'preserves the Grok completion cap and temperature with a %s model override',
      async (scope) => {
        restoreEnv = mockProcessEnv({
          OPENAI_MAX_TOKENS: undefined,
          OPENAI_MAX_COMPLETION_TOKENS: undefined,
          OPENAI_TEMPERATURE: undefined,
        });
        vi.mocked(fetchWithCache).mockResolvedValue({
          data: {
            choices: [{ message: { content: 'Grok output' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 4, completion_tokens: 6, total_tokens: 10 },
          },
          cached: false,
          status: 200,
          statusText: 'OK',
        });
        const passthrough = { model: 'xai.grok-4.3' };
        const provider = createBedrockMantleChatProvider('xai.grok-4.3', {
          config: {
            apiKey: 'bedrock-key',
            region: 'us-west-2',
            max_completion_tokens: 2000,
            temperature: 0.4,
            ...(scope === 'provider' ? { passthrough } : {}),
          },
        });
        const context =
          scope === 'prompt'
            ? { vars: {}, prompt: { raw: 'hello', label: 'test', config: { passthrough } } }
            : undefined;

        const result = await provider.callApi('hello', context);
        const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
        const body = JSON.parse(request?.body as string);

        expect(url).toBe('https://bedrock-mantle.us-west-2.api.aws/openai/v1/chat/completions');
        expect(provider.config.omitDefaults).toBe(true);
        expect(body).toMatchObject({
          model: 'xai.grok-4.3',
          max_completion_tokens: 2000,
          temperature: 0.4,
        });
        expect(body).not.toHaveProperty('max_tokens');
        expect(result.output).toBe('Grok output');
        expect(result.error).toBeUndefined();
      },
    );

    it('uses an incompatible override model instead of the configured Grok capabilities', async () => {
      const provider = createBedrockMantleChatProvider('xai.grok-4.3', {
        config: {
          apiKey: 'bedrock-key',
          apiBaseUrl: 'https://proxy.example/v1',
          max_completion_tokens: 2000,
          max_tokens: 1000,
          reasoning_effort: 'high',
          temperature: 0.4,
          passthrough: { model: 'gpt-4.1' },
        },
      });

      const { body } = await provider.getOpenAiBody('hello');

      expect(body).toMatchObject({ model: 'gpt-4.1', max_tokens: 1000, temperature: 0.4 });
      expect(body).not.toHaveProperty('max_completion_tokens');
      expect(body).not.toHaveProperty('reasoning_effort');
    });

    it('treats an unresolved {{env.*}} apiKey template as missing', () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: undefined });
      expect(() =>
        createBedrockMantleChatProvider('zai.glm-4.6', {
          config: { apiKey: '{{env.AWS_BEARER_TOKEN_BEDROCK}}' },
        }),
      ).toThrow(/AWS_BEARER_TOKEN_BEDROCK/);
    });

    it('rejects frontier OpenAI models on the mantle chat route', () => {
      expect(() =>
        createBedrockMantleChatProvider('openai.gpt-5.5', {
          config: { apiKey: 'bedrock-key' },
        }),
      ).toThrow(/Use the bare "bedrock:openai\.gpt-5\.5" id/);
    });

    it.each(['sol', 'terra', 'luna'])(
      'uses the documented GPT-5.6 %s Chat endpoint and request contract',
      async (tier) => {
        const model = `openai.gpt-5.6-${tier}`;
        const provider = createBedrockMantleChatProvider(model, {
          config: {
            apiKey: 'bedrock-key',
            region: 'us-east-1',
            reasoning_effort: 'high',
            max_completion_tokens: 100,
          },
        });
        const { body } = await provider.getOpenAiBody('hello');

        expect(provider.getApiUrl()).toBe('https://bedrock-mantle.us-east-1.api.aws/openai/v1');
        expect(body.model).toBe(model);
        expect(body.reasoning_effort).toBe('high');
        expect(body.max_completion_tokens).toBe(100);
        expect(body).not.toHaveProperty('max_tokens');
        expect(body).not.toHaveProperty('temperature');
      },
    );

    it.each([
      undefined,
      'https://bedrock-mantle.us-west-2.api.aws/openai/v1',
      'https://BEDROCK-MANTLE.us-east-1.api.aws./openai/v1',
      'https://bedrock-mantle.cn-north-1.api.aws/openai/v1',
      'https://bedrock-mantle.cn-north-1.amazonaws.com.cn/openai/v1',
    ])('rejects a Runtime profile on the Mantle Chat endpoint %s', (apiBaseUrl) => {
      expect(() =>
        createBedrockMantleChatProvider('us.openai.gpt-5.6-sol', {
          config: { apiKey: 'bedrock-key', apiBaseUrl },
        }),
      ).toThrow('bedrock:converse:us.openai.gpt-5.6-sol');
    });

    it.each([
      {
        model: 'us.openai.gpt-5.6-sol',
        apiBaseUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1',
      },
      {
        model: 'global.openai.gpt-5.6-sol',
        apiBaseUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1',
      },
      {
        model: 'us.openai.gpt-5.6-sol',
        apiBaseUrl: 'https://proxy.example/bedrock-mantle/openai/v1',
      },
      {
        model: 'us.openai.gpt-5.6-sol',
        apiBaseUrl: 'http://localhost:1234/v1',
      },
    ])('preserves $model and explicit endpoint $apiBaseUrl', async ({ model, apiBaseUrl }) => {
      restoreEnv = mockProcessEnv({
        AWS_BEARER_TOKEN_BEDROCK: 'ambient-bedrock-key',
        OPENAI_API_HOST: 'unrelated.example.com',
        OPENAI_ORGANIZATION: 'unrelated-organization',
        OPENAI_MAX_TOKENS: undefined,
        OPENAI_MAX_COMPLETION_TOKENS: undefined,
        OPENAI_TEMPERATURE: undefined,
        OPENAI_TOP_P: undefined,
        OPENAI_PRESENCE_PENALTY: undefined,
        OPENAI_FREQUENCY_PENALTY: undefined,
      });
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: { choices: [{ message: { content: 'Profile output' }, finish_reason: 'stop' }] },
        cached: false,
        status: 200,
        statusText: 'OK',
      });
      const provider = createBedrockMantleChatProvider(model, {
        config: {
          apiBaseUrl,
          apiKey: 'explicit-bedrock-key',
          omitDefaults: true,
          headers: { 'X-Proxy-Route': 'explicit-route' },
        },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('Profile output');
      const [requestUrl, request] = vi.mocked(fetchWithCache).mock.calls[0];
      expect(requestUrl).toBe(`${apiBaseUrl}/chat/completions`);
      expect(JSON.parse(request?.body as string)).toEqual({
        model,
        messages: [{ role: 'user', content: 'hello' }],
      });
      const headers = new Headers(request?.headers);
      expect(headers.get('authorization')).toBe('Bearer explicit-bedrock-key');
      expect(headers.get('x-proxy-route')).toBe('explicit-route');
      expect(headers.get('openai-organization')).toBeNull();
    });

    it('preserves a custom endpoint for GPT-5.6 Chat', () => {
      const provider = createBedrockMantleChatProvider('openai.gpt-5.6-sol', {
        config: { apiKey: 'local-key', apiBaseUrl: 'http://localhost:1234/v1' },
      });
      expect(provider.getApiUrl()).toBe('http://localhost:1234/v1');
    });

    it('keeps OpenAI account defaults out of Bedrock headers and preserves explicit headers', () => {
      restoreEnv = mockProcessEnv({ OPENAI_ORGANIZATION: 'unrelated-openai-organization' });
      const provider = createBedrockMantleChatProvider('openai.gpt-5.6-sol', {
        config: { apiKey: 'bedrock-key' },
      });
      expect(provider.getOpenAiRequestHeaders()).toEqual({});
      expect(provider.getOpenAiRequestHeaders({ 'X-Proxy-Route': 'test' })).toEqual({
        'X-Proxy-Route': 'test',
      });
    });

    it('returns GPT-5.6 Chat output and token usage', async () => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: {
          choices: [{ message: { content: 'Sol output' }, finish_reason: 'stop' }],
          usage: {
            total_tokens: 10,
            prompt_tokens: 4,
            completion_tokens: 6,
            prompt_tokens_details: { cache_write_tokens: 0 },
            completion_tokens_details: { reasoning_tokens: 2 },
          },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });
      const provider = createBedrockMantleChatProvider('openai.gpt-5.6-sol', {
        config: { apiKey: 'bedrock-key', region: 'us-east-1' },
      });
      const result = await provider.callApi('hello');

      expect(fetchWithCache).toHaveBeenCalledWith(
        'https://bedrock-mantle.us-east-1.api.aws/openai/v1/chat/completions',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer bedrock-key' }),
        }),
        expect.any(Number),
        'json',
        true,
        undefined,
      );
      expect(result.output).toBe('Sol output');
      expect(result.tokenUsage).toMatchObject({ total: 10, prompt: 4, completion: 6 });
      expect(result.cost).toBeCloseTo((4 * 4.4 + 6 * 22) / 1_000_000, 10);
      expect(result.error).toBeUndefined();
    });

    it.each(['provider', 'prompt'] as const)(
      'keeps AWS billing identity for a %s passthrough override through a proxy',
      async (scope) => {
        vi.mocked(fetchWithCache).mockResolvedValue({
          data: {
            choices: [{ message: { content: 'Terra output' }, finish_reason: 'stop' }],
            usage: {
              prompt_tokens: 1000,
              completion_tokens: 500,
              total_tokens: 1500,
              prompt_tokens_details: { cached_tokens: 200, cache_write_tokens: 100 },
            },
          },
          cached: false,
          status: 200,
          statusText: 'OK',
        });
        const passthrough = { model: 'openai.gpt-5.6-terra' };
        const provider = createBedrockMantleChatProvider('openai.gpt-5.6-sol', {
          config: {
            apiKey: 'bedrock-key',
            apiBaseUrl: 'http://localhost:1234/v1',
            reasoning_effort: 'high',
            max_completion_tokens: 4096,
            ...(scope === 'provider' ? { passthrough } : {}),
          },
        });
        const context =
          scope === 'prompt'
            ? { vars: {}, prompt: { raw: 'hello', label: 'test', config: { passthrough } } }
            : undefined;
        const result = await provider.callApi('hello', context);
        const [, request] = vi.mocked(fetchWithCache).mock.calls.at(-1)!;
        const body = JSON.parse(request?.body as string);
        expect(body).toMatchObject({
          model: 'openai.gpt-5.6-terra',
          reasoning_effort: 'high',
          max_completion_tokens: 4096,
        });
        expect(body).not.toHaveProperty('max_tokens');
        expect(body).not.toHaveProperty('temperature');
        expect(result.cost).toBeCloseTo(
          (700 * 2.2 + 200 * 0.22 + 100 * 2.75 + 500 * 13.2) / 1e6,
          12,
        );
      },
    );

    it('surfaces a GPT-5.6 Chat API error', async () => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: { error: { message: 'model access denied' } },
        cached: false,
        status: 403,
        statusText: 'Forbidden',
      });
      const provider = createBedrockMantleChatProvider('openai.gpt-5.6-sol', {
        config: { apiKey: 'bedrock-key' },
      });
      expect((await provider.callApi('hello')).error).toContain('403 Forbidden');
    });

    it('pins the mantle endpoint even when OPENAI_API_HOST is set', () => {
      restoreEnv = mockProcessEnv({
        AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key',
        OPENAI_API_HOST: 'unrelated.example.com',
      });
      const provider = createBedrockMantleChatProvider('zai.glm-4.6', {
        config: { region: 'us-west-2' },
      });
      // Base getApiUrl() would prefer OPENAI_API_HOST; the subclass must override that so the
      // Bedrock bearer token is never sent to the wrong host.
      expect(provider.getApiUrl()).toBe('https://bedrock-mantle.us-west-2.api.aws/v1');
    });

    it('identifies the actual Bedrock provider in telemetry', () => {
      const provider = createBedrockMantleChatProvider('deepseek.v3.1', {
        config: { apiKey: 'bedrock-key' },
      });

      expect((provider as any).getGenAISystem()).toBe('bedrock');
    });

    it('sends the real model id and posts to <base>/chat/completions', async () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key' });
      const provider = createBedrockMantleChatProvider('deepseek.v3.1', {
        config: { region: 'us-west-2' },
      }) as BedrockMantleChatProvider;
      const { body } = await (provider as any).getOpenAiBody('hello');
      expect(body.model).toBe('deepseek.v3.1');
      expect(`${provider.getApiUrl()}/chat/completions`).toBe(
        'https://bedrock-mantle.us-west-2.api.aws/v1/chat/completions',
      );
    });

    it('forwards configured reasoning effort for Gemma 4 chat models', async () => {
      const provider = createBedrockMantleChatProvider('google.gemma-4-31b', {
        config: { apiKey: 'bedrock-key', reasoning_effort: 'high' },
      });

      const { body } = await (provider as any).getOpenAiBody('hello');

      expect(body.reasoning_effort).toBe('high');
    });

    it('calls the mantle chat endpoint and tracks token usage', async () => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: {
          choices: [{ message: { content: 'Mantle output' }, finish_reason: 'stop' }],
          usage: { total_tokens: 7, prompt_tokens: 4, completion_tokens: 3 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });
      const provider = createBedrockMantleChatProvider('deepseek.v3.1', {
        config: { region: 'us-west-2', apiKey: 'bedrock-key' },
      });

      const result = await provider.callApi(JSON.stringify([{ role: 'user', content: 'hello' }]));

      expect(fetchWithCache).toHaveBeenCalledWith(
        'https://bedrock-mantle.us-west-2.api.aws/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer bedrock-key' }),
        }),
        expect.any(Number),
        'json',
        true,
        undefined,
      );
      expect(result.output).toBe('Mantle output');
      expect(result.tokenUsage).toEqual({ total: 7, prompt: 4, completion: 3, numRequests: 1 });
    });

    it('returns HTTP errors from the mantle chat endpoint', async () => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: { error: { message: 'server exploded' } },
        cached: false,
        status: 500,
        statusText: 'Internal Server Error',
      });
      const provider = createBedrockMantleChatProvider('deepseek.v3.1', {
        config: { apiKey: 'bedrock-key' },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toContain('API error: 500 Internal Server Error');
    });

    it('preserves structured rate limit errors from the mantle chat endpoint', async () => {
      vi.mocked(fetchWithCache).mockRejectedValue(
        new HttpRateLimitError({ status: 429, code: 'rate_limit_exceeded' }),
      );
      const provider = createBedrockMantleChatProvider('deepseek.v3.1', {
        config: { apiKey: 'bedrock-key' },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toContain('Rate limit exceeded: HTTP 429 Too Many Requests');
    });

    it('surfaces mantle chat request timeout failures', async () => {
      vi.mocked(fetchWithCache).mockRejectedValue(new Error('Request timed out'));
      const provider = createBedrockMantleChatProvider('deepseek.v3.1', {
        config: { apiKey: 'bedrock-key' },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toContain('API call error: Error: Request timed out');
    });

    it('uses the OpenAI-compatible chat endpoint and capabilities for Grok', async () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key' });
      const provider = createBedrockMantleChatProvider('xai.grok-4.3', {
        config: {
          region: 'us-west-2',
          omitDefaults: false,
          reasoning_effort: 'high',
          temperature: 0,
          presence_penalty: 0.5,
          frequency_penalty: 0.7,
          stop: ['\n'],
        },
      }) as BedrockMantleChatProvider;
      const { body } = await (provider as any).getOpenAiBody('hello');
      expect((provider.config as any).omitDefaults).toBe(true);
      expect(provider.getApiUrl()).toBe('https://bedrock-mantle.us-west-2.api.aws/openai/v1');
      expect(body.model).toBe('xai.grok-4.3');
      expect(body.reasoning_effort).toBe('high');
      expect(body.temperature).toBe(0);
      expect(body.presence_penalty).toBeUndefined();
      expect(body.frequency_penalty).toBeUndefined();
      expect(body.stop).toBeUndefined();
    });
  });
});
