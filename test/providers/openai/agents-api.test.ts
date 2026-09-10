import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAiAgentsApiProvider } from '../../../src/providers/openai/agents-api';
import { fetchWithRetries } from '../../../src/util/fetch/index';
import { mockProcessEnv } from '../../util/utils';

vi.mock('../../../src/util/fetch/index', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithRetries: vi.fn(),
}));

const usage = {
  input_tokens: 100,
  output_tokens: 20,
  total_tokens: 120,
  input_tokens_details: { cached_tokens: 40 },
  output_tokens_details: { reasoning_tokens: 5 },
};
const session = { id: 'sess_test', status: 'idle', agent: { model: 'gpt-6-astra' }, usage };
const turn = { id: 'turn_test', status: 'completed', subagent_id: null, usage };
const message = {
  id: 'msg_final',
  type: 'message',
  role: 'assistant',
  phase: 'final_answer',
  status: 'completed',
  turn_id: turn.id,
  content: [{ type: 'output_text', text: '42' }],
};
const page = (data: unknown[], more = false, lastId: string | null = null) => ({
  data,
  has_more: more,
  last_id: lastId,
});
const json = (data: unknown) => new Response(JSON.stringify(data));

describe('OpenAiAgentsApiProvider', () => {
  mockProcessEnv({ OPENAI_API_KEY: undefined });

  beforeEach(() => {
    vi.mocked(fetchWithRetries).mockReset();
    vi.mocked(fetchWithRetries).mockImplementation(async (url, options) => {
      if (options?.method === 'DELETE') {
        return json({ deleted: true });
      }
      const pathname = new URL(String(url)).pathname;
      if (pathname.endsWith('/turns')) {
        return json(page([turn]));
      }
      if (pathname.endsWith('/items')) {
        return json(page([message]));
      }
      return json(session);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function provider(
    config: NonNullable<ConstructorParameters<typeof OpenAiAgentsApiProvider>[1]>['config'] = {},
  ) {
    return new OpenAiAgentsApiProvider('', { config: { apiKey: 'test-key', ...config } });
  }

  it('creates an isolated session, reads its final answer and usage, and deletes it', async () => {
    const result = await provider().callApi('Compute six times seven');
    expect(result).toMatchObject({
      output: '42',
      cached: false,
      tokenUsage: {
        prompt: 100,
        completion: 20,
        total: 120,
        cached: 40,
        completionDetails: { reasoning: 5 },
      },
      metadata: { sessionId: session.id, turnId: turn.id, sessionDeleted: true },
    });
    expect(result.cost).toBeGreaterThan(0);
    const [url, request, , retries] = vi.mocked(fetchWithRetries).mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/agents/sessions');
    expect(JSON.parse(request!.body as string)).toEqual({
      agent: { model: 'gpt-6-astra' },
      environment: { type: 'none' },
      input: 'Compute six times seven',
      stream: false,
    });
    expect(new Headers(request!.headers).get('OpenAI-Beta')).toBe('agents=v1');
    expect(new Headers(request!.headers).get('Authorization')).toBe('Bearer test-key');
    expect(retries).toBe(0);
    expect(vi.mocked(fetchWithRetries).mock.calls.at(-1)?.[1]?.method).toBe('DELETE');
  });

  it('preserves saved-agent configuration without injecting a default model', async () => {
    const agentProvider = provider({
      agent_id: 'agent_saved',
      agent: { instructions: 'Be concise' },
      environment: { type: 'openai_hosted', network: { access: 'disabled' } },
      vault_ids: ['vault_test'],
      metadata: { purpose: 'eval' },
    });
    expect(agentProvider.id()).toBe('openai:agents-api');
    await agentProvider.callApi('Hello');
    expect(JSON.parse(vi.mocked(fetchWithRetries).mock.calls[0][1]!.body as string)).toMatchObject({
      agent_id: 'agent_saved',
      agent: { instructions: 'Be concise' },
      environment: { type: 'openai_hosted', network: { access: 'disabled' } },
      vault_ids: ['vault_test'],
      metadata: { purpose: 'eval' },
    });
    expect(
      JSON.parse(vi.mocked(fetchWithRetries).mock.calls[0][1]!.body as string).agent,
    ).not.toHaveProperty('model');
  });

  it('uses the model suffix before agent.model and preserves custom IDs', () => {
    const agentProvider = new OpenAiAgentsApiProvider('gpt-5.6', {
      id: 'my-agent',
      config: { agent: { model: 'gpt-6-astra' } },
    });
    expect(agentProvider.id()).toBe('my-agent');
    expect(agentProvider.modelName).toBe('gpt-5.6');
  });

  it('fails before making requests when credentials are absent', async () => {
    expect(await new OpenAiAgentsApiProvider().callApi('hi')).toMatchObject({
      error: expect.stringContaining('OPENAI_API_KEY'),
    });
    expect(fetchWithRetries).not.toHaveBeenCalled();
  });

  it('honors scoped credentials and case-insensitive header overrides on custom URLs', async () => {
    const agentProvider = new OpenAiAgentsApiProvider('', {
      env: { OPENAI_API_KEY: 'scoped-key', OPENAI_ORGANIZATION: 'scoped-org' },
      config: {
        apiBaseUrl: 'https://gateway.example/v1/?tenant=one',
        headers: { authorization: 'Bearer header-key' },
      },
    });
    await agentProvider.callApi('hi');
    for (const [url, request] of vi.mocked(fetchWithRetries).mock.calls) {
      expect(new URL(String(url)).searchParams.get('tenant')).toBe('one');
      const headers = new Headers(request!.headers);
      expect(headers.get('Authorization')).toBe('Bearer header-key');
      expect(headers.get('OpenAI-Organization')).toBe('scoped-org');
    }
  });

  it.each([0, -1, NaN, Infinity, 1.5, 2_147_483_648])(
    'rejects invalid timeout/poll values: %s',
    (value) => {
      expect(() => provider({ timeoutMs: value })).toThrow('positive integer');
      expect(() => provider({ pollIntervalMs: value })).toThrow('positive integer');
    },
  );

  it.each([400, 401, 403, 429, 500])(
    'reports HTTP %s as an error with no false output',
    async (status) => {
      vi.mocked(fetchWithRetries).mockResolvedValue(new Response('upstream error', { status }));
      const result = await provider().callApi('hi');
      expect(result.error).toContain(`HTTP ${status}`);
      expect(result.output).toBeUndefined();
    },
  );

  it('waits through initial idle and completed subagent turns until the root finishes', async () => {
    vi.useFakeTimers();
    vi.mocked(fetchWithRetries)
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json(page([])))
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json(page([{ ...turn, subagent_id: 'child' }])))
      .mockResolvedValueOnce(json(session));
    const pending = provider().callApi('hi');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await pending).toMatchObject({ output: '42' });
    expect(
      vi.mocked(fetchWithRetries).mock.calls.filter(([url]) => String(url).includes('/turns?')),
    ).toHaveLength(3);
  });

  it.each(['failed', 'cancelled'])('does not treat a %s root turn as success', async (status) => {
    vi.mocked(fetchWithRetries)
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json(page([{ ...turn, status, error: { message: 'task stopped' } }])));
    const result = await provider().callApi('hi');
    expect(result.error).toContain(`turn ${status}: task stopped`);
    expect(result.output).toBeUndefined();
    expect(result.metadata?.sessionDeleted).toBe(true);
  });

  it('reports required client actions and removes the waiting session', async () => {
    vi.mocked(fetchWithRetries).mockResolvedValueOnce(
      json({
        ...session,
        status: 'requires_action',
        required_actions: [{ type: 'function_call' }],
      }),
    );
    const result = await provider().callApi('hi');
    expect(result.error).toContain('requires client-side actions (function_call)');
    expect(result.metadata?.sessionDeleted).toBe(true);
  });

  it('paginates turns and output, excluding commentary and other turns', async () => {
    const commentary = {
      ...message,
      id: 'commentary',
      phase: 'commentary',
      content: [{ type: 'output_text', text: 'Thinking' }],
    };
    vi.mocked(fetchWithRetries)
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(
        json(page([{ ...turn, id: 'child_turn', subagent_id: 'child' }], true, 'child_turn')),
      )
      .mockResolvedValueOnce(json(page([turn])))
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(
        json(page([commentary, { ...message, turn_id: 'old_turn' }], true, 'item/one')),
      )
      .mockResolvedValueOnce(json(page([message])));
    expect(await provider().callApi('hi')).toMatchObject({ output: '42' });
    const urls = vi.mocked(fetchWithRetries).mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes('after=child_turn'))).toBe(true);
    expect(urls.some((url) => url.includes('after=item%2Fone'))).toBe(true);
  });

  it('rejects looping pagination instead of silently truncating the result', async () => {
    vi.mocked(fetchWithRetries)
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json(page([], true, 'same')))
      .mockResolvedValueOnce(json(page([], true, 'same')));
    expect(await provider().callApi('hi')).toMatchObject({
      error: expect.stringContaining('pagination cursor'),
    });
  });

  it('rejects a completed turn with only commentary', async () => {
    vi.mocked(fetchWithRetries)
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json(page([turn])))
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json(page([{ ...message, phase: 'commentary' }])));
    expect(await provider().callApi('hi')).toMatchObject({
      error: expect.stringContaining('without a final assistant answer'),
    });
  });

  it('reports tool failures as metadata without confusing them with the final answer', async () => {
    vi.mocked(fetchWithRetries)
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json(page([turn])))
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(
        json(
          page([
            { id: 'cmd', type: 'command_execution', status: 'failed', turn_id: turn.id },
            message,
          ]),
        ),
      );
    const result = await provider().callApi('hi');
    expect(result.output).toBe('42');
    expect(result.metadata?.toolCalls).toEqual([
      { id: 'cmd', type: 'command_execution', status: 'failed' },
    ]);
  });

  it('retains successful sessions only when requested and never caches executions', async () => {
    const agentProvider = provider({ retainSession: true });
    expect((await agentProvider.callApi('hi')).cached).toBe(false);
    expect((await agentProvider.callApi('hi')).cached).toBe(false);
    const calls = vi.mocked(fetchWithRetries).mock.calls;
    expect(calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(2);
    expect(calls.some(([, options]) => options?.method === 'DELETE')).toBe(false);
  });

  it('preserves the eval result and reports cleanup failures', async () => {
    vi.mocked(fetchWithRetries)
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json(page([turn])))
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json(page([message])))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    const result = await provider().callApi('hi');
    expect(result).toMatchObject({
      output: '42',
      metadata: { sessionDeleted: false, cleanupError: expect.stringContaining('503') },
    });
  });

  it('bounds polling with the overall timeout and cleans up', async () => {
    vi.useFakeTimers();
    vi.mocked(fetchWithRetries)
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json(page([])));
    const pending = provider({ timeoutMs: 100, pollIntervalMs: 1_000 }).callApi('hi');
    await vi.advanceTimersByTimeAsync(100);
    expect(await pending).toMatchObject({
      error: 'Agents API request timed out after 100ms',
      metadata: { sessionDeleted: true },
    });
  });

  it('propagates cancellation but uses an independent signal for cleanup', async () => {
    vi.useFakeTimers();
    vi.mocked(fetchWithRetries)
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json(page([])));
    const controller = new AbortController();
    const pending = provider().callApi('hi', undefined, { abortSignal: controller.signal });
    const rejected = expect(pending).rejects.toThrow('cancel eval');
    await vi.advanceTimersByTimeAsync(0);
    controller.abort(new Error('cancel eval'));
    await rejected;
    const cleanup = vi.mocked(fetchWithRetries).mock.calls.at(-1)![1]!;
    expect(cleanup.method).toBe('DELETE');
    expect(cleanup.signal?.aborted).toBe(false);
  });

  it('does not create a session after cancellation', async () => {
    await expect(
      provider().callApi('hi', undefined, { abortSignal: AbortSignal.abort() }),
    ).rejects.toThrow();
    expect(fetchWithRetries).not.toHaveBeenCalled();
  });

  it('leaves unavailable beta usage and cost unset', async () => {
    vi.mocked(fetchWithRetries)
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json(page([{ ...turn, usage: null }])))
      .mockResolvedValueOnce(json({ ...session, usage: null }));
    const result = await provider().callApi('hi');
    expect(result.output).toBe('42');
    expect(result.tokenUsage).toBeUndefined();
    expect(result.cost).toBeUndefined();
  });

  it('accepts completed assistant output when the API leaves its phase unset', async () => {
    vi.mocked(fetchWithRetries)
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json(page([turn])))
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json(page([{ ...message, phase: null }])));
    expect(await provider().callApi('hi')).toMatchObject({ output: '42' });
  });
});
