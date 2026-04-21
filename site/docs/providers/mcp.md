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

For servers requiring authentication, use the `auth` configuration. The MCP provider supports multiple authentication methods.

#### Bearer Token

For APIs that accept a static bearer token:

```yaml
providers:
  - id: mcp
    config:
      enabled: true
      server:
        url: https://secure-mcp-server.com
        auth:
          type: bearer
          token: '{{env.MCP_BEARER_TOKEN}}'
```

The provider adds an `Authorization: Bearer <token>` header to each request.

#### Basic Authentication

For servers that use HTTP Basic authentication:

```yaml
providers:
  - id: mcp
    config:
      enabled: true
      server:
        url: https://secure-mcp-server.com
        auth:
          type: basic
          username: '{{env.MCP_USERNAME}}'
          password: '{{env.MCP_PASSWORD}}'
```

#### API Key

For servers that use API key authentication:

```yaml
providers:
  - id: mcp
    config:
      enabled: true
      server:
        url: https://secure-mcp-server.com
        auth:
          type: api_key
          value: '{{env.MCP_API_KEY}}'
          keyName: X-API-Key # Header or query parameter name (default: X-API-Key)
          placement: header # 'header' (default) or 'query'
```

When `placement` is `header`, the key is added as a request header. When `placement` is `query`, it's appended as a URL query parameter.

:::note Backward Compatibility
The legacy `api_key` field is still supported for backward compatibility. New configurations should use `value` instead.
:::

#### OAuth 2.0

OAuth 2.0 authentication supports **Client Credentials** and **Password** grant types. Tokens are automatically refreshed with a 60-second buffer before expiry.

**Client Credentials Grant:**

Use this grant type for server-to-server authentication:

```yaml
providers:
  - id: mcp
    config:
      enabled: true
      server:
        url: https://secure-mcp-server.com
        auth:
          type: oauth
          grantType: client_credentials
          tokenUrl: https://auth.example.com/oauth/token
          clientId: '{{env.MCP_CLIENT_ID}}'
          clientSecret: '{{env.MCP_CLIENT_SECRET}}'
          scopes:
            - read
            - write
```

**Password Grant:**

Use this grant type when authenticating with user credentials:

```yaml
providers:
  - id: mcp
    config:
      enabled: true
      server:
        url: https://secure-mcp-server.com
        auth:
          type: oauth
          grantType: password
          tokenUrl: https://auth.example.com/oauth/token
          username: '{{env.MCP_USERNAME}}'
          password: '{{env.MCP_PASSWORD}}'
          clientId: '{{env.MCP_CLIENT_ID}}' # Optional
          clientSecret: '{{env.MCP_CLIENT_SECRET}}' # Optional
          scopes:
            - read
```

**Token Endpoint Discovery:**

If `tokenUrl` is not specified, the provider automatically discovers the token endpoint using [RFC 8414](https://datatracker.ietf.org/doc/rfc8414/) OAuth 2.0 Authorization Server Metadata. It tries multiple well-known URLs:

1. Path-appended: `{server-url}/.well-known/oauth-authorization-server` (Keycloak style)
2. RFC 8414 path-aware: `{origin}/.well-known/oauth-authorization-server{path}`
3. Root level: `{origin}/.well-known/oauth-authorization-server`

For maximum compatibility, explicitly configure `tokenUrl` when possible.

**Token Refresh Behavior:**

When using OAuth authentication:

1. The provider requests an access token from `tokenUrl` (or discovered endpoint) before connecting
2. Tokens are proactively refreshed 60 seconds before expiration
3. Concurrent requests share the same refresh operation (no duplicate token fetches)
4. If a token expires during an evaluation, the provider automatically reconnects with a fresh token

#### Authentication Options Reference

| Option       | Type     | Auth Type               | Required | Description                                           |
| ------------ | -------- | ----------------------- | -------- | ----------------------------------------------------- |
| type         | string   | All                     | Yes      | `'bearer'`, `'basic'`, `'api_key'`, or `'oauth'`      |
| token        | string   | bearer                  | Yes      | The bearer token                                      |
| username     | string   | basic, oauth (password) | Yes      | Username                                              |
| password     | string   | basic, oauth (password) | Yes      | Password                                              |
| value        | string   | api_key                 | Yes\*    | The API key value                                     |
| api_key      | string   | api_key                 | Yes\*    | Legacy field, use `value` instead                     |
| keyName      | string   | api_key                 | No       | Header or query parameter name (default: `X-API-Key`) |
| placement    | string   | api_key                 | No       | `'header'` (default) or `'query'`                     |
| grantType    | string   | oauth                   | Yes      | `'client_credentials'` or `'password'`                |
| tokenUrl     | string   | oauth                   | No       | OAuth token endpoint URL (auto-discovered if omitted) |
| clientId     | string   | oauth                   | Varies   | Required for client_credentials                       |
| clientSecret | string   | oauth                   | Varies   | Required for client_credentials                       |
| scopes       | string[] | oauth                   | No       | OAuth scopes to request                               |

\* Either `value` or `api_key` is required for api_key auth type.

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
      timeout: 900000 # Request timeout in milliseconds (15 minutes)
      debug: true # Enable debug logging
      verbose: true # Enable verbose output
      defaultArgs: # Default arguments for all tool calls
        session_id: 'test-session'
        user_role: 'customer'
```

### Timeout Configuration

MCP tool calls have a default timeout of 60 seconds (from the MCP SDK). For long-running tools, you can increase the timeout:

**Via config (per-provider):**

```yaml
providers:
  - id: mcp
    config:
      enabled: true
      timeout: 900000 # 15 minutes in milliseconds
      server:
        url: https://api.example.com/mcp
```

**Via environment variable (global default):**

```bash
# Set default timeout for all MCP requests (in milliseconds)
export MCP_REQUEST_TIMEOUT_MS=900000  # 15 minutes
```

The priority order is: `config.timeout` > `MCP_REQUEST_TIMEOUT_MS` env var > SDK default (60 seconds).

### Advanced Timeout Options

For long-running MCP tools that send progress notifications, you can use advanced timeout options:

```yaml
providers:
  - id: mcp
    config:
      enabled: true
      timeout: 300000 # 5 minutes initial timeout
      resetTimeoutOnProgress: true # Reset timeout when progress is received
      maxTotalTimeout: 900000 # 15 minutes absolute maximum
      server:
        url: https://api.example.com/mcp
```

| Option                   | Description                                                             |
| ------------------------ | ----------------------------------------------------------------------- |
| `timeout`                | Request timeout in milliseconds (default: 60000)                        |
| `resetTimeoutOnProgress` | Reset timeout when progress notifications are received (default: false) |
| `maxTotalTimeout`        | Absolute maximum timeout regardless of progress (optional)              |
| `pingOnConnect`          | Ping server after connecting to verify responsiveness (default: false)  |

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

| Variable                 | Description                                          | Default |
| ------------------------ | ---------------------------------------------------- | ------- |
| `MCP_REQUEST_TIMEOUT_MS` | Default timeout for MCP tool calls and requests (ms) | 60000   |
| `MCP_DEBUG`              | Enable debug logging for MCP connections             | false   |
| `MCP_VERBOSE`            | Enable verbose output for MCP connections            | false   |

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
- [MCP Authentication](https://github.com/promptfoo/promptfoo/tree/main/examples/redteam-mcp-auth) - OAuth and other authentication methods
- [Simple MCP Integration](https://github.com/promptfoo/promptfoo/tree/main/examples/simple-mcp)

You can initialize these examples with:

```bash
npx promptfoo@latest init --example redteam-mcp
npx promptfoo@latest init --example redteam-mcp-auth
```

## See Also

- [MCP Integration for Other Providers](../integrations/mcp.md)
- [Red Team Testing Guide](../red-team/index.md)
- [MCP Plugin Documentation](../red-team/plugins/mcp.md)
- [Configuration Reference](../configuration/reference.md)
