# Issue #3099: Dynamic Tool Definitions - Implementation Plan

## Overview

**Issue**: [Support for dynamic external tool call Definitions - i.e. Python, TS, JS #3099](https://github.com/promptfoo/promptfoo/issues/3099)

**Status**: Core feature implemented in PR #6272. This plan addresses remaining gaps:
1. Missing `vars` parameter in Anthropic, Bedrock, and Adaline Gateway providers
2. Documentation and testing improvements

---

## Background

### Feature Summary

PR #6272 added support for loading tool definitions from Python/JavaScript files:

```yaml
providers:
  - id: openai:chat:gpt-4
    config:
      # Static files (existing)
      tools: file://./tools.yaml

      # Dynamic scripts (new in PR #6272)
      tools: file://./tools.py:get_tools
      tools: file://./tools.js:getTools
```

### Current Implementation

The `maybeLoadToolsFromExternalFile` function in `src/util/index.ts:672-812`:
- Parses `file://path:function_name` syntax
- Executes Python via `runPython(absPath, functionName, [])`
- Executes JavaScript via `importModule(absPath)` then `fn()`
- Validates return type (must be array/object)
- Falls back to static file loading for JSON/YAML

---

## Problem Statement

Three providers call `maybeLoadToolsFromExternalFile` without passing `vars`, preventing Nunjucks template rendering in tool file paths:

| Provider | File | Line | Current |
|----------|------|------|---------|
| Anthropic | `src/providers/anthropic/messages.ts` | 103 | `maybeLoadToolsFromExternalFile(config.tools)` |
| Bedrock | `src/providers/bedrock/index.ts` | 1317, 1521, 1908 | `maybeLoadToolsFromExternalFile(config?.tools)` |
| Adaline | `src/providers/adaline.gateway.ts` | 424 | `maybeLoadToolsFromExternalFile(_config.tools)` |

**Impact**: Users cannot use variable interpolation in tool file paths:
```yaml
# This works with OpenAI but NOT Anthropic/Bedrock:
tools: file://./tools_{{ env }}.py:get_tools
```

---

## Implementation Plan

### Phase 1: Fix Anthropic Provider

#### 1.1 Code Change

**File**: `src/providers/anthropic/messages.ts`

**Current** (line 103):
```typescript
const configTools = (await maybeLoadToolsFromExternalFile(config.tools)) || [];
```

**Updated**:
```typescript
const configTools = (await maybeLoadToolsFromExternalFile(config.tools, context?.vars)) || [];
```

#### 1.2 Verification

Check that `context` is available at line 103. Looking at the function signature:
```typescript
async callApi(
  prompt: string,
  context?: CallApiContextParams,
  callApiOptions?: CallApiOptionsParams,
): Promise<ProviderResponse>
```

Yes, `context` is available as a parameter.

---

### Phase 2: Fix Bedrock Provider

#### 2.1 Architecture Overview

The Bedrock provider uses a handler pattern with model-specific `params` functions:

```typescript
// Line 2228: callApi has access to context
async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
  // ...
  // Line 2243: But params() doesn't receive context
  const params = await model.params(config, prompt, stop, modelName);
}
```

The `params` functions (lines ~1260, ~1491, ~1840) have signature:
```typescript
params: async (config, prompt, stop?, modelName?) => {...}
```

**Problem**: `context?.vars` is available in `callApi` but not passed to `params`.

#### 2.2 Code Changes

**Change 1: Update params function signatures** (3 locations)

Add `vars` as 5th parameter to all model handler `params` functions:

```typescript
// CLAUDE_MESSAGES handler (line ~1260)
params: async (
  config: BedrockClaudeMessagesCompletionOptions,
  prompt: string,
  stop?: string[],
  _modelName?: string,
  vars?: Record<string, string | object>,  // ADD THIS
) => {
  // ...
  await maybeLoadToolsFromExternalFile(config?.tools, vars),  // ADD vars
  // ...
}

// COHERE_COMMAND_R handler (line ~1491)
params: async (
  config: BedrockCohereCommandRGenerationOptions,
  prompt: string,
  stop?: string[],
  _modelName?: string,
  vars?: Record<string, string | object>,  // ADD THIS
) => {
  // ...
  await maybeLoadToolsFromExternalFile(config?.tools, vars),  // ADD vars
  // ...
}

// QWEN handler (line ~1840)
params: async (
  config: BedrockQwenCompletionOptions,
  prompt: string,
  stop?: string[],
  _modelName?: string,
  vars?: Record<string, string | object>,  // ADD THIS
) => {
  // ...
  await maybeLoadToolsFromExternalFile(config?.tools, vars),  // ADD vars
  // ...
}
```

**Change 2: Update call site** (line 2243)

```typescript
// Current
const params = await model.params(
  { ...this.config, ...context?.prompt.config },
  prompt,
  stop,
  this.modelName,
);

// Updated
const params = await model.params(
  { ...this.config, ...context?.prompt.config },
  prompt,
  stop,
  this.modelName,
  context?.vars,  // ADD THIS
);
```

**Change 3: Update TypeScript type for params function**

If there's a type definition for the handler object, update it to include the optional `vars` parameter.

#### 2.3 Other handlers to check

Search for other handlers with `maybeLoadToolsFromExternalFile` that may need updating:
- CLAUDE_COMPLETION
- CLAUDE_MESSAGES
- COHERE_COMMAND_R
- LLAMA
- MISTRAL
- QWEN

Not all handlers have tools support - only update those that call `maybeLoadToolsFromExternalFile`.

#### 2.4 Note: bedrock/converse.ts is already correct

The `src/providers/bedrock/converse.ts` file already correctly passes `vars`:
```typescript
// Line 796 - already correct!
const tools = await maybeLoadToolsFromExternalFile(this.config.tools, vars);
```

Only `src/providers/bedrock/index.ts` needs fixes.

---

### Phase 3: Fix Adaline Gateway Provider (Lower Priority)

#### 3.1 Code Change

**File**: `src/providers/adaline.gateway.ts`

**Current** (line 424):
```typescript
gatewayTools = _config.tools
  ? ((await maybeLoadToolsFromExternalFile(_config.tools)) as GatewayToolType[])
  : [];
```

**Updated**:
```typescript
gatewayTools = _config.tools
  ? ((await maybeLoadToolsFromExternalFile(_config.tools, context?.vars)) as GatewayToolType[])
  : [];
```

---

## Detailed Implementation Steps

### Step 1: Create Feature Branch

```bash
git checkout main && git pull origin main
git checkout -b fix/dynamic-tools-vars-anthropic-bedrock
```

### Step 2: Update Anthropic Provider

1. Open `src/providers/anthropic/messages.ts`
2. Find line 103 (or search for `maybeLoadToolsFromExternalFile`)
3. Add `context?.vars` as second parameter
4. Save file

### Step 3: Update Bedrock Provider

1. Open `src/providers/bedrock/index.ts`
2. Search for all occurrences of `maybeLoadToolsFromExternalFile`
3. For each occurrence:
   - Determine if `vars` or `context?.vars` is in scope
   - If not, may need to pass it through function parameters
4. Update all three call sites
5. Save file

### Step 4: Update Tests

#### 4.1 Anthropic Tests

**File**: `test/providers/anthropic.test.ts` or create new test file

Add test case:
```typescript
describe('maybeLoadToolsFromExternalFile with vars', () => {
  it('should render variables in tool file paths for Anthropic', async () => {
    // Mock the file system and runPython
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const mockTools = [{ name: 'test_tool', input_schema: {} }];
    vi.mocked(runPython).mockResolvedValue(mockTools);

    const provider = new AnthropicMessagesProvider('claude-sonnet-4-20250514', {
      config: {
        tools: 'file://./tools_{{ env }}.py:get_tools',
      },
    });

    // Call with vars
    await provider.callApi('test prompt', { vars: { env: 'production' } });

    // Verify the path was rendered with vars
    expect(runPython).toHaveBeenCalledWith(
      expect.stringContaining('tools_production.py'),
      'get_tools',
      []
    );
  });
});
```

#### 4.2 Bedrock Tests

**File**: `test/providers/bedrock/index.test.ts`

Add similar test cases for Bedrock provider.

### Step 5: Run Existing Tests

```bash
# Run Anthropic tests
npx vitest run test/providers/anthropic.test.ts

# Run Bedrock tests
npx vitest run test/providers/bedrock/index.test.ts

# Run util tests (maybeLoadToolsFromExternalFile)
npx vitest run test/util/index.test.ts
```

### Step 6: Lint and Format

```bash
npm run l && npm run f
```

---

## End-to-End QA Plan

### QA Environment Setup

1. Create test directory:
```bash
mkdir -p /tmp/promptfoo-tools-test
cd /tmp/promptfoo-tools-test
```

2. Create Python tool generator:
```python
# tools.py
def get_tools():
    return [
        {
            "name": "get_weather",
            "description": "Get weather for a location",
            "input_schema": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "City name"
                    }
                },
                "required": ["location"]
            }
        }
    ]

def get_tools_with_env(env="default"):
    """Parameterized version for future enhancement"""
    return get_tools()
```

3. Create JavaScript tool generator:
```javascript
// tools.js
export function getTools() {
  return [
    {
      type: "function",
      function: {
        name: "get_weather",
        description: "Get weather for a location",
        parameters: {
          type: "object",
          properties: {
            location: { type: "string" }
          },
          required: ["location"]
        }
      }
    }
  ];
}
```

4. Create environment-specific tool files for vars testing:
```python
# tools_dev.py
def get_tools():
    return [{"name": "dev_tool", "description": "Dev environment tool", "input_schema": {"type": "object"}}]

# tools_prod.py
def get_tools():
    return [{"name": "prod_tool", "description": "Prod environment tool", "input_schema": {"type": "object"}}]
```

### Test Case 1: Anthropic - Basic Python Tool Loading

**Config** (`test-anthropic-basic.yaml`):
```yaml
description: Anthropic basic Python tool loading

providers:
  - id: anthropic:messages:claude-sonnet-4-20250514
    config:
      tools: file://./tools.py:get_tools

prompts:
  - What's the weather in Boston?

tests:
  - vars: {}
    assert:
      - type: is-valid-openai-tools-call
```

**Run**:
```bash
npm run local -- eval -c test-anthropic-basic.yaml --env-file .env --no-cache -o output-anthropic-basic.json
```

**Expected**:
- No errors loading tools
- Model returns tool_use response for weather

### Test Case 2: Anthropic - JavaScript Tool Loading

**Config** (`test-anthropic-js.yaml`):
```yaml
description: Anthropic JavaScript tool loading

providers:
  - id: anthropic:messages:claude-sonnet-4-20250514
    config:
      tools: file://./tools.js:getTools

prompts:
  - What's the weather in Boston?

tests:
  - vars: {}
    assert:
      - type: is-valid-openai-tools-call
```

**Run**:
```bash
npm run local -- eval -c test-anthropic-js.yaml --env-file .env --no-cache -o output-anthropic-js.json
```

### Test Case 3: Anthropic - Variable Interpolation in Path

**Config** (`test-anthropic-vars.yaml`):
```yaml
description: Anthropic with variable interpolation in tool path

providers:
  - id: anthropic:messages:claude-sonnet-4-20250514
    config:
      tools: file://./tools_{{ env }}.py:get_tools

prompts:
  - Describe the available tools

tests:
  - vars:
      env: dev
    assert:
      - type: contains
        value: dev_tool

  - vars:
      env: prod
    assert:
      - type: contains
        value: prod_tool
```

**Run**:
```bash
npm run local -- eval -c test-anthropic-vars.yaml --env-file .env --no-cache -o output-anthropic-vars.json
```

**Expected**:
- First test loads `tools_dev.py` and sees `dev_tool`
- Second test loads `tools_prod.py` and sees `prod_tool`

### Test Case 4: Bedrock - Basic Python Tool Loading

**Config** (`test-bedrock-basic.yaml`):
```yaml
description: Bedrock basic Python tool loading

providers:
  - id: bedrock:anthropic.claude-3-5-sonnet-20241022-v2:0
    config:
      region: us-west-2
      tools: file://./tools.py:get_tools

prompts:
  - What's the weather in Boston?

tests:
  - vars: {}
    assert:
      - type: is-valid-openai-tools-call
```

**Run**:
```bash
npm run local -- eval -c test-bedrock-basic.yaml --env-file .env --no-cache -o output-bedrock-basic.json
```

### Test Case 5: Bedrock - Variable Interpolation

**Config** (`test-bedrock-vars.yaml`):
```yaml
description: Bedrock with variable interpolation in tool path

providers:
  - id: bedrock:anthropic.claude-3-5-sonnet-20241022-v2:0
    config:
      region: us-west-2
      tools: file://./tools_{{ env }}.py:get_tools

prompts:
  - Describe the available tools

tests:
  - vars:
      env: dev
    assert:
      - type: contains
        value: dev_tool
```

**Run**:
```bash
npm run local -- eval -c test-bedrock-vars.yaml --env-file .env --no-cache -o output-bedrock-vars.json
```

### Test Case 6: Error Handling - Missing Function Name

**Config** (`test-error-no-function.yaml`):
```yaml
description: Test error handling for missing function name

providers:
  - id: anthropic:messages:claude-sonnet-4-20250514
    config:
      tools: file://./tools.py  # Missing :get_tools

prompts:
  - Test

tests:
  - vars: {}
```

**Expected**: Clear error message indicating function name is required.

### Test Case 7: Error Handling - Invalid Return Type

Create `bad_tools.py`:
```python
def get_tools():
    return "not an array"  # Invalid - should be array/object
```

**Config** (`test-error-bad-return.yaml`):
```yaml
description: Test error handling for invalid return type

providers:
  - id: anthropic:messages:claude-sonnet-4-20250514
    config:
      tools: file://./bad_tools.py:get_tools

prompts:
  - Test

tests:
  - vars: {}
```

**Expected**: Clear error message about invalid return type.

### Test Case 8: Async JavaScript Function

Create `async_tools.js`:
```javascript
export async function getTools() {
  // Simulate async operation (e.g., fetching from API)
  await new Promise(resolve => setTimeout(resolve, 100));
  return [
    {
      name: "async_tool",
      description: "Tool loaded asynchronously",
      input_schema: { type: "object" }
    }
  ];
}
```

**Config** (`test-async-js.yaml`):
```yaml
description: Test async JavaScript tool loading

providers:
  - id: anthropic:messages:claude-sonnet-4-20250514
    config:
      tools: file://./async_tools.js:getTools

prompts:
  - Describe available tools

tests:
  - vars: {}
    assert:
      - type: contains
        value: async_tool
```

---

## QA Checklist

### Unit Tests
- [ ] `npm run test` passes
- [ ] `npx vitest run test/providers/anthropic.test.ts` passes
- [ ] `npx vitest run test/providers/bedrock/index.test.ts` passes
- [ ] `npx vitest run test/util/index.test.ts` passes

### Integration Tests
- [ ] Test Case 1: Anthropic basic Python tools
- [ ] Test Case 2: Anthropic JavaScript tools
- [ ] Test Case 3: Anthropic variable interpolation (NEW FUNCTIONALITY)
- [ ] Test Case 4: Bedrock basic Python tools
- [ ] Test Case 5: Bedrock variable interpolation (NEW FUNCTIONALITY)
- [ ] Test Case 6: Error - missing function name
- [ ] Test Case 7: Error - invalid return type
- [ ] Test Case 8: Async JavaScript function

### Regression Tests
- [ ] Existing OpenAI tool tests still pass
- [ ] Existing Azure tool tests still pass
- [ ] Static YAML/JSON tool loading still works
- [ ] Inline tool definitions still work

### Lint & Format
- [ ] `npm run lint` passes
- [ ] `npm run format:check` passes

---

## PR Checklist

- [ ] Branch created from latest main
- [ ] Code changes complete for Anthropic
- [ ] Code changes complete for Bedrock
- [ ] Unit tests added/updated
- [ ] All tests pass
- [ ] Lint and format pass
- [ ] Manual QA completed
- [ ] PR title follows convention: `fix(providers): add vars support to dynamic tool loading for Anthropic and Bedrock`
- [ ] PR description includes:
  - Summary of changes
  - Link to issue #3099
  - Test plan

---

## Future Enhancements (Out of Scope)

1. **Pass context to tool scripts**: Currently Python/JS functions receive no arguments. Could pass `{ vars, config, provider }` context object.

2. **Adaline Gateway**: Lower priority, can be addressed in follow-up PR.

3. **Add tool support to more providers**: Mistral, Cohere, LiteLLM, etc.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/providers/anthropic/messages.ts` | Line 103: Add `context?.vars` to `maybeLoadToolsFromExternalFile` call |
| `src/providers/bedrock/index.ts` | Lines ~1260, ~1491, ~1840: Add `vars` param to handler signatures |
| `src/providers/bedrock/index.ts` | Lines ~1317, ~1521, ~1908: Pass `vars` to `maybeLoadToolsFromExternalFile` |
| `src/providers/bedrock/index.ts` | Line ~2243: Pass `context?.vars` to `model.params()` call |
| `test/providers/anthropic.test.ts` | Add vars interpolation test |
| `test/providers/bedrock/index.test.ts` | Add vars interpolation test |

### Exact Line References (verify before editing)

**Anthropic** (`src/providers/anthropic/messages.ts`):
- Line 103: `maybeLoadToolsFromExternalFile(config.tools)` → add `, context?.vars`

**Bedrock** (`src/providers/bedrock/index.ts`):
- Line ~1260: CLAUDE_MESSAGES params function signature
- Line ~1317: First `maybeLoadToolsFromExternalFile` call
- Line ~1491: COHERE_COMMAND_R params function signature
- Line ~1521: Second `maybeLoadToolsFromExternalFile` call
- Line ~1840: QWEN params function signature
- Line ~1908: Third `maybeLoadToolsFromExternalFile` call
- Line ~2243: `model.params()` call site

---

## Provider Support Matrix (Reference)

### Full Support (Direct)
- OpenAI (chat, responses, realtime, assistant)
- Anthropic (after this fix)
- Azure (chat, responses, assistant, foundry-agent)
- Google (AI Studio, Vertex, Live)
- Bedrock (after this fix)
- xAI responses
- Ollama
- Adaline Gateway (needs fix)

### Full Support (Inherited via OpenAiChatCompletionProvider)
- Groq, Perplexity, Cerebras, OpenRouter, xAI chat
- DeepSeek, Databricks, Portkey, LlamaApi
- Helicone, Alibaba, TrueFoundry, Cloudera
- Cloudflare AI, Snowflake, Hyperbolic, JFrog, Docker

### No Tool Support
- Mistral, Cohere, LiteLLM, Replicate, AI21
- WatsonX, TogetherAI, Envoy, FAL, LocalAI, Llama
