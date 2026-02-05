import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    vi.clearAllMocks();

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
        id: 'resp_refusal456',
        model: 'gpt-4.1',
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
      expect(result.metadata).toEqual({
        responseId: 'resp_refusal456',
        model: 'gpt-4.1',
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
      expect(mockCostCalculator).toHaveBeenCalledWith('gpt-4.1-deployment', mockData.usage, {});
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
