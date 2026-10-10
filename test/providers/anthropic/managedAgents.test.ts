import Anthropic from '@anthropic-ai/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import logger from '../../../src/logger';
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
const apiError = (status: number, message: string, type = 'invalid_request_error') =>
  new Anthropic.APIError(
    status,
    { type: 'error', error: { type, message } },
    undefined,
    new Headers(),
  );
// The refusal the API returns when archival races an interrupt or the idle status write.
const stillRunning = () =>
  apiError(
    400,
    'Session sesn-test cannot be archived while its status is "running". Only pending or idle sessions may be archived.',
  );

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
  const agentRetrieve = vi.spyOn(beta.agents, 'retrieve').mockResolvedValue({} as never);
  const environmentRetrieve = vi
    .spyOn(beta.environments, 'retrieve')
    .mockResolvedValue({} as never);
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
    agentRetrieve,
    environmentRetrieve,
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
    f.archive.mockRejectedValue(apiError(400, 'Session sesn-test has an open workflow run.'));
    f.retrieve.mockResolvedValue({ status: 'idle' } as never);
    const result = await f.provider.callApi('test');
    expect(result.error).toContain('cleanup failed');
    expect(result.error).toContain('has an open workflow run');
    expect(result.metadata).toMatchObject({
      interruptRequested: true,
      sessionArchived: false,
      openWorkflowRunIds: ['run-open'],
      sessionId: 'sesn-test',
    });
    // Waiting cannot help a settled session: one retry rules out a status race, then it reports.
    expect(f.archive).toHaveBeenCalledTimes(2);
    // Never raise the user's budget or resume paid work to try to stop a run.
    expect(f.send.mock.calls.map((call) => call[1].events[0].type)).toEqual([
      'user.message',
      'user.interrupt',
    ]);
  });

  it.each(['budget_reached', 'end_turn'])(
    'waits for a session that is still running before archiving it (%s)',
    async (reason) => {
      vi.useFakeTimers();
      const f = setup(
        {
          config: {
            apiKey: 'key',
            agent: { name: 'QA', model: 'claude-sonnet-5' },
            environment: { name: 'QA' },
          },
        },
        [message('answer'), idle(reason)],
      );
      f.archive
        .mockRejectedValueOnce(stillRunning())
        .mockRejectedValueOnce(stillRunning())
        .mockResolvedValue({} as never);
      f.retrieve.mockResolvedValue({ status: 'running', usage } as never);
      const pending = f.provider.callApi('test');
      await vi.advanceTimersByTimeAsync(1_000);
      const result = await pending;
      expect(f.archive).toHaveBeenCalledTimes(3);
      expect(result.metadata).toMatchObject({ sessionArchived: true });
      expect(result.metadata).not.toHaveProperty('cleanupErrors');
      expect(result.error).toBe(
        reason === 'end_turn' ? undefined : 'Claude Managed Agents stopped: budget_reached',
      );
      expect(result.output).toBe(reason === 'end_turn' ? 'answer' : undefined);
      // The definitions it created are only released once the session is.
      expect(f.archive.mock.invocationCallOrder[2]).toBeLessThan(
        f.agentArchive.mock.invocationCallOrder[0],
      );
      expect(f.environmentArchive).toHaveBeenCalledOnce();
    },
  );

  it('archives a session that settles between the refusal and the status check', async () => {
    const f = setup({}, [idle('budget_reached')]);
    f.archive.mockRejectedValueOnce(stillRunning()).mockResolvedValue({} as never);
    f.retrieve.mockResolvedValue({ status: 'idle' } as never);
    const result = await f.provider.callApi('test');
    expect(f.archive).toHaveBeenCalledTimes(2);
    expect(result.metadata).toMatchObject({ sessionArchived: true });
    expect(result.metadata).not.toHaveProperty('cleanupErrors');
  });

  it('confirms archival when the archive response was lost', async () => {
    const f = setup({
      config: {
        apiKey: 'key',
        agent: { name: 'QA', model: 'claude-sonnet-5' },
        environment: { name: 'QA' },
      },
    });
    f.archive.mockRejectedValue(new Anthropic.APIConnectionError({ message: 'socket hang up' }));
    f.retrieve.mockResolvedValue({
      status: 'terminated',
      archived_at: '2026-10-09',
      usage,
    } as never);
    const result = await f.provider.callApi('test');
    expect(result.error).toBeUndefined();
    expect(result.metadata).toMatchObject({ sessionArchived: true });
    expect(f.archive).toHaveBeenCalledOnce();
    // The definitions it created are still released.
    expect(f.agentArchive).toHaveBeenCalledOnce();
    expect(f.environmentArchive).toHaveBeenCalledOnce();
  });

  it.each([429, 503])('retries archival after a transient HTTP %i', async (status) => {
    vi.useFakeTimers();
    const f = setup();
    f.archive
      .mockRejectedValueOnce(apiError(status, 'Try again later.', 'api_error'))
      .mockResolvedValue({} as never);
    f.retrieve.mockResolvedValue({ status: 'idle', usage } as never);
    const pending = f.provider.callApi('test');
    await vi.advanceTimersByTimeAsync(250);
    const result = await pending;
    expect(f.archive).toHaveBeenCalledTimes(2);
    expect(result.error).toBeUndefined();
    expect(result.metadata).toMatchObject({ sessionArchived: true });
  });

  it.each([401, 403, 404])('does not retry an archive rejected with HTTP %i', async (status) => {
    const f = setup();
    f.archive.mockRejectedValue(apiError(status, 'Not permitted.', 'permission_error'));
    const result = await f.provider.callApi('test');
    expect(f.archive).toHaveBeenCalledOnce();
    expect(result.error).toContain(`cleanup failed: Session sesn-test:`);
    expect(result.error).toContain(`(HTTP ${status}): permission_error: Not permitted.`);
    expect(result.metadata).toMatchObject({ sessionArchived: false });
  });

  it('keeps waiting when the status check itself fails for now', async () => {
    vi.useFakeTimers();
    const f = setup({}, [idle('budget_reached')]);
    f.archive.mockRejectedValueOnce(stillRunning()).mockResolvedValue({} as never);
    f.retrieve.mockRejectedValueOnce(apiError(429, 'Slow down.', 'rate_limit_error'));
    const pending = f.provider.callApi('test');
    await vi.advanceTimersByTimeAsync(250);
    const result = await pending;
    expect(f.archive).toHaveBeenCalledTimes(2);
    expect(result.metadata).toMatchObject({ sessionArchived: true });
    expect(result.metadata).not.toHaveProperty('cleanupErrors');
  });

  it.each(['agent', 'environment', 'session'] as const)(
    'archives the %s whose creation was in flight when the call was aborted',
    async (kind) => {
      const f = setup({
        config: {
          apiKey: 'key',
          agent: { name: 'QA', model: 'claude-sonnet-5' },
          environment: { name: 'QA' },
          timeoutMs: 1_000,
        },
      });
      const caller = new AbortController();
      const spy = { agent: f.agentCreate, environment: f.environmentCreate, session: f.create }[
        kind
      ];
      // The server finishes a create even if the client stops waiting for it.
      spy.mockImplementation((async () => {
        caller.abort();
        return { id: `${kind}-created` };
      }) as never);
      const result = await f.provider.callApi('test', undefined, { abortSignal: caller.signal });
      expect(result.error).toBe('Claude Managed Agents invocation aborted');
      // A create that could be aborted, or cut short by the call's own deadline,
      // would discard the id that cleanup needs.
      expect(spy.mock.calls[0][1]).not.toHaveProperty('signal');
      expect(spy.mock.calls[0][1]).toMatchObject({ timeout: 60_000 });
      expect(f.agentArchive).toHaveBeenCalledOnce();
      expect(f.environmentArchive).toHaveBeenCalledTimes(kind === 'agent' ? 0 : 1);
      expect(f.archive).toHaveBeenCalledTimes(kind === 'session' ? 1 : 0);
      expect(f.send).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ events: [expect.objectContaining({ type: 'user.message' })] }),
        expect.anything(),
      );
    },
  );

  it.each(['agent', 'environment'] as const)(
    'retries archiving the %s it created after a transient failure',
    async (kind) => {
      vi.useFakeTimers();
      const f = setup({
        config: {
          apiKey: 'key',
          agent: { name: 'QA', model: 'claude-sonnet-5' },
          environment: { name: 'QA' },
        },
      });
      const spy = kind === 'agent' ? f.agentArchive : f.environmentArchive;
      spy
        .mockRejectedValueOnce(new Anthropic.APIConnectionError({ message: 'socket hang up' }))
        .mockResolvedValue({} as never);
      const pending = f.provider.callApi('test');
      await vi.advanceTimersByTimeAsync(250);
      const result = await pending;
      expect(spy).toHaveBeenCalledTimes(2);
      expect(result.error).toBeUndefined();
      expect(result.metadata).not.toHaveProperty('cleanupErrors');
    },
  );

  it('accepts a lost response for a definition that was archived anyway', async () => {
    const f = setup({
      config: {
        apiKey: 'key',
        agent: { name: 'QA', model: 'claude-sonnet-5' },
        environment: { name: 'QA' },
      },
    });
    f.agentArchive.mockRejectedValue(new Anthropic.APIConnectionError({ message: 'reset' }));
    f.agentRetrieve.mockResolvedValue({ archived_at: '2026-10-09' } as never);
    const result = await f.provider.callApi('test');
    expect(f.agentArchive).toHaveBeenCalledOnce();
    expect(result.error).toBeUndefined();
    expect(f.environmentArchive).toHaveBeenCalledOnce();
  });

  it('accepts a refusal for a session that is already archived', async () => {
    const f = setup({}, [idle('budget_reached')]);
    f.archive.mockRejectedValue(apiError(400, 'Session sesn-test is already archived.'));
    f.retrieve.mockResolvedValue({ status: 'terminated', archived_at: '2026-10-09' } as never);
    const result = await f.provider.callApi('test');
    expect(result.metadata).toMatchObject({ sessionArchived: true });
    expect(result.error).toBe('Claude Managed Agents stopped: budget_reached');
  });

  it('reports a session that is still running when the cleanup deadline passes', async () => {
    vi.useFakeTimers();
    const f = setup(
      {
        config: {
          apiKey: 'key',
          agent: { name: 'QA', model: 'claude-sonnet-5' },
          environment: { name: 'QA' },
          cleanupTimeoutMs: 1_000,
        },
      },
      [idle('budget_reached')],
    );
    f.archive.mockImplementation(((
      _id: string,
      _params: unknown,
      request: { signal: AbortSignal },
    ) =>
      request.signal.aborted
        ? Promise.reject(new Anthropic.APIUserAbortError())
        : Promise.reject(stillRunning())) as never);
    f.retrieve.mockResolvedValue({ status: 'running' } as never);
    const pending = f.provider.callApi('test');
    await vi.advanceTimersByTimeAsync(1_000);
    const result = await pending;
    expect(result.error).toContain('cannot be archived while its status is "running"');
    expect(result.error).toContain('still running when the 1000ms cleanup deadline passed');
    expect(result.metadata).toMatchObject({
      sessionArchived: false,
      sessionId: 'sesn-test',
      createdAgentId: 'agent-created',
      createdEnvironmentId: 'env-created',
    });
    expect(f.archive.mock.calls.length).toBeGreaterThan(1);
    expect(f.agentArchive).not.toHaveBeenCalled();
    expect(f.environmentArchive).not.toHaveBeenCalled();
  });

  it('reports why the API rejected a definition without echoing the credentials it was sent', async () => {
    const errorLog = vi.spyOn(logger, 'error').mockImplementation(() => undefined as never);
    const f = setup({
      config: {
        apiKey: 'sk-ant-config-credential',
        headers: { 'x-gateway': 'gateway-credential' },
        agent: { name: 'QA', model: 'claude-not-a-model' },
        environment: { name: 'QA' },
        session: {
          resources: [
            {
              type: 'github_repository',
              url: 'https://github.com/promptfoo/promptfoo',
              authorization_token: 'repository-credential',
            },
          ],
        },
      },
    });
    f.agentCreate.mockRejectedValue(
      apiError(
        404,
        '`model.id`: model "claude-not-a-model": model is not supported (sk-ant-config-credential, gateway-credential, repository-credential)',
        'not_found_error',
      ),
    );
    const results = [await f.provider.callApi('test'), await f.provider.callApi('test')];
    for (const result of results) {
      expect(result.error).toBe(
        'Claude Managed Agents API request failed (HTTP 404): not_found_error: `model.id`: model "claude-not-a-model": model is not supported ([REDACTED], [REDACTED], [REDACTED])',
      );
      expect(result.metadata).toMatchObject({ http: { status: 404 }, rateLimitRetryable: false });
    }
    // A 404 aborts the eval before rows are shown, so the reason is also logged, once.
    expect(errorLog).toHaveBeenCalledOnce();
    expect(errorLog).toHaveBeenCalledWith(results[0].error);
  });

  it('adds a configured anthropic-beta to the one Managed Agents requires', async () => {
    const f = setup({
      config: {
        ...config,
        headers: { 'Anthropic-Beta': 'extra-beta-2026-01-01, other-beta', 'x-trace': 'trace-1' },
      },
    });
    const result = await f.provider.callApi('test');
    expect(result.error).toBeUndefined();
    // As a header it would replace the SDK's own value; as `betas` the SDK merges it.
    for (const [params, request] of [
      f.create.mock.calls[0],
      [f.stream.mock.calls[0][1], f.stream.mock.calls[0][2]],
      [f.send.mock.calls[0][1], f.send.mock.calls[0][2]],
      [f.archive.mock.calls[0][1], f.archive.mock.calls[0][2]],
    ]) {
      expect(params).toMatchObject({ betas: ['extra-beta-2026-01-01', 'other-beta'] });
      expect(request).toMatchObject({ headers: { 'x-trace': 'trace-1' } });
    }
  });

  it('scrubs credentials that ANTHROPIC_CUSTOM_HEADERS adds to requests', async () => {
    const f = setup({
      config,
      env: {
        ANTHROPIC_CUSTOM_HEADERS:
          'Authorization: Bearer gateway-token-1\nx-team-key: ab12\nx-region: us',
      },
    });
    // A gateway that rejects the request can echo the credential without its scheme.
    f.create.mockRejectedValue(
      apiError(403, 'token gateway-token-1 and key ab12 are not valid in us', 'permission_error'),
    );
    const result = await f.provider.callApi('test');
    expect(result.error).toBe(
      'Claude Managed Agents API request failed (HTTP 403): permission_error: token [REDACTED] and key [REDACTED] are not valid in us',
    );
  });

  it('scrubs credentials from errors that do not come from the API', async () => {
    const apiKey = 'sk-ant-config-credential\nsecond-line-secret';
    const f = setup({ config: { ...config, apiKey, headers: { 'x-gateway': 'gateway-secret' } } });
    // What the runtime throws for a header value it rejects, before any request is sent.
    f.create.mockRejectedValue(
      new TypeError(`Headers.append: "${apiKey}" is an invalid header value (gateway-secret).`),
    );
    const result = await f.provider.callApi('test');
    expect(result.error).toBe(
      'Headers.append: "[REDACTED]" is an invalid header value ([REDACTED]).',
    );
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
        completionDetails: { cacheReadInputTokens: 30, cacheCreationInputTokens: 90 },
      },
      metadata: { sessionId: 'sesn-test', sessionArchived: true, stopReason: 'end_turn' },
    });
    // Prompt-cache reads are not a response replayed from Promptfoo's cache.
    expect(result.tokenUsage).not.toHaveProperty('cached');
    expect(result.metadata).not.toHaveProperty('workflowStartErrors');
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

  it('reports a workflow start the server refused, which leaves no run to wait for', async () => {
    const refusal = {
      type: 'max_workflow_runs_error',
      message: 'The session has reached its limit of open workflow runs.',
    };
    const f = setup({}, [
      { type: 'workflow_run.error', workflow_run_id: null, error: refusal },
      message('I could not start the workflow, so here is my own answer.'),
      idle(),
    ]);
    const result = await f.provider.callApi('test');
    expect(result.error).toBe(
      'Claude Managed Agents could not start a workflow (max_workflow_runs_error: The session has reached its limit of open workflow runs.)',
    );
    expect(result.output).toBeUndefined();
    expect(result.metadata).toMatchObject({
      workflowRuns: [],
      workflowStartErrors: [refusal],
      sessionArchived: true,
    });
  });

  it('includes the reason the server gives for a failed workflow', async () => {
    const f = setup({}, [
      { type: 'workflow_run.created', workflow_run_id: 'run' },
      {
        type: 'workflow_run.status_ended',
        workflow_run_id: 'run',
        result: {
          type: 'error',
          error: { type: 'timeout_error', message: 'The run exceeded its lifetime.' },
        },
      },
      message('partial'),
      idle(),
    ]);
    expect((await f.provider.callApi('test')).error).toContain(
      'workflow run ended with error (timeout_error: The run exceeded its lifetime.)',
    );
  });

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

  it('does not return progress written before a workflow ended as the answer', async () => {
    const f = setup({}, [
      { type: 'workflow_run.created', workflow_run_id: 'run' },
      message('I started the workflow and will report back.'),
      {
        type: 'workflow_run.status_ended',
        workflow_run_id: 'run',
        result: { type: 'completed' },
      },
      idle(),
    ]);
    const result = await f.provider.callApi('test');
    expect(result.error).toContain('without a text response');
    expect(result.output).toBeUndefined();
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

  it('validates the configuration again once its templates are rendered', async () => {
    const f = setup({
      config: {
        apiKey: 'key',
        agent: { name: 'QA', model: 'claude-sonnet-5' },
        environment: { name: 'QA', config: { type: '{{environmentType}}' as 'cloud' } },
      },
    });
    const result = await f.provider.callApi('test', {
      vars: { environmentType: 'self_hosted' },
      prompt: { raw: 'test', label: 'test' },
    });
    expect(result.error).toContain('requires a cloud environment');
    // Nothing is allocated for a configuration the provider cannot run.
    expect(f.agentCreate).not.toHaveBeenCalled();
    expect(f.environmentCreate).not.toHaveBeenCalled();
    expect(f.create).not.toHaveBeenCalled();
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
