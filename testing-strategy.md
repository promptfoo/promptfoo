# Azure Responses Provider Testing Strategy

## Overview

This document outlines a comprehensive testing strategy to ensure the Azure Responses provider achieves 100% feature parity with the OpenAI Responses provider while maintaining zero regressions.

## Testing Philosophy

### Test-Driven Development Approach

1. **Write tests first** - Define expected behavior before implementing fixes
2. **Test behavior, not implementation** - Focus on outputs and user experience
3. **Maintain feature parity** - Every OpenAI feature must work identically in Azure
4. **Validate edge cases** - Test error conditions and malformed responses

### Test Pyramid Structure

```
    🔺 E2E Tests (10%)
      - Real Azure API calls
      - User acceptance testing

    🔺 Integration Tests (30%)
      - Full provider workflows
      - API contract validation

    🔺 Unit Tests (60%)
      - Individual functions
      - Response processing logic
      - Error handling
```

## Phase 1: Behavioral Equivalence Testing

### 1.1 Response Type Processing Tests

Create comprehensive test cases for each response type that both providers must handle identically:

```typescript
// test/providers/responses-behavioral-parity.test.ts
import { OpenAiResponsesProvider } from '../../../src/providers/openai/responses';
import { AzureResponsesProvider } from '../../../src/providers/azure/responses';

describe('Behavioral Parity: OpenAI vs Azure Responses', () => {
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
      const openAiProvider = new OpenAiResponsesProvider('gpt-4.1', { config: mockConfig });
      const azureProvider = new AzureResponsesProvider('gpt-4.1-deployment', {
        config: mockConfig,
      });

      // Mock the API calls to return identical data
      mockApiResponse(mockFunctionCallResponse);

      const [openAiResult, azureResult] = await Promise.all([
        openAiProvider.callApi('test prompt'),
        azureProvider.callApi('test prompt'),
      ]);

      // Results should be functionally identical
      expect(normalizeResult(openAiResult)).toEqual(normalizeResult(azureResult));
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
      };

      mockApiResponse(emptyArgsResponse);

      const [openAiResult, azureResult] = await Promise.all([
        openAiProvider.callApi('test'),
        azureProvider.callApi('test'),
      ]);

      expect(openAiResult.output).toBe(azureResult.output);
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
    };

    it('processes MCP tools identically', async () => {
      mockApiResponse(mockMcpResponse);

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
    };

    it('processes reasoning output identically', async () => {
      mockApiResponse(mockReasoningResponse);

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
    };

    it('processes web search calls identically', async () => {
      mockApiResponse(mockWebSearchResponse);

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
    };

    it('processes code interpreter calls identically', async () => {
      mockApiResponse(mockCodeResponse);

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
    };

    it('handles refusals identically', async () => {
      mockApiResponse(mockRefusalResponse);

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
});

// Utility function to normalize results for comparison
function normalizeResult(result: ProviderResponse): any {
  return {
    output: result.output,
    isRefusal: result.isRefusal,
    cached: result.cached,
    // Exclude cost as it differs between providers
    tokenUsage: result.tokenUsage,
  };
}
```

### 1.2 Complex Scenario Testing

Test combinations of response types that occur in real usage:

```typescript
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
    };

    mockApiResponse(complexResponse);

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
```

## Phase 2: Request/Response Format Testing

### 2.1 Request Body Validation

Ensure Azure constructs requests correctly while maintaining compatibility:

```typescript
describe('Azure Request Format', () => {
  it('constructs request body correctly', () => {
    const azureProvider = new AzureResponsesProvider('gpt-4.1-deployment', {
      config: {
        temperature: 0.7,
        response_format: { type: 'json_schema', json_schema: { name: 'test', schema: {} } },
        tools: [{ type: 'function', function: { name: 'test' } }],
        instructions: 'You are helpful',
      },
    });

    const body = azureProvider.getAzureResponsesBody('test prompt');

    // Verify Azure-specific fields
    expect(body.model).toBe('gpt-4.1-deployment'); // deployment name
    expect(body.input).toBe('test prompt');
    expect(body.temperature).toBe(0.7);
    expect(body.instructions).toBe('You are helpful');

    // Verify response format structure
    expect(body.text.format.type).toBe('json_schema');
    expect(body.text.format.name).toBe('test');
    expect(body.text.format.strict).toBe(true);

    // Verify tools are included
    expect(body.tools).toBeDefined();
  });

  it('handles reasoning models correctly', () => {
    const reasoningProvider = new AzureResponsesProvider('o3-mini', {
      config: { temperature: 0.5, reasoning_effort: 'medium' },
    });

    const body = reasoningProvider.getAzureResponsesBody('reasoning task');

    // Temperature should be excluded for reasoning models
    expect(body.temperature).toBeUndefined();

    // Reasoning effort should be included
    expect(body.reasoning.effort).toBe('medium');
  });
});
```

### 2.2 External File Loading Tests

Comprehensive testing of the external file loading fix:

```typescript
describe('Response Format External File Loading', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads external JSON schema correctly', async () => {
    const schemaFile = '/tmp/test-schema.json';
    const schemaContent = {
      type: 'json_schema',
      json_schema: {
        name: 'example_response',
        strict: true,
        schema: {
          type: 'object',
          properties: { result: { type: 'string' } },
          required: ['result'],
        },
      },
    };

    // Mock file system
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(schemaContent));

    const provider = new AzureResponsesProvider('gpt-4.1', {
      config: { response_format: `file://${schemaFile}` },
    });

    const body = provider.getAzureResponsesBody('test');

    expect(body.text.format).toEqual({
      type: 'json_schema',
      name: 'example_response',
      schema: schemaContent.json_schema.schema,
      strict: true,
    });

    // Verify file was loaded only once (no double-loading bug)
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
  });

  it('handles missing external files gracefully', () => {
    jest.mocked(fs.existsSync).mockReturnValue(false);

    const provider = new AzureResponsesProvider('gpt-4.1', {
      config: { response_format: 'file://missing.json' },
    });

    expect(() => {
      provider.getAzureResponsesBody('test');
    }).toThrow('File does not exist');
  });

  it('validates external file content', () => {
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockReturnValue('invalid json');

    const provider = new AzureResponsesProvider('gpt-4.1', {
      config: { response_format: 'file://invalid.json' },
    });

    expect(() => {
      provider.getAzureResponsesBody('test');
    }).toThrow();
  });
});
```

## Phase 3: Integration Testing

### 3.1 Full Provider Workflow Tests

```typescript
describe('AzureResponsesProvider Integration', () => {
  beforeEach(() => {
    process.env.AZURE_API_KEY = 'test-key';
    process.env.AZURE_API_HOST = 'test.openai.azure.com';
  });

  it('executes full workflow successfully', async () => {
    const provider = new AzureResponsesProvider('gpt-4.1-deployment', {
      config: {
        temperature: 0.7,
        response_format: 'file://test-schema.json',
        tools: [{ type: 'function', function: { name: 'test_func' } }],
      },
    });

    const mockResponse = {
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: '{"result": "success"}' }],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 15 },
    };

    jest.mocked(fetchWithCache).mockResolvedValue({
      data: mockResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const result = await provider.callApi('test prompt');

    expect(result.error).toBeUndefined();
    expect(result.output).toBe('{"result": "success"}');
    expect(result.cached).toBe(false);
    expect(result.tokenUsage).toEqual({
      total: 25,
      prompt: 10,
      completion: 15,
      cached: 0,
    });
  });

  it('constructs correct Azure API URL', async () => {
    const provider = new AzureResponsesProvider('gpt-4.1-deployment');

    jest.mocked(fetchWithCache).mockResolvedValue({
      data: { output: [] },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    await provider.callApi('test');

    // Verify correct Azure URL format
    expect(fetchWithCache).toHaveBeenCalledWith(
      'https://test.openai.azure.com/openai/v1/responses?api-version=preview',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'api-key': 'test-key',
        }),
      }),
      expect.any(Number),
      'json',
      undefined,
    );
  });
});
```

### 3.2 Error Handling Tests

```typescript
describe('Error Handling', () => {
  it('provides clear error for missing authentication', async () => {
    delete process.env.AZURE_API_KEY;

    const provider = new AzureResponsesProvider('gpt-4.1');

    await expect(provider.callApi('test')).rejects.toThrow(
      /Azure API authentication failed.*AZURE_API_KEY/,
    );
  });

  it('provides clear error for missing host', async () => {
    delete process.env.AZURE_API_HOST;

    const provider = new AzureResponsesProvider('gpt-4.1');

    await expect(provider.callApi('test')).rejects.toThrow(
      /Azure API configuration missing.*AZURE_API_HOST/,
    );
  });

  it('handles API errors gracefully', async () => {
    const provider = new AzureResponsesProvider('gpt-4.1');

    jest.mocked(fetchWithCache).mockResolvedValue({
      data: { error: { message: 'Deployment not found' } },
      cached: false,
      status: 404,
      statusText: 'Not Found',
    });

    const result = await provider.callApi('test');

    expect(result.error).toContain('API error: 404');
    expect(result.error).toContain('Deployment not found');
  });
});
```

## Phase 4: Performance Testing

### 4.1 Response Processing Performance

```typescript
describe('Performance Tests', () => {
  it('processes responses efficiently', async () => {
    const largeResponse = {
      output: Array.from({ length: 1000 }, (_, i) => ({
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: `Message ${i}` }],
      })),
      usage: { input_tokens: 100, output_tokens: 5000 },
    };

    const provider = new AzureResponsesProvider('gpt-4.1');
    jest.mocked(fetchWithCache).mockResolvedValue({
      data: largeResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const startTime = performance.now();
    const result = await provider.callApi('large response test');
    const endTime = performance.now();

    expect(result.error).toBeUndefined();
    expect(endTime - startTime).toBeLessThan(500); // Should complete in <500ms
  });

  it('handles memory efficiently', async () => {
    const initialMemory = process.memoryUsage().heapUsed;

    // Process many responses
    for (let i = 0; i < 100; i++) {
      const provider = new AzureResponsesProvider('gpt-4.1');
      jest.mocked(fetchWithCache).mockResolvedValue({
        data: {
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: `Test ${i}` }],
            },
          ],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      await provider.callApi(`test ${i}`);
    }

    // Force garbage collection if available
    if (global.gc) global.gc();

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;

    // Memory increase should be reasonable (< 10MB)
    expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
  });
});
```

## Phase 5: User Acceptance Testing

### 5.1 Migration Scenario Testing

```typescript
describe('Migration Scenarios', () => {
  it('supports seamless migration from openai:responses', async () => {
    // Test the exact scenario from the original issue
    const legacyConfig = {
      providers: [
        {
          id: 'openai:responses:gpt-4.1',
          config: {
            apiHost: 'test-resource.openai.azure.com',
            apiKey: '${AZURE_API_KEY}',
            temperature: 0.7,
            instructions: 'You are a helpful assistant.',
            response_format: 'file://./response_format.json',
          },
        },
      ],
    };

    const newConfig = {
      providers: [
        {
          id: 'azure:responses:gpt-4.1-deployment',
          config: {
            temperature: 0.7,
            instructions: 'You are a helpful assistant.',
            response_format: 'file://./response_format.json',
          },
        },
      ],
    };

    // Both configs should produce identical results
    const mockResponseData = {
      output: [
        { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Hello!' }] },
      ],
    };

    jest.mocked(fetchWithCache).mockResolvedValue({
      data: mockResponseData,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    // Test legacy approach still works
    const legacyProvider = new OpenAiResponsesProvider('gpt-4.1', {
      config: {
        ...legacyConfig.providers[0].config,
        apiHost: 'test-resource.openai.azure.com',
      },
    });

    // Test new approach
    const newProvider = new AzureResponsesProvider('gpt-4.1-deployment', {
      config: newConfig.providers[0].config,
    });

    const [legacyResult, newResult] = await Promise.all([
      legacyProvider.callApi('test'),
      newProvider.callApi('test'),
    ]);

    expect(legacyResult.output).toBe(newResult.output);
  });
});
```

### 5.2 Real-world Usage Pattern Tests

```typescript
describe('Real-world Usage Patterns', () => {
  it('handles structured output with external schema', async () => {
    const schemaContent = {
      type: 'json_schema',
      json_schema: {
        name: 'user_data',
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'number' },
            email: { type: 'string', format: 'email' },
          },
          required: ['name', 'age'],
          additionalProperties: false,
        },
      },
    };

    jest.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(schemaContent));
    jest.mocked(fs.existsSync).mockReturnValue(true);

    const provider = new AzureResponsesProvider('gpt-4.1-deployment', {
      config: {
        response_format: 'file://./user-schema.json',
        temperature: 0.1,
      },
    });

    jest.mocked(fetchWithCache).mockResolvedValue({
      data: {
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: '{"name": "John Doe", "age": 30, "email": "john@example.com"}',
              },
            ],
          },
        ],
        usage: { input_tokens: 50, output_tokens: 25 },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const result = await provider.callApi(
      'Extract user data from: John Doe, 30 years old, john@example.com',
    );

    expect(result.error).toBeUndefined();

    // Verify JSON parsing works
    const parsedOutput = JSON.parse(result.output as string);
    expect(parsedOutput).toEqual({
      name: 'John Doe',
      age: 30,
      email: 'john@example.com',
    });
  });
});
```

## Test Execution Strategy

### Continuous Integration Setup

```yaml
# .github/workflows/azure-responses-tests.yml
name: Azure Responses Provider Tests

on:
  pull_request:
    paths:
      - 'src/providers/azure/responses.ts'
      - 'src/providers/responses/**'
      - 'test/providers/azure/responses*.test.ts'
      - 'test/providers/responses*.test.ts'

jobs:
  test-behavioral-parity:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test -- test/providers/responses-behavioral-parity.test.ts
      - run: npm test -- test/providers/azure/responses.test.ts

  test-performance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm test -- test/providers/responses-performance.test.ts

  test-integration:
    runs-on: ubuntu-latest
    env:
      AZURE_API_KEY: ${{ secrets.AZURE_API_KEY }}
      AZURE_API_HOST: ${{ secrets.AZURE_API_HOST }}
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm test -- test/providers/azure/responses-integration.test.ts
```

### Local Testing Commands

```bash
# Run all Azure responses tests
npm test -- test/providers/azure/responses

# Run behavioral parity tests
npm test -- test/providers/responses-behavioral-parity.test.ts

# Run performance tests with profiling
npm test -- test/providers/responses-performance.test.ts --verbose

# Run integration tests (requires Azure credentials)
AZURE_API_KEY=xxx AZURE_API_HOST=xxx.openai.azure.com npm test -- test/providers/azure/responses-integration.test.ts

# Generate coverage report
npm test -- --coverage test/providers/azure/responses test/providers/responses
```

## Validation Checklist

Before merging the Azure Responses provider improvements, verify:

### ✅ Functional Requirements

- [ ] All OpenAI responses features work identically in Azure
- [ ] External file loading works correctly (no double-loading bug)
- [ ] Function calls are processed correctly
- [ ] MCP tools work correctly
- [ ] Reasoning output is handled correctly
- [ ] Web search results are formatted correctly
- [ ] Code interpreter output is handled correctly
- [ ] Refusals are detected and handled correctly
- [ ] JSON schema responses are parsed correctly

### ✅ Non-functional Requirements

- [ ] Response processing completes in <100ms for typical responses
- [ ] Memory usage remains stable under load
- [ ] Error messages are clear and actionable
- [ ] Authentication works with both API key and Entra ID
- [ ] All edge cases are handled gracefully

### ✅ Migration Requirements

- [ ] Users can migrate from openai:responses to azure:responses seamlessly
- [ ] Legacy openai:responses configuration continues to work
- [ ] Documentation provides clear migration path
- [ ] No breaking changes for existing users

### ✅ Code Quality Requirements

- [ ] Test coverage >90% on new code
- [ ] All tests pass consistently
- [ ] Performance tests show no significant regressions
- [ ] Integration tests work with real Azure endpoints
- [ ] Code passes all linting and type checking

This comprehensive testing strategy ensures the Azure Responses provider delivers on its promise of 100% feature parity while maintaining the high quality and reliability standards expected by promptfoo users.
