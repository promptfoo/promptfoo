import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, it } from 'vitest';
import {
  startFilesystemMcpServer,
  stopFilesystemMcpServer,
  waitForFilesystemMcpServerReady,
} from '../../../src/codeScan/mcp/filesystem';
import { createFilesystemSnapshot } from '../../../src/codeScan/mcp/snapshot';
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
    const tracked = join(root, 'report.txt');
    const otherDir = join(fixture, 'other');
    const outside = join(otherDir, 'other.txt');
    mkdirSync(root);
    mkdirSync(otherDir);
    symlinkSync(otherDir, join(root, 'outside-link'), 'junction');
    writeFileSync(tracked, 'example');
    writeFileSync(join(root, '.env'), 'private fixture');
    execFileSync('git', ['init', '--quiet', '--template='], { cwd: root });
    execFileSync('git', ['add', '--force', 'report.txt', '.env'], { cwd: root });
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.com',
        '-c',
        'commit.gpgSign=false',
        'commit',
        '--quiet',
        '-m',
        'fixture',
      ],
      { cwd: root },
    );
    writeFileSync(tracked, 'local edit');
    writeFileSync(join(root, 'untracked.ts'), 'local only');
    writeFileSync(outside, 'outside fixture');

    const snapshot = await createFilesystemSnapshot(root);
    onTestFinished(() => snapshot.dispose());
    const inside = join(snapshot.rootDir, 'report.txt');
    const server = startFilesystemMcpServer(snapshot.rootDir, snapshot.checkout);
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
    const listing = await call('list_directory_with_sizes', snapshot.rootDir);
    expect(listing).toMatchObject({
      content: [{ type: 'text', text: expect.stringMatching(/report\.txt\s+7 B\b/) }],
    });
    expect(JSON.stringify(listing)).not.toMatch(/outside-link|untracked|\.env/);
    const search = await client.callTool({
      name: 'search_files',
      arguments: { path: snapshot.rootDir, pattern: '**/*' },
    });
    expect(JSON.stringify(search)).toContain('report.txt');
    expect(JSON.stringify(search)).not.toMatch(/outside-link|untracked|\.env/);
    for (const name of ['read_multiple_files', 'read_media_file', 'directory_tree']) {
      expect(names).not.toContain(name);
    }
    for (const [name, path] of [
      ['read_text_file', outside],
      ['read_text_file', join(snapshot.rootDir, 'outside-link', 'other.txt')],
      ['read_text_file', join(snapshot.rootDir, '.env')],
      ['list_directory_with_sizes', fixture],
    ]) {
      await expect(call(name, path)).resolves.toMatchObject({
        isError: true,
        content: [{ type: 'text', text: 'Filesystem request failed' }],
      });
    }
  },
);
