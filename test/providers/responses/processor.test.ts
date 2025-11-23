import { ResponsesProcessor } from '../../../src/providers/responses/processor';

// Mock dependencies
jest.mock('../../../src/providers/functionCallbackUtils');

const mockFunctionCallbackHandler = {
  processCalls: jest.fn(),
} as any;

const mockCostCalculator = jest.fn().mockReturnValue(0.001);

describe('ResponsesProcessor', () => {
  let processor: ResponsesProcessor;

  beforeEach(() => {
    jest.clearAllMocks();

    processor = new ResponsesProcessor({
      modelName: 'gpt-4.1',
      providerType: 'openai',
      functionCallbackHandler: mockFunctionCallbackHandler,
      costCalculator: mockCostCalculator,
    });
  });

  describe('processResponseOutput', () => {
    it('should process simple text output', async () => {
      const mockData = {
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
    });

    it('should process function calls', async () => {
      mockFunctionCallbackHandler.processCalls.mockResolvedValue('Function executed successfully');

      const mockData = {
        output: [
          {
            type: 'function_call',
            name: 'test_function',
            arguments: '{"param": "value"}',
            status: 'completed',
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
    });

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

    it('should preserve annotations for deep research', async () => {
      const mockData = {
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
      expect(result.raw.annotations).toEqual([{ citation: 'Source 1' }]);
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
      expect(mockCostCalculator).toHaveBeenCalledWith('gpt-4.1-deployment', mockData.usage, {});
    });
  });
});
