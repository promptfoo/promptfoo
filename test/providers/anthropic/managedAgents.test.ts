import Anthropic from '@anthropic-ai/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnthropicManagedAgentsProvider } from '../../../src/providers/anthropic/managedAgents';

const usage = {
  input_tokens: 10,
  output_tokens: 20,
  cache_read_input_tokens: 30,
  cache_creation: { ephemeral_5m_input_tokens: 40, ephemeral_1h_input_tokens: 50 },
  list_cost: { amount: '123', currency: 'USD' },
  active_seconds: 7,
};
const message = (text: string) => ({
  id: `msg-${text}`,
  type: 'agent.message',
  content: [{ type: 'text', text }],
});
const idle = (reason = 'end_turn') => ({
  id: 'idle',
  type: 'session.status_idle',
  stop_reason: { type: reason },
});
const config = { apiKey: 'test-key', agent_id: 'agent-existing', environment_id: 'env-existing' };

function setup(
  overrides: Partial<ConstructorParameters<typeof AnthropicManagedAgentsProvider>[0]> = {},
  events: unknown[] = [message('answer'), idle()],
) {
  const provider = new AnthropicManagedAgentsProvider({ config, ...overrides });
  const beta = provider.anthropic.beta;
  const agentCreate = vi
    .spyOn(beta.agents, 'create')
    .mockResolvedValue({ id: 'agent-created' } as never);
  const environmentCreate = vi
    .spyOn(beta.environments, 'create')
    .mockResolvedValue({ id: 'env-created' } as never);
  const create = vi.spyOn(beta.sessions, 'create').mockResolvedValue({ id: 'sesn-test' } as never);
  const retrieve = vi.spyOn(beta.sessions, 'retrieve').mockResolvedValue({ usage } as never);
  const send = vi.spyOn(beta.sessions.events, 'send').mockResolvedValue({} as never);
  const controller = new AbortController();
  const stream = vi.spyOn(beta.sessions.events, 'stream').mockImplementation(
    () =>
      ({
        asResponse: async () =>
          new Response(
            new ReadableStream({
              start(streamController) {
                for (const event of events) {
                  streamController.enqueue(
                    new TextEncoder().encode(
                      `event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`,
                    ),
                  );
                }
                streamController.close();
              },
              cancel() {
                controller.abort();
              },
            }),
          ),
      }) as never,
  );
  const archive = vi.spyOn(beta.sessions, 'archive').mockResolvedValue({} as never);
  const agentArchive = vi.spyOn(beta.agents, 'archive').mockResolvedValue({} as never);
  const environmentArchive = vi.spyOn(beta.environments, 'archive').mockResolvedValue({} as never);
  return {
    provider,
    agentCreate,
    environmentCreate,
    create,
    retrieve,
    send,
    stream,
    controller,
    archive,
    agentArchive,
    environmentArchive,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('Claude Managed Agents', () => {
  it.each([429, 500])(
    'preserves a completed answer when usage retrieval returns HTTP %i',
    async (status) => {
      const streamedUsage = status === 429 ? [{ type: 'session.usage', usage }] : [];
      const f = setup({}, [...streamedUsage, message('answer'), idle()]);
      f.retrieve.mockRejectedValue(
        new Anthropic.APIError(status, { secret: 'test-key' }, 'test-key', new Headers()),
      );
      const result = await f.provider.callApi('test');
      expect(result.output).toBe('answer');
      expect(result.error).toBeUndefined();
      expect(result.cost).toBe(status === 429 ? 1.23 : undefined);
      expect(result.metadata?.usageError).toContain(String(status));
      expect(result.metadata?.usageError).not.toContain('test-key');
      expect(f.retrieve).toHaveBeenCalledWith(
        'sesn-test',
        expect.anything(),
        expect.objectContaining({ maxRetries: 2 }),
      );
      expect(result.metadata?.sessionArchived).toBe(true);
      expect(f.send).toHaveBeenCalledOnce();
    },
  );

  it('attempts archival even if interrupting a failed run is rejected', async () => {
    const f = setup({}, [idle('budget_reached')]);
    f.send
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new Anthropic.APIError(500, {}, 'test-key', new Headers()));
    const result = await f.provider.callApi('test');
    expect(result.error).toContain('budget_reached');
    expect(result.metadata?.interruptError).toContain('500');
    expect(result.metadata?.interruptError).not.toContain('test-key');
    expect(result.metadata?.sessionArchived).toBe(true);
  });

  it('reports an open workflow that cannot be archived after interruption', async () => {
    const f = setup({}, [
      { type: 'workflow_run.created', workflow_run_id: 'run-open' },
      idle('budget_reached'),
    ]);
    f.archive.mockRejectedValue(
      new Anthropic.APIError(400, {}, 'workflow_run_open', new Headers()),
    );
    const result = await f.provider.callApi('test');
    expect(result.error).toContain('cleanup failed');
    expect(result.metadata).toMatchObject({
      interruptRequested: true,
      sessionArchived: false,
      openWorkflowRunIds: ['run-open'],
      sessionId: 'sesn-test',
    });
    // Never raise the user's budget or resume paid work to try to stop a run.
    expect(f.send.mock.calls.map((call) => call[1].events[0].type)).toEqual([
      'user.message',
      'user.interrupt',
    ]);
  });

  it('subscribes before sending, returns the final answer and full session usage, then archives only its session', async () => {
    const f = setup({}, [
      message('working'),
      { type: 'session.usage', usage },
      message('answer'),
      idle(),
    ]);
    const result = await f.provider.callApi('question');
    expect(result).toMatchObject({
      output: 'answer',
      cached: false,
      cost: 1.23,
      tokenUsage: {
        prompt: 130,
        completion: 20,
        total: 150,
        cached: 30,
        completionDetails: { cacheReadInputTokens: 30, cacheCreationInputTokens: 90 },
      },
      metadata: { sessionId: 'sesn-test', sessionArchived: true, stopReason: 'end_turn' },
    });
    expect(result.error).toBeUndefined();
    expect(f.stream.mock.invocationCallOrder[0]).toBeLessThan(f.send.mock.invocationCallOrder[0]);
    expect(f.send).toHaveBeenCalledWith(
      'sesn-test',
      expect.objectContaining({
        events: [{ type: 'user.message', content: [{ type: 'text', text: 'question' }] }],
      }),
      expect.objectContaining({ maxRetries: 0 }),
    );
    expect(f.archive).toHaveBeenCalledOnce();
    expect(f.agentArchive).not.toHaveBeenCalled();
    expect(f.environmentArchive).not.toHaveBeenCalled();
  });

  it('creates and cleans up configured definitions and forwards dynamic workflows', async () => {
    const agent = {
      name: 'QA',
      model: 'claude-sonnet-5',
      system: 'Respond to {{name}}',
      multiagent: { type: 'multiagent_20261001' as const, workflows: { type: 'enabled' as const } },
    };
    const f = setup({
      config: {
        apiKey: 'key',
        agent,
        environment: { name: 'qa-env', config: { type: 'cloud' } },
        workspace_id: 'workspace-test',
      },
    });
    const result = await f.provider.callApi('test', {
      vars: { name: 'Ada' },
      prompt: { raw: 'test', label: 'test' },
    });
    expect(result.error).toBeUndefined();
    expect(f.agentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        ...agent,
        system: 'Respond to Ada',
        workspace_id: 'workspace-test',
      }),
      expect.anything(),
    );
    expect(f.create).toHaveBeenCalledWith(
      expect.objectContaining({ agent: 'agent-created', environment_id: 'env-created' }),
      expect.anything(),
    );
    expect(f.agentArchive).toHaveBeenCalledWith(
      'agent-created',
      { workspace_id: 'workspace-test' },
      expect.anything(),
    );
    expect(f.environmentArchive).toHaveBeenCalledWith(
      'env-created',
      { workspace_id: 'workspace-test' },
      expect.anything(),
    );
    expect(f.archive.mock.invocationCallOrder[0]).toBeLessThan(
      f.agentArchive.mock.invocationCallOrder[0],
    );
  });

  it('waits for every workflow and a subsequent main-agent idle, including a second run', async () => {
    const f = setup({}, [
      { type: 'workflow_run.created', workflow_run_id: 'run-1', name: 'Verify' },
      message('progress'),
      idle(),
      {
        type: 'session.thread_status_idle',
        session_thread_id: 'child',
        stop_reason: { type: 'end_turn' },
      },
      {
        type: 'workflow_run.status_ended',
        workflow_run_id: 'run-1',
        result: { type: 'completed' },
      },
      { type: 'workflow_run.created', workflow_run_id: 'run-2' },
      idle(),
      {
        type: 'workflow_run.status_ended',
        workflow_run_id: 'run-2',
        result: { type: 'completed' },
      },
      message('verified answer'),
      idle(),
    ]);
    const result = await f.provider.callApi('verify');
    expect(result.output).toBe('verified answer');
    expect(result.error).toBeUndefined();
    expect(result.metadata?.workflowRuns).toEqual([
      { id: 'run-1', name: 'Verify', status: 'ended', result: { type: 'completed' } },
      { id: 'run-2', status: 'ended', result: { type: 'completed' } },
    ]);
  });

  it.each(['stopped', 'error', 'future-result'])(
    'reports a workflow ending with %s as an error',
    async (type) => {
      const f = setup({}, [
        { type: 'workflow_run.created', workflow_run_id: 'run' },
        { type: 'workflow_run.status_ended', workflow_run_id: 'run', result: { type } },
        message('partial'),
        idle(),
      ]);
      expect((await f.provider.callApi('test')).error).toContain(`ended with ${type}`);
    },
  );

  it.each(['requires_action', 'budget_reached', 'retries_exhausted', 'unknown'])(
    'does not treat %s as success',
    async (reason) => {
      const f = setup({}, [message('partial'), idle(reason)]);
      const result = await f.provider.callApi('test');
      expect(result.error).toContain(`stopped: ${reason}`);
      expect(result.output).toBeUndefined();
      expect(f.archive).toHaveBeenCalledOnce();
    },
  );

  it.each(['agent.custom_tool_use', 'agent.tool_use', 'agent.mcp_tool_use'])(
    'fails promptly on unsupported client action: %s',
    async (type) => {
      const f = setup({}, [
        { id: 'tool', type, name: 'approval', input: {}, evaluated_permission: 'ask' },
      ]);
      expect((await f.provider.callApi('test')).error).toContain('requires client action');
      // Cleanup interrupts the run; it never grants approval or executes tools.
      expect(f.send.mock.calls.map((call) => call[1].events[0].type)).toEqual([
        'user.message',
        'user.interrupt',
      ]);
    },
  );

  it('captures hosted tool calls and MCP results', async () => {
    const f = setup({}, [
      {
        type: 'agent.tool_use',
        id: 'bash',
        name: 'bash',
        input: { command: 'echo ok' },
        evaluated_permission: 'allow',
      },
      {
        type: 'agent.tool_result',
        id: 'result',
        tool_use_id: 'bash',
        content: [{ type: 'text', text: 'ok' }],
      },
      { type: 'agent.mcp_tool_use', id: 'mcp', name: 'lookup', input: {} },
      {
        type: 'agent.mcp_tool_result',
        id: 'result2',
        mcp_tool_use_id: 'mcp',
        content: [{ type: 'text', text: 'found' }],
        is_error: false,
      },
      message('answer'),
      idle(),
    ]);
    expect((await f.provider.callApi('test')).metadata?.toolCalls).toEqual([
      {
        id: 'bash',
        name: 'bash',
        input: { command: 'echo ok' },
        output: [{ type: 'text', text: 'ok' }],
        is_error: false,
      },
      {
        id: 'mcp',
        name: 'lookup',
        input: {},
        output: [{ type: 'text', text: 'found' }],
        is_error: false,
      },
    ]);
  });

  it('allows transient session errors to recover', async () => {
    const f = setup({}, [
      { type: 'session.error', error: { type: 'model_overloaded_error' } },
      { type: 'session.status_rescheduled' },
      message('recovered'),
      idle(),
    ]);
    expect((await f.provider.callApi('test')).output).toBe('recovered');
  });

  it('does not return earlier progress when the final message is redacted', async () => {
    const f = setup({}, [
      message('progress'),
      { type: 'agent.message', content: [{ type: 'redacted' }] },
      idle(),
    ]);
    const result = await f.provider.callApi('test');
    expect(result.error).toContain('without a text response');
    expect(result.output).toBeUndefined();
  });

  it('bounds cleanup separately after a successful answer', async () => {
    vi.useFakeTimers();
    const f = setup({ config: { ...config, cleanupTimeoutMs: 100 } });
    f.archive.mockImplementation(
      (_id, _params, request) =>
        new Promise((_resolve, reject) => {
          request!.signal!.addEventListener('abort', () => reject(new Error('cleanup aborted')), {
            once: true,
          });
        }) as never,
    );
    const pending = f.provider.callApi('test');
    await vi.advanceTimersByTimeAsync(100);
    const result = await pending;
    expect(result.error).toContain('cleanup failed');
    expect(result.metadata).toMatchObject({ sessionArchived: false, rateLimitRetryable: false });
  });

  it.each([
    [[message('partial')], 'stream ended'],
    [[idle()], 'without a text response'],
    [[{ type: 'session.status_terminated' }], 'terminated'],
    [
      [
        { type: 'workflow_run.created', workflow_run_id: 'run' },
        message('early'),
        idle(),
        {
          type: 'workflow_run.status_ended',
          workflow_run_id: 'run',
          result: { type: 'completed' },
        },
      ],
      'stream ended',
    ],
  ])('rejects incomplete runs %#', async (events, error) => {
    expect((await setup({}, events as unknown[]).provider.callApi('test')).error).toContain(error);
  });

  it('preserves known usage on failure without inventing missing token counts or non-USD cost', async () => {
    const f = setup({}, [
      {
        type: 'session.usage',
        usage: { output_tokens: 5, list_cost: { amount: '50', currency: 'EUR' } },
      },
      idle('budget_reached'),
    ]);
    const result = await f.provider.callApi('test');
    expect(result.tokenUsage?.completion).toBe(5);
    expect(result.tokenUsage?.prompt).toBeUndefined();
    expect(result.tokenUsage?.total).toBeUndefined();
    expect(result.cost).toBeUndefined();
  });

  it('pins the agent version, forwards session settings, and retains a successful session on request', async () => {
    const session = {
      title: 'QA',
      vault_ids: ['vault'],
      resources: [],
      budget: {
        type: 'limit' as const,
        max_list_cost: { amount: '100', currency: 'USD' as const },
      },
    };
    const f = setup({ config: { ...config, agent_version: 2, session, retainSession: true } });
    const result = await f.provider.callApi('test');
    expect(f.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ...session,
        agent: { type: 'agent', id: 'agent-existing', version: 2 },
      }),
      expect.anything(),
    );
    expect(f.archive).not.toHaveBeenCalled();
    expect(result.metadata?.sessionArchived).toBe(false);
  });

  it('archives a failed session even when retainSession is true', async () => {
    const f = setup({ config: { ...config, retainSession: true } }, [idle('budget_reached')]);
    await f.provider.callApi('test');
    expect(f.archive).toHaveBeenCalledOnce();
  });

  it('creates separate sessions for concurrent identical calls instead of caching responses', async () => {
    const f = setup();
    f.create
      .mockResolvedValueOnce({ id: 'sesn-1' } as never)
      .mockResolvedValueOnce({ id: 'sesn-2' } as never);
    const results = await Promise.all([f.provider.callApi('same'), f.provider.callApi('same')]);
    expect(results.map((r) => r.metadata?.sessionId)).toEqual(['sesn-1', 'sesn-2']);
    expect(f.send).toHaveBeenCalledTimes(2);
  });

  it('cleans up an agent if environment creation fails', async () => {
    const f = setup({
      config: {
        apiKey: 'key',
        agent: { name: 'QA', model: 'claude-sonnet-5' },
        environment: { name: 'QA' },
      },
    });
    f.environmentCreate.mockRejectedValue(new Anthropic.APIError(403, {}, 'denied', new Headers()));
    const result = await f.provider.callApi('test');
    expect(result.error).toContain('403');
    expect(f.agentArchive).toHaveBeenCalledOnce();
    expect(f.create).not.toHaveBeenCalled();
  });

  it.each([401, 429, 500])(
    'returns HTTP %s without exposing echoed credentials',
    async (status) => {
      const f = setup();
      f.send.mockRejectedValue(
        new Anthropic.APIError(status, { secret: 'test-key' }, 'test-key', new Headers()),
      );
      const result = await f.provider.callApi('test');
      expect(result.error).toContain(String(status));
      expect(result.error).not.toContain('test-key');
      expect(f.send).toHaveBeenCalledTimes(2);
      expect(f.archive).toHaveBeenCalledOnce();
    },
  );

  it('reports failed archival and retains IDs needed to recover the hosted run', async () => {
    const f = setup({
      config: {
        apiKey: 'key',
        agent: { name: 'QA', model: 'claude-sonnet-5' },
        environment: { name: 'QA' },
      },
    });
    f.archive.mockRejectedValue(
      new Anthropic.APIError(400, {}, 'workflow_run_open', new Headers()),
    );
    const result = await f.provider.callApi('test');
    expect(result.error).toContain('cleanup failed');
    expect(result.metadata).toMatchObject({
      sessionArchived: false,
      sessionId: 'sesn-test',
      createdAgentId: 'agent-created',
      createdEnvironmentId: 'env-created',
    });
    expect(f.agentArchive).not.toHaveBeenCalled();
    expect(f.environmentArchive).not.toHaveBeenCalled();
  });

  it('does no work for a pre-aborted call', async () => {
    const f = setup();
    const result = await f.provider.callApi('test', undefined, {
      abortSignal: AbortSignal.abort(),
    });
    expect(result.error).toContain('aborted');
    expect(f.create).not.toHaveBeenCalled();
  });

  it.each(['timeout', 'abort'])(
    'stops a stalled stream on %s and uses a fresh cleanup signal',
    async (mode) => {
      vi.useFakeTimers();
      const f = setup({ config: { ...config, timeoutMs: 100 } });
      const caller = new AbortController();
      f.stream.mockImplementation(
        () =>
          ({
            asResponse: async () =>
              new Response(
                new ReadableStream({
                  cancel() {
                    f.controller.abort();
                  },
                }),
              ),
          }) as never,
      );
      const resultPromise = f.provider.callApi('test', undefined, { abortSignal: caller.signal });
      await vi.advanceTimersByTimeAsync(10);
      if (mode === 'abort') {
        caller.abort();
      } else {
        await vi.advanceTimersByTimeAsync(100);
      }
      const result = await resultPromise;
      expect(result.error).toContain(mode === 'abort' ? 'aborted' : 'timed out');
      expect(f.archive).toHaveBeenCalledOnce();
      expect(f.archive.mock.calls[0][2]?.signal?.aborted).toBe(false);
      expect(f.send).toHaveBeenLastCalledWith(
        'sesn-test',
        { events: [{ type: 'user.interrupt' }] },
        expect.objectContaining({ signal: expect.any(AbortSignal), maxRetries: 0 }),
      );
      expect(f.send.mock.calls[1][2]?.signal?.aborted).toBe(false);
      expect(f.send.mock.invocationCallOrder[1]).toBeLessThan(
        f.archive.mock.invocationCallOrder[0],
      );
    },
  );

  it.each([
    {},
    { agent_id: 'a' },
    { ...config, agent: { name: 'a', model: 'm' } },
    { ...config, environment: { name: 'e' } },
    { ...config, timeoutMs: -1 },
    { ...config, cleanupTimeoutMs: Infinity },
    { ...config, agent_version: 0 },
    {
      ...config,
      environment_id: undefined,
      environment: { name: 'e', config: { type: 'self_hosted' } },
    },
  ])('rejects invalid configuration %#', (invalid) => {
    expect(
      () => new AnthropicManagedAgentsProvider({ config: invalid as typeof config }),
    ).toThrow();
  });
});
