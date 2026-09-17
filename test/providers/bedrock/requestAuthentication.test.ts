import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache, withCacheEnabled } from '../../../src/cache';
import { createBedrockMantleChatProvider } from '../../../src/providers/bedrock/mantleChat';
import { createBedrockOpenAiResponsesProvider } from '../../../src/providers/bedrock/openaiResponses';
import { monkeyPatchFetch } from '../../../src/util/fetch/monkeyPatchFetch';
import { mockProcessEnv } from '../../util/utils';

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
    vi.useRealTimers();
    vi.resetAllMocks();
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
