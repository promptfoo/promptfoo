import { afterEach, beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import WebSocket from 'ws';
import { createTransformResponse, WebSocketProvider } from '../../src/providers/websocket';

const websocketMocks = vi.hoisted(() => {
  let factory: (() => Mocked<WebSocket>) | null = null;

  const WebSocketMock = vi.fn(function () {
    return factory?.() ?? ({} as Mocked<WebSocket>);
  });

  const setFactory = (nextFactory: () => Mocked<WebSocket>) => {
    factory = nextFactory;
  };

  return { WebSocketMock, setFactory };
});

vi.mock('ws', () => ({
  default: websocketMocks.WebSocketMock,
}));

describe('createTransformResponse', () => {
  it('should use provided function parser', () => {
    const parser = (data: any) => ({ output: `parsed-${data}` });
    const transform = createTransformResponse(parser);
    expect(transform('test')).toEqual({ output: 'parsed-test' });
  });

  it('should create function from string parser', () => {
    const parser = '({ output: `parsed-${data}` })';
    const transform = createTransformResponse(parser);
    expect(transform('test')).toEqual({ output: 'parsed-test' });
  });

  it('should return default transform if no parser provided', () => {
    const transform = createTransformResponse(undefined);
    expect(transform('test')).toEqual({ output: 'test' });
  });
});

describe('WebSocketProvider', () => {
  let mockWs: Mocked<WebSocket>;
  let provider: WebSocketProvider;

  const emitWebSocketEvents = (
    ...events: Array<
      | { type: 'open' }
      | { type: 'message'; data: unknown }
      | { type: 'error'; error?: Error; message?: string }
    >
  ) => {
    websocketMocks.setFactory(() => {
      const ws = mockWs;
      queueMicrotask(() => {
        for (const event of events) {
          if (event.type === 'open') {
            ws.onopen?.({ type: 'open', target: ws } as WebSocket.Event);
          } else if (event.type === 'message') {
            ws.onmessage?.({ data: event.data } as WebSocket.MessageEvent);
          } else {
            const error = event.error ?? new Error(event.message ?? 'connection failed');
            ws.onerror?.({
              type: 'error',
              error,
              message: event.message ?? error.message,
            } as WebSocket.ErrorEvent);
          }
        }
      });
      return ws;
    });
  };

  beforeEach(() => {
    mockWs = {
      on: vi.fn(),
      send: vi.fn(),
      close: vi.fn(),
      onmessage: vi.fn(),
      onerror: vi.fn(),
      onopen: vi.fn(),
    } as unknown as Mocked<WebSocket>;

    websocketMocks.WebSocketMock.mockClear();
    websocketMocks.setFactory(() => mockWs);

    provider = new WebSocketProvider('ws://test.com', {
      config: {
        messageTemplate: '{{ prompt }}',
        timeoutMs: 1000,
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with correct config', () => {
    expect(provider.url).toBe('ws://test.com');
    expect(provider.config.messageTemplate).toBe('{{ prompt }}');
  });

  it('should pass headers to WebSocket connection', async () => {
    const headers = {
      Authorization: 'Bearer test-token',
      'Custom-Header': 'test-value',
    };

    provider = new WebSocketProvider('ws://test.com', {
      config: {
        messageTemplate: '{{ prompt }}',
        headers,
      },
    });

    emitWebSocketEvents(
      { type: 'open' },
      { type: 'message', data: JSON.stringify({ result: 'test' }) },
    );

    // Trigger the WebSocket connection by calling callApi
    await provider.callApi('test prompt');

    // Now assert that WebSocket was called with the headers
    expect(WebSocket).toHaveBeenCalledWith('ws://test.com', { headers });
  });

  it('should work without headers provided', async () => {
    provider = new WebSocketProvider('ws://test.com', {
      config: {
        messageTemplate: '{{ prompt }}',
        // No headers provided
      },
    });

    emitWebSocketEvents(
      { type: 'open' },
      { type: 'message', data: JSON.stringify({ result: 'test' }) },
    );

    // Trigger the WebSocket connection by calling callApi
    const response = await provider.callApi('test prompt');

    // Should still work and return expected response
    expect(response).toEqual({ output: { result: 'test' } });
    // When headers are not provided, the options object should be empty
    expect(WebSocket).toHaveBeenCalledWith('ws://test.com', {});
  });

  it('should throw if messageTemplate is missing', () => {
    expect(() => {
      new WebSocketProvider('ws://test.com', {
        config: {},
      });
    }).toThrow(
      'Expected WebSocket provider ws://test.com to have a config containing {messageTemplate}',
    );
  });

  it('should send message and handle response', async () => {
    const responseData = { result: 'test response' };

    emitWebSocketEvents({ type: 'open' }, { type: 'message', data: JSON.stringify(responseData) });

    const response = await provider.callApi('test prompt');
    expect(response).toEqual({ output: responseData });
    expect(mockWs.close).toHaveBeenCalled();
  });

  it('should handle WebSocket errors', async () => {
    emitWebSocketEvents({ type: 'error', error: new Error('connection failed') });

    await expect(provider.callApi('test prompt')).rejects.toThrow('WebSocket error');
    expect(mockWs.close).toHaveBeenCalled();
  });

  it('should handle timeout', async () => {
    provider = new WebSocketProvider('ws://test.com', {
      config: {
        messageTemplate: '{{ prompt }}',
        timeoutMs: 100,
      },
    });

    vi.useFakeTimers();
    try {
      const responsePromise = expect(provider.callApi('test prompt')).rejects.toThrow(
        'WebSocket request timed out',
      );

      await vi.runAllTimersAsync();

      await responsePromise;
      expect(mockWs.close).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should handle non-JSON response', async () => {
    emitWebSocketEvents({ type: 'open' }, { type: 'message', data: 'plain text response' });

    const response = await provider.callApi('test prompt');
    expect(response).toEqual({ output: 'plain text response' });
    expect(mockWs.close).toHaveBeenCalled();
  });

  it('should use custom response transformer', async () => {
    provider = new WebSocketProvider('ws://test.com', {
      config: {
        messageTemplate: '{{ prompt }}',
        transformResponse: (data: any) => ({ output: `transformed-${data}` }),
      },
    });

    emitWebSocketEvents({ type: 'open' }, { type: 'message', data: 'test' });

    const response = await provider.callApi('test prompt');
    expect(response).toEqual({ output: 'transformed-test' });
    expect(mockWs.close).toHaveBeenCalled();
  });

  describe('streamResponse behavior', () => {
    it('should stream chunks and resolve when stream signals complete', async () => {
      let callCount = 0;
      const chunks = ['hello ', 'world'];
      const streamResponse = (accumulator: any, event: any) => {
        const previousOutput = typeof accumulator.output === 'string' ? accumulator.output : '';
        const currentChunk =
          typeof event?.data === 'string' ? event.data : String(event?.data ?? event);
        const merged = { output: previousOutput + currentChunk };
        callCount += 1;
        const isComplete = callCount === chunks.length ? 'DONE' : '';
        return [merged, isComplete];
      };

      provider = new WebSocketProvider('ws://test.com', {
        config: {
          messageTemplate: '{{ prompt }}',
          streamResponse,
          transformResponse: (data: any) => ({ output: (data as any).output }),
        },
      });

      emitWebSocketEvents(
        { type: 'open' },
        { type: 'message', data: chunks[0] },
        { type: 'message', data: chunks[1] },
      );

      const response = await provider.callApi('ignored');
      expect(response).toEqual({ output: 'hello world' });
      expect(mockWs.close).toHaveBeenCalledTimes(1);
    });

    it('should complete immediately if stream signals completion on first message', async () => {
      const streamResponse = (_acc: any, event: any) => [
        { output: String(event?.data ?? event) },
        true,
      ];

      provider = new WebSocketProvider('ws://test.com', {
        config: {
          messageTemplate: '{{ prompt }}',
          streamResponse,
          transformResponse: (data: any) => ({ output: (data as any).output }),
        },
      });

      emitWebSocketEvents({ type: 'open' }, { type: 'message', data: 'chunk' });

      const response = await provider.callApi('ignored');
      expect(response).toEqual({ output: 'chunk' });
      expect(mockWs.close).toHaveBeenCalledTimes(1);
    });

    it('should pass context as third argument to streamResponse', async () => {
      let received: any[] | null = null;
      const streamResponse = (acc: any, event: any, ctx: any) => {
        received = [acc, event, ctx];
        return [{ output: 'ok' }, true];
      };

      provider = new WebSocketProvider('ws://test.com', {
        config: {
          messageTemplate: '{{ prompt }}',
          streamResponse,
          transformResponse: (data: any) => ({ output: (data as any).output }),
        },
      });

      emitWebSocketEvents({ type: 'open' }, { type: 'message', data: 'chunk' });

      const context = { vars: { x: 1 }, debug: true } as any;
      const response = await provider.callApi('ignored', context);
      expect(response).toEqual({ output: 'ok' });
      expect(received).not.toBeNull();
      expect(received?.[2]).toEqual(context);
    });

    it('should reject when streamResponse function throws an error', async () => {
      const streamResponse = (_acc: any, _event: any) => {
        throw new Error('Stream processing failed');
      };

      provider = new WebSocketProvider('ws://test.com', {
        config: {
          messageTemplate: '{{ prompt }}',
          streamResponse,
          transformResponse: (data: any) => ({ output: (data as any).output }),
        },
      });

      emitWebSocketEvents({ type: 'open' }, { type: 'message', data: 'chunk' });

      await expect(provider.callApi('test')).rejects.toThrow(
        'Error executing streamResponse function: Error in stream response function: Stream processing failed',
      );
      expect(mockWs.close).toHaveBeenCalled();
    });

    it('should reject when streamResponse string transform throws an error', async () => {
      provider = new WebSocketProvider('ws://test.com', {
        config: {
          messageTemplate: '{{ prompt }}',
          streamResponse: '(acc, data, ctx) => { throw new Error("String transform failed"); }',
          transformResponse: (data: any) => ({ output: (data as any).output }),
        },
      });

      emitWebSocketEvents({ type: 'open' }, { type: 'message', data: 'chunk' });

      await expect(provider.callApi('test')).rejects.toThrow(
        'Error executing streamResponse function: Error executing streamResponse function: String transform failed',
      );
      expect(mockWs.close).toHaveBeenCalled();
    });

    it('should reject when streamResponse string transform has syntax error', async () => {
      provider = new WebSocketProvider('ws://test.com', {
        config: {
          messageTemplate: '{{ prompt }}',
          streamResponse: 'invalid syntax here !!!',
          transformResponse: (data: any) => ({ output: (data as any).output }),
        },
      });

      emitWebSocketEvents({ type: 'open' }, { type: 'message', data: 'chunk' });

      await expect(provider.callApi('test')).rejects.toThrow(
        'Error executing streamResponse function:',
      );
      expect(mockWs.close).toHaveBeenCalled();
    });

    it('should reject when streamResponse returns invalid result format', async () => {
      const streamResponse = (_acc: any, _event: any) => {
        // Return invalid format - not an array
        return { invalid: 'format' };
      };

      provider = new WebSocketProvider('ws://test.com', {
        config: {
          messageTemplate: '{{ prompt }}',
          streamResponse,
          transformResponse: (data: any) => ({ output: (data as any).output }),
        },
      });

      emitWebSocketEvents({ type: 'open' }, { type: 'message', data: 'chunk' });

      await expect(provider.callApi('test')).rejects.toThrow(
        'Error executing streamResponse function:',
      );
      expect(mockWs.close).toHaveBeenCalled();
    });

    it('should reject when streamResponse function throws non-Error object', async () => {
      const streamResponse = (_acc: any, _event: any) => {
        throw 'String error instead of Error object';
      };

      provider = new WebSocketProvider('ws://test.com', {
        config: {
          messageTemplate: '{{ prompt }}',
          streamResponse,
          transformResponse: (data: any) => ({ output: (data as any).output }),
        },
      });

      emitWebSocketEvents({ type: 'open' }, { type: 'message', data: 'chunk' });

      await expect(provider.callApi('test')).rejects.toThrow(
        'Error executing streamResponse function: Error in stream response function: String error instead of Error object',
      );
      expect(mockWs.close).toHaveBeenCalled();
    });
  });

  describe('timeouts', () => {
    it('should timeout with streamResponse', async () => {
      provider = new WebSocketProvider('ws://test.com', {
        config: {
          messageTemplate: '{{ prompt }}',
          timeoutMs: 100,
          // never signal completion; ensures timeout path is exercised
          streamResponse: (acc: any, _data: any) => [acc, ''],
        },
      });

      await expect(provider.callApi('timeout test')).rejects.toThrow('WebSocket request timed out');
      expect(mockWs.close).toHaveBeenCalled();
    });
  });
});
