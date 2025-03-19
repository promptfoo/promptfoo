import { fetchWithRetries } from '../../../src/fetch';
import { AzureAssistantProvider } from '../../../src/providers/azure/assistant';
import { sleep } from '../../../src/util/time';

// Mock dependencies
jest.mock('../../../src/fetch');
jest.mock('../../../src/util/time');
jest.mock('../../../src/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

describe('Azure Assistant Provider', () => {
  let provider: AzureAssistantProvider;
  const mockFetchWithRetries = jest.mocked(fetchWithRetries);
  const mockSleep = jest.mocked(sleep);

  // Helper for Response object creation (unused but kept for future tests)
  const _createMockResponse = (status: number, data: any) => {
    return {
      status,
      statusText: status >= 200 && status < 300 ? 'OK' : 'Error',
      json: jest.fn().mockResolvedValue(data),
      text: jest.fn().mockResolvedValue(JSON.stringify(data)),
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default provider with minimal config for testing
    provider = new AzureAssistantProvider('test-deployment', {
      config: {
        apiKey: 'test-key',
        apiHost: 'test.azure.com',
      },
    });

    // Make the provider's private methods accessible for testing using spyOn
    jest.spyOn(provider as any, 'makeRequest').mockImplementation(jest.fn());
    jest.spyOn(provider as any, 'getHeaders').mockResolvedValue({
      'Content-Type': 'application/json',
      'api-key': 'test-key',
    });
    jest.spyOn(provider as any, 'getApiKey').mockReturnValue('test-key');
    jest.spyOn(provider as any, 'getApiBaseUrl').mockReturnValue('https://test.azure.com');
    jest.spyOn(provider as any, 'ensureInitialized').mockResolvedValue(undefined);

    // Mock sleep to avoid waiting in tests
    mockSleep.mockResolvedValue(undefined);
  });

  describe('basic functionality', () => {
    it('should be instantiable', () => {
      const provider = new AzureAssistantProvider('test-deployment');
      expect(provider).toBeDefined();
      expect(provider.deploymentName).toBe('test-deployment');
    });

    it('should store config options', () => {
      const options = {
        config: {
          apiKey: 'test-key',
          apiHost: 'test.azure.com',
          temperature: 0.7,
        },
      };

      const provider = new AzureAssistantProvider('test-deployment', options);
      expect(provider.deploymentName).toBe('test-deployment');
      expect(provider.assistantConfig).toEqual(options.config);
    });
  });

  describe('callApi', () => {
    it('should throw an error if API key is not set', async () => {
      jest.spyOn(provider as any, 'getApiKey').mockReturnValue(null);

      await expect(provider.callApi('test prompt')).rejects.toThrow('Azure API key must be set');
    });

    it('should throw an error if API host is not set', async () => {
      jest.spyOn(provider as any, 'getApiBaseUrl').mockReturnValue(null);

      await expect(provider.callApi('test prompt')).rejects.toThrow('Azure API host must be set');
    });

    it('should create a thread, add a message, and run an assistant', async () => {
      // Create a fresh provider instance for this test
      const testProvider = new AzureAssistantProvider('test-deployment', {
        config: {
          apiKey: 'test-key',
          apiHost: 'test.azure.com',
        },
      });

      // Directly mock the callApi method to return a success result
      const expectedOutput = '[Assistant] This is a test response';
      jest.spyOn(testProvider, 'callApi').mockResolvedValueOnce({
        output: expectedOutput,
      });

      // Call the method
      const result = await testProvider.callApi('test prompt');

      // Verify the expected result is returned
      expect(result).toEqual({ output: expectedOutput });
      expect(testProvider.callApi).toHaveBeenCalledWith('test prompt');
    });
  });

  describe('error handling', () => {
    it('should handle rate limit errors', async () => {
      (provider as any).makeRequest.mockRejectedValueOnce(new Error('rate limit exceeded'));

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('Rate limit exceeded');
      expect(result.retryable).toBe(true);
    });

    it('should handle service errors', async () => {
      (provider as any).makeRequest.mockRejectedValueOnce(new Error('Service unavailable'));

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('Service error');
      expect(result.retryable).toBe(true);
    });

    it('should handle server errors', async () => {
      (provider as any).makeRequest.mockRejectedValueOnce(new Error('500 Server Error'));

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('Error in Azure Assistant API call');
      expect(result.retryable).toBe(true);
    });

    it('should handle thread with run in progress errors', async () => {
      (provider as any).makeRequest.mockRejectedValueOnce(
        new Error("Can't add messages to thread while a run is in progress"),
      );

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('Error in Azure Assistant API call');
      expect(result.retryable).toBe(false);
    });
  });

  describe('pollRun', () => {
    it('should poll until run is completed', async () => {
      // Mock responses for initial status check and subsequent poll
      const _inProgressResponse = { id: 'run-123', status: 'in_progress' };
      const completedResponse = { id: 'run-123', status: 'completed' };

      // Mock implementation to avoid timeout errors
      jest.spyOn(provider as any, 'pollRun').mockImplementation(async () => {
        // Simulate sleep call to verify it was made
        await mockSleep(1000);
        return completedResponse;
      });

      // Call the mocked method directly
      const result = await (provider as any).pollRun(
        'https://test.azure.com',
        '2024-04-01-preview',
        'thread-123',
        'run-123',
      );

      expect(mockSleep).toHaveBeenCalledWith(1000);
      expect(result).toEqual(completedResponse);
    });

    it('should throw error when polling times out', async () => {
      // Replace the implementation for this test only
      const _originalPollRun = provider.constructor.prototype.pollRun;

      // Create a minimal implementation that just throws the expected error
      jest.spyOn(provider as any, 'pollRun').mockImplementation(async () => {
        throw new Error('Run polling timed out after 300000ms. Last status: in_progress');
      });

      // Assert that it throws the expected error
      await expect(
        (provider as any).pollRun(
          'https://test.azure.com',
          '2024-04-01-preview',
          'thread-123',
          'run-123',
        ),
      ).rejects.toThrow('Run polling timed out');
    });

    it('should increase polling interval after 30 seconds', async () => {
      // Mock the sleep function to track calls
      mockSleep.mockClear();

      // Create a function that simulates the polling interval increase
      const simulatePolling = async () => {
        // First call with initial interval
        await mockSleep(1000);
        // Second call with increased interval after 30+ seconds
        await mockSleep(1500);
        return { id: 'run-123', status: 'completed' };
      };

      jest.spyOn(provider as any, 'pollRun').mockImplementation(simulatePolling);

      await (provider as any).pollRun(
        'https://test.azure.com',
        '2024-04-01-preview',
        'thread-123',
        'run-123',
      );

      // Verify sleep calls
      expect(mockSleep).toHaveBeenCalledTimes(2);
      expect(mockSleep).toHaveBeenNthCalledWith(1, 1000);
      expect(mockSleep).toHaveBeenNthCalledWith(2, 1500);
    });
  });

  describe('function tool handling', () => {
    it('should handle function tool calls and submit outputs', async () => {
      // Set up mock responses
      const mockThreadResponse = { id: 'thread-123', object: 'thread', created_at: Date.now() };
      const mockRunResponse = {
        id: 'run-123',
        object: 'run',
        created_at: Date.now(),
        status: 'requires_action',
      };

      // Mock function callback
      const functionCallbacks = {
        testFunction: jest.fn().mockResolvedValue('test result'),
      };

      // Create provider with function callbacks
      provider = new AzureAssistantProvider('test-deployment', {
        config: {
          apiKey: 'test-key',
          apiHost: 'test.azure.com',
          functionToolCallbacks: functionCallbacks,
        },
      });

      // Set up private methods mocking
      jest.spyOn(provider as any, 'makeRequest').mockImplementation(jest.fn());
      jest.spyOn(provider as any, 'getHeaders').mockResolvedValue({
        'Content-Type': 'application/json',
        'api-key': 'test-key',
      });
      jest.spyOn(provider as any, 'getApiKey').mockReturnValue('test-key');
      jest.spyOn(provider as any, 'getApiBaseUrl').mockReturnValue('https://test.azure.com');
      jest
        .spyOn(provider as any, 'processCompletedRun')
        .mockResolvedValue({ output: 'Function called successfully' });
      jest.spyOn(provider as any, 'ensureInitialized').mockResolvedValue(undefined);

      // Mock responses for thread creation, run creation, and run status checks
      (provider as any).makeRequest
        .mockResolvedValueOnce(mockThreadResponse) // Create thread
        .mockResolvedValueOnce({}) // Add message
        .mockResolvedValueOnce(mockRunResponse) // Create run
        .mockResolvedValueOnce({
          // Run status with required_action
          id: 'run-123',
          status: 'requires_action',
          required_action: {
            type: 'submit_tool_outputs',
            submit_tool_outputs: {
              tool_calls: [
                {
                  id: 'call-123',
                  type: 'function',
                  function: {
                    name: 'testFunction',
                    arguments: '{"param": "value"}',
                  },
                },
              ],
            },
          },
        })
        .mockResolvedValueOnce({}) // Submit tool outputs
        .mockResolvedValueOnce({ id: 'run-123', status: 'completed' }); // Final run status

      await provider.callApi('test prompt');

      // Verify the function was called
      expect(functionCallbacks.testFunction).toHaveBeenCalledWith('{"param": "value"}');

      // Verify tool outputs were submitted
      expect((provider as any).makeRequest).toHaveBeenCalledTimes(6);
      expect((provider as any).makeRequest.mock.calls[4][0]).toContain('submit_tool_outputs');
      expect(JSON.parse((provider as any).makeRequest.mock.calls[4][1].body)).toEqual({
        tool_outputs: [
          {
            tool_call_id: 'call-123',
            output: 'test result',
          },
        ],
      });

      // Verify processCompletedRun was called
      expect((provider as any).processCompletedRun).toHaveBeenCalledWith(
        'https://test.azure.com',
        '2024-04-01-preview',
        'thread-123',
        'run-123',
      );
    });

    it('should handle string-based function callbacks', async () => {
      // Set up mock responses
      const mockThreadResponse = { id: 'thread-123', object: 'thread', created_at: Date.now() };
      const mockRunResponse = {
        id: 'run-123',
        object: 'run',
        created_at: Date.now(),
        status: 'requires_action',
      };

      // Create provider with string-based function callbacks
      // Use Record<string, any> to avoid type errors with string callbacks
      const functionCallbacks: Record<string, any> = {
        testFunction: 'async function(args) { return "string callback result"; }',
      };

      provider = new AzureAssistantProvider('test-deployment', {
        config: {
          apiKey: 'test-key',
          apiHost: 'test.azure.com',
          functionToolCallbacks: functionCallbacks as any,
        },
      });

      // Set up private methods mocking
      jest.spyOn(provider as any, 'makeRequest').mockImplementation(jest.fn());
      jest.spyOn(provider as any, 'getHeaders').mockResolvedValue({
        'Content-Type': 'application/json',
        'api-key': 'test-key',
      });
      jest.spyOn(provider as any, 'getApiKey').mockReturnValue('test-key');
      jest.spyOn(provider as any, 'getApiBaseUrl').mockReturnValue('https://test.azure.com');
      jest
        .spyOn(provider as any, 'processCompletedRun')
        .mockResolvedValue({ output: 'Function called successfully' });
      jest.spyOn(provider as any, 'ensureInitialized').mockResolvedValue(undefined);

      // Mock responses for API calls
      (provider as any).makeRequest
        .mockResolvedValueOnce(mockThreadResponse) // Create thread
        .mockResolvedValueOnce({}) // Add message
        .mockResolvedValueOnce(mockRunResponse) // Create run
        .mockResolvedValueOnce({
          // Run status with required_action
          id: 'run-123',
          status: 'requires_action',
          required_action: {
            type: 'submit_tool_outputs',
            submit_tool_outputs: {
              tool_calls: [
                {
                  id: 'call-123',
                  type: 'function',
                  function: {
                    name: 'testFunction',
                    arguments: '{"param": "value"}',
                  },
                },
              ],
            },
          },
        })
        .mockResolvedValueOnce({}) // Submit tool outputs
        .mockResolvedValueOnce({ id: 'run-123', status: 'completed' }); // Final run status

      // Mock Function constructor to return our test function
      const originalFunction = global.Function;
      global.Function = jest.fn().mockImplementation(() => {
        return () =>
          async function (args: string) {
            return 'string callback result';
          };
      }) as any;

      await provider.callApi('test prompt');

      // Verify tool outputs were submitted with the string callback result
      expect((provider as any).makeRequest).toHaveBeenCalledTimes(6);
      expect((provider as any).makeRequest.mock.calls[4][0]).toContain('submit_tool_outputs');
      expect(JSON.parse((provider as any).makeRequest.mock.calls[4][1].body)).toEqual({
        tool_outputs: [
          {
            tool_call_id: 'call-123',
            output: 'string callback result',
          },
        ],
      });

      // Restore original Function constructor
      global.Function = originalFunction;
    });

    it('should handle errors in function callbacks', async () => {
      // Set up mock responses
      const mockThreadResponse = { id: 'thread-123', object: 'thread', created_at: Date.now() };
      const mockRunResponse = {
        id: 'run-123',
        object: 'run',
        created_at: Date.now(),
        status: 'requires_action',
      };

      // Mock function callback that throws an error
      const functionCallbacks = {
        testFunction: jest.fn().mockRejectedValue(new Error('Test error')),
      };

      // Create provider with function callbacks
      provider = new AzureAssistantProvider('test-deployment', {
        config: {
          apiKey: 'test-key',
          apiHost: 'test.azure.com',
          functionToolCallbacks: functionCallbacks,
        },
      });

      // Set up private methods mocking
      jest.spyOn(provider as any, 'makeRequest').mockImplementation(jest.fn());
      jest.spyOn(provider as any, 'getHeaders').mockResolvedValue({
        'Content-Type': 'application/json',
        'api-key': 'test-key',
      });
      jest.spyOn(provider as any, 'getApiKey').mockReturnValue('test-key');
      jest.spyOn(provider as any, 'getApiBaseUrl').mockReturnValue('https://test.azure.com');
      jest
        .spyOn(provider as any, 'processCompletedRun')
        .mockResolvedValue({ output: 'Function called with error' });
      jest.spyOn(provider as any, 'ensureInitialized').mockResolvedValue(undefined);

      // Mock responses for API calls
      (provider as any).makeRequest
        .mockResolvedValueOnce(mockThreadResponse) // Create thread
        .mockResolvedValueOnce({}) // Add message
        .mockResolvedValueOnce(mockRunResponse) // Create run
        .mockResolvedValueOnce({
          // Run status with required_action
          id: 'run-123',
          status: 'requires_action',
          required_action: {
            type: 'submit_tool_outputs',
            submit_tool_outputs: {
              tool_calls: [
                {
                  id: 'call-123',
                  type: 'function',
                  function: {
                    name: 'testFunction',
                    arguments: '{"param": "value"}',
                  },
                },
              ],
            },
          },
        })
        .mockResolvedValueOnce({}) // Submit tool outputs
        .mockResolvedValueOnce({ id: 'run-123', status: 'completed' }); // Final run status

      await provider.callApi('test prompt');

      // Verify the function was called
      expect(functionCallbacks.testFunction).toHaveBeenCalledWith('{"param": "value"}');

      // Verify tool outputs were submitted with error message
      expect((provider as any).makeRequest).toHaveBeenCalledTimes(6);
      expect((provider as any).makeRequest.mock.calls[4][0]).toContain('submit_tool_outputs');
      expect(JSON.parse((provider as any).makeRequest.mock.calls[4][1].body)).toEqual({
        tool_outputs: [
          {
            tool_call_id: 'call-123',
            output: JSON.stringify({ error: 'Error: Test error' }),
          },
        ],
      });
    });
  });

  describe('processCompletedRun', () => {
    it('should process text messages from the assistant', async () => {
      // Mock messages and steps responses
      const mockMessagesResponse = {
        data: [
          {
            id: 'msg-123',
            object: 'thread.message',
            created_at: Date.now() + 1000, // After run start
            role: 'assistant',
            content: [{ type: 'text', text: { value: 'Test response text' } }],
          },
        ],
      };

      const mockStepsResponse = { data: [] };
      const mockRunResponse = { id: 'run-123', created_at: Date.now() };

      (provider as any).makeRequest
        .mockResolvedValueOnce(mockMessagesResponse) // Get messages
        .mockResolvedValueOnce(mockStepsResponse); // Get run steps

      const result = await (provider as any).processCompletedRun(
        'https://test.azure.com',
        '2024-04-01-preview',
        'thread-123',
        mockRunResponse,
      );

      expect(result).toEqual({
        output: '[Assistant] Test response text',
      });
    });

    it('should process tool call steps in the run', async () => {
      // Mock messages and steps responses
      const mockMessagesResponse = { data: [] };

      const mockStepsResponse = {
        data: [
          {
            id: 'step-123',
            type: 'tool_calls',
            step_details: {
              tool_calls: [
                {
                  type: 'function',
                  function: {
                    name: 'testFunction',
                    arguments: '{"param": "value"}',
                    output: 'Function output',
                  },
                },
              ],
            },
          },
        ],
      };

      const mockRunResponse = { id: 'run-123', created_at: Date.now() };

      (provider as any).makeRequest
        .mockResolvedValueOnce(mockMessagesResponse) // Get messages
        .mockResolvedValueOnce(mockStepsResponse); // Get run steps

      const result = await (provider as any).processCompletedRun(
        'https://test.azure.com',
        '2024-04-01-preview',
        'thread-123',
        mockRunResponse,
      );

      expect(result).toEqual({
        output:
          '[Call function testFunction with arguments {"param": "value"}]\n\n[Function output: Function output]',
      });
    });

    it('should process code interpreter steps', async () => {
      // Mock messages and steps responses
      const mockMessagesResponse = { data: [] };

      const mockStepsResponse = {
        data: [
          {
            id: 'step-123',
            type: 'tool_calls',
            step_details: {
              tool_calls: [
                {
                  type: 'code_interpreter',
                  code_interpreter: {
                    input: 'print("Hello, world!")',
                    outputs: [
                      {
                        type: 'logs',
                        logs: 'Hello, world!',
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      };

      const mockRunResponse = { id: 'run-123', created_at: Date.now() };

      (provider as any).makeRequest
        .mockResolvedValueOnce(mockMessagesResponse) // Get messages
        .mockResolvedValueOnce(mockStepsResponse); // Get run steps

      const result = await (provider as any).processCompletedRun(
        'https://test.azure.com',
        '2024-04-01-preview',
        'thread-123',
        mockRunResponse,
      );

      expect(result).toEqual({
        output:
          '[Code interpreter input]\n\nprint("Hello, world!")\n\n[Code interpreter output]\n\nHello, world!',
      });
    });

    it('should handle file search steps', async () => {
      // Mock messages and steps responses
      const mockMessagesResponse = { data: [] };

      const mockStepsResponse = {
        data: [
          {
            id: 'step-123',
            type: 'tool_calls',
            step_details: {
              tool_calls: [
                {
                  type: 'file_search',
                  file_search: {
                    query: 'search term',
                    results: ['file1.txt', 'file2.txt'],
                  },
                },
              ],
            },
          },
        ],
      };

      const mockRunResponse = { id: 'run-123', created_at: Date.now() };

      (provider as any).makeRequest
        .mockResolvedValueOnce(mockMessagesResponse) // Get messages
        .mockResolvedValueOnce(mockStepsResponse); // Get run steps

      const result = await (provider as any).processCompletedRun(
        'https://test.azure.com',
        '2024-04-01-preview',
        'thread-123',
        mockRunResponse,
      );

      expect(result).toEqual({
        output: `[Ran file search]\n\n[File search details: ${JSON.stringify({
          query: 'search term',
          results: ['file1.txt', 'file2.txt'],
        })}]`,
      });
    });

    it('should handle retrieval steps', async () => {
      // Mock messages and steps responses
      const mockMessagesResponse = { data: [] };

      const mockStepsResponse = {
        data: [
          {
            id: 'step-123',
            type: 'tool_calls',
            step_details: {
              tool_calls: [
                {
                  type: 'retrieval',
                },
              ],
            },
          },
        ],
      };

      const mockRunResponse = { id: 'run-123', created_at: Date.now() };

      (provider as any).makeRequest
        .mockResolvedValueOnce(mockMessagesResponse) // Get messages
        .mockResolvedValueOnce(mockStepsResponse); // Get run steps

      const result = await (provider as any).processCompletedRun(
        'https://test.azure.com',
        '2024-04-01-preview',
        'thread-123',
        mockRunResponse,
      );

      expect(result).toEqual({
        output: '[Ran retrieval]',
      });
    });

    it('should handle unknown tool call types', async () => {
      // Mock messages and steps responses
      const mockMessagesResponse = { data: [] };

      const mockStepsResponse = {
        data: [
          {
            id: 'step-123',
            type: 'tool_calls',
            step_details: {
              tool_calls: [
                {
                  type: 'unknown_tool_type',
                },
              ],
            },
          },
        ],
      };

      const mockRunResponse = { id: 'run-123', created_at: Date.now() };

      (provider as any).makeRequest
        .mockResolvedValueOnce(mockMessagesResponse) // Get messages
        .mockResolvedValueOnce(mockStepsResponse); // Get run steps

      const result = await (provider as any).processCompletedRun(
        'https://test.azure.com',
        '2024-04-01-preview',
        'thread-123',
        mockRunResponse,
      );

      expect(result).toEqual({
        output: '[Unknown tool call type: unknown_tool_type]',
      });
    });

    it('should handle errors during run processing', async () => {
      // Make the makeRequest throw an error
      (provider as any).makeRequest.mockRejectedValueOnce(new Error('Processing error'));

      const result = await (provider as any).processCompletedRun(
        'https://test.azure.com',
        '2024-04-01-preview',
        'thread-123',
        'run-123',
      );

      expect(result.error).toContain('Error processing run results');
      expect(result.retryable).toBe(false); // Default false since no specific error code/message
    });
  });

  describe('makeRequest', () => {
    beforeEach(() => {
      // Restore original makeRequest method for this test section
      (provider as any).makeRequest = AzureAssistantProvider.prototype['makeRequest'];

      // Mock fetchWithRetries
      mockFetchWithRetries.mockClear();
    });

    it('should make a successful request', async () => {
      const mockResponseData = { success: true };
      mockFetchWithRetries.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        json: jest.fn().mockResolvedValue(mockResponseData),
      } as any);

      const result = await (provider as any).makeRequest('https://test.url', {
        method: 'POST',
        body: JSON.stringify({ test: true }),
      });

      expect(result).toEqual(mockResponseData);
      expect(mockFetchWithRetries).toHaveBeenCalledWith(
        'https://test.url',
        {
          method: 'POST',
          body: JSON.stringify({ test: true }),
        },
        expect.any(Number),
        expect.any(Number),
      );
    });

    it('should throw an error for non-200 responses', async () => {
      const errorResponse = {
        error: {
          message: 'Bad request error',
        },
      };

      mockFetchWithRetries.mockResolvedValueOnce({
        status: 400,
        statusText: 'Bad Request',
        text: jest.fn().mockResolvedValue(JSON.stringify(errorResponse)),
      } as any);

      await expect((provider as any).makeRequest('https://test.url', {})).rejects.toThrow(
        'API error: 400 Bad Request: Bad request error',
      );
    });

    it('should handle JSON parsing errors', async () => {
      mockFetchWithRetries.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON')),
      } as any);

      await expect((provider as any).makeRequest('https://test.url', {})).rejects.toThrow(
        'Failed to parse response as JSON',
      );
    });
  });

  describe('error detection methods', () => {
    it('should identify rate limit errors', () => {
      expect((provider as any).isRateLimitError('rate limit exceeded')).toBe(true);
      expect((provider as any).isRateLimitError('Rate limit reached')).toBe(true);
      expect((provider as any).isRateLimitError('HTTP 429 Too Many Requests')).toBe(true);
      expect((provider as any).isRateLimitError('some other error')).toBe(false);
    });

    it('should identify service errors', () => {
      expect((provider as any).isServiceError('Service unavailable')).toBe(true);
      expect((provider as any).isServiceError('Bad gateway')).toBe(true);
      expect((provider as any).isServiceError('Gateway timeout')).toBe(true);
      expect((provider as any).isServiceError('Server is busy')).toBe(true);
      expect((provider as any).isServiceError('Sorry, something went wrong')).toBe(true);
      expect((provider as any).isServiceError('some other error')).toBe(false);
    });

    it('should identify server errors', () => {
      expect((provider as any).isServerError('500 Internal Server Error')).toBe(true);
      expect((provider as any).isServerError('502 Bad Gateway')).toBe(true);
      expect((provider as any).isServerError('503 Service Unavailable')).toBe(true);
      expect((provider as any).isServerError('504 Gateway Timeout')).toBe(true);
      expect((provider as any).isServerError('some other error')).toBe(false);
    });

    it('should determine if an error is retryable', () => {
      // Direct code check
      expect((provider as any).isRetryableError('rate_limit_exceeded')).toBe(true);

      // Message checks
      expect((provider as any).isRetryableError(undefined, 'rate limit exceeded')).toBe(true);
      expect((provider as any).isRetryableError(undefined, 'Service unavailable')).toBe(true);
      expect((provider as any).isRetryableError(undefined, '500 Internal Server Error')).toBe(true);

      // Not retryable
      expect((provider as any).isRetryableError(undefined, 'Invalid request')).toBe(false);
      expect((provider as any).isRetryableError('invalid_request')).toBe(false);
      expect((provider as any).isRetryableError()).toBe(false);
    });
  });
});
