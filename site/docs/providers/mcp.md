---
sidebar_label: MCP (Model Context Protocol)
title: MCP Provider
description: Use Model Context Protocol (MCP) servers as providers in promptfoo for testing agentic systems and tool-calling capabilities
---

# MCP (Model Context Protocol) Provider

The `mcp` provider allows you to use Model Context Protocol (MCP) servers directly as providers in promptfoo. This is particularly useful for red teaming and testing agentic systems that rely on MCP tools for function calling, data access, and external integrations.

Unlike the [MCP integration for other providers](../integrations/mcp.md), the MCP provider treats the MCP server itself as the target system under test, allowing you to evaluate security vulnerabilities and robustness of MCP-based applications.

## Setup

To use the MCP provider, you need to have an MCP server running. This can be a local server or a remote one.

### Prerequisites

1. An MCP server (local or remote)
2. Node.js dependencies for MCP SDK (automatically handled by promptfoo)

## Basic Configuration

The most basic MCP provider configuration:

```yaml title="promptfooconfig.yaml"
providers:
  - id: mcp
    config:
      enabled: true
      server:
        command: node
        args: ['mcp_server/index.js']
        name: test-server
```

## Configuration Options

### Server Configuration

The MCP provider supports both local and remote MCP servers:

#### Local Server (Command-based)

```yaml
providers:
  - id: mcp
    config:
      enabled: true
      server:
        command: node # Command to run the server
        args: ['server.js'] # Arguments for the command
        name: local-server # Optional name for the server
```

#### Remote Server (URL-based)

```yaml
providers:
  - id: mcp
    config:
      enabled: true
      server:
        url: https://api.example.com/mcp # URL of the remote MCP server
        name: remote-server # Optional name for the server
        headers: # Optional custom headers
          Authorization: 'Bearer token'
          X-API-Key: 'your-api-key'
```

#### Multiple Servers

You can connect to multiple MCP servers simultaneously:

```yaml
providers:
  - id: mcp
    config:
      enabled: true
      servers:
        - command: node
          args: ['server1.js']
          name: server-1
        - url: https://api.example.com/mcp
          name: server-2
          headers:
            Authorization: 'Bearer token'
```

### Authentication

For servers requiring authentication, use the `auth` configuration:

```yaml
providers:
  - id: mcp
    config:
      enabled: true
      server:
        url: https://secure-mcp-server.com
        auth:
          type: bearer
          token: 'your-bearer-token'
```

Or using API key authentication:

```yaml
providers:
  - id: mcp
    config:
      enabled: true
      server:
        url: https://secure-mcp-server.com
        auth:
          type: api_key
          api_key: 'your-api-key'
```

### Tool Filtering

Control which tools are available from the MCP server:

```yaml
providers:
  - id: mcp
    config:
      enabled: true
      server:
        command: node
        args: ['server.js']
      tools: ['get_user_data', 'process_payment'] # Only allow these tools
      exclude_tools: ['delete_user', 'admin_access'] # Exclude these tools
```

### Advanced Configuration

```yaml
providers:
  - id: mcp
    config:
      enabled: true
      server:
        command: node
        args: ['server.js']
        name: advanced-server
      timeout: 30000 # Connection timeout in milliseconds
      debug: true # Enable debug logging
      verbose: true # Enable verbose output
      defaultArgs: # Default arguments for all tool calls
        session_id: 'test-session'
        user_role: 'customer'
```

## Usage with Tool Calls

The MCP provider expects prompts to be formatted as JSON tool calls. The expected format is:

```json
{
  "tool": "function_name",
  "args": {
    "parameter1": "value1",
    "parameter2": "value2"
  }
}
```

### Example Test Case

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Testing MCP payment processing system

providers:
  - id: mcp
    config:
      enabled: true
      server:
        command: node
        args: ['payment_server.js']
        name: payment-system

prompts:
  - '{{prompt}}'

tests:
  - vars:
      prompt: '{"tool": "process_payment", "args": {"amount": 100, "currency": "USD", "user_id": "12345"}}'
    assert:
      - type: contains
        value: success

  - vars:
      prompt: '{"tool": "get_transaction", "args": {"transaction_id": "txn_123"}}'
    assert:
      - type: is-json
```

## Red Team Testing with MCP

The MCP provider is particularly powerful for red team testing of agentic systems. Here's a recommended configuration for comprehensive security testing:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: MCP Red Team Security Testing

providers:
  - id: mcp
    config:
      enabled: true
      server:
        command: node
        args: ['mcp_server/index.js']
        name: target-system

redteam:
  purpose: |
    The system manages payment transactions, user data, and provides analytics.
    Users include customers and TechMart employees with different access levels.
    Test for unauthorized access, data leakage, and function manipulation.

  # Recommended plugins for MCP testing
  plugins:
    - pii # Test for PII data exposure
    - bfla # Test function-level authorization
    - bola # Test object-level authorization
    - sql-injection # Test for SQL injection vulnerabilities

  strategies:
    - basic

  numTests: 25
```

### Recommended Plugins for MCP Testing

Based on common MCP security concerns, these plugins are particularly relevant:

1. **`pii`** - Tests for exposure of personally identifiable information through tool responses
2. **`bfla`** (Broken Function Level Authorization) - Tests whether users can access functions they shouldn't
3. **`bola`** (Broken Object Level Authorization) - Tests whether users can access data objects they shouldn't
4. **`sql-injection`** - Tests for SQL injection vulnerabilities in tool parameters

These plugins target the most common security vulnerabilities in systems that expose tools and data through MCP interfaces.

## Environment Variables

The MCP provider supports these environment variables:

| Variable      | Description                              | Default |
| ------------- | ---------------------------------------- | ------- |
| `MCP_TIMEOUT` | Default timeout for MCP connections (ms) | 30000   |
| `MCP_DEBUG`   | Enable debug logging                     | false   |
| `MCP_VERBOSE` | Enable verbose output                    | false   |

## Error Handling

The MCP provider handles various error conditions:

- **Connection errors**: When the MCP server is unreachable
- **Invalid JSON**: When the prompt is not valid JSON
- **Tool not found**: When requesting a non-existent tool
- **Tool execution errors**: When the tool call fails
- **Timeout errors**: When tool calls exceed the configured timeout

Example error response:

```json
{
  "error": "MCP tool error: Tool 'unknown_function' not found in any connected MCP server"
}
```

## Debugging

Enable debug mode to troubleshoot MCP provider issues:

```yaml
providers:
  - id: mcp
    config:
      enabled: true
      debug: true
      verbose: true
      server:
        command: node
        args: ['server.js']
```

This will log:

- MCP server connection status
- Available tools from connected servers
- Tool call details and responses
- Error messages with stack traces

## Limitations

- The MCP provider requires prompts to be formatted as JSON tool calls
- Only supports MCP servers that implement the standard MCP protocol
- Remote server support depends on the specific MCP server implementation
- Tool responses are returned as JSON strings

## Examples

For complete working examples, see:

- [Basic MCP Red Team Testing](https://github.com/promptfoo/promptfoo/tree/main/examples/redteam-mcp)
- [Simple MCP Integration](https://github.com/promptfoo/promptfoo/tree/main/examples/simple-mcp)

You can initialize these examples with:

```bash
npx promptfoo@latest init --example redteam-mcp
```

## See Also

- [MCP Integration for Other Providers](../integrations/mcp.md)
- [Red Team Testing Guide](../red-team/index.md)
- [MCP Plugin Documentation](../red-team/plugins/mcp.md)
- [Configuration Reference](../configuration/reference.md)
