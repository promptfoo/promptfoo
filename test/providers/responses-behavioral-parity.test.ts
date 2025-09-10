import { OpenAiResponsesProvider } from '../../src/providers/openai/responses';
import { AzureResponsesProvider } from '../../src/providers/azure/responses';
import { fetchWithCache } from '../../src/cache';

// Mock external dependencies
jest.mock('../../src/cache');
jest.mock('../../src/util/file');

const mockFetchWithCache = fetchWithCache as jest.MockedFunction<typeof fetchWithCache>;

// Utility to normalize results for comparison (excluding provider-specific fields)
function normalizeResult(result: any): any {
  return {
    output: result.output,
    isRefusal: result.isRefusal,
    cached: result.cached,
    tokenUsage: result.tokenUsage,
    // Exclude cost as it differs between providers
    // Exclude raw as it may have provider-specific metadata
  };
}

// Mock configuration for both providers
const mockConfig = {
  temperature: 0.7,
  functionToolCallbacks: {},
};

describe('Behavioral Parity: OpenAI vs Azure Responses', () => {
  let openAiProvider: OpenAiResponsesProvider;
  let azureProvider: AzureResponsesProvider;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup environment for Azure provider
    process.env.AZURE_API_KEY = 'test-key';
    process.env.AZURE_API_HOST = 'test.openai.azure.com';

    openAiProvider = new OpenAiResponsesProvider('gpt-4.1', { config: mockConfig });
    azureProvider = new AzureResponsesProvider('gpt-4.1-deployment', { config: mockConfig });

    // Mock Azure provider methods
    jest.spyOn(azureProvider, 'ensureInitialized').mockImplementation(async () => {
      (azureProvider as any).authHeaders = { 'api-key': 'test-key' };
    });
    jest.spyOn(azureProvider, 'getApiBaseUrl').mockReturnValue('https://test.openai.azure.com');

    // Mock OpenAI provider methods
    jest.spyOn(openAiProvider, 'getApiKey').mockReturnValue('test-openai-key');
    jest.spyOn(openAiProvider, 'getApiUrl').mockReturnValue('https://api.openai.com/v1');
  });

  afterEach(() => {
    delete process.env.AZURE_API_KEY;
    delete process.env.AZURE_API_HOST;
  });

  describe('Function Call Processing', () => {
    const mockFunctionCallResponse = {
      output: [
        {
          type: 'function_call',
          name: 'get_weather',
          arguments: '{"city": "San Francisco", "units": "celsius"}',
          status: 'completed',
        },
      ],
      usage: { input_tokens: 15, output_tokens: 25 },
    };

    it('processes function calls identically', async () => {
      mockFetchWithCache.mockResolvedValue({
        data: mockFunctionCallResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const [openAiResult, azureResult] = await Promise.all([
        openAiProvider.callApi('test prompt'),
        azureProvider.callApi('test prompt'),
      ]);

      // Results should be functionally identical
      expect(normalizeResult(openAiResult)).toEqual(normalizeResult(azureResult));
      expect(openAiResult.output).toBe(azureResult.output);
    });

    it('handles empty function arguments correctly', async () => {
      const emptyArgsResponse = {
        output: [
          {
            type: 'function_call',
            name: 'simple_function',
            arguments: '{}',
            status: 'completed',
          },
        ],
        usage: { input_tokens: 10, output_tokens: 10 },
      };

      mockFetchWithCache.mockResolvedValue({
        data: emptyArgsResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const [openAiResult, azureResult] = await Promise.all([
        openAiProvider.callApi('test'),
        azureProvider.callApi('test'),
      ]);

      expect(openAiResult.output).toBe(azureResult.output);
      expect(openAiResult.output).toContain('no_arguments_provided');
    });
  });

  describe('MCP Tool Processing', () => {
    const mockMcpResponse = {
      output: [
        {
          type: 'mcp_list_tools',
          server_label: 'github',
          tools: [{ name: 'search_repos', description: 'Search repositories' }],
        },
        {
          type: 'mcp_call',
          name: 'search_repos',
          server_label: 'github',
          output: '{"repos": ["repo1", "repo2"]}',
          status: 'completed',
        },
      ],
      usage: { input_tokens: 20, output_tokens: 30 },
    };

    it('processes MCP tools identically', async () => {
      mockFetchWithCache.mockResolvedValue({
        data: mockMcpResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const [openAiResult, azureResult] = await Promise.all([
        openAiProvider.callApi('search for repos'),
        azureProvider.callApi('search for repos'),
      ]);

      expect(openAiResult.output).toBe(azureResult.output);
      expect(openAiResult.output).toContain('MCP Tools from github');
      expect(openAiResult.output).toContain('MCP Tool Result (search_repos)');
    });
  });

  describe('Reasoning Output Processing', () => {
    const mockReasoningResponse = {
      output: [
        {
          type: 'reasoning',
          summary: [
            { text: 'First, I need to analyze the problem...' },
            { text: 'Then, I should consider the constraints...' },
            { text: 'Finally, I can provide the solution.' },
          ],
        },
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Based on my reasoning, the answer is 42.' }],
        },
      ],
      usage: { input_tokens: 25, output_tokens: 35 },
    };

    it('processes reasoning output identically', async () => {
      mockFetchWithCache.mockResolvedValue({
        data: mockReasoningResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const [openAiResult, azureResult] = await Promise.all([
        openAiProvider.callApi('complex reasoning task'),
        azureProvider.callApi('complex reasoning task'),
      ]);

      expect(openAiResult.output).toBe(azureResult.output);
      expect(openAiResult.output).toContain('Reasoning: First, I need to analyze');
      expect(openAiResult.output).toContain('Based on my reasoning, the answer is 42');
    });
  });

  describe('Web Search Processing', () => {
    const mockWebSearchResponse = {
      output: [
        {
          type: 'web_search_call',
          action: { type: 'search', query: 'Azure OpenAI pricing' },
          status: 'completed',
        },
        {
          type: 'web_search_call',
          action: { type: 'open_page', url: 'https://azure.microsoft.com/pricing' },
          status: 'completed',
        },
      ],
      usage: { input_tokens: 18, output_tokens: 22 },
    };

    it('processes web search calls identically', async () => {
      mockFetchWithCache.mockResolvedValue({
        data: mockWebSearchResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const [openAiResult, azureResult] = await Promise.all([
        openAiProvider.callApi('search for Azure pricing'),
        azureProvider.callApi('search for Azure pricing'),
      ]);

      expect(openAiResult.output).toBe(azureResult.output);
      expect(openAiResult.output).toContain('Web Search: "Azure OpenAI pricing"');
      expect(openAiResult.output).toContain('Opening page: https://azure.microsoft.com/pricing');
    });
  });

  describe('Code Interpreter Processing', () => {
    const mockCodeResponse = {
      output: [
        {
          type: 'code_interpreter_call',
          code: 'import math\nresult = math.sqrt(16)\nprint(result)',
          status: 'completed',
        },
      ],
      usage: { input_tokens: 12, output_tokens: 18 },
    };

    it('processes code interpreter calls identically', async () => {
      mockFetchWithCache.mockResolvedValue({
        data: mockCodeResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const [openAiResult, azureResult] = await Promise.all([
        openAiProvider.callApi('calculate square root of 16'),
        azureProvider.callApi('calculate square root of 16'),
      ]);

      expect(openAiResult.output).toBe(azureResult.output);
      expect(openAiResult.output).toContain('Code Interpreter: import math');
    });
  });

  describe('Refusal Handling', () => {
    const mockRefusalResponse = {
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'refusal',
              refusal: 'I cannot provide information about that topic.',
            },
          ],
        },
      ],
      usage: { input_tokens: 15, output_tokens: 10 },
    };

    it('handles refusals identically', async () => {
      mockFetchWithCache.mockResolvedValue({
        data: mockRefusalResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const [openAiResult, azureResult] = await Promise.all([
        openAiProvider.callApi('inappropriate request'),
        azureProvider.callApi('inappropriate request'),
      ]);

      expect(openAiResult.isRefusal).toBe(true);
      expect(azureResult.isRefusal).toBe(true);
      expect(openAiResult.output).toBe(azureResult.output);
      expect(openAiResult.output).toContain('I cannot provide information');
    });
  });

  describe('Complex Response Scenarios', () => {
    it('handles mixed response types correctly', async () => {
      const complexResponse = {
        output: [
          {
            type: 'reasoning',
            summary: [{ text: 'I need to search and then calculate...' }],
          },
          {
            type: 'web_search_call',
            action: { type: 'search', query: 'current stock price AAPL' },
            status: 'completed',
          },
          {
            type: 'function_call',
            name: 'calculate_percentage',
            arguments: '{"value": 150, "percentage": 10}',
            status: 'completed',
          },
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'The result is 165.' }],
          },
        ],
        usage: { input_tokens: 40, output_tokens: 50 },
      };

      mockFetchWithCache.mockResolvedValue({
        data: complexResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const [openAiResult, azureResult] = await Promise.all([
        openAiProvider.callApi('complex task'),
        azureProvider.callApi('complex task'),
      ]);

      expect(openAiResult.output).toBe(azureResult.output);

      // Verify all components are present
      expect(openAiResult.output).toContain('Reasoning: I need to search');
      expect(openAiResult.output).toContain('Web Search: "current stock price AAPL"');
      expect(openAiResult.output).toContain('calculate_percentage'); // Function call
      expect(openAiResult.output).toContain('The result is 165'); // Final message
    });
  });

  describe('Error Handling', () => {
    it('handles API errors identically', async () => {
      mockFetchWithCache.mockResolvedValue({
        data: { error: { message: 'Model not found' } },
        cached: false,
        status: 404,
        statusText: 'Not Found',
      });

      const [openAiResult, azureResult] = await Promise.all([
        openAiProvider.callApi('test'),
        azureProvider.callApi('test'),
      ]);

      expect(openAiResult.error).toBeDefined();
      expect(azureResult.error).toBeDefined();
      // Both should contain similar error information
      expect(openAiResult.error).toContain('404');
      expect(azureResult.error).toContain('404');
    });
  });

  describe('Token Usage and Metadata', () => {
    it('reports token usage consistently', async () => {
      const response = {
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Hello, world!' }],
          },
        ],
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          total_tokens: 15,
        },
      };

      mockFetchWithCache.mockResolvedValue({
        data: response,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const [openAiResult, azureResult] = await Promise.all([
        openAiProvider.callApi('Hello'),
        azureProvider.callApi('Hello'),
      ]);

      expect(openAiResult.tokenUsage).toEqual(azureResult.tokenUsage);
      expect(openAiResult.tokenUsage?.total).toBe(15);
      expect(openAiResult.tokenUsage?.prompt).toBe(10);
      expect(openAiResult.tokenUsage?.completion).toBe(5);
    });
  });
});
