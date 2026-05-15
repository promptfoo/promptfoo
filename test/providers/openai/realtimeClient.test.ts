import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { createOpenAiRealtimeSocket } from '../../../src/providers/openai/realtimeClient';

vi.mock('ws');

const MockWebSocket = WebSocket as unknown as ReturnType<typeof vi.fn>;

describe('createOpenAiRealtimeSocket', () => {
  const websocketOptions = {
    headers: {
      Origin: 'https://api.openai.com',
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('uses the raw WebSocket transport for HTTPS API bases', () => {
    const socket = { send: vi.fn(), close: vi.fn() } as unknown as WebSocket;
    MockWebSocket.mockImplementation(function () {
      return socket;
    });

    const result = createOpenAiRealtimeSocket({
      socketUrl: 'wss://api.openai.com/v1/realtime?model=gpt-realtime',
      websocketOptions,
    });

    expect(result).toBe(socket);
    expect(MockWebSocket).toHaveBeenCalledWith(
      'wss://api.openai.com/v1/realtime?model=gpt-realtime',
      websocketOptions,
    );
  });

  it('preserves ws:// overrides with the legacy socket constructor', () => {
    const socket = { send: vi.fn(), close: vi.fn() } as unknown as WebSocket;
    MockWebSocket.mockImplementation(function () {
      return socket;
    });

    const result = createOpenAiRealtimeSocket({
      socketUrl: 'ws://localhost:8080/v1/realtime?model=gpt-realtime',
      websocketOptions,
    });

    expect(result).toBe(socket);
    expect(MockWebSocket).toHaveBeenCalledWith(
      'ws://localhost:8080/v1/realtime?model=gpt-realtime',
      websocketOptions,
    );
  });

  it('preserves HTTPS client-secret socket URLs with the legacy socket constructor', () => {
    const socket = { send: vi.fn(), close: vi.fn() } as unknown as WebSocket;
    MockWebSocket.mockImplementation(function () {
      return socket;
    });

    const result = createOpenAiRealtimeSocket({
      socketUrl: 'wss://api.openai.com/v1/realtime/socket?client_secret=secret123',
      websocketOptions,
    });

    expect(result).toBe(socket);
    expect(MockWebSocket).toHaveBeenCalledWith(
      'wss://api.openai.com/v1/realtime/socket?client_secret=secret123',
      websocketOptions,
    );
  });
});
