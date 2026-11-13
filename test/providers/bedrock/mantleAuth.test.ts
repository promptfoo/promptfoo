import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import {
  BedrockAnthropicMessagesProvider,
  createBedrockAnthropicMessagesProvider,
} from '../../../src/providers/bedrock/anthropicMessages';
import {
  BedrockMantleChatProvider,
  createBedrockMantleChatProvider,
} from '../../../src/providers/bedrock/mantleChat';
import {
  BedrockGptOssResponsesProvider,
  createBedrockOpenAiResponsesProvider,
} from '../../../src/providers/bedrock/openaiResponses';
import { mockProcessEnv } from '../../util/utils';

import type { FetchOptions } from '../../../src/util/fetch/types';

async function resolveHeaders(init?: FetchOptions): Promise<Headers> {
  const headers = new Headers(await init?.getAuthHeaders?.(init.signal ?? undefined));
  new Headers(init?.headers).forEach((value, name) => headers.set(name, value));
  return headers;
}

const { generateToken, getTokenProvider } = vi.hoisted(() => ({
  generateToken: vi.fn<() => Promise<string>>(),
  getTokenProvider: vi.fn(),
}));
vi.mock('@aws/bedrock-token-generator', () => ({ getTokenProvider }));
vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));

const message = {
  id: 'msg-test',
  type: 'message',
  role: 'assistant',
  model: 'anthropic.claude-fable-5',
  content: [{ type: 'text', text: 'Paris' }],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: { input_tokens: 2, output_tokens: 1 },
};
const completed = {
  id: 'resp-test',
  status: 'completed',
  output: [
    { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Paris' }] },
  ],
  usage: { input_tokens: 2, output_tokens: 1 },
};
const factories = {
  responses: (config: Record<string, any>) =>
    createBedrockOpenAiResponsesProvider('openai.gpt-5.5', { config }),
  chat: (config: Record<string, any>) => createBedrockMantleChatProvider('zai.glm-4.6', { config }),
  messages: (config: Record<string, any>) =>
    createBedrockAnthropicMessagesProvider('anthropic.claude-fable-5', {
      config: { stream: false, ...config },
    }),
};

describe('Bedrock Mantle request authentication', () => {
  let restoreEnv: () => void;
  let sentHeaders: Headers[];
  beforeEach(() => {
    restoreEnv = mockProcessEnv({
      AWS_BEARER_TOKEN_BEDROCK: undefined,
      AWS_PROFILE: undefined,
      AWS_ACCESS_KEY_ID: undefined,
      AWS_SECRET_ACCESS_KEY: undefined,
      AWS_SESSION_TOKEN: undefined,
      AWS_REGION: undefined,
      AWS_BEDROCK_REGION: undefined,
      AWS_DEFAULT_REGION: undefined,
      OPENAI_API_KEY: 'unrelated-openai-key',
      OPENAI_API_HOST: 'unrelated.example',
      OPENAI_BASE_URL: 'https://unrelated.example/v1',
      ANTHROPIC_BASE_URL: 'https://unrelated.example/anthropic',
      ANTHROPIC_API_KEY: 'unrelated-anthropic-key',
      ANTHROPIC_AUTH_TOKEN: 'unrelated-anthropic-token',
      ANTHROPIC_CUSTOM_HEADERS:
        'X-Api-Key: unrelated-key\nAuthorization: Bearer unrelated-token\nX-Proxy-Secret: unrelated-proxy',
    });
    sentHeaders = [];
    generateToken.mockReset().mockResolvedValue('generated-token');
    getTokenProvider.mockReset().mockReturnValue(generateToken);
    vi.mocked(fetchWithCache)
      .mockReset()
      .mockImplementation(async (_url, init) => {
        sentHeaders.push(await resolveHeaders(init));
        return {
          data: {
            ...completed,
            choices: [{ message: { content: 'Paris' }, finish_reason: 'stop' }],
          },
          status: 200,
          statusText: 'OK',
          cached: false,
        };
      });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input, init) => {
        sentHeaders.push(new Headers(init?.headers));
        return Response.json(message);
      }),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    restoreEnv();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  describe.each([
    { profile: 'bedrock-profile' },
    {
      accessKeyId: 'selected-key',
      secretAccessKey: 'selected-secret',
      sessionToken: 'selected-session',
    },
  ])('with explicit AWS configuration %j', (credentials) => {
    beforeEach(() => {
      const restoreBase = restoreEnv;
      const restoreToken = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: 'ambient-token' });
      restoreEnv = () => {
        restoreToken();
        restoreBase();
      };
    });
    it.each(Object.keys(factories) as Array<keyof typeof factories>)(
      '%s resolves fresh credentials on successive calls',
      async (route) => {
        generateToken.mockResolvedValueOnce('first-token').mockResolvedValueOnce('second-token');
        const provider = factories[route]({ ...credentials, region: 'us-east-1' });
        expect(provider.requiresApiKey()).toBe(false);
        expect(provider.getApiKey()).toBeUndefined();
        const first = await provider.callApi('Capital of France?');
        const second = await provider.callApi('Capital of France?');
        expect(first.output).toBe('Paris');
        expect(second.output).toBe('Paris');
        const header = route === 'messages' ? 'x-api-key' : 'authorization';
        const prefix = route === 'messages' ? '' : 'Bearer ';
        expect(sentHeaders.map((headers) => headers.get(header))).toEqual([
          `${prefix}first-token`,
          `${prefix}second-token`,
        ]);
        expect(sentHeaders.every((headers) => !headers.has('x-proxy-secret'))).toBe(true);
        expect(getTokenProvider).toHaveBeenCalledExactlyOnceWith({
          ...('profile' in credentials ? credentials : { credentials }),
          region: 'us-east-1',
        });
        expect(provider.config.apiKey).toBeUndefined();
      },
    );
  });

  it.each(Object.keys(factories) as Array<keyof typeof factories>)(
    '%s keeps explicit bearer tokens unchanged',
    async (route) => {
      const provider = factories[route]({ apiKey: 'explicit-token', region: 'us-east-1' });
      expect((await provider.callApi('Capital of France?')).output).toBe('Paris');
      expect(generateToken).not.toHaveBeenCalled();
      expect(sentHeaders[0].get(route === 'messages' ? 'x-api-key' : 'authorization')).toBe(
        route === 'messages' ? 'explicit-token' : 'Bearer explicit-token',
      );
    },
  );

  it.each(Object.keys(factories) as Array<keyof typeof factories>)(
    '%s supports a no-auth custom endpoint',
    async (route) => {
      const provider = factories[route]({
        apiBaseUrl: 'http://127.0.0.1:12345/v1',
        apiKeyRequired: false,
      });
      expect((await provider.callApi('Capital of France?')).output).toBe('Paris');
      expect(getTokenProvider).not.toHaveBeenCalled();
      expect(sentHeaders[0].has('authorization')).toBe(false);
      expect(sentHeaders[0].has('x-api-key')).toBe(false);
    },
  );

  it.each(['responses', 'chat'] as const)(
    '%s stops during credential discovery without dispatching HTTP',
    async (route) => {
      let resolveToken!: (value: string) => void;
      generateToken.mockReturnValueOnce(
        new Promise<string>((resolve) => {
          resolveToken = resolve;
        }),
      );
      const controller = new AbortController();
      const provider = factories[route]({ region: 'us-east-1' });
      const call = provider.callApi('hello', undefined, { abortSignal: controller.signal });
      const rejected = expect(call).rejects.toMatchObject({ name: 'AbortError' });
      controller.abort();
      await rejected;
      resolveToken('later-token');
      expect(sentHeaders).toHaveLength(0);
    },
  );

  it('refreshes Responses authentication for background polling and cancellation', async () => {
    generateToken
      .mockResolvedValueOnce('create-token')
      .mockResolvedValueOnce('poll-token')
      .mockResolvedValueOnce('cancel-token');
    vi.mocked(fetchWithCache).mockImplementation(async (_url, init) => {
      sentHeaders.push(await resolveHeaders(init));
      if (init?.method === 'GET') {
        return {
          data: { error: { message: 'denied' } },
          status: 403,
          statusText: 'Forbidden',
          cached: false,
        };
      }
      return {
        data: { ...completed, status: 'queued' },
        status: 200,
        statusText: 'OK',
        cached: false,
      };
    });
    const result = await factories.responses({ background: true }).callApi('hello');
    expect(result.error).toContain('403');
    expect(sentHeaders.map((headers) => headers.get('authorization'))).toEqual([
      'Bearer create-token',
      'Bearer poll-token',
      'Bearer cancel-token',
    ]);
  });

  it('refreshes the Messages token on an SDK retry', async () => {
    vi.useFakeTimers();
    generateToken.mockResolvedValueOnce('first-token').mockResolvedValueOnce('retry-token');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input, init) => {
        sentHeaders.push(new Headers(init?.headers));
        return sentHeaders.length === 1
          ? Response.json(
              { error: { type: 'overloaded_error', message: 'retry' } },
              { status: 529, headers: { 'retry-after-ms': '1' } },
            )
          : Response.json(message);
      }),
    );
    const provider = factories.messages({ region: 'us-east-1' });
    const pending = provider.callApi('hello');
    await vi.waitFor(() => expect(sentHeaders).toHaveLength(2));
    expect((await pending).output).toBe('Paris');
    expect(sentHeaders.map((headers) => headers.get('x-api-key'))).toEqual([
      'first-token',
      'retry-token',
    ]);
  });

  it.each(['openai.gpt-oss-120b-1:0', 'global.anthropic.claude-sonnet-5', 'us.xai.grok-4.6'])(
    'rejects an incompatible Responses model %s',
    (id) => {
      expect(() => createBedrockOpenAiResponsesProvider(id)).toThrow(
        /not a supported Mantle Responses model/,
      );
    },
  );

  it('reports Bedrock GPT OSS Responses usage cost', async () => {
    const result = await createBedrockOpenAiResponsesProvider('openai.gpt-oss-120b', {
      config: { region: 'us-east-1' },
    }).callApi('hello');
    expect(result.cost).toBeGreaterThan(0);
  });

  it('honors explicit GPT OSS token pricing', async () => {
    const provider = createBedrockOpenAiResponsesProvider('openai.gpt-oss-120b', {
      config: { inputCost: 0.01, outputCost: 0.02 },
    });
    expect((await provider.callApi('hello')).cost).toBe(0.04);
  });

  it('isolates directly constructed HTTP adapters from ambient vendor endpoints', async () => {
    const responses = new BedrockGptOssResponsesProvider('openai.gpt-oss-120b');
    const chat = new BedrockMantleChatProvider('zai.glm-4.6');
    const messages = new BedrockAnthropicMessagesProvider('anthropic.claude-fable-5', {
      config: { stream: false },
    });
    expect(responses.getApiUrl()).toBe('https://bedrock-mantle.us-east-1.api.aws/v1');
    expect(chat.getApiUrl()).toBe('https://bedrock-mantle.us-east-1.api.aws/v1');
    expect(messages.getApiBaseUrl()).toBe('https://bedrock-mantle.us-east-1.api.aws/anthropic');
    for (const provider of [responses, chat, messages]) {
      expect((await provider.callApi('hello')).output).toBe('Paris');
    }
    expect(vi.mocked(fetchWithCache).mock.calls.map(([url]) => url)).toEqual([
      'https://bedrock-mantle.us-east-1.api.aws/v1/responses',
      'https://bedrock-mantle.us-east-1.api.aws/v1/chat/completions',
    ]);
    expect(vi.mocked(globalThis.fetch).mock.calls[0][0]).toBe(
      'https://bedrock-mantle.us-east-1.api.aws/anthropic/v1/messages',
    );
    expect(getTokenProvider).toHaveBeenCalledTimes(3);
    for (const [options] of getTokenProvider.mock.calls) {
      expect(options.region).toBe('us-east-1');
    }
  });

  it.each(Object.keys(factories) as Array<keyof typeof factories>)(
    '%s preserves explicit proxy authorization on a custom endpoint',
    async (route) => {
      const provider = factories[route]({
        apiBaseUrl: 'http://127.0.0.1:12345/v1',
        apiKeyRequired: false,
        headers: { Authorization: 'Bearer explicit-proxy-token' },
      });
      expect((await provider.callApi('hello')).output).toBe('Paris');
      expect(sentHeaders[0].get('authorization')).toBe('Bearer explicit-proxy-token');
      expect(sentHeaders[0].has('x-api-key')).toBe(false);
      expect(getTokenProvider).not.toHaveBeenCalled();
    },
  );
});
