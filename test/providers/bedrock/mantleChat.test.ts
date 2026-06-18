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

    it('builds the /openai/v1 mantle endpoint for frontier OpenAI and xAI chat models', () => {
      expect(getBedrockMantleChatBaseUrl('us-east-1', 'openai.gpt-5.5')).toBe(
        'https://bedrock-mantle.us-east-1.api.aws/openai/v1',
      );
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

    it('treats an unresolved {{env.*}} apiKey template as missing', () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: undefined });
      expect(() =>
        createBedrockMantleChatProvider('zai.glm-4.6', {
          config: { apiKey: '{{env.AWS_BEARER_TOKEN_BEDROCK}}' },
        }),
      ).toThrow(/AWS_BEARER_TOKEN_BEDROCK/);
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
        undefined,
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
          reasoning_effort: 'high',
          temperature: 0,
          presence_penalty: 0.5,
          frequency_penalty: 0.7,
          stop: ['\n'],
        },
      }) as BedrockMantleChatProvider;
      const { body } = await (provider as any).getOpenAiBody('hello');
      expect(provider.getApiUrl()).toBe('https://bedrock-mantle.us-west-2.api.aws/openai/v1');
      expect(body.model).toBe('xai.grok-4.3');
      expect(body.reasoning_effort).toBe('high');
      expect(body.temperature).toBe(0);
      expect(body.presence_penalty).toBeUndefined();
      expect(body.frequency_penalty).toBeUndefined();
      expect(body.stop).toBeUndefined();
    });

    it('uses GPT-5 capabilities for Bedrock-prefixed OpenAI chat models', async () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key' });
      const provider = createBedrockMantleChatProvider('openai.gpt-5.5', {
        config: { region: 'us-east-2', verbosity: 'low' },
      }) as BedrockMantleChatProvider;
      const { body } = await (provider as any).getOpenAiBody('hello');
      expect(provider.getApiUrl()).toBe('https://bedrock-mantle.us-east-2.api.aws/openai/v1');
      expect(body.model).toBe('openai.gpt-5.5');
      expect(body.verbosity).toBe('low');
      expect(body.temperature).toBeUndefined();
      expect(body.max_tokens).toBeUndefined();
    });
  });
});
