import { EventEmitter } from 'events';
import path from 'path';
import type { ChildProcess } from 'child_process';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockProcessEnv } from '../../util/utils';

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    spawn: mocks.spawn,
  };
});

vi.mock('module', async (importOriginal) => {
  const actual = await importOriginal<typeof import('module')>();
  return {
    ...actual,
    createRequire: (url: string | URL) =>
      Object.assign(actual.createRequire(url), { resolve: mocks.resolve }),
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
    restoreEnv = mockProcessEnv(originalEnv, { clear: true });
  });

  afterEach(() => {
    restoreEnv();
    vi.useRealTimers();
    vi.clearAllMocks();
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
  const rootDir = path.resolve('/repo');
  const serverEntry = path.resolve(
    '/promptfoo/node_modules/@modelcontextprotocol/server-filesystem/dist/index.js',
  );
  let restoreEnv: () => void;

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.resolve.mockReturnValue(serverEntry);
    mocks.spawn.mockReturnValue(createFakeProcess());
    restoreEnv = mockProcessEnv(
      {
        HOME: '/home/runner',
        Path: '/usr/bin',
        SystemRoot: 'C:\\Windows',
        GITHUB_TOKEN: 'test-token',
        PROMPTFOO_API_KEY: 'test-key',
        NODE_OPTIONS: '--max-old-space-size=4096',
        npm_config_before: '2026-03-29T00:00:00.000Z',
      },
      { clear: true },
    );
  });

  afterEach(() => {
    restoreEnv();
  });

  it('runs the installed server with the current Node executable', () => {
    startFilesystemMcpServer(rootDir);

    expect(mocks.resolve).toHaveBeenCalledWith(
      '@modelcontextprotocol/server-filesystem/dist/index.js',
    );
    expect(mocks.spawn).toHaveBeenCalledWith(
      process.execPath,
      [serverEntry, rootDir],
      expect.objectContaining({ cwd: rootDir }),
    );
  });

  it('passes only a minimal environment to the server', () => {
    startFilesystemMcpServer(rootDir);

    expect(mocks.spawn.mock.calls[0]?.[2]?.env).toEqual({
      HOME: '/home/runner',
      Path: '/usr/bin',
      SystemRoot: 'C:\\Windows',
    });
  });

  it('fails before spawning when the server package is not installed', () => {
    mocks.resolve.mockImplementation(() => {
      throw new Error("Cannot find module '@modelcontextprotocol/server-filesystem/dist/index.js'");
    });

    expect(() => startFilesystemMcpServer(rootDir)).toThrow(
      'The @modelcontextprotocol/server-filesystem package is required',
    );
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
});
