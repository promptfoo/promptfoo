import WebSocket from 'ws';
import { WebSocketProvider, createTransformResponse } from '../../src/providers/websocket';

jest.mock('ws');

describe('createTransformResponse', () => {
  it('should use provided function parser', () => {
    const parser = (data: any) => ({ output: `parsed-${data}` });
    const transform = createTransformResponse(parser);
    expect(transform('test')).toEqual({ output: 'parsed-test' });
  });

  it('should create function from string parser', () => {
    const parser = 'return { output: `parsed-${data}` }';
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
    jest.useFakeTimers();
    mockWs = {
      get readyState() {
        return WebSocket.OPEN;
      },
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
      onmessage: jest.fn(),
      onerror: jest.fn(),
      onopen: jest.fn(),
      onclose: jest.fn(),
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
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should initialize with correct config', () => {
    expect(provider.url).toBe('ws://test.com');
    expect(provider.config.messageTemplate).toBe('{{ prompt }}');
  });

  it('should throw if messageTemplate is missing', () => {
    expect(() => {
      new WebSocketProvider('ws://test.com', {
        config: {},
      });
    }).toThrow(
      'Expected WebSocket provider ws://test.com to have a config containing messageTemplate',
    );
  });

  it('should send message and handle response', async () => {
    const responseData = { result: 'test response' };
    let resolvePromise: (value: unknown) => void;
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
    const response = provider.callApi('test prompt');
    mockWs.onmessage?.({ data: JSON.stringify(responseData) } as WebSocket.MessageEvent);

    resolvePromise!(undefined);
    await promise;

    await expect(response).resolves.toEqual({ output: { output: responseData } });
  }, 10000);

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
    expect(response).toEqual({ output: { output: 'plain text response' } });
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
    expect(response).toEqual({ output: { output: 'transformed-test' } });
  });
});
