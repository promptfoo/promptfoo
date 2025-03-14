import { disableCache, enableCache } from '../../../src/cache';
import { OpenAiAssistantProvider } from '../../../src/providers/openai/assistant';

// Mock fetch
jest.spyOn(global, 'fetch').mockImplementation();

// Helper functions to create properly typed mock responses
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
    // Reset the fetch mock
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
      // Mock responses for fetch calls
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

      // Setup fetch mock responses
      const mockFetch = jest.mocked(global.fetch);

      // Mock thread run creation
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));

      // Mock run retrieval
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));

      // Mock steps list
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockSteps));

      // Mock message retrieval
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockMessage));

      const result = await provider.callApi('Test prompt');

      expect(result.output).toBe('[Assistant] Test response');
      expect(mockFetch).toHaveBeenCalledTimes(4);

      // Verify the endpoints that were called
      expect(mockFetch.mock.calls[0][0]).toContain('/beta/threads/runs');
      expect(mockFetch.mock.calls[1][0]).toContain(
        `/beta/threads/${mockRun.thread_id}/runs/${mockRun.id}`,
      );
      expect(mockFetch.mock.calls[2][0]).toContain(
        `/beta/threads/${mockRun.thread_id}/runs/${mockRun.id}/steps`,
      );
      expect(mockFetch.mock.calls[3][0]).toContain(`/beta/threads/${mockRun.thread_id}/messages/`);
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

      // Setup fetch mock responses
      const mockFetch = jest.mocked(global.fetch);

      // Mock thread run creation
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));

      // Mock run retrieval (requires action)
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));

      // Mock submit tool outputs
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockCompletedRun));

      // Mock run retrieval (completed)
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockCompletedRun));

      // Mock steps list
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockSteps));

      const result = await provider.callApi('Test prompt');

      expect(result.output).toBe(
        '[Call function test_function with arguments {"arg": "value"}]\n\n[Function output: Function result]',
      );
      expect(mockFetch).toHaveBeenCalledTimes(5);
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

      // Setup fetch mock responses
      const mockFetch = jest.mocked(global.fetch);

      // Mock thread run creation
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));

      // Mock run retrieval
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));

      const result = await provider.callApi('Test prompt');

      expect(result.error).toBe('Thread run failed: Test error message');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle API errors', async () => {
      // Setup fetch mock responses
      const mockFetch = jest.mocked(global.fetch);

      // Mock thread run creation with error
      mockFetch.mockImplementationOnce(async () =>
        createErrorResponse(500, 'Internal Server Error', {
          type: 'API Error',
          message: 'API Error',
        }),
      );

      const result = await provider.callApi('Test prompt');

      // The actual error format based on our implementation
      expect(result.error).toBe('API error: API Error: API Error');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle missing API key', async () => {
      const providerNoKey = new OpenAiAssistantProvider('test-assistant-id');
      process.env.OPENAI_API_KEY = '';

      await expect(providerNoKey.callApi('Test prompt')).rejects.toThrow(
        'OpenAI API key is not set',
      );

      process.env.OPENAI_API_KEY = 'test-key';
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

      // Setup fetch mock responses
      const mockFetch = jest.mocked(global.fetch);

      // Mock thread run creation
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));

      // Mock run retrieval
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));

      // Mock steps list
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

      // Setup fetch mock responses
      const mockFetch = jest.mocked(global.fetch);

      // Mock thread run creation
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));

      // Mock run retrieval
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));

      // Mock steps list
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

      // Setup fetch mock responses
      const mockFetch = jest.mocked(global.fetch);

      // Mock thread run creation
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));

      // Mock run retrieval
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));

      // Mock steps list
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

      // Setup fetch mock responses
      const mockFetch = jest.mocked(global.fetch);

      // Mock thread run creation
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));

      // Mock run retrieval
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));

      // Mock steps list
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

      // Setup fetch mock responses
      const mockFetch = jest.mocked(global.fetch);

      // Mock thread run creation
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));

      // Mock run retrieval
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));

      // Mock steps list with error
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

      // Setup fetch mock responses
      const mockFetch = jest.mocked(global.fetch);

      // Mock thread run creation
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));

      // Mock run retrieval
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));

      // Mock steps list
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockSteps));

      // Mock message retrieval with error
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

      // Setup fetch mock responses
      const mockFetch = jest.mocked(global.fetch);

      // Mock thread run creation
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));

      // Mock run retrieval
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

      // Setup fetch mock responses
      const mockFetch = jest.mocked(global.fetch);

      // Mock thread run creation
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));

      // Mock run retrieval
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));

      // Mock submit tool outputs with error
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

      // Setup fetch mock responses
      const mockFetch = jest.mocked(global.fetch);

      // Mock thread run creation
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));

      // Mock first run retrieval (requires action)
      mockFetch.mockImplementationOnce(async () => createSuccessResponse(mockRun));

      // Mock steps list
      mockFetch.mockImplementationOnce(async () =>
        createErrorResponse(404, 'Not Found', { message: 'Steps not found' }),
      );

      const result = await provider.callApi('Test prompt');

      // Should have an error due to steps retrieval failing
      expect(result.error).toBeDefined();
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });
});
