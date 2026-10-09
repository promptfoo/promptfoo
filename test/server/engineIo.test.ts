import { once } from 'node:events';
import { createServer } from 'node:http';
import timers from 'node:timers';
import type { AddressInfo } from 'node:net';

import { Server, type Socket } from 'socket.io';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    try {
      await new Promise<void>((resolve) => io.close(() => resolve()));
    } finally {
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
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

  describe('heartbeat', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      // Engine.IO uses node:timers directly, rather than the global timer functions.
      vi.spyOn(timers, 'setTimeout').mockImplementation(setTimeout);
      vi.spyOn(timers, 'clearTimeout').mockImplementation(clearTimeout);
      io.engine.opts.pingInterval = 1000;
      io.engine.opts.pingTimeout = 1000;
    });

    async function post(sid: string, body: string) {
      const response = await fetch(`${endpoint}?EIO=4&transport=polling&sid=${sid}`, {
        method: 'POST',
        body,
      });
      expect(response.status).toBe(200);
      await response.text();
    }

    async function poll(sid: string) {
      const response = await fetch(`${endpoint}?EIO=4&transport=polling&sid=${sid}`);
      expect(response.status).toBe(200);
      return response.text();
    }

    async function connect() {
      const sid = await handshake();
      const connected = new Promise<Socket>((resolve) => io.once('connection', resolve));
      await post(sid, '40');
      const socket = await connected;
      expect(await poll(sid)).toBe(`40${JSON.stringify({ sid: socket.id })}`);
      return { sid, socket };
    }

    it('keeps an active client connected while its normal pong is delayed', async () => {
      const { sid, socket } = await connect();

      // Exercise two complete cycles: each new ping must allow a fresh extension.
      for (const cycle of [1, 2]) {
        await vi.advanceTimersByTimeAsync(1000);
        expect(await poll(sid)).toBe('2');
        await vi.advanceTimersByTimeAsync(750);

        const received = once(socket, 'client-update');
        await post(sid, `42${JSON.stringify(['client-update', { cycle }])}`);
        expect(await received).toEqual([{ cycle }]);

        // The ordinary event extends the outstanding timeout past its original deadline.
        await vi.advanceTimersByTimeAsync(500);
        expect(socket.connected).toBe(true);
        expect(io.engine.clientsCount).toBe(1);
        await post(sid, '3');
      }

      const disconnected = once(socket, 'disconnect');
      await post(sid, '1');
      expect((await disconnected)[0]).toBe('transport close');
      expect(io.engine.clientsCount).toBe(0);
    });

    it('disconnects an idle client that does not answer the heartbeat', async () => {
      const { sid, socket } = await connect();
      const disconnected = once(socket, 'disconnect');

      await vi.advanceTimersByTimeAsync(1000);
      expect(await poll(sid)).toBe('2');
      await vi.advanceTimersByTimeAsync(1000);

      expect((await disconnected)[0]).toBe('ping timeout');
      expect(socket.connected).toBe(false);
      expect(io.engine.clientsCount).toBe(0);
    });
  });
});
