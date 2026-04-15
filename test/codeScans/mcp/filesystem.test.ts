import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockProcessEnv } from '../../util/utils';

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

  it('strips npm before config when spawning the filesystem MCP server', () => {
    process.env.NPM_CONFIG_BEFORE = '2026-03-29T00:00:00.000Z';
    process.env.npm_config_before = '2026-03-29T00:00:00.000Z';
    mocks.spawn.mockReturnValue(createFakeProcess());

    startFilesystemMcpServer(process.cwd());

    const spawnOptions = mocks.spawn.mock.calls[0]?.[2];
    expect(spawnOptions?.env?.NPM_CONFIG_BEFORE).toBeUndefined();
    expect(spawnOptions?.env?.npm_config_before).toBeUndefined();
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
    mcpProcess.exitCode = 1;

    await expect(waitForFilesystemMcpServerReady(mcpProcess)).rejects.toThrow(
      'Filesystem MCP server exited before ready: code 1',
    );
  });

  it('rejects immediately when the process was already killed', async () => {
    const mcpProcess = createFakeProcess();
    mcpProcess.killed = true;

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
