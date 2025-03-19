import { disableCache, enableCache } from '../../../src/cache';
import { OpenAiAssistantProvider } from '../../../src/providers/openai/assistant';

jest.spyOn(global, 'fetch').mockImplementation();

function createSuccessResponse<T>(data: T): Response {
  const response = {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
    redirected: false,
    type: 'basic' as ResponseType,
    url: 'https://api.openai.com/v1',
    body: null,
    bodyUsed: false,
    clone: () => response,
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob(),
    formData: async () => new FormData(),
    text: async () => JSON.stringify(data),
    json: async () => data,
  };
  return response as unknown as Response;
}

function createErrorResponse(
  status = 500,
  statusText = 'Internal Server Error',
  error: any = {},
): Response {
  const response = {
    ok: false,
    status,
    statusText,
    headers: new Headers(),
    redirected: false,
    type: 'basic' as ResponseType,
    url: 'https://api.openai.com/v1',
    body: null,
    bodyUsed: false,
    clone: () => response,
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob(),
    formData: async () => new FormData(),
    text: async () => JSON.stringify({ error }),
    json: async () => ({ error }),
  };
  return response as unknown as Response;
}

describe('OpenAI Provider with Fetch', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    disableCache();
    jest.mocked(global.fetch).mockReset();
  });

  afterEach(() => {
    enableCache();
  });

  describe('OpenAiAssistantProvider', () => {
    const provider = new OpenAiAssistantProvider('test-assistant-id', {
      config: {
        apiKey: 'test-key',
        organization: 'test-org',
        functionToolCallbacks: {
          test_function: async (args: string) => 'Function result',
        },
      },
    });

    it('should handle successful assistant completion', async () => {
      const mockRun = {
        id: 'run_123',
        thread_id: 'thread_123',
        status: 'completed',
      };

      const mockSteps = {
        data: [
          {
            id: 'step_1',
            step_details: {
              type: 'message_creation',
              message_creation: {
                message_id: 'msg_1',
              },
            },
          },
        ],
      };

      const mockMessage = {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: {
              value: 'Test response',
            },
          },
        ],
      };

      const mockFetch = jest.mocked(global.fetch);

      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockSteps));
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockMessage));

      const result = await provider.callApi('Test prompt');

      expect(result.output).toBe('[Assistant] Test response');
      expect(mockFetch).toHaveBeenCalledTimes(4);

      expect(mockFetch.mock.calls[0][0]).toContain('/threads/runs');
      expect(mockFetch.mock.calls[1][0]).toContain(
        `/threads/${mockRun.thread_id}/runs/${mockRun.id}`,
      );
      expect(mockFetch.mock.calls[2][0]).toContain(
        `/threads/${mockRun.thread_id}/runs/${mockRun.id}/steps`,
      );
      expect(mockFetch.mock.calls[3][0]).toContain(`/threads/${mockRun.thread_id}/messages/`);

      for (let i = 0; i < mockFetch.mock.calls.length; i++) {
        const options = mockFetch.mock.calls[i][1] as RequestInit;
        expect(options.headers).toBeDefined();
        expect((options.headers as Record<string, string>)['OpenAI-Beta']).toBe('assistants=v2');
      }
    });

    it('should handle function calling', async () => {
      const mockRun = {
        id: 'run_123',
        thread_id: 'thread_123',
        status: 'requires_action',
        required_action: {
          type: 'submit_tool_outputs',
          submit_tool_outputs: {
            tool_calls: [
              {
                id: 'call_123',
                type: 'function',
                function: {
                  name: 'test_function',
                  arguments: '{"arg": "value"}',
                },
              },
            ],
          },
        },
      };

      const mockCompletedRun = {
        status: 'completed',
        required_action: null,
        id: 'run_123',
        thread_id: 'thread_123',
      };

      const mockSteps = {
        data: [
          {
            id: 'step_1',
            step_details: {
              type: 'tool_calls',
              tool_calls: [
                {
                  type: 'function',
                  function: {
                    name: 'test_function',
                    arguments: '{"arg": "value"}',
                    output: 'Function result',
                  },
                },
              ],
            },
          },
        ],
      };

      const mockFetch = jest.mocked(global.fetch);

      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockCompletedRun));
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockCompletedRun));
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockSteps));

      const result = await provider.callApi('Test prompt');

      expect(result.output).toBe(
        '[Call function test_function with arguments {"arg": "value"}]\n\n[Function output: Function result]',
      );
      expect(mockFetch).toHaveBeenCalledTimes(5);

      for (let i = 0; i < mockFetch.mock.calls.length; i++) {
        const options = mockFetch.mock.calls[i][1] as RequestInit;
        expect(options.headers).toBeDefined();
        expect((options.headers as Record<string, string>)['OpenAI-Beta']).toBe('assistants=v2');
      }
    });

    it('should handle run failures', async () => {
      const mockRun = {
        id: 'run_123',
        thread_id: 'thread_123',
        status: 'failed',
        last_error: {
          message: 'Test error message',
        },
      };

      const mockFetch = jest.mocked(global.fetch);

      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));

      const result = await provider.callApi('Test prompt');

      expect(result.error).toBe('Thread run failed: Test error message');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle API errors', async () => {
      const mockFetch = jest.mocked(global.fetch);

      mockFetch.mockImplementationOnce(async () =>
        createErrorResponse(500, 'Internal Server Error', {
          type: 'API Error',
          message: 'API Error',
        }),
      );

      const result = await provider.callApi('Test prompt');

      expect(result.error).toBe('API error: API Error: API Error');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle missing API key', async () => {
      const providerNoKey = new OpenAiAssistantProvider('test-assistant-id');
      const originalApiKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = '';

      const result = await providerNoKey.callApi('Test prompt');
      expect(result.error).toContain('OpenAI API key is not set');

      process.env.OPENAI_API_KEY = originalApiKey;
    });

    it('should handle code interpreter tool calls', async () => {
      const mockRun = {
        id: 'run_123',
        thread_id: 'thread_123',
        status: 'completed',
      };

      const mockSteps = {
        data: [
          {
            id: 'step_1',
            step_details: {
              type: 'tool_calls',
              tool_calls: [
                {
                  type: 'code_interpreter',
                  code_interpreter: {
                    input: 'print("Hello World")',
                    outputs: [
                      {
                        type: 'logs',
                        logs: 'Hello World',
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      };

      const mockFetch = jest.mocked(global.fetch);

      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockSteps));

      const result = await provider.callApi('Test prompt');

      expect(result.output).toBe(
        '[Code interpreter input]\n\nprint("Hello World")\n\n[Code interpreter output]\n\nHello World',
      );
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should handle file search tool calls', async () => {
      const mockRun = {
        id: 'run_123',
        thread_id: 'thread_123',
        status: 'completed',
      };

      const mockSteps = {
        data: [
          {
            id: 'step_1',
            step_details: {
              type: 'tool_calls',
              tool_calls: [
                {
                  type: 'file_search',
                },
              ],
            },
          },
        ],
      };

      const mockFetch = jest.mocked(global.fetch);

      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockSteps));

      const result = await provider.callApi('Test prompt');

      expect(result.output).toBe('[Ran file search]');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should handle unknown tool call types', async () => {
      const mockRun = {
        id: 'run_123',
        thread_id: 'thread_123',
        status: 'completed',
      };

      const mockSteps = {
        data: [
          {
            id: 'step_1',
            step_details: {
              type: 'tool_calls',
              tool_calls: [
                {
                  type: 'unknown_tool',
                },
              ],
            },
          },
        ],
      };

      const mockFetch = jest.mocked(global.fetch);

      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockSteps));

      const result = await provider.callApi('Test prompt');

      expect(result.output).toBe('[Unknown tool call type: unknown_tool]');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should handle unknown step types', async () => {
      const mockRun = {
        id: 'run_123',
        thread_id: 'thread_123',
        status: 'completed',
      };

      const mockSteps = {
        data: [
          {
            id: 'step_1',
            step_details: {
              type: 'unknown_step',
            },
          },
        ],
      };

      const mockFetch = jest.mocked(global.fetch);

      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockSteps));

      const result = await provider.callApi('Test prompt');

      expect(result.output).toBe('[Unknown step type: unknown_step]');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should handle run step retrieval errors', async () => {
      const mockRun = {
        id: 'run_123',
        thread_id: 'thread_123',
        status: 'completed',
      };

      const mockFetch = jest.mocked(global.fetch);

      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));
      mockFetch.mockImplementationOnce(async () =>
        createErrorResponse(500, 'Internal Server Error', { message: 'Run steps retrieval error' }),
      );

      const result = await provider.callApi('Test prompt');

      expect(result.error).toBeDefined();
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
    it('should handle message retrieval errors', async () => {
      const mockRun = {
        id: 'run_123',
        thread_id: 'thread_123',
        status: 'completed',
      };

      const mockSteps = {
        data: [
          {
            id: 'step_1',
            step_details: {
              type: 'message_creation',
              message_creation: {
                message_id: 'msg_1',
              },
            },
          },
        ],
      };

      const mockFetch = jest.mocked(global.fetch);

      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockSteps));
      mockFetch.mockImplementationOnce(async () =>
        createErrorResponse(500, 'Internal Server Error', { message: 'Message retrieval error' }),
      );

      const result = await provider.callApi('Test prompt');

      expect(result.error).toBeDefined();
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('should handle cancelled run status', async () => {
      const mockRun = {
        id: 'run_123',
        thread_id: 'thread_123',
        status: 'cancelled',
      };

      const mockFetch = jest.mocked(global.fetch);

      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));

      const result = await provider.callApi('Test prompt');

      expect(result.error).toBe('Thread run failed: cancelled');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle tool output submission errors', async () => {
      const mockRun = {
        id: 'run_123',
        thread_id: 'thread_123',
        status: 'requires_action',
        required_action: {
          type: 'submit_tool_outputs',
          submit_tool_outputs: {
            tool_calls: [
              {
                id: 'call_123',
                type: 'function',
                function: {
                  name: 'test_function',
                  arguments: '{"arg": "value"}',
                },
              },
            ],
          },
        },
      };

      const mockFetch = jest.mocked(global.fetch);

      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));
      mockFetch.mockImplementationOnce(async () =>
        createErrorResponse(500, 'Internal Server Error', {
          message: 'Tool output submission error',
        }),
      );

      const result = await provider.callApi('Test prompt');

      expect(result.error).toBeDefined();
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should handle non-function tool calls with required_action', async () => {
      const mockRun = {
        id: 'run_123',
        thread_id: 'thread_123',
        status: 'requires_action',
        required_action: {
          type: 'submit_tool_outputs',
          submit_tool_outputs: {
            tool_calls: [
              {
                id: 'call_123',
                type: 'not_a_function',
              },
            ],
          },
        },
      };

      const mockFetch = jest.mocked(global.fetch);

      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));
      mockFetch.mockImplementationOnce(async () =>
        createErrorResponse(404, 'Not Found', { message: 'Steps not found' }),
      );

      const result = await provider.callApi('Test prompt');

      expect(result.error).toBeDefined();
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });
});
