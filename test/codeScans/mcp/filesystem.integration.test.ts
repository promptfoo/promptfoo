import { EventEmitter } from 'node:events';
import { mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, it } from 'vitest';
import {
  startFilesystemMcpServer,
  stopFilesystemMcpServer,
  waitForFilesystemMcpServerReady,
} from '../../../src/codeScan/mcp/filesystem';
import { SocketIoMcpBridge } from '../../../src/codeScan/mcp/transport';
import { createTempDir, removeTempDir } from '../../util/utils';
import type { Socket } from 'socket.io-client';

// On Node 22 the CLI supports diff-only scans and npm omits the optional filesystem server.
it.runIf(Number.parseInt(process.versions.node, 10) >= 24)(
  'discovers and uses read-only filesystem tools within the scan root',
  async ({ onTestFinished }) => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
    const fixture = realpathSync(createTempDir('promptfoo-filesystem-mcp-'));
    onTestFinished(() => removeTempDir(fixture));
    const root = join(fixture, 'repo');
    const inside = join(root, 'report.txt');
    const otherDir = join(fixture, 'other');
    const outside = join(otherDir, 'other.txt');
    mkdirSync(root);
    mkdirSync(otherDir);
    symlinkSync(otherDir, join(root, 'outside-link'), 'junction');
    writeFileSync(inside, 'example');
    writeFileSync(outside, 'outside fixture');

    const server = startFilesystemMcpServer(root);
    onTestFinished(() => stopFilesystemMcpServer(server));
    await waitForFilesystemMcpServerReady(server);
    const socket = Object.assign(new EventEmitter(), { connected: true });
    const bridge = new SocketIoMcpBridge(server, socket as unknown as Socket, 'scan');
    await bridge.connect();
    onTestFinished(() => bridge.disconnect());

    const [clientTransport, scannerTransport] = InMemoryTransport.createLinkedPair();
    scannerTransport.onmessage = (message) => socket.emit('mcp:request', message);
    socket.on('mcp:response', ({ message }) => scannerTransport.send(message));
    await scannerTransport.start();
    const client = new Client({ name: 'scanner', version: '1' });
    onTestFinished(() => client.close());
    await client.connect(clientTransport);
    expect(client.getServerCapabilities()).toEqual({ tools: {} });

    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toContain('list_directory_with_sizes');
    expect(names).not.toContain('write_file');
    const call = (name: string, path: string) => client.callTool({ name, arguments: { path } });
    await expect(call('read_text_file', inside)).resolves.toMatchObject({
      content: [{ type: 'text', text: 'example' }],
    });
    const listing = await call('list_directory_with_sizes', root);
    expect(listing).toMatchObject({
      content: [{ type: 'text', text: expect.stringMatching(/report\.txt\s+7 B\b/) }],
    });
    expect(listing).toMatchObject({
      content: [{ type: 'text', text: expect.stringMatching(/outside-link\s+unknown\b/) }],
    });
    for (const [name, path] of [
      ['read_text_file', outside],
      ['read_text_file', join(root, 'outside-link', 'other.txt')],
      ['list_directory_with_sizes', fixture],
    ]) {
      await expect(call(name, path)).resolves.toMatchObject({
        isError: true,
        content: [{ type: 'text', text: expect.stringContaining('outside allowed directories') }],
      });
    }
  },
);
