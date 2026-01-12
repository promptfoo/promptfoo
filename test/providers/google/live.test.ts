import path from 'path';

import dedent from 'dedent';
import { afterEach, beforeEach, describe, expect, it, Mocked, vi } from 'vitest';
import WebSocket from 'ws';
import cliState from '../../../src/cliState';
import { importModule } from '../../../src/esm';
import { fetchJson, GoogleLiveProvider, tryGetThenPost } from '../../../src/providers/google/live';
import * as fetchModule from '../../../src/util/fetch/index';

const mockFetchWithProxy = vi.mocked(fetchModule.fetchWithProxy);

// Mock setTimeout globally to speed up tests
const originalSetTimeout = global.setTimeout;
global.setTimeout = vi.fn((callback: any, delay?: number) => {
  // For delays of 1000ms (Python startup), execute immediately
  if (delay === 1000) {
    return originalSetTimeout(callback, 0);
  }
  // For other delays, use the original setTimeout
  return originalSetTimeout(callback, delay);
}) as any;

vi.mock('ws');
vi.mock('../../../src/esm', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    importModule: vi.fn(),
  };
});
vi.mock('../../../src/python/pythonUtils', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    validatePythonPath: vi.fn().mockImplementation(async function (path) {
      return path;
    }),
  };
});
vi.mock('child_process', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    spawn: vi.fn(() => ({
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          // Use immediate callback instead of setTimeout
          setImmediate(callback);
        }
      }),
      kill: vi.fn(),
      killed: false,
    })),
  };
});
vi.mock('../../../src/util/fetch', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    fetchWithProxy: vi.fn(),
  };
});
vi.mock('../../../src/providers/google/util', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    // Mock getGoogleAccessToken to return undefined (no OAuth2 credentials)
    // This prevents the test from actually trying to authenticate with Google
    getGoogleAccessToken: vi.fn().mockResolvedValue(undefined),
  };
});

const mockImportModule = vi.mocked(importModule);

// Faster message simulation helpers - use setImmediate instead of setTimeout
const simulateMessage = (mockWs: Mocked<WebSocket>, simulated_data: any) => {
  setImmediate(() => {
    mockWs.onmessage?.({
      data: JSON.stringify(simulated_data),
    } as WebSocket.MessageEvent);
  });
};

const simulatePartsMessage = (mockWs: Mocked<WebSocket>, simulated_parts: any) => {
  simulateMessage(mockWs, { serverContent: { modelTurn: { parts: simulated_parts } } });
};

const simulateTextMessage = (mockWs: Mocked<WebSocket>, simulated_text: string) => {
  simulatePartsMessage(mockWs, [{ text: simulated_text }]);
};

const simulateFunctionCallMessage = (mockWs: Mocked<WebSocket>, simulated_calls: any) => {
  simulateMessage(mockWs, { toolCall: { functionCalls: simulated_calls } });
};

const simulateSetupMessage = (mockWs: Mocked<WebSocket>) => {
  simulateMessage(mockWs, { setupComplete: {} });
};

const simulateCompletionMessage = (mockWs: Mocked<WebSocket>) => {
  simulateMessage(mockWs, { serverContent: { turnComplete: true } });
};

describe('GoogleLiveProvider', () => {
  let mockWs: Mocked<WebSocket>;
  let provider: GoogleLiveProvider;

  beforeEach(async () => {
    // Reset fetchWithProxy mock to prevent test pollution from async callbacks
    mockFetchWithProxy.mockReset();

    mockWs = {
      on: vi.fn(),
      send: vi.fn(),
      close: vi.fn(),
      onmessage: vi.fn(),
      onerror: vi.fn(),
      onopen: vi.fn(),
    } as unknown as Mocked<WebSocket>;

    vi.mocked(WebSocket).mockImplementation(function () {
      return mockWs;
    });

    // Reset validatePythonPath mock for each test
    vi.mocked(
      (await import('../../../src/python/pythonUtils')).validatePythonPath,
    ).mockImplementation(async function (path: string) {
      return path;
    });

    provider = new GoogleLiveProvider('gemini-2.0-flash-exp', {
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
    vi.clearAllMocks();
  });

  it('should initialize with correct config', () => {
    expect(provider.modelName).toBe('gemini-2.0-flash-exp');
    expect(provider.config.generationConfig?.response_modalities?.[0]).toBe('text');
  });

  it('should return the correct id', () => {
    expect(provider.id()).toBe('google:live:gemini-2.0-flash-exp');
  });

  it('should send message and handle basic response', async () => {
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulateTextMessage(mockWs, 'test');
        simulateTextMessage(mockWs, ' response');
        simulateCompletionMessage(mockWs);
      });
      return mockWs;
    });

    const responsePromise = provider.callApi('test prompt');

    const response = await responsePromise;
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
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
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
      });
      return mockWs;
    });

    const responsePromise = provider.callApi('test prompt');

    const response = await responsePromise;
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
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
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
      });
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
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
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
      });
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
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
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
      });
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
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
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
      });
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
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onerror?.({
          type: 'error',
          error: new Error('connection failed'),
          message: 'connection failed',
        } as WebSocket.ErrorEvent);
      });
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

    const originalGoogleApiKey = process.env.GOOGLE_API_KEY;
    const originalGeminiApiKey = process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;

    await expect(providerWithoutKey.callApi('test prompt')).rejects.toThrow(
      'Google authentication is not configured',
    );

    if (originalGoogleApiKey) {
      process.env.GOOGLE_API_KEY = originalGoogleApiKey;
    }
    if (originalGeminiApiKey) {
      process.env.GEMINI_API_KEY = originalGeminiApiKey;
    }
  });

  it('should handle function tool callbacks correctly', async () => {
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
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
      });
      return mockWs;
    });

    const mockAddNumbers = vi.fn().mockResolvedValue({ sum: 5 + 6 });

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
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
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
      });
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
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
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
      });
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

    // Mock fetchWithProxy to return successful responses
    mockFetchWithProxy.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ counter: 5 }),
    } as any);

    // Record call count before API call to handle async pollution from other tests
    // Using difference-based counting instead of mockClear() to avoid race conditions
    // with setImmediate callbacks from previous tests
    const callCountBefore = mockFetchWithProxy.mock.calls.length;

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

    // Check the specific calls made to the stateful API during this test
    // Using slice to only check calls made during this test, avoiding pollution from
    // async callbacks of previous tests that may complete during this test
    const testCalls = mockFetchWithProxy.mock.calls.slice(callCountBefore);
    const getCallUrls = testCalls.map((call) => call[0]) as string[];

    // Verify minimum number of calls (5 function calls + 1 get_state)
    // Note: Due to async timing variations (especially on Node 24.x), there may be extra calls
    expect(getCallUrls.length).toBeGreaterThanOrEqual(6);

    // Verify get_state was called last (this is deterministic - happens in finalizeResponse)
    expect(getCallUrls[getCallUrls.length - 1]).toBe('http://127.0.0.1:5000/get_state');

    // Verify all expected function calls were made (filter to just function call URLs)
    const functionCallUrls = getCallUrls.filter((url) => url !== 'http://127.0.0.1:5000/get_state');
    const addOneCalls = functionCallUrls.filter((url) => url === 'http://127.0.0.1:5000/add_one');
    const getCountCalls = functionCallUrls.filter(
      (url) => url === 'http://127.0.0.1:5000/get_count',
    );

    // Should have at least 2 add_one calls and 3 get_count calls
    expect(addOneCalls.length).toBeGreaterThanOrEqual(2);
    expect(getCountCalls.length).toBeGreaterThanOrEqual(3);
  });
  describe('Python executable integration', () => {
    it('should handle Python executable validation correctly', async () => {
      const mockSpawn = vi.mocked((await import('child_process')).spawn);
      const validatePythonPathMock = vi.mocked(
        (await import('../../../src/python/pythonUtils')).validatePythonPath,
      );

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

      vi.mocked(WebSocket).mockImplementation(function () {
        setImmediate(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
          simulateSetupMessage(mockWs);
          simulateTextMessage(mockWs, 'Test response');
          simulateCompletionMessage(mockWs);
        });
        return mockWs;
      });

      await providerWithCustomPython.callApi('Test prompt');

      expect(validatePythonPathMock).toHaveBeenCalledWith('/custom/python/path', true);

      expect(mockSpawn).toHaveBeenCalledWith('/custom/python/bin', [
        'examples/google-live/counter_api.py',
      ]);
    });

    it('should handle errors when spawning Python process', async () => {
      const mockSpawn = vi.mocked((await import('child_process')).spawn);
      const validatePythonPathMock = vi.mocked(
        (await import('../../../src/python/pythonUtils')).validatePythonPath,
      );

      validatePythonPathMock.mockRejectedValueOnce(new Error('Python not found'));

      const originalError = console.error;
      const mockError = vi.fn();
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

        vi.mocked(WebSocket).mockImplementation(function () {
          setImmediate(() => {
            mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
            simulateSetupMessage(mockWs);
            simulateTextMessage(mockWs, 'Test response');
            simulateCompletionMessage(mockWs);
          });
          return mockWs;
        });

        await providerWithPythonError.callApi('Test prompt');

        expect(mockSpawn).not.toHaveBeenCalled();
      } finally {
        console.error = originalError;
      }
    });

    it('should handle stdout and stderr from the Python process', async () => {
      const mockSpawn = vi.mocked((await import('child_process')).spawn);

      const mockStdout = { on: vi.fn() };
      const mockStderr = { on: vi.fn() };

      mockSpawn.mockReturnValueOnce({
        stdout: mockStdout,
        stderr: mockStderr,
        on: vi.fn(),
        kill: vi.fn(),
        killed: false,
      } as any);

      const validatePythonPathMock = vi.mocked(
        (await import('../../../src/python/pythonUtils')).validatePythonPath,
      );
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

      vi.mocked(WebSocket).mockImplementation(function () {
        setImmediate(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
          simulateSetupMessage(mockWs);
          simulateTextMessage(mockWs, 'Test response');
          simulateCompletionMessage(mockWs);
        });
        return mockWs;
      });

      await providerWithStatefulApi.callApi('Test prompt');

      expect(mockStdout.on).toHaveBeenCalledWith('data', expect.any(Function));
      expect(mockStderr.on).toHaveBeenCalledWith('data', expect.any(Function));
    });

    it('should use the PROMPTFOO_PYTHON env variable when available', async () => {
      const originalEnv = process.env.PROMPTFOO_PYTHON;
      process.env.PROMPTFOO_PYTHON = '/env/python3';

      const mockSpawn = vi.mocked((await import('child_process')).spawn);
      const validatePythonPathMock = vi.mocked(
        (await import('../../../src/python/pythonUtils')).validatePythonPath,
      );
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

        vi.mocked(WebSocket).mockImplementation(function () {
          setImmediate(() => {
            mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
            simulateSetupMessage(mockWs);
            simulateTextMessage(mockWs, 'Test response');
            simulateCompletionMessage(mockWs);
          });
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
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
        killed: false,
      };

      const mockSpawn = vi.mocked((await import('child_process')).spawn);
      mockSpawn.mockReturnValueOnce(mockProcess as any);

      const validatePythonPathMock = vi.mocked(
        (await import('../../../src/python/pythonUtils')).validatePythonPath,
      );
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

      vi.mocked(WebSocket).mockImplementation(function () {
        setImmediate(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
          simulateSetupMessage(mockWs);
          simulateTextMessage(mockWs, 'Test response');
          simulateCompletionMessage(mockWs);

          mockWs.onclose?.({ wasClean: true, code: 1000 } as WebSocket.CloseEvent);
        });
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

      vi.mocked(WebSocket).mockImplementation(function () {
        setImmediate(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
          // Trigger onclose immediately to resolve the promise
          setImmediate(() => {
            mockWs.onclose?.({
              wasClean: true,
              code: 1000,
              reason: 'Test close',
            } as WebSocket.CloseEvent);
          });
        });
        return mockWs;
      });

      await provider.callApi('test prompt');

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"proactivity":{"proactive_audio":true}'),
      );
    });

    it('should correctly format enableAffectiveDialog configuration', async () => {
      provider = new GoogleLiveProvider('gemini-2.5-flash-native-audio-thinking-dialog', {
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

      vi.mocked(WebSocket).mockImplementation(function () {
        setImmediate(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
          // Trigger onclose immediately to resolve the promise
          setImmediate(() => {
            mockWs.onclose?.({
              wasClean: true,
              code: 1000,
              reason: 'Test close',
            } as WebSocket.CloseEvent);
          });
        });
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

      vi.mocked(WebSocket).mockImplementation(function () {
        setImmediate(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
          // Trigger onclose immediately to resolve the promise
          setImmediate(() => {
            mockWs.onclose?.({
              wasClean: true,
              code: 1000,
              reason: 'Test close',
            } as WebSocket.CloseEvent);
          });
        });
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

      vi.mocked(WebSocket).mockImplementation(function () {
        setImmediate(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
          // Trigger onclose immediately to resolve the promise
          setImmediate(() => {
            mockWs.onclose?.({
              wasClean: true,
              code: 1000,
              reason: 'Test close',
            } as WebSocket.CloseEvent);
          });
        });
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

      vi.mocked(WebSocket).mockImplementation(function () {
        setImmediate(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
          // Trigger onclose immediately to resolve the promise
          setImmediate(() => {
            mockWs.onclose?.({
              wasClean: true,
              code: 1000,
              reason: 'Test close',
            } as WebSocket.CloseEvent);
          });
        });
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

      vi.mocked(WebSocket).mockImplementation(function () {
        setImmediate(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
          // Trigger onclose immediately to resolve the promise
          setImmediate(() => {
            mockWs.onclose?.({
              wasClean: true,
              code: 1000,
              reason: 'Test close',
            } as WebSocket.CloseEvent);
          });
        });
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

  describe('External Function Callbacks', () => {
    beforeEach(() => {
      // Set cliState basePath for external function loading
      cliState.basePath = '/test/base/path';
    });

    afterEach(() => {
      vi.clearAllMocks();
      cliState.basePath = undefined;
    });

    it('should load and execute external function callbacks from file', async () => {
      vi.mocked(WebSocket).mockImplementation(function () {
        setImmediate(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
          simulateSetupMessage(mockWs);
          simulateFunctionCallMessage(mockWs, [
            { name: 'external_function', args: { param: 'test_value' }, id: 'function-call-ext-1' },
          ]);
          simulateTextMessage(mockWs, 'External function result');
          simulateCompletionMessage(mockWs);
        });
        return mockWs;
      });

      // Mock importModule to return our test function
      const mockExternalFunction = vi.fn().mockResolvedValue('External function result');
      mockImportModule.mockResolvedValue(mockExternalFunction);

      provider = new GoogleLiveProvider('gemini-2.0-flash-exp', {
        config: {
          generationConfig: { response_modalities: ['text'] },
          timeoutMs: 500,
          apiKey: 'test-api-key',
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'external_function',
                  description: 'An external function',
                  parameters: {
                    type: 'OBJECT',
                    properties: { param: { type: 'STRING' } },
                    required: ['param'],
                  },
                },
              ],
            },
          ],
          functionToolCallbacks: {
            external_function: 'file://test/callbacks.js:testFunction',
          },
        },
      });

      const response = await provider.callApi('Call external function');

      expect(mockImportModule).toHaveBeenCalledWith(
        path.resolve('/test/base/path', 'test/callbacks.js'),
        'testFunction',
      );
      expect(mockExternalFunction).toHaveBeenCalledWith('{"param":"test_value"}');
      expect(response.output.text).toBe('External function result');
    });

    it('should cache external functions and not reload them on subsequent calls', async () => {
      vi.mocked(WebSocket).mockImplementation(function () {
        setImmediate(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
          simulateSetupMessage(mockWs);
          simulateFunctionCallMessage(mockWs, [
            { name: 'cached_function', args: { value: 123 }, id: 'function-call-cache-1' },
          ]);
          simulateTextMessage(mockWs, 'Cached result');
          simulateCompletionMessage(mockWs);
        });
        return mockWs;
      });

      const mockCachedFunction = vi.fn().mockResolvedValue('Cached result');
      mockImportModule.mockResolvedValue(mockCachedFunction);

      provider = new GoogleLiveProvider('gemini-2.0-flash-exp', {
        config: {
          generationConfig: { response_modalities: ['text'] },
          timeoutMs: 500,
          apiKey: 'test-api-key',
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'cached_function',
                  description: 'A cached function',
                  parameters: {
                    type: 'OBJECT',
                    properties: { value: { type: 'NUMBER' } },
                    required: ['value'],
                  },
                },
              ],
            },
          ],
          functionToolCallbacks: {
            cached_function: 'file://callbacks/cache-test.js:cachedFunction',
          },
        },
      });

      // First call - should load the function
      const result1 = await provider.callApi('First call');
      expect(mockImportModule).toHaveBeenCalledTimes(1);
      expect(mockCachedFunction).toHaveBeenCalledWith('{"value":123}');
      expect(result1.output.text).toBe('Cached result');

      // Reset WebSocket mock for second call
      vi.mocked(WebSocket).mockImplementation(function () {
        setImmediate(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
          simulateSetupMessage(mockWs);
          simulateFunctionCallMessage(mockWs, [
            { name: 'cached_function', args: { value: 456 }, id: 'function-call-cache-2' },
          ]);
          simulateTextMessage(mockWs, 'Cached result');
          simulateCompletionMessage(mockWs);
        });
        return mockWs;
      });

      // Second call - should use cached function, not reload
      const result2 = await provider.callApi('Second call');
      expect(mockImportModule).toHaveBeenCalledTimes(1); // Still only 1 call
      expect(mockCachedFunction).toHaveBeenCalledTimes(2);
      expect(result2.output.text).toBe('Cached result');
    });

    it('should handle errors in external function loading gracefully', async () => {
      vi.mocked(WebSocket).mockImplementation(function () {
        setImmediate(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
          simulateSetupMessage(mockWs);
          simulateFunctionCallMessage(mockWs, [
            { name: 'error_function', args: { test: 'data' }, id: 'function-call-error-1' },
          ]);
          simulateTextMessage(mockWs, 'Function failed gracefully');
          simulateCompletionMessage(mockWs);
        });
        return mockWs;
      });

      // Mock import module to throw an error
      mockImportModule.mockRejectedValue(new Error('Module not found'));

      provider = new GoogleLiveProvider('gemini-2.0-flash-exp', {
        config: {
          generationConfig: { response_modalities: ['text'] },
          timeoutMs: 500,
          apiKey: 'test-api-key',
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'error_function',
                  description: 'A function that errors during loading',
                  parameters: {
                    type: 'OBJECT',
                    properties: { test: { type: 'STRING' } },
                  },
                },
              ],
            },
          ],
          functionToolCallbacks: {
            error_function: 'file://nonexistent/module.js:errorFunction',
          },
        },
      });

      const response = await provider.callApi('Call error function');

      expect(mockImportModule).toHaveBeenCalledWith(
        path.resolve('/test/base/path', 'nonexistent/module.js'),
        'errorFunction',
      );
      // Should continue with normal flow despite error
      expect(response.output.text).toBe('Function failed gracefully');
    });

    it('should handle mixed inline and external function callbacks', async () => {
      vi.mocked(WebSocket).mockImplementation(function () {
        setImmediate(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
          simulateSetupMessage(mockWs);
          simulateFunctionCallMessage(mockWs, [
            { name: 'inline_function', args: { inline: 'test' }, id: 'function-call-inline-1' },
            {
              name: 'external_function',
              args: { external: 'test' },
              id: 'function-call-external-1',
            },
          ]);
          simulateTextMessage(mockWs, 'Mixed functions completed');
          simulateCompletionMessage(mockWs);
        });
        return mockWs;
      });

      const mockInlineFunction = vi.fn().mockResolvedValue('Inline result');
      const mockExternalFunction = vi.fn().mockResolvedValue('External result');
      mockImportModule.mockResolvedValue(mockExternalFunction);

      provider = new GoogleLiveProvider('gemini-2.0-flash-exp', {
        config: {
          generationConfig: { response_modalities: ['text'] },
          timeoutMs: 500,
          apiKey: 'test-api-key',
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'inline_function',
                  description: 'An inline function',
                  parameters: {
                    type: 'OBJECT',
                    properties: { inline: { type: 'STRING' } },
                  },
                },
                {
                  name: 'external_function',
                  description: 'An external function',
                  parameters: {
                    type: 'OBJECT',
                    properties: { external: { type: 'STRING' } },
                  },
                },
              ],
            },
          ],
          functionToolCallbacks: {
            inline_function: mockInlineFunction,
            external_function: 'file://mixed/callbacks.js:externalFunc',
          },
        },
      });

      const response = await provider.callApi('Test mixed callbacks');

      expect(mockInlineFunction).toHaveBeenCalledWith('{"inline":"test"}');
      expect(mockImportModule).toHaveBeenCalledWith(
        path.resolve('/test/base/path', 'mixed/callbacks.js'),
        'externalFunc',
      );
      expect(mockExternalFunction).toHaveBeenCalledWith('{"external":"test"}');
      expect(response.output.text).toBe('Mixed functions completed');
    });
  });

  describe('fetchJson', () => {
    it('should successfully fetch and parse JSON', async () => {
      const mockData = { success: true, data: 'test data' };
      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockData),
      } as any);

      const result = await fetchJson('https://example.com/api');

      expect(mockFetchWithProxy).toHaveBeenCalledWith('https://example.com/api', undefined);
      expect(result).toEqual(mockData);
    });

    it('should pass options to fetchWithProxy', async () => {
      const mockData = { result: 'success' };
      const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: 'data' }),
      };

      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockData),
      } as any);

      const result = await fetchJson('https://example.com/api', options);

      expect(mockFetchWithProxy).toHaveBeenCalledWith('https://example.com/api', options);
      expect(result).toEqual(mockData);
    });

    it('should throw error when response is not ok', async () => {
      mockFetchWithProxy.mockResolvedValue({
        ok: false,
        status: 404,
        json: vi.fn(),
      } as any);

      await expect(fetchJson('https://example.com/api')).rejects.toThrow(
        'HTTP error - status: 404',
      );
    });

    it('should throw error with status 500', async () => {
      mockFetchWithProxy.mockResolvedValue({
        ok: false,
        status: 500,
        json: vi.fn(),
      } as any);

      await expect(fetchJson('https://example.com/api')).rejects.toThrow(
        'HTTP error - status: 500',
      );
    });

    it('should propagate network errors', async () => {
      const networkError = new Error('Network failure');
      mockFetchWithProxy.mockRejectedValue(networkError);

      await expect(fetchJson('https://example.com/api')).rejects.toThrow('Network failure');
    });
  });

  describe('tryGetThenPost', () => {
    it('should successfully fetch with GET when no data provided', async () => {
      const mockData = { result: 'success' };
      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockData),
      } as any);

      const result = await tryGetThenPost('https://example.com/api');

      expect(mockFetchWithProxy).toHaveBeenCalledTimes(1);
      expect(mockFetchWithProxy).toHaveBeenCalledWith('https://example.com/api', undefined);
      expect(result).toEqual(mockData);
    });

    it('should successfully fetch with GET when data is provided as object', async () => {
      const mockData = { result: 'success' };
      const data = { param1: 'value1', param2: 'value2' };
      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockData),
      } as any);

      const result = await tryGetThenPost('https://example.com/api', data);

      expect(mockFetchWithProxy).toHaveBeenCalledTimes(1);
      expect(mockFetchWithProxy).toHaveBeenCalledWith(
        'https://example.com/api?param1=value1&param2=value2',
        undefined,
      );
      expect(result).toEqual(mockData);
    });

    it('should successfully fetch with GET when data is provided as string', async () => {
      const mockData = { result: 'success' };
      const data = '{"param1":"value1","param2":"value2"}';
      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockData),
      } as any);

      const result = await tryGetThenPost('https://example.com/api', data);

      expect(mockFetchWithProxy).toHaveBeenCalledTimes(1);
      expect(mockFetchWithProxy).toHaveBeenCalledWith(
        'https://example.com/api?param1=value1&param2=value2',
        undefined,
      );
      expect(result).toEqual(mockData);
    });

    it('should fallback to POST when GET fails', async () => {
      const mockData = { result: 'success via POST' };
      const data = { param1: 'value1' };

      // First call (GET) fails
      mockFetchWithProxy
        .mockRejectedValueOnce(new Error('GET failed'))
        // Second call (POST) succeeds
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue(mockData),
        } as any);

      const result = await tryGetThenPost('https://example.com/api', data);

      expect(mockFetchWithProxy).toHaveBeenCalledTimes(2);
      // First call with GET
      expect(mockFetchWithProxy).toHaveBeenNthCalledWith(
        1,
        'https://example.com/api?param1=value1',
        undefined,
      );
      // Second call with POST
      expect(mockFetchWithProxy).toHaveBeenNthCalledWith(2, 'https://example.com/api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      expect(result).toEqual(mockData);
    });

    it('should fallback to POST when GET returns non-ok response', async () => {
      const mockData = { result: 'success via POST' };
      const data = { param1: 'value1' };

      // First call (GET) returns 404
      mockFetchWithProxy
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          json: vi.fn(),
        } as any)
        // Second call (POST) succeeds
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue(mockData),
        } as any);

      const result = await tryGetThenPost('https://example.com/api', data);

      expect(mockFetchWithProxy).toHaveBeenCalledTimes(2);
      expect(mockFetchWithProxy).toHaveBeenNthCalledWith(2, 'https://example.com/api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      expect(result).toEqual(mockData);
    });

    it('should handle POST with string data', async () => {
      const mockData = { result: 'success' };
      const data = '{"param1":"value1"}';

      mockFetchWithProxy.mockRejectedValueOnce(new Error('GET failed')).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockData),
      } as any);

      const result = await tryGetThenPost('https://example.com/api', data);

      expect(mockFetchWithProxy).toHaveBeenNthCalledWith(2, 'https://example.com/api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: data,
      });
      expect(result).toEqual(mockData);
    });

    it('should handle POST with no data', async () => {
      const mockData = { result: 'success' };

      mockFetchWithProxy.mockRejectedValueOnce(new Error('GET failed')).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockData),
      } as any);

      const result = await tryGetThenPost('https://example.com/api');

      expect(mockFetchWithProxy).toHaveBeenNthCalledWith(2, 'https://example.com/api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: null,
      });
      expect(result).toEqual(mockData);
    });

    it('should handle complex query parameters in GET', async () => {
      const mockData = { result: 'success' };
      const data = {
        param1: 'value with spaces',
        param2: 123,
        param3: true,
        param4: 'special&chars=test',
      };
      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockData),
      } as any);

      const result = await tryGetThenPost('https://example.com/api', data);

      expect(mockFetchWithProxy).toHaveBeenCalledTimes(1);
      const calledUrl = mockFetchWithProxy.mock.calls[0][0] as string;
      expect(calledUrl).toContain('param1=value+with+spaces');
      expect(calledUrl).toContain('param2=123');
      expect(calledUrl).toContain('param3=true');
      expect(result).toEqual(mockData);
    });

    it('should throw error when both GET and POST fail', async () => {
      const data = { param1: 'value1' };

      mockFetchWithProxy
        .mockRejectedValueOnce(new Error('GET failed'))
        .mockRejectedValueOnce(new Error('POST failed'));

      await expect(tryGetThenPost('https://example.com/api', data)).rejects.toThrow('POST failed');
      expect(mockFetchWithProxy).toHaveBeenCalledTimes(2);
    });
  });
});
