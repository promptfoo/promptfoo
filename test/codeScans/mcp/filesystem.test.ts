import { EventEmitter } from 'events';
import path from 'path';
import type { ChildProcess } from 'child_process';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockProcessEnv } from '../../util/utils';

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs')>()),
  existsSync: mocks.existsSync,
}));

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    spawn: mocks.spawn,
  };
});

import {
  startFilesystemMcpServer,
  waitForFilesystemMcpServerReady,
} from '../../../src/codeScan/mcp/filesystem';

class FakeChildProcess extends EventEmitter {
  exitCode: number | null = null;
  killed = false;
  kill = vi.fn();
  pid = 1234;
  signalCode: NodeJS.Signals | null = null;
  stderr = new EventEmitter();
}

function createFakeProcess(): ChildProcess & { stderr: EventEmitter } {
  return new FakeChildProcess() as unknown as ChildProcess & { stderr: EventEmitter };
}

describe('filesystem MCP server management', () => {
  const originalEnv = { ...process.env };
  let restoreEnv: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    mocks.existsSync.mockReturnValue(true); // lets Windows find npm's npx-cli.js
    restoreEnv = mockProcessEnv(originalEnv, { clear: true });
  });

  afterEach(() => {
    restoreEnv();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('strips npm before config when spawning the filesystem MCP server', () => {
    const restoreNpmConfig = mockProcessEnv({
      NPM_CONFIG_BEFORE: '2026-03-29T00:00:00.000Z',
      npm_config_before: '2026-03-29T00:00:00.000Z',
    });
    try {
      mocks.spawn.mockReturnValue(createFakeProcess());

      startFilesystemMcpServer(process.cwd());

      const spawnOptions = mocks.spawn.mock.calls[0]?.[2];
      expect(spawnOptions?.env?.NPM_CONFIG_BEFORE).toBeUndefined();
      expect(spawnOptions?.env?.npm_config_before).toBeUndefined();
    } finally {
      restoreNpmConfig();
    }
  });

  it('resolves when the filesystem MCP server prints its ready marker', async () => {
    const mcpProcess = createFakeProcess();
    const ready = waitForFilesystemMcpServerReady(mcpProcess);

    mcpProcess.stderr.emit('data', Buffer.from('Secure MCP Filesystem Server running on stdio\n'));

    await expect(ready).resolves.toBeUndefined();
  });

  it('resolves when the ready marker is split across stderr chunks', async () => {
    const mcpProcess = createFakeProcess();
    const ready = waitForFilesystemMcpServerReady(mcpProcess);

    mcpProcess.stderr.emit('data', Buffer.from('Secure MCP Filesystem Server '));
    mcpProcess.stderr.emit('data', Buffer.from('running on stdio\n'));

    await expect(ready).resolves.toBeUndefined();
  });

  it('rejects when the filesystem MCP server exits before it is ready', async () => {
    const mcpProcess = createFakeProcess();
    const ready = waitForFilesystemMcpServerReady(mcpProcess);

    mcpProcess.emit('exit', 1, null);

    await expect(ready).rejects.toThrow('Filesystem MCP server exited before ready: code 1');
  });

  it('rejects immediately when the process has already exited', async () => {
    const mcpProcess = createFakeProcess();
    Object.defineProperty(mcpProcess, 'exitCode', { value: 1 });

    await expect(waitForFilesystemMcpServerReady(mcpProcess)).rejects.toThrow(
      'Filesystem MCP server exited before ready: code 1',
    );
  });

  it('rejects immediately when the process was already killed', async () => {
    const mcpProcess = createFakeProcess();
    Object.defineProperty(mcpProcess, 'killed', { value: true });

    await expect(waitForFilesystemMcpServerReady(mcpProcess)).rejects.toThrow(
      'Filesystem MCP server exited before ready: unknown reason',
    );
  });

  it('rejects when stderr is unavailable', async () => {
    const mcpProcess = createFakeProcess();
    Object.defineProperty(mcpProcess, 'stderr', { value: null });

    await expect(waitForFilesystemMcpServerReady(mcpProcess)).rejects.toThrow(
      'Filesystem MCP server stderr pipe unavailable',
    );
  });

  it('rejects when the filesystem MCP server readiness times out', async () => {
    const mcpProcess = createFakeProcess();
    const ready = waitForFilesystemMcpServerReady(mcpProcess, 1000);
    const expectation = expect(ready).rejects.toThrow(
      'Timed out waiting for filesystem MCP server to be ready after 1000ms',
    );

    await vi.advanceTimersByTimeAsync(1000);
    await expectation;
  });
});

describe('filesystem MCP launcher', () => {
  const { execPath, platform } = process;
  const nodeDir = path.resolve('/nodejs');
  const npmDir = path.resolve('/npm-global');
  const rootDir = path.resolve('/repo');
  const npxCli = (dir: string) => path.join(dir, 'node_modules', 'npm', 'bin', 'npx-cli.js');
  const npxArgs = ['-y', '@modelcontextprotocol/server-filesystem', rootDir];
  let restoreEnv: () => void;

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.spawn.mockReturnValue(createFakeProcess());
    Object.defineProperty(process, 'platform', { value: 'win32' });
    Object.defineProperty(process, 'execPath', { value: path.join(nodeDir, 'node.exe') });
    restoreEnv = mockProcessEnv({ PATH: ['', 'relative', npmDir].join(path.delimiter) });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: platform });
    Object.defineProperty(process, 'execPath', { value: execPath });
    restoreEnv();
  });

  it('prefers the npx entrypoint installed with Node over PATH on Windows', () => {
    mocks.existsSync.mockReturnValue(true);

    startFilesystemMcpServer(rootDir);

    expect(mocks.spawn).toHaveBeenCalledWith(
      process.execPath,
      [npxCli(nodeDir), ...npxArgs],
      expect.objectContaining({ cwd: rootDir }),
    );
  });

  it('falls back to npm on an absolute PATH entry on Windows', () => {
    // Empty and relative entries resolve against the cwd and must be skipped.
    mocks.existsSync.mockImplementation((file) => !String(file).startsWith(nodeDir));

    startFilesystemMcpServer(rootDir);

    expect(mocks.spawn.mock.calls[0]?.[1]).toEqual([npxCli(npmDir), ...npxArgs]);
  });

  it('fails before spawning when npm cannot be found on Windows', () => {
    mocks.existsSync.mockReturnValue(false);

    expect(() => startFilesystemMcpServer(rootDir)).toThrow('npx not found');
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it('runs npx directly on other platforms', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });

    startFilesystemMcpServer(rootDir);

    expect(mocks.spawn).toHaveBeenCalledWith('npx', npxArgs, expect.anything());
  });
});
