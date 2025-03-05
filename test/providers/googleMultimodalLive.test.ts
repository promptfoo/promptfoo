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
    expect(response).toEqual({ output: 'test response' });
  });

  it('should send message and handle function call response', async () => {
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
              serverContent: {
                modelTurn: {
                  parts: [
                    {
                      executableCode: {
                        language: 'PYTHON',
                        code: 'weather_info = default_api.get_weather(city="San Francisco")\nprint(weather_info)\n',
                      },
                    },
                  ],
                },
              },
            }),
          } as WebSocket.MessageEvent);
        }, 10);
        setTimeout(() => {
          mockWs.onmessage?.({
            data: JSON.stringify({
              toolCall: {
                functionCalls: [
                  {
                    name: 'get_weather',
                    args: { city: 'San Francisco' },
                    id: 'function-call-14336847574026984983',
                  },
                ],
              },
            }),
          } as WebSocket.MessageEvent);
        }, 10);
      }, 30);
      return mockWs;
    });

    const response = await provider.callApi('test prompt');
    expect(response).toEqual({
      output:
        '{"toolCall":{"functionCalls":[{"name":"get_weather","args":{"city":"San Francisco"},"id":"function-call-14336847574026984983"}]}}',
    });
  });

  it('should send message and handle in-built google search tool', async () => {
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
              serverContent: {
                modelTurn: {
                  parts: [
                    {
                      executableCode: {
                        language: 'PYTHON',
                        code: 'concise_search("why is the sea salty", max_num_results=5)\n',
                      },
                    },
                  ],
                },
              },
            }),
          } as WebSocket.MessageEvent);
        }, 10);
        setTimeout(() => {
          mockWs.onmessage?.({
            data: JSON.stringify({
              serverContent: {
                modelTurn: {
                  parts: [
                    {
                      codeExecutionResult: {
                        outcome: 'OUTCOME_OK',
                        output: 'Looking up information on Google Search.\n',
                      },
                    },
                  ],
                },
              },
            }),
          } as WebSocket.MessageEvent);
        }, 10);
        setTimeout(() => {
          mockWs.onmessage?.({
            data: JSON.stringify({
              serverContent: {
                modelTurn: {
                  parts: [
                    {
                      text: 'The sea is salty primarily due to the erosion of rocks on land. Rainwater,',
                    },
                  ],
                },
              },
            }),
          } as WebSocket.MessageEvent);
        }, 10);
        setTimeout(() => {
          mockWs.onmessage?.({
            data: JSON.stringify({
              serverContent: {
                modelTurn: {
                  parts: [
                    {
                      text: ' which is slightly acidic due to dissolved carbon dioxide, erodes rocks and carries dissolved minerals and salts into rivers.',
                    },
                  ],
                },
              },
            }),
          } as WebSocket.MessageEvent);
        }, 10);
        setTimeout(() => {
          mockWs.onmessage?.({
            data: JSON.stringify({
              serverContent: {
                groundingMetadata: {
                  searchEntryPoint: {
                    renderedContent:
                      '<style>\n.container {\n  align-items: center;\n  border-radius: 8px;\n  display: flex;\n  font-family: Google Sans, Roboto, sans-serif;\n  font-size: 14px;\n  line-height: 20px;\n  padding: 8px 12px;\n}\n.chip {\n  dis}',
                  },
                },
              },
            }),
          } as WebSocket.MessageEvent);
        }, 10);
      }, 60);
      return mockWs;
    });

    const response = await provider.callApi('test prompt');
    expect(response).toEqual({
      output:
        'The sea is salty primarily due to the erosion of rocks on land. Rainwater, which is slightly acidic due to dissolved carbon dioxide, erodes rocks and carries dissolved minerals and salts into rivers.',
    });
  });

  it('should send message and handle in-built code execution tool', async () => {
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
              serverContent: {
                modelTurn: {
                  parts: [
                    {
                      executableCode: {
                        language: 'PYTHON',
                        code: 'result = 1341 * 23\nprint(result)\n',
                      },
                    },
                  ],
                },
              },
            }),
          } as WebSocket.MessageEvent);
        }, 10);
        setTimeout(() => {
          mockWs.onmessage?.({
            data: JSON.stringify({ serverContent: { modelTurn: { parts: [{ text: '\n' }] } } }),
          } as WebSocket.MessageEvent);
        }, 10);
        setTimeout(() => {
          mockWs.onmessage?.({
            data: JSON.stringify({
              serverContent: {
                modelTurn: {
                  parts: [{ codeExecutionResult: { outcome: 'OUTCOME_OK', output: '30843\n' } }],
                },
              },
            }),
          } as WebSocket.MessageEvent);
        }, 10);
        setTimeout(() => {
          mockWs.onmessage?.({
            data: JSON.stringify({
              serverContent: {
                modelTurn: {
                  parts: [{ text: 'The result of multiplying 1341 by 23 is 30843.\n' }],
                },
              },
            }),
          } as WebSocket.MessageEvent);
        }, 10);
        setTimeout(() => {
          mockWs.onmessage?.({
            data: JSON.stringify({ serverContent: { turnComplete: true } }),
          } as WebSocket.MessageEvent);
        }, 10);
      }, 60);
      return mockWs;
    });

    const response = await provider.callApi('\n');
    expect(response).toEqual({ output: '\nThe result of multiplying 1341 by 23 is 30843.\n' });
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
});
