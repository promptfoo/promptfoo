import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { Server } from 'socket.io';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('Socket.IO polling transport', () => {
  let io: Server;
  let endpoint: string;

  beforeEach(async () => {
    const server = createServer();
    io = new Server(server, { cors: { origin: '*' } });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/socket.io/`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
  });

  async function handshake() {
    const response = await fetch(`${endpoint}?EIO=4&transport=polling`);
    expect(response.status).toBe(200);
    const packet = await response.text();
    expect(packet[0]).toBe('0');
    return JSON.parse(packet.slice(1)).sid as string;
  }

  it.each(['GET', 'POST'])(
    'rejects a protocol downgrade on an existing session (%s)',
    async (method) => {
      const sid = await handshake();
      const response = await fetch(`${endpoint}?EIO=3&transport=polling&sid=${sid}`, {
        method,
        ...(method === 'POST' ? { body: '1:2' } : {}),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ code: 3, message: 'Bad request' });
    },
  );

  it('delivers a compressed update over the supported polling protocol', async () => {
    const sid = await handshake();
    const connected = once(io, 'connection');
    const response = await fetch(`${endpoint}?EIO=4&transport=polling&sid=${sid}`, {
      method: 'POST',
      body: '40',
    });
    expect(response.status).toBe(200);
    await response.text();
    await connected;
    // Drain the Socket.IO connection acknowledgement before emitting the update.
    await (await fetch(`${endpoint}?EIO=4&transport=polling&sid=${sid}`)).text();
    const update = { id: 'eval-test', description: 'x'.repeat(4096) };
    io.emit('update', update);
    const poll = await fetch(`${endpoint}?EIO=4&transport=polling&sid=${sid}`, {
      headers: { 'Accept-Encoding': 'gzip' },
    });

    expect(poll.status).toBe(200);
    expect(poll.headers.get('content-encoding')).toBe('gzip');
    expect(await poll.text()).toBe(`42${JSON.stringify(['update', update])}`);
  });
});
