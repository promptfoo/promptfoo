import WebSocket from 'ws';
import { createTransformResponse, WebSocketProvider } from '../../src/providers/websocket';

jest.mock('ws');

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
  let mockWs: jest.Mocked<WebSocket>;
  let provider: WebSocketProvider;

  beforeEach(() => {
    mockWs = {
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
      onmessage: jest.fn(),
      onerror: jest.fn(),
      onopen: jest.fn(),
    } as unknown as jest.Mocked<WebSocket>;

    jest.mocked(WebSocket).mockImplementation(() => mockWs);

    provider = new WebSocketProvider('ws://test.com', {
      config: {
        messageTemplate: '{{ prompt }}',
        timeoutMs: 1000,
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
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

    // Mock WebSocket to handle the connection properly
    jest.mocked(WebSocket).mockImplementation(() => {
      setTimeout(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        setTimeout(() => {
          mockWs.onmessage?.({
            data: JSON.stringify({ result: 'test' }),
          } as WebSocket.MessageEvent);
        }, 10);
      }, 10);
      return mockWs;
    });

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

    // Mock WebSocket to handle the connection properly
    jest.mocked(WebSocket).mockImplementation(() => {
      setTimeout(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        setTimeout(() => {
          mockWs.onmessage?.({
            data: JSON.stringify({ result: 'test' }),
          } as WebSocket.MessageEvent);
        }, 10);
      }, 10);
      return mockWs;
    });

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

    jest.mocked(WebSocket).mockImplementation(() => {
      setTimeout(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        setTimeout(() => {
          mockWs.onmessage?.({ data: JSON.stringify(responseData) } as WebSocket.MessageEvent);
        }, 10);
      }, 10);
      return mockWs;
    });

    const response = await provider.callApi('test prompt');
    expect(response).toEqual({ output: responseData });
  });

  it('should handle WebSocket errors', async () => {
    jest.mocked(WebSocket).mockImplementation(() => {
      setTimeout(() => {
        mockWs.onerror?.({
          type: 'error',
          error: new Error('connection failed'),
          message: 'connection failed',
        } as WebSocket.ErrorEvent);
      }, 10);
      return mockWs;
    });

    const response = await provider.callApi('test prompt');
    expect(response.error).toContain('WebSocket error');
  });

  it('should handle timeout', async () => {
    provider = new WebSocketProvider('ws://test.com', {
      config: {
        messageTemplate: '{{ prompt }}',
        timeoutMs: 100,
      },
    });

    const response = await provider.callApi('test prompt');
    expect(response).toEqual({ error: 'WebSocket request timed out' });
  });

  it('should handle non-JSON response', async () => {
    jest.mocked(WebSocket).mockImplementation(() => {
      setTimeout(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        setTimeout(() => {
          mockWs.onmessage?.({ data: 'plain text response' } as WebSocket.MessageEvent);
        }, 10);
      }, 10);
      return mockWs;
    });

    const response = await provider.callApi('test prompt');
    expect(response).toEqual({ output: 'plain text response' });
  });

  it('should use custom response transformer', async () => {
    provider = new WebSocketProvider('ws://test.com', {
      config: {
        messageTemplate: '{{ prompt }}',
        transformResponse: (data: any) => ({ output: `transformed-${data}` }),
      },
    });

    jest.mocked(WebSocket).mockImplementation(() => {
      setTimeout(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        setTimeout(() => {
          mockWs.onmessage?.({ data: 'test' } as WebSocket.MessageEvent);
        }, 10);
      }, 10);
      return mockWs;
    });

    const response = await provider.callApi('test prompt');
    expect(response).toEqual({ output: 'transformed-test' });
  });

  describe('streamResponse behavior', () => {
    it('should stream chunks and resolve when stream signals complete', async () => {
      let callCount = 0;
      const chunks = ['hello ', 'world'];
      const streamResponse = (data: any, accumulator: any) => {
        const previousOutput = typeof accumulator.output === 'string' ? accumulator.output : '';
        const merged = { output: previousOutput + String(data) };
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

      jest.mocked(WebSocket).mockImplementation(() => {
        setTimeout(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
          setTimeout(() => {
            mockWs.onmessage?.({ data: chunks[0] } as WebSocket.MessageEvent);
            setTimeout(() => {
              mockWs.onmessage?.({ data: chunks[1] } as WebSocket.MessageEvent);
            }, 5);
          }, 5);
        }, 5);
        return mockWs;
      });

      const response = await provider.callApi('ignored');
      expect(response).toEqual({ output: 'hello world' });
      expect(mockWs.close).toHaveBeenCalledTimes(1);
    });

    it('should complete immediately if stream signals completion on first message', async () => {
      const streamResponse = (data: any) => [{ output: String(data) }, 'COMPLETE'];

      provider = new WebSocketProvider('ws://test.com', {
        config: {
          messageTemplate: '{{ prompt }}',
          streamResponse,
          transformResponse: (data: any) => ({ output: (data as any).output }),
        },
      });

      jest.mocked(WebSocket).mockImplementation(() => {
        setTimeout(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
          setTimeout(() => {
            mockWs.onmessage?.({ data: 'chunk' } as WebSocket.MessageEvent);
          }, 5);
        }, 5);
        return mockWs;
      });

      const response = await provider.callApi('ignored');
      expect(response).toEqual({ output: 'chunk' });
      expect(mockWs.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('timeouts', () => {
    it.each([
      { caseName: 'without streamResponse (non-streaming path)', useStreaming: false },
      { caseName: 'with streamResponse (streaming path)', useStreaming: true },
    ])('should timeout $caseName', async ({ useStreaming }) => {
      jest.useFakeTimers();

      provider = new WebSocketProvider('ws://test.com', {
        config: {
          messageTemplate: '{{ prompt }}',
          timeoutMs: 100,
          ...(useStreaming
            ? {
                // never signal completion; ensures timeout path is exercised
                streamResponse: (_data: any, acc: any) => [acc, ''],
              }
            : {}),
        },
      });

      jest.mocked(WebSocket).mockImplementation(() => mockWs);

      const promise = provider.callApi('timeout test');
      jest.advanceTimersByTime(100);
      await expect(promise).resolves.toEqual({ error: 'WebSocket request timed out' });
      expect(mockWs.close).toHaveBeenCalled();

      jest.useRealTimers();
    });
  });
});
