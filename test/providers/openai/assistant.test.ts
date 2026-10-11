import OpenAI from 'openai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { disableCache, enableCache } from '../../../src/cache';
import { OpenAiAssistantProvider } from '../../../src/providers/openai/assistant';
import { createApiKeyOptions } from '../../factories/literalFixtures';
import { mockProcessEnv } from '../../util/utils';
import { getOpenAiMissingApiKeyMessage } from './shared';
import { installTracerSpy } from './tracing';

import type { CallbackContext } from '../../../src/providers/openai/types';

const createMessageCreationSteps = () => ({
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
});

const createAssistantTextMessage = () => ({
  role: 'assistant',
  content: [
    {
      type: 'text',
      text: {
        value: 'Test response',
      },
    },
  ],
});

const createCompletedAssistantRun = () => ({
  id: 'run_123',
  thread_id: 'thread_123',
  status: 'completed',
});

const createApiErrorMessageDescriptor = () => ({
  value: 'API Error',
  writable: true,
  configurable: true,
});

vi.mock('openai');

describe('OpenAI Provider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    disableCache();
  });

  afterEach(() => {
    enableCache();
  });

  describe('OpenAiAssistantProvider', () => {
    let mockClient: any;

    beforeEach(() => {
      vi.clearAllMocks();
      mockClient = {
        beta: {
          threads: {
            createAndRun: vi.fn(),
            runs: {
              retrieve: vi.fn(),
              submitToolOutputs: vi.fn(),
              steps: {
                list: vi.fn(),
              },
            },
            messages: {
              retrieve: vi.fn(),
            },
          },
        },
      };
      vi.mocked(OpenAI).mockImplementation(function (this: any) {
        Object.assign(this, mockClient);
        return this;
      });
    });

    const provider = new OpenAiAssistantProvider('test-assistant-id', {
      config: {
        apiKey: 'test-key',
        organization: 'test-org',
        functionToolCallbacks: {
          test_function: async (_args: string) => 'Function result',
        },
      },
    });

    it.each(['gpt-transcribe', 'gpt-live-transcribe', 'gpt-5.3-codex-spark'])(
      'should reject unsupported first-party model override %s in the direct constructor',
      (modelName) => {
        expect(
          () =>
            new OpenAiAssistantProvider('test-assistant-id', {
              config: { apiKey: 'test-key', modelName },
            }),
        ).toThrow();
      },
    );

    it('should handle successful assistant completion', async () => {
      const mockRun = createCompletedAssistantRun();

      const mockSteps = createMessageCreationSteps();

      const mockMessage = createAssistantTextMessage();

      mockClient.beta.threads.createAndRun.mockResolvedValue(mockRun);
      mockClient.beta.threads.runs.retrieve.mockResolvedValue(mockRun);
      mockClient.beta.threads.runs.steps.list.mockResolvedValue(mockSteps);
      mockClient.beta.threads.messages.retrieve.mockResolvedValue(mockMessage);

      const result = await provider.callApi('Test prompt');

      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultHeaders: expect.objectContaining({
            'X-OpenAI-Originator': 'promptfoo',
          }),
        }),
      );
      expect(result.output).toBe('[Assistant] Test response');
      expect(mockClient.beta.threads.createAndRun).toHaveBeenCalledTimes(1);
      expect(mockClient.beta.threads.runs.retrieve).toHaveBeenCalledTimes(1);
      expect(mockClient.beta.threads.runs.steps.list).toHaveBeenCalledTimes(1);
      expect(mockClient.beta.threads.messages.retrieve).toHaveBeenCalledTimes(1);
    });

    describe('caller cancellation', () => {
      const run = { id: 'run_cancel', thread_id: 'thread_cancel', status: 'completed' };

      beforeEach(() => {
        mockClient.beta.threads.createAndRun.mockResolvedValue(run);
        mockClient.beta.threads.runs.retrieve.mockResolvedValue(run);
        mockClient.beta.threads.runs.steps.list.mockResolvedValue({
          data: [
            {
              id: 'step_cancel',
              step_details: {
                type: 'message_creation',
                message_creation: { message_id: 'msg_cancel' },
              },
            },
          ],
        });
        mockClient.beta.threads.messages.retrieve.mockResolvedValue({
          role: 'assistant',
          content: [{ type: 'text', text: { value: 'done' } }],
        });
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('does not start an already cancelled invocation', async () => {
        const controller = new AbortController();
        controller.abort(new Error('caller stopped'));
        await expect(
          provider.callApi('prompt', undefined, { abortSignal: controller.signal }),
        ).rejects.toMatchObject({ name: 'AbortError', message: 'caller stopped' });
        expect(mockClient.beta.threads.createAndRun).not.toHaveBeenCalled();
      });

      it('passes the caller signal to every SDK request', async () => {
        const controller = new AbortController();
        await expect(
          provider.callApi('prompt', undefined, { abortSignal: controller.signal }),
        ).resolves.toMatchObject({ output: '[Assistant] done' });
        for (const mock of [
          mockClient.beta.threads.createAndRun,
          mockClient.beta.threads.runs.retrieve,
          mockClient.beta.threads.runs.steps.list,
          mockClient.beta.threads.messages.retrieve,
        ]) {
          expect(mock.mock.calls[0].at(-1)).toEqual({ signal: controller.signal });
        }
      });

      it('cancels the polling delay without retrieving another run', async () => {
        vi.useFakeTimers();
        const controller = new AbortController();
        mockClient.beta.threads.runs.retrieve.mockResolvedValueOnce({
          ...run,
          status: 'in_progress',
        });
        const result = provider.callApi('prompt', undefined, { abortSignal: controller.signal });
        // Observe rejection immediately so cancellation cannot become unhandled.
        const settled = result.then(
          (value) => value,
          (error) => error,
        );
        await vi.advanceTimersByTimeAsync(0);
        expect(mockClient.beta.threads.runs.retrieve).toHaveBeenCalledTimes(1);
        controller.abort(new Error('stop polling'));
        await vi.runAllTimersAsync();
        expect(await settled).toMatchObject({ name: 'AbortError', message: 'stop polling' });
        expect(mockClient.beta.threads.runs.retrieve).toHaveBeenCalledTimes(1);
        expect(mockClient.beta.threads.runs.steps.list).not.toHaveBeenCalled();
      });

      it.each(['create', 'retrieve', 'steps', 'message'])(
        'propagates cancellation during the %s request',
        async (stage) => {
          const controller = new AbortController();
          const request = {
            create: mockClient.beta.threads.createAndRun,
            retrieve: mockClient.beta.threads.runs.retrieve,
            steps: mockClient.beta.threads.runs.steps.list,
            message: mockClient.beta.threads.messages.retrieve,
          }[stage];
          request.mockImplementationOnce(async () => {
            controller.abort(new Error('transport cancelled'));
            throw Object.assign(new Error('SDK request aborted'), { name: 'AbortError' });
          });
          await expect(
            provider.callApi('prompt', undefined, { abortSignal: controller.signal }),
          ).rejects.toMatchObject({ name: 'AbortError', message: 'transport cancelled' });
        },
      );
    });

    it('drops the SDK organization option when a case-variant org header overrides it', async () => {
      const mockRun = { id: 'run_123', thread_id: 'thread_123', status: 'completed' };
      const mockSteps = createMessageCreationSteps();
      const mockMessage = createAssistantTextMessage();
      mockClient.beta.threads.createAndRun.mockResolvedValue(mockRun);
      mockClient.beta.threads.runs.retrieve.mockResolvedValue(mockRun);
      mockClient.beta.threads.runs.steps.list.mockResolvedValue(mockSteps);
      mockClient.beta.threads.messages.retrieve.mockResolvedValue(mockMessage);

      const overrideProvider = new OpenAiAssistantProvider('test-assistant-id', {
        config: {
          apiKey: 'test-key',
          organization: 'test-org',
          headers: { 'openai-organization': 'custom-org' },
        },
      });

      await overrideProvider.callApi('Test prompt');

      // The SDK would otherwise inject its own canonical OpenAI-Organization header
      // from `organization`, duplicating (and beating) the custom override.
      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          organization: undefined,
          defaultHeaders: expect.objectContaining({ 'openai-organization': 'custom-org' }),
        }),
      );
      const sdkArgs = vi.mocked(OpenAI).mock.calls.at(-1)?.[0] as { defaultHeaders: object };
      expect(sdkArgs.defaultHeaders).not.toHaveProperty('OpenAI-Organization');
    });

    it('passes custom gateway query credentials through the SDK default query', async () => {
      const mockRun = { id: 'run_123', thread_id: 'thread_123', status: 'completed' };
      const mockSteps = createMessageCreationSteps();
      mockClient.beta.threads.createAndRun.mockResolvedValue(mockRun);
      mockClient.beta.threads.runs.retrieve.mockResolvedValue(mockRun);
      mockClient.beta.threads.runs.steps.list.mockResolvedValue(mockSteps);
      mockClient.beta.threads.messages.retrieve.mockResolvedValue(createAssistantTextMessage());
      const gatewayProvider = new OpenAiAssistantProvider('test-assistant-id', {
        config: {
          apiKey: 'test-key',
          apiBaseUrl: 'https://gateway.example/v1?api_key=tenant-secret&region=west',
        },
      });

      await gatewayProvider.callApi('Test prompt');

      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://gateway.example/v1',
          defaultQuery: { api_key: 'tenant-secret', region: 'west' },
        }),
      );
    });

    it('emits an agent invocation span around the assistant run', async () => {
      const spans = installTracerSpy();
      const mockRun = { id: 'run_123', thread_id: 'thread_123', status: 'completed' };
      const mockSteps = createMessageCreationSteps();
      const mockMessage = createAssistantTextMessage();
      mockClient.beta.threads.createAndRun.mockResolvedValue(mockRun);
      mockClient.beta.threads.runs.retrieve.mockResolvedValue(mockRun);
      mockClient.beta.threads.runs.steps.list.mockResolvedValue(mockSteps);
      mockClient.beta.threads.messages.retrieve.mockResolvedValue(mockMessage);

      const localProvider = new OpenAiAssistantProvider('test-assistant-id', createApiKeyOptions());
      await localProvider.callApi('Test prompt');

      const agentSpan = spans.find((span) => span.name === 'invoke_agent');
      expect(agentSpan).toBeDefined();
      expect(agentSpan?.attributes).toMatchObject({
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'invoke_agent',
        'gen_ai.agent.id': 'test-assistant-id',
      });
      expect(agentSpan?.attributes).not.toHaveProperty('gen_ai.agent.name');
      expect(agentSpan?.attributes).not.toHaveProperty('gen_ai.request.model');
      expect(agentSpan?.ended).toBe(true);
      // SpanStatusCode.OK === 1
      expect(agentSpan?.status?.code).toBe(1);
    });

    it('marks the agent invocation span ERROR when the assistant run fails', async () => {
      const spans = installTracerSpy();
      mockClient.beta.threads.createAndRun.mockRejectedValue(new Error('assistant boom'));

      const localProvider = new OpenAiAssistantProvider('test-assistant-id', createApiKeyOptions());
      const result = await localProvider.callApi('Test prompt');
      expect(result.error).toBeDefined();

      const agentSpan = spans.find((span) => span.name === 'invoke_agent');
      expect(agentSpan).toBeDefined();
      // SpanStatusCode.ERROR === 2
      expect(agentSpan?.status?.code).toBe(2);
      expect(agentSpan?.ended).toBe(true);
    });

    it('should preserve an explicit temperature of 0', async () => {
      const mockRun = createCompletedAssistantRun();

      const mockSteps = createMessageCreationSteps();

      const mockMessage = createAssistantTextMessage();

      mockClient.beta.threads.createAndRun.mockResolvedValue(mockRun);
      mockClient.beta.threads.runs.retrieve.mockResolvedValue(mockRun);
      mockClient.beta.threads.runs.steps.list.mockResolvedValue(mockSteps);
      mockClient.beta.threads.messages.retrieve.mockResolvedValue(mockMessage);

      const provider = new OpenAiAssistantProvider('test-assistant-id', {
        config: {
          apiKey: 'test-key',
          temperature: 0,
        },
      });

      await provider.callApi('Test prompt');

      expect(mockClient.beta.threads.createAndRun).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0,
        }),
        { signal: undefined },
      );
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
      Object.defineProperty(error, 'type', createApiErrorMessageDescriptor());
      Object.defineProperty(error, 'message', createApiErrorMessageDescriptor());

      mockClient.beta.threads.createAndRun.mockRejectedValueOnce(error);

      const provider = new OpenAiAssistantProvider('test-assistant-id', createApiKeyOptions());

      const result = await provider.callApi('Test prompt');

      expect(result.error).toBe('API error: API Error API Error');
      expect(mockClient.beta.threads.createAndRun).toHaveBeenCalledTimes(1);
    });

    it('should handle missing API key', async () => {
      const restoreEnv = mockProcessEnv({ OPENAI_API_KEY: undefined });

      try {
        const providerNoKey = new OpenAiAssistantProvider('test-assistant-id', {
          env: {
            OPENAI_API_KEY: undefined,
          },
        });

        await expect(providerNoKey.callApi('Test prompt')).rejects.toThrow(
          getOpenAiMissingApiKeyMessage(),
        );
      } finally {
        restoreEnv();
      }
    });

    it('should use custom apiKeyEnvar in missing API key errors', async () => {
      const restoreEnv = mockProcessEnv({
        OPENAI_API_KEY: undefined,
        CUSTOM_ASSISTANT_API_KEY: undefined,
      });

      try {
        const providerNoKey = new OpenAiAssistantProvider('test-assistant-id', {
          config: {
            apiKeyEnvar: 'CUSTOM_ASSISTANT_API_KEY',
          },
          env: {
            OPENAI_API_KEY: undefined,
            CUSTOM_ASSISTANT_API_KEY: undefined,
          },
        });

        await expect(providerNoKey.callApi('Test prompt')).rejects.toThrow(
          getOpenAiMissingApiKeyMessage('CUSTOM_ASSISTANT_API_KEY'),
        );
      } finally {
        restoreEnv();
      }
    });
  });

  describe('Function Callbacks with Context', () => {
    let mockClient: any;

    beforeEach(() => {
      vi.clearAllMocks();
      disableCache();

      mockClient = {
        beta: {
          threads: {
            createAndRun: vi.fn(),
            runs: {
              retrieve: vi.fn(),
              submitToolOutputs: vi.fn(),
              steps: {
                list: vi.fn(),
              },
            },
            messages: {
              retrieve: vi.fn(),
            },
          },
        },
      };

      vi.mocked(OpenAI).mockImplementation(function (this: any) {
        Object.assign(this, mockClient);
        return this;
      });
    });

    function setUpFunctionCall(functionName: string) {
      const run = {
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
                function: { name: functionName, arguments: '{}' },
              },
            ],
          },
        },
      };
      mockClient.beta.threads.createAndRun.mockResolvedValue(run);
      mockClient.beta.threads.runs.retrieve
        .mockResolvedValueOnce(run)
        .mockResolvedValue({ ...run, status: 'completed' });
      mockClient.beta.threads.runs.submitToolOutputs.mockResolvedValue({
        ...run,
        status: 'completed',
      });
      mockClient.beta.threads.runs.steps.list.mockResolvedValue({ data: [] });
    }

    it.each(['toString', 'constructor', 'valueOf', 'inherited_tool'])(
      'does not dispatch inherited callback %s',
      async (functionName) => {
        const inheritedCallback = vi.fn().mockResolvedValue('inherited result');
        const callbacks = Object.create({ inherited_tool: inheritedCallback });
        const provider = new OpenAiAssistantProvider('asst_test', {
          config: { apiKey: 'test-key', functionToolCallbacks: callbacks },
        });
        setUpFunctionCall(functionName);
        await provider.callApi('prompt');
        expect(inheritedCallback).not.toHaveBeenCalled();
        expect(mockClient.beta.threads.runs.submitToolOutputs).not.toHaveBeenCalled();
      },
    );

    it.each(['toString', 'constructor', '__proto__'])(
      'dispatches an explicitly configured own callback %s',
      async (functionName) => {
        const callback = vi.fn().mockResolvedValue('own result');
        const provider = new OpenAiAssistantProvider('asst_test', {
          config: { apiKey: 'test-key', functionToolCallbacks: { [functionName]: callback } },
        });
        setUpFunctionCall(functionName);
        await provider.callApi('prompt');
        expect(callback).toHaveBeenCalledTimes(1);
        expect(
          mockClient.beta.threads.runs.submitToolOutputs.mock.calls[0][1].tool_outputs,
        ).toEqual([{ tool_call_id: 'call_test', output: 'own result' }]);
      },
    );

    it('forwards cancellation to callbacks and stops waiting without submitting late output', async () => {
      const controller = new AbortController();
      let finishCallback!: (value: string) => void;
      const pendingCallback = new Promise<string>((resolve) => {
        finishCallback = resolve;
      });
      const callback = vi.fn().mockReturnValue(pendingCallback);
      const provider = new OpenAiAssistantProvider('asst_test', {
        config: { apiKey: 'test-key', functionToolCallbacks: { test_function: callback } },
      });
      setUpFunctionCall('test_function');
      const result = provider.callApi('prompt', undefined, { abortSignal: controller.signal });
      const settled = result.then(
        (value) => value,
        (error) => error,
      );
      await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
      controller.abort(new Error('stop callback'));
      // Cancellation should settle even if the user callback ignores its signal.
      let outcome: unknown;
      void settled.then((value) => {
        outcome = value;
      });
      try {
        await vi.waitFor(() =>
          expect(outcome).toMatchObject({ name: 'AbortError', message: 'stop callback' }),
        );
        expect(callback).toHaveBeenCalledWith(
          {},
          expect.objectContaining({ abortSignal: controller.signal }),
        );
      } finally {
        finishCallback('late output');
        await settled;
      }
      expect(mockClient.beta.threads.runs.submitToolOutputs).not.toHaveBeenCalled();
      expect(mockClient.beta.threads.runs.steps.list).not.toHaveBeenCalled();
    });

    it('does not execute a callback whose import completes after cancellation', async () => {
      const controller = new AbortController();
      const provider = new OpenAiAssistantProvider('asst_test', { config: { apiKey: 'test-key' } });
      provider.assistantConfig.functionToolCallbacks = { test_function: 'file://callback.js' };
      let finishImport!: (callback: Function) => void;
      const pendingImport = new Promise<Function>((resolve) => {
        finishImport = resolve;
      });
      const load = vi.spyOn(provider as any, 'loadExternalFunction').mockReturnValue(pendingImport);
      const callback = vi.fn().mockResolvedValue('late result');
      setUpFunctionCall('test_function');
      const result = provider.callApi('prompt', undefined, { abortSignal: controller.signal });
      const settled = result.then(
        (value) => value,
        (error) => error,
      );
      await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
      controller.abort(new Error('stop import'));
      try {
        expect(await settled).toMatchObject({ name: 'AbortError', message: 'stop import' });
      } finally {
        finishImport(callback);
        load.mockRestore();
      }
      await Promise.resolve();
      expect(callback).not.toHaveBeenCalled();
      expect(mockClient.beta.threads.runs.submitToolOutputs).not.toHaveBeenCalled();
    });

    it('passes the signal to tool output submission', async () => {
      const controller = new AbortController();
      const provider = new OpenAiAssistantProvider('asst_test', {
        config: {
          apiKey: 'test-key',
          functionToolCallbacks: { test_function: async () => 'result' },
        },
      });
      setUpFunctionCall('test_function');
      await provider.callApi('prompt', undefined, { abortSignal: controller.signal });
      expect(mockClient.beta.threads.runs.submitToolOutputs.mock.calls[0][2]).toEqual({
        signal: controller.signal,
      });
    });

    it('propagates cancellation during tool output submission', async () => {
      const controller = new AbortController();
      const provider = new OpenAiAssistantProvider('asst_test', {
        config: {
          apiKey: 'test-key',
          functionToolCallbacks: { test_function: async () => 'result' },
        },
      });
      setUpFunctionCall('test_function');
      mockClient.beta.threads.runs.submitToolOutputs.mockImplementationOnce(async () => {
        controller.abort(new Error('stop submitting'));
        throw Object.assign(new Error('SDK request aborted'), { name: 'AbortError' });
      });
      await expect(
        provider.callApi('prompt', undefined, { abortSignal: controller.signal }),
      ).rejects.toMatchObject({ name: 'AbortError', message: 'stop submitting' });
      expect(mockClient.beta.threads.runs.retrieve).toHaveBeenCalledTimes(1);
      expect(mockClient.beta.threads.runs.steps.list).not.toHaveBeenCalled();
    });

    it('should pass context to function callbacks', async () => {
      const mockCallback = vi.fn().mockResolvedValue('test result');

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
      const oldStyleCallback = vi.fn().mockResolvedValue('old style result');

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
      expect(mockClient.beta.threads.runs.submitToolOutputs).toHaveBeenCalledWith(
        'run_test',
        {
          thread_id: 'thread_test',
          tool_outputs: [
            {
              tool_call_id: 'call_test',
              output: expect.stringContaining('received: {"test":"data"}'),
            },
          ],
        },
        { signal: undefined },
      );
    });

    it('should handle callbacks that access context properties', async () => {
      const contextAwareCallback = vi.fn().mockImplementation(function (
        args: any,
        context?: CallbackContext,
      ) {
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
      expect(mockClient.beta.threads.runs.submitToolOutputs).toHaveBeenCalledWith(
        'run_test',
        {
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
        },
        { signal: undefined },
      );
    });

    it('should handle function callback errors gracefully', async () => {
      const errorCallback = vi.fn().mockRejectedValue(new Error('Callback error'));

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
      expect(mockClient.beta.threads.runs.submitToolOutputs).toHaveBeenCalledWith(
        'run_test',
        {
          thread_id: 'thread_test',
          tool_outputs: [
            {
              tool_call_id: 'call_test',
              output: JSON.stringify({
                error: 'Error in error_function: Callback error',
              }),
            },
          ],
        },
        { signal: undefined },
      );
    });
  });
});
