# Task: Investigating GitHub Issue #5327 - Crescendo Strategy Chat Template Bug

## Issue Summary

The Crescendo red team strategy is incorrectly serializing multi-turn conversations when using chat templates with `_conversation`. Instead of maintaining proper chat message structure, it's injecting the entire prior conversation as a JSON string into a single `user.content` field on turn 3 and later.

## Problem Description

### Expected Behavior
```json
{
  "messages": [
    {"role": "system", "content": "...policy..."},
    {"role": "user", "content": "<attack #1>"},
    {"role": "assistant", "content": "<model reply #1>"},
    {"role": "user", "content": "<attack #2>"}
  ]
}
```

### Actual Behavior (Turn 3+)
```json
{
  "messages": [
    {
      "role": "user", 
      "content": "[{\"role\":\"system\",\"content\":\"...policy...\"},{\"role\":\"user\",\"content\":\"<attack #1>\"},{\"role\":\"assistant\",\"content\":\"<model reply #1>\"},{\"role\":\"user\",\"content\":\"<attack #2>\"}]"
    }
  ]
}
```

## Environment Details
- **promptfoo version**: 0.117.3
- **Node.js version**: 22.13  
- **OS**: Ubuntu 22.04
- **Provider**: ollama:chat:llama3.1:8b (provider-agnostic issue)
- **Strategy**: Crescendo (GOAT also affected)
- **Template**: Chat template using `_conversation`

## Reproduction Setup

### prompt.json Template
```json
[
  {
    "role": "system",
    "content": {{ policy_text | dump }}
  },
  {% for completion in _conversation %}
    {
      "role": "user",
      "content": {{ completion.prompt[completion.prompt.length - 1].content | dump }}
    },
    {
      "role": "assistant", 
      "content": {{ completion.output | dump }}
    },
  {% endfor %}
  {
    "role": "user",
    "content": {{ user_input | dump }}
  }
]
```

### promptfooconfig.yaml
```yaml
description: Multi-turn conversation evaluation and testing
prompts:
  - id: file://prompt.json
    label: multi-turn-conversation
providers:
  - id: ollama:chat:llama3.1:8b
    label: llama31-8b
redteam:
  injectVar: user_input
  purpose: "Chatbot conforme à la policy ci-dessus"
  language: "French"
  numTests: 1
  plugins:
    - id: policy
      numTests: 1
      config:
        policy: "{{ policy_text }}"
  strategies:
    - id: crescendo
      config:
        maxTurns: 5
        stateful: false
        continueAfterSuccess: false
```

## Investigation Plan

1. **Examine Crescendo Strategy Implementation**
   - Locate strategy files in `/src/redteam/strategies/`
   - Understand how Crescendo builds multi-turn conversations
   - Compare with working strategies like mischievous-user

2. **Investigate Chat Template Processing**
   - Find template rendering logic
   - Understand how `_conversation` variable is populated
   - Trace message serialization flow

3. **Identify Message Structure Handling**
   - Look for provider message formatting
   - Find where JSON serialization occurs incorrectly
   - Understand difference between turn 1-2 vs turn 3+

4. **Root Cause Analysis**
   - Determine why conversation history gets re-serialized as JSON string
   - Identify the specific code path causing the issue
   - Understand timing/condition that triggers the bug

5. **Solution Design**
   - Propose fix to maintain proper chat message structure
   - Consider configuration options for consistent behavior
   - Ensure backward compatibility

## Key Questions to Answer

1. Why does the issue only appear on turn 3+ and not earlier turns?
2. What's different about how Crescendo processes conversations vs mischievous-user?
3. Where in the code does the JSON string injection occur?
4. Is this intentional behavior for injection testing or a bug?
5. How can we ensure consistent structured chat messages across all turns?

## Root Cause Analysis

### The Problem
The issue occurs in `/src/redteam/providers/crescendo/index.ts` in the `sendPrompt` method at **lines 686-687**:

```typescript
const conversationHistory = this.memory.getConversation(this.targetConversationId);
const targetPrompt = this.stateful ? renderedPrompt : JSON.stringify(conversationHistory);
```

### Timeline of the Bug

1. **Turn 1**: Template renders properly, `conversationHistory` is empty, `renderedPrompt` is used
2. **Turn 2**: Template renders with `_conversation[0]`, works correctly  
3. **Turn 3+**: **BUG OCCURS** - When `stateful: false` (the default), the entire `conversationHistory` array gets `JSON.stringify()`'d and sent as a single string instead of structured messages

### Detailed Flow

1. **Template Rendering**: The chat template with `_conversation` renders correctly to structured JSON
2. **Memory Storage**: Messages are stored in `this.memory` as proper `{role, content}` objects
3. **Provider Call**: Instead of using the structured `renderedPrompt`, Crescendo uses `JSON.stringify(conversationHistory)` which converts the entire message array into a string
4. **Provider Receives**: A single JSON blob as `user.content` instead of structured chat messages

### Why Mischievous-User Doesn't Have This Issue
- Mischievous-User extends `SimulatedUser` which has the same `JSON.stringify` pattern in lines 84-86
- **BUT**: Mischievous-User doesn't use `_conversation` templates, so there's no double serialization
- It builds messages programmatically without the template system

### The Core Issue
**Double Serialization**: The template system renders a JSON structure, which then gets JSON.stringify'd again, resulting in a JSON string inside a JSON structure.

```
Template renders: [{"role":"system",...}, {"role":"user",...}]
JSON.stringify(): "[{\"role\":\"system\",...}, {\"role\":\"user\",...}]" (as string)
Final payload: {"messages":[{"role":"user","content":"[{\"role\":\"system\",...}]"}]}
```

## Proposed Solutions

### Solution 1: Detect JSON Structure (Recommended)
Modify `sendPrompt` in `/src/redteam/providers/crescendo/index.ts`:

```typescript
const conversationHistory = this.memory.getConversation(this.targetConversationId);
let targetPrompt: string;

if (this.stateful) {
  targetPrompt = renderedPrompt;
} else {
  // Check if renderedPrompt is already a JSON chat structure
  try {
    const parsed = JSON.parse(renderedPrompt);
    if (Array.isArray(parsed) && parsed.every(msg => msg.role && msg.content)) {
      // It's already a structured chat array, use it directly
      targetPrompt = renderedPrompt;
    } else {
      // It's not a chat structure, use conversation history
      targetPrompt = JSON.stringify(conversationHistory);
    }
  } catch {
    // Not valid JSON, use conversation history
    targetPrompt = JSON.stringify(conversationHistory);
  }
}
```

### Solution 2: Configuration Flag
Add a config option `useChatTemplate: boolean` to force using the rendered template:

```typescript
const targetPrompt = this.stateful || this.config.useChatTemplate 
  ? renderedPrompt 
  : JSON.stringify(conversationHistory);
```

### Solution 3: Template Detection
Detect if the original prompt uses `_conversation` and handle accordingly:

```typescript
const usesConversationTemplate = originalPrompt.raw.includes('_conversation');
const targetPrompt = this.stateful || usesConversationTemplate 
  ? renderedPrompt 
  : JSON.stringify(conversationHistory);
```

## Files Involved
- `/src/redteam/providers/crescendo/index.ts` - Main bug location (lines 686-687)
- `/src/providers/simulatedUser.ts` - Similar pattern but not affected (lines 84-86) 
- `/src/evaluator.ts` - Where `_conversation` variable is populated
- `/src/evaluatorHelpers.ts` - Template rendering logic

## Success Criteria

- [x] Understand the exact code path causing the issue
- [x] Identify root cause of JSON string injection  
- [x] Propose concrete solution to maintain chat structure
- [x] Document findings and recommendations