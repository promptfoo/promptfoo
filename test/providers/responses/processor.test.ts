import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResponsesProcessor } from '../../../src/providers/responses/processor';

// Mock dependencies
vi.mock('../../../src/providers/functionCallbackUtils');

const mockFunctionCallbackHandler = {
  processCalls: vi.fn(),
} as any;

const mockCostCalculator = vi.fn().mockReturnValue(0.001);

describe('ResponsesProcessor', () => {
  let processor: ResponsesProcessor;

  beforeEach(() => {
    vi.resetAllMocks();
    mockCostCalculator.mockReturnValue(0.001);

    processor = new ResponsesProcessor({
      modelName: 'gpt-4.1',
      providerType: 'openai',
      functionCallbackHandler: mockFunctionCallbackHandler,
      costCalculator: mockCostCalculator,
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('processResponseOutput', () => {
    it.each([
      { reason: 'max_output_tokens', finishReason: 'length' },
      { reason: 'content_filter', finishReason: 'content_filter' },
      { reason: 'max_messages', finishReason: 'max_messages' },
      { reason: undefined, finishReason: undefined },
    ])(
      'should expose incomplete reason $reason without changing partial text',
      async ({ reason, finishReason }) => {
        const mockData = {
          status: 'incomplete',
          incomplete_details: { reason },
          output: [
            {
              type: 'message',
              role: 'assistant',
              status: 'incomplete',
              content: [{ type: 'output_text', text: 'Partial text' }],
            },
          ],
        };

        const result = await processor.processResponseOutput(mockData, {}, false);

        expect(result.output).toBe('Partial text');
        expect(result.error).toBeUndefined();
        expect(result.isRefusal).toBeUndefined();
        expect(result.finishReason).toBe(finishReason);
        expect(result.metadata?.responseStatus).toBe('incomplete');
        expect(result.metadata?.incompleteReason).toBe(reason);
        expect(result.raw).toBe(mockData);
      },
    );

    it('should expose token exhaustion when reasoning produced no visible text', async () => {
      const mockData = {
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        output: [{ type: 'reasoning', id: 'rs_incomplete', summary: [] }],
        usage: {
          input_tokens: 10,
          output_tokens: 20,
          total_tokens: 30,
          output_tokens_details: { reasoning_tokens: 20 },
        },
      };

      const result = await processor.processResponseOutput(mockData, {}, false);

      expect(result.output).toBe('');
      expect(result.error).toBeUndefined();
      expect(result.finishReason).toBe('length');
      expect(result.tokenUsage).toMatchObject({
        prompt: 10,
        completion: 20,
        total: 30,
        completionDetails: { reasoning: 20 },
      });
      expect(result.raw).toBe(mockData);
    });

    it.each([false, true])(
      'should retain incomplete diagnostics for empty output (cached: %s)',
      async (cached) => {
        const mockData = {
          id: 'resp_empty',
          status: 'incomplete',
          incomplete_details: { reason: 'max_output_tokens' },
          output: [],
          usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
        };

        const result = await processor.processResponseOutput(mockData, {}, cached);

        expect(result.error).toContain('Invalid response format: Missing output array');
        expect(result.output).toBeUndefined();
        expect(result.finishReason).toBe('length');
        expect(result.metadata).toEqual({
          responseId: 'resp_empty',
          responseStatus: 'incomplete',
          incompleteReason: 'max_output_tokens',
        });
        expect(result.tokenUsage).toEqual(
          cached
            ? { cached: 30, total: 30, numRequests: 1 }
            : { prompt: 10, completion: 20, total: 30, numRequests: 1 },
        );
        expect(result.cached).toBe(cached);
        expect(result.raw).toBe(mockData);
      },
    );

    it('should preserve parsing errors for malformed completed responses', async () => {
      const mockData = {
        status: 'completed',
        incomplete_details: null,
        output: [],
        usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
      };

      const result = await processor.processResponseOutput(mockData, {}, false);

      expect(result).toEqual({
        error: `Error parsing response: Error: Invalid response format: Missing output array\nResponse: ${JSON.stringify(mockData)}`,
      });
    });

    it('should process simple text output', async () => {
      const mockData = {
        id: 'resp_test123',
        model: 'gpt-5-2025-08-07',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Hello, world!' }],
          },
        ],
        usage: { input_tokens: 5, output_tokens: 3 },
      };

      const result = await processor.processResponseOutput(mockData, {}, false);

      expect(result.output).toBe('Hello, world!');
      expect(result.cached).toBe(false);
      expect(result.error).toBeUndefined();
      expect(result.metadata).toEqual({
        responseId: 'resp_test123',
        model: 'gpt-5-2025-08-07',
      });
    });

    it('should include Azure-style output token details in token usage', async () => {
      const mockData = {
        id: 'resp_usage_details',
        model: 'gpt-5-2025-08-07',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Hello with usage details' }],
          },
        ],
        usage: {
          input_tokens: 11,
          output_tokens: 7,
          total_tokens: 21,
          cache_write_input_tokens: 2,
          input_tokens_details: {
            cached_tokens: 3,
          },
          output_tokens_details: {
            reasoning_tokens: 4,
            accepted_prediction_tokens: 2,
            rejected_prediction_tokens: 1,
          },
        },
      };

      const result = await processor.processResponseOutput(mockData, {}, false);

      expect(result.tokenUsage).toEqual({
        total: 21,
        prompt: 11,
        completion: 7,
        numRequests: 1,
        completionDetails: {
          reasoning: 4,
          acceptedPrediction: 2,
          rejectedPrediction: 1,
          cacheReadInputTokens: 3,
          cacheCreationInputTokens: 2,
        },
      });
    });

    it.each(['completed', undefined])(
      'should process function calls with status %s',
      async (status) => {
        mockFunctionCallbackHandler.processCalls.mockResolvedValue(
          'Function executed successfully',
        );

        const mockData = {
          output: [
            {
              type: 'function_call',
              name: 'test_function',
              arguments: '{"param": "value"}',
              ...(status === undefined ? {} : { status }),
            },
          ],
          usage: { input_tokens: 10, output_tokens: 8 },
        };

        const result = await processor.processResponseOutput(mockData, {}, false);

        expect(result.output).toBe('Function executed successfully');
        expect(mockFunctionCallbackHandler.processCalls).toHaveBeenCalledWith(
          mockData.output[0],
          undefined,
        );
      },
    );

    it.each(['incomplete', 'in_progress'])(
      'should retain %s function calls without invoking callbacks',
      async (status) => {
        mockFunctionCallbackHandler.processCalls.mockResolvedValue('Unexpected callback');
        const item = {
          id: 'fc_unfinished',
          call_id: 'call_unfinished',
          type: 'function_call',
          name: 'test_function',
          arguments: '{"param":"value"}',
          status,
        };
        const mockData = {
          id: 'resp_unfinished',
          model: 'gpt-4.1',
          status: 'incomplete',
          incomplete_details: { reason: 'max_output_tokens' },
          output: [item],
          usage: { input_tokens: 10, output_tokens: 8, total_tokens: 18 },
        };
        const original = structuredClone(mockData);

        const result = await processor.processResponseOutput(mockData, {}, false);

        expect(mockFunctionCallbackHandler.processCalls).not.toHaveBeenCalled();
        expect(result.output).toBe(JSON.stringify(item));
        expect(result.error).toBeUndefined();
        expect(result.raw).toBe(mockData);
        expect(mockData).toEqual(original);
        expect(result).toMatchObject({
          cached: false,
          cost: 0.001,
          finishReason: 'length',
          tokenUsage: { prompt: 10, completion: 8, total: 18 },
          metadata: {
            responseId: 'resp_unfinished',
            model: 'gpt-4.1',
            responseStatus: 'incomplete',
            incompleteReason: 'max_output_tokens',
          },
        });
      },
    );

    it.each(['incomplete', 'in_progress'])(
      'uses the enclosing %s response status for a status-less function call',
      async (status) => {
        mockFunctionCallbackHandler.processCalls.mockResolvedValue('Unexpected callback');
        const item = { type: 'function_call', name: 'lookup', arguments: '{"value":"partial"}' };
        const data = {
          status,
          output: [item],
          usage: { input_tokens: 10, output_tokens: 8, total_tokens: 18 },
        };

        const result = await processor.processResponseOutput(data, {}, false);

        expect(mockFunctionCallbackHandler.processCalls).not.toHaveBeenCalled();
        expect(result.output).toBe(JSON.stringify(item));
        expect(result.raw).toBe(data);
        expect(result).toMatchObject({
          cost: 0.001,
          tokenUsage: { prompt: 10, completion: 8, total: 18 },
          metadata: { responseStatus: status },
        });
      },
    );

    it.each([
      {
        type: 'function_call',
        responseStatus: 'incomplete',
        messageStatus: undefined,
        callStatus: undefined,
        execute: false,
      },
      {
        type: 'tool_use',
        responseStatus: 'incomplete',
        messageStatus: undefined,
        callStatus: undefined,
        execute: false,
      },
      {
        type: 'function_call',
        responseStatus: 'in_progress',
        messageStatus: undefined,
        callStatus: undefined,
        execute: false,
      },
      {
        type: 'tool_use',
        responseStatus: 'completed',
        messageStatus: 'incomplete',
        callStatus: undefined,
        execute: false,
      },
      {
        type: 'tool_use',
        responseStatus: 'completed',
        messageStatus: 'in_progress',
        callStatus: undefined,
        execute: false,
      },
      {
        type: 'function_call',
        responseStatus: 'incomplete',
        messageStatus: 'completed',
        callStatus: undefined,
        execute: true,
      },
      {
        type: 'tool_use',
        responseStatus: 'incomplete',
        messageStatus: 'incomplete',
        callStatus: 'completed',
        execute: true,
      },
      {
        type: 'tool_use',
        responseStatus: undefined,
        messageStatus: undefined,
        callStatus: undefined,
        execute: true,
      },
    ])(
      'uses the nearest status for $type (response: $responseStatus, message: $messageStatus, call: $callStatus)',
      async ({ type, responseStatus, messageStatus, callStatus, execute }) => {
        mockFunctionCallbackHandler.processCalls.mockResolvedValue('Callback output');
        const item = {
          type,
          name: 'lookup',
          arguments: '{"value":"partial"}',
          ...(callStatus === undefined ? {} : { status: callStatus }),
        };
        const data = {
          ...(responseStatus === undefined ? {} : { status: responseStatus }),
          output: [
            {
              type: 'message',
              role: 'assistant',
              ...(messageStatus === undefined ? {} : { status: messageStatus }),
              content: [{ type: 'output_text', text: 'Partial ' }, item],
            },
          ],
        };

        const result = await processor.processResponseOutput(data, {}, false);

        expect(mockFunctionCallbackHandler.processCalls).toHaveBeenCalledTimes(execute ? 1 : 0);
        expect(result.output).toBe(execute ? 'Callback output' : `Partial ${JSON.stringify(item)}`);
        expect(result.error).toBeUndefined();
        expect(result.raw).toBe(data);
      },
    );

    it.each([true, false])(
      'should retain partial text and execute completed siblings (unfinished first: %s)',
      async (unfinishedFirst) => {
        mockFunctionCallbackHandler.processCalls.mockResolvedValue('Completed call result');
        const completed = {
          type: 'function_call',
          name: 'test_function',
          arguments: '{"param":"complete"}',
          status: 'completed',
        };
        const unfinished = {
          ...completed,
          arguments: '{"param":"partial"}',
          status: 'incomplete',
        };
        const mockData = {
          status: 'incomplete',
          incomplete_details: { reason: 'max_output_tokens' },
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'Partial text' }],
            },
            ...(unfinishedFirst ? [unfinished, completed] : [completed, unfinished]),
          ],
          usage: { input_tokens: 10, output_tokens: 8, total_tokens: 18 },
        };

        const result = await processor.processResponseOutput(mockData, {}, false);

        expect(mockFunctionCallbackHandler.processCalls).toHaveBeenCalledExactlyOnceWith(
          completed,
          undefined,
        );
        expect(result.output).toBe(
          [
            'Partial text',
            ...(unfinishedFirst
              ? [JSON.stringify(unfinished), 'Completed call result']
              : ['Completed call result', JSON.stringify(unfinished)]),
          ].join('\n'),
        );
        expect(result.error).toBeUndefined();
        expect(result.raw).toBe(mockData);
        expect(result).toMatchObject({
          cost: 0.001,
          finishReason: 'length',
          tokenUsage: { prompt: 10, completion: 8, total: 18 },
          metadata: {
            responseStatus: 'incomplete',
            incompleteReason: 'max_output_tokens',
          },
        });
      },
    );

    it('should handle empty function arguments correctly', async () => {
      const mockData = {
        output: [
          {
            type: 'function_call',
            name: 'empty_function',
            arguments: '{}',
            status: 'completed',
          },
        ],
        usage: { input_tokens: 8, output_tokens: 5 },
      };

      const result = await processor.processResponseOutput(mockData, {}, false);

      expect(result.output).toContain('no_arguments_provided');
      expect(result.output).toContain('empty_function');
      // Should not call the function callback handler for empty args
      expect(mockFunctionCallbackHandler.processCalls).not.toHaveBeenCalled();
    });

    it.each([
      ['function_call', 'incomplete'],
      ['function_call', 'in_progress'],
      ['tool_use', 'incomplete'],
      ['tool_use', 'in_progress'],
    ])('should retain unfinished nested %s (%s) and partial text', async (type, status) => {
      mockFunctionCallbackHandler.processCalls.mockResolvedValue('Unexpected callback');
      const item = {
        type,
        name: 'test_function',
        arguments: '{"param":"value"}',
        status,
      };
      const mockData = {
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              { type: 'output_text', text: 'Before ' },
              item,
              { type: 'output_text', text: ' after' },
            ],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 8, total_tokens: 18 },
      };
      const original = structuredClone(mockData);

      const result = await processor.processResponseOutput(mockData, {}, false);

      expect(mockFunctionCallbackHandler.processCalls).not.toHaveBeenCalled();
      expect(result.output).toBe(`Before ${JSON.stringify(item)} after`);
      expect(result.error).toBeUndefined();
      expect(result.raw).toBe(mockData);
      expect(mockData).toEqual(original);
      expect(result).toMatchObject({
        cost: 0.001,
        finishReason: 'length',
        tokenUsage: { prompt: 10, completion: 8, total: 18 },
        metadata: {
          responseStatus: 'incomplete',
          incompleteReason: 'max_output_tokens',
        },
      });
    });

    it.each([
      ['function_call', 'completed', '{}'],
      ['function_call', undefined, '{"param":"value"}'],
      ['tool_use', 'completed', '{}'],
      ['tool_use', undefined, '{"param":"value"}'],
    ])('should still dispatch nested %s with status %s and args %s', async (type, status, args) => {
      mockFunctionCallbackHandler.processCalls.mockResolvedValue('Completed call result');
      const item = {
        type,
        name: 'test_function',
        arguments: args,
        ...(status === undefined ? {} : { status }),
      };
      const mockData = {
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Existing prefix' }, item],
          },
        ],
      };

      const result = await processor.processResponseOutput(mockData, {}, false);

      expect(mockFunctionCallbackHandler.processCalls).toHaveBeenCalledExactlyOnceWith(
        item,
        undefined,
      );
      expect(result.output).toBe('Completed call result');
      expect(result.error).toBeUndefined();
    });

    it('should process reasoning output', async () => {
      const mockData = {
        output: [
          {
            type: 'reasoning',
            summary: [
              { text: 'Step 1: Analyze the problem' },
              { text: 'Step 2: Find the solution' },
            ],
          },
        ],
        usage: { input_tokens: 15, output_tokens: 20 },
      };

      const result = await processor.processResponseOutput(mockData, {}, false);

      expect(result.output).toContain('Reasoning: Step 1: Analyze the problem');
      expect(result.output).toContain('Step 2: Find the solution');
    });

    it('should suppress reasoning output when requested', async () => {
      const mockData = {
        output: [
          {
            type: 'reasoning',
            summary: [{ text: 'Internal reasoning summary' }],
          },
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Final answer' }],
          },
        ],
        usage: { input_tokens: 15, output_tokens: 20 },
      };

      const result = await processor.processResponseOutput(mockData, {}, false, {
        suppressReasoningOutput: true,
      });

      expect(result.output).toBe('Final answer');
      expect(result.output).not.toContain('Reasoning:');
      expect(result.output).not.toContain('Internal reasoning summary');
    });

    it('should process web search calls', async () => {
      const mockData = {
        output: [
          {
            type: 'web_search_call',
            action: { type: 'search', query: 'test query' },
            status: 'completed',
          },
          {
            type: 'web_search_call',
            action: { type: 'open_page', url: 'https://example.com' },
            status: 'completed',
          },
        ],
        usage: { input_tokens: 12, output_tokens: 15 },
      };

      const result = await processor.processResponseOutput(mockData, {}, false);

      expect(result.output).toContain('Web Search: "test query"');
      expect(result.output).toContain('Opening page: https://example.com');
    });

    it('should process code interpreter calls', async () => {
      const mockData = {
        output: [
          {
            type: 'code_interpreter_call',
            code: 'print("Hello, world!")',
            status: 'completed',
          },
        ],
        usage: { input_tokens: 8, output_tokens: 6 },
      };

      const result = await processor.processResponseOutput(mockData, {}, false);

      expect(result.output).toContain('Code Interpreter: print("Hello, world!")');
    });

    it('should process MCP tool calls', async () => {
      const mockData = {
        output: [
          {
            type: 'mcp_list_tools',
            server_label: 'test_server',
            tools: [{ name: 'test_tool' }],
          },
          {
            type: 'mcp_call',
            name: 'test_tool',
            server_label: 'test_server',
            output: 'Tool result',
            status: 'completed',
          },
        ],
        usage: { input_tokens: 18, output_tokens: 25 },
      };

      const result = await processor.processResponseOutput(mockData, {}, false);

      expect(result.output).toContain('MCP Tools from test_server');
      expect(result.output).toContain('MCP Tool Result (test_tool): Tool result');
    });

    it('should handle refusals correctly', async () => {
      const mockData = {
        id: 'resp_refusal456',
        model: 'gpt-4.1',
        status: 'incomplete',
        incomplete_details: { reason: 'content_filter' },
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'refusal',
                refusal: 'I cannot help with that request.',
              },
            ],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 8 },
      };

      const result = await processor.processResponseOutput(mockData, {}, false);

      expect(result.output).toBe('I cannot help with that request.');
      expect(result.isRefusal).toBe(true);
      expect(result.finishReason).toBe('content_filter');
      expect(result.metadata).toEqual({
        responseId: 'resp_refusal456',
        model: 'gpt-4.1',
        responseStatus: 'incomplete',
        incompleteReason: 'content_filter',
      });
    });

    it('should handle mixed response types', async () => {
      mockFunctionCallbackHandler.processCalls.mockResolvedValue('Function result');

      const mockData = {
        output: [
          {
            type: 'reasoning',
            summary: [{ text: 'Let me think about this...' }],
          },
          {
            type: 'function_call',
            name: 'search',
            arguments: '{"query": "test"}',
            status: 'completed',
          },
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Here is the result.' }],
          },
        ],
        usage: { input_tokens: 25, output_tokens: 30 },
      };

      const result = await processor.processResponseOutput(mockData, {}, false);

      expect(result.output).toContain('Reasoning: Let me think about this');
      expect(result.output).toContain('Function result');
      expect(result.output).toContain('Here is the result');
    });

    it('should handle JSON schema parsing', async () => {
      const mockData = {
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: '{"result": "success"}' }],
          },
        ],
        usage: { input_tokens: 12, output_tokens: 8 },
      };

      const requestConfig = {
        response_format: { type: 'json_schema' },
      };

      const result = await processor.processResponseOutput(mockData, requestConfig, false);

      expect(result.output).toEqual({ result: 'success' });
    });

    it('should handle errors gracefully', async () => {
      const mockData = {
        output: 'invalid output format',
      };

      const result = await processor.processResponseOutput(mockData, {}, false);

      expect(result.error).toContain('Invalid response format: Missing output array');
    });

    it('should omit cost when the calculator cannot price the response', async () => {
      mockCostCalculator.mockReturnValueOnce(undefined);
      const mockData = {
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Unpriced response' }],
          },
        ],
        usage: { input_tokens: 4, output_tokens: 2 },
      };

      const result = await processor.processResponseOutput(mockData, {}, false);

      expect(result.output).toBe('Unpriced response');
      expect(result).not.toHaveProperty('cost');
    });

    it('should preserve annotations for deep research', async () => {
      const mockData = {
        id: 'resp_research789',
        model: 'o3-deep-research',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Research result',
                annotations: [{ citation: 'Source 1' }],
              },
            ],
          },
        ],
        usage: { input_tokens: 15, output_tokens: 10 },
      };

      const result = await processor.processResponseOutput(mockData, {}, false);

      expect(result.output).toBe('Research result');
      expect(result.metadata).toEqual({
        responseId: 'resp_research789',
        model: 'o3-deep-research',
        annotations: [{ citation: 'Source 1' }],
      });
    });
  });

  describe('Provider-specific behavior', () => {
    it('should work with Azure provider configuration', async () => {
      const azureProcessor = new ResponsesProcessor({
        modelName: 'gpt-4.1-deployment',
        providerType: 'azure',
        functionCallbackHandler: mockFunctionCallbackHandler,
        costCalculator: mockCostCalculator,
      });

      const mockData = {
        id: 'resp_azure001',
        model: 'gpt-4.1-deployment',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Azure response' }],
          },
        ],
        usage: { input_tokens: 8, output_tokens: 6 },
      };

      const result = await azureProcessor.processResponseOutput(mockData, {}, false);

      expect(result.output).toBe('Azure response');
      expect(mockCostCalculator).toHaveBeenCalledWith(
        'gpt-4.1-deployment',
        mockData.usage,
        {},
        mockData,
      );
      expect(result.metadata).toEqual({
        responseId: 'resp_azure001',
        model: 'gpt-4.1-deployment',
      });
    });
  });

  describe('Metadata extraction', () => {
    it('should extract responseId and model from response data', async () => {
      const mockData = {
        id: 'resp_metadata123',
        model: 'gpt-5-mini',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Response with metadata' }],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      const result = await processor.processResponseOutput(mockData, {}, false);

      expect(result.metadata).toHaveProperty('responseId', 'resp_metadata123');
      expect(result.metadata).toHaveProperty('model', 'gpt-5-mini');
    });

    it('should handle missing id and model gracefully', async () => {
      const mockData = {
        // No id or model fields
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Response without metadata' }],
          },
        ],
        usage: { input_tokens: 8, output_tokens: 4 },
      };

      const result = await processor.processResponseOutput(mockData, {}, false);

      expect(result.metadata).toEqual({});
    });

    it('should include only available metadata fields', async () => {
      const mockData = {
        id: 'resp_partial789',
        // No model field
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Partial metadata' }],
          },
        ],
        usage: { input_tokens: 5, output_tokens: 3 },
      };

      const result = await processor.processResponseOutput(mockData, {}, false);

      expect(result.metadata).toEqual({
        responseId: 'resp_partial789',
      });
      expect(result.metadata).not.toHaveProperty('model');
    });

    it('should combine metadata with annotations for deep research', async () => {
      const mockData = {
        id: 'resp_combined999',
        model: 'o4-mini-deep-research',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Deep research with citations',
                annotations: [{ url: 'https://example.com', title: 'Example Source' }],
              },
            ],
          },
        ],
        usage: { input_tokens: 20, output_tokens: 15 },
      };

      const result = await processor.processResponseOutput(mockData, {}, false);

      expect(result.metadata).toEqual({
        responseId: 'resp_combined999',
        model: 'o4-mini-deep-research',
        annotations: [{ url: 'https://example.com', title: 'Example Source' }],
      });
    });

    it('should include only model when id is missing', async () => {
      const mockData = {
        // No id field
        model: 'gpt-4o-2024-11-20',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Response without id' }],
          },
        ],
        usage: { input_tokens: 5, output_tokens: 3 },
      };

      const result = await processor.processResponseOutput(mockData, {}, false);

      expect(result.metadata).toEqual({
        model: 'gpt-4o-2024-11-20',
      });
      expect(result.metadata).not.toHaveProperty('responseId');
    });

    it('should handle multiple annotations from deep research', async () => {
      const mockData = {
        id: 'resp_multi123',
        model: 'o3-deep-research',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'First citation',
                annotations: [
                  { url: 'https://source1.com', title: 'Source 1' },
                  { url: 'https://source2.com', title: 'Source 2' },
                ],
              },
              {
                type: 'output_text',
                text: 'Second citation',
                annotations: [{ url: 'https://source3.com', title: 'Source 3' }],
              },
            ],
          },
        ],
        usage: { input_tokens: 30, output_tokens: 20 },
      };

      const result = await processor.processResponseOutput(mockData, {}, false);

      expect(result.metadata).toHaveProperty('responseId', 'resp_multi123');
      expect(result.metadata).toHaveProperty('model', 'o3-deep-research');
      expect(result.metadata?.annotations).toHaveLength(3);
      expect(result.metadata?.annotations).toEqual([
        { url: 'https://source1.com', title: 'Source 1' },
        { url: 'https://source2.com', title: 'Source 2' },
        { url: 'https://source3.com', title: 'Source 3' },
      ]);
    });

    it('should not include annotations field when empty array', async () => {
      const mockData = {
        id: 'resp_noannotations',
        model: 'gpt-4.1',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'No citations',
                annotations: [],
              },
            ],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      const result = await processor.processResponseOutput(mockData, {}, false);

      expect(result.metadata).toEqual({
        responseId: 'resp_noannotations',
        model: 'gpt-4.1',
      });
      expect(result.metadata).not.toHaveProperty('annotations');
    });

    it('should handle empty string values gracefully', async () => {
      const mockData = {
        id: '',
        model: '',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Empty strings' }],
          },
        ],
        usage: { input_tokens: 5, output_tokens: 3 },
      };

      const result = await processor.processResponseOutput(mockData, {}, false);

      // Empty strings are falsy, so they should not be included
      expect(result.metadata).toEqual({});
    });

    it('should add annotations to both raw and metadata for backwards compatibility', async () => {
      const mockData = {
        id: 'resp_compat123',
        model: 'o4-mini-deep-research',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Research with citations',
                annotations: [{ url: 'https://example.com', title: 'Example' }],
              },
            ],
          },
        ],
        usage: { input_tokens: 15, output_tokens: 10 },
      };

      const result = await processor.processResponseOutput(mockData, {}, false);

      // Annotations should be in metadata (new behavior)
      expect(result.metadata?.annotations).toEqual([
        { url: 'https://example.com', title: 'Example' },
      ]);

      // Annotations should also be in raw for backwards compatibility
      expect(result.raw).toHaveProperty('annotations');
      expect(result.raw.annotations).toEqual([{ url: 'https://example.com', title: 'Example' }]);
    });

    it('should handle non-string id and model gracefully', async () => {
      const mockData = {
        id: { nested: 'object' }, // Wrong type - should be string
        model: 12345, // Wrong type - should be string
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Response with invalid types' }],
          },
        ],
        usage: { input_tokens: 5, output_tokens: 3 },
      };

      const result = await processor.processResponseOutput(mockData, {}, false);

      // Should exclude invalid types from metadata
      expect(result.metadata).toEqual({});
    });

    it('should handle non-array annotations gracefully', async () => {
      const mockData = {
        id: 'resp_invalidannot',
        model: 'gpt-4o',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Response with invalid annotations',
                annotations: 'not-an-array', // Wrong type - should be array
              },
            ],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      const result = await processor.processResponseOutput(mockData, {}, false);

      // Should include id and model but exclude invalid annotations
      expect(result.metadata).toEqual({
        responseId: 'resp_invalidannot',
        model: 'gpt-4o',
      });
      expect(result.metadata).not.toHaveProperty('annotations');
    });
  });
});
