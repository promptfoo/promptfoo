import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache, withCacheEnabled } from '../../../src/cache';
import { createBedrockAnthropicMessagesProvider } from '../../../src/providers/bedrock/anthropicMessages';
import { createBedrockMantleChatProvider } from '../../../src/providers/bedrock/mantleChat';
import { createBedrockOpenAiResponsesProvider } from '../../../src/providers/bedrock/openaiResponses';
import { monkeyPatchFetch } from '../../../src/util/fetch/monkeyPatchFetch';
import { mockProcessEnv } from '../../util/utils';

import type { ProviderOptions } from '../../../src/types/providers';

const { generateToken, getTokenProvider } = vi.hoisted(() => ({
  generateToken: vi.fn(),
  getTokenProvider: vi.fn(),
}));
vi.mock('@aws/bedrock-token-generator', () => ({ getTokenProvider }));
vi.mock('../../../src/util/fetch/monkeyPatchFetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/util/fetch/monkeyPatchFetch')>()),
  monkeyPatchFetch: vi.fn(),
}));
vi.mock('../../../src/util/time', () => ({ sleep: vi.fn().mockResolvedValue(undefined) }));

const completed = {
  id: 'response-test',
  status: 'completed',
  output: [
    { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Paris' }] },
  ],
  choices: [{ message: { content: 'Paris' }, finish_reason: 'stop' }],
  usage: { input_tokens: 2, output_tokens: 1 },
};

describe('Bedrock authentication at the HTTP attempt boundary', () => {
  let restoreEnv: () => void;
  beforeEach(() => {
    restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: undefined });
    generateToken.mockReset();
    getTokenProvider.mockReset().mockReturnValue(generateToken);
    vi.mocked(monkeyPatchFetch).mockReset();
  });
  afterEach(() => {
    restoreEnv();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  describe.each(['chat', 'responses', 'messages'] as const)('%s custom endpoint', (route) => {
    const createProvider = (options: ProviderOptions) => {
      switch (route) {
        case 'chat':
          return createBedrockMantleChatProvider('zai.glm-4.6', options);
        case 'responses':
          return createBedrockOpenAiResponsesProvider('openai.gpt-5.5', options);
        case 'messages':
          return createBedrockAnthropicMessagesProvider('anthropic.claude-fable-5', options);
      }
    };
    it.each([
      { name: 'no explicit auth', config: {}, expected: null },
      { name: 'an explicit key', config: { apiKey: 'explicit-token' }, expected: 'key' },
      {
        name: 'an explicit header',
        config: { headers: { Authorization: 'Bearer proxy-token' } },
        expected: 'header',
      },
    ])('isolates environment credentials with $name', async ({ config, expected }) => {
      const restore = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: 'process-token' });
      const sentHeaders: Headers[] = [];
      const fetch = vi.fn(async (_input: unknown, init?: RequestInit) => {
        sentHeaders.push(new Headers(init?.headers));
        return Response.json({
          ...completed,
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Paris' }],
          stop_reason: 'end_turn',
        });
      });
      vi.mocked(monkeyPatchFetch).mockImplementation(fetch);
      vi.stubGlobal('fetch', fetch);
      try {
        for (const env of [undefined, { AWS_BEARER_TOKEN_BEDROCK: 'provider-token' }]) {
          const options = {
            config: {
              apiBaseUrl: 'http://127.0.0.1:12345/v1',
              apiKeyRequired: false,
              stream: false,
              ...config,
            },
            env,
          };
          const provider = createProvider(options);
          expect(provider.getApiKey()).toBe(expected === 'key' ? 'explicit-token' : undefined);
          expect((await provider.callApi('Capital?')).output).toBe('Paris');
        }
        expect(sentHeaders).toHaveLength(2);
        for (const headers of sentHeaders) {
          expect(headers.get('authorization')).toBe(
            expected === 'header'
              ? 'Bearer proxy-token'
              : expected === 'key' && route !== 'messages'
                ? 'Bearer explicit-token'
                : null,
          );
          expect(headers.get('x-api-key')).toBe(
            expected === 'key' && route === 'messages' ? 'explicit-token' : null,
          );
        }
        expect(getTokenProvider).not.toHaveBeenCalled();
      } finally {
        restore();
      }
    });
  });

  it.each(['chat', 'responses'] as const)(
    '%s refreshes auth on rate-limit retries and bypasses response caching',
    async (route) => {
      generateToken
        .mockResolvedValueOnce('first')
        .mockResolvedValueOnce('second')
        .mockResolvedValueOnce('third');
      vi.mocked(monkeyPatchFetch)
        .mockResolvedValueOnce(
          Response.json({ error: { message: 'rate limited' } }, { status: 429 }),
        )
        .mockImplementation(async () => Response.json(completed));
      const options = { config: { profile: 'test-profile', region: 'us-east-1' } };
      const provider =
        route === 'chat'
          ? createBedrockMantleChatProvider('zai.glm-4.6', options)
          : createBedrockOpenAiResponsesProvider('openai.gpt-5.5', options);
      await withCacheEnabled(true, async () => {
        expect((await provider.callApi('Capital?')).output).toBe('Paris');
        expect((await provider.callApi('Capital?')).output).toBe('Paris');
      });
      expect(generateToken).toHaveBeenCalledTimes(3);
      expect(
        vi
          .mocked(monkeyPatchFetch)
          .mock.calls.map(([, init]) => new Headers(init?.headers).get('authorization')),
      ).toEqual(['Bearer first', 'Bearer second', 'Bearer third']);
      expect(
        vi.mocked(monkeyPatchFetch).mock.calls.every(([, init]) => !('getAuthHeaders' in init!)),
      ).toBe(true);
    },
  );

  it('refreshes auth for retries within background Responses polling', async () => {
    vi.useFakeTimers();
    generateToken
      .mockResolvedValueOnce('create')
      .mockResolvedValueOnce('poll')
      .mockResolvedValueOnce('retry');
    vi.mocked(monkeyPatchFetch)
      .mockResolvedValueOnce(Response.json({ id: 'response-test', status: 'queued' }))
      .mockResolvedValueOnce(Response.json({ error: { message: 'rate limited' } }, { status: 429 }))
      .mockResolvedValueOnce(Response.json(completed));
    const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
      config: {
        profile: 'test-profile',
        region: 'us-east-1',
        background: true,
      },
    });
    const pending = provider.callApi('Capital?');
    await vi.runAllTimersAsync();
    expect((await pending).output).toBe('Paris');
    expect(
      vi
        .mocked(monkeyPatchFetch)
        .mock.calls.map(([, init]) => [
          init?.method,
          new Headers(init?.headers).get('authorization'),
        ]),
    ).toEqual([
      ['POST', 'Bearer create'],
      ['GET', 'Bearer poll'],
      ['GET', 'Bearer retry'],
    ]);
  });

  it('refreshes auth for an idempotent response-body read retry', async () => {
    const broken = new Response();
    vi.spyOn(broken, 'text').mockRejectedValue(
      Object.assign(new Error('connection reset'), { code: 'ECONNRESET' }),
    );
    vi.mocked(monkeyPatchFetch)
      .mockResolvedValueOnce(broken)
      .mockResolvedValueOnce(Response.json({ ok: true }));
    const getAuthHeaders = vi
      .fn()
      .mockResolvedValueOnce({ authorization: 'Bearer first' })
      .mockResolvedValueOnce({ authorization: 'Bearer second' });
    const result = await fetchWithCache(
      'https://example.com/status',
      { getAuthHeaders },
      1000,
      'json',
      true,
    );
    expect(result.data).toEqual({ ok: true });
    expect(getAuthHeaders).toHaveBeenCalledTimes(2);
  });
});
