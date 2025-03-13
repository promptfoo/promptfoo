import WebSocket from 'ws';
import { GoogleMMLiveProvider } from '../../src/providers/googleMultimodalLive';

jest.mock('ws');

const simulateMessage = (mockWs: jest.Mocked<WebSocket>, simulated_data: any) => {
  setTimeout(() => {
    mockWs.onmessage?.({
      data: JSON.stringify(simulated_data),
    } as WebSocket.MessageEvent);
  }, 10);
};

const simulatePartsMessage = (mockWs: jest.Mocked<WebSocket>, simulated_parts: any) => {
  simulateMessage(mockWs, { serverContent: { modelTurn: { parts: simulated_parts } } });
};

const simulateTextMessage = (mockWs: jest.Mocked<WebSocket>, simulated_text: string) => {
  simulatePartsMessage(mockWs, [{ text: simulated_text }]);
};

const simulateFunctionCallMessage = (mockWs: jest.Mocked<WebSocket>, simulated_calls: any) => {
  simulateMessage(mockWs, { toolCall: { functionCalls: simulated_calls } });
};

const simulateSetupMessage = (mockWs: jest.Mocked<WebSocket>) => {
  simulateMessage(mockWs, { setupComplete: {} });
};

const simulateCompletionMessage = (mockWs: jest.Mocked<WebSocket>) => {
  simulateMessage(mockWs, { serverContent: { turnComplete: true } });
};

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
        apiKey: 'test-api-key',
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
        simulateSetupMessage(mockWs);
        simulateTextMessage(mockWs, 'test');
        simulateTextMessage(mockWs, ' response');
        simulateCompletionMessage(mockWs);
      }, 40);
      return mockWs;
    });

    const response = await provider.callApi('test prompt');
    expect(response).toEqual({
      output: JSON.stringify({ text: 'test response', toolCall: { functionCalls: [] } }),
    });
  });

  it('should send message and handle function call response', async () => {
    jest.mocked(WebSocket).mockImplementation(() => {
      setTimeout(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulatePartsMessage(mockWs, [
          {
            executableCode: {
              language: 'PYTHON',
              code: 'weather_info = default_api.get_weather(city="San Francisco")\nprint(weather_info)\n',
            },
          },
        ]);
        simulateFunctionCallMessage(mockWs, [
          {
            name: 'get_weather',
            args: { city: 'San Francisco' },
            id: 'function-call-14336847574026984983',
          },
        ]);
        simulatePartsMessage(mockWs, [
          { codeExecutionResult: { outcome: 'OUTCOME_OK', output: '{}\n' } },
        ]);
        simulateTextMessage(mockWs, 'I was not able to retrieve weather information.');
        simulateCompletionMessage(mockWs);
      }, 60);
      return mockWs;
    });

    const response = await provider.callApi('test prompt');
    expect(response).toEqual({
      output: JSON.stringify({
        text: 'I was not able to retrieve weather information.',
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
    });
  });

  it('should send message and handle sequential function calls', async () => {
    jest.mocked(WebSocket).mockImplementation(() => {
      setTimeout(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulatePartsMessage(mockWs, [
          { executableCode: { language: 'PYTHON', code: 'default_api.call_me()\n' } },
        ]);
        simulateFunctionCallMessage(mockWs, [
          { name: 'call_me', args: {}, id: 'function-call-10316808485615376693' },
        ]);
        simulatePartsMessage(mockWs, [
          { executableCode: { language: 'PYTHON', code: 'default_api.call_me()\n' } },
        ]);
        simulateFunctionCallMessage(mockWs, [
          { name: 'call_me', args: {}, id: 'function-call-15919291184864374131' },
        ]);
        simulateTextMessage(mockWs, "\n```tool_outputs\n{'status': 'called'}\n```\n");
        simulateCompletionMessage(mockWs);
      }, 60);
      return mockWs;
    });

    const response = await provider.callApi('test prompt');
    expect(response).toEqual({
      output: JSON.stringify({
        text: "\n```tool_outputs\n{'status': 'called'}\n```\n",
        toolCall: {
          functionCalls: [
            { name: 'call_me', args: {}, id: 'function-call-10316808485615376693' },
            { name: 'call_me', args: {}, id: 'function-call-15919291184864374131' },
          ],
        },
      }),
    });
  });

  it('should send message and handle in-built google search tool', async () => {
    jest.mocked(WebSocket).mockImplementation(() => {
      setTimeout(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulatePartsMessage(mockWs, [
          {
            executableCode: {
              language: 'PYTHON',
              code: 'concise_search("why is the sea salty", max_num_results=5)\n',
            },
          },
        ]);
        simulatePartsMessage(mockWs, [
          {
            codeExecutionResult: {
              outcome: 'OUTCOME_OK',
              output: 'Looking up information on Google Search.\n',
            },
          },
        ]);
        simulateTextMessage(
          mockWs,
          'The sea is salty primarily due to the erosion of rocks on land. Rainwater,',
        );
        simulateTextMessage(
          mockWs,
          ' which is slightly acidic due to dissolved carbon dioxide, erodes rocks and carries dissolved minerals and salts into rivers.',
        );
        simulateMessage(mockWs, {
          serverContent: {
            groundingMetadata: {
              searchEntryPoint: {
                renderedContent:
                  '<style>\n.container {\n  align-items: center;\n  border-radius: 8px;\n  display: flex;\n  font-family: Google Sans, Roboto, sans-serif;\n  font-size: 14px;\n  line-height: 20px;\n  padding: 8px 12px;\n}\n.chip {\n  dis}',
              },
            },
          },
        });
        simulateCompletionMessage(mockWs);
      }, 70);
      return mockWs;
    });

    const response = await provider.callApi('test prompt');
    expect(response).toEqual({
      output: JSON.stringify({
        text: 'The sea is salty primarily due to the erosion of rocks on land. Rainwater, which is slightly acidic due to dissolved carbon dioxide, erodes rocks and carries dissolved minerals and salts into rivers.',
        toolCall: { functionCalls: [] },
      }),
    });
  });

  it('should send message and handle in-built code execution tool', async () => {
    jest.mocked(WebSocket).mockImplementation(() => {
      setTimeout(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulatePartsMessage(mockWs, [
          { executableCode: { language: 'PYTHON', code: 'result = 1341 * 23\nprint(result)\n' } },
        ]);
        simulateTextMessage(mockWs, '\n');
        simulatePartsMessage(mockWs, [
          { codeExecutionResult: { outcome: 'OUTCOME_OK', output: '30843\n' } },
        ]);
        simulateTextMessage(mockWs, 'The result of multiplying 1341 by 23 is 30843.\n');
        simulateCompletionMessage(mockWs);
      }, 60);
      return mockWs;
    });

    const response = await provider.callApi('\n');
    expect(response).toEqual({
      output: JSON.stringify({
        text: '\nThe result of multiplying 1341 by 23 is 30843.\n',
        toolCall: { functionCalls: [] },
      }),
    });
  });

  it('should handle multiple user inputs', async () => {
    jest.mocked(WebSocket).mockImplementation(() => {
      setTimeout(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulateTextMessage(mockWs, 'Hey there! How can I help you today?\n');
        simulateCompletionMessage(mockWs);
        simulateTextMessage(
          mockWs,
          "Okay, let's talk about Hawaii! It's a truly fascinating place with",
        );
        simulateTextMessage(mockWs, ' a unique culture, history, and geography.');
        simulateCompletionMessage(mockWs);
      }, 60);
      return mockWs;
    });

    const response = await provider.callApi(
      '[{"role":"user","content":"hey"},{"role":"user","content":"tell me about hawaii"}]',
    );
    expect(response).toEqual({
      output: JSON.stringify({
        text: "Hey there! How can I help you today?\nOkay, let's talk about Hawaii! It's a truly fascinating place with a unique culture, history, and geography.",
        toolCall: { functionCalls: [] },
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
        apiKey: 'test-api-key',
      },
    });

    const response = await provider.callApi('test prompt');
    expect(response).toEqual({ error: 'WebSocket request timed out' });
  });

  it('should throw an error if API key is not set', async () => {
    const providerWithoutKey = new GoogleMMLiveProvider('gemini-2.0-flash-exp', {
      config: {
        generationConfig: {
          response_modalities: ['text'],
        },
      },
    });

    const originalApiKey = process.env.GOOGLE_API_KEY;
    delete process.env.GOOGLE_API_KEY;

    await expect(providerWithoutKey.callApi('test prompt')).rejects.toThrow(
      'Google API key is not set. Set the GOOGLE_API_KEY environment variable or add `apiKey` to the provider config.',
    );

    if (originalApiKey) {
      process.env.GOOGLE_API_KEY = originalApiKey;
    }
  });
});
