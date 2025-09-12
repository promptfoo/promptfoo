# Azure Responses Provider Implementation Summary

## Executive Overview

This document provides a comprehensive solution to fix the Azure Responses Provider implementation (PF-566) to achieve 100% feature parity with OpenAI while maximizing code reuse and maintaining zero regressions.

## Problem Statement

**Current Issues:**

- Azure Responses provider missing critical features (function calls, MCP, reasoning output, etc.)
- Response format double-loading bug causing incorrect schema handling
- Feature regression for users migrating from `openai:responses` to `azure:responses`
- No clear error messages for common configuration issues

**Impact:** Users cannot effectively use Azure OpenAI Responses API through promptfoo.

## Research Findings

### Azure vs OpenAI API Compatibility ✅

Based on Microsoft documentation analysis:

- **Identical Response Structure**: Both APIs return the same `output` array format with identical item types
- **Same Tool Support**: Function calls, MCP servers, code interpreter, web search, reasoning output
- **Compatible Request Format**: Same request body structure with minor authentication differences
- **Feature Parity**: Azure supports all OpenAI Responses API features in preview

**Key Insight**: The APIs are functionally identical - only authentication and URL construction differ.

### Code Reuse Analysis ✅

**Reusable Components (100% compatible):**

- Response processing logic (~150 lines)
- Function callback handling
- Tool result processing
- Error handling patterns
- JSON schema parsing

**Azure-Specific Components:**

- URL construction (`/openai/v1/responses?api-version=preview`)
- Authentication headers (API key vs Entra ID)
- Cost calculation (Azure vs OpenAI pricing)

## Recommended Solution: Shared Response Processor

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Shared Response Processor                        │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ • Function call processing                                   │   │
│  │ • MCP tool handling                                          │   │
│  │ • Reasoning output formatting                                │   │
│  │ • Web search result processing                               │   │
│  │ • Code interpreter output handling                           │   │
│  │ • Refusal detection                                          │   │
│  │ • JSON schema parsing                                        │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                    ▲
                        ┌───────────┴───────────┐
                        │                       │
              ┌─────────▼──────────┐  ┌─────────▼─────────┐
              │ OpenAI Provider    │  │ Azure Provider    │
              │ • OpenAI URLs      │  │ • Azure URLs      │
              │ • OpenAI auth      │  │ • Azure auth      │
              │ • OpenAI pricing   │  │ • Azure pricing   │
              └────────────────────┘  └───────────────────┘
```

### Implementation Plan

#### Phase 1: Extract Shared Processor (Week 1)

**Step 1: Create Response Processor**

```typescript
// src/providers/responses/processor.ts
export class ResponsesProcessor {
  constructor(config: ProcessorConfig) {}

  async processOutput(data: any, requestConfig: any, cached: boolean): Promise<ProviderResponse> {
    // Extract ALL response processing logic from OpenAI provider
    // Handle: function_call, message, tool_result, reasoning, web_search_call,
    //         code_interpreter_call, mcp_call, mcp_list_tools, mcp_approval_request
  }
}
```

**Step 2: Update OpenAI Provider**

```typescript
export class OpenAiResponsesProvider extends OpenAiGenericProvider {
  private processor = new ResponsesProcessor({
    modelName: this.modelName,
    providerType: 'openai',
    functionCallbackHandler: this.functionCallbackHandler,
    costCalculator: (model, usage) => calculateOpenAICost(...)
  });

  async callApi(...) {
    // Keep existing API call logic
    const { data, cached } = await fetchWithCache(...);

    // Use shared processor
    return this.processor.processOutput(data, config, cached);
  }
}
```

**Step 3: Fix Azure Provider**

```typescript
export class AzureResponsesProvider extends AzureGenericProvider {
  private processor = new ResponsesProcessor({
    modelName: this.deploymentName,
    providerType: 'azure',
    functionCallbackHandler: this.functionCallbackHandler,
    costCalculator: (model, usage) => calculateAzureCost(...)
  });

  async callApi(...) {
    // Keep correct Azure API call logic
    // Fix response_format double-loading bug
    return this.processor.processOutput(data, config, cached);
  }

  // Fix double-loading bug in getAzureResponsesBody
  getAzureResponsesBody(...) {
    const responseFormat = config.response_format
      ? maybeLoadFromExternalFile(renderVarsInObject(config.response_format, context?.vars))
      : undefined;

    if (responseFormat?.type === 'json_schema') {
      // Use already-loaded schema directly - don't reload
      const schema = responseFormat.schema || responseFormat.json_schema?.schema;
      // ...
    }
  }
}
```

#### Phase 2: Comprehensive Testing (Week 1-2)

**Behavioral Parity Tests**

```typescript
describe('OpenAI vs Azure Behavioral Parity', () => {
  test('processes function calls identically', () => {
    // Mock same response data for both providers
    // Verify identical outputs
  });

  test('handles all response types identically', () => {
    // Test: function_call, mcp_call, reasoning, web_search, code_interpreter, refusals
  });
});
```

**Integration Tests**

```typescript
describe('Azure Provider Integration', () => {
  test('constructs correct Azure URLs', () => {
    // Verify: /openai/v1/responses?api-version=preview
  });

  test('external file loading works correctly', () => {
    // Test file://schema.json loading without double-loading bug
  });
});
```

**Performance Tests**

```typescript
test('shared processor has minimal overhead', () => {
  // Verify <100ms processing time for typical responses
});
```

#### Phase 3: Documentation & Error Handling (Week 2)

**Updated Documentation**

````markdown
## Migration Guide: openai:responses → azure:responses

### Before (Legacy - still works)

```yaml
providers:
  - id: openai:responses:gpt-4.1
    config:
      apiHost: 'resource.openai.azure.com'
      apiKey: '${AZURE_API_KEY}'
      response_format: file://schema.json
```
````

### After (Recommended)

```yaml
providers:
  - id: azure:responses:gpt-4.1-deployment
    config:
      response_format: file://schema.json
      # Auto-detects AZURE_API_KEY and AZURE_API_HOST
```

### Feature Parity Guarantee

✅ 100% identical functionality to openai:responses

````

**Improved Error Messages**
```typescript
// Clear errors for missing configuration
throw new Error(
  'Azure API configuration missing. Set AZURE_API_HOST environment variable.\n' +
  'Example: AZURE_API_HOST=resource.openai.azure.com'
);

// Clear errors for external file issues
throw new Error(
  `Failed to load response_format file: ${filePath}\n` +
  `Make sure the file exists and contains valid JSON schema format.`
);
````

### Testing Strategy

#### Test Pyramid (Total: ~200 test cases)

**Unit Tests (60% - ~120 tests)**

- Shared processor for each response type
- Request body construction
- Error handling scenarios
- Authentication patterns

**Integration Tests (30% - ~60 tests)**

- Full provider workflows
- External file loading
- API contract validation
- Migration scenarios

**End-to-End Tests (10% - ~20 tests)**

- Real Azure API calls (optional)
- User acceptance testing
- Performance validation

#### Validation Criteria

✅ **Functional Parity**

- All OpenAI features work identically in Azure
- External file loading works correctly
- All response types processed correctly

✅ **Performance**

- Response processing <100ms
- Memory usage stable under load
- No significant overhead from shared processor

✅ **User Experience**

- Clear migration path from openai:responses
- Actionable error messages
- Zero breaking changes

✅ **Code Quality**

- > 90% test coverage on new code
- All CI checks pass
- Comprehensive integration testing

## Benefits of This Solution

### ✅ **Guaranteed Feature Parity**

- Single source of truth for response processing
- Impossible for features to diverge between providers
- Comprehensive test coverage ensures compatibility

### ✅ **Maintainability**

- ~150 lines of duplicated code eliminated
- Shared logic easier to debug and enhance
- Single place to fix bugs for both providers

### ✅ **Zero Regressions**

- OpenAI provider behavior unchanged
- Legacy configurations continue working
- Clear migration path for users

### ✅ **Performance**

- No significant overhead from shared processor
- Faster development of new response types
- Consistent error handling across providers

## Implementation Timeline

| Week | Phase             | Tasks                                       | Deliverables           |
| ---- | ----------------- | ------------------------------------------- | ---------------------- |
| 1    | Extract & Fix     | Create shared processor, fix Azure provider | Working implementation |
| 2    | Test & Document   | Comprehensive testing, improved docs        | Production-ready code  |
| 3    | Polish & Validate | Performance optimization, user testing      | Merge-ready PR         |

**Total Effort**: ~3 weeks for complete, production-ready solution

## Risk Mitigation

**High Risk: Breaking Changes**

- ✅ Mitigation: Keep OpenAI provider unchanged, extensive testing

**Medium Risk: Performance Impact**

- ✅ Mitigation: Benchmark shared processor, optimize if needed

**Low Risk: Authentication Issues**

- ✅ Mitigation: Comprehensive auth testing with API key and Entra ID

## Success Metrics

- ✅ PF-566 closed with positive user feedback
- ✅ Users successfully migrate from openai:responses to azure:responses
- ✅ Zero new support tickets for missing features
- ✅ <10ms additional processing overhead
- ✅ Maintainability score improvement from code reuse

## Next Steps

1. **Immediate**: Create shared response processor
2. **Week 1**: Fix Azure provider and implement comprehensive tests
3. **Week 2**: Update documentation and error handling
4. **Week 3**: Performance optimization and user validation
5. **Deployment**: Beta testing with original issue reporters

This solution transforms the problematic Azure provider into a robust, feature-complete implementation that users can confidently adopt, while establishing a maintainable architecture for future enhancements.

## Code Quality Assessment

**Before**: Azure Provider - 4/10

- ✅ Good inheritance structure
- ❌ Missing critical features
- ❌ Response format bugs
- ❌ Poor error handling

**After**: Improved Implementation - 9/10

- ✅ Feature complete (identical to OpenAI)
- ✅ Robust error handling
- ✅ Comprehensive test coverage
- ✅ Maintainable architecture
- ✅ Clear documentation

**Recommendation**: Implement this solution to deliver the Azure alias users need while maintaining promptfoo's quality standards.
