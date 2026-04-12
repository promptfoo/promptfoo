import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAICodexAppServerProvider } from '../../src/providers/openai/codex-app-server';
import { providerRegistry } from '../../src/providers/providerRegistry';

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    spawn: mocks.spawn,
  };
});

interface MockAppServer {
  proc: any;
  stdout: PassThrough;
  stderr: PassThrough;
  writes: string[];
  send: (message: unknown) => void;
  messages: () => any[];
}

function createMockAppServer(): MockAppServer {
  const proc = new EventEmitter() as any;
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const stdin = new PassThrough();
  const writes: string[] = [];

  proc.stdin = stdin;
  proc.stdout = stdout;
  proc.stderr = stderr;
  proc.killed = false;
  proc.exitCode = null;
  proc.kill = vi.fn((signal?: NodeJS.Signals) => {
    proc.killed = true;
    proc.exitCode = 0;
    proc.emit('exit', 0, signal ?? null);
    return true;
  });

  stdin.write = vi.fn((chunk: any) => {
    writes.push(String(chunk));
    return true;
  }) as any;
  stdin.end = vi.fn(() => stdin) as any;

  return {
    proc,
    stdout,
    stderr,
    writes,
    send: (message: unknown) => {
      stdout.write(`${JSON.stringify(message)}\n`);
    },
    messages: () =>
      writes
        .join('')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
  };
}

async function waitForMessage(
  server: MockAppServer,
  predicate: (message: any) => boolean,
): Promise<any> {
  let found: any;
  await vi.waitFor(() => {
    found = server.messages().find(predicate);
    expect(found).toBeTruthy();
  });
  return found;
}

async function flushMicrotasks(): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    await Promise.resolve();
  }
}

async function waitForMessageWithoutTimers(
  server: MockAppServer,
  predicate: (message: any) => boolean,
): Promise<any> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const found = server.messages().find(predicate);
    if (found) {
      return found;
    }
    await flushMicrotasks();
  }
  throw new Error('Timed out waiting for mock app-server message');
}

describe('OpenAICodexAppServerProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.spawn.mockReset();
  });

  afterEach(async () => {
    await providerRegistry.shutdownAll();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('initializes with safe defaults and validates config strictly', () => {
    const provider = new OpenAICodexAppServerProvider();

    expect(provider.id()).toBe('openai:codex-app-server');
    expect(provider.requiresApiKey()).toBe(false);
    expect(provider.toString()).toBe('[OpenAI Codex App Server Provider]');

    expect(
      () =>
        new OpenAICodexAppServerProvider({
          config: {
            sandbox_mode: 'readonly',
          } as any,
        }),
    ).toThrow(/Invalid OpenAI Codex app-server config: sandbox_mode/);

    expect(
      () =>
        new OpenAICodexAppServerProvider({
          config: {
            sandboxMode: 'read-only',
          } as any,
        }),
    ).toThrow(/Invalid OpenAI Codex app-server config: \(root\)/);

    expect(
      () =>
        new OpenAICodexAppServerProvider({
          config: {
            service_tier: 'fast',
            model_reasoning_effort: 'none',
            personality: 'pragmatic',
            approval_policy: {
              granular: {
                sandbox_approval: false,
                rules: false,
                skill_approval: false,
                request_permissions: false,
                mcp_elicitations: false,
              },
            },
            collaboration_mode: {
              mode: 'plan',
              settings: {
                model: 'gpt-5.4',
                reasoning_effort: 'none',
                developer_instructions: null,
              },
            },
          },
        }),
    ).not.toThrow();

    expect(
      () =>
        new OpenAICodexAppServerProvider({
          config: {
            service_tier: 'auto',
          } as any,
        }),
    ).toThrow(/Invalid OpenAI Codex app-server config: service_tier/);

    expect(
      () =>
        new OpenAICodexAppServerProvider({
          config: {
            personality: 'chatgpt',
          } as any,
        }),
    ).toThrow(/Invalid OpenAI Codex app-server config: personality/);
  });

  it('runs a complete stdio app-server turn and normalizes the response', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        apiKey: 'test-api-key',
        codex_path_override: '/usr/local/bin/codex',
        model: 'gpt-5.4',
        service_tier: 'fast',
        model_reasoning_effort: 'none',
        reasoning_summary: 'detailed',
        personality: 'friendly',
        base_instructions: 'You are evaluating repository quality.',
        developer_instructions: 'Return concise, actionable output.',
        collaboration_mode: {
          mode: 'plan',
          settings: {
            model: 'gpt-5.4',
            reasoning_effort: 'none',
            developer_instructions: null,
          },
        },
        thread_cleanup: 'none',
      },
    });

    const resultPromise = provider.callApi('Summarize this repo');

    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    expect(initialize.params.clientInfo.name).toBe('promptfoo_codex_app_server');
    expect(initialize.params.capabilities.experimentalApi).toBe(true);
    server.send({ id: initialize.id, result: { userAgent: 'codex-test' } });

    await waitForMessage(server, (message) => message.method === 'initialized');
    const threadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );
    expect(threadStart.params).toMatchObject({
      approvalPolicy: 'never',
      sandbox: 'read-only',
      ephemeral: true,
      model: 'gpt-5.4',
      serviceTier: 'fast',
      baseInstructions: 'You are evaluating repository quality.',
      developerInstructions: 'Return concise, actionable output.',
      personality: 'friendly',
    });
    server.send({
      id: threadStart.id,
      result: {
        thread: {
          id: 'thr_test',
          cwd: process.cwd(),
          modelProvider: 'openai',
        },
      },
    });

    const turnStart = await waitForMessage(server, (message) => message.method === 'turn/start');
    expect(turnStart.params).toMatchObject({
      threadId: 'thr_test',
      input: [{ type: 'text', text: 'Summarize this repo', text_elements: [] }],
      approvalPolicy: 'never',
      model: 'gpt-5.4',
      serviceTier: 'fast',
      effort: 'none',
      summary: 'detailed',
      personality: 'friendly',
      collaborationMode: {
        mode: 'plan',
        settings: {
          model: 'gpt-5.4',
          reasoning_effort: 'none',
          developer_instructions: null,
        },
      },
    });
    server.send({ id: turnStart.id, result: { turn: { id: 'turn_test', status: 'inProgress' } } });

    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_test',
        turnId: 'turn_test',
        itemId: 'item_msg',
        delta: 'Final ',
      },
    });
    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_test',
        turnId: 'turn_test',
        itemId: 'item_msg',
        delta: 'response',
      },
    });
    server.send({
      method: 'thread/tokenUsage/updated',
      params: {
        threadId: 'thr_test',
        turnId: 'turn_test',
        tokenUsage: {
          last: {
            inputTokens: 10,
            cachedInputTokens: 2,
            outputTokens: 5,
            totalTokens: 15,
            reasoningOutputTokens: 0,
          },
        },
      },
    });
    server.send({
      method: 'item/completed',
      params: {
        threadId: 'thr_test',
        turnId: 'turn_test',
        item: {
          type: 'agentMessage',
          id: 'item_msg',
          text: 'Final response',
          phase: null,
          memoryCitation: null,
        },
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_test',
        turn: { id: 'turn_test', status: 'completed', items: [], error: null },
      },
    });

    const result = await resultPromise;

    expect(result.output).toBe('Final response');
    expect(result.sessionId).toBe('thr_test');
    expect(result.tokenUsage).toEqual({
      prompt: 10,
      completion: 5,
      total: 15,
      cached: 2,
    });
    expect(result.cost).toBeCloseTo(0.000095);
    expect(result.metadata?.codexAppServer).toMatchObject({
      threadId: 'thr_test',
      turnId: 'turn_test',
      model: 'gpt-5.4',
      sandboxMode: 'read-only',
      approvalPolicy: 'never',
      itemCounts: { agentMessage: 1 },
      notificationCount: 5,
    });
    expect(JSON.parse(result.raw as string)).toMatchObject({
      output: 'Final response',
      tokenUsage: {
        last: {
          inputTokens: 10,
          cachedInputTokens: 2,
          outputTokens: 5,
        },
      },
    });
    expect(mocks.spawn).toHaveBeenCalledWith(
      '/usr/local/bin/codex',
      ['app-server', '--listen', 'stdio://'],
      expect.objectContaining({
        env: expect.objectContaining({
          OPENAI_API_KEY: 'test-api-key',
          CODEX_API_KEY: 'test-api-key',
        }),
        stdio: ['pipe', 'pipe', 'pipe'],
      }),
    );
  });

  it('uses the last completed agent message as the final output', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        thread_cleanup: 'none',
      },
    });

    const resultPromise = provider.callApi('Return structured output');

    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const threadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );
    server.send({ id: threadStart.id, result: { thread: { id: 'thr_multi_message' } } });
    const turnStart = await waitForMessage(server, (message) => message.method === 'turn/start');
    server.send({
      id: turnStart.id,
      result: { turn: { id: 'turn_multi_message', status: 'inProgress' } },
    });

    server.send({
      method: 'item/completed',
      params: {
        threadId: 'thr_multi_message',
        turnId: 'turn_multi_message',
        item: {
          type: 'agentMessage',
          id: 'msg_progress',
          text: '{"comments":[],"summary":"Inspecting diff."}',
          phase: null,
          memoryCitation: null,
        },
      },
    });
    server.send({
      method: 'item/completed',
      params: {
        threadId: 'thr_multi_message',
        turnId: 'turn_multi_message',
        item: {
          type: 'agentMessage',
          id: 'msg_final',
          text: '{"comments":[],"summary":"No actionable findings."}',
          phase: null,
          memoryCitation: null,
        },
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_multi_message',
        turn: { id: 'turn_multi_message', status: 'completed', items: [], error: null },
      },
    });

    const result = await resultPromise;
    expect(result.output).toBe('{"comments":[],"summary":"No actionable findings."}');
  });

  it('responds deterministically to server approval requests and records metadata', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        thread_cleanup: 'none',
        skip_git_repo_check: true,
        server_request_policy: {
          command_execution: 'decline',
        },
      },
    });

    const resultPromise = provider.callApi('Try a command');

    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const threadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );
    server.send({ id: threadStart.id, result: { thread: { id: 'thr_approval' } } });
    const turnStart = await waitForMessage(server, (message) => message.method === 'turn/start');
    server.send({
      id: turnStart.id,
      result: { turn: { id: 'turn_approval', status: 'inProgress' } },
    });

    server.send({
      id: 99,
      method: 'item/commandExecution/requestApproval',
      params: {
        threadId: 'thr_approval',
        turnId: 'turn_approval',
        itemId: 'cmd_1',
        command: 'cat .env',
        cwd: process.cwd(),
      },
    });

    const approvalResponse = await waitForMessage(
      server,
      (message) => message.id === 99 && message.result,
    );
    expect(approvalResponse.result).toEqual({ decision: 'decline' });

    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_approval',
        turnId: 'turn_approval',
        itemId: 'msg_1',
        delta: 'Declined',
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_approval',
        turn: { id: 'turn_approval', status: 'completed', items: [], error: null },
      },
    });

    const result = await resultPromise;
    expect(result.output).toBe('Declined');
    expect(result.metadata?.codexAppServer.serverRequests).toEqual([
      {
        id: 99,
        method: 'item/commandExecution/requestApproval',
        params: expect.objectContaining({
          command: 'cat .env',
          itemId: 'cmd_1',
        }),
        response: { decision: 'decline' },
      },
    ]);
  });

  it('maps legacy approval requests by conversation id and legacy decision names', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        thread_cleanup: 'none',
        server_request_policy: {
          command_execution: 'acceptForSession',
          file_change: 'cancel',
        },
      },
    });

    const resultPromise = provider.callApi('Exercise legacy approval callbacks');

    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const threadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );
    server.send({ id: threadStart.id, result: { thread: { id: 'thr_legacy' } } });
    const turnStart = await waitForMessage(server, (message) => message.method === 'turn/start');
    server.send({
      id: turnStart.id,
      result: { turn: { id: 'turn_legacy', status: 'inProgress' } },
    });

    server.send({
      id: 401,
      method: 'execCommandApproval',
      params: {
        conversationId: 'thr_legacy',
        callId: 'legacy_cmd',
        command: ['npm', 'test'],
        cwd: process.cwd(),
      },
    });
    const commandApproval = await waitForMessage(
      server,
      (message) => message.id === 401 && message.result,
    );
    expect(commandApproval.result).toEqual({ decision: 'approved_for_session' });

    server.send({
      id: 402,
      method: 'applyPatchApproval',
      params: {
        conversationId: 'thr_legacy',
        callId: 'legacy_patch',
        changes: { files: ['src/index.ts'] },
      },
    });
    const patchApproval = await waitForMessage(
      server,
      (message) => message.id === 402 && message.result,
    );
    expect(patchApproval.result).toEqual({ decision: 'abort' });

    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_legacy',
        turnId: 'turn_legacy',
        itemId: 'msg_legacy',
        delta: 'Legacy handled',
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_legacy',
        turn: { id: 'turn_legacy', status: 'completed', items: [], error: null },
      },
    });

    const result = await resultPromise;
    expect(result.output).toBe('Legacy handled');
    expect(result.metadata?.codexAppServer.serverRequests).toEqual([
      expect.objectContaining({
        id: 401,
        method: 'execCommandApproval',
        response: { decision: 'approved_for_session' },
      }),
      expect.objectContaining({
        id: 402,
        method: 'applyPatchApproval',
        response: { decision: 'abort' },
      }),
    ]);
  });

  it('passes advanced approval, permission, and elicitation policy payloads', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const granularApprovalPolicy = {
      granular: {
        sandbox_approval: true,
        rules: true,
        skill_approval: false,
        request_permissions: true,
        mcp_elicitations: true,
      },
    };
    const commandDecision = {
      applyNetworkPolicyAmendment: {
        network_policy_amendment: {
          host: 'registry.npmjs.org',
          action: 'allow' as const,
        },
      },
    };
    const permissionGrant = {
      network: { enabled: true },
      fileSystem: {
        read: ['/tmp/promptfoo-fixture'],
        write: null,
      },
    };
    const elicitationResponse = {
      action: 'accept' as const,
      content: { project: 'promptfoo', severity: 'low' },
      _meta: { source: 'promptfoo-test' },
    };

    const provider = new OpenAICodexAppServerProvider({
      config: {
        approval_policy: granularApprovalPolicy,
        thread_cleanup: 'none',
        server_request_policy: {
          command_execution: commandDecision,
          permissions: {
            permissions: permissionGrant,
            scope: 'session',
          },
          mcp_elicitation: elicitationResponse,
        },
      },
    });

    const resultPromise = provider.callApi('Exercise advanced server request policies');

    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const threadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );
    expect(threadStart.params.approvalPolicy).toEqual(granularApprovalPolicy);
    server.send({ id: threadStart.id, result: { thread: { id: 'thr_advanced_policy' } } });
    const turnStart = await waitForMessage(server, (message) => message.method === 'turn/start');
    expect(turnStart.params.approvalPolicy).toEqual(granularApprovalPolicy);
    server.send({
      id: turnStart.id,
      result: { turn: { id: 'turn_advanced_policy', status: 'inProgress' } },
    });

    server.send({
      id: 501,
      method: 'item/commandExecution/requestApproval',
      params: {
        threadId: 'thr_advanced_policy',
        turnId: 'turn_advanced_policy',
        itemId: 'cmd_advanced_policy',
        command: 'npm view promptfoo version',
      },
    });
    const commandApproval = await waitForMessage(
      server,
      (message) => message.id === 501 && message.result,
    );
    expect(commandApproval.result).toEqual({ decision: commandDecision });

    server.send({
      id: 502,
      method: 'item/permissions/requestApproval',
      params: {
        threadId: 'thr_advanced_policy',
        turnId: 'turn_advanced_policy',
        itemId: 'perm_advanced_policy',
        reason: 'Needs fixture access',
        permissions: {
          network: { enabled: true },
          fileSystem: { read: ['/tmp/promptfoo-fixture'], write: null },
        },
      },
    });
    const permissionsApproval = await waitForMessage(
      server,
      (message) => message.id === 502 && message.result,
    );
    expect(permissionsApproval.result).toEqual({
      permissions: permissionGrant,
      scope: 'session',
    });

    server.send({
      id: 503,
      method: 'mcpServer/elicitation/request',
      params: {
        threadId: 'thr_advanced_policy',
        turnId: 'turn_advanced_policy',
        serverName: 'forms',
        mode: 'form',
        _meta: null,
        message: 'Provide project metadata',
        requestedSchema: {
          type: 'object',
          properties: {
            project: { type: 'string' },
          },
        },
      },
    });
    const elicitation = await waitForMessage(
      server,
      (message) => message.id === 503 && message.result,
    );
    expect(elicitation.result).toEqual(elicitationResponse);

    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_advanced_policy',
        turnId: 'turn_advanced_policy',
        itemId: 'msg_advanced_policy',
        delta: 'Advanced handled',
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_advanced_policy',
        turn: { id: 'turn_advanced_policy', status: 'completed', items: [], error: null },
      },
    });

    const result = await resultPromise;
    expect(result.output).toBe('Advanced handled');
    expect(result.metadata?.codexAppServer.serverRequests).toEqual([
      expect.objectContaining({
        id: 501,
        method: 'item/commandExecution/requestApproval',
        response: { decision: commandDecision },
      }),
      expect.objectContaining({
        id: 502,
        method: 'item/permissions/requestApproval',
        response: { permissions: permissionGrant, scope: 'session' },
      }),
      expect.objectContaining({
        id: 503,
        method: 'mcpServer/elicitation/request',
        response: elicitationResponse,
      }),
    ]);
  });

  it('uses thread/resume and normalizes structured prompt input items', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        thread_id: 'thr_existing',
        service_tier: 'flex',
        persist_threads: true,
        thread_cleanup: 'none',
      },
    });

    const prompt = JSON.stringify([
      { type: 'text', text: 'Review this screenshot' },
      { type: 'local_image', path: '/tmp/screenshot.png' },
      { type: 'skill', name: 'skill-creator', path: '/tmp/skill-creator/SKILL.md' },
    ]);
    const resultPromise = provider.callApi(prompt);

    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });

    const threadResume = await waitForMessage(
      server,
      (message) => message.method === 'thread/resume',
    );
    expect(threadResume.params).toMatchObject({
      threadId: 'thr_existing',
      approvalPolicy: 'never',
      sandbox: 'read-only',
      serviceTier: 'flex',
    });
    server.send({ id: threadResume.id, result: { thread: { id: 'thr_existing' } } });

    const turnStart = await waitForMessage(server, (message) => message.method === 'turn/start');
    expect(turnStart.params.serviceTier).toBe('flex');
    expect(turnStart.params.input).toEqual([
      { type: 'text', text: 'Review this screenshot', text_elements: [] },
      { type: 'localImage', path: '/tmp/screenshot.png' },
      { type: 'skill', name: 'skill-creator', path: '/tmp/skill-creator/SKILL.md' },
    ]);
    server.send({
      id: turnStart.id,
      result: { turn: { id: 'turn_existing', status: 'inProgress' } },
    });
    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_existing',
        turnId: 'turn_existing',
        itemId: 'msg_existing',
        delta: 'Reviewed',
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_existing',
        turn: { id: 'turn_existing', status: 'completed', items: [], error: null },
      },
    });

    const result = await resultPromise;
    expect(result.output).toBe('Reviewed');
    expect(server.messages().some((message) => message.method === 'thread/unsubscribe')).toBe(
      false,
    );
  });

  it('unsubscribes a non-persistent resumed thread by default', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        thread_id: 'thr_existing_unsubscribe',
      },
    });

    const resultPromise = provider.callApi('Resume and release this thread');
    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const threadResume = await waitForMessage(
      server,
      (message) => message.method === 'thread/resume',
    );
    server.send({
      id: threadResume.id,
      result: { thread: { id: 'thr_existing_unsubscribe' } },
    });
    const turnStart = await waitForMessage(server, (message) => message.method === 'turn/start');
    server.send({
      id: turnStart.id,
      result: { turn: { id: 'turn_existing_unsubscribe', status: 'inProgress' } },
    });
    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_existing_unsubscribe',
        turnId: 'turn_existing_unsubscribe',
        itemId: 'msg_existing_unsubscribe',
        delta: 'Released',
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_existing_unsubscribe',
        turn: { id: 'turn_existing_unsubscribe', status: 'completed', items: [], error: null },
      },
    });
    const unsubscribe = await waitForMessage(
      server,
      (message) =>
        message.method === 'thread/unsubscribe' &&
        message.params?.threadId === 'thr_existing_unsubscribe',
    );
    server.send({ id: unsubscribe.id, result: { status: 'unsubscribed' } });

    await expect(resultPromise).resolves.toMatchObject({ output: 'Released' });
  });

  it('defers resumed thread unsubscribe while another turn is queued for the same thread id', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        thread_id: 'thr_existing_queue',
      },
    });

    const firstResultPromise = provider.callApi('Shared thread first');
    const secondResultPromise = provider.callApi('Shared thread second');

    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const firstThreadResume = await waitForMessage(
      server,
      (message) => message.method === 'thread/resume',
    );
    const secondThreadResume = await waitForMessage(
      server,
      (message) => message.method === 'thread/resume' && message.id !== firstThreadResume.id,
    );
    server.send({ id: firstThreadResume.id, result: { thread: { id: 'thr_existing_queue' } } });
    server.send({ id: secondThreadResume.id, result: { thread: { id: 'thr_existing_queue' } } });

    const firstTurnStart = await waitForMessage(
      server,
      (message) => message.method === 'turn/start',
    );
    server.send({
      id: firstTurnStart.id,
      result: { turn: { id: 'turn_existing_queue_1', status: 'inProgress' } },
    });
    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_existing_queue',
        turnId: 'turn_existing_queue_1',
        itemId: 'msg_existing_queue_1',
        delta: 'Queued first',
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_existing_queue',
        turn: { id: 'turn_existing_queue_1', status: 'completed', items: [], error: null },
      },
    });
    const secondTurnStart = await waitForMessage(
      server,
      (message) => message.method === 'turn/start' && message.id !== firstTurnStart.id,
    );
    const secondTurnStartIndex = server
      .messages()
      .findIndex((message) => message.method === 'turn/start' && message.id === secondTurnStart.id);
    expect(
      server
        .messages()
        .slice(0, secondTurnStartIndex)
        .some((message) => message.method === 'thread/unsubscribe'),
    ).toBe(false);
    server.send({
      id: secondTurnStart.id,
      result: { turn: { id: 'turn_existing_queue_2', status: 'inProgress' } },
    });
    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_existing_queue',
        turnId: 'turn_existing_queue_2',
        itemId: 'msg_existing_queue_2',
        delta: 'Queued second',
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_existing_queue',
        turn: { id: 'turn_existing_queue_2', status: 'completed', items: [], error: null },
      },
    });
    const unsubscribe = await waitForMessage(
      server,
      (message) =>
        message.method === 'thread/unsubscribe' &&
        message.params?.threadId === 'thr_existing_queue',
    );
    server.send({ id: unsubscribe.id, result: { status: 'unsubscribed' } });

    await expect(firstResultPromise).resolves.toMatchObject({ output: 'Queued first' });
    await expect(secondResultPromise).resolves.toMatchObject({ output: 'Queued second' });
  });

  it('cleans up a resumed thread when a queued turn aborts before it starts', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);
    const abortController = new AbortController();

    const provider = new OpenAICodexAppServerProvider({
      config: {
        thread_id: 'thr_existing_abort_queue',
      },
    });
    const originalCleanupThreadAfterTurn = (provider as any).cleanupThreadAfterTurn.bind(provider);
    let cleanupAttemptCount = 0;
    vi.spyOn(provider as any, 'cleanupThreadAfterTurn').mockImplementation(
      async (...args: any[]) => {
        const result = await originalCleanupThreadAfterTurn(...args);
        cleanupAttemptCount += 1;
        if (cleanupAttemptCount === 1) {
          abortController.abort();
        }
        return result;
      },
    );

    const firstResultPromise = provider.callApi('Shared thread first');
    const secondResultPromise = provider.callApi('Shared thread second', undefined, {
      abortSignal: abortController.signal,
    } as any);

    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const firstThreadResume = await waitForMessage(
      server,
      (message) => message.method === 'thread/resume',
    );
    const secondThreadResume = await waitForMessage(
      server,
      (message) => message.method === 'thread/resume' && message.id !== firstThreadResume.id,
    );
    server.send({
      id: firstThreadResume.id,
      result: { thread: { id: 'thr_existing_abort_queue' } },
    });
    server.send({
      id: secondThreadResume.id,
      result: { thread: { id: 'thr_existing_abort_queue' } },
    });

    const firstTurnStart = await waitForMessage(
      server,
      (message) => message.method === 'turn/start',
    );
    server.send({
      id: firstTurnStart.id,
      result: { turn: { id: 'turn_existing_abort_queue_1', status: 'inProgress' } },
    });
    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_existing_abort_queue',
        turnId: 'turn_existing_abort_queue_1',
        itemId: 'msg_existing_abort_queue_1',
        delta: 'Queued cleanup first',
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_existing_abort_queue',
        turn: { id: 'turn_existing_abort_queue_1', status: 'completed', items: [], error: null },
      },
    });

    const unsubscribe = await waitForMessage(
      server,
      (message) =>
        message.method === 'thread/unsubscribe' &&
        message.params?.threadId === 'thr_existing_abort_queue',
    );
    server.send({ id: unsubscribe.id, result: { status: 'unsubscribed' } });

    await expect(firstResultPromise).resolves.toMatchObject({ output: 'Queued cleanup first' });
    await expect(secondResultPromise).resolves.toEqual({
      error: 'OpenAI Codex app-server call aborted',
    });
    expect(
      server
        .messages()
        .filter(
          (message) =>
            message.method === 'thread/unsubscribe' &&
            message.params?.threadId === 'thr_existing_abort_queue',
        ),
    ).toHaveLength(1);
  });

  it('serializes deep-tracing turns that resume the same thread id', async () => {
    const firstServer = createMockAppServer();
    const secondServer = createMockAppServer();
    mocks.spawn.mockReturnValueOnce(firstServer.proc).mockReturnValueOnce(secondServer.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        deep_tracing: true,
        thread_id: 'thr_existing_deep',
        thread_cleanup: 'none',
      },
    });

    const firstResultPromise = provider.callApi('Deep tracing shared first');
    const secondResultPromise = provider.callApi('Deep tracing shared second');

    const firstInitialize = await waitForMessage(
      firstServer,
      (message) => message.method === 'initialize',
    );
    const secondInitialize = await waitForMessage(
      secondServer,
      (message) => message.method === 'initialize',
    );
    firstServer.send({ id: firstInitialize.id, result: {} });
    secondServer.send({ id: secondInitialize.id, result: {} });

    const firstThreadResume = await waitForMessage(
      firstServer,
      (message) => message.method === 'thread/resume',
    );
    firstServer.send({
      id: firstThreadResume.id,
      result: { thread: { id: 'thr_existing_deep' } },
    });
    const firstTurnStart = await waitForMessage(
      firstServer,
      (message) => message.method === 'turn/start',
    );
    firstServer.send({
      id: firstTurnStart.id,
      result: { turn: { id: 'turn_existing_deep_1', status: 'inProgress' } },
    });

    const secondThreadResume = await waitForMessage(
      secondServer,
      (message) => message.method === 'thread/resume',
    );
    secondServer.send({
      id: secondThreadResume.id,
      result: { thread: { id: 'thr_existing_deep' } },
    });
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(secondServer.messages().some((message) => message.method === 'turn/start')).toBe(false);

    firstServer.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_existing_deep',
        turnId: 'turn_existing_deep_1',
        itemId: 'msg_existing_deep_1',
        delta: 'Deep first',
      },
    });
    firstServer.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_existing_deep',
        turn: { id: 'turn_existing_deep_1', status: 'completed', items: [], error: null },
      },
    });

    const secondTurnStart = await waitForMessage(
      secondServer,
      (message) => message.method === 'turn/start',
    );
    secondServer.send({
      id: secondTurnStart.id,
      result: { turn: { id: 'turn_existing_deep_2', status: 'inProgress' } },
    });
    secondServer.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_existing_deep',
        turnId: 'turn_existing_deep_2',
        itemId: 'msg_existing_deep_2',
        delta: 'Deep second',
      },
    });
    secondServer.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_existing_deep',
        turn: { id: 'turn_existing_deep_2', status: 'completed', items: [], error: null },
      },
    });

    await expect(firstResultPromise).resolves.toMatchObject({ output: 'Deep first' });
    await expect(secondResultPromise).resolves.toMatchObject({ output: 'Deep second' });
  });

  it('ignores late notifications from completed turn ids on shared threads', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        thread_id: 'thr_late_events',
        thread_cleanup: 'none',
      },
    });

    const firstResultPromise = provider.callApi('Late event first');
    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const firstThreadResume = await waitForMessage(
      server,
      (message) => message.method === 'thread/resume',
    );
    server.send({ id: firstThreadResume.id, result: { thread: { id: 'thr_late_events' } } });
    const firstTurnStart = await waitForMessage(
      server,
      (message) => message.method === 'turn/start',
    );
    server.send({
      id: firstTurnStart.id,
      result: { turn: { id: 'turn_late_events_1', status: 'inProgress' } },
    });
    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_late_events',
        turnId: 'turn_late_events_1',
        itemId: 'msg_late_events_1',
        delta: 'First',
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_late_events',
        turn: { id: 'turn_late_events_1', status: 'completed', items: [], error: null },
      },
    });
    await expect(firstResultPromise).resolves.toMatchObject({ output: 'First' });

    const secondResultPromise = provider.callApi('Late event second');
    const secondThreadResume = await waitForMessage(
      server,
      (message) => message.method === 'thread/resume' && message.id !== firstThreadResume.id,
    );
    server.send({ id: secondThreadResume.id, result: { thread: { id: 'thr_late_events' } } });
    const secondTurnStart = await waitForMessage(
      server,
      (message) => message.method === 'turn/start' && message.id !== firstTurnStart.id,
    );
    server.send({
      id: secondTurnStart.id,
      result: { turn: { id: 'turn_late_events_2', status: 'inProgress' } },
    });
    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_late_events',
        turnId: 'turn_late_events_1',
        itemId: 'msg_late_events_1',
        delta: 'Late old event',
      },
    });
    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_late_events',
        turnId: 'turn_late_events_2',
        itemId: 'msg_late_events_2',
        delta: 'Second',
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_late_events',
        turn: { id: 'turn_late_events_2', status: 'completed', items: [], error: null },
      },
    });

    await expect(secondResultPromise).resolves.toMatchObject({ output: 'Second' });
  });

  it('unsubscribes non-persistent threads by default', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider();
    const resultPromise = provider.callApi('Hello');

    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const threadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );
    server.send({ id: threadStart.id, result: { thread: { id: 'thr_unsubscribe' } } });
    const turnStart = await waitForMessage(server, (message) => message.method === 'turn/start');
    server.send({
      id: turnStart.id,
      result: { turn: { id: 'turn_unsubscribe', status: 'inProgress' } },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_unsubscribe',
        turn: { id: 'turn_unsubscribe', status: 'completed', items: [], error: null },
      },
    });

    const unsubscribe = await waitForMessage(
      server,
      (message) => message.method === 'thread/unsubscribe',
    );
    expect(unsubscribe.params).toEqual({ threadId: 'thr_unsubscribe' });
    server.send({ id: unsubscribe.id, result: { status: 'unsubscribed' } });

    const result = await resultPromise;
    expect(result.sessionId).toBe('thr_unsubscribe');
  });

  it('unsubscribes evicted persistent threads when the thread pool is full', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        persist_threads: true,
        thread_pool_size: 1,
        thread_cleanup: 'none',
      },
    });

    const firstResultPromise = provider.callApi('First cached prompt');

    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const firstThreadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );
    server.send({ id: firstThreadStart.id, result: { thread: { id: 'thr_pool_1' } } });
    const firstTurnStart = await waitForMessage(
      server,
      (message) => message.method === 'turn/start',
    );
    server.send({
      id: firstTurnStart.id,
      result: { turn: { id: 'turn_pool_1', status: 'inProgress' } },
    });
    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_pool_1',
        turnId: 'turn_pool_1',
        itemId: 'msg_pool_1',
        delta: 'First cached',
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_pool_1',
        turn: { id: 'turn_pool_1', status: 'completed', items: [], error: null },
      },
    });
    await expect(firstResultPromise).resolves.toMatchObject({ output: 'First cached' });

    const secondResultPromise = provider.callApi('Second cached prompt');
    const unsubscribe = await waitForMessage(
      server,
      (message) =>
        message.method === 'thread/unsubscribe' && message.params?.threadId === 'thr_pool_1',
    );
    server.send({ id: unsubscribe.id, result: { status: 'unsubscribed' } });

    const secondThreadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start' && message.id !== firstThreadStart.id,
    );
    server.send({ id: secondThreadStart.id, result: { thread: { id: 'thr_pool_2' } } });
    const secondTurnStart = await waitForMessage(
      server,
      (message) => message.method === 'turn/start' && message.id !== firstTurnStart.id,
    );
    server.send({
      id: secondTurnStart.id,
      result: { turn: { id: 'turn_pool_2', status: 'inProgress' } },
    });
    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_pool_2',
        turnId: 'turn_pool_2',
        itemId: 'msg_pool_2',
        delta: 'Second cached',
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_pool_2',
        turn: { id: 'turn_pool_2', status: 'completed', items: [], error: null },
      },
    });

    await expect(secondResultPromise).resolves.toMatchObject({ output: 'Second cached' });
  });

  it('drops cached persistent threads when a reused app-server process exits', async () => {
    const firstServer = createMockAppServer();
    const secondServer = createMockAppServer();
    mocks.spawn.mockReturnValueOnce(firstServer.proc).mockReturnValueOnce(secondServer.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        persist_threads: true,
        thread_cleanup: 'none',
      },
    });

    const firstResultPromise = provider.callApi('Reusable cached prompt');
    const firstInitialize = await waitForMessage(
      firstServer,
      (message) => message.method === 'initialize',
    );
    firstServer.send({ id: firstInitialize.id, result: {} });
    const firstThreadStart = await waitForMessage(
      firstServer,
      (message) => message.method === 'thread/start',
    );
    firstServer.send({ id: firstThreadStart.id, result: { thread: { id: 'thr_stale_1' } } });
    const firstTurnStart = await waitForMessage(
      firstServer,
      (message) => message.method === 'turn/start',
    );
    firstServer.send({
      id: firstTurnStart.id,
      result: { turn: { id: 'turn_stale_1', status: 'inProgress' } },
    });
    firstServer.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_stale_1',
        turnId: 'turn_stale_1',
        itemId: 'msg_stale_1',
        delta: 'First reusable',
      },
    });
    firstServer.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_stale_1',
        turn: { id: 'turn_stale_1', status: 'completed', items: [], error: null },
      },
    });
    await expect(firstResultPromise).resolves.toMatchObject({ output: 'First reusable' });

    firstServer.proc.emit('exit', 0, null);

    const secondResultPromise = provider.callApi('Reusable cached prompt');
    const secondInitialize = await waitForMessage(
      secondServer,
      (message) => message.method === 'initialize',
    );
    secondServer.send({ id: secondInitialize.id, result: {} });
    const secondThreadStart = await waitForMessage(
      secondServer,
      (message) => message.method === 'thread/start',
    );
    expect(secondThreadStart.params).toMatchObject({ ephemeral: true });
    secondServer.send({ id: secondThreadStart.id, result: { thread: { id: 'thr_stale_2' } } });
    const secondTurnStart = await waitForMessage(
      secondServer,
      (message) => message.method === 'turn/start',
    );
    expect(secondTurnStart.params.threadId).toBe('thr_stale_2');
    secondServer.send({
      id: secondTurnStart.id,
      result: { turn: { id: 'turn_stale_2', status: 'inProgress' } },
    });
    secondServer.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_stale_2',
        turnId: 'turn_stale_2',
        itemId: 'msg_stale_2',
        delta: 'Second reusable',
      },
    });
    secondServer.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_stale_2',
        turn: { id: 'turn_stale_2', status: 'completed', items: [], error: null },
      },
    });

    await expect(secondResultPromise).resolves.toMatchObject({ output: 'Second reusable' });
    expect(mocks.spawn).toHaveBeenCalledTimes(2);
  });

  it('purges pending persistent thread promises when a reused app-server process exits', async () => {
    const firstServer = createMockAppServer();
    const secondServer = createMockAppServer();
    mocks.spawn.mockReturnValueOnce(firstServer.proc).mockReturnValueOnce(secondServer.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        persist_threads: true,
        thread_cleanup: 'none',
      },
    });

    const firstResultPromise = provider.callApi('Pending persistent thread');
    const firstInitialize = await waitForMessage(
      firstServer,
      (message) => message.method === 'initialize',
    );
    firstServer.send({ id: firstInitialize.id, result: {} });
    await waitForMessage(firstServer, (message) => message.method === 'thread/start');
    expect((provider as any).threadPromises.size).toBe(1);

    firstServer.proc.exitCode = 1;
    firstServer.proc.emit('exit', 1, null);
    expect((provider as any).threadPromises.size).toBe(0);

    const secondResultPromise = provider.callApi('Pending persistent thread');
    await expect(firstResultPromise).resolves.toEqual({
      error:
        'Error calling OpenAI Codex app-server: codex app-server exited with code 1 signal null',
    });

    const secondInitialize = await waitForMessage(
      secondServer,
      (message) => message.method === 'initialize',
    );
    secondServer.send({ id: secondInitialize.id, result: {} });
    const secondThreadStart = await waitForMessage(
      secondServer,
      (message) => message.method === 'thread/start',
    );
    secondServer.send({
      id: secondThreadStart.id,
      result: { thread: { id: 'thr_pending_recovered' } },
    });
    const secondTurnStart = await waitForMessage(
      secondServer,
      (message) => message.method === 'turn/start',
    );
    secondServer.send({
      id: secondTurnStart.id,
      result: { turn: { id: 'turn_pending_recovered', status: 'inProgress' } },
    });
    secondServer.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_pending_recovered',
        turnId: 'turn_pending_recovered',
        itemId: 'msg_pending_recovered',
        delta: 'Recovered persistent',
      },
    });
    secondServer.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_pending_recovered',
        turn: { id: 'turn_pending_recovered', status: 'completed', items: [], error: null },
      },
    });

    await expect(secondResultPromise).resolves.toMatchObject({ output: 'Recovered persistent' });
    expect(mocks.spawn).toHaveBeenCalledTimes(2);
  });

  it('does not cache persistent threads for non-reusable app-server processes', async () => {
    const firstServer = createMockAppServer();
    const secondServer = createMockAppServer();
    mocks.spawn.mockReturnValueOnce(firstServer.proc).mockReturnValueOnce(secondServer.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        persist_threads: true,
        reuse_server: false,
        thread_cleanup: 'none',
      },
    });

    const firstResultPromise = provider.callApi('Fresh process prompt');
    const firstInitialize = await waitForMessage(
      firstServer,
      (message) => message.method === 'initialize',
    );
    firstServer.send({ id: firstInitialize.id, result: {} });
    const firstThreadStart = await waitForMessage(
      firstServer,
      (message) => message.method === 'thread/start',
    );
    firstServer.send({ id: firstThreadStart.id, result: { thread: { id: 'thr_fresh_1' } } });
    const firstTurnStart = await waitForMessage(
      firstServer,
      (message) => message.method === 'turn/start',
    );
    firstServer.send({
      id: firstTurnStart.id,
      result: { turn: { id: 'turn_fresh_1', status: 'inProgress' } },
    });
    firstServer.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_fresh_1',
        turnId: 'turn_fresh_1',
        itemId: 'msg_fresh_1',
        delta: 'First fresh',
      },
    });
    firstServer.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_fresh_1',
        turn: { id: 'turn_fresh_1', status: 'completed', items: [], error: null },
      },
    });
    await expect(firstResultPromise).resolves.toMatchObject({ output: 'First fresh' });

    const secondResultPromise = provider.callApi('Fresh process prompt');
    const secondInitialize = await waitForMessage(
      secondServer,
      (message) => message.method === 'initialize',
    );
    secondServer.send({ id: secondInitialize.id, result: {} });
    const secondThreadStart = await waitForMessage(
      secondServer,
      (message) => message.method === 'thread/start',
    );
    secondServer.send({ id: secondThreadStart.id, result: { thread: { id: 'thr_fresh_2' } } });
    const secondTurnStart = await waitForMessage(
      secondServer,
      (message) => message.method === 'turn/start',
    );
    expect(secondTurnStart.params.threadId).toBe('thr_fresh_2');
    secondServer.send({
      id: secondTurnStart.id,
      result: { turn: { id: 'turn_fresh_2', status: 'inProgress' } },
    });
    secondServer.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_fresh_2',
        turnId: 'turn_fresh_2',
        itemId: 'msg_fresh_2',
        delta: 'Second fresh',
      },
    });
    secondServer.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_fresh_2',
        turn: { id: 'turn_fresh_2', status: 'completed', items: [], error: null },
      },
    });

    await expect(secondResultPromise).resolves.toMatchObject({ output: 'Second fresh' });
  });

  it('does not evict a cached persistent thread while its turn is active', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        persist_threads: true,
        thread_pool_size: 1,
        thread_cleanup: 'none',
      },
    });

    const firstResultPromise = provider.callApi('Active cached prompt one');
    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const firstThreadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );
    server.send({ id: firstThreadStart.id, result: { thread: { id: 'thr_active_1' } } });
    const firstTurnStart = await waitForMessage(
      server,
      (message) => message.method === 'turn/start',
    );
    server.send({
      id: firstTurnStart.id,
      result: { turn: { id: 'turn_active_1', status: 'inProgress' } },
    });

    const secondResultPromise = provider.callApi('Active cached prompt two');
    const secondThreadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start' && message.id !== firstThreadStart.id,
    );
    expect(
      server
        .messages()
        .some(
          (message) =>
            message.method === 'thread/unsubscribe' && message.params?.threadId === 'thr_active_1',
        ),
    ).toBe(false);
    server.send({ id: secondThreadStart.id, result: { thread: { id: 'thr_active_2' } } });
    const secondTurnStart = await waitForMessage(
      server,
      (message) => message.method === 'turn/start' && message.id !== firstTurnStart.id,
    );
    server.send({
      id: secondTurnStart.id,
      result: { turn: { id: 'turn_active_2', status: 'inProgress' } },
    });

    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_active_2',
        turnId: 'turn_active_2',
        itemId: 'msg_active_2',
        delta: 'Second active',
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_active_2',
        turn: { id: 'turn_active_2', status: 'completed', items: [], error: null },
      },
    });
    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_active_1',
        turnId: 'turn_active_1',
        itemId: 'msg_active_1',
        delta: 'First active',
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_active_1',
        turn: { id: 'turn_active_1', status: 'completed', items: [], error: null },
      },
    });

    await expect(firstResultPromise).resolves.toMatchObject({ output: 'First active' });
    await expect(secondResultPromise).resolves.toMatchObject({ output: 'Second active' });
  });

  it('rebalances the persistent thread pool after concurrent active turns finish', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        persist_threads: true,
        thread_pool_size: 1,
        thread_cleanup: 'none',
      },
    });

    const firstResultPromise = provider.callApi('Concurrent cached prompt one');
    const secondResultPromise = provider.callApi('Concurrent cached prompt two');

    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const firstThreadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );
    const secondThreadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start' && message.id !== firstThreadStart.id,
    );
    server.send({ id: firstThreadStart.id, result: { thread: { id: 'thr_concurrent_1' } } });
    server.send({ id: secondThreadStart.id, result: { thread: { id: 'thr_concurrent_2' } } });

    const firstTurnStart = await waitForMessage(
      server,
      (message) =>
        message.method === 'turn/start' && message.params?.threadId === 'thr_concurrent_1',
    );
    const secondTurnStart = await waitForMessage(
      server,
      (message) =>
        message.method === 'turn/start' && message.params?.threadId === 'thr_concurrent_2',
    );
    server.send({
      id: firstTurnStart.id,
      result: { turn: { id: 'turn_concurrent_1', status: 'inProgress' } },
    });
    server.send({
      id: secondTurnStart.id,
      result: { turn: { id: 'turn_concurrent_2', status: 'inProgress' } },
    });

    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_concurrent_2',
        turnId: 'turn_concurrent_2',
        itemId: 'msg_concurrent_2',
        delta: 'Concurrent second',
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_concurrent_2',
        turn: { id: 'turn_concurrent_2', status: 'completed', items: [], error: null },
      },
    });
    const unsubscribe = await waitForMessage(
      server,
      (message) =>
        message.method === 'thread/unsubscribe' && message.params?.threadId === 'thr_concurrent_2',
    );
    server.send({ id: unsubscribe.id, result: { status: 'unsubscribed' } });

    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_concurrent_1',
        turnId: 'turn_concurrent_1',
        itemId: 'msg_concurrent_1',
        delta: 'Concurrent first',
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_concurrent_1',
        turn: { id: 'turn_concurrent_1', status: 'completed', items: [], error: null },
      },
    });

    await expect(firstResultPromise).resolves.toMatchObject({ output: 'Concurrent first' });
    await expect(secondResultPromise).resolves.toMatchObject({ output: 'Concurrent second' });
  });

  it('shares an in-flight persistent thread start for concurrent calls with the same cache key', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        persist_threads: true,
        thread_cleanup: 'none',
      },
    });

    const firstResultPromise = provider.callApi('Shared cached prompt');
    const secondResultPromise = provider.callApi('Shared cached prompt');

    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const threadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );
    expect(server.messages().filter((message) => message.method === 'thread/start')).toHaveLength(
      1,
    );
    server.send({ id: threadStart.id, result: { thread: { id: 'thr_shared' } } });

    const firstTurnStart = await waitForMessage(
      server,
      (message) => message.method === 'turn/start',
    );
    expect(firstTurnStart.params.threadId).toBe('thr_shared');
    server.send({
      id: firstTurnStart.id,
      result: { turn: { id: 'turn_shared_1', status: 'inProgress' } },
    });
    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_shared',
        turnId: 'turn_shared_1',
        itemId: 'msg_shared_1',
        delta: 'Shared first',
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_shared',
        turn: { id: 'turn_shared_1', status: 'completed', items: [], error: null },
      },
    });

    const secondTurnStart = await waitForMessage(
      server,
      (message) => message.method === 'turn/start' && message.id !== firstTurnStart.id,
    );
    expect(secondTurnStart.params.threadId).toBe('thr_shared');
    server.send({
      id: secondTurnStart.id,
      result: { turn: { id: 'turn_shared_2', status: 'inProgress' } },
    });
    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_shared',
        turnId: 'turn_shared_2',
        itemId: 'msg_shared_2',
        delta: 'Shared second',
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_shared',
        turn: { id: 'turn_shared_2', status: 'completed', items: [], error: null },
      },
    });

    await expect(firstResultPromise).resolves.toMatchObject({ output: 'Shared first' });
    await expect(secondResultPromise).resolves.toMatchObject({ output: 'Shared second' });
    expect(server.messages().filter((message) => message.method === 'thread/start')).toHaveLength(
      1,
    );
  });

  it('keeps shared persistent thread start alive when the first waiter aborts', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);
    const abortController = new AbortController();

    const provider = new OpenAICodexAppServerProvider({
      config: {
        persist_threads: true,
        thread_cleanup: 'none',
      },
    });

    const firstResultPromise = provider.callApi('Shared aborted thread start', undefined, {
      abortSignal: abortController.signal,
    } as any);
    const secondResultPromise = provider.callApi('Shared aborted thread start');

    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const threadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );
    expect(server.messages().filter((message) => message.method === 'thread/start')).toHaveLength(
      1,
    );

    abortController.abort();
    await expect(firstResultPromise).resolves.toEqual({
      error: 'OpenAI Codex app-server call aborted',
    });
    expect(server.proc.kill).not.toHaveBeenCalled();

    server.send({ id: threadStart.id, result: { thread: { id: 'thr_shared_abort_start' } } });
    const secondTurnStart = await waitForMessage(
      server,
      (message) => message.method === 'turn/start',
    );
    expect(secondTurnStart.params.threadId).toBe('thr_shared_abort_start');
    server.send({
      id: secondTurnStart.id,
      result: { turn: { id: 'turn_shared_abort_start_2', status: 'inProgress' } },
    });
    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_shared_abort_start',
        turnId: 'turn_shared_abort_start_2',
        itemId: 'msg_shared_abort_start_2',
        delta: 'Second survived thread start abort',
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_shared_abort_start',
        turn: { id: 'turn_shared_abort_start_2', status: 'completed', items: [], error: null },
      },
    });
    await expect(secondResultPromise).resolves.toMatchObject({
      output: 'Second survived thread start abort',
    });

    const thirdResultPromise = provider.callApi('Shared aborted thread start');
    const thirdTurnStart = await waitForMessage(
      server,
      (message) => message.method === 'turn/start' && message.id !== secondTurnStart.id,
    );
    expect(thirdTurnStart.params.threadId).toBe('thr_shared_abort_start');
    expect(server.messages().filter((message) => message.method === 'thread/start')).toHaveLength(
      1,
    );
    server.send({
      id: thirdTurnStart.id,
      result: { turn: { id: 'turn_shared_abort_start_3', status: 'inProgress' } },
    });
    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_shared_abort_start',
        turnId: 'turn_shared_abort_start_3',
        itemId: 'msg_shared_abort_start_3',
        delta: 'Cached after abort',
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_shared_abort_start',
        turn: { id: 'turn_shared_abort_start_3', status: 'completed', items: [], error: null },
      },
    });

    await expect(thirdResultPromise).resolves.toMatchObject({ output: 'Cached after abort' });
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
  });

  it('keeps shared persistent thread resume alive when the first waiter aborts', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);
    const abortController = new AbortController();

    const provider = new OpenAICodexAppServerProvider({
      config: {
        thread_id: 'thr_existing_shared_abort',
        persist_threads: true,
        thread_cleanup: 'none',
      },
    });

    const firstResultPromise = provider.callApi('Shared aborted thread resume first', undefined, {
      abortSignal: abortController.signal,
    } as any);
    const secondResultPromise = provider.callApi('Shared aborted thread resume second');

    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const threadResume = await waitForMessage(
      server,
      (message) => message.method === 'thread/resume',
    );
    expect(server.messages().filter((message) => message.method === 'thread/resume')).toHaveLength(
      1,
    );

    abortController.abort();
    await expect(firstResultPromise).resolves.toEqual({
      error: 'OpenAI Codex app-server call aborted',
    });
    expect(server.proc.kill).not.toHaveBeenCalled();

    server.send({
      id: threadResume.id,
      result: { thread: { id: 'thr_existing_shared_abort' } },
    });
    const secondTurnStart = await waitForMessage(
      server,
      (message) => message.method === 'turn/start',
    );
    expect(secondTurnStart.params.threadId).toBe('thr_existing_shared_abort');
    server.send({
      id: secondTurnStart.id,
      result: { turn: { id: 'turn_shared_abort_resume_2', status: 'inProgress' } },
    });
    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_existing_shared_abort',
        turnId: 'turn_shared_abort_resume_2',
        itemId: 'msg_shared_abort_resume_2',
        delta: 'Second survived thread resume abort',
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_existing_shared_abort',
        turn: { id: 'turn_shared_abort_resume_2', status: 'completed', items: [], error: null },
      },
    });

    await expect(secondResultPromise).resolves.toMatchObject({
      output: 'Second survived thread resume abort',
    });
    expect(server.messages().filter((message) => message.method === 'thread/resume')).toHaveLength(
      1,
    );
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
  });

  it('includes thread-start options in the persistent thread cache key', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        persist_threads: true,
        thread_pool_size: 2,
        thread_cleanup: 'none',
      },
    });

    const firstResultPromise = provider.callApi('Thread options prompt', {
      prompt: {
        raw: 'Thread options prompt',
        config: { ephemeral: true },
      },
    } as any);
    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const firstThreadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );
    expect(firstThreadStart.params.ephemeral).toBe(true);
    server.send({ id: firstThreadStart.id, result: { thread: { id: 'thr_options_1' } } });
    const firstTurnStart = await waitForMessage(
      server,
      (message) => message.method === 'turn/start',
    );
    server.send({
      id: firstTurnStart.id,
      result: { turn: { id: 'turn_options_1', status: 'inProgress' } },
    });
    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_options_1',
        turnId: 'turn_options_1',
        itemId: 'msg_options_1',
        delta: 'Options one',
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_options_1',
        turn: { id: 'turn_options_1', status: 'completed', items: [], error: null },
      },
    });
    await expect(firstResultPromise).resolves.toMatchObject({ output: 'Options one' });

    const secondResultPromise = provider.callApi('Thread options prompt', {
      prompt: {
        raw: 'Thread options prompt',
        config: { ephemeral: false },
      },
    } as any);
    const secondThreadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start' && message.id !== firstThreadStart.id,
    );
    expect(secondThreadStart.params.ephemeral).toBe(false);
    server.send({ id: secondThreadStart.id, result: { thread: { id: 'thr_options_2' } } });
    const secondTurnStart = await waitForMessage(
      server,
      (message) => message.method === 'turn/start' && message.id !== firstTurnStart.id,
    );
    expect(secondTurnStart.params.threadId).toBe('thr_options_2');
    server.send({
      id: secondTurnStart.id,
      result: { turn: { id: 'turn_options_2', status: 'inProgress' } },
    });
    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_options_2',
        turnId: 'turn_options_2',
        itemId: 'msg_options_2',
        delta: 'Options two',
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_options_2',
        turn: { id: 'turn_options_2', status: 'completed', items: [], error: null },
      },
    });

    await expect(secondResultPromise).resolves.toMatchObject({ output: 'Options two' });
  });

  it('answers user input and dynamic tool server requests from policy', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        thread_cleanup: 'none',
        server_request_policy: {
          user_input: 'first-option',
          dynamic_tools: {
            classify: {
              success: true,
              text: '{"label":"safe"}',
            },
          },
        },
      },
    });

    const resultPromise = provider.callApi('Ask for input');

    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const threadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );
    server.send({ id: threadStart.id, result: { thread: { id: 'thr_tools' } } });
    const turnStart = await waitForMessage(server, (message) => message.method === 'turn/start');
    server.send({ id: turnStart.id, result: { turn: { id: 'turn_tools', status: 'inProgress' } } });

    server.send({
      id: 100,
      method: 'item/tool/requestUserInput',
      params: {
        threadId: 'thr_tools',
        turnId: 'turn_tools',
        itemId: 'question_1',
        questions: [
          {
            id: 'severity',
            header: 'Severity',
            question: 'Choose severity',
            isOther: false,
            isSecret: false,
            options: [{ label: 'high', description: 'High impact' }],
          },
        ],
      },
    });
    const userInputResponse = await waitForMessage(
      server,
      (message) => message.id === 100 && message.result,
    );
    expect(userInputResponse.result).toEqual({
      answers: {
        severity: { answers: ['high'] },
      },
    });

    server.send({
      id: 101,
      method: 'item/tool/call',
      params: {
        threadId: 'thr_tools',
        turnId: 'turn_tools',
        callId: 'call_1',
        tool: 'classify',
        arguments: { text: 'hello' },
      },
    });
    const dynamicToolResponse = await waitForMessage(
      server,
      (message) => message.id === 101 && message.result,
    );
    expect(dynamicToolResponse.result).toEqual({
      contentItems: [{ type: 'inputText', text: '{"label":"safe"}' }],
      success: true,
    });

    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_tools',
        turnId: 'turn_tools',
        itemId: 'msg_tools',
        delta: 'Done',
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_tools',
        turn: { id: 'turn_tools', status: 'completed', items: [], error: null },
      },
    });

    const result = await resultPromise;
    expect(result.output).toBe('Done');
    expect(result.metadata?.codexAppServer.serverRequests).toHaveLength(2);
  });

  it('interrupts an active turn when the turn timeout fires', async () => {
    vi.useFakeTimers();
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        thread_cleanup: 'none',
        turn_timeout_ms: 1,
      },
    });

    try {
      const resultPromise = provider.callApi('This will time out');

      const initialize = await waitForMessageWithoutTimers(
        server,
        (message) => message.method === 'initialize',
      );
      server.send({ id: initialize.id, result: {} });
      const threadStart = await waitForMessageWithoutTimers(
        server,
        (message) => message.method === 'thread/start',
      );
      server.send({ id: threadStart.id, result: { thread: { id: 'thr_timeout' } } });
      const turnStart = await waitForMessageWithoutTimers(
        server,
        (message) => message.method === 'turn/start',
      );
      server.send({
        id: turnStart.id,
        result: { turn: { id: 'turn_timeout', status: 'inProgress' } },
      });
      await flushMicrotasks();
      await vi.advanceTimersByTimeAsync(1);

      const interrupt = await waitForMessageWithoutTimers(
        server,
        (message) => message.method === 'turn/interrupt',
      );
      expect(interrupt.params).toEqual({
        threadId: 'thr_timeout',
        turnId: 'turn_timeout',
      });
      server.send({ id: interrupt.id, result: {} });

      await expect(resultPromise).resolves.toEqual({
        error: 'Error calling OpenAI Codex app-server: codex app-server turn timed out after 1ms',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('removes abort listeners when a JSON-RPC request timeout fires', async () => {
    vi.useFakeTimers();
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);
    const abortController = new AbortController();
    const removeAbortListener = vi.spyOn(abortController.signal, 'removeEventListener');

    const provider = new OpenAICodexAppServerProvider({
      config: {
        request_timeout_ms: 1,
        thread_cleanup: 'none',
      },
    });

    try {
      const resultPromise = provider.callApi('Timeout thread start', undefined, {
        abortSignal: abortController.signal,
      } as any);

      const initialize = await waitForMessageWithoutTimers(
        server,
        (message) => message.method === 'initialize',
      );
      server.send({ id: initialize.id, result: {} });
      const threadStart = await waitForMessageWithoutTimers(
        server,
        (message) => message.method === 'thread/start',
      );
      server.send({ id: threadStart.id, result: { thread: { id: 'thr_timeout_listener' } } });
      await waitForMessageWithoutTimers(server, (message) => message.method === 'turn/start');
      await vi.advanceTimersByTimeAsync(1);

      await expect(resultPromise).resolves.toEqual({
        error:
          'Error calling OpenAI Codex app-server: codex app-server request timed out: turn/start',
      });
      expect(removeAbortListener).toHaveBeenCalledWith('abort', expect.any(Function));
      expect(server.proc.kill).toHaveBeenCalledWith('SIGTERM');
    } finally {
      vi.useRealTimers();
    }
  });

  it('restarts a reused app-server process after a JSON-RPC request timeout', async () => {
    vi.useFakeTimers();
    const firstServer = createMockAppServer();
    const secondServer = createMockAppServer();
    mocks.spawn.mockReturnValueOnce(firstServer.proc).mockReturnValueOnce(secondServer.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        request_timeout_ms: 1,
        thread_cleanup: 'none',
      },
    });

    try {
      const timedOutResultPromise = provider.callApi('Timeout before thread start completes');
      const firstInitialize = await waitForMessageWithoutTimers(
        firstServer,
        (message) => message.method === 'initialize',
      );
      firstServer.send({ id: firstInitialize.id, result: {} });
      await waitForMessageWithoutTimers(
        firstServer,
        (message) => message.method === 'thread/start',
      );
      await vi.advanceTimersByTimeAsync(1);

      await expect(timedOutResultPromise).resolves.toEqual({
        error:
          'Error calling OpenAI Codex app-server: codex app-server request timed out: thread/start',
      });
      expect(firstServer.proc.kill).toHaveBeenCalledWith('SIGTERM');

      const recoveredResultPromise = provider.callApi('Recover after request timeout', {
        prompt: {
          raw: 'Recover after request timeout',
          config: {
            request_timeout_ms: 1_000,
          },
        },
      } as any);
      const secondInitialize = await waitForMessageWithoutTimers(
        secondServer,
        (message) => message.method === 'initialize',
      );
      secondServer.send({ id: secondInitialize.id, result: {} });
      const threadStart = await waitForMessageWithoutTimers(
        secondServer,
        (message) => message.method === 'thread/start',
      );
      secondServer.send({ id: threadStart.id, result: { thread: { id: 'thr_after_timeout' } } });
      const turnStart = await waitForMessageWithoutTimers(
        secondServer,
        (message) => message.method === 'turn/start',
      );
      secondServer.send({
        id: turnStart.id,
        result: { turn: { id: 'turn_after_timeout', status: 'inProgress' } },
      });
      secondServer.send({
        method: 'item/agentMessage/delta',
        params: {
          threadId: 'thr_after_timeout',
          turnId: 'turn_after_timeout',
          itemId: 'msg_after_timeout',
          delta: 'Recovered after timeout',
        },
      });
      secondServer.send({
        method: 'turn/completed',
        params: {
          threadId: 'thr_after_timeout',
          turn: { id: 'turn_after_timeout', status: 'completed', items: [], error: null },
        },
      });

      await expect(recoveredResultPromise).resolves.toMatchObject({
        output: 'Recovered after timeout',
      });
      expect(mocks.spawn).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not fail an active turn when another reused JSON-RPC request aborts', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);
    const abortController = new AbortController();

    const provider = new OpenAICodexAppServerProvider({
      config: {
        request_timeout_ms: 1_000,
        thread_cleanup: 'none',
      },
    });

    const activeResultPromise = provider.callApi('Active turn survives unrelated abort');
    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const activeThreadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );
    server.send({ id: activeThreadStart.id, result: { thread: { id: 'thr_active_abort' } } });
    const activeTurnStart = await waitForMessage(
      server,
      (message) => message.method === 'turn/start',
    );
    server.send({
      id: activeTurnStart.id,
      result: { turn: { id: 'turn_active_abort', status: 'inProgress' } },
    });

    const abortedResultPromise = provider.callApi('Abort unrelated request', undefined, {
      abortSignal: abortController.signal,
    } as any);
    await waitForMessage(
      server,
      (message) => message.method === 'thread/start' && message.id !== activeThreadStart.id,
    );
    abortController.abort();

    await expect(abortedResultPromise).resolves.toEqual({
      error: 'OpenAI Codex app-server call aborted',
    });
    expect(server.proc.kill).not.toHaveBeenCalled();

    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_active_abort',
        turnId: 'turn_active_abort',
        itemId: 'msg_active_abort',
        delta: 'Active turn survived',
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_active_abort',
        turn: { id: 'turn_active_abort', status: 'completed', items: [], error: null },
      },
    });

    await expect(activeResultPromise).resolves.toMatchObject({
      output: 'Active turn survived',
    });
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    expect(server.proc.kill).not.toHaveBeenCalled();
  });

  it('cleans up a late non-persistent thread start response after caller aborts', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);
    const abortController = new AbortController();

    const provider = new OpenAICodexAppServerProvider({
      config: {
        request_timeout_ms: 1_000,
      },
    });

    const resultPromise = provider.callApi('Abort before thread start response', undefined, {
      abortSignal: abortController.signal,
    } as any);
    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const threadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );

    abortController.abort();
    await expect(resultPromise).resolves.toEqual({
      error: 'OpenAI Codex app-server call aborted',
    });
    expect(server.proc.kill).not.toHaveBeenCalled();

    server.send({ id: threadStart.id, result: { thread: { id: 'thr_late_abort_start' } } });
    const unsubscribe = await waitForMessage(
      server,
      (message) =>
        message.method === 'thread/unsubscribe' &&
        message.params?.threadId === 'thr_late_abort_start',
    );
    server.send({ id: unsubscribe.id, result: { status: 'unsubscribed' } });
    await flushMicrotasks();

    expect(server.messages().some((message) => message.method === 'turn/start')).toBe(false);
    expect(server.proc.kill).not.toHaveBeenCalled();
  });

  it('cleans up a late non-persistent thread resume response after caller aborts', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);
    const abortController = new AbortController();

    const provider = new OpenAICodexAppServerProvider({
      config: {
        request_timeout_ms: 1_000,
        thread_id: 'thr_existing_late_abort_resume',
      },
    });

    const resultPromise = provider.callApi('Abort before thread resume response', undefined, {
      abortSignal: abortController.signal,
    } as any);
    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const threadResume = await waitForMessage(
      server,
      (message) => message.method === 'thread/resume',
    );

    abortController.abort();
    await expect(resultPromise).resolves.toEqual({
      error: 'OpenAI Codex app-server call aborted',
    });
    expect(server.proc.kill).not.toHaveBeenCalled();

    server.send({
      id: threadResume.id,
      result: { thread: { id: 'thr_existing_late_abort_resume' } },
    });
    const unsubscribe = await waitForMessage(
      server,
      (message) =>
        message.method === 'thread/unsubscribe' &&
        message.params?.threadId === 'thr_existing_late_abort_resume',
    );
    server.send({ id: unsubscribe.id, result: { status: 'unsubscribed' } });
    await flushMicrotasks();

    expect(server.messages().some((message) => message.method === 'turn/start')).toBe(false);
    expect(server.proc.kill).not.toHaveBeenCalled();
  });

  it('keeps a reused app-server process after a JSON-RPC request abort', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);
    const abortController = new AbortController();

    const provider = new OpenAICodexAppServerProvider({
      config: {
        request_timeout_ms: 1_000,
        thread_cleanup: 'none',
      },
    });

    const abortedResultPromise = provider.callApi(
      'Abort before thread start completes',
      undefined,
      {
        abortSignal: abortController.signal,
      } as any,
    );
    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const abortedThreadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );
    abortController.abort();

    await expect(abortedResultPromise).resolves.toEqual({
      error: 'OpenAI Codex app-server call aborted',
    });
    expect(server.proc.kill).not.toHaveBeenCalled();
    server.send({
      id: abortedThreadStart.id,
      result: { thread: { id: 'thr_late_aborted_request' } },
    });

    const recoveredResultPromise = provider.callApi('Recover after request abort');
    const threadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start' && message.id !== abortedThreadStart.id,
    );
    server.send({ id: threadStart.id, result: { thread: { id: 'thr_after_abort' } } });
    const turnStart = await waitForMessage(server, (message) => message.method === 'turn/start');
    server.send({
      id: turnStart.id,
      result: { turn: { id: 'turn_after_abort', status: 'inProgress' } },
    });
    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_after_abort',
        turnId: 'turn_after_abort',
        itemId: 'msg_after_abort',
        delta: 'Recovered after abort',
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_after_abort',
        turn: { id: 'turn_after_abort', status: 'completed', items: [], error: null },
      },
    });

    await expect(recoveredResultPromise).resolves.toMatchObject({
      output: 'Recovered after abort',
    });
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    expect(server.proc.kill).not.toHaveBeenCalled();
  });

  it('cleans up failed startup attempts and retries with a fresh app-server process', async () => {
    vi.useFakeTimers();
    const firstServer = createMockAppServer();
    const secondServer = createMockAppServer();
    mocks.spawn.mockReturnValueOnce(firstServer.proc).mockReturnValueOnce(secondServer.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        thread_cleanup: 'none',
      },
    });

    try {
      const firstResultPromise = provider.callApi('First attempt', {
        prompt: {
          raw: 'First attempt',
          config: {
            startup_timeout_ms: 1,
          },
        },
      } as any);
      await waitForMessageWithoutTimers(firstServer, (message) => message.method === 'initialize');
      await vi.advanceTimersByTimeAsync(1);

      await expect(firstResultPromise).resolves.toEqual({
        error:
          'Error calling OpenAI Codex app-server: codex app-server request timed out: initialize',
      });
      expect(firstServer.proc.kill).toHaveBeenCalledWith('SIGTERM');

      const secondResultPromise = provider.callApi('Second attempt', {
        prompt: {
          raw: 'Second attempt',
          config: {
            startup_timeout_ms: 1_000,
          },
        },
      } as any);
      const initialize = await waitForMessageWithoutTimers(
        secondServer,
        (message) => message.method === 'initialize',
      );
      secondServer.send({ id: initialize.id, result: {} });
      const threadStart = await waitForMessageWithoutTimers(
        secondServer,
        (message) => message.method === 'thread/start',
      );
      secondServer.send({ id: threadStart.id, result: { thread: { id: 'thr_retry' } } });
      const turnStart = await waitForMessageWithoutTimers(
        secondServer,
        (message) => message.method === 'turn/start',
      );
      secondServer.send({
        id: turnStart.id,
        result: { turn: { id: 'turn_retry', status: 'inProgress' } },
      });
      secondServer.send({
        method: 'item/agentMessage/delta',
        params: {
          threadId: 'thr_retry',
          turnId: 'turn_retry',
          itemId: 'msg_retry',
          delta: 'Recovered',
        },
      });
      secondServer.send({
        method: 'turn/completed',
        params: {
          threadId: 'thr_retry',
          turn: { id: 'turn_retry', status: 'completed', items: [], error: null },
        },
      });

      const result = await secondResultPromise;
      expect(result.output).toBe('Recovered');
      expect(mocks.spawn).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('merges prompt-level nested config with provider defaults', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        thread_cleanup: 'none',
        cli_config: {
          provider_only: true,
          shared_config: 'provider',
        },
        cli_env: {
          PROVIDER_ONLY: 'yes',
          SHARED_ENV: 'provider',
        },
        server_request_policy: {
          command_execution: 'decline',
          file_change: 'decline',
          permissions: {
            permissions: { read: true },
            scope: 'session',
          },
          dynamic_tools: {
            providerTool: {
              text: 'provider tool result',
            },
          },
        },
      },
    });

    const resultPromise = provider.callApi('Merged nested config', {
      prompt: {
        raw: 'Merged nested config',
        config: {
          cli_config: {
            prompt_only: true,
            shared_config: 'prompt',
          },
          cli_env: {
            PROMPT_ONLY: 'yes',
            SHARED_ENV: 'prompt',
          },
          server_request_policy: { command_execution: 'accept' },
        },
      },
    } as any);

    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    const spawnArgs = mocks.spawn.mock.calls[0][1] as string[];
    expect(spawnArgs).toEqual(
      expect.arrayContaining(['provider_only=true', 'prompt_only=true', 'shared_config="prompt"']),
    );
    const spawnEnv = mocks.spawn.mock.calls[0][2].env as Record<string, string>;
    expect(spawnEnv.PROVIDER_ONLY).toBe('yes');
    expect(spawnEnv.PROMPT_ONLY).toBe('yes');
    expect(spawnEnv.SHARED_ENV).toBe('prompt');

    server.send({ id: initialize.id, result: {} });
    const threadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );
    server.send({ id: threadStart.id, result: { thread: { id: 'thr_nested_config' } } });
    const turnStart = await waitForMessage(server, (message) => message.method === 'turn/start');
    server.send({
      id: turnStart.id,
      result: { turn: { id: 'turn_nested_config', status: 'inProgress' } },
    });

    server.send({
      id: 351,
      method: 'item/commandExecution/requestApproval',
      params: {
        threadId: 'thr_nested_config',
        turnId: 'turn_nested_config',
        itemId: 'cmd_nested_config',
        command: 'npm test',
      },
    });
    const commandApproval = await waitForMessage(
      server,
      (message) => message.id === 351 && message.result,
    );
    expect(commandApproval.result).toEqual({ decision: 'accept' });

    server.send({
      id: 352,
      method: 'item/fileChange/requestApproval',
      params: {
        threadId: 'thr_nested_config',
        turnId: 'turn_nested_config',
        itemId: 'file_nested_config',
        changes: { files: ['src/index.ts'] },
      },
    });
    const fileApproval = await waitForMessage(
      server,
      (message) => message.id === 352 && message.result,
    );
    expect(fileApproval.result).toEqual({ decision: 'decline' });

    server.send({
      id: 353,
      method: 'item/permissions/requestApproval',
      params: {
        threadId: 'thr_nested_config',
        turnId: 'turn_nested_config',
        itemId: 'perm_nested_config',
      },
    });
    const permissionsApproval = await waitForMessage(
      server,
      (message) => message.id === 353 && message.result,
    );
    expect(permissionsApproval.result).toEqual({
      permissions: { read: true },
      scope: 'session',
    });

    server.send({
      id: 354,
      method: 'item/tool/call',
      params: {
        threadId: 'thr_nested_config',
        turnId: 'turn_nested_config',
        callId: 'tool_nested_config',
        tool: 'providerTool',
        arguments: {},
      },
    });
    const dynamicToolResponse = await waitForMessage(
      server,
      (message) => message.id === 354 && message.result,
    );
    expect(dynamicToolResponse.result).toEqual({
      contentItems: [{ type: 'inputText', text: 'provider tool result' }],
      success: true,
    });

    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_nested_config',
        turnId: 'turn_nested_config',
        itemId: 'msg_nested_config',
        delta: 'Merged config done',
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_nested_config',
        turn: { id: 'turn_nested_config', status: 'completed', items: [], error: null },
      },
    });

    await expect(resultPromise).resolves.toMatchObject({ output: 'Merged config done' });
  });

  it('renders prompt-level config templates with test vars before use', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        thread_cleanup: 'none',
      },
    });

    const resultPromise = provider.callApi('Rendered config', {
      vars: {
        envValue: 'rendered-env',
        modelName: 'gpt-5.4',
        workspaceDir: process.cwd(),
      },
      prompt: {
        raw: 'Rendered config',
        config: {
          working_dir: '{{ workspaceDir }}',
          model: '{{ modelName }}',
          cli_config: {
            rendered_config: '{{ envValue }}',
          },
          cli_env: {
            RENDERED_VALUE: '{{ envValue }}',
          },
        },
      },
    } as any);

    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    const spawnArgs = mocks.spawn.mock.calls[0][1] as string[];
    expect(spawnArgs).toEqual(expect.arrayContaining(['rendered_config="rendered-env"']));
    const spawnEnv = mocks.spawn.mock.calls[0][2].env as Record<string, string>;
    expect(spawnEnv.RENDERED_VALUE).toBe('rendered-env');

    server.send({ id: initialize.id, result: {} });
    const threadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );
    expect(threadStart.params).toMatchObject({
      cwd: process.cwd(),
      model: 'gpt-5.4',
      config: {
        rendered_config: 'rendered-env',
      },
    });
    server.send({ id: threadStart.id, result: { thread: { id: 'thr_rendered_config' } } });

    const turnStart = await waitForMessage(server, (message) => message.method === 'turn/start');
    expect(turnStart.params).toMatchObject({
      cwd: process.cwd(),
      model: 'gpt-5.4',
    });
    server.send({
      id: turnStart.id,
      result: { turn: { id: 'turn_rendered_config', status: 'inProgress' } },
    });
    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_rendered_config',
        turnId: 'turn_rendered_config',
        itemId: 'msg_rendered_config',
        delta: 'Rendered config done',
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_rendered_config',
        turn: { id: 'turn_rendered_config', status: 'completed', items: [], error: null },
      },
    });

    await expect(resultPromise).resolves.toMatchObject({ output: 'Rendered config done' });
  });

  it('applies prompt-level server request policy for each turn on a reused connection', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        thread_cleanup: 'none',
        server_request_policy: {
          command_execution: 'decline',
        },
      },
    });

    const firstResultPromise = provider.callApi('First turn', {
      prompt: {
        raw: 'First turn',
        config: {
          server_request_policy: { command_execution: 'accept' },
        },
      },
    } as any);

    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const firstThreadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );
    server.send({ id: firstThreadStart.id, result: { thread: { id: 'thr_policy_1' } } });
    const firstTurnStart = await waitForMessage(
      server,
      (message) => message.method === 'turn/start',
    );
    server.send({
      id: firstTurnStart.id,
      result: { turn: { id: 'turn_policy_1', status: 'inProgress' } },
    });
    server.send({
      id: 301,
      method: 'item/commandExecution/requestApproval',
      params: {
        threadId: 'thr_policy_1',
        turnId: 'turn_policy_1',
        itemId: 'cmd_policy_1',
        command: 'npm test',
      },
    });
    const firstApprovalResponse = await waitForMessage(
      server,
      (message) => message.id === 301 && message.result,
    );
    expect(firstApprovalResponse.result).toEqual({ decision: 'accept' });
    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_policy_1',
        turnId: 'turn_policy_1',
        itemId: 'msg_policy_1',
        delta: 'First done',
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_policy_1',
        turn: { id: 'turn_policy_1', status: 'completed', items: [], error: null },
      },
    });
    await expect(firstResultPromise).resolves.toMatchObject({ output: 'First done' });

    const secondResultPromise = provider.callApi('Second turn', {
      prompt: {
        raw: 'Second turn',
        config: {
          server_request_policy: { command_execution: 'decline' },
        },
      },
    } as any);

    const secondThreadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start' && message.id !== firstThreadStart.id,
    );
    server.send({ id: secondThreadStart.id, result: { thread: { id: 'thr_policy_2' } } });
    const secondTurnStart = await waitForMessage(
      server,
      (message) => message.method === 'turn/start' && message.id !== firstTurnStart.id,
    );
    server.send({
      id: secondTurnStart.id,
      result: { turn: { id: 'turn_policy_2', status: 'inProgress' } },
    });
    server.send({
      id: 302,
      method: 'item/commandExecution/requestApproval',
      params: {
        threadId: 'thr_policy_2',
        turnId: 'turn_policy_2',
        itemId: 'cmd_policy_2',
        command: 'cat .env',
      },
    });
    const secondApprovalResponse = await waitForMessage(
      server,
      (message) => message.id === 302 && message.result,
    );
    expect(secondApprovalResponse.result).toEqual({ decision: 'decline' });
    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_policy_2',
        turnId: 'turn_policy_2',
        itemId: 'msg_policy_2',
        delta: 'Second done',
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_policy_2',
        turn: { id: 'turn_policy_2', status: 'completed', items: [], error: null },
      },
    });

    await expect(secondResultPromise).resolves.toMatchObject({ output: 'Second done' });
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
  });

  it('uses prompt-level request timeouts for thread requests on reused connections', async () => {
    vi.useFakeTimers();
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

    const provider = new OpenAICodexAppServerProvider({
      config: {
        thread_cleanup: 'none',
      },
    });

    try {
      const firstResultPromise = provider.callApi('Reusable timeout prompt one', {
        prompt: {
          raw: 'Reusable timeout prompt one',
          config: { request_timeout_ms: 1_000 },
        },
      } as any);
      const initialize = await waitForMessageWithoutTimers(
        server,
        (message) => message.method === 'initialize',
      );
      server.send({ id: initialize.id, result: {} });
      const firstThreadStart = await waitForMessageWithoutTimers(
        server,
        (message) => message.method === 'thread/start',
      );
      server.send({
        id: firstThreadStart.id,
        result: { thread: { id: 'thr_timeout_config_1' } },
      });
      const firstTurnStart = await waitForMessageWithoutTimers(
        server,
        (message) => message.method === 'turn/start',
      );
      server.send({
        id: firstTurnStart.id,
        result: { turn: { id: 'turn_timeout_config_1', status: 'inProgress' } },
      });
      server.send({
        method: 'item/agentMessage/delta',
        params: {
          threadId: 'thr_timeout_config_1',
          turnId: 'turn_timeout_config_1',
          itemId: 'msg_timeout_config_1',
          delta: 'First timeout config',
        },
      });
      server.send({
        method: 'turn/completed',
        params: {
          threadId: 'thr_timeout_config_1',
          turn: { id: 'turn_timeout_config_1', status: 'completed', items: [], error: null },
        },
      });
      await expect(firstResultPromise).resolves.toMatchObject({ output: 'First timeout config' });

      const secondResultPromise = provider.callApi('Reusable timeout prompt two', {
        prompt: {
          raw: 'Reusable timeout prompt two',
          config: { request_timeout_ms: 17 },
        },
      } as any);
      await waitForMessageWithoutTimers(
        server,
        (message) => message.method === 'thread/start' && message.id !== firstThreadStart.id,
      );
      expect(setTimeoutSpy.mock.calls.some(([, timeoutMs]) => timeoutMs === 17)).toBe(true);
      await vi.advanceTimersByTimeAsync(17);

      await expect(secondResultPromise).resolves.toEqual({
        error:
          'Error calling OpenAI Codex app-server: codex app-server request timed out: thread/start',
      });
      expect(
        server
          .messages()
          .filter(
            (message) => message.method === 'thread/start' && message.id !== firstThreadStart.id,
          ),
      ).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails an active turn when the app-server process exits before completion', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        thread_cleanup: 'none',
      },
    });

    const resultPromise = provider.callApi('Crash mid-turn');

    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const threadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );
    server.send({ id: threadStart.id, result: { thread: { id: 'thr_crash' } } });
    const turnStart = await waitForMessage(server, (message) => message.method === 'turn/start');
    server.send({
      id: turnStart.id,
      result: { turn: { id: 'turn_crash', status: 'inProgress' } },
    });

    server.proc.exitCode = 1;
    server.proc.emit('exit', 1, null);

    await expect(resultPromise).resolves.toEqual({
      error:
        'Error calling OpenAI Codex app-server: codex app-server exited with code 1 signal null',
    });
  });

  it('isolates process exits to the matching deep-tracing app-server process', async () => {
    const firstServer = createMockAppServer();
    const secondServer = createMockAppServer();
    mocks.spawn.mockReturnValueOnce(firstServer.proc).mockReturnValueOnce(secondServer.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        deep_tracing: true,
        thread_cleanup: 'none',
      },
    });

    const firstResultPromise = provider.callApi('Deep tracing crash first');
    const secondResultPromise = provider.callApi('Deep tracing crash second');

    const firstInitialize = await waitForMessage(
      firstServer,
      (message) => message.method === 'initialize',
    );
    const secondInitialize = await waitForMessage(
      secondServer,
      (message) => message.method === 'initialize',
    );
    firstServer.send({ id: firstInitialize.id, result: {} });
    secondServer.send({ id: secondInitialize.id, result: {} });

    const firstThreadStart = await waitForMessage(
      firstServer,
      (message) => message.method === 'thread/start',
    );
    const secondThreadStart = await waitForMessage(
      secondServer,
      (message) => message.method === 'thread/start',
    );
    firstServer.send({ id: firstThreadStart.id, result: { thread: { id: 'thr_deep_crash_1' } } });
    secondServer.send({ id: secondThreadStart.id, result: { thread: { id: 'thr_deep_crash_2' } } });

    const firstTurnStart = await waitForMessage(
      firstServer,
      (message) => message.method === 'turn/start',
    );
    const secondTurnStart = await waitForMessage(
      secondServer,
      (message) => message.method === 'turn/start',
    );
    firstServer.send({
      id: firstTurnStart.id,
      result: { turn: { id: 'turn_deep_crash_1', status: 'inProgress' } },
    });
    secondServer.send({
      id: secondTurnStart.id,
      result: { turn: { id: 'turn_deep_crash_2', status: 'inProgress' } },
    });

    firstServer.proc.exitCode = 1;
    firstServer.proc.emit('exit', 1, null);
    await expect(firstResultPromise).resolves.toEqual({
      error:
        'Error calling OpenAI Codex app-server: codex app-server exited with code 1 signal null',
    });

    secondServer.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_deep_crash_2',
        turnId: 'turn_deep_crash_2',
        itemId: 'msg_deep_crash_2',
        delta: 'Second survived',
      },
    });
    secondServer.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_deep_crash_2',
        turn: { id: 'turn_deep_crash_2', status: 'completed', items: [], error: null },
      },
    });

    await expect(secondResultPromise).resolves.toMatchObject({ output: 'Second survived' });
  });

  it('waits for completion after retryable app-server error notifications', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        thread_cleanup: 'none',
      },
    });

    const resultPromise = provider.callApi('Recover after retryable app-server error');
    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const threadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );
    server.send({ id: threadStart.id, result: { thread: { id: 'thr_retry_error' } } });
    const turnStart = await waitForMessage(server, (message) => message.method === 'turn/start');
    server.send({
      id: turnStart.id,
      result: { turn: { id: 'turn_retry_error', status: 'inProgress' } },
    });
    server.send({
      method: 'error',
      params: {
        threadId: 'thr_retry_error',
        turnId: 'turn_retry_error',
        error: { message: 'temporary app-server error' },
        willRetry: true,
      },
    });
    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_retry_error',
        turnId: 'turn_retry_error',
        itemId: 'msg_retry_error',
        delta: 'Recovered',
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_retry_error',
        turn: { id: 'turn_retry_error', status: 'completed', items: [], error: null },
      },
    });

    await expect(resultPromise).resolves.toMatchObject({ output: 'Recovered' });
  });

  it('parses JSON-RPC notifications whose string payloads contain literal newlines', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        include_raw_events: true,
        thread_cleanup: 'none',
      },
    });

    const resultPromise = provider.callApi('Run a command with multiline output');

    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const threadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );
    server.send({ id: threadStart.id, result: { thread: { id: 'thr_multiline' } } });
    const turnStart = await waitForMessage(server, (message) => message.method === 'turn/start');
    server.send({
      id: turnStart.id,
      result: { turn: { id: 'turn_multiline', status: 'inProgress' } },
    });

    server.stdout.write(
      '{"method":"item/commandExecution/outputDelta","params":{"threadId":"thr_multiline","turnId":"turn_multiline","itemId":"cmd_multiline","delta":"line one\n',
    );
    server.stdout.write('line two"}}\n');
    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_multiline',
        turnId: 'turn_multiline',
        itemId: 'msg_multiline',
        delta: 'Done',
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_multiline',
        turn: { id: 'turn_multiline', status: 'completed', items: [], error: null },
      },
    });

    const result = await resultPromise;
    const raw = JSON.parse(result.raw as string);
    expect(raw.notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: 'item/commandExecution/outputDelta',
          params: expect.objectContaining({
            delta: 'line one\nline two',
          }),
        }),
      ]),
    );
    expect(result.output).toBe('Done');
  });

  it('counts notifications without retaining raw notification payloads by default', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        thread_cleanup: 'none',
      },
    });

    const resultPromise = provider.callApi('Run a command with noisy output');

    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const threadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );
    server.send({ id: threadStart.id, result: { thread: { id: 'thr_notification_count' } } });
    const turnStart = await waitForMessage(server, (message) => message.method === 'turn/start');
    server.send({
      id: turnStart.id,
      result: { turn: { id: 'turn_notification_count', status: 'inProgress' } },
    });
    server.send({
      method: 'item/commandExecution/outputDelta',
      params: {
        threadId: 'thr_notification_count',
        turnId: 'turn_notification_count',
        itemId: 'cmd_notification_count',
        delta: 'large-delta-payload'.repeat(100),
      },
    });
    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_notification_count',
        turnId: 'turn_notification_count',
        itemId: 'msg_notification_count',
        delta: 'Done',
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_notification_count',
        turn: { id: 'turn_notification_count', status: 'completed', items: [], error: null },
      },
    });

    const result = await resultPromise;
    const raw = JSON.parse(result.raw as string);
    expect(raw.notifications).toBeUndefined();
    expect(result.raw).not.toContain('large-delta-payload');
    expect(result.metadata?.codexAppServer.notificationCount).toBe(3);
    expect(result.output).toBe('Done');
  });

  it('sanitizes sensitive command metadata', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        thread_cleanup: 'none',
      },
    });

    const resultPromise = provider.callApi('Inspect command output');

    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const threadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );
    server.send({ id: threadStart.id, result: { thread: { id: 'thr_sanitize' } } });
    const turnStart = await waitForMessage(server, (message) => message.method === 'turn/start');
    server.send({
      id: turnStart.id,
      result: { turn: { id: 'turn_sanitize', status: 'inProgress' } },
    });

    server.send({
      method: 'item/completed',
      params: {
        threadId: 'thr_sanitize',
        turnId: 'turn_sanitize',
        item: {
          type: 'commandExecution',
          id: 'cmd_secret',
          command: 'echo api_key=sk-proj-abcdefghijklmnopqrstuvwxyz123456',
          cwd: process.cwd(),
          source: 'shell',
          status: 'completed',
          commandActions: [],
          aggregatedOutput: 'api_key=sk-proj-abcdefghijklmnopqrstuvwxyz123456',
          exitCode: 0,
          durationMs: 1,
        },
      },
    });
    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_sanitize',
        turnId: 'turn_sanitize',
        itemId: 'msg_secret',
        delta: 'Done',
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_sanitize',
        turn: { id: 'turn_sanitize', status: 'completed', items: [], error: null },
      },
    });

    const result = await resultPromise;
    const metadataJson = JSON.stringify(result.metadata);
    expect(metadataJson).not.toContain('sk-proj-abcdefghijklmnopqrstuvwxyz123456');
    expect(metadataJson).toContain('[REDACTED]');

    const rawJson = result.raw as string;
    expect(rawJson).not.toContain('sk-proj-abcdefghijklmnopqrstuvwxyz123456');
    expect(rawJson).toContain('[REDACTED]');
  });

  it('detects skill calls using the resolved app-server process environment', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        cli_env: {
          HOME: '/tmp/codex-app-server-home',
        },
        thread_cleanup: 'none',
      },
    });

    const resultPromise = provider.callApi('Use a skill');

    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const threadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );
    server.send({ id: threadStart.id, result: { thread: { id: 'thr_skill_env' } } });
    const turnStart = await waitForMessage(server, (message) => message.method === 'turn/start');
    server.send({
      id: turnStart.id,
      result: { turn: { id: 'turn_skill_env', status: 'inProgress' } },
    });

    server.send({
      method: 'item/completed',
      params: {
        threadId: 'thr_skill_env',
        turnId: 'turn_skill_env',
        item: {
          type: 'commandExecution',
          id: 'cmd_skill_env',
          command: '/tmp/codex-app-server-home/.codex/skills/home-skill/SKILL.md --help',
          cwd: process.cwd(),
          status: 'completed',
          exitCode: 0,
          durationMs: 1,
        },
      },
    });
    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_skill_env',
        turnId: 'turn_skill_env',
        itemId: 'msg_skill_env',
        delta: 'Skill used',
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_skill_env',
        turn: { id: 'turn_skill_env', status: 'completed', items: [], error: null },
      },
    });

    const result = await resultPromise;
    expect(result.metadata?.skillCalls).toEqual([
      {
        name: 'home-skill',
        path: '/tmp/codex-app-server-home/.codex/skills/home-skill/SKILL.md',
        source: 'heuristic',
      },
    ]);
  });

  it('records attempted repo-local skill calls when command execution fails', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        thread_cleanup: 'none',
      },
    });

    const resultPromise = provider.callApi('Try a repo skill');

    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const threadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );
    server.send({ id: threadStart.id, result: { thread: { id: 'thr_repo_skill' } } });
    const turnStart = await waitForMessage(server, (message) => message.method === 'turn/start');
    server.send({
      id: turnStart.id,
      result: { turn: { id: 'turn_repo_skill', status: 'inProgress' } },
    });

    server.send({
      method: 'item/completed',
      params: {
        threadId: 'thr_repo_skill',
        turnId: 'turn_repo_skill',
        item: {
          type: 'commandExecution',
          id: 'cmd_repo_skill',
          command: '.agents/skills/repo-skill/SKILL.md --help',
          cwd: process.cwd(),
          status: 'failed',
          exitCode: 1,
          durationMs: 1,
        },
      },
    });
    server.send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_repo_skill',
        turnId: 'turn_repo_skill',
        itemId: 'msg_repo_skill',
        delta: 'Skill attempt recorded',
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_repo_skill',
        turn: { id: 'turn_repo_skill', status: 'completed', items: [], error: null },
      },
    });

    const result = await resultPromise;
    expect(result.metadata?.skillCalls).toBeUndefined();
    expect(result.metadata?.attemptedSkillCalls).toEqual([
      {
        name: 'repo-skill',
        path: '.agents/skills/repo-skill/SKILL.md',
        source: 'heuristic',
      },
    ]);
  });

  it('kills the app-server process during cleanup', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        thread_cleanup: 'none',
      },
    });

    const resultPromise = provider.callApi('Hello');
    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const threadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );
    server.send({ id: threadStart.id, result: { thread: { id: 'thr_cleanup' } } });
    const turnStart = await waitForMessage(server, (message) => message.method === 'turn/start');
    server.send({
      id: turnStart.id,
      result: { turn: { id: 'turn_cleanup', status: 'inProgress' } },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_cleanup',
        turn: { id: 'turn_cleanup', status: 'completed', items: [], error: null },
      },
    });

    await resultPromise;
    await provider.cleanup();

    expect(server.proc.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('closes a pending app-server process when cleanup runs during initialization', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        startup_timeout_ms: 100,
        thread_cleanup: 'none',
      },
    });

    const resultPromise = provider.callApi('Hello');
    await waitForMessage(server, (message) => message.method === 'initialize');

    await provider.cleanup();

    await expect(resultPromise).resolves.toMatchObject({
      error: expect.stringContaining('codex app-server connection closed'),
    });
    expect(server.proc.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('resolves an active turn with an error during cleanup', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        thread_cleanup: 'none',
      },
    });

    const resultPromise = provider.callApi('Hello');
    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const threadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );
    server.send({ id: threadStart.id, result: { thread: { id: 'thr_cleanup_active' } } });
    const turnStart = await waitForMessage(server, (message) => message.method === 'turn/start');
    server.send({
      id: turnStart.id,
      result: { turn: { id: 'turn_cleanup_active', status: 'inProgress' } },
    });

    await provider.cleanup();

    await expect(resultPromise).resolves.toMatchObject({
      error: expect.stringContaining('provider cleanup interrupted active turn'),
    });
    expect(server.proc.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('surfaces non-retryable error notifications as provider errors', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: { thread_cleanup: 'none' },
    });

    const resultPromise = provider.callApi('Hello');
    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const threadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );
    server.send({ id: threadStart.id, result: { thread: { id: 'thr_err' } } });
    const turnStart = await waitForMessage(server, (message) => message.method === 'turn/start');
    server.send({ id: turnStart.id, result: { turn: { id: 'turn_err', status: 'inProgress' } } });

    server.send({
      method: 'error',
      params: {
        threadId: 'thr_err',
        turnId: 'turn_err',
        willRetry: false,
        error: { message: 'rate limit exceeded' },
      },
    });

    const result = await resultPromise;
    expect(result.error).toContain('rate limit exceeded');
  });

  it('propagates JSON-RPC error responses as provider errors', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: { thread_cleanup: 'none' },
    });

    const resultPromise = provider.callApi('Hello');
    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const threadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );
    server.send({
      id: threadStart.id,
      error: { code: -32600, message: 'invalid thread params' },
    });

    const result = await resultPromise;
    expect(result.error).toContain('invalid thread params');
  });

  it('returns early when abort signal is already aborted before callApi starts', async () => {
    const provider = new OpenAICodexAppServerProvider({
      config: { thread_cleanup: 'none' },
    });

    const controller = new AbortController();
    controller.abort();

    const result = await provider.callApi('Hello', undefined, {
      abortSignal: controller.signal,
    });

    expect(result.error).toBe('OpenAI Codex app-server call aborted before it started');
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it('sends thread/archive when thread_cleanup is set to archive', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: { thread_cleanup: 'archive' },
    });

    const resultPromise = provider.callApi('Hello');
    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const threadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );
    server.send({ id: threadStart.id, result: { thread: { id: 'thr_archive' } } });
    const turnStart = await waitForMessage(server, (message) => message.method === 'turn/start');
    server.send({
      id: turnStart.id,
      result: { turn: { id: 'turn_archive', status: 'inProgress' } },
    });
    server.send({
      method: 'item/completed',
      params: {
        threadId: 'thr_archive',
        turnId: 'turn_archive',
        item: { id: 'item_1', type: 'agentMessage', text: 'Done' },
      },
    });
    server.send({
      method: 'turn/completed',
      params: { threadId: 'thr_archive', turnId: 'turn_archive', turn: { id: 'turn_archive' } },
    });

    const archiveRequest = await waitForMessage(
      server,
      (message) => message.method === 'thread/archive',
    );
    expect(archiveRequest.params).toMatchObject({ threadId: 'thr_archive' });
    server.send({ id: archiveRequest.id, result: {} });

    const result = await resultPromise;
    expect(result.output).toBe('Done');
  });

  it('sends correct sandboxPolicy for workspace-write mode', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        sandbox_mode: 'workspace-write',
        network_access_enabled: true,
        thread_cleanup: 'none',
      },
    });

    const resultPromise = provider.callApi('Hello');
    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const threadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );
    server.send({ id: threadStart.id, result: { thread: { id: 'thr_ws' } } });
    const turnStart = await waitForMessage(server, (message) => message.method === 'turn/start');

    expect(turnStart.params.sandboxPolicy).toMatchObject({
      type: 'workspaceWrite',
      networkAccess: true,
      excludeTmpdirEnvVar: false,
      excludeSlashTmp: false,
    });
    expect(turnStart.params.sandboxPolicy.writableRoots).toBeDefined();
    expect(turnStart.params.sandboxPolicy.readOnlyAccess).toEqual({ type: 'fullAccess' });

    server.send({ id: turnStart.id, result: { turn: { id: 'turn_ws', status: 'inProgress' } } });
    server.send({
      method: 'turn/completed',
      params: { threadId: 'thr_ws', turnId: 'turn_ws', turn: { id: 'turn_ws' } },
    });
    await resultPromise;
  });

  it('sends correct sandboxPolicy for danger-full-access mode', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        sandbox_mode: 'danger-full-access',
        thread_cleanup: 'none',
      },
    });

    const resultPromise = provider.callApi('Hello');
    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const threadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );
    server.send({ id: threadStart.id, result: { thread: { id: 'thr_full' } } });
    const turnStart = await waitForMessage(server, (message) => message.method === 'turn/start');

    expect(turnStart.params.sandboxPolicy).toEqual({ type: 'dangerFullAccess' });

    server.send({
      id: turnStart.id,
      result: { turn: { id: 'turn_full', status: 'inProgress' } },
    });
    server.send({
      method: 'turn/completed',
      params: { threadId: 'thr_full', turnId: 'turn_full', turn: { id: 'turn_full' } },
    });
    await resultPromise;
  });

  it('responds with empty answers for user_input policy set to empty', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        thread_cleanup: 'none',
        server_request_policy: {
          user_input: 'empty',
        },
      },
    });

    const resultPromise = provider.callApi('Hello');
    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const threadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );
    server.send({ id: threadStart.id, result: { thread: { id: 'thr_ui' } } });
    const turnStart = await waitForMessage(server, (message) => message.method === 'turn/start');
    server.send({
      id: turnStart.id,
      result: { turn: { id: 'turn_ui', status: 'inProgress' } },
    });

    server.send({
      id: 100,
      method: 'item/tool/requestUserInput',
      params: {
        threadId: 'thr_ui',
        turnId: 'turn_ui',
        questions: [{ id: 'q1', label: 'Pick one', options: [{ label: 'A' }, { label: 'B' }] }],
      },
    });

    const userInputResponse = await waitForMessage(server, (message) => message.id === 100);
    expect(userInputResponse.result.answers.q1).toEqual({ answers: [] });

    server.send({
      method: 'item/completed',
      params: {
        threadId: 'thr_ui',
        turnId: 'turn_ui',
        item: { id: 'item_1', type: 'agentMessage', text: 'Ok' },
      },
    });
    server.send({
      method: 'turn/completed',
      params: { threadId: 'thr_ui', turnId: 'turn_ui', turn: { id: 'turn_ui' } },
    });
    const result = await resultPromise;
    expect(result.output).toBe('Ok');
  });

  it('returns JSON-RPC error for unsupported server request methods', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: { thread_cleanup: 'none' },
    });

    const resultPromise = provider.callApi('Hello');
    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const threadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );
    server.send({ id: threadStart.id, result: { thread: { id: 'thr_unsupported' } } });
    const turnStart = await waitForMessage(server, (message) => message.method === 'turn/start');
    server.send({
      id: turnStart.id,
      result: { turn: { id: 'turn_unsupported', status: 'inProgress' } },
    });

    server.send({
      id: 200,
      method: 'some/unknownMethod',
      params: { threadId: 'thr_unsupported', turnId: 'turn_unsupported' },
    });

    const errorResponse = await waitForMessage(
      server,
      (message) => message.id === 200 && message.error !== undefined,
    );
    expect(errorResponse.error.message).toContain('Unsupported codex app-server request');

    server.send({
      method: 'item/completed',
      params: {
        threadId: 'thr_unsupported',
        turnId: 'turn_unsupported',
        item: { id: 'item_1', type: 'agentMessage', text: 'Done' },
      },
    });
    server.send({
      method: 'turn/completed',
      params: {
        threadId: 'thr_unsupported',
        turnId: 'turn_unsupported',
        turn: { id: 'turn_unsupported' },
      },
    });
    const result = await resultPromise;
    expect(result.output).toBe('Done');
  });

  it('responds with map-based user input answers', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        thread_cleanup: 'none',
        server_request_policy: {
          user_input: {
            q1: 'Option A',
            q2: ['X', 'Y'],
          },
        },
      },
    });

    const resultPromise = provider.callApi('Hello');
    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });
    const threadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );
    server.send({ id: threadStart.id, result: { thread: { id: 'thr_map' } } });
    const turnStart = await waitForMessage(server, (message) => message.method === 'turn/start');
    server.send({
      id: turnStart.id,
      result: { turn: { id: 'turn_map', status: 'inProgress' } },
    });

    server.send({
      id: 300,
      method: 'item/tool/requestUserInput',
      params: {
        threadId: 'thr_map',
        turnId: 'turn_map',
        questions: [
          { id: 'q1', label: 'Single answer' },
          { id: 'q2', label: 'Multi answer' },
          { id: 'q3', label: 'Unconfigured' },
        ],
      },
    });

    const userInputResponse = await waitForMessage(server, (message) => message.id === 300);
    expect(userInputResponse.result.answers.q1).toEqual({ answers: ['Option A'] });
    expect(userInputResponse.result.answers.q2).toEqual({ answers: ['X', 'Y'] });
    expect(userInputResponse.result.answers.q3).toEqual({ answers: [] });

    server.send({
      method: 'turn/completed',
      params: { threadId: 'thr_map', turnId: 'turn_map', turn: { id: 'turn_map' } },
    });
    await resultPromise;
  });

  it('propagates base_url to spawn environment', async () => {
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenAICodexAppServerProvider({
      config: {
        apiKey: 'test-key',
        base_url: 'https://custom.example.com/v1',
        thread_cleanup: 'none',
      },
    });

    const resultPromise = provider.callApi('Hello');
    const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
    server.send({ id: initialize.id, result: {} });

    const spawnEnv = mocks.spawn.mock.calls[0][2].env;
    expect(spawnEnv.OPENAI_BASE_URL).toBe('https://custom.example.com/v1');
    expect(spawnEnv.OPENAI_API_BASE_URL).toBe('https://custom.example.com/v1');

    const threadStart = await waitForMessage(
      server,
      (message) => message.method === 'thread/start',
    );
    server.send({ id: threadStart.id, result: { thread: { id: 'thr_base' } } });
    const turnStart = await waitForMessage(server, (message) => message.method === 'turn/start');
    server.send({
      id: turnStart.id,
      result: { turn: { id: 'turn_base', status: 'inProgress' } },
    });
    server.send({
      method: 'turn/completed',
      params: { threadId: 'thr_base', turnId: 'turn_base', turn: { id: 'turn_base' } },
    });
    await resultPromise;
  });
});
