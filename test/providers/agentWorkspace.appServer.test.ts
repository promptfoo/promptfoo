import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type AgentWorkspace,
  clearRepositoryEnv,
  createAgentWorkspace,
} from '../../src/providers/agentWorkspace';
import { OpenAICodexAppServerProvider } from '../../src/providers/openai/codex-app-server';
import { OpenInterpreterProvider } from '../../src/providers/openinterpreter';
import { mockProcessEnv } from '../util/utils';

import type { CallApiContextParams } from '../../src/types/index';

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));

vi.mock('child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('child_process')>()),
  spawn: mocks.spawn,
}));

// Speak the app-server protocol locally, inspecting Git from the requested thread directory.
const appServerScript = `
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const readline = require('node:readline');
const threads = new Map();
let nextId = 0;
const send = (message) => process.stdout.write(JSON.stringify(message) + '\\n');
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const { id, method, params } = JSON.parse(line);
  if (id === undefined) return;
  if (method === 'thread/start') {
    const threadId = 'thread-' + nextId++;
    threads.set(threadId, params.cwd);
    send({ id, result: { thread: { id: threadId, cwd: params.cwd } } });
  } else if (method === 'turn/start') {
    const threadId = params.threadId;
    const turnId = 'turn-' + nextId++;
    const cwd = threads.get(threadId);
    const output = JSON.stringify({
      root: fs.realpathSync.native(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim()),
      diff: execFileSync('git', ['diff', '--', 'file.txt'], { cwd, encoding: 'utf8' }),
      value: process.env.AGENT_WORKSPACE_TEST_VALUE,
      gitSshCommand: process.env.GIT_SSH_COMMAND,
      repositorySelectors: ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE'].filter((key) => key in process.env),
      pid: process.pid,
    });
    send({ id, result: { turn: { id: turnId, status: 'inProgress' } } });
    send({ method: 'item/completed', params: { threadId, turnId,
      item: { type: 'agentMessage', id: 'message', text: output } } });
    send({ method: 'turn/completed', params: { threadId,
      turn: { id: turnId, status: 'completed', items: [], error: null } } });
  } else {
    send({ id, result: {} });
  }
});
`;

function context(workingDir: string): CallApiContextParams {
  return {
    prompt: { raw: 'Inspect changes', label: 'grader', config: { working_dir: workingDir } },
    vars: {},
  };
}

describe('managed workspace environments for app-server graders', () => {
  let root: string;
  let source: string;
  let workspace: AgentWorkspace;
  let provider: OpenAICodexAppServerProvider | OpenInterpreterProvider | undefined;
  let restoreEnv: (() => void) | undefined;
  let gitEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    vi.resetAllMocks();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-workspace-app-server-'));
    source = path.join(root, 'source');
    gitEnv = { ...process.env };
    clearRepositoryEnv(gitEnv);
    execFileSync('git', ['init', '--quiet', source], { env: gitEnv });
    fs.writeFileSync(path.join(source, 'file.txt'), 'before\n');
    execFileSync('git', ['add', 'file.txt'], { cwd: source, env: gitEnv });
    workspace = await createAgentWorkspace(source, 'copy');
    fs.writeFileSync(path.join(workspace.dir, 'file.txt'), 'after\n');

    const scriptPath = path.join(root, 'app-server.cjs');
    fs.writeFileSync(scriptPath, appServerScript);
    const childProcess = await vi.importActual<typeof import('child_process')>('child_process');
    mocks.spawn.mockImplementation((_command, _args, options) =>
      childProcess.spawn(process.execPath, [scriptPath], options),
    );
  });

  afterEach(async () => {
    await provider?.shutdown();
    provider = undefined;
    restoreEnv?.();
    restoreEnv = undefined;
    await workspace.remove();
    fs.rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  it.each([
    ['Codex app-server', 'inherited'],
    ['Codex app-server', 'cli_env'],
    ['Open Interpreter', 'inherited'],
    ['Open Interpreter', 'cli_env'],
  ])('isolates %s Git commands from %s selectors across reused calls', async (kind, envSource) => {
    const repositoryEnv = {
      GIT_DIR: path.join(source, '.git'),
      GIT_WORK_TREE: source,
      GIT_INDEX_FILE: path.join(source, '.git', 'index'),
      GIT_SSH_COMMAND: 'preserved-ssh-command',
      AGENT_WORKSPACE_TEST_VALUE: 'preserved',
    };
    restoreEnv = mockProcessEnv({
      ...gitEnv,
      OPENAI_API_KEY: undefined,
      CODEX_API_KEY: undefined,
      ...(envSource === 'inherited' ? repositoryEnv : {}),
    });
    const config = {
      working_dir: source,
      inherit_process_env: envSource === 'inherited',
      cli_env: envSource === 'cli_env' ? repositoryEnv : undefined,
      reuse_server: true,
      thread_cleanup: 'none' as const,
    };
    provider =
      kind === 'Codex app-server'
        ? new OpenAICodexAppServerProvider({ config })
        : new OpenInterpreterProvider({ config });

    const ordinary = await provider.callApi('Inspect changes');
    expect(ordinary.error).toBeUndefined();
    const ordinaryOutput = JSON.parse(ordinary.output as string);
    expect(ordinaryOutput).toMatchObject({
      root: fs.realpathSync.native(source),
      diff: '',
      repositorySelectors: ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE'],
    });

    const first = await provider.callApi('Inspect changes', context(workspace.dir));
    expect(first.error).toBeUndefined();
    const firstOutput = JSON.parse(first.output as string);
    expect(firstOutput).toMatchObject({
      root: fs.realpathSync.native(workspace.dir),
      diff: expect.stringContaining('+after'),
      value: 'preserved',
      gitSshCommand: 'preserved-ssh-command',
      repositorySelectors: [],
    });
    expect(firstOutput.pid).not.toBe(ordinaryOutput.pid);

    fs.writeFileSync(path.join(workspace.dir, 'file.txt'), 'changed again\n');
    const second = await provider.callApi('Inspect changes', context(workspace.dir));
    expect(second.error).toBeUndefined();
    expect(JSON.parse(second.output as string)).toEqual({
      ...firstOutput,
      diff: expect.stringContaining('+changed again'),
    });
    expect(mocks.spawn).toHaveBeenCalledTimes(2);
    expect(execFileSync('git', ['diff'], { cwd: source, env: gitEnv, encoding: 'utf8' })).toBe('');
  });
});
