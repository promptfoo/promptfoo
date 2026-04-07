import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';

import { describe, expect, it } from 'vitest';
import { waitForFilesystemMcpServerReady } from '../../../src/codeScan/mcp/filesystem';

class FakeChildProcess extends EventEmitter {
  stderr = new EventEmitter();
}

function createFakeProcess(): ChildProcess & { stderr: EventEmitter } {
  return new FakeChildProcess() as unknown as ChildProcess & { stderr: EventEmitter };
}

describe('waitForFilesystemMcpServerReady', () => {
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
});
