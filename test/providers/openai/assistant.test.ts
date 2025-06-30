import OpenAI from 'openai';
import { disableCache, enableCache } from '../../../src/cache';
import { OpenAiAssistantProvider } from '../../../src/providers/openai/assistant';
import type { CallbackContext } from '../../../src/providers/openai/types';

jest.mock('openai');

describe('OpenAI Provider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    disableCache();
  });

  afterEach(() => {
    enableCache();
  });

  describe('OpenAiAssistantProvider', () => {
    let mockClient: any;

    beforeEach(() => {
      jest.clearAllMocks();
      mockClient = {
        beta: {
          threads: {
            createAndRun: jest.fn(),
            runs: {
              retrieve: jest.fn(),
              submitToolOutputs: jest.fn(),
              steps: {
                list: jest.fn(),
              },
            },
            messages: {
              retrieve: jest.fn(),
            },
          },
        },
      };
      jest.mocked(OpenAI).mockImplementation(function (this: any) {
        Object.assign(this, mockClient);
        return this;
      });
    });

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

      mockClient.beta.threads.createAndRun.mockResolvedValue(mockRun);
      mockClient.beta.threads.runs.retrieve.mockResolvedValue(mockRun);
      mockClient.beta.threads.runs.steps.list.mockResolvedValue(mockSteps);
      mockClient.beta.threads.messages.retrieve.mockResolvedValue(mockMessage);

      const result = await provider.callApi('Test prompt');

      expect(result.output).toBe('[Assistant] Test response');
      expect(mockClient.beta.threads.createAndRun).toHaveBeenCalledTimes(1);
      expect(mockClient.beta.threads.runs.retrieve).toHaveBeenCalledTimes(1);
      expect(mockClient.beta.threads.runs.steps.list).toHaveBeenCalledTimes(1);
      expect(mockClient.beta.threads.messages.retrieve).toHaveBeenCalledTimes(1);
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
        ...mockRun,
        status: 'completed',
        required_action: null,
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

      mockClient.beta.threads.createAndRun.mockResolvedValue(mockRun);
      mockClient.beta.threads.runs.retrieve
        .mockResolvedValueOnce(mockRun)
        .mockResolvedValueOnce(mockCompletedRun);
      mockClient.beta.threads.runs.submitToolOutputs.mockResolvedValue(mockCompletedRun);
      mockClient.beta.threads.runs.steps.list.mockResolvedValue(mockSteps);

      const result = await provider.callApi('Test prompt');

      expect(result.output).toBe(
        '[Call function test_function with arguments {"arg": "value"}]\n\n[Function output: Function result]',
      );
      expect(mockClient.beta.threads.createAndRun).toHaveBeenCalledTimes(1);
      expect(mockClient.beta.threads.runs.retrieve).toHaveBeenCalledTimes(2);
      expect(mockClient.beta.threads.runs.submitToolOutputs).toHaveBeenCalledTimes(1);
      expect(mockClient.beta.threads.runs.steps.list).toHaveBeenCalledTimes(1);
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

      mockClient.beta.threads.createAndRun.mockResolvedValue(mockRun);
      mockClient.beta.threads.runs.retrieve.mockResolvedValue(mockRun);

      const result = await provider.callApi('Test prompt');

      expect(result.error).toBe('Thread run failed: Test error message');
      expect(mockClient.beta.threads.createAndRun).toHaveBeenCalledTimes(1);
      expect(mockClient.beta.threads.runs.retrieve).toHaveBeenCalledTimes(1);
    });

    it('should handle API errors', async () => {
      const error = new OpenAI.APIError(500, {}, 'API Error', new Headers());
      Object.defineProperty(error, 'type', {
        value: 'API Error',
        writable: true,
        configurable: true,
      });
      Object.defineProperty(error, 'message', {
        value: 'API Error',
        writable: true,
        configurable: true,
      });

      mockClient.beta.threads.createAndRun.mockRejectedValueOnce(error);

      const provider = new OpenAiAssistantProvider('test-assistant-id', {
        config: {
          apiKey: 'test-key',
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.error).toBe('API error: API Error API Error');
      expect(mockClient.beta.threads.createAndRun).toHaveBeenCalledTimes(1);
    });

    it('should handle missing API key', async () => {
      const providerNoKey = new OpenAiAssistantProvider('test-assistant-id');
      process.env.OPENAI_API_KEY = '';

      await expect(providerNoKey.callApi('Test prompt')).rejects.toThrow(
        'OpenAI API key is not set',
      );

      process.env.OPENAI_API_KEY = 'test-key'; // Restore for other tests
    });
  });

  describe('Function Callbacks with Context', () => {
    let mockClient: any;

    beforeEach(() => {
      jest.clearAllMocks();
      disableCache();

      mockClient = {
        beta: {
          threads: {
            createAndRun: jest.fn(),
            runs: {
              retrieve: jest.fn(),
              submitToolOutputs: jest.fn(),
              steps: {
                list: jest.fn(),
              },
            },
            messages: {
              retrieve: jest.fn(),
            },
          },
        },
      };

      jest.mocked(OpenAI).mockImplementation(function (this: any) {
        Object.assign(this, mockClient);
        return this;
      });
    });

    it('should pass context to function callbacks', async () => {
      const mockCallback = jest.fn().mockResolvedValue('test result');

      const provider = new OpenAiAssistantProvider('asst_test', {
        config: {
          apiKey: 'test-key',
          functionToolCallbacks: {
            test_function: mockCallback,
          },
        },
      });

      const mockRun = {
        id: 'run_test',
        thread_id: 'thread_test',
        status: 'requires_action',
        required_action: {
          type: 'submit_tool_outputs',
          submit_tool_outputs: {
            tool_calls: [
              {
                id: 'call_test',
                type: 'function',
                function: {
                  name: 'test_function',
                  arguments: '{"param": "value"}',
                },
              },
            ],
          },
        },
      };

      const mockCompletedRun = {
        ...mockRun,
        status: 'completed',
      };

      const mockSteps = {
        data: [
          {
            id: 'step_test',
            step_details: {
              type: 'message_creation',
              message_creation: {
                message_id: 'msg_test',
              },
            },
          },
        ],
      };

      const mockMessage = {
        id: 'msg_test',
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

      mockClient.beta.threads.createAndRun.mockResolvedValue(mockRun);
      mockClient.beta.threads.runs.retrieve
        .mockResolvedValueOnce(mockRun)
        .mockResolvedValueOnce(mockCompletedRun);
      mockClient.beta.threads.runs.submitToolOutputs.mockResolvedValue(mockCompletedRun);
      mockClient.beta.threads.runs.steps.list.mockResolvedValue(mockSteps);
      mockClient.beta.threads.messages.retrieve.mockResolvedValue(mockMessage);

      await provider.callApi('test prompt');

      // Verify that the callback was called with the correct context
      expect(mockCallback).toHaveBeenCalledWith(
        { param: 'value' },
        {
          threadId: 'thread_test',
          runId: 'run_test',
          assistantId: 'asst_test',
          provider: 'openai',
        },
      );
    });

    it('should work with callbacks that do not use context', async () => {
      const oldStyleCallback = jest.fn().mockResolvedValue('old style result');

      const provider = new OpenAiAssistantProvider('asst_test', {
        config: {
          apiKey: 'test-key',
          functionToolCallbacks: {
            old_function: oldStyleCallback,
          },
        },
      });

      const mockRun = {
        id: 'run_test',
        thread_id: 'thread_test',
        status: 'requires_action',
        required_action: {
          type: 'submit_tool_outputs',
          submit_tool_outputs: {
            tool_calls: [
              {
                id: 'call_test',
                type: 'function',
                function: {
                  name: 'old_function',
                  arguments: '{"param": "value"}',
                },
              },
            ],
          },
        },
      };

      const mockCompletedRun = { ...mockRun, status: 'completed' };
      const mockSteps = { data: [] };

      mockClient.beta.threads.createAndRun.mockResolvedValue(mockRun);
      mockClient.beta.threads.runs.retrieve
        .mockResolvedValueOnce(mockRun)
        .mockResolvedValueOnce(mockCompletedRun);
      mockClient.beta.threads.runs.submitToolOutputs.mockResolvedValue(mockCompletedRun);
      mockClient.beta.threads.runs.steps.list.mockResolvedValue(mockSteps);

      await provider.callApi('test prompt');

      // Callback should be called with args and context, but context is optional
      expect(oldStyleCallback).toHaveBeenCalledWith(
        { param: 'value' },
        expect.objectContaining({
          threadId: 'thread_test',
          runId: 'run_test',
          assistantId: 'asst_test',
          provider: 'openai',
        }),
      );
    });

    it('should handle string-based function callbacks', async () => {
      const provider = new OpenAiAssistantProvider('asst_test', {
        config: {
          apiKey: 'test-key',
          functionToolCallbacks: {
            string_function:
              '(args, context) => { return `received: ${JSON.stringify(args)} with context: ${JSON.stringify(context)}`; }',
          },
        },
      });

      const mockRun = {
        id: 'run_test',
        thread_id: 'thread_test',
        status: 'requires_action',
        required_action: {
          type: 'submit_tool_outputs',
          submit_tool_outputs: {
            tool_calls: [
              {
                id: 'call_test',
                type: 'function',
                function: {
                  name: 'string_function',
                  arguments: '{"test": "data"}',
                },
              },
            ],
          },
        },
      };

      const mockCompletedRun = { ...mockRun, status: 'completed' };
      const mockSteps = { data: [] };

      mockClient.beta.threads.createAndRun.mockResolvedValue(mockRun);
      mockClient.beta.threads.runs.retrieve
        .mockResolvedValueOnce(mockRun)
        .mockResolvedValueOnce(mockCompletedRun);
      mockClient.beta.threads.runs.submitToolOutputs.mockResolvedValue(mockCompletedRun);
      mockClient.beta.threads.runs.steps.list.mockResolvedValue(mockSteps);

      await provider.callApi('test prompt');

      // Check that the tool output was submitted correctly
      expect(mockClient.beta.threads.runs.submitToolOutputs).toHaveBeenCalledWith('run_test', {
        thread_id: 'thread_test',
        tool_outputs: [
          {
            tool_call_id: 'call_test',
            output: expect.stringContaining('received: {"test":"data"}'),
          },
        ],
      });
    });

    it('should handle callbacks that access context properties', async () => {
      const contextAwareCallback = jest
        .fn()
        .mockImplementation((args: any, context?: CallbackContext) => {
          const result = {
            originalArgs: args,
            contextInfo: {
              threadId: context?.threadId,
              provider: context?.provider,
            },
          };
          return Promise.resolve(JSON.stringify(result));
        });

      const provider = new OpenAiAssistantProvider('asst_test', {
        config: {
          apiKey: 'test-key',
          functionToolCallbacks: {
            context_function: contextAwareCallback,
          },
        },
      });

      const mockRun = {
        id: 'run_test',
        thread_id: 'thread_test',
        status: 'requires_action',
        required_action: {
          type: 'submit_tool_outputs',
          submit_tool_outputs: {
            tool_calls: [
              {
                id: 'call_test',
                type: 'function',
                function: {
                  name: 'context_function',
                  arguments: '{"user_id": "123"}',
                },
              },
            ],
          },
        },
      };

      const mockCompletedRun = { ...mockRun, status: 'completed' };
      const mockSteps = { data: [] };

      mockClient.beta.threads.createAndRun.mockResolvedValue(mockRun);
      mockClient.beta.threads.runs.retrieve
        .mockResolvedValueOnce(mockRun)
        .mockResolvedValueOnce(mockCompletedRun);
      mockClient.beta.threads.runs.submitToolOutputs.mockResolvedValue(mockCompletedRun);
      mockClient.beta.threads.runs.steps.list.mockResolvedValue(mockSteps);

      await provider.callApi('test prompt');

      // Verify the callback was called with the correct parameters
      expect(contextAwareCallback).toHaveBeenCalledWith(
        { user_id: '123' },
        expect.objectContaining({
          threadId: 'thread_test',
          runId: 'run_test',
          assistantId: 'asst_test',
          provider: 'openai',
        }),
      );

      // Verify the tool output contains the context information
      expect(mockClient.beta.threads.runs.submitToolOutputs).toHaveBeenCalledWith('run_test', {
        thread_id: 'thread_test',
        tool_outputs: [
          {
            tool_call_id: 'call_test',
            output: JSON.stringify({
              originalArgs: { user_id: '123' },
              contextInfo: {
                threadId: 'thread_test',
                provider: 'openai',
              },
            }),
          },
        ],
      });
    });

    it('should handle function callback errors gracefully', async () => {
      const errorCallback = jest.fn().mockRejectedValue(new Error('Callback error'));

      const provider = new OpenAiAssistantProvider('asst_test', {
        config: {
          apiKey: 'test-key',
          functionToolCallbacks: {
            error_function: errorCallback,
          },
        },
      });

      const mockRun = {
        id: 'run_test',
        thread_id: 'thread_test',
        status: 'requires_action',
        required_action: {
          type: 'submit_tool_outputs',
          submit_tool_outputs: {
            tool_calls: [
              {
                id: 'call_test',
                type: 'function',
                function: {
                  name: 'error_function',
                  arguments: '{"param": "value"}',
                },
              },
            ],
          },
        },
      };

      const mockCompletedRun = { ...mockRun, status: 'completed' };
      const mockSteps = { data: [] };

      mockClient.beta.threads.createAndRun.mockResolvedValue(mockRun);
      mockClient.beta.threads.runs.retrieve
        .mockResolvedValueOnce(mockRun)
        .mockResolvedValueOnce(mockCompletedRun);
      mockClient.beta.threads.runs.submitToolOutputs.mockResolvedValue(mockCompletedRun);
      mockClient.beta.threads.runs.steps.list.mockResolvedValue(mockSteps);

      await provider.callApi('test prompt');

      // Verify error was handled and submitted as tool output
      expect(mockClient.beta.threads.runs.submitToolOutputs).toHaveBeenCalledWith('run_test', {
        thread_id: 'thread_test',
        tool_outputs: [
          {
            tool_call_id: 'call_test',
            output: JSON.stringify({
              error: 'Error in error_function: Callback error',
            }),
          },
        ],
      });
    });
  });
});
