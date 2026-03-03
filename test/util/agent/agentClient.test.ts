import { EventEmitter } from 'events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const mockIo = vi.hoisted(() => vi.fn());

vi.mock('socket.io-client', () => ({ io: mockIo }));

vi.mock('../../../src/globalConfig/cloud', () => ({
  cloudConfig: { getApiHost: () => 'http://localhost:3000' },
}));

vi.mock('../../../src/util/agent/agentAuth', () => ({
  resolveBaseAuthCredentials: () => ({ apiKey: 'test-key' }),
}));

vi.mock('../../../src/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── Fake socket factory ────────────────────────────────────────────────────────

function createFakeSocket() {
  const emitter = new EventEmitter();
  const ioEmitter = new EventEmitter();
  const emittedToServer: Array<{ event: string; args: unknown[] }> = [];

  const socket = {
    id: 'fake-socket-id',
    connected: false,
    io: {
      reconnection: vi.fn(),
      on(event: string, handler: (...args: unknown[]) => void) {
        ioEmitter.on(event, handler);
        return socket.io;
      },
    },

    on(event: string, handler: (...args: unknown[]) => void) {
      emitter.on(event, handler);
      return socket;
    },
    once(event: string, handler: (...args: unknown[]) => void) {
      emitter.once(event, handler);
      return socket;
    },
    emit(event: string, ...args: unknown[]) {
      emittedToServer.push({ event, args });
    },
    removeAllListeners() {
      emitter.removeAllListeners();
      return socket;
    },
    close: vi.fn(),
    disconnect: vi.fn(),

    // Test helpers
    _emittedToServer: emittedToServer,
    _simulateEvent(event: string, ...args: unknown[]) {
      emitter.emit(event, ...args);
    },
    _simulateConnect() {
      socket.connected = true;
      socket.id = `socket-${Math.random().toString(36).slice(2, 8)}`;
      emitter.emit('connect');
    },
    _simulateDisconnect(reason = 'transport close') {
      socket.connected = false;
      emitter.emit('disconnect', reason);
    },
    _simulateConnectError(message = 'Connection refused') {
      emitter.emit('connect_error', new Error(message));
    },
    _simulateReconnectFailed() {
      ioEmitter.emit('reconnect_failed');
    },
  };
  return socket;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('createAgentClient', () => {
  let fakeSocket: ReturnType<typeof createFakeSocket>;

  beforeEach(() => {
    fakeSocket = createFakeSocket();
    mockIo.mockReturnValue(fakeSocket);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits agent:join on initial connect', async () => {
    const { createAgentClient } = await import('../../../src/util/agent/agentClient');

    const promise = createAgentClient({
      agent: 'test-agent',
      host: 'http://localhost:3000',
      auth: { apiKey: 'k' },
      sessionId: 'sess-123',
      timeoutMs: 1000,
    });

    fakeSocket._simulateConnect();
    const client = await promise;

    expect(client.sessionId).toBe('sess-123');

    const joins = fakeSocket._emittedToServer.filter((e) => e.event === 'agent:join');
    expect(joins).toHaveLength(1);
    expect(joins[0].args[0]).toEqual({ sessionId: 'sess-123' });
  });

  it('re-emits agent:join after disconnect + reconnect', async () => {
    const { createAgentClient } = await import('../../../src/util/agent/agentClient');

    const promise = createAgentClient({
      agent: 'test-agent',
      host: 'http://localhost:3000',
      auth: { apiKey: 'k' },
      sessionId: 'sess-456',
      timeoutMs: 1000,
    });

    // Initial connect
    fakeSocket._simulateConnect();
    await promise;

    // Disconnect then reconnect
    fakeSocket._simulateDisconnect('transport close');
    fakeSocket._simulateConnect();

    const joins = fakeSocket._emittedToServer.filter((e) => e.event === 'agent:join');
    expect(joins).toHaveLength(2);
    expect(joins[0].args[0]).toEqual({ sessionId: 'sess-456' });
    expect(joins[1].args[0]).toEqual({ sessionId: 'sess-456' });
  });

  it('resolves the promise only once even after reconnect', async () => {
    const { createAgentClient } = await import('../../../src/util/agent/agentClient');

    let resolveCount = 0;
    const promise = createAgentClient({
      agent: 'test-agent',
      host: 'http://localhost:3000',
      auth: { apiKey: 'k' },
      sessionId: 'sess-789',
      timeoutMs: 1000,
    }).then((client) => {
      resolveCount++;
      return client;
    });

    fakeSocket._simulateConnect();
    await promise;
    expect(resolveCount).toBe(1);

    // Reconnect — should NOT cause a second resolution
    fakeSocket._simulateDisconnect('transport close');
    fakeSocket._simulateConnect();

    await new Promise((r) => setTimeout(r, 50));
    expect(resolveCount).toBe(1);
  });

  it('rejects with connect_error before initial connection', async () => {
    const { createAgentClient } = await import('../../../src/util/agent/agentClient');

    const promise = createAgentClient({
      agent: 'test-agent',
      host: 'http://localhost:3000',
      auth: { apiKey: 'k' },
      sessionId: 'sess-err',
      timeoutMs: 1000,
    });

    fakeSocket._simulateConnectError('Auth failed');

    await expect(promise).rejects.toThrow('Failed to connect to server: Auth failed');
  });

  it('ignores connect_error after successful connection', async () => {
    const { createAgentClient } = await import('../../../src/util/agent/agentClient');

    const promise = createAgentClient({
      agent: 'test-agent',
      host: 'http://localhost:3000',
      auth: { apiKey: 'k' },
      sessionId: 'sess-after-err',
      timeoutMs: 1000,
    });

    // Connect first
    fakeSocket._simulateConnect();
    const client = await promise;

    // connect_error after settlement should not cause problems
    fakeSocket._simulateConnectError('Late error');

    // Client should still be usable
    expect(client.sessionId).toBe('sess-after-err');
  });

  it('onCancelled receives agent:cancelled event', async () => {
    const { createAgentClient } = await import('../../../src/util/agent/agentClient');

    const promise = createAgentClient({
      agent: 'test-agent',
      host: 'http://localhost:3000',
      auth: { apiKey: 'k' },
      sessionId: 'sess-cancel',
      timeoutMs: 1000,
    });

    fakeSocket._simulateConnect();
    const client = await promise;

    const cb = vi.fn();
    client.onCancelled(cb);

    fakeSocket._simulateEvent('agent:cancelled', { clientType: 'web' });

    expect(cb).toHaveBeenCalledWith({ clientType: 'web' });
  });

  it('rejects on timeout when no connection', async () => {
    vi.useFakeTimers();

    const { createAgentClient } = await import('../../../src/util/agent/agentClient');

    const promise = createAgentClient({
      agent: 'test-agent',
      host: 'http://localhost:3000',
      auth: { apiKey: 'k' },
      sessionId: 'sess-timeout',
      timeoutMs: 500,
    });

    // Advance past timeout
    vi.advanceTimersByTime(600);

    await expect(promise).rejects.toThrow('Connection timeout after 500ms');

    vi.useRealTimers();
  });
});
