import axios from 'axios';
import dedent from 'dedent';
import WebSocket from 'ws';
import { GoogleLiveProvider } from '../../../src/providers/google/live';

jest.mock('ws');
jest.mock('axios');
jest.mock('../../../src/python/pythonUtils', () => ({
  validatePythonPath: jest.fn().mockImplementation(async (path) => path),
}));
jest.mock('child_process', () => ({
  spawn: jest.fn(() => ({
    stdout: { on: jest.fn() },
    stderr: { on: jest.fn() },
    on: jest.fn((event, callback) => {
      if (event === 'close') {
        setTimeout(callback, 100);
      }
    }),
    kill: jest.fn(),
    killed: false,
  })),
}));

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

describe('GoogleLiveProvider', () => {
  let mockWs: jest.Mocked<WebSocket>;
  const mockedAxios = axios as jest.Mocked<typeof axios>;
  let provider: GoogleLiveProvider;

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

    // Reset validatePythonPath mock for each test
    jest
      .mocked(jest.requireMock('../../../src/python/pythonUtils').validatePythonPath)
      .mockImplementation(async (path: string) => path);

    provider = new GoogleLiveProvider('gemini-2.0-flash-exp', {
      config: {
        generationConfig: {
          response_modalities: ['text'],
        },
        timeoutMs: 500,
        apiKey: 'test-api-key',
      },
    });

    // Reset mocks before each test
    mockedAxios.get.mockClear();
    mockedAxios.post.mockClear();
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
      output: {
        text: 'test response',
        toolCall: { functionCalls: [] },
        statefulApiState: undefined,
      },
      metadata: {},
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
      output: {
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
        statefulApiState: undefined,
      },
      metadata: {},
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
      output: {
        text: "\n```tool_outputs\n{'status': 'called'}\n```\n",
        toolCall: {
          functionCalls: [
            { name: 'call_me', args: {}, id: 'function-call-10316808485615376693' },
            { name: 'call_me', args: {}, id: 'function-call-15919291184864374131' },
          ],
        },
        statefulApiState: undefined,
      },
      metadata: {},
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
        simulateCompletionMessage(mockWs);
      }, 70);
      return mockWs;
    });

    const response = await provider.callApi('test prompt');

    // Just check the output text, don't worry about metadata
    expect(response.output.text).toBe(
      'The sea is salty primarily due to the erosion of rocks on land. Rainwater, which is slightly acidic due to dissolved carbon dioxide, erodes rocks and carries dissolved minerals and salts into rivers.',
    );
    expect(response.output.toolCall.functionCalls).toEqual([]);
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
      output: {
        text: '\nThe result of multiplying 1341 by 23 is 30843.\n',
        toolCall: { functionCalls: [] },
        statefulApiState: undefined,
      },
      metadata: {},
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
      output: {
        text: "Hey there! How can I help you today?\nOkay, let's talk about Hawaii! It's a truly fascinating place with a unique culture, history, and geography.",
        toolCall: { functionCalls: [] },
        statefulApiState: undefined,
      },
      metadata: {},
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
    provider = new GoogleLiveProvider('gemini-2.0-flash-exp', {
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
    const providerWithoutKey = new GoogleLiveProvider('gemini-2.0-flash-exp', {
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

  it('should handle function tool callbacks correctly', async () => {
    jest.mocked(WebSocket).mockImplementation(() => {
      setTimeout(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulatePartsMessage(mockWs, [
          {
            executableCode: {
              language: 'PYTHON',
              code: 'print(default_api.addNumbers(a=5, b=6))\n',
            },
          },
        ]);
        simulateFunctionCallMessage(mockWs, [
          { name: 'addNumbers', args: { a: 5, b: 6 }, id: 'function-call-13767088400406609799' },
        ]);
        simulatePartsMessage(mockWs, [
          { codeExecutionResult: { outcome: 'OUTCOME_OK', output: '{"sum": 11}\n' } },
        ]);
        simulateTextMessage(mockWs, 'The sum of 5 and 6 is 11.\n');
        simulateCompletionMessage(mockWs);
      }, 60);
      return mockWs;
    });

    const mockAddNumbers = jest.fn().mockResolvedValue({ sum: 5 + 6 });

    provider = new GoogleLiveProvider('gemini-2.0-flash-exp', {
      config: {
        generationConfig: {
          response_modalities: ['text'],
        },
        timeoutMs: 500,
        apiKey: 'test-api-key',
        tools: [
          {
            functionDeclarations: [
              {
                name: 'addNumbers',
                description: 'Add two numbers together',
                parameters: {
                  type: 'object',
                  properties: {
                    a: { type: 'number' },
                    b: { type: 'number' },
                  },
                  required: ['a', 'b'],
                },
              },
            ],
          },
        ],
        functionToolCallbacks: {
          addNumbers: mockAddNumbers,
        },
      },
    });

    const response = await provider.callApi('What is the sum of 5 and 6?');
    expect(response).toEqual({
      output: {
        text: 'The sum of 5 and 6 is 11.\n',
        toolCall: {
          functionCalls: [
            { name: 'addNumbers', args: { a: 5, b: 6 }, id: 'function-call-13767088400406609799' },
          ],
        },
        statefulApiState: undefined,
      },
      metadata: {},
    });
    expect(mockAddNumbers).toHaveBeenCalledTimes(1);
    expect(mockAddNumbers).toHaveBeenCalledWith('{"a":5,"b":6}');
  });

  it('should handle errors in function tool callbacks', async () => {
    jest.mocked(WebSocket).mockImplementation(() => {
      setTimeout(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulatePartsMessage(mockWs, [
          { executableCode: { language: 'PYTHON', code: 'print(default_api.errorFunction())\n' } },
        ]);
        simulateFunctionCallMessage(mockWs, [
          { name: 'errorFunction', args: {}, id: 'function-call-7580472343952164416' },
        ]);
        simulatePartsMessage(mockWs, [
          {
            codeExecutionResult: {
              outcome: 'OUTCOME_OK',
              output: "{'error': 'Error executing function errorFunction: Error: Test error'}\n",
            },
          },
        ]);
        simulateTextMessage(
          mockWs,
          'The function `errorFunction` has been called and it returned an error as expected.',
        );
        simulateCompletionMessage(mockWs);
      }, 60);
      return mockWs;
    });
    provider = new GoogleLiveProvider('gemini-2.0-flash-exp', {
      config: {
        generationConfig: {
          response_modalities: ['text'],
        },
        timeoutMs: 500,
        apiKey: 'test-api-key',
        tools: [
          {
            functionDeclarations: [
              {
                name: 'errorFunction',
                description: 'A function that always throws an error',
                parameters: {
                  type: 'OBJECT',
                  properties: {},
                },
              },
            ],
          },
        ],
        functionToolCallbacks: {
          errorFunction: () => {
            throw new Error('Test error');
          },
        },
      },
    });

    const response = await provider.callApi('Call the error function');
    expect(response).toEqual({
      output: {
        text: 'The function `errorFunction` has been called and it returned an error as expected.',
        toolCall: {
          functionCalls: [
            { name: 'errorFunction', args: {}, id: 'function-call-7580472343952164416' },
          ],
        },
        statefulApiState: undefined,
      },
      metadata: {},
    });
  });

  it('should handle function tool calls to a spawned stateful api', async () => {
    jest.mocked(WebSocket).mockImplementation(() => {
      setTimeout(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulatePartsMessage(mockWs, [
          {
            executableCode: {
              language: 'PYTHON',
              code: dedent`
                while True:
                  count_response = default_api.get_count()
                  if count_response and count_response.counter is not None and count_response.counter >= 5:
                    print(f"Counter reached {count_response.counter}, stopping.")
                    break
                  default_api.add_one()
                  print("Counter incremented.")
              `,
            },
          },
        ]);
        simulateFunctionCallMessage(mockWs, [
          { name: 'get_count', args: {}, id: 'function-call-809368982256348430' },
        ]);
        simulateFunctionCallMessage(mockWs, [
          { name: 'add_one', args: {}, id: 'function-call-7991972082416923583' },
        ]);
        simulateFunctionCallMessage(mockWs, [
          { name: 'get_count', args: {}, id: 'function-call-2287351185126351207' },
        ]);
        simulateFunctionCallMessage(mockWs, [
          { name: 'add_one', args: {}, id: 'function-call-4023509897900237366' },
        ]);
        simulateFunctionCallMessage(mockWs, [
          { name: 'get_count', args: {}, id: 'function-call-2287351185126351304' },
        ]);
        simulatePartsMessage(mockWs, [
          {
            codeExecutionResult: {
              outcome: 'OUTCOME_OK',
              output: 'Counter incremented.\nCounter incremented.\nCounter reached 5, stopping.\n',
            },
          },
        ]);
        simulateTextMessage(mockWs, 'The counter has been incremented until it reached 5.\n');
        simulateCompletionMessage(mockWs);
      }, 60);
      return mockWs;
    });

    provider = new GoogleLiveProvider('gemini-2.0-flash-exp', {
      config: {
        generationConfig: {
          response_modalities: ['text'],
        },
        timeoutMs: 500,
        apiKey: 'test-api-key',
        functionToolStatefulApi: {
          file: 'examples/google-live/counter_api.py',
          url: 'http://127.0.0.1:5000',
        },
        tools: [
          {
            functionDeclarations: [
              {
                name: 'add_one',
                description: 'add one to counter',
              },
              {
                name: 'get_count',
                description: 'return the current value of the counter',
                response: {
                  type: 'OBJECT',
                  properties: {
                    counter: {
                      type: 'INTEGER',
                      description: 'value of counter',
                    },
                  },
                },
              },
            ],
          },
        ],
      },
    });

    mockedAxios.get.mockResolvedValue({ data: { counter: 5 } });

    const response = await provider.callApi('Add to the counter until it reaches 5');
    expect(response).toEqual({
      output: {
        text: 'The counter has been incremented until it reached 5.\n',
        toolCall: {
          functionCalls: [
            { name: 'get_count', args: {}, id: 'function-call-809368982256348430' },
            { name: 'add_one', args: {}, id: 'function-call-7991972082416923583' },
            { name: 'get_count', args: {}, id: 'function-call-2287351185126351207' },
            { name: 'add_one', args: {}, id: 'function-call-4023509897900237366' },
            { name: 'get_count', args: {}, id: 'function-call-2287351185126351304' },
          ],
        },
        statefulApiState: { counter: 5 },
      },
      metadata: {},
    });
    expect(mockedAxios.get).toHaveBeenCalledTimes(6);
    expect(mockedAxios.get).toHaveBeenLastCalledWith('http://127.0.0.1:5000/get_state');
  });
  describe('Python executable integration', () => {
    it('should handle Python executable validation correctly', async () => {
      const mockSpawn = jest.requireMock('child_process').spawn;
      const validatePythonPathMock = jest.requireMock(
        '../../../src/python/pythonUtils',
      ).validatePythonPath;

      validatePythonPathMock.mockResolvedValueOnce('/custom/python/bin');

      const providerWithCustomPython = new GoogleLiveProvider('gemini-2.0-flash-exp', {
        config: {
          generationConfig: {
            response_modalities: ['text'],
          },
          timeoutMs: 500,
          apiKey: 'test-api-key',
          functionToolStatefulApi: {
            file: 'examples/google-live/counter_api.py',
            url: 'http://127.0.0.1:8765',
            pythonExecutable: '/custom/python/path',
          },
        },
      });

      jest.mocked(WebSocket).mockImplementation(() => {
        setTimeout(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
          simulateSetupMessage(mockWs);
          simulateTextMessage(mockWs, 'Test response');
          simulateCompletionMessage(mockWs);
        }, 10);
        return mockWs;
      });

      await providerWithCustomPython.callApi('Test prompt');

      expect(validatePythonPathMock).toHaveBeenCalledWith('/custom/python/path', true);

      expect(mockSpawn).toHaveBeenCalledWith('/custom/python/bin', [
        'examples/google-live/counter_api.py',
      ]);
    });

    it('should handle errors when spawning Python process', async () => {
      const mockSpawn = jest.requireMock('child_process').spawn;
      const validatePythonPathMock = jest.requireMock(
        '../../../src/python/pythonUtils',
      ).validatePythonPath;

      validatePythonPathMock.mockRejectedValueOnce(new Error('Python not found'));

      const originalError = console.error;
      const mockError = jest.fn();
      console.error = mockError;

      try {
        const providerWithPythonError = new GoogleLiveProvider('gemini-2.0-flash-exp', {
          config: {
            generationConfig: {
              response_modalities: ['text'],
            },
            timeoutMs: 500,
            apiKey: 'test-api-key',
            functionToolStatefulApi: {
              file: 'examples/google-live/counter_api.py',
              url: 'http://127.0.0.1:8765',
            },
          },
        });

        jest.mocked(WebSocket).mockImplementation(() => {
          setTimeout(() => {
            mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
            simulateSetupMessage(mockWs);
            simulateTextMessage(mockWs, 'Test response');
            simulateCompletionMessage(mockWs);
          }, 10);
          return mockWs;
        });

        await providerWithPythonError.callApi('Test prompt');

        expect(mockSpawn).not.toHaveBeenCalled();
      } finally {
        console.error = originalError;
      }
    });

    it('should handle stdout and stderr from the Python process', async () => {
      const mockSpawn = jest.requireMock('child_process').spawn;

      const mockStdout = { on: jest.fn() };
      const mockStderr = { on: jest.fn() };

      mockSpawn.mockReturnValueOnce({
        stdout: mockStdout,
        stderr: mockStderr,
        on: jest.fn(),
        kill: jest.fn(),
        killed: false,
      });

      const validatePythonPathMock = jest.requireMock(
        '../../../src/python/pythonUtils',
      ).validatePythonPath;
      validatePythonPathMock.mockResolvedValueOnce('python3');

      const providerWithStatefulApi = new GoogleLiveProvider('gemini-2.0-flash-exp', {
        config: {
          generationConfig: {
            response_modalities: ['text'],
          },
          timeoutMs: 500,
          apiKey: 'test-api-key',
          functionToolStatefulApi: {
            file: 'examples/google-live/counter_api.py',
            url: 'http://127.0.0.1:8765',
          },
        },
      });

      jest.mocked(WebSocket).mockImplementation(() => {
        setTimeout(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
          simulateSetupMessage(mockWs);
          simulateTextMessage(mockWs, 'Test response');
          simulateCompletionMessage(mockWs);
        }, 10);
        return mockWs;
      });

      await providerWithStatefulApi.callApi('Test prompt');

      expect(mockStdout.on).toHaveBeenCalledWith('data', expect.any(Function));
      expect(mockStderr.on).toHaveBeenCalledWith('data', expect.any(Function));
    });

    it('should use the PROMPTFOO_PYTHON env variable when available', async () => {
      const originalEnv = process.env.PROMPTFOO_PYTHON;
      process.env.PROMPTFOO_PYTHON = '/env/python3';

      const mockSpawn = jest.requireMock('child_process').spawn;
      const validatePythonPathMock = jest.requireMock(
        '../../../src/python/pythonUtils',
      ).validatePythonPath;
      validatePythonPathMock.mockResolvedValueOnce('/env/python3');

      try {
        const providerWithEnvPython = new GoogleLiveProvider('gemini-2.0-flash-exp', {
          config: {
            generationConfig: {
              response_modalities: ['text'],
            },
            timeoutMs: 500,
            apiKey: 'test-api-key',
            functionToolStatefulApi: {
              file: 'examples/google-live/counter_api.py',
              url: 'http://127.0.0.1:8765',
            },
          },
        });

        jest.mocked(WebSocket).mockImplementation(() => {
          setTimeout(() => {
            mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
            simulateSetupMessage(mockWs);
            simulateTextMessage(mockWs, 'Test response');
            simulateCompletionMessage(mockWs);
          }, 10);
          return mockWs;
        });

        await providerWithEnvPython.callApi('Test prompt');

        expect(validatePythonPathMock).toHaveBeenCalledWith('/env/python3', true);

        expect(mockSpawn).toHaveBeenCalledWith('/env/python3', [
          'examples/google-live/counter_api.py',
        ]);
      } finally {
        if (originalEnv) {
          process.env.PROMPTFOO_PYTHON = originalEnv;
        } else {
          delete process.env.PROMPTFOO_PYTHON;
        }
      }
    });

    it('should properly clean up Python process on WebSocket close', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn(),
        killed: false,
      };

      const mockSpawn = jest.requireMock('child_process').spawn;
      mockSpawn.mockReturnValueOnce(mockProcess);

      const validatePythonPathMock = jest.requireMock(
        '../../../src/python/pythonUtils',
      ).validatePythonPath;
      validatePythonPathMock.mockResolvedValueOnce('python3');

      const providerWithCleanup = new GoogleLiveProvider('gemini-2.0-flash-exp', {
        config: {
          generationConfig: {
            response_modalities: ['text'],
          },
          timeoutMs: 500,
          apiKey: 'test-api-key',
          functionToolStatefulApi: {
            file: 'examples/google-live/counter_api.py',
            url: 'http://127.0.0.1:8765',
          },
        },
      });

      jest.mocked(WebSocket).mockImplementation(() => {
        setTimeout(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
          simulateSetupMessage(mockWs);
          simulateTextMessage(mockWs, 'Test response');
          simulateCompletionMessage(mockWs);

          mockWs.onclose?.({ wasClean: true, code: 1000 } as WebSocket.CloseEvent);
        }, 10);
        return mockWs;
      });

      await providerWithCleanup.callApi('Test prompt');

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });
  });

  describe('Audio configurations', () => {
    it('should correctly format proactivity configuration', async () => {
      provider = new GoogleLiveProvider('gemini-2.5-flash-preview-native-audio-dialog', {
        config: {
          apiVersion: 'v1alpha',
          generationConfig: {
            response_modalities: ['audio'],
            proactivity: {
              proactiveAudio: true,
            },
          },
          timeoutMs: 500,
          apiKey: 'test-api-key',
        },
      });

      jest.mocked(WebSocket).mockImplementation(() => {
        setTimeout(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        }, 10);
        return mockWs;
      });

      await provider.callApi('test prompt');

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"proactivity":{"proactive_audio":true}'),
      );
    });

    it('should correctly format enableAffectiveDialog configuration', async () => {
      provider = new GoogleLiveProvider('gemini-2.5-flash-exp-native-audio-thinking-dialog', {
        config: {
          apiVersion: 'v1alpha',
          generationConfig: {
            response_modalities: ['audio'],
            enableAffectiveDialog: true,
          },
          timeoutMs: 500,
          apiKey: 'test-api-key',
        },
      });

      jest.mocked(WebSocket).mockImplementation(() => {
        setTimeout(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        }, 10);
        return mockWs;
      });

      await provider.callApi('test prompt');

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"enable_affective_dialog":true'),
      );
    });

    it('should correctly format outputAudioTranscription configuration', async () => {
      const transcriptionConfig = {
        includeTextualContent: true,
        language: 'en-US',
      };

      provider = new GoogleLiveProvider('gemini-2.5-flash-preview-native-audio-dialog', {
        config: {
          generationConfig: {
            response_modalities: ['audio'],
            outputAudioTranscription: transcriptionConfig,
          },
          timeoutMs: 500,
          apiKey: 'test-api-key',
        },
      });

      jest.mocked(WebSocket).mockImplementation(() => {
        setTimeout(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        }, 10);
        return mockWs;
      });

      await provider.callApi('test prompt');

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining(
          '"output_audio_transcription":{"includeTextualContent":true,"language":"en-US"}',
        ),
      );
    });

    it('should correctly format inputAudioTranscription configuration', async () => {
      const transcriptionConfig = {
        autoDetectLanguage: true,
      };

      provider = new GoogleLiveProvider('gemini-2.5-flash-preview-native-audio-dialog', {
        config: {
          generationConfig: {
            response_modalities: ['audio'],
            inputAudioTranscription: transcriptionConfig,
          },
          timeoutMs: 500,
          apiKey: 'test-api-key',
        },
      });

      jest.mocked(WebSocket).mockImplementation(() => {
        setTimeout(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        }, 10);
        return mockWs;
      });

      await provider.callApi('test prompt');

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"input_audio_transcription":{"autoDetectLanguage":true}'),
      );
    });

    it('should handle all audio configurations together', async () => {
      provider = new GoogleLiveProvider('gemini-2.5-flash-preview-native-audio-dialog', {
        config: {
          apiVersion: 'v1alpha',
          generationConfig: {
            response_modalities: ['audio'],
            proactivity: {
              proactiveAudio: true,
            },
            enableAffectiveDialog: true,
            outputAudioTranscription: {
              includeTextualContent: true,
            },
            inputAudioTranscription: {
              autoDetectLanguage: true,
            },
          },
          timeoutMs: 500,
          apiKey: 'test-api-key',
        },
      });

      jest.mocked(WebSocket).mockImplementation(() => {
        setTimeout(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        }, 10);
        return mockWs;
      });

      await provider.callApi('test prompt');

      const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0] as string);
      const generationConfig = sentMessage.setup.generation_config;

      expect(generationConfig.proactivity).toEqual({ proactive_audio: true });
      expect(generationConfig.enable_affective_dialog).toBe(true);
      expect(sentMessage.setup.output_audio_transcription).toEqual({ includeTextualContent: true });
      expect(sentMessage.setup.input_audio_transcription).toEqual({ autoDetectLanguage: true });
    });

    it('should not include audio configurations when they are not specified', async () => {
      provider = new GoogleLiveProvider('gemini-2.5-flash-preview-native-audio-dialog', {
        config: {
          generationConfig: {
            response_modalities: ['audio'],
          },
          timeoutMs: 500,
          apiKey: 'test-api-key',
        },
      });

      jest.mocked(WebSocket).mockImplementation(() => {
        setTimeout(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        }, 10);
        return mockWs;
      });

      await provider.callApi('test prompt');

      const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0] as string);
      const generationConfig = sentMessage.setup.generation_config;

      expect(generationConfig.proactivity).toBeUndefined();
      expect(generationConfig.enable_affective_dialog).toBeUndefined();
      expect(generationConfig.output_audio_transcription).toBeUndefined();
      expect(generationConfig.input_audio_transcription).toBeUndefined();
    });
  });
});
