# Task: Fix showThinking flag for Qwen thinking models in OpenRouter provider

## Issue Summary

The `showThinking: false` configuration is not working properly for certain Qwen thinking models via OpenRouter, specifically `qwen/qwen3-235b-a22b-thinking-2507`. When users set `showThinking: false`, they expect function calls to be returned without any thinking/reasoning content, but instead they receive the model's thinking process.

**GitHub Issue**: [#5262 - Unable to disable thinking for qwen3-235b-a22b-thinking-2507](https://github.com/promptfoo/promptfoo/issues/5262)

## Problem Analysis

### Root Cause

The issue is in the **logic priority order** in `/src/providers/openrouter.ts` lines 119-132. The current code prioritizes `message.content` over `message.tool_calls`, which causes problems when thinking models return responses containing ALL THREE fields:

- `message.content` (text content)
- `message.reasoning` (thinking process)
- `message.tool_calls` (function calls)

### Current Behavior (Broken)

**Code flow in openrouter.ts lines 119-132:**

```typescript
let output = '';
if (message.content) {
  // 1. Check content first
  output = message.content;
  if (message.reasoning && (this.config.showThinking ?? true)) {
    // 2. Add thinking if enabled
    output = `Thinking: ${message.reasoning}\n\n${output}`;
  }
} else if (message.function_call || message.tool_calls) {
  // 3. ELSE check tool calls
  output = message.function_call || message.tool_calls;
} else if (message.reasoning && (this.config.showThinking ?? true)) {
  output = message.reasoning;
}
```

**What happens with broken model (`qwen/qwen3-235b-a22b-thinking-2507`)**:

1. Model returns: `content` + `reasoning` + `tool_calls`
2. Code takes first branch: sets `output = message.content`
3. Code adds thinking content despite `showThinking: false`
4. **Tool calls are completely ignored** (never reaches `else if`)
5. Result: User sees thinking text instead of tool calls

### Expected Behavior (Desired)

**What should happen:**

1. **Tool calls should ALWAYS take priority** over content/reasoning
2. When `showThinking: false`, no thinking content should ever be shown
3. When tool calls are present, return them directly (never combine with thinking)

**Working models (`qwen/qwen3-coder`, `openai/gpt-5-mini`)**:

- These models return ONLY `tool_calls` with no `content`
- Code reaches the `else if` branch and correctly returns tool calls
- No thinking content is added

## Test Results

Confirmed the issue with end-to-end testing:

| Model                                | Result  | Behavior                                     |
| ------------------------------------ | ------- | -------------------------------------------- |
| `openai/gpt-5-mini`                  | ✅ PASS | Correctly hides thinking, shows tool calls   |
| `qwen/qwen3-coder`                   | ✅ PASS | Correctly hides thinking, shows tool calls   |
| `qwen/qwen3-235b-a22b-thinking-2507` | ❌ FAIL | Shows thinking despite `showThinking: false` |

## Implementation Plan

### Solution: Reorder Logic Priority

**File to modify**: `/src/providers/openrouter.ts`  
**Lines**: 119-132

**Change the logic from:**

```typescript
if (message.content) {
  // Handle content + optional thinking
} else if (message.tool_calls) {
  // Handle tool calls
} else if (message.reasoning) {
  // Handle reasoning fallback
}
```

**To:**

```typescript
if (message.function_call || message.tool_calls) {
  // 1. PRIORITY: Tool calls (never show thinking with tool calls)
} else if (message.content) {
  // 2. Content + optional thinking (respecting showThinking flag)
} else if (message.reasoning) {
  // 3. FALLBACK: Reasoning only (respecting showThinking flag)
}
```

### Detailed Implementation

**Step 1**: Modify the logic order in `src/providers/openrouter.ts`

```typescript
// Prioritize tool calls over all other content types
let output = '';
if (message.function_call || message.tool_calls) {
  // Tool calls always take priority and never include thinking
  output = message.function_call || message.tool_calls;
} else if (message.content) {
  output = message.content;
  // Add reasoning as thinking content if present and showThinking is enabled
  if (message.reasoning && (this.config.showThinking ?? true)) {
    output = `Thinking: ${message.reasoning}\n\n${output}`;
  }
} else if (message.reasoning && (this.config.showThinking ?? true)) {
  // Fallback to reasoning if no content and showThinking is enabled
  output = message.reasoning;
}
```

**Step 2**: Update existing tests in `test/providers/openrouter.test.ts`

Add test cases to ensure:

1. Tool calls are prioritized over content + reasoning
2. `showThinking: false` works with models that return all three fields
3. Existing functionality remains intact

**Step 3**: Add integration test for the specific broken model

Create test case that specifically tests `qwen/qwen3-235b-a22b-thinking-2507` with:

- `showThinking: false`
- Function call prompt
- Assertion that only tool calls are returned (no thinking)

### Risk Assessment

**Low Risk Changes:**

- Only affects OpenRouter provider
- Change is isolated to response processing logic
- Existing tests cover the main scenarios
- The fix aligns with the documented behavior and user expectations

**Validation Plan:**

1. Run existing OpenRouter tests to ensure no regressions
2. Run the debug configuration created during investigation
3. Test multiple thinking models to ensure consistency
4. Verify that `showThinking: true` still works correctly

## Files to Modify

1. **`/src/providers/openrouter.ts`** (lines 119-132)
   - Reorder the logic to prioritize tool calls
2. **`/test/providers/openrouter.test.ts`**
   - Add test case for the specific broken scenario
   - Ensure tool call prioritization is tested

## Expected Outcome

After implementing this fix:

- ✅ `qwen/qwen3-235b-a22b-thinking-2507` will respect `showThinking: false`
- ✅ Tool calls will always take priority over thinking content
- ✅ Function call assertions will pass consistently
- ✅ All existing functionality will remain intact
- ✅ The issue reported in #5262 will be resolved

This fix ensures that promptfoo users can reliably test function calls from thinking models without unwanted reasoning content interfering with their assertions.
