# Azure Responses Provider Improvement Plan

## Executive Summary

This plan outlines a comprehensive strategy to fix the Azure Responses provider implementation to achieve feature parity with the OpenAI Responses provider while leveraging maximum code reuse. The current implementation has critical gaps that result in feature regression for users.

## Research Findings

### Azure vs OpenAI Responses API Compatibility

Based on Microsoft documentation research, the Azure OpenAI Responses API is functionally identical to OpenAI's API:

- **Same response structure**: Both APIs return identical `output` arrays with the same item types
- **Same tool support**: Function calls, MCP tools, code interpreter, web search, reasoning output
- **Same authentication patterns**: Azure uses API keys or Entra ID, OpenAI uses API keys
- **Same endpoint pattern**: Both use `/responses` endpoint with different base URLs

**Key Difference**: Azure requires `api-version=preview` parameter and uses Azure-specific authentication.

### Code Reuse Analysis

The OpenAI provider's response processing logic (~150 lines) can be 100% reused because:

1. **Response format is identical** - Both APIs return the same `output` array structure
2. **Tool types are identical** - Same `function_call`, `mcp_call`, `reasoning`, `web_search_call` etc.
3. **Processing logic is provider-agnostic** - No OpenAI-specific assumptions

Only differences are:

- URL construction (Azure needs different base URL + api-version)
- Authentication headers (Azure uses different auth patterns)
- Model naming (Azure uses deployment names)

## Architectural Solution

### Option A: Shared Response Processor (Recommended)

Extract response processing into a shared utility that both providers can use:

```typescript
// src/providers/responses/shared-processor.ts
export class ResponsesProcessor {
  constructor(
    private functionCallbackHandler: FunctionCallbackHandler,
    private modelName: string
  ) {}

  async processResponseOutput(
    data: any,
    config: any,
    cached: boolean
  ): Promise<ProviderResponse> {
    // Move all the response processing logic here
    // 100% reusable between OpenAI and Azure
  }
}

// src/providers/openai/responses.ts
export class OpenAiResponsesProvider {
  private processor = new ResponsesProcessor(this.functionCallbackHandler, this.modelName);

  async callApi(...) {
    // ... API call logic
    return this.processor.processResponseOutput(data, config, cached);
  }
}

// src/providers/azure/responses.ts
export class AzureResponsesProvider {
  private processor = new ResponsesProcessor(this.functionCallbackHandler, this.deploymentName);

  async callApi(...) {
    // ... Azure-specific API call logic
    return this.processor.processResponseOutput(data, config, cached);
  }
}
```

**Benefits:**

- ✅ Single source of truth for response processing
- ✅ Guaranteed feature parity
- ✅ Easy to maintain and test
- ✅ Reduces code duplication by ~150 lines

### Option B: Inheritance Pattern (Alternative)

Create a base class that both providers extend:

```typescript
// src/providers/responses/base.ts
export abstract class BaseResponsesProvider {
  protected functionCallbackHandler = new FunctionCallbackHandler();

  protected abstract getApiUrl(): string;
  protected abstract getAuthHeaders(): Record<string, string>;

  // Shared response processing logic here
  protected async processResponse(data: any, config: any, cached: boolean) {
    // All the response processing logic
  }
}
```

**Trade-offs:**

- ✅ Clean inheritance structure
- ❌ More complex hierarchy
- ❌ Harder to test in isolation

## Implementation Plan

### Phase 1: Create Shared Response Processor (Week 1)

#### Step 1.1: Extract Response Processing Logic

```bash
# Create shared processor
mkdir -p src/providers/responses
touch src/providers/responses/processor.ts
touch src/providers/responses/types.ts
touch src/providers/responses/index.ts
```

**Implementation Details:**

```typescript
// src/providers/responses/processor.ts
import { FunctionCallbackHandler } from '../functionCallbackUtils';
import { formatOpenAiError, getTokenUsage, calculateOpenAICost } from '../openai/util';
import { calculateAzureCost } from '../azure/util';
import logger from '../../logger';

export interface ProcessorConfig {
  modelName: string;
  providerType: 'openai' | 'azure';
  functionCallbackHandler: FunctionCallbackHandler;
  costCalculator: (modelName: string, usage: any) => number;
}

export class ResponsesProcessor {
  constructor(private config: ProcessorConfig) {}

  async processOutput(data: any, requestConfig: any, cached: boolean): Promise<ProviderResponse> {
    // Extract ALL the response processing logic from OpenAI provider
    const output = data.output;

    if (!output || !Array.isArray(output) || output.length === 0) {
      return { error: 'Invalid response format: Missing output array' };
    }

    let result = '';
    let refusal = '';
    let isRefusal = false;

    // Process all output items with FULL feature support
    for (const item of output) {
      if (!item || typeof item !== 'object') {
        logger.warn(`Skipping invalid output item: ${JSON.stringify(item)}`);
        continue;
      }

      await this.processOutputItem(item, result, refusal, isRefusal, requestConfig);
    }

    // Handle refusals, JSON parsing, cost calculation, etc.
    return this.buildResponse(result, refusal, isRefusal, data, cached, requestConfig);
  }

  private async processOutputItem(
    item: any,
    result: string,
    refusal: string,
    isRefusal: boolean,
    config: any,
  ) {
    switch (item.type) {
      case 'function_call':
        return await this.processFunctionCall(item, result, config);
      case 'message':
        return this.processMessage(item, result, refusal, isRefusal);
      case 'tool_result':
        return this.processToolResult(item, result);
      case 'reasoning':
        return this.processReasoning(item, result);
      case 'web_search_call':
        return this.processWebSearch(item, result);
      case 'code_interpreter_call':
        return this.processCodeInterpreter(item, result);
      case 'mcp_call':
      case 'mcp_list_tools':
      case 'mcp_approval_request':
        return this.processMcp(item, result);
      default:
        logger.debug(`Unknown output item type: ${item.type}`);
    }
  }

  // ... implement all the specific processors
}
```

#### Step 1.2: Update OpenAI Provider

```typescript
// src/providers/openai/responses.ts
import { ResponsesProcessor } from '../responses/processor';

export class OpenAiResponsesProvider extends OpenAiGenericProvider {
  private processor: ResponsesProcessor;

  constructor(modelName: string, options: any) {
    super(modelName, options);
    this.processor = new ResponsesProcessor({
      modelName: this.modelName,
      providerType: 'openai',
      functionCallbackHandler: this.functionCallbackHandler,
      costCalculator: (model, usage) => calculateOpenAICost(model, this.config, usage?.input_tokens, usage?.output_tokens, 0, 0)
    });
  }

  async callApi(...) {
    // Keep existing API call logic
    const { data, cached, status, statusText } = await fetchWithCache(...);

    // Replace response processing with shared processor
    return this.processor.processOutput(data, config, cached);
  }
}
```

#### Step 1.3: Fix Azure Provider

```typescript
// src/providers/azure/responses.ts
import { ResponsesProcessor } from '../responses/processor';
import { calculateAzureCost } from './util';

export class AzureResponsesProvider extends AzureGenericProvider {
  private processor: ResponsesProcessor;

  constructor(deploymentName: string, options: any) {
    super(deploymentName, options);
    this.processor = new ResponsesProcessor({
      modelName: this.deploymentName,
      providerType: 'azure',
      functionCallbackHandler: this.functionCallbackHandler,
      costCalculator: (model, usage) => calculateAzureCost(model, usage)
    });
  }

  async callApi(...) {
    // Keep existing Azure API call logic (it's correct)
    const body = this.getAzureResponsesBody(prompt, context, callApiOptions);

    const { data, cached, status, statusText } = await fetchWithCache(
      `${this.getApiBaseUrl()}/openai/v1/responses?api-version=${this.config.apiVersion || 'preview'}`,
      { /* ... existing logic ... */ }
    );

    // Use shared processor instead of custom parsing
    return this.processor.processOutput(data, body, cached);
  }

  // Fix the response_format double-loading bug
  getAzureResponsesBody(...) {
    // ... existing logic but fix this part:

    const responseFormat = config.response_format
      ? maybeLoadFromExternalFile(renderVarsInObject(config.response_format, context?.vars))
      : undefined;

    let textFormat;
    if (responseFormat) {
      if (responseFormat.type === 'json_schema') {
        // Don't double-load the schema - it's already loaded above
        const schema = responseFormat.schema || responseFormat.json_schema?.schema;
        const schemaName = responseFormat.json_schema?.name || responseFormat.name || 'response_schema';

        textFormat = {
          format: {
            type: 'json_schema',
            name: schemaName,
            schema: schema, // Use already-loaded schema
            strict: true,
          },
        };
      }
      // ... rest of logic
    }
  }
}
```

### Phase 2: Comprehensive Testing (Week 1-2)

#### Step 2.1: Unit Tests for Shared Processor

```typescript
// test/providers/responses/processor.test.ts
describe('ResponsesProcessor', () => {
  describe('Feature Parity Tests', () => {
    test('processes function calls identically for OpenAI and Azure', () => {
      const openAiProcessor = new ResponsesProcessor({ providerType: 'openai', ... });
      const azureProcessor = new ResponsesProcessor({ providerType: 'azure', ... });

      const mockFunctionCall = {
        type: 'function_call',
        name: 'get_weather',
        arguments: '{"city": "San Francisco"}'
      };

      const openAiResult = await openAiProcessor.processOutput([mockFunctionCall], config, false);
      const azureResult = await azureProcessor.processOutput([mockFunctionCall], config, false);

      expect(openAiResult.output).toBe(azureResult.output);
    });

    test('processes MCP tools correctly', () => { /* ... */ });
    test('processes reasoning output correctly', () => { /* ... */ });
    test('processes web search correctly', () => { /* ... */ });
    test('processes code interpreter correctly', () => { /* ... */ });
    test('handles refusals correctly', () => { /* ... */ });
    test('handles JSON schema responses correctly', () => { /* ... */ });
  });

  describe('Edge Cases', () => {
    test('handles empty output array', () => { /* ... */ });
    test('handles malformed output items', () => { /* ... */ });
    test('handles mixed output types', () => { /* ... */ });
  });
});
```

#### Step 2.2: Integration Tests

```typescript
// test/providers/azure/responses-integration.test.ts
describe('AzureResponsesProvider Integration', () => {
  describe('API Compatibility', () => {
    test('constructs correct Azure URL format', () => {
      // Verify: /openai/v1/responses?api-version=preview
    });

    test('includes correct authentication headers', () => {
      // Test both API key and Entra ID auth
    });

    test('handles deployment name correctly', () => {
      // Verify deployment name goes in body.model, not URL
    });
  });

  describe('External File Loading', () => {
    test('loads response_format from external file', async () => {
      const schemaFile = 'test-schema.json';
      fs.writeFileSync(
        schemaFile,
        JSON.stringify({
          type: 'json_schema',
          json_schema: { name: 'test', schema: { type: 'object' } },
        }),
      );

      const provider = new AzureResponsesProvider('gpt-4.1', {
        config: { response_format: `file://${schemaFile}` },
      });

      const body = provider.getAzureResponsesBody('test prompt');
      expect(body.text.format.type).toBe('json_schema');
      expect(body.text.format.name).toBe('test');
    });
  });

  describe('Feature Parity with OpenAI', () => {
    test('handles function calls identically', async () => {
      // Mock both providers with same response data
      // Verify identical processing
    });
  });
});
```

#### Step 2.3: Behavior Validation Tests

```typescript
// test/providers/responses-compatibility.test.ts
describe('OpenAI vs Azure Responses Compatibility', () => {
  test('identical response processing', async () => {
    const mockResponseData = {
      output: [
        { type: 'function_call', name: 'test_func', arguments: '{"param": "value"}' },
        { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Result' }] },
        { type: 'reasoning', summary: [{ text: 'Reasoning step' }] },
      ],
      usage: { input_tokens: 10, output_tokens: 20 },
    };

    const openAiProvider = new OpenAiResponsesProvider('gpt-4.1', mockConfig);
    const azureProvider = new AzureResponsesProvider('gpt-4.1-deploy', mockConfig);

    // Mock API calls to return same data
    jest.mocked(fetchWithCache).mockResolvedValue({
      data: mockResponseData,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const openAiResult = await openAiProvider.callApi('test prompt');
    const azureResult = await azureProvider.callApi('test prompt');

    // Results should be functionally identical (ignoring cost calculation differences)
    expect(openAiResult.output).toBe(azureResult.output);
    expect(openAiResult.tokenUsage).toEqual(azureResult.tokenUsage);
  });
});
```

### Phase 3: Documentation and Error Handling (Week 2)

#### Step 3.1: Update Documentation

````markdown
# site/docs/providers/azure.md

## Azure Responses API Migration Guide

### From openai:responses to azure:responses

✅ **Before (Legacy - still works):**

```yaml
providers:
  - id: openai:responses:gpt-4.1
    config:
      apiHost: 'your-resource.openai.azure.com'
      apiKey: '${AZURE_API_KEY}'
      response_format: file://schema.json
```
````

✅ **After (Recommended):**

```yaml
providers:
  - id: azure:responses:your-gpt-4.1-deployment
    config:
      response_format: file://schema.json
      # Auto-detects AZURE_API_KEY and AZURE_API_HOST
```

### Feature Parity Guarantee

The azure:responses provider supports 100% of the same features as openai:responses:

- ✅ External file loading for response_format
- ✅ Function calls and tool processing
- ✅ MCP server integration
- ✅ Reasoning output (o1, o3 models)
- ✅ Web search and code interpreter
- ✅ Background tasks and chaining

````

#### Step 3.2: Improve Error Messages
```typescript
// src/providers/azure/responses.ts
export class AzureResponsesProvider extends AzureGenericProvider {
  async callApi(...) {
    // Better error for missing auth
    if (!this.getApiBaseUrl()) {
      throw new Error(
        'Azure API configuration missing. Set AZURE_API_HOST environment variable or configure apiHost in provider config.\n' +
        'Example: AZURE_API_HOST=your-resource.openai.azure.com'
      );
    }

    // Better error for missing API key
    if (!this.authHeaders || !this.authHeaders['api-key']) {
      throw new Error(
        'Azure API authentication failed. Set AZURE_API_KEY environment variable or configure apiKey in provider config.\n' +
        'You can also use Microsoft Entra ID authentication.'
      );
    }

    // Validate response_format for better UX
    if (this.config.response_format && typeof this.config.response_format === 'string' && this.config.response_format.startsWith('file://')) {
      try {
        maybeLoadFromExternalFile(this.config.response_format);
      } catch (error) {
        throw new Error(
          `Failed to load response_format file: ${this.config.response_format}\n` +
          `Error: ${error.message}\n` +
          `Make sure the file exists and contains valid JSON schema format.`
        );
      }
    }
  }
}
````

### Phase 4: Performance and Production Readiness (Week 2-3)

#### Step 4.1: Performance Testing

```typescript
// test/providers/responses-performance.test.ts
describe('Responses Performance', () => {
  test('shared processor has minimal overhead', async () => {
    const complexResponse = {
      output: Array.from({ length: 100 }, (_, i) => ({
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: `Message ${i}` }],
      })),
    };

    const startTime = performance.now();
    await processor.processOutput(complexResponse, config, false);
    const endTime = performance.now();

    expect(endTime - startTime).toBeLessThan(100); // Should process in <100ms
  });
});
```

#### Step 4.2: Memory Usage Optimization

```typescript
// Ensure processor doesn't hold references to large response objects
export class ResponsesProcessor {
  async processOutput(data: any, config: any, cached: boolean) {
    try {
      // Process the response
      const result = await this.processResponseItems(data.output);

      // Clear references to prevent memory leaks
      data = null;

      return result;
    } catch (error) {
      // Ensure cleanup even on errors
      data = null;
      throw error;
    }
  }
}
```

#### Step 4.3: Monitoring and Observability

```typescript
// Add telemetry for feature usage tracking
export class ResponsesProcessor {
  async processOutput(data: any, config: any, cached: boolean) {
    const outputTypes = new Set();
    const toolTypes = new Set();

    for (const item of data.output) {
      outputTypes.add(item.type);
      if (item.type === 'function_call') {
        toolTypes.add('function');
      } else if (item.type === 'mcp_call') {
        toolTypes.add('mcp');
      }
    }

    // Track feature usage for analytics
    logger.debug('Responses processing', {
      outputTypes: Array.from(outputTypes),
      toolTypes: Array.from(toolTypes),
      providerType: this.config.providerType,
      itemCount: data.output.length,
    });
  }
}
```

## Testing Strategy

### Test Pyramid Approach

#### 1. Unit Tests (70% of coverage)

- **Shared processor logic**: Test each response type handler in isolation
- **Request body construction**: Verify Azure vs OpenAI differences
- **Error handling**: Test all error paths with clear messages
- **Authentication**: Test API key and Entra ID auth patterns

#### 2. Integration Tests (20% of coverage)

- **End-to-end API flows**: Mock Azure API responses, verify full processing
- **File loading**: Test external schema loading with various formats
- **Provider switching**: Verify users can switch from openai:responses to azure:responses seamlessly

#### 3. E2E Tests (10% of coverage)

- **Real Azure endpoints**: Test against actual Azure OpenAI deployments (optional, for CI)
- **Feature parity validation**: Compare outputs between providers with same inputs

### Validation Criteria

Before merging, verify:

1. ✅ **100% Feature Parity**: All OpenAI responses features work identically in Azure
2. ✅ **Zero Regressions**: Existing openai:responses users unaffected
3. ✅ **Clear Migration Path**: Documentation shows how to migrate
4. ✅ **Performance**: No significant overhead from shared processor
5. ✅ **Error Messages**: Clear, actionable error messages for common issues
6. ✅ **Test Coverage**: >90% coverage on new code

## Deployment Strategy

### Phase 1: Internal Testing

- Deploy to staging environment
- Test with internal Azure deployments
- Validate all response types work correctly

### Phase 2: Beta Release

- Document feature as "Preview"
- Get feedback from original issue reporters (@jennkao, @daniel-furman)
- Monitor for any edge cases or compatibility issues

### Phase 3: GA Release

- Update documentation to mark as stable
- Add to provider examples and tutorials
- Monitor adoption and performance metrics

## Success Metrics

- ✅ **Issue Resolution**: PF-566 closed with positive user feedback
- ✅ **Feature Adoption**: Users migrate from openai:responses to azure:responses
- ✅ **Zero Support Tickets**: No new issues related to missing features
- ✅ **Performance**: Response processing time <10ms additional overhead
- ✅ **Code Quality**: Maintainability score improvement from shared code

## Risk Mitigation

### High Risk: Breaking Changes

**Mitigation**: Keep openai:responses unchanged, only add new azure:responses provider

### Medium Risk: Performance Impact

**Mitigation**: Benchmark shared processor, optimize if needed

### Low Risk: Authentication Issues

**Mitigation**: Comprehensive auth testing with both API key and Entra ID

## Timeline

- **Week 1**: Implement shared processor and fix Azure provider
- **Week 2**: Comprehensive testing and documentation
- **Week 3**: Performance optimization and production readiness
- **Week 4**: Beta testing and user validation

**Total Effort**: ~3-4 weeks for complete, production-ready solution

This plan delivers a robust, maintainable solution that provides the Azure alias users want while maintaining 100% feature parity and zero regressions.
