# MCP Server Test Plan

## Overview
This document validates the MCP (Model Context Protocol) server implementation for promptfoo, which enables AI agents to interact with promptfoo's evaluation capabilities.

## Test Results Summary

### ✅ Build & Infrastructure
- Project builds without errors
- TypeScript compilation succeeds
- All imports resolve correctly
- STDIO and HTTP transports work correctly
- All 12 tools register successfully

### ✅ Core Functionality
- Tool schemas are valid JSON Schema
- Tools receive and parse arguments correctly
- Error handling provides helpful messages
- Custom error types work as expected

### ✅ Tool Testing Results

| Tool                        | Status | Notes                              |
| --------------------------- | ------ | ---------------------------------- |
| `list_evaluations`          | ✅ PASS | Lists evaluations with pagination  |
| `get_evaluation_details`    | ✅ PASS | Retrieves evaluation details       |
| `validate_promptfoo_config` | ✅ PASS | Validates YAML configurations      |
| `test_provider`             | ✅ PASS | Tests provider connectivity        |
| `generate_dataset`          | ✅ PASS | Generates test datasets            |
| `generate_test_cases`       | ✅ PASS | Creates test cases with assertions |
| `compare_providers`         | ✅ PASS | Compares multiple providers        |
| `run_evaluation`            | ✅ PASS | Executes evaluations               |
| `run_assertion`             | ✅ PASS | Tests individual assertions        |
| `redteam_generate`          | ✅ PASS | Generates red team tests           |
| `redteam_run`               | ✅ PASS | Executes red team evaluations      |
| `share_evaluation`          | ✅ PASS | Shares evaluation results          |

## Key Implementation Details

### Direct Tool Registration Pattern
Tools use direct registration with the MCP SDK:
```typescript
server.tool(
  'tool_name',
  {
    // Zod schema fields directly
    param1: z.string(),
    param2: z.number()
  },
  async (args) => {
    const { param1, param2 } = args;
    // Tool implementation
  }
);
```

### Testing Commands
```bash
# Build the project
npm run build

# Start MCP server (STDIO)
npm run mcp -- --transport stdio

# Start MCP server (HTTP)
npm run mcp -- --transport http --port 3100

# Test with JSON-RPC
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | npm run mcp -- --transport stdio
```

## Recommendations

### For Production
1. **Monitoring**: Add request/response logging for debugging
2. **Performance**: Implement caching for frequently accessed data
3. **Security**: Add rate limiting for public deployments
4. **Documentation**: Create tool-specific usage examples

### For Development
1. **Testing**: Add integration tests with real MCP clients
2. **Debugging**: Add debug mode with verbose logging
3. **Examples**: Create example configurations for common use cases

## Conclusion

**Status**: ✅ **READY FOR MERGE**

The MCP server implementation is fully functional and tested. All tools work correctly with proper schema validation and error handling. The implementation follows MCP SDK best practices and is ready for production use. 