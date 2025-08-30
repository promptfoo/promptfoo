# MCP Tool Call Issue Analysis

## Problem Summary

User reports that when using Azure Chat provider with MCP tools configured, the assistant returns `[object Object]` instead of actual tool results when MCP tools are invoked.

## Root Cause Analysis (Corrected)

After deeper investigation, I've identified the actual root cause:

**ALL chat-based providers (Azure, OpenAI Chat, Anthropic, Google) have the same MCP tool execution gap.**

### How it should work:

1. MCP tools are transformed to provider format and included in the request (✅ Working)
2. LLM identifies and calls the appropriate MCP tools (✅ Working)
3. When tool calls are returned, MCP tools should be executed and results returned (❌ **Missing**)
4. Tool results should be formatted and returned to the user

### What's actually happening:

1. MCP tools are correctly added to the request
2. LLM correctly identifies and calls MCP tools
3. Tool calls are processed by `FunctionCallbackHandler` which doesn't know about MCP tools
4. Since no function callback exists for MCP tools, `FunctionCallbackHandler.processCall()` returns `JSON.stringify(call)` (line 40 in `functionCallbackUtils.ts`)
5. This results in `[object Object]` being displayed to the user

### Key Findings (Post-Audit):

- **Provider patterns are much more diverse** than initially assessed
- **Only 3 providers** actually use `FunctionCallbackHandler`: Azure Chat, Azure Assistant, OpenAI Responses
- **Most providers have custom function callback implementations** with their own patterns
- **OpenAI Responses provider** has special `mcp_call` handling (`openai/responses.ts:428-440`) - different API pattern
- **The issue affects multiple provider families**, each requiring different fixes

## Complete Provider Audit Results

### **Providers Using FunctionCallbackHandler** (3 total):

| Provider         | File                     | MCP Support       | Function Callback Method                   |
| ---------------- | ------------------------ | ----------------- | ------------------------------------------ |
| Azure Chat       | `azure/chat.ts:20`       | ✅ Has MCP client | `functionCallbackHandler.processCalls()`   |
| Azure Assistant  | `azure/assistant.ts`     | ❌ No MCP client  | `functionCallbackHandler` (custom methods) |
| OpenAI Responses | `openai/responses.ts:16` | ❌ No MCP client  | `functionCallbackHandler.processCalls()`   |

### **Providers With Custom Function Callback Logic** (5+ total):

| Provider           | File                    | MCP Support       | Function Callback Method                         |
| ------------------ | ----------------------- | ----------------- | ------------------------------------------------ |
| OpenAI Chat        | `openai/chat.ts:417`    | ✅ Has MCP client | Custom `if (config.functionToolCallbacks)` loop  |
| OpenAI Assistant   | `openai/assistant.ts`   | ❌ No MCP client  | Custom callback preloading + execution           |
| Google Vertex      | `google/vertex.ts:492`  | ✅ Has MCP client | Custom `if (config.functionToolCallbacks)` logic |
| Google Live        | `google/live.ts:465`    | ✅ Has MCP client | Custom callback execution in streaming           |
| Google AI Studio   | `google/ai.studio.ts`   | ✅ Has MCP client | MCP tools added, no callback handling found      |
| Anthropic Messages | `anthropic/messages.ts` | ✅ Has MCP client | MCP tools added, no callback handling found      |

### **Analysis Summary:**

- **Only Azure Chat** currently works with MCP (uses `FunctionCallbackHandler` + has MCP client)
- **5 providers** have MCP tools added but can't execute them due to missing callback integration
- **2 providers** (Google AI Studio, Anthropic) may not support function callbacks at all
- **Each provider family** has completely different callback implementation patterns

## Revised Solution Strategy

### Option 1: Hybrid Approach - Multiple Implementation Strategies (RECOMMENDED)

**Complexity:** High  
**Risk:** Medium  
**Impact:** Complete Fix

Implement MCP tool execution using the most appropriate method for each provider family:

#### **1A: Extend FunctionCallbackHandler** (3 providers)

- **Azure Chat**: ✅ Already works (has both MCP client and FunctionCallbackHandler)
- **Azure Assistant**: Add MCP client, extend FunctionCallbackHandler
- **OpenAI Responses**: Add MCP client, extend FunctionCallbackHandler

#### **1B: Add Custom MCP Logic** (5 providers with custom callbacks)

- **OpenAI Chat**: Add MCP tool detection to existing custom callback loop
- **OpenAI Assistant**: Add MCP tool detection to existing callback system
- **Google Vertex**: Add MCP tool detection to existing custom logic
- **Google Live**: Add MCP tool detection to streaming callback system
- **Google AI Studio**: Investigate and add function callback support if missing
- **Anthropic Messages**: Investigate and add function callback support if missing

**Implementation Priority:**

1. **Phase 1**: Fix FunctionCallbackHandler users (Azure Assistant, OpenAI Responses) - 2 providers
2. **Phase 2**: Fix high-usage custom implementations (OpenAI Chat, Google Vertex) - 2 providers
3. **Phase 3**: Fix remaining providers (Google Live, AI Studio, Anthropic) - 3 providers

**Pros:**

- Addresses the architectural diversity found in audit
- Fixes the issue comprehensively across all providers
- Can be implemented incrementally
- Uses the most appropriate method for each provider

**Cons:**

- High complexity due to multiple implementation patterns
- Requires deep understanding of each provider's callback system
- More testing surface area

### Option 2: Auto-Generate MCP Function Callbacks (Alternative)

**Complexity:** Medium  
**Risk:** Low  
**Impact:** High

Automatically generate function callbacks for MCP tools during provider initialization.

**Why this might be better:**

- **Works with ALL existing patterns** - both `FunctionCallbackHandler` and custom implementations
- **Minimal changes** - providers just need to auto-populate `functionToolCallbacks`
- **Universal solution** - same approach works for all 8 providers

**Implementation:**

1. During MCP client initialization, create wrapper functions for each MCP tool
2. Auto-inject these into the provider's `config.functionToolCallbacks`
3. Existing callback logic (custom or FunctionCallbackHandler) handles execution
4. No changes needed to core callback processing logic

**Pros:**

- Single implementation approach works for all providers
- Leverages existing architecture without modification
- Much lower complexity than hybrid approach
- Lower risk of breaking existing functionality
- Easy to roll out incrementally

**Cons:**

- Less elegant - MCP tools go through function callback indirection
- Harder to provide MCP-specific error formatting (but could work around this)
- May cause confusion about execution paths

### Option 3: Start with User's Immediate Issue (Practical)

**Complexity:** Low  
**Risk:** Low  
**Impact:** Medium

Fix just the user's reported problem (Azure Chat) and learn from implementation.

**Implementation:**

- Azure Chat already has MCP client and uses FunctionCallbackHandler
- Add MCP tool detection to FunctionCallbackHandler
- Verify it works with the user's configuration
- Use learnings to inform broader strategy

**Pros:**

- Addresses immediate user problem
- Lower risk starting point
- Can validate approach before broader rollout
- Quick win to unblock user

**Cons:**

- Doesn't solve the broader systemic issue
- May lead to inconsistent implementation

## Revised Recommendation: Start with Option 3, then Option 2

Based on the audit, I recommend a **pragmatic approach**:

### **Phase 1: Fix User's Immediate Issue (Option 3)**

1. **Target**: Azure Chat provider (user's specific problem)
2. **Method**: Extend FunctionCallbackHandler with MCP support
3. **Benefit**: Quick win, validates approach, unblocks user
4. **Risk**: Low - Azure Chat already uses FunctionCallbackHandler + has MCP client

### **Phase 2: Universal Solution (Option 2)**

1. **Target**: All remaining providers
2. **Method**: Auto-generate MCP function callbacks during initialization
3. **Benefit**: Single approach works for all provider patterns (FunctionCallbackHandler + custom)
4. **Risk**: Low - leverages existing architecture without core changes

### **Why This Approach:**

**Option 2 (Auto-Generate Callbacks) is likely the best long-term solution** because:

- ✅ Works with ALL existing patterns (both FunctionCallbackHandler and custom implementations)
- ✅ Requires minimal changes to existing provider code
- ✅ Much lower complexity than the hybrid approach
- ✅ Can be implemented incrementally across providers
- ✅ No need to understand/modify each provider's unique callback logic

**Starting with Option 3** gives us:

- ✅ Immediate user relief
- ✅ Proof of concept for MCP integration
- ✅ Learning opportunity before broader rollout

### **Immediate Next Steps:**

1. **Implement FunctionCallbackHandler MCP support** (fixes Azure Chat + validates approach)
2. **Test with user's configuration** (Azure + MCP server)
3. **If successful, design auto-callback generation** for remaining providers
4. **Roll out incrementally** to other high-priority providers

This gives us a **practical path forward** that addresses the immediate issue while setting up for a comprehensive solution.

### **Updated Implementation Priority:**

#### **Phase 1** (Immediate - Fix User Issue):

- Azure Chat ✅ (extend FunctionCallbackHandler)

#### **Phase 2** (Short-term - Prove Concept):

- Azure Assistant (add MCP client + use extended FunctionCallbackHandler)
- OpenAI Responses (add MCP client + use extended FunctionCallbackHandler)

#### **Phase 3** (Medium-term - Universal Solution):

- Auto-generate MCP callbacks for: OpenAI Chat, Google Vertex, Google Live
- Investigate: Google AI Studio, Anthropic Messages (may need callback support)

## Priority: High

Start with Phase 1 to unblock the user, then use learnings to inform broader strategy.
