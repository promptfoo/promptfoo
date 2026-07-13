import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PassThrough } from 'stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadApiProvider } from '../../src/providers/index';
import { OpenInterpreterProvider } from '../../src/providers/openinterpreter';
import { providerRegistry } from '../../src/providers/providerRegistry';
import { mockProcessEnv } from '../util/utils';

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return { ...actual, spawn: mocks.spawn };
});

interface MockAppServer {
  proc: any;
  stderr: PassThrough;
  stdout: PassThrough;
  messages: () => any[];
  send: (message: unknown) => void;
}

function createMockAppServer(): MockAppServer {
  const proc = new EventEmitter() as any;
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const stdin = new PassThrough();
  const writes: string[] = [];

  proc.stdout = stdout;
  proc.stderr = stderr;
  proc.stdin = stdin;
  proc.killed = false;
  proc.exitCode = null;
  proc.kill = vi.fn((signal?: NodeJS.Signals) => {
    proc.killed = true;
    proc.exitCode = 0;
    proc.emit('exit', 0, signal ?? null);
    return true;
  });
  stdin.write = vi.fn((chunk: unknown) => {
    writes.push(String(chunk));
    const message = JSON.parse(String(chunk));
    if (message.method === 'thread/unsubscribe' || message.method === 'turn/interrupt') {
      queueMicrotask(() => stdout.write(`${JSON.stringify({ id: message.id, result: {} })}\n`));
    }
    return true;
  }) as any;
  stdin.end = vi.fn(() => stdin) as any;

  return {
    proc,
    stderr,
    stdout,
    messages: () =>
      writes
        .join('')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
    send: (message) => stdout.write(`${JSON.stringify(message)}\n`),
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

async function startTurn(
  server: MockAppServer,
  options: { apiKey?: string; threadId?: string; turnId?: string } = {},
): Promise<{ threadStart: any; turnStart: any }> {
  const initialize = await waitForMessage(server, (message) => message.method === 'initialize');
  server.send({ id: initialize.id, result: {} });

  if (options.apiKey) {
    const login = await waitForMessage(
      server,
      (message) => message.method === 'account/login/start',
    );
    expect(login.params).toEqual({ type: 'apiKey', apiKey: options.apiKey });
    server.send({ id: login.id, result: { type: 'apiKey' } });
  }

  const threadStart = await waitForMessage(
    server,
    (message) => message.method === 'thread/start' || message.method === 'thread/resume',
  );
  server.send({
    id: threadStart.id,
    result: { thread: { id: options.threadId ?? 'thr_interpreter' } },
  });

  const turnStart = await waitForMessage(server, (message) => message.method === 'turn/start');
  server.send({
    id: turnStart.id,
    result: { turn: { id: options.turnId ?? 'turn_interpreter', status: 'inProgress' } },
  });
  return { threadStart, turnStart };
}

function completeTurn(
  server: MockAppServer,
  output: string,
  options: { threadId?: string; turnId?: string } = {},
): void {
  const threadId = options.threadId ?? 'thr_interpreter';
  const turnId = options.turnId ?? 'turn_interpreter';
  server.send({
    method: 'item/completed',
    params: {
      threadId,
      turnId,
      item: { type: 'agentMessage', id: `message_${turnId}`, text: output },
    },
  });
  server.send({
    method: 'turn/completed',
    params: { threadId, turn: { id: turnId, status: 'completed', items: [], error: null } },
  });
}

describe('OpenInterpreterProvider', () => {
  const temporaryRoots: string[] = [];

  beforeEach(() => {
    mocks.spawn.mockReset();
  });

  afterEach(async () => {
    await providerRegistry.shutdownAll();
    for (const root of temporaryRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it.each([
    ['openinterpreter', undefined],
    ['openinterpreter:gpt-5.4', 'gpt-5.4'],
    ['openinterpreter:provider:model-with:colon', 'provider:model-with:colon'],
  ])('loads %s through the provider registry', async (id, model) => {
    const provider = await loadApiProvider(id, {
      options: { config: { skip_git_repo_check: true } },
    });

    expect(provider).toBeInstanceOf(OpenInterpreterProvider);
    expect(provider.id()).toBe(id);
    expect((provider as OpenInterpreterProvider).config.model).toBe(model);
  });

  it('uses an isolated home, an empty workspace, and safe app-server defaults', async () => {
    mockProcessEnv({ OPENAI_API_KEY: undefined, UNRELATED_SECRET_TOKEN: 'do-not-forward' });
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenInterpreterProvider();
    const resultPromise = provider.callApi('Say hello');
    const { threadStart, turnStart } = await startTurn(server);

    const [command, args, options] = mocks.spawn.mock.calls[0];
    expect(command).toBe('interpreter');
    expect(args).toEqual([
      'app-server',
      '--listen',
      'stdio://',
      '-c',
      'analytics.enabled=false',
      '-c',
      'feedback.enabled=false',
      '-c',
      'features.memories=false',
    ]);
    expect(options.shell).toBeUndefined();
    expect(options.env.UNRELATED_SECRET_TOKEN).toBeUndefined();
    expect(options.env.INTERPRETER_HOME).toContain('promptfoo-openinterpreter-home-');
    expect(fs.statSync(options.env.INTERPRETER_HOME).isDirectory()).toBe(true);
    expect(threadStart.params).toMatchObject({
      sandbox: 'read-only',
      approvalPolicy: 'untrusted',
      ephemeral: true,
    });
    expect(threadStart.params.cwd).toContain('promptfoo-openinterpreter-workspace-');
    expect(fs.readdirSync(threadStart.params.cwd)).toEqual([]);
    expect(turnStart.params.input).toEqual([
      { type: 'text', text: 'Say hello', text_elements: [] },
    ]);

    completeTurn(server, 'hello');
    const result = await resultPromise;
    expect(result.output).toBe('hello');
    expect(result.tokenUsage).toBeUndefined();
    expect(result.cost).toBeUndefined();
    expect(result.metadata?.openInterpreter).toMatchObject({
      sandboxMode: 'read-only',
      approvalPolicy: 'untrusted',
    });

    await provider.shutdown();
    expect(server.proc.kill).toHaveBeenCalledWith('SIGTERM');
    expect(fs.existsSync(options.env.INTERPRETER_HOME)).toBe(false);
    expect(fs.existsSync(threadStart.params.cwd)).toBe(false);
  });

  it('maps backend, harness, workspace, environment, schema, and timeout options without a shell', async () => {
    mockProcessEnv({ OPENAI_API_KEY: undefined });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openinterpreter options '));
    temporaryRoots.push(root);
    const workspace = path.join(root, 'workspace $() "quoted" Ω');
    const home = path.join(root, 'home with spaces');
    const extra = path.join(root, 'extra\nworkspace');
    fs.mkdirSync(workspace);
    fs.mkdirSync(home);
    fs.mkdirSync(extra);
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);

    const provider = new OpenInterpreterProvider({
      id: 'openinterpreter:custom-model',
      config: {
        apiKey: 'explicit-test-key',
        interpreter_path: '/opt/Open Interpreter/interpreter $(no-shell)',
        interpreter_home: home,
        working_dir: workspace,
        additional_directories: [extra],
        skip_git_repo_check: true,
        model: 'custom-model',
        model_provider: 'openrouter',
        harness: 'claude-code-bare',
        harness_guidance: false,
        sandbox_mode: 'workspace-write',
        approval_policy: 'on-request',
        network_access_enabled: true,
        output_schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
        request_timeout_ms: 5000,
        startup_timeout_ms: 5000,
        turn_timeout_ms: 10000,
        cli_config: { features: { hooks: false }, custom: { value: '$(echo nope)\nΩ' } },
        cli_env: { ROUTER_TOKEN: 'quoted "value"; $(nope)', NUMERIC_VALUE: 7 },
      },
    });

    const prompt = 'Use quotes " and apostrophes \' and $() safely\nUnicode: Ω';
    const resultPromise = provider.callApi(prompt);
    const { threadStart, turnStart } = await startTurn(server, { apiKey: 'explicit-test-key' });

    const [command, args, options] = mocks.spawn.mock.calls[0];
    expect(command).toBe('/opt/Open Interpreter/interpreter $(no-shell)');
    expect(args).toEqual([
      'app-server',
      '--listen',
      'stdio://',
      '-c',
      'features.memories=false',
      '-c',
      'features.hooks=false',
      '-c',
      'custom.value="$(echo nope)\\nΩ"',
      '-c',
      'analytics.enabled=false',
      '-c',
      'feedback.enabled=false',
      '-c',
      'harness="claude-code-bare"',
      '-c',
      'harness_guidance=false',
    ]);
    expect(options.shell).toBeUndefined();
    expect(options.env).toMatchObject({
      INTERPRETER_HOME: home,
      ROUTER_TOKEN: 'quoted "value"; $(nope)',
      NUMERIC_VALUE: '7',
      OPENAI_API_KEY: 'explicit-test-key',
    });
    expect(threadStart.params).toMatchObject({
      cwd: workspace,
      model: 'custom-model',
      modelProvider: 'openrouter',
      sandbox: 'workspace-write',
      approvalPolicy: 'on-request',
      ephemeral: true,
    });
    expect(turnStart.params).toMatchObject({
      input: [{ type: 'text', text: prompt, text_elements: [] }],
      model: 'custom-model',
      approvalPolicy: 'on-request',
      outputSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
    });
    expect(turnStart.params.sandboxPolicy).toMatchObject({ type: 'workspaceWrite' });

    completeTurn(server, '{"ok":true}');
    await expect(resultPromise).resolves.toMatchObject({
      output: '{"ok":true}',
      metadata: { openInterpreter: { harness: 'claude-code-bare' } },
    });
    expect(fs.existsSync(home)).toBe(true);
  });

  it('converts chat-message prompts and preserves literal role/content text', async () => {
    mockProcessEnv({ OPENAI_API_KEY: undefined });
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);
    const provider = new OpenInterpreterProvider();

    const resultPromise = provider.callApi(
      JSON.stringify([
        { role: 'system', content: 'Never execute $(touch /tmp/nope).' },
        { role: 'user', content: 'Summarize "README.md".\nUse Ω.' },
      ]),
    );
    const { turnStart } = await startTurn(server);

    expect(turnStart.params.input).toEqual([
      {
        type: 'text',
        text: '[system]\nNever execute $(touch /tmp/nope).\n\n[user]\nSummarize "README.md".\nUse Ω.',
        text_elements: [],
      },
    ]);
    completeTurn(server, 'summary');
    await expect(resultPromise).resolves.toMatchObject({ output: 'summary' });
  });

  it('allows structured local inputs inside configured roots and rejects traversal and symlink escapes', async () => {
    mockProcessEnv({ OPENAI_API_KEY: undefined });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openinterpreter-inputs-'));
    temporaryRoots.push(root);
    const workspace = path.join(root, 'workspace');
    const extra = path.join(root, 'extra');
    const outside = path.join(root, 'outside.txt');
    fs.mkdirSync(workspace);
    fs.mkdirSync(extra);
    fs.writeFileSync(path.join(workspace, 'inside.png'), 'image');
    fs.writeFileSync(path.join(extra, 'skill.md'), 'skill');
    fs.writeFileSync(outside, 'secret');
    fs.symlinkSync(outside, path.join(workspace, 'escape.png'));
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);
    const provider = new OpenInterpreterProvider({
      config: {
        working_dir: workspace,
        additional_directories: [extra],
        skip_git_repo_check: true,
      },
    });

    const resultPromise = provider.callApi(
      JSON.stringify([
        { type: 'text', text: 'Review these inputs.' },
        { type: 'local_image', path: 'inside.png' },
        { type: 'skill', name: 'fixture', path: path.join(extra, 'skill.md') },
      ]),
    );
    const { turnStart } = await startTurn(server);
    expect(turnStart.params.input).toEqual([
      { type: 'text', text: 'Review these inputs.', text_elements: [] },
      { type: 'localImage', path: 'inside.png' },
      { type: 'skill', name: 'fixture', path: path.join(extra, 'skill.md') },
    ]);
    completeTurn(server, 'reviewed');
    await expect(resultPromise).resolves.toMatchObject({ output: 'reviewed' });

    const traversal = await provider.callApi(
      JSON.stringify([{ type: 'local_image', path: '../outside.txt' }]),
    );
    const symlink = await provider.callApi(
      JSON.stringify([{ type: 'local_image', path: 'escape.png' }]),
    );
    expect(traversal.error).toContain('outside the configured workspace');
    expect(symlink.error).toContain('outside the configured workspace');
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
  });

  it('resolves relative structured-input workspaces from the provider config base path', async () => {
    mockProcessEnv({ OPENAI_API_KEY: undefined });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openinterpreter-base-path-'));
    temporaryRoots.push(root);
    const workspace = path.join(root, 'workspace');
    fs.mkdirSync(workspace);
    fs.writeFileSync(path.join(workspace, 'inside.png'), 'image');
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);
    const provider = new OpenInterpreterProvider({
      config: { basePath: root, working_dir: 'workspace', skip_git_repo_check: true },
    });

    const resultPromise = provider.callApi(
      JSON.stringify([{ type: 'local_image', path: 'inside.png' }]),
    );
    const { threadStart, turnStart } = await startTurn(server);

    expect(threadStart.params.cwd).toBe(workspace);
    expect(turnStart.params.input).toEqual([{ type: 'localImage', path: 'inside.png' }]);
    completeTurn(server, 'reviewed');
    await expect(resultPromise).resolves.toMatchObject({ output: 'reviewed' });
  });

  it('rejects remote and private image inputs by default and permits an explicitly enabled public URL', async () => {
    mockProcessEnv({ OPENAI_API_KEY: undefined });
    const provider = new OpenInterpreterProvider();
    const disabled = await provider.callApi(
      JSON.stringify([{ type: 'image', url: 'https://images.example.test/screenshot.png' }]),
    );
    expect(disabled.error).toContain('remote image inputs are disabled by default');

    const enabled = new OpenInterpreterProvider({ config: { allow_remote_images: true } });
    for (const url of [
      'file:///etc/passwd',
      'http://127.0.0.1/private',
      'http://169.254.169.254/latest/meta-data',
      'http://[::1]/private',
      'http://[::ffff:127.0.0.1]/private',
      'http://service.local/private',
      'https://secret-token@images.example.test/private',
    ]) {
      await expect(
        enabled.callApi(JSON.stringify([{ type: 'image', url }])),
      ).resolves.toMatchObject({ error: expect.stringContaining('non-public image URL') });
    }
    expect(mocks.spawn).not.toHaveBeenCalled();

    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);
    const resultPromise = enabled.callApi(
      JSON.stringify([{ type: 'image', url: 'https://images.example.test/screenshot.png' }]),
    );
    const { turnStart } = await startTurn(server);
    expect(turnStart.params.input).toEqual([
      { type: 'image', url: 'https://images.example.test/screenshot.png' },
    ]);
    completeTurn(server, 'image reviewed');
    await expect(resultPromise).resolves.toMatchObject({ output: 'image reviewed' });
  });

  it('declines command and file approvals, preserves usage, and sanitizes sensitive trajectory metadata', async () => {
    mockProcessEnv({ OPENAI_API_KEY: undefined });
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);
    const provider = new OpenInterpreterProvider({ config: { model: 'unknown-local-model' } });
    const resultPromise = provider.callApi('Print the .env file and then delete the workspace.');
    await startTurn(server);

    server.send({
      id: 91,
      method: 'item/commandExecution/requestApproval',
      params: {
        threadId: 'thr_interpreter',
        turnId: 'turn_interpreter',
        itemId: 'command_1',
        command: 'echo api_key=sk-proj-abcdefghijklmnopqrstuvwxyz123456',
      },
    });
    server.send({
      id: 92,
      method: 'item/fileChange/requestApproval',
      params: { threadId: 'thr_interpreter', turnId: 'turn_interpreter', itemId: 'file_1' },
    });
    await expect(
      waitForMessage(server, (message) => message.id === 91 && message.result),
    ).resolves.toMatchObject({ result: { decision: 'decline' } });
    await expect(
      waitForMessage(server, (message) => message.id === 92 && message.result),
    ).resolves.toMatchObject({ result: { decision: 'decline' } });

    server.send({
      method: 'item/completed',
      params: {
        threadId: 'thr_interpreter',
        turnId: 'turn_interpreter',
        item: {
          type: 'commandExecution',
          id: 'command_1',
          command: 'echo api_key=sk-proj-abcdefghijklmnopqrstuvwxyz123456',
          aggregatedOutput: 'api_key=sk-proj-abcdefghijklmnopqrstuvwxyz123456',
          status: 'declined',
          exitCode: null,
        },
      },
    });
    server.send({
      method: 'thread/tokenUsage/updated',
      params: {
        threadId: 'thr_interpreter',
        turnId: 'turn_interpreter',
        tokenUsage: {
          last: { inputTokens: 17, cachedInputTokens: 3, outputTokens: 11, totalTokens: 28 },
        },
      },
    });
    completeTurn(server, 'The unsafe request was declined.');

    const result = await resultPromise;
    expect(result.output).toBe('The unsafe request was declined.');
    expect(result.tokenUsage).toEqual({ prompt: 17, completion: 11, total: 28, cached: 3 });
    expect(result.cost).toBeUndefined();
    expect(result.metadata?.openInterpreter).toMatchObject({
      itemCounts: { commandExecution: 1, agentMessage: 1 },
      serverRequests: [
        expect.objectContaining({ method: 'item/commandExecution/requestApproval' }),
        expect.objectContaining({ method: 'item/fileChange/requestApproval' }),
      ],
    });
    expect(JSON.stringify(result.metadata)).not.toContain(
      'sk-proj-abcdefghijklmnopqrstuvwxyz123456',
    );
    expect(result.raw).not.toContain('sk-proj-abcdefghijklmnopqrstuvwxyz123456');
    expect(result.raw).toContain('[REDACTED]');
  });

  it('supports prompt-level harness and approval overrides without changing other rows', async () => {
    mockProcessEnv({ OPENAI_API_KEY: undefined });
    const first = createMockAppServer();
    const second = createMockAppServer();
    mocks.spawn.mockReturnValueOnce(first.proc).mockReturnValueOnce(second.proc);
    const provider = new OpenInterpreterProvider();

    const firstPromise = provider.callApi('First row', {
      prompt: {
        config: { harness: 'minimal', server_request_policy: { command_execution: 'accept' } },
      },
      vars: {},
    } as any);
    await startTurn(first, { threadId: 'thr_first', turnId: 'turn_first' });
    first.send({
      id: 51,
      method: 'item/commandExecution/requestApproval',
      params: { threadId: 'thr_first', turnId: 'turn_first', itemId: 'cmd_first' },
    });
    await expect(
      waitForMessage(first, (message) => message.id === 51 && message.result),
    ).resolves.toMatchObject({ result: { decision: 'accept' } });
    completeTurn(first, 'first', { threadId: 'thr_first', turnId: 'turn_first' });
    await expect(firstPromise).resolves.toMatchObject({
      metadata: { openInterpreter: { harness: 'minimal' } },
    });

    const secondPromise = provider.callApi('Second row');
    await startTurn(second, { threadId: 'thr_second', turnId: 'turn_second' });
    second.send({
      id: 52,
      method: 'item/commandExecution/requestApproval',
      params: { threadId: 'thr_second', turnId: 'turn_second', itemId: 'cmd_second' },
    });
    await expect(
      waitForMessage(second, (message) => message.id === 52 && message.result),
    ).resolves.toMatchObject({ result: { decision: 'decline' } });
    completeTurn(second, 'second', { threadId: 'thr_second', turnId: 'turn_second' });
    await expect(secondPromise).resolves.toMatchObject({ output: 'second' });

    expect(mocks.spawn.mock.calls[0][1]).toContain('harness="minimal"');
    expect(mocks.spawn.mock.calls[1][1]).not.toContain('harness="minimal"');
  });

  it('runs concurrent rows in separate ephemeral processes and keeps their state isolated', async () => {
    mockProcessEnv({ OPENAI_API_KEY: undefined });
    const first = createMockAppServer();
    const second = createMockAppServer();
    mocks.spawn.mockReturnValueOnce(first.proc).mockReturnValueOnce(second.proc);
    const provider = new OpenInterpreterProvider();

    const firstPromise = provider.callApi('row one');
    const secondPromise = provider.callApi('row two');
    const firstTurn = await startTurn(first, { threadId: 'thr_one', turnId: 'turn_one' });
    const secondTurn = await startTurn(second, { threadId: 'thr_two', turnId: 'turn_two' });
    expect(firstTurn.turnStart.params.input[0].text).toBe('row one');
    expect(secondTurn.turnStart.params.input[0].text).toBe('row two');

    completeTurn(second, 'second result', { threadId: 'thr_two', turnId: 'turn_two' });
    completeTurn(first, 'first result', { threadId: 'thr_one', turnId: 'turn_one' });
    await expect(Promise.all([firstPromise, secondPromise])).resolves.toMatchObject([
      { output: 'first result', sessionId: 'thr_one' },
      { output: 'second result', sessionId: 'thr_two' },
    ]);
    expect(mocks.spawn).toHaveBeenCalledTimes(2);
    expect(first.proc.kill).toHaveBeenCalledWith('SIGTERM');
    expect(second.proc.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('returns actionable runtime errors for a missing executable and stderr-only process failure', async () => {
    mockProcessEnv({ OPENAI_API_KEY: undefined });
    const missing = createMockAppServer();
    mocks.spawn.mockReturnValueOnce(missing.proc);
    const missingProvider = new OpenInterpreterProvider({
      config: { interpreter_path: '/missing/interpreter' },
    });
    const missingPromise = missingProvider.callApi('hello');
    await waitForMessage(missing, (message) => message.method === 'initialize');
    missing.proc.emit('error', new Error('spawn /missing/interpreter ENOENT'));
    await expect(missingPromise).resolves.toMatchObject({
      error: expect.stringContaining('Open Interpreter CLI was not found at /missing/interpreter'),
    });

    const failed = createMockAppServer();
    mocks.spawn.mockReturnValueOnce(failed.proc);
    const provider = new OpenInterpreterProvider();
    const resultPromise = provider.callApi('hello');
    await waitForMessage(failed, (message) => message.method === 'initialize');
    failed.stderr.write(
      'backend credential unavailable api_key=sk-proj-abcdefghijklmnopqrstuvwxyz123456',
    );
    failed.proc.emit('exit', 2, null);
    const failedResult = await resultPromise;
    expect(failedResult.error).toContain('backend credential unavailable');
    expect(failedResult.error).toContain('[REDACTED]');
    expect(failedResult.error).not.toContain('sk-proj-abcdefghijklmnopqrstuvwxyz123456');
  });

  it('returns an abort error and cleans up the app-server process', async () => {
    mockProcessEnv({ OPENAI_API_KEY: undefined });
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);
    const provider = new OpenInterpreterProvider();
    const abort = new AbortController();
    const resultPromise = provider.callApi('wait', undefined, { abortSignal: abort.signal } as any);
    await startTurn(server);
    abort.abort();

    await expect(resultPromise).resolves.toMatchObject({
      error: 'Open Interpreter app-server call aborted',
    });
    expect(server.proc.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('fails closed and cleans up when an upstream JSON-RPC message is oversized', async () => {
    mockProcessEnv({ OPENAI_API_KEY: undefined });
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);
    const provider = new OpenInterpreterProvider();
    const resultPromise = provider.callApi('return a large result');
    await startTurn(server);

    server.send({
      method: 'item/completed',
      params: {
        threadId: 'thr_interpreter',
        turnId: 'turn_interpreter',
        item: { type: 'agentMessage', id: 'huge', text: 'x'.repeat(5_000_001) },
      },
    });

    await expect(resultPromise).resolves.toMatchObject({
      error: expect.stringContaining('Open Interpreter app-server JSON-RPC message exceeded'),
    });
    expect(server.proc.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('bounds accumulated streamed events and cleans up a flooding upstream process', async () => {
    mockProcessEnv({ OPENAI_API_KEY: undefined });
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);
    const provider = new OpenInterpreterProvider();
    const resultPromise = provider.callApi('stream a large result');
    await startTurn(server);

    for (let index = 0; index < 3; index++) {
      server.send({
        method: 'item/agentMessage/delta',
        params: {
          threadId: 'thr_interpreter',
          turnId: 'turn_interpreter',
          itemId: 'stream',
          delta: 'x'.repeat(4_000_000),
        },
      });
    }

    await expect(resultPromise).resolves.toMatchObject({
      error: expect.stringContaining('Open Interpreter app-server turn events exceeded'),
    });
    expect(server.proc.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('rejects incompatible config and missing homes before spawning a runtime', () => {
    expect(() => new OpenInterpreterProvider({ config: { harness: 'unknown' } as any })).toThrow(
      /Invalid Open Interpreter config: harness/,
    );
    expect(
      () => new OpenInterpreterProvider({ config: { sandbox_mode: 'readonly' } as any }),
    ).toThrow(/Invalid Open Interpreter config: sandbox_mode/);
    expect(
      () => new OpenInterpreterProvider({ config: { unsupported_option: true } as any }),
    ).toThrow(/Invalid Open Interpreter config: \(root\)/);
    expect(
      () =>
        new OpenInterpreterProvider({
          config: { interpreter_home: '/path/that/does/not/exist' },
        }),
    ).toThrow(/Open Interpreter home .* does not exist or is not accessible/);
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it('returns invalid prompt-level config as a row error without starting a process', async () => {
    const provider = new OpenInterpreterProvider();

    await expect(
      provider.callApi('hello', {
        prompt: { config: { harness: 'unsupported-harness' } },
        vars: {},
      } as any),
    ).resolves.toMatchObject({
      error: expect.stringContaining('Invalid Open Interpreter config: harness'),
    });
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
});
