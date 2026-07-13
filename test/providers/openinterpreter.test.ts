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
    expect(provider.getApiKey()).toBeUndefined();
    expect(provider.requiresApiKey()).toBe(false);
    expect(provider.toString()).toBe('[Open Interpreter Provider]');
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

    await provider.cleanup();
    expect(server.proc.kill).toHaveBeenCalledWith('SIGTERM');
    expect(fs.existsSync(options.env.INTERPRETER_HOME)).toBe(false);
    expect(fs.existsSync(threadStart.params.cwd)).toBe(false);
  });

  it('maps backend, harness, workspace, environment, schema, and timeout options without a shell', async () => {
    mockProcessEnv({ OPENAI_API_KEY: undefined });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openinterpreter options '));
    temporaryRoots.push(root);
    const workspace = path.join(root, "workspace $() 'quoted' Ω");
    const home = path.join(root, 'home with spaces');
    const extra = path.join(root, 'extra workspace Ω');
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
    fs.symlinkSync(outside, path.join(workspace, 'escape.png'), 'file');
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
        { type: 'mention', name: 'connector', path: 'app://connector-id' },
        { type: 'mention', name: 'plugin', path: 'plugin://plugin-name@marketplace' },
      ]),
    );
    const { turnStart } = await startTurn(server);
    expect(turnStart.params.input).toEqual([
      { type: 'text', text: 'Review these inputs.', text_elements: [] },
      { type: 'localImage', path: path.join(workspace, 'inside.png') },
      { type: 'skill', name: 'fixture', path: path.join(extra, 'skill.md') },
      { type: 'mention', name: 'connector', path: 'app://connector-id' },
      { type: 'mention', name: 'plugin', path: 'plugin://plugin-name@marketplace' },
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
    expect(turnStart.params.input).toEqual([
      { type: 'localImage', path: path.join(workspace, 'inside.png') },
    ]);
    completeTurn(server, 'reviewed');
    await expect(resultPromise).resolves.toMatchObject({ output: 'reviewed' });
  });

  it('forwards only the validated absolute local path when the launch directory contains a different file', async () => {
    mockProcessEnv({ OPENAI_API_KEY: undefined });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openinterpreter-path-leak-'));
    temporaryRoots.push(root);
    const workspace = path.join(root, 'workspace');
    fs.mkdirSync(workspace);
    fs.writeFileSync(path.join(root, '.env'), 'launch-directory-secret');
    fs.writeFileSync(path.join(workspace, '.env'), 'workspace-image');
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);
    const provider = new OpenInterpreterProvider({
      config: { working_dir: workspace, skip_git_repo_check: true },
    });

    const resultPromise = provider.callApi(JSON.stringify([{ type: 'local_image', path: '.env' }]));
    const { turnStart } = await startTurn(server);
    expect(turnStart.params.input).toEqual([
      { type: 'localImage', path: path.join(workspace, '.env') },
    ]);
    completeTurn(server, 'reviewed');
    await expect(resultPromise).resolves.toMatchObject({ output: 'reviewed' });

    fs.rmSync(path.join(workspace, '.env'));
    await expect(
      provider.callApi(JSON.stringify([{ type: 'local_image', path: '.env' }])),
    ).resolves.toMatchObject({
      error: expect.stringContaining('does not exist or is not accessible'),
    });
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
  });

  it('rejects an absolute cross-drive relative result using portable Windows path semantics', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openinterpreter-win32-path-'));
    temporaryRoots.push(root);
    const workspace = path.join(root, 'workspace');
    fs.mkdirSync(workspace);
    fs.writeFileSync(path.join(workspace, 'inside.png'), 'image');
    const provider = new OpenInterpreterProvider({
      config: { working_dir: workspace, skip_git_repo_check: true },
    });
    vi.spyOn(path, 'relative').mockReturnValue('D:\\outside\\secret.png');
    vi.spyOn(path, 'isAbsolute').mockImplementation(path.win32.isAbsolute);

    await expect(
      provider.callApi(JSON.stringify([{ type: 'local_image', path: 'inside.png' }])),
    ).resolves.toMatchObject({
      error: expect.stringContaining('outside the configured workspace'),
    });
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it('resolves interpreter_path and interpreter_home from the config directory while preserving PATH lookup', async () => {
    mockProcessEnv({ OPENAI_API_KEY: undefined });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openinterpreter-config-paths-'));
    temporaryRoots.push(root);
    const home = path.join(root, 'oi-home');
    const workspace = path.join(root, 'workspace');
    fs.mkdirSync(home);
    fs.mkdirSync(workspace);
    const relativeServer = createMockAppServer();
    const pathServer = createMockAppServer();
    mocks.spawn.mockReturnValueOnce(relativeServer.proc).mockReturnValueOnce(pathServer.proc);

    const relative = new OpenInterpreterProvider({
      config: {
        basePath: root,
        interpreter_path: './bin/oi',
        interpreter_home: './oi-home',
        working_dir: './workspace',
        skip_git_repo_check: true,
      },
    });
    const relativePromise = relative.callApi('relative paths');
    await startTurn(relativeServer);
    expect(mocks.spawn.mock.calls[0][0]).toBe(path.join(root, 'bin', 'oi'));
    expect(mocks.spawn.mock.calls[0][2].env.INTERPRETER_HOME).toBe(home);
    completeTurn(relativeServer, 'relative');
    await expect(relativePromise).resolves.toMatchObject({ output: 'relative' });

    const fromPath = new OpenInterpreterProvider({ config: { interpreter_path: 'oi' } });
    const pathPromise = fromPath.callApi('PATH lookup');
    await startTurn(pathServer);
    expect(mocks.spawn.mock.calls[1][0]).toBe('oi');
    completeTurn(pathServer, 'path');
    await expect(pathPromise).resolves.toMatchObject({ output: 'path' });
  });

  it('uses a config-relative INTERPRETER_HOME from cli_env and ignores a missing optional root', async () => {
    mockProcessEnv({ OPENAI_API_KEY: undefined });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openinterpreter-env-home-'));
    temporaryRoots.push(root);
    const home = path.join(root, 'home');
    const workspace = path.join(root, 'workspace');
    fs.mkdirSync(home);
    fs.mkdirSync(workspace);
    fs.writeFileSync(path.join(workspace, 'inside.png'), 'image');
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);
    const provider = new OpenInterpreterProvider({
      config: {
        basePath: root,
        working_dir: './workspace',
        additional_directories: ['./optional-missing-root'],
        skip_git_repo_check: true,
        cli_env: { INTERPRETER_HOME: './home' },
      },
    });

    const resultPromise = provider.callApi(
      JSON.stringify([{ type: 'local_image', path: 'inside.png' }]),
    );
    const { turnStart } = await startTurn(server);
    expect(mocks.spawn.mock.calls[0][2].env.INTERPRETER_HOME).toBe(home);
    expect(turnStart.params.input).toEqual([
      { type: 'localImage', path: path.join(workspace, 'inside.png') },
    ]);
    completeTurn(server, 'reviewed');
    await expect(resultPromise).resolves.toMatchObject({ output: 'reviewed' });
  });

  it('passes non-array JSON and malformed structured arrays through as literal text', async () => {
    mockProcessEnv({ OPENAI_API_KEY: undefined });
    const first = createMockAppServer();
    const second = createMockAppServer();
    mocks.spawn.mockReturnValueOnce(first.proc).mockReturnValueOnce(second.proc);
    const provider = new OpenInterpreterProvider();

    for (const [server, prompt] of [
      [first, '{"task":"literal JSON"}'],
      [second, '[{"unexpected":true}]'],
    ] as const) {
      const resultPromise = provider.callApi(prompt);
      const { turnStart } = await startTurn(server);
      expect(turnStart.params.input).toEqual([{ type: 'text', text: prompt, text_elements: [] }]);
      completeTurn(server, 'literal');
      await expect(resultPromise).resolves.toMatchObject({ output: 'literal' });
    }
  });

  it('does not leak the generated-workspace Git bypass into a prompt-level real workspace', async () => {
    mockProcessEnv({ OPENAI_API_KEY: undefined });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openinterpreter-git-check-'));
    temporaryRoots.push(root);
    const workspace = path.join(root, 'not-a-repo');
    fs.mkdirSync(workspace);
    const existsSync = fs.existsSync;
    vi.spyOn(fs, 'existsSync').mockImplementation((candidate) =>
      String(candidate).endsWith(`${path.sep}.git`) ? false : existsSync(candidate),
    );
    const provider = new OpenInterpreterProvider();

    await expect(
      provider.callApi('real workspace', {
        prompt: { config: { working_dir: workspace } },
        vars: {},
      } as any),
    ).resolves.toMatchObject({ error: expect.stringContaining('not inside a Git repository') });
    expect(mocks.spawn).not.toHaveBeenCalled();

    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);
    const defaultPromise = provider.callApi('temporary workspace');
    const { threadStart } = await startTurn(server);
    expect(threadStart.params.cwd).toContain('promptfoo-openinterpreter-workspace-');
    completeTurn(server, 'temporary');
    await expect(defaultPromise).resolves.toMatchObject({ output: 'temporary' });
  });

  it.each([
    ['native', 'harness=""'],
    ['claude-code', 'harness="claude-code"'],
    ['claude-code-bare', 'harness="claude-code-bare"'],
    ['deepseek-tui', 'harness="deepseek-tui"'],
    ['kimi-code', 'harness="kimi-code"'],
    ['kimi-cli', 'harness="kimi-cli"'],
    ['zcode', 'harness="zcode"'],
    ['little-coder', 'harness="little-coder"'],
    ['mini-swe-agent', 'harness="mini-swe-agent"'],
    ['opencode', 'harness="opencode"'],
    ['pi', 'harness="pi"'],
    ['qwen-code', 'harness="qwen-code"'],
    ['swe-agent', 'harness="swe-agent"'],
    ['terminus-2', 'harness="terminus-2"'],
    ['minimal', 'harness="minimal"'],
    ['custom-harness', 'harness="custom-harness"'],
  ])('maps the upstream %s harness without inventing a native enum value', async (harness, expected) => {
    mockProcessEnv({ OPENAI_API_KEY: undefined });
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);
    const provider = new OpenInterpreterProvider({ config: { harness } });

    const resultPromise = provider.callApi('harness mapping');
    await startTurn(server);
    expect(mocks.spawn.mock.calls[0][1]).toContain(expected);
    completeTurn(server, 'mapped');
    await expect(resultPromise).resolves.toMatchObject({ output: 'mapped' });
  });

  it('accepts bounded inline image data and rejects all remote or non-data image URLs before spawn', async () => {
    mockProcessEnv({ OPENAI_API_KEY: undefined });
    const provider = new OpenInterpreterProvider();
    for (const url of [
      'file:///etc/passwd',
      'http://127.0.0.1/private',
      'http://169.254.169.254/latest/meta-data',
      'https://attacker-controlled.example/private',
    ]) {
      await expect(
        provider.callApi(JSON.stringify([{ type: 'image', url }])),
      ).resolves.toMatchObject({
        error: expect.stringContaining('inline data URL'),
      });
    }
    await expect(
      provider.callApi(
        JSON.stringify([{ type: 'image', url: `data:image/png;base64,${'x'.repeat(5_000_001)}` }]),
      ),
    ).resolves.toMatchObject({ error: expect.stringContaining('inline image inputs exceeded') });
    expect(mocks.spawn).not.toHaveBeenCalled();

    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);
    const resultPromise = provider.callApi(
      JSON.stringify([{ type: 'image', url: 'data:image/png;base64,aW1hZ2U=' }]),
    );
    const { turnStart } = await startTurn(server);
    expect(turnStart.params.input).toEqual([
      { type: 'image', url: 'data:image/png;base64,aW1hZ2U=' },
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
    const provider = new OpenInterpreterProvider({
      config: {
        cli_config: {
          analytics: { enabled: true, sink: 'base' },
          feedback: { enabled: true },
          features: { hooks: false, nested: { base: true } },
        },
      },
    });

    const firstPromise = provider.callApi('First row', {
      prompt: {
        config: {
          harness: 'minimal',
          cli_config: { features: { memories: true, nested: { row: true } } },
          server_request_policy: { command_execution: 'accept' },
        },
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
    expect(mocks.spawn.mock.calls[0][1]).toEqual(
      expect.arrayContaining([
        'analytics.enabled=true',
        'analytics.sink="base"',
        'feedback.enabled=true',
        'features.hooks=false',
        'features.memories=true',
        'features.nested.base=true',
        'features.nested.row=true',
      ]),
    );
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
    const firstWorkspace = firstTurn.threadStart.params.cwd;
    const secondWorkspace = secondTurn.threadStart.params.cwd;
    expect(firstWorkspace).not.toBe(secondWorkspace);
    fs.writeFileSync(path.join(firstWorkspace, 'row-one.txt'), 'row one state');
    expect(fs.existsSync(path.join(secondWorkspace, 'row-one.txt'))).toBe(false);
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
    expect(fs.existsSync(firstWorkspace)).toBe(false);
    expect(fs.existsSync(secondWorkspace)).toBe(false);
  });

  it('reuses the process and thread when persist_threads is explicitly requested', async () => {
    mockProcessEnv({ OPENAI_API_KEY: undefined });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openinterpreter-persistent-thread-'));
    temporaryRoots.push(root);
    const server = createMockAppServer();
    mocks.spawn.mockReturnValue(server.proc);
    const provider = new OpenInterpreterProvider({
      config: { working_dir: root, skip_git_repo_check: true, persist_threads: true },
    });

    const firstPromise = provider.callApi('same prompt');
    const firstTurn = await startTurn(server, { threadId: 'thr_persisted', turnId: 'turn_first' });
    completeTurn(server, 'first', { threadId: 'thr_persisted', turnId: 'turn_first' });
    await expect(firstPromise).resolves.toMatchObject({
      output: 'first',
      sessionId: 'thr_persisted',
    });

    const secondPromise = provider.callApi('same prompt');
    const secondTurn = await waitForMessage(
      server,
      (message) =>
        message.method === 'turn/start' &&
        message.params?.threadId === 'thr_persisted' &&
        message.id !== firstTurn.turnStart.id,
    );
    server.send({
      id: secondTurn.id,
      result: { turn: { id: 'turn_second', status: 'inProgress' } },
    });
    completeTurn(server, 'second', { threadId: 'thr_persisted', turnId: 'turn_second' });
    await expect(secondPromise).resolves.toMatchObject({
      output: 'second',
      sessionId: 'thr_persisted',
    });
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    expect(server.messages().filter((message) => message.method === 'thread/start')).toHaveLength(
      1,
    );
  });

  it('allocates and removes a fresh writable temporary workspace for sequential rows', async () => {
    mockProcessEnv({ OPENAI_API_KEY: undefined });
    const first = createMockAppServer();
    const second = createMockAppServer();
    mocks.spawn.mockReturnValueOnce(first.proc).mockReturnValueOnce(second.proc);
    const provider = new OpenInterpreterProvider({
      config: {
        sandbox_mode: 'workspace-write',
        server_request_policy: { command_execution: 'accept', file_change: 'accept' },
      },
    });

    const firstPromise = provider.callApi('first row');
    const firstTurn = await startTurn(first, { threadId: 'thr_first', turnId: 'turn_first' });
    const firstWorkspace = firstTurn.threadStart.params.cwd;
    fs.writeFileSync(path.join(firstWorkspace, 'row-state.txt'), 'must not leak');
    completeTurn(first, 'first', { threadId: 'thr_first', turnId: 'turn_first' });
    await expect(firstPromise).resolves.toMatchObject({ output: 'first' });
    expect(fs.existsSync(firstWorkspace)).toBe(false);

    const secondPromise = provider.callApi('second row');
    const secondTurn = await startTurn(second, { threadId: 'thr_second', turnId: 'turn_second' });
    const secondWorkspace = secondTurn.threadStart.params.cwd;
    expect(secondWorkspace).not.toBe(firstWorkspace);
    expect(fs.existsSync(path.join(secondWorkspace, 'row-state.txt'))).toBe(false);
    completeTurn(second, 'second', { threadId: 'thr_second', turnId: 'turn_second' });
    await expect(secondPromise).resolves.toMatchObject({ output: 'second' });
    expect(fs.existsSync(secondWorkspace)).toBe(false);
  });

  it('returns actionable runtime errors for a missing executable and stderr-only process failure', async () => {
    mockProcessEnv({ OPENAI_API_KEY: undefined });
    const missing = createMockAppServer();
    mocks.spawn.mockReturnValueOnce(missing.proc);
    const missingProvider = new OpenInterpreterProvider({
      config: { interpreter_path: '/missing/oi' },
    });
    const missingPromise = missingProvider.callApi('hello');
    await waitForMessage(missing, (message) => message.method === 'initialize');
    missing.proc.emit('error', new Error('spawn /missing/oi ENOENT'));
    await expect(missingPromise).resolves.toMatchObject({
      error: expect.stringContaining('Open Interpreter CLI was not found at /missing/oi'),
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

    expect(server.proc.kill).toHaveBeenCalledWith('SIGTERM');

    await expect(resultPromise).resolves.toMatchObject({
      error: expect.stringContaining('Open Interpreter app-server turn events exceeded'),
    });
    expect(server.proc.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('rejects incompatible config and missing homes before spawning a runtime', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openinterpreter-invalid-home-'));
    temporaryRoots.push(root);
    const homeFile = path.join(root, 'not-a-directory');
    fs.writeFileSync(homeFile, 'file');

    expect(
      () => new OpenInterpreterProvider({ config: { sandbox_mode: 'readonly' } as any }),
    ).toThrow(/Invalid Open Interpreter config: sandbox_mode/);
    expect(
      () => new OpenInterpreterProvider({ config: { unsupported_option: true } as any }),
    ).toThrow(/Invalid Open Interpreter config: \(root\)/);
    expect(
      () => new OpenInterpreterProvider({ config: { allow_remote_images: true } as any }),
    ).toThrow(/Invalid Open Interpreter config: \(root\)/);
    expect(() => new OpenInterpreterProvider({ config: { persist_threads: true } })).toThrow(
      /persist_threads requires an explicit working_dir/,
    );
    expect(
      () =>
        new OpenInterpreterProvider({
          config: { working_dir: '/tmp', persist_threads: true, reuse_server: false },
        }),
    ).toThrow(/persist_threads cannot be combined with reuse_server: false/);
    expect(
      () =>
        new OpenInterpreterProvider({
          config: { interpreter_home: '/path/that/does/not/exist' },
        }),
    ).toThrow(/Open Interpreter home .* does not exist or is not accessible/);
    expect(() => new OpenInterpreterProvider({ config: { interpreter_home: homeFile } })).toThrow(
      /Open Interpreter home .* not a directory/,
    );
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it('removes an allocated temporary home if delegate construction fails', () => {
    const prefix = 'promptfoo-openinterpreter-home-';
    const before = fs.readdirSync(os.tmpdir()).filter((entry) => entry.startsWith(prefix));
    vi.spyOn(providerRegistry, 'register').mockImplementationOnce(() => {
      throw new Error('registration failed');
    });

    expect(() => new OpenInterpreterProvider()).toThrow('registration failed');
    expect(fs.readdirSync(os.tmpdir()).filter((entry) => entry.startsWith(prefix))).toEqual(before);
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it('returns invalid prompt-level config as a row error without starting a process', async () => {
    const provider = new OpenInterpreterProvider();

    await expect(
      provider.callApi('hello', {
        prompt: { config: { harness: '' } },
        vars: {},
      } as any),
    ).resolves.toMatchObject({
      error: expect.stringContaining('Invalid Open Interpreter config: harness'),
    });
    for (const config of [{ approval_policiy: 'never' }, { sandbox: 'workspace-write' }]) {
      await expect(
        provider.callApi('hello', { prompt: { config }, vars: {} } as any),
      ).resolves.toMatchObject({
        error: expect.stringContaining('Invalid Open Interpreter config'),
      });
    }
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
});
