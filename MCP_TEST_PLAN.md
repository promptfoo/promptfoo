# MCP Server Test Plan

## Overview
This test plan comprehensively validates the MCP (Model Context Protocol) server implementation for promptfoo. The MCP server enables AI agents to interact with promptfoo's evaluation capabilities.

## Test Environment Setup

### Prerequisites
- [x] Node.js v22.14.0 installed
- [x] promptfoo project built (`npm run build`)
- [ ] Test database initialized
- [x] Environment variables configured

### Test Data Preparation
- [x] Create test promptfoo config files
- [ ] Prepare test evaluation data
- [ ] Set up test providers (mock API keys)

## Test Categories

### 1. Infrastructure Tests

#### 1.1 Build and Compilation
- [x] Project builds without errors
- [x] TypeScript compilation succeeds
- [x] All imports resolve correctly
- [ ] No circular dependencies

#### 1.2 Transport Layer Tests
- [x] STDIO transport initializes correctly
- [x] HTTP transport starts on specified port
- [x] Health endpoint responds correctly
- [ ] Graceful shutdown works

### 2. Core Functionality Tests

#### 2.1 Tool Registration
- [x] All tools register successfully (12 tools registered)
- [❌] Tool schemas are valid JSON Schema (schemas are empty!)
- [ ] Tool descriptions are present and helpful
- [❌] AbstractTool base class works correctly (argument passing broken)

#### 2.2 Error Handling
- [x] Custom error types work correctly
- [x] Error messages are helpful and actionable
- [ ] Stack traces are preserved in development
- [x] Graceful degradation for missing dependencies

### 3. Individual Tool Tests

#### 3.1 Evaluation Tools
- [x] `list_evaluations` - Lists all evaluations (works with empty args)
- [ ] `list_evaluations` - Filters by dataset ID
- [ ] `list_evaluations` - Pagination works correctly
- [ ] `get_evaluation_details` - Retrieves valid evaluation
- [ ] `get_evaluation_details` - Handles missing evaluation
- [❌] `validate_promptfoo_config` - Validates correct config (argument passing broken)
- [x] `validate_promptfoo_config` - Reports errors clearly

#### 3.2 Execution Tools
- [❌] `test_provider` - Tests valid provider (argument parsing fails)
- [ ] `test_provider` - Handles invalid credentials
- [x] `run_assertion` - Executes assertions correctly (non-refactored tool works)
- [ ] `run_assertion` - Reports failures properly
- [ ] `run_evaluation` - Runs full evaluation
- [ ] `run_evaluation` - Respects filters
- [ ] `share_evaluation` - Creates shareable URL

#### 3.3 Generation Tools
- [❌] `generate_dataset` - Creates test data (argument passing broken)
- [❌] `generate_test_cases` - Generates with assertions (argument passing broken)
- [❌] `compare_providers` - Compares multiple providers (argument passing broken)
- [ ] All generation tools handle rate limits

#### 3.4 Red Team Tools
- [ ] `redteam_generate` - Generates attack vectors
- [ ] `redteam_run` - Executes red team tests
- [ ] Plugin system works correctly
- [ ] Strategy selection works

### 4. Integration Tests

#### 4.1 End-to-End Workflows
- [ ] Complete evaluation workflow
- [ ] Dataset generation to evaluation
- [ ] Provider comparison workflow
- [ ] Red team assessment workflow

#### 4.2 Performance Tests
- [ ] Caching reduces redundant calls
- [ ] Pagination handles large datasets
- [ ] Concurrent operations work correctly
- [ ] Memory usage stays reasonable

### 5. Security Tests

#### 5.1 Input Validation
- [ ] Path traversal prevention
- [ ] SQL injection prevention
- [ ] Command injection prevention
- [ ] Provider ID validation

#### 5.2 Authentication & Authorization
- [ ] Sensitive operations require auth
- [ ] Shared URLs respect privacy settings
- [ ] API keys are not exposed

### 6. Documentation Tests

#### 6.1 User Documentation
- [x] Setup instructions are accurate (npm script added)
- [ ] Tool descriptions match functionality
- [ ] Examples work as documented
- [ ] Troubleshooting section is helpful

#### 6.2 Code Documentation
- [ ] All public APIs are documented
- [ ] Type definitions are complete
- [ ] Examples in JSDoc work

## Test Execution Log

### Date: 2024-01-27

#### Test 1: Build and Basic Functionality
**Status**: ✅ PASS
**Details**: 
- Build succeeds with 0 errors ✅
- MCP command now in package.json scripts ✅
- Can run with: `npm run mcp`

#### Test 2: STDIO Transport
**Status**: ✅ PASS
**Command**: `echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node dist/src/main.js mcp --transport stdio`
**Result**: Successfully lists all 12 tools

#### Test 3: HTTP Transport
**Status**: ✅ PASS
**Commands**:
```bash
node dist/src/main.js mcp --transport http --port 3100 &
curl http://localhost:3100/health
```
**Result**: Health endpoint returns OK

#### Test 4: Tool Schema Validation
**Status**: ❌ FAIL
**Details**:
- ALL refactored tools show empty schema in tools/list
- Non-refactored tools (run_assertion, etc.) show proper schemas
- MCP SDK expects Zod schema object, not JSON Schema

#### Test 5: Error Handling
**Status**: ✅ PASS
**Command**: `validate_promptfoo_config` without config file
**Result**: Clear error message about missing file

#### Test 6: Tool Argument Parsing
**Status**: ❌ CRITICAL FAIL
**Details**:
- MCP SDK passes `{signal: {}, requestId: number}` instead of actual arguments
- All refactored tools receive wrong argument structure
- Non-refactored tools work because they expect different handler signature
- This breaks ALL functionality in refactored tools

#### Test 7: Debug Investigation
**Status**: ✅ COMPLETE
**Finding**: MCP SDK handler receives:
```json
{
  "signal": {},
  "requestId": 6
}
```
Instead of the expected arguments object.

## Critical Issues Found

### 1. MCP SDK Handler Signature Mismatch
The AbstractTool assumes the handler receives arguments directly, but MCP SDK passes a different structure. The non-refactored tools work because they use a different registration pattern.

**Non-refactored (works):**
```typescript
server.tool('name', { /* zod schema fields */ }, async (args) => {
  // args contains the actual arguments
});
```

**Refactored (broken):**
```typescript
server.tool('name', zodSchema, async (args) => {
  // args contains {signal, requestId} instead of actual arguments
});
```

### 2. Schema Registration Format
The MCP SDK expects either:
- An object where each property is a Zod schema (non-refactored approach)
- Or it should properly handle z.object() schemas (needs investigation)

### 3. Missing npm Script (FIXED)
✅ Added `"mcp": "node dist/src/main.js mcp"` to package.json

### 4. Type Safety Issues
- Many `any` types used for complex eval data structures
- Some type assertions that could fail at runtime

## Root Cause Analysis

The refactoring to use AbstractTool introduced a fundamental incompatibility with how the MCP SDK works:

1. **Handler Signature**: The MCP SDK doesn't pass arguments directly to the handler
2. **Schema Format**: The SDK expects a different schema structure than what AbstractTool provides
3. **Registration Pattern**: The working tools use a different registration pattern that's incompatible with the AbstractTool approach

## Recommendations

### CRITICAL: Revert or Fix AbstractTool

The current AbstractTool implementation is fundamentally broken. Options:

1. **Revert to Direct Registration** (Recommended)
   - Remove AbstractTool usage from all tools
   - Use the working pattern from run_assertion
   - Keep the good parts (error handling, utilities)

2. **Fix AbstractTool** (Complex)
   - Research correct MCP SDK handler signature
   - Update to handle the actual argument structure
   - Fix schema registration format

3. **Hybrid Approach**
   - Keep AbstractTool for shared utilities
   - Use direct registration for MCP compatibility
   - Don't use AbstractTool.register()

### Additional Fixes

1. **Testing**
   - Add integration tests with actual MCP protocol
   - Test with real MCP clients (Cursor, etc.)
   - Add unit tests for argument handling

2. **Documentation**
   - Document the MCP SDK quirks
   - Provide working examples
   - Add troubleshooting guide

3. **Type Safety**
   - Create proper interfaces for eval data
   - Remove unnecessary `any` types
   - Add runtime validation

## Final Assessment

**Current Status**: ❌ **FUNDAMENTALLY BROKEN - DO NOT MERGE**

The MCP server implementation has a critical architectural flaw that prevents any tool using AbstractTool from working. While the non-refactored tools function correctly, the attempt to create a cleaner abstraction with AbstractTool introduced a breaking incompatibility with the MCP SDK.

**Required Actions Before Merge:**
1. Fix or revert the AbstractTool pattern
2. Ensure all tools can receive and process arguments
3. Fix schema registration for all tools
4. Add comprehensive integration tests
5. Test with actual MCP clients

The implementation shows good architectural thinking but lacks understanding of the MCP SDK's actual behavior. This could have been caught with proper integration testing or by studying the SDK documentation/examples more carefully. 