import WebSocket from 'ws';
import { GoogleMMLiveProvider } from '../../src/providers/googleMultimodalLive';

jest.mock('ws');

describe('GoogleMMLiveProvider', () => {
  let mockWs: jest.Mocked<WebSocket>;
  let provider: GoogleMMLiveProvider;

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

    provider = new GoogleMMLiveProvider('gemini-2.0-flash-exp', {
      config: {
        generationConfig: {
          response_modalities: ['text'],
        },
        timeoutMs: 500,
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with correct config', () => {
    expect(provider.modelName).toBe('gemini-2.0-flash-exp');
    expect(provider.config.generationConfig?.response_modalities?.[0]).toBe('text');
  });

  it('should return the correct id', () => {
    expect(provider.id()).toBe('google:live:gemini-2.0-flash-exp');
  });

  it('should send message and handle basic response', async () => {
    jest.mocked(WebSocket).mockImplementation(() => {
      setTimeout(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        setTimeout(() => {
          mockWs.onmessage?.({
            data: JSON.stringify({ setupComplete: {} }),
          } as WebSocket.MessageEvent);
        }, 10);
        setTimeout(() => {
          mockWs.onmessage?.({
            data: JSON.stringify({ serverContent: { modelTurn: { parts: [{ text: 'test' }] } } }),
          } as WebSocket.MessageEvent);
        }, 10);
        setTimeout(() => {
          mockWs.onmessage?.({
            data: JSON.stringify({
              serverContent: { modelTurn: { parts: [{ text: ' response' }] } },
            }),
          } as WebSocket.MessageEvent);
        }, 10);
        setTimeout(() => {
          mockWs.onmessage?.({
            data: JSON.stringify({ serverContent: { turnComplete: true } }),
          } as WebSocket.MessageEvent);
        }, 10);
      }, 40);
      return mockWs;
    });

    const response = await provider.callApi('test prompt');
    expect(response).toEqual({
      output: JSON.stringify({ text: 'test response', toolCall: { functionCalls: [] } }),
    });
  });

  it('should handle function calls and send tool responses', async () => {
    jest.mocked(WebSocket).mockImplementation(() => {
      setTimeout(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        setTimeout(() => {
          mockWs.onmessage?.({
            data: JSON.stringify({ setupComplete: {} }),
          } as WebSocket.MessageEvent);
        }, 10);
        setTimeout(() => {
          mockWs.onmessage?.({
            data: JSON.stringify({
              toolCall: {
                functionCalls: [
                  {
                    id: 'func1',
                    name: 'test_function',
                    args: { param1: 'value1' },
                  },
                ],
              },
            }),
          } as WebSocket.MessageEvent);
        }, 20);
        setTimeout(() => {
          mockWs.onmessage?.({
            data: JSON.stringify({
              serverContent: { modelTurn: { parts: [{ text: 'Function called' }] } },
            }),
          } as WebSocket.MessageEvent);
        }, 30);
        setTimeout(() => {
          mockWs.onmessage?.({
            data: JSON.stringify({ serverContent: { turnComplete: true } }),
          } as WebSocket.MessageEvent);
        }, 40);
      }, 50);
      return mockWs;
    });

    const response = await provider.callApi('test prompt');

    expect(mockWs.send).toHaveBeenCalledWith(
      JSON.stringify({
        tool_response: {
          function_responses: [
            {
              id: 'func1',
              name: 'test_function',
              response: {},
            },
          ],
        },
      }),
    );

    expect(response).toEqual({
      output: JSON.stringify({
        text: 'Function called',
        toolCall: {
          functionCalls: [
            {
              id: 'func1',
              name: 'test_function',
              args: { param1: 'value1' },
            },
          ],
        },
      }),
    });
  });

  it('should handle multiple function calls in sequence', async () => {
    jest.mocked(WebSocket).mockImplementation(() => {
      setTimeout(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        setTimeout(() => {
          mockWs.onmessage?.({
            data: JSON.stringify({ setupComplete: {} }),
          } as WebSocket.MessageEvent);
        }, 10);
        setTimeout(() => {
          mockWs.onmessage?.({
            data: JSON.stringify({
              toolCall: {
                functionCalls: [
                  {
                    id: 'func1',
                    name: 'function1',
                    args: {},
                  },
                ],
              },
            }),
          } as WebSocket.MessageEvent);
        }, 20);
        setTimeout(() => {
          mockWs.onmessage?.({
            data: JSON.stringify({
              toolCall: {
                functionCalls: [
                  {
                    id: 'func2',
                    name: 'function2',
                    args: {},
                  },
                ],
              },
            }),
          } as WebSocket.MessageEvent);
        }, 30);
        setTimeout(() => {
          mockWs.onmessage?.({
            data: JSON.stringify({ serverContent: { turnComplete: true } }),
          } as WebSocket.MessageEvent);
        }, 40);
      }, 50);
      return mockWs;
    });

    const response = await provider.callApi('test prompt');

    // Account for setup message + user message + 2 tool responses
    expect(mockWs.send).toHaveBeenCalledTimes(4);
    expect(response).toEqual({
      output: JSON.stringify({
        text: '',
        toolCall: {
          functionCalls: [
            {
              id: 'func1',
              name: 'function1',
              args: {},
            },
            {
              id: 'func2',
              name: 'function2',
              args: {},
            },
          ],
        },
      }),
    });
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
    provider = new GoogleMMLiveProvider('gemini-2.0-flash-exp', {
      config: {
        generationConfig: {
          response_modalities: ['text'],
        },
        timeoutMs: 100,
      },
    });

    const response = await provider.callApi('test prompt');
    expect(response).toEqual({ error: 'WebSocket request timed out' });
  });

  it('should handle invalid response data format', async () => {
    jest.mocked(WebSocket).mockImplementation(() => {
      setTimeout(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        setTimeout(() => {
          mockWs.onmessage?.({
            data: new Uint8Array([1, 2, 3]), // Invalid data format
          } as unknown as WebSocket.MessageEvent);
        }, 10);
      }, 20);
      return mockWs;
    });

    const response = await provider.callApi('test prompt');
    expect(response.error).toBe('Unexpected response data format');
  });

  it('should handle mixed text and function calls', async () => {
    jest.mocked(WebSocket).mockImplementation(() => {
      setTimeout(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        setTimeout(() => {
          mockWs.onmessage?.({
            data: JSON.stringify({ setupComplete: {} }),
          } as WebSocket.MessageEvent);
        }, 10);
        setTimeout(() => {
          mockWs.onmessage?.({
            data: JSON.stringify({
              serverContent: { modelTurn: { parts: [{ text: 'Initial text' }] } },
            }),
          } as WebSocket.MessageEvent);
        }, 20);
        setTimeout(() => {
          mockWs.onmessage?.({
            data: JSON.stringify({
              toolCall: {
                functionCalls: [
                  {
                    id: 'func1',
                    name: 'testFunc',
                    args: { test: true },
                  },
                ],
              },
            }),
          } as WebSocket.MessageEvent);
        }, 30);
        setTimeout(() => {
          mockWs.onmessage?.({
            data: JSON.stringify({
              serverContent: { modelTurn: { parts: [{ text: ' Final text' }] } },
            }),
          } as WebSocket.MessageEvent);
        }, 40);
        setTimeout(() => {
          mockWs.onmessage?.({
            data: JSON.stringify({ serverContent: { turnComplete: true } }),
          } as WebSocket.MessageEvent);
        }, 50);
      }, 60);
      return mockWs;
    });

    const response = await provider.callApi('test prompt');
    expect(response).toEqual({
      output: JSON.stringify({
        text: 'Initial text Final text',
        toolCall: {
          functionCalls: [
            {
              id: 'func1',
              name: 'testFunc',
              args: { test: true },
            },
          ],
        },
      }),
    });
  });
});
