# xAI Voice Provider Enhancements

Implementation plan for GitHub issues #7159 and #7160.

## Overview

Two enhancements to the xAI Voice provider:

1. **Issue #7159**: Allow complete websocket URL override without transformation
2. **Issue #7160**: Expose custom client tools in output for function calling assertions

## Issue #7159: WebSocket URL Override

### Current Behavior

The WebSocket URL is constructed through transformation:

1. Priority: `apiHost` → `apiBaseUrl` → `XAI_API_BASE_URL` env → default
2. Convert `https://` → `wss://`, `http://` → `ws://`
3. Strip trailing slashes
4. Append `/realtime`

**Problem**: Cannot use custom query parameters, alternative endpoints, or exact URL specifications needed for testing/proxying.

### Solution

Add `websocketUrl` config option that bypasses all URL transformation when provided.

### Implementation Steps

#### Step 1: Update Types (`src/providers/xai/voice.ts`)

Add `websocketUrl` to `XAIVoiceOptions` interface:

```typescript
export interface XAIVoiceOptions {
  // ... existing fields

  // Complete WebSocket URL override (used exactly as-is, no transformation)
  websocketUrl?: string;
}
```

#### Step 2: Update `getWebSocketUrl()` Method

Modify the protected method to check for `websocketUrl` first:

```typescript
protected getWebSocketUrl(): string {
  // If websocketUrl is provided, use it exactly as-is
  if (this.config.websocketUrl) {
    return this.config.websocketUrl;
  }
  return `${this.getWebSocketBase()}/realtime`;
}
```

#### Step 3: Add Tests (`test/providers/xai/voice.test.ts`)

Add tests for the new `websocketUrl` option:

```typescript
describe('websocketUrl override', () => {
  it('uses websocketUrl exactly as provided', () => {
    const provider = new TestableXAIVoiceProvider('grok-3', {
      config: { websocketUrl: 'wss://custom.example.com/path?token=xyz&session=abc' },
    });
    expect(provider.getWebSocketUrl()).toBe('wss://custom.example.com/path?token=xyz&session=abc');
  });

  it('websocketUrl takes priority over apiBaseUrl', () => {
    const provider = new TestableXAIVoiceProvider('grok-3', {
      config: {
        websocketUrl: 'wss://override.example.com/custom',
        apiBaseUrl: 'https://fallback.com/v1',
      },
    });
    expect(provider.getWebSocketUrl()).toBe('wss://override.example.com/custom');
  });

  it('preserves query parameters in websocketUrl', () => {
    const provider = new TestableXAIVoiceProvider('grok-3', {
      config: { websocketUrl: 'wss://mock.local:8080/ws?auth=token123&debug=true' },
    });
    expect(provider.getWebSocketUrl()).toBe('wss://mock.local:8080/ws?auth=token123&debug=true');
  });

  it('allows ws:// protocol in websocketUrl', () => {
    const provider = new TestableXAIVoiceProvider('grok-3', {
      config: { websocketUrl: 'ws://localhost:3000/realtime' },
    });
    expect(provider.getWebSocketUrl()).toBe('ws://localhost:3000/realtime');
  });
});
```

#### Step 4: Update Documentation (`site/docs/providers/xai.md`)

Add documentation for the new option in the Voice Agent API section:

````markdown
#### Complete WebSocket URL Override

For advanced use cases like local testing, custom proxies, or endpoints requiring query parameters, you can provide a complete WebSocket URL that will be used exactly as specified without any transformation:

```yaml
providers:
  - id: xai:voice:grok-3
    config:
      # Use this URL exactly as-is (no transformation applied)
      websocketUrl: 'wss://custom-endpoint.example.com/path?token=xyz&session=abc'
```
````

This is useful for:

- Local development and testing with mock servers
- Custom proxy configurations
- Adding authentication tokens or session IDs as URL parameters
- Using alternative WebSocket gateways or regional endpoints

````

---

## Issue #7160: Expose Function Calls in Output

### Current Behavior

- Function calls are collected in `pendingFunctionCalls` array during WebSocket communication
- Results are stored in `metadata.functionCallResults` as string array
- The function call details (name, arguments) are NOT exposed in the output

### Solution

Expose function call information in the output, following the pattern used by Google Live provider (`output.toolCall.functionCalls`).

### Implementation Steps

#### Step 1: Define Function Call Output Interface

Add interface for function call output:

```typescript
/**
 * Function call information exposed in output
 */
export interface XAIFunctionCallOutput {
  name: string;
  arguments: Record<string, unknown>;
  result?: string;
}
````

#### Step 2: Track Function Calls with Full Details

Modify the WebSocket handler to store complete function call information:

```typescript
// Change from:
const functionCallResults: string[] = [];

// To:
const functionCallOutputs: XAIFunctionCallOutput[] = [];
```

When processing function calls:

```typescript
case 'response.function_call_arguments.done': {
  pendingFunctionCalls.push({
    name: message.name as string,
    call_id: message.call_id as string,
    arguments: message.arguments as string,
  });
  break;
}

// In response.done handler, when executing function calls:
const result = await this.config.functionCallHandler(call.name, call.arguments);
functionCallOutputs.push({
  name: call.name,
  arguments: JSON.parse(call.arguments),
  result,
});
```

#### Step 3: Update Output Structure

Modify the output to include function calls:

```typescript
resolve({
  output: responseTranscript,
  cost,
  metadata: {
    voice: this.config.voice || XAI_VOICE_DEFAULTS.voice,
    durationMs,
    model: this.modelName,
    hasAudio: hasAudioContent,
    // Keep for backwards compatibility
    functionCallResults: functionCallOutputs.length > 0
      ? functionCallOutputs.map(fc => fc.result).filter(Boolean)
      : undefined,
  },
  // NEW: Expose function calls for assertions
  functionCalls: functionCallOutputs.length > 0 ? functionCallOutputs : undefined,
  ...(finalAudioData && {
    audio: { ... },
  }),
});
```

#### Step 4: Update ProviderResponse Type (if needed)

Check if `ProviderResponse` type needs updating to include `functionCalls`. Based on exploration, it appears the output field can contain any data, so this may work without type changes.

#### Step 5: Add Tests

```typescript
describe('Function call output exposure', () => {
  // Note: Full WebSocket tests would require mocking, but we can test the data structure

  it('XAIFunctionCallOutput interface is correctly structured', () => {
    const output: XAIFunctionCallOutput = {
      name: 'set_volume',
      arguments: { level: 50 },
      result: 'success',
    };
    expect(output.name).toBe('set_volume');
    expect(output.arguments.level).toBe(50);
    expect(output.result).toBe('success');
  });
});
```

#### Step 6: Update Documentation

Add documentation for function call assertions:

````markdown
#### Function Call Assertions

When using custom function tools, the xAI Voice provider exposes function call information in the output for use in assertions:

```yaml
providers:
  - id: xai:voice:grok-3
    config:
      tools:
        - type: function
          name: set_volume
          description: Set the device volume
          parameters:
            type: object
            properties:
              level:
                type: number
                description: Volume level (0-100)
            required:
              - level
      functionCallHandler: file://handlers.js

tests:
  - vars:
      question: 'Set the volume to 50%'
    assert:
      # Use javascript assertion to check function calls
      - type: javascript
        value: |
          const calls = output.functionCalls || [];
          return calls.some(c => c.name === 'set_volume' && c.arguments?.level === 50);

      # Or use the tool-call-f1 assertion for function name matching
      - type: tool-call-f1
        value: ['set_volume']
        threshold: 1.0
```
````

The `functionCalls` array contains objects with:

- `name`: The function name that was called
- `arguments`: The parsed arguments object
- `result`: The result returned by your function handler (if any)

````

#### Step 7: Update Example (`examples/xai-voice/`)

Add a function calling example:

```yaml
# promptfooconfig.yaml additions
providers:
  - id: xai:voice:grok-3
    config:
      voice: 'Ara'
      instructions: 'You are a smart home assistant that can control devices.'
      tools:
        - type: function
          name: set_volume
          description: Set the device volume level
          parameters:
            type: object
            properties:
              level:
                type: number
                description: Volume level from 0 to 100
            required:
              - level

tests:
  - vars:
      question: 'Set the volume to 50 percent'
    assert:
      - type: javascript
        value: |
          const calls = output.functionCalls || [];
          return calls.some(c => c.name === 'set_volume');
````

---

## Files to Modify

1. **`src/providers/xai/voice.ts`**
   - Add `websocketUrl` to `XAIVoiceOptions`
   - Add `XAIFunctionCallOutput` interface
   - Update `getWebSocketUrl()` method
   - Track function calls with full details
   - Include `functionCalls` in output

2. **`test/providers/xai/voice.test.ts`**
   - Add tests for `websocketUrl` option
   - Add tests for function call output structure

3. **`site/docs/providers/xai.md`**
   - Document `websocketUrl` option
   - Document function call assertions

4. **`examples/xai-voice/promptfooconfig.yaml`**
   - Add function calling example with assertions

---

## Testing Strategy

### Unit Tests

- Test `websocketUrl` bypasses URL transformation
- Test function call output structure

### Integration Tests (with real API key)

- Test WebSocket connection with default URL
- Test WebSocket connection with custom `websocketUrl`
- Test function call flow and output exposure

### End-to-End Command

```bash
npm run local -- eval -c examples/xai-voice/promptfooconfig.yaml --env-file .env --no-cache
```

---

## Backwards Compatibility

Both changes are backwards compatible:

- `websocketUrl` is optional; existing configs continue to work
- `functionCalls` is a new optional field; `metadata.functionCallResults` is preserved
