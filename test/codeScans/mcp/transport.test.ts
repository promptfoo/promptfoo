import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';

import { describe, expect, it, vi } from 'vitest';
import { SocketIoMcpBridge } from '../../../src/codeScan/mcp/transport';
import type { Socket } from 'socket.io-client';

import type { JsonRpcMessage } from '../../../src/types/codeScan';

async function setup() {
  const stdout = new PassThrough();
  const write = vi.fn();
  const socket = Object.assign(new EventEmitter(), { connected: true });
  const response = vi.fn();
  socket.on('mcp:response', response);
  const bridge = new SocketIoMcpBridge(
    { stdout, stdin: { write } } as unknown as ChildProcess,
    socket as unknown as Socket,
    'scan-session',
  );
  await bridge.connect();
  return {
    write,
    response,
    request(fields: Omit<JsonRpcMessage, 'jsonrpc'>) {
      socket.emit('mcp:request', { jsonrpc: '2.0', ...fields });
    },
    fromServer(fields: Omit<JsonRpcMessage, 'jsonrpc'>) {
      stdout.write(JSON.stringify({ jsonrpc: '2.0', ...fields }) + '\n');
    },
  };
}

describe('read-only code scan transport', () => {
  it('filters discovered tools and permits only known repository reads', async () => {
    const { request, fromServer, write, response } = await setup();
    request({ method: 'tools/list', id: 1, _batch_id: 8 });
    request({
      method: 'tools/call',
      id: 1,
      _batch_id: 9,
      params: { name: 'read_text_file', arguments: { path: 'marker.txt' } },
    });
    const [list, read] = write.mock.calls.map(([line]) => JSON.parse(line));
    expect(read.params.arguments.path).toBe('marker.txt');
    expect(list.id).not.toEqual(read.id);
    const hiddenTools = ['write_file', 'edit_file', 'create_directory', 'move_file', 'future_tool'];
    const safe = { name: 'read_text_file', description: 'Read text' };
    const withSizes = { name: 'list_directory_with_sizes' };
    fromServer({ id: read.id, result: { content: [] } });
    fromServer({
      id: list.id,
      result: { tools: [safe, withSizes, ...hiddenTools.map((name) => ({ name }))] },
    });
    expect(
      response.mock.calls.map(([event]) => [
        event.batch_id,
        event.message.id,
        event.message.result,
      ]),
    ).toEqual([
      [9, 1, { content: [] }],
      [8, 1, { tools: [safe, withSizes] }],
    ]);
    write.mockClear();
    for (const name of hiddenTools) {
      request({ method: 'tools/call', id: 'blocked', _batch_id: 2, params: { name } });
      expect(response).toHaveBeenLastCalledWith(
        expect.objectContaining({
          batch_id: 2,
          message: expect.objectContaining({ id: 'blocked', error: expect.any(Object) }),
        }),
      );
    }
    expect(write).not.toHaveBeenCalled();
  });

  it('keeps the directory supplied by the local launcher in control of the scan', async () => {
    const { request, fromServer, write, response } = await setup();
    const init = {
      protocolVersion: '2025-11-25',
      clientInfo: { name: 'scanner', version: '1' },
      capabilities: { roots: { listChanged: true } },
    };
    request({ method: 'initialize', id: 1, params: init });
    const forwarded = JSON.parse(write.mock.calls[0][0]);
    expect(forwarded.params).toEqual({ ...init, capabilities: {} });
    fromServer({
      id: forwarded.id,
      result: { capabilities: { tools: { listChanged: true }, resources: {}, prompts: {} } },
    });
    expect(response.mock.calls[0][0].message.result.capabilities).toEqual({ tools: {} });
    fromServer({ method: 'ping', id: 9 });
    expect(JSON.parse(write.mock.calls[1][0])).toEqual({ jsonrpc: '2.0', id: 9, result: {} });
    fromServer({ method: 'roots/list', id: 10 });
    expect(JSON.parse(write.mock.calls[2][0])).toMatchObject({ id: 10, error: { code: -32601 } });
    write.mockClear();
    request({ method: 'notifications/roots/list_changed' });
    request({ id: 10, result: { roots: [{ uri: 'file:///fixture' }] } });
    request({ id: 10, method: 'ping', result: { roots: [] } });
    request({ method: 'future/method', id: 20 });
    expect(write).not.toHaveBeenCalled();
  });

  it('retires cancelled wire IDs even when the server sends no response', async () => {
    const { request, fromServer, write, response } = await setup();
    for (const batch of [1, 2]) {
      request({ method: 'tools/list', id: 1, _batch_id: batch });
    }
    const [first, cancelled] = write.mock.calls.map(([line]) => JSON.parse(line).id);
    const cancel = { method: 'notifications/cancelled', params: { requestId: 1 }, _batch_id: 2 };
    request(cancel);
    expect(JSON.parse(write.mock.calls[2][0]).params).toEqual({ requestId: cancelled });
    request(cancel);
    expect(write).toHaveBeenCalledTimes(3);

    request({ method: 'tools/list', id: 1, _batch_id: 2 });
    const reused = JSON.parse(write.mock.calls[3][0]).id;
    expect(reused).not.toBe(cancelled);
    fromServer({ id: cancelled, result: { tools: [] } });
    expect(response).not.toHaveBeenCalled();
    request(cancel);
    expect(JSON.parse(write.mock.calls[4][0]).params).toEqual({ requestId: reused });

    fromServer({ id: first, result: { tools: [] } });
    expect(response).toHaveBeenCalledExactlyOnceWith({
      session_id: 'scan-session',
      batch_id: 1,
      message: { jsonrpc: '2.0', id: 1, result: { tools: [] } },
    });
  });
});
