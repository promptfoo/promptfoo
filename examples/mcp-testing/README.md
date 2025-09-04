# MCP Server Testing & Validation Suite

This directory contains comprehensive testing configurations for validating MCP (Model Context Protocol) servers, particularly focusing on remote servers with authentication and security testing for read-only implementations.

## 📋 Quick Start

1. **Set up environment variables** in `.env`:
   ```bash
   cp .env.example .env
   # Edit .env with your actual values
   ```

2. **Run the interactive test script**:
   ```bash
   ./run-tests.sh
   ```

## 🎯 Problem Solutions

Based on the Discord conversation issues:

### Issue 1: Raw JSON Responses
**Problem**: Getting `{"type":"function","function":{"name":"namespaces_list"}}` instead of actual data

**Solution**: Use the custom provider approach with `mcp-agent-provider`:
```bash
# Clone and setup
git clone https://github.com/promptfoo/mcp-agent-provider.git
cd mcp-agent-provider
npm install

# Use custom-provider-config.yaml
npx promptfoo eval -c ../pf2/examples/mcp-testing/custom-provider-config.yaml
```

### Issue 2: 424 Failed Dependency Error
**Problem**: `Error retrieving tool list from MCP server`

**Solution**: Ensure proper authentication headers in configuration:
```yaml
mcpServers:
  - url: 'https://your-server.com/mcp'
    name: 'my-mcp-server'
    headers:
      'x-api-key': '${MCP_API_KEY}'
      'Authorization': 'Bearer ${MCP_AUTH_TOKEN}'
```

### Issue 3: Testing Read-Only Restrictions
**Problem**: Need to verify server rejects write operations

**Solution**: Use `k8s-mcp-redteam.yaml` which includes comprehensive write-operation tests

## 📁 Configuration Files

| File                          | Purpose                                    | When to Use                                      |
| ----------------------------- | ------------------------------------------ | ------------------------------------------------ |
| `mcp-remote-config.yaml`      | Basic remote MCP server testing            | Initial connectivity and functional testing      |
| `custom-provider-config.yaml` | Full-featured testing with custom provider | **Recommended** for remote servers with auth     |
| `mcp-redteam-config.yaml`     | General security vulnerability testing     | Security assessment of any MCP server            |
| `k8s-mcp-redteam.yaml`        | Kubernetes-specific red team testing       | Testing K8s MCP servers for unauthorized actions |

## 🚀 Testing Workflow

### Step 1: Basic Connectivity
```bash
# Test if your server is reachable
curl -X POST https://your-mcp-server.com/mcp \
  -H "x-api-key: your-key" \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

### Step 2: Functional Testing
```bash
# Using custom provider (recommended)
npx promptfoo eval -c custom-provider-config.yaml
```

### Step 3: Security Testing
```bash
# Run comprehensive red team tests
npx promptfoo redteam run -c k8s-mcp-redteam.yaml
```

### Step 4: Analyze Results
```bash
# View in web UI
npx promptfoo view

# Export results
npx promptfoo export -o results.json
```

## 🔍 Test Coverage

### Functional Tests
- ✅ MCP server connectivity
- ✅ Tool discovery and listing
- ✅ Basic tool invocation
- ✅ Authentication validation
- ✅ Error handling
- ✅ Rate limiting behavior

### Security Tests (Red Team)
- 🛡️ Write operation rejection
- 🛡️ Privilege escalation attempts
- 🛡️ Command injection
- 🛡️ Secret/credential exposure
- 🛡️ Cross-namespace access
- 🛡️ Tool discovery attacks
- 🛡️ Social engineering attempts
- 🛡️ Resource exhaustion
- 🛡️ Function manipulation
- 🛡️ Parameter injection

## 📊 Interpreting Results

### Success Indicators
- ✅ All read operations work correctly
- ✅ Write operations are properly rejected
- ✅ No sensitive data exposed
- ✅ Authentication is enforced
- ✅ Rate limiting is active

### Failure Indicators
- ❌ Write operations succeed (for read-only servers)
- ❌ Secrets/tokens exposed in responses
- ❌ Unauthorized namespace access
- ❌ Command injection successful
- ❌ Authentication bypass possible

## 🛠️ Troubleshooting

### Common Errors

| Error                                        | Solution                                    |
| -------------------------------------------- | ------------------------------------------- |
| `Failed to connect to MCP server: undefined` | Check server URL in config                  |
| `The "file" argument must be of type string` | Use HTTP transport for remote servers       |
| `424 Failed Dependency`                      | Verify auth headers and server availability |
| Raw JSON in response                         | Use custom provider approach                |
| `ERR_INVALID_ARG_TYPE`                       | Update mcp-agent-provider to latest version |

### Debug Mode
```bash
# Enable verbose logging
npx promptfoo eval -c config.yaml --verbose

# Test specific cases
npx promptfoo eval -c config.yaml --filter "Test name"
```

## 🔒 Security Best Practices

1. **Never commit credentials** - Use environment variables
2. **Test in staging first** - Don't test against production
3. **Review all findings** - Even "pass" results may have warnings
4. **Fix and re-test** - Verify fixes actually work
5. **Document vulnerabilities** - Keep a security log

## 📚 Additional Resources

- [Promptfoo MCP Documentation](https://promptfoo.dev/docs/integrations/mcp)
- [MCP Security Testing Guide](https://promptfoo.dev/docs/red-team/mcp-security-testing)
- [mcp-agent-provider Repository](https://github.com/promptfoo/mcp-agent-provider)
- [Model Context Protocol Spec](https://modelcontextprotocol.org/)

## 💡 Key Recommendations

For your specific use case (remote K8s MCP server with auth):

1. **Use the custom provider approach** - It properly handles remote servers with authentication
2. **Run k8s-mcp-redteam.yaml** - It's specifically designed for K8s read-only validation
3. **Monitor server logs** - Watch for any unexpected behavior during testing
4. **Test incrementally** - Start with basic connectivity, then functional, then security
5. **Document everything** - Keep records of all test results and fixes

## 📝 Example Test Run

```bash
# 1. Setup
export MCP_API_KEY="your-actual-key"
export MCP_AUTH_TOKEN="your-actual-token"
export OPENAI_API_KEY="your-openai-key"

# 2. Clone mcp-agent-provider
git clone https://github.com/promptfoo/mcp-agent-provider.git
cd mcp-agent-provider
npm install
cd ..

# 3. Run tests
npx promptfoo eval -c pf2/examples/mcp-testing/custom-provider-config.yaml
npx promptfoo redteam run -c pf2/examples/mcp-testing/k8s-mcp-redteam.yaml

# 4. View results
npx promptfoo view
```

## ⚠️ Important Notes

- The standard OpenAI provider with MCP config expects local MCP servers (stdio transport)
- Remote servers require either the custom provider or direct MCP provider
- Authentication headers are only supported with URL-based connections
- Always use environment variables for sensitive values
- The mcp-agent-provider is the most reliable solution for remote servers

## 🤝 Getting Help

If you encounter issues:
1. Check the SETUP_GUIDE.md for detailed instructions
2. Review error messages in verbose mode (`--verbose`)
3. Consult the Promptfoo Discord community
4. Open an issue on the promptfoo GitHub repository

---

Created for testing MCP servers with authentication, particularly focused on validating read-only Kubernetes MCP implementations against unauthorized actions.
