import { OpenAIRealtimeWS } from 'openai/realtime/ws';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { createOpenAiRealtimeSocket } from '../../../src/providers/openai/realtimeClient';

vi.mock('ws');
vi.mock('openai/realtime/ws', () => ({
  OpenAIRealtimeWS: vi.fn(),
}));

const MockWebSocket = WebSocket as unknown as ReturnType<typeof vi.fn>;
const MockOpenAIRealtimeWS = OpenAIRealtimeWS as unknown as ReturnType<typeof vi.fn>;

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

  it('uses the OpenAI SDK Realtime socket for HTTPS API bases', () => {
    const socket = { send: vi.fn(), close: vi.fn() } as unknown as WebSocket;
    const on = vi.fn();
    MockOpenAIRealtimeWS.mockImplementation(function () {
      return { socket, on };
    });

    const result = createOpenAiRealtimeSocket({
      apiKey: 'test-key',
      organization: 'org-test',
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-realtime',
      socketUrl: 'wss://api.openai.com/v1/realtime?model=gpt-realtime',
      websocketOptions,
      config: { maxRetries: 2 },
    });

    expect(result).toBe(socket);
    expect(MockOpenAIRealtimeWS).toHaveBeenCalledTimes(1);
    expect(MockWebSocket).not.toHaveBeenCalled();
    expect(on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('preserves ws:// overrides with the legacy socket constructor', () => {
    const socket = { send: vi.fn(), close: vi.fn() } as unknown as WebSocket;
    MockWebSocket.mockImplementation(function () {
      return socket;
    });

    const result = createOpenAiRealtimeSocket({
      apiKey: 'test-key',
      baseURL: 'http://localhost:8080/v1',
      model: 'gpt-realtime',
      socketUrl: 'ws://localhost:8080/v1/realtime?model=gpt-realtime',
      websocketOptions,
      config: { maxRetries: 2 },
    });

    expect(result).toBe(socket);
    expect(MockWebSocket).toHaveBeenCalledWith(
      'ws://localhost:8080/v1/realtime?model=gpt-realtime',
      websocketOptions,
    );
    expect(MockOpenAIRealtimeWS).not.toHaveBeenCalled();
  });

  it('preserves HTTPS client-secret socket URLs with the legacy socket constructor', () => {
    const socket = { send: vi.fn(), close: vi.fn() } as unknown as WebSocket;
    MockWebSocket.mockImplementation(function () {
      return socket;
    });

    const result = createOpenAiRealtimeSocket({
      apiKey: 'test-key',
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-realtime',
      socketUrl: 'wss://api.openai.com/v1/realtime/socket?client_secret=secret123',
      websocketOptions,
      config: { maxRetries: 2 },
    });

    expect(result).toBe(socket);
    expect(MockWebSocket).toHaveBeenCalledWith(
      'wss://api.openai.com/v1/realtime/socket?client_secret=secret123',
      websocketOptions,
    );
    expect(MockOpenAIRealtimeWS).not.toHaveBeenCalled();
  });
});
