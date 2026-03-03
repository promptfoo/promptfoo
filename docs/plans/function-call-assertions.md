# Feature Plan: Expose Tool/Function Calls for Assertions

## GitHub Issue

[#7160](https://github.com/promptfoo/promptfoo/issues/7160) - Feature Request: Expose custom client tools in output for function calling assertions (xAI Voice)

## Problem Statement

When testing providers with custom client tools (xAI Voice, OpenAI Realtime, Google Live), there's no standardized way to assert that:

1. A specific tool was invoked during the conversation
2. The tool was invoked with correct parameters
3. The tool returned the expected result

Currently, users can only assert on the final text/audio output, not on tool invocations.

## Current State Analysis

### Provider Implementations

| Provider        | File                                       | Tool Call Handling                 | Data Exposed                                       |
| --------------- | ------------------------------------------ | ---------------------------------- | -------------------------------------------------- |
| xAI Voice       | `src/providers/xai/voice.ts:493-500`       | Captures in `pendingFunctionCalls` | Only `metadata.functionCallResults` (results only) |
| OpenAI Realtime | `src/providers/openai/realtime.ts:493-500` | Captures in `pendingFunctionCalls` | `functionCallOccurred`, `functionCallResults`      |
| Google Live     | `src/providers/google/live.ts`             | Similar pattern                    | Limited exposure                                   |

### Existing Assertions

| Assertion                    | File                           | Purpose                                    |
| ---------------------------- | ------------------------------ | ------------------------------------------ |
| `is-valid-openai-tools-call` | `src/assertions/openai.ts`     | Validates tool call schema from output     |
| `tool-call-f1`               | `src/assertions/toolCallF1.ts` | F1 score for expected vs actual tool names |

**Gap:** Both extract tool names from `output` field, but voice providers put tool calls in metadata, not output.

## Proposed Solution

### 1. Standardized Tool Call Interface

Add to `src/types/providers.ts`:

```typescript
export interface ToolCallInfo {
  id?: string; // Tool call ID (if provided by API)
  name: string; // Function/tool name
  arguments: string | Record<string, unknown>; // Arguments passed
  result?: string; // Result returned (if executed)
  error?: string; // Error if execution failed
}

// Extend ProviderResponse
export interface ProviderResponse {
  // ... existing fields

  /**
   * Tool/function calls made during this response.
   * Populated by providers that support function calling.
   */
  toolCalls?: ToolCallInfo[];
}
```

### 2. Provider Updates

#### xAI Voice Provider (`src/providers/xai/voice.ts`)

Modify `webSocketRequest()` to capture full tool call info:

```typescript
// Line ~406: Change from storing just results to full info
interface ToolCallInfo {
  id: string;
  name: string;
  arguments: string;
  result?: string;
  error?: string;
}
const toolCallsInfo: ToolCallInfo[] = [];

// Line ~508-534: Capture full details when processing calls
for (const call of pendingFunctionCalls) {
  const toolCallInfo: ToolCallInfo = {
    id: call.call_id,
    name: call.name,
    arguments: call.arguments,
  };
  try {
    const result = await this.config.functionCallHandler(call.name, call.arguments);
    toolCallInfo.result = result;
  } catch (err) {
    toolCallInfo.error = String(err);
  }
  toolCallsInfo.push(toolCallInfo);
}

// Line ~575-593: Include in response
resolve({
  output: responseTranscript,
  cost,
  toolCalls: toolCallsInfo, // NEW FIELD
  metadata: {
    // ... existing metadata
    toolCalls: toolCallsInfo, // Also in metadata for backward compatibility
  },
  // ...
});
```

#### OpenAI Realtime Provider (`src/providers/openai/realtime.ts`)

Similar modifications at lines ~537-572 in `webSocketRequest()` and ~1214-1252 in `directWebSocketRequest()`.

### 3. New Assertion Types

Add to `src/types/index.ts` (line ~510):

```typescript
// Add to BaseAssertionTypesSchema
'tool-invoked',
'tool-parameters',
'tool-result',
```

#### `tool-invoked` Assertion

Create `src/assertions/toolInvoked.ts`:

```typescript
import type { AssertionParams, GradingResult } from '../types/index';

/**
 * Asserts that a specific tool was invoked during the response.
 *
 * Usage:
 *   - type: tool-invoked
 *     value: set_volume
 */
export const handleToolInvoked = ({
  assertion,
  providerResponse,
  renderedValue,
  inverse,
}: AssertionParams): GradingResult => {
  const expectedTool = String(renderedValue);
  const toolCalls = providerResponse.toolCalls || [];

  // Also check metadata.toolCalls for backward compatibility
  const metadataToolCalls = (providerResponse.metadata?.toolCalls as any[]) || [];
  const allToolCalls = [...toolCalls, ...metadataToolCalls];

  const wasInvoked = allToolCalls.some((tc) => tc.name === expectedTool);
  const pass = wasInvoked !== inverse;

  const invokedTools = [...new Set(allToolCalls.map((tc) => tc.name))].join(', ') || '(none)';

  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? `Tool "${expectedTool}" was${inverse ? ' not' : ''} invoked as expected. Tools invoked: [${invokedTools}]`
      : `Tool "${expectedTool}" was${wasInvoked ? '' : ' not'} invoked. Tools invoked: [${invokedTools}]`,
    assertion,
  };
};
```

#### `tool-parameters` Assertion

Create `src/assertions/toolParameters.ts`:

```typescript
import Ajv from 'ajv';
import type { AssertionParams, GradingResult } from '../types/index';

/**
 * Asserts that a tool was invoked with specific parameters.
 *
 * Usage:
 *   - type: tool-parameters
 *     value:
 *       name: set_volume
 *       parameters:
 *         level: 50
 */
export const handleToolParameters = ({
  assertion,
  providerResponse,
  renderedValue,
  inverse,
}: AssertionParams): GradingResult => {
  if (typeof renderedValue !== 'object' || renderedValue === null) {
    return {
      pass: false,
      score: 0,
      reason:
        'tool-parameters assertion requires an object value with "name" and "parameters" fields',
      assertion,
    };
  }

  const expected = renderedValue as { name: string; parameters: Record<string, unknown> };
  const { name: expectedTool, parameters: expectedParams } = expected;

  const toolCalls = providerResponse.toolCalls || [];
  const metadataToolCalls = (providerResponse.metadata?.toolCalls as any[]) || [];
  const allToolCalls = [...toolCalls, ...metadataToolCalls];

  // Find matching tool call
  const matchingCall = allToolCalls.find((tc) => tc.name === expectedTool);

  if (!matchingCall) {
    return {
      pass: inverse,
      score: inverse ? 1 : 0,
      reason: `Tool "${expectedTool}" was not invoked`,
      assertion,
    };
  }

  // Parse arguments if string
  let actualParams: Record<string, unknown>;
  try {
    actualParams =
      typeof matchingCall.arguments === 'string'
        ? JSON.parse(matchingCall.arguments)
        : matchingCall.arguments;
  } catch {
    return {
      pass: false,
      score: 0,
      reason: `Could not parse tool arguments: ${matchingCall.arguments}`,
      assertion,
    };
  }

  // Check if expected parameters are present and match
  const mismatches: string[] = [];
  for (const [key, expectedValue] of Object.entries(expectedParams)) {
    const actualValue = actualParams[key];
    if (JSON.stringify(actualValue) !== JSON.stringify(expectedValue)) {
      mismatches.push(
        `${key}: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actualValue)}`,
      );
    }
  }

  const pass = (mismatches.length === 0) !== inverse;

  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? `Tool "${expectedTool}" parameters match expected values`
      : `Tool "${expectedTool}" parameter mismatches: ${mismatches.join('; ')}`,
    assertion,
  };
};
```

#### `tool-result` Assertion

Create `src/assertions/toolResult.ts`:

```typescript
import type { AssertionParams, GradingResult } from '../types/index';

/**
 * Asserts on the result of a tool invocation.
 *
 * Usage:
 *   - type: tool-result
 *     value:
 *       name: set_volume
 *       contains: success
 */
export const handleToolResult = ({
  assertion,
  providerResponse,
  renderedValue,
  inverse,
}: AssertionParams): GradingResult => {
  const expected = renderedValue as { name: string; contains?: string; equals?: string };
  const { name: expectedTool, contains, equals } = expected;

  const toolCalls = providerResponse.toolCalls || [];
  const metadataToolCalls = (providerResponse.metadata?.toolCalls as any[]) || [];
  const allToolCalls = [...toolCalls, ...metadataToolCalls];

  const matchingCall = allToolCalls.find((tc) => tc.name === expectedTool);

  if (!matchingCall) {
    return {
      pass: inverse,
      score: inverse ? 1 : 0,
      reason: `Tool "${expectedTool}" was not invoked`,
      assertion,
    };
  }

  const result = matchingCall.result || '';
  let pass = false;
  let reason = '';

  if (equals !== undefined) {
    pass = result === equals;
    reason = pass
      ? `Tool result equals "${equals}"`
      : `Tool result "${result}" does not equal "${equals}"`;
  } else if (contains !== undefined) {
    pass = result.includes(contains);
    reason = pass
      ? `Tool result contains "${contains}"`
      : `Tool result "${result}" does not contain "${contains}"`;
  } else {
    return {
      pass: false,
      score: 0,
      reason: 'tool-result assertion requires either "contains" or "equals" in value',
      assertion,
    };
  }

  pass = pass !== inverse;

  return {
    pass,
    score: pass ? 1 : 0,
    reason,
    assertion,
  };
};
```

### 4. Register Handlers

Update `src/assertions/index.ts` (around line 119):

```typescript
import { handleToolInvoked } from './toolInvoked';
import { handleToolParameters } from './toolParameters';
import { handleToolResult } from './toolResult';

// Add to ASSERTION_HANDLERS map
'tool-invoked': handleToolInvoked,
'tool-parameters': handleToolParameters,
'tool-result': handleToolResult,
```

### 5. JavaScript Assertion Access

Users can already access tool calls via JavaScript assertions once `toolCalls` is on `providerResponse`:

```yaml
assert:
  - type: javascript
    value: |
      const toolCalls = context.providerResponse?.toolCalls || [];
      const volumeCall = toolCalls.find(tc => tc.name === 'set_volume');
      return volumeCall && JSON.parse(volumeCall.arguments).level === 50;
```

## Example Usage

```yaml
prompts:
  - 'Set the volume to 50%'

providers:
  - id: xai:voice:grok-4
    config:
      tools:
        - type: function
          name: set_volume
          description: Set the device volume
          parameters:
            type: object
            properties:
              level:
                type: integer
                description: Volume level 0-100
            required: [level]

tests:
  - vars: {}
    assert:
      # Check tool was invoked
      - type: tool-invoked
        value: set_volume

      # Check parameters
      - type: tool-parameters
        value:
          name: set_volume
          parameters:
            level: 50

      # Check result
      - type: tool-result
        value:
          name: set_volume
          contains: success

      # Or use JavaScript for complex logic
      - type: javascript
        value: |
          const calls = context.providerResponse?.toolCalls || [];
          return calls.length === 1 &&
                 calls[0].name === 'set_volume' &&
                 JSON.parse(calls[0].arguments).level === 50;
```

## Implementation Order

1. **Phase 1: Type Definitions**
   - Add `ToolCallInfo` interface to `src/types/providers.ts`
   - Add `toolCalls` to `ProviderResponse`
   - Add new assertion types to `BaseAssertionTypesSchema`

2. **Phase 2: Provider Updates**
   - Update xAI Voice provider
   - Update OpenAI Realtime provider
   - Update Google Live provider (if applicable)

3. **Phase 3: Assertion Handlers**
   - Create `src/assertions/toolInvoked.ts`
   - Create `src/assertions/toolParameters.ts`
   - Create `src/assertions/toolResult.ts`
   - Register handlers in `src/assertions/index.ts`

4. **Phase 4: Testing**
   - Unit tests for each assertion type
   - Integration tests with mock providers
   - End-to-end test with real xAI Voice API

5. **Phase 5: Documentation**
   - Add docs to `site/docs/configuration/expected-outputs/assertions.md`
   - Add example in `examples/xai-voice-tools/`

## Files to Modify

| File                                                     | Changes                                                 |
| -------------------------------------------------------- | ------------------------------------------------------- |
| `src/types/providers.ts`                                 | Add `ToolCallInfo` interface, extend `ProviderResponse` |
| `src/types/index.ts`                                     | Add assertion types to `BaseAssertionTypesSchema`       |
| `src/providers/xai/voice.ts`                             | Capture full tool call info in `toolCalls` field        |
| `src/providers/openai/realtime.ts`                       | Capture full tool call info in `toolCalls` field        |
| `src/assertions/toolInvoked.ts`                          | New file - `tool-invoked` handler                       |
| `src/assertions/toolParameters.ts`                       | New file - `tool-parameters` handler                    |
| `src/assertions/toolResult.ts`                           | New file - `tool-result` handler                        |
| `src/assertions/index.ts`                                | Import and register new handlers                        |
| `test/assertions/toolInvoked.test.ts`                    | New file - tests                                        |
| `test/assertions/toolParameters.test.ts`                 | New file - tests                                        |
| `test/assertions/toolResult.test.ts`                     | New file - tests                                        |
| `site/docs/configuration/expected-outputs/assertions.md` | Documentation                                           |
| `examples/xai-voice-tools/`                              | New directory - example config                          |

## Considerations

### Backward Compatibility

- Keep `metadata.functionCallResults` for existing users
- New `toolCalls` field is additive, not breaking

### Provider Differences

- xAI, OpenAI, and Google have slightly different WebSocket message formats
- Normalize to common `ToolCallInfo` structure

### Error Cases

- Tool call fails: Include in `toolCalls` with `error` field
- No handler provided: Still capture call info without result

### Performance

- Tool call info is small, minimal memory impact
- No additional API calls required

## Open Questions

1. Should `tool-parameters` do partial matching (subset of params) or exact matching?
   - **Recommendation:** Partial matching (only check specified params)

2. Should we add `tool-sequence` assertion for ordered tool call validation?
   - **Recommendation:** Defer to future enhancement

3. Should `toolCalls` include server-side tools (web_search, x_search)?
   - **Recommendation:** Yes, for completeness

## References

- [xAI Voice API Docs](https://docs.x.ai/docs/guides/voice)
- [xAI Function Calling Docs](https://docs.x.ai/docs/guides/function-calling)
- [Existing tool-call-f1 assertion](../src/assertions/toolCallF1.ts)
- [OpenAI Realtime provider](../src/providers/openai/realtime.ts)
