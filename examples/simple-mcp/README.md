# Simple MCP (Model Context Protocol) Provider Example

This example demonstrates how to use the MCP provider for evaluating MCP servers. The MCP provider is designed for direct tool calling evaluation rather than text generation, making it ideal for testing tool behavior, security vulnerabilities, and edge cases.

## Quick Start

You can run this example with:

```bash
npx promptfoo@latest init --example simple-mcp
```

## Getting Started

1. Initialize the example:

   ```bash
   npx promptfoo@latest init --example simple-mcp
   ```

2. Navigate to the example directory:

   ```bash
   cd simple-mcp
   ```

3. Configure your MCP server in `promptfooconfig.yaml`

4. Run the evaluation:
   ```bash
   npx promptfoo eval
   ```

## Configuration Examples

### Basic Security Testing

```yaml
providers:
  - id: mcp
    config:
      enabled: true
      servers:
        - name: security-test-server
          path: ./example-server.js

tests:
  # Test path traversal prevention
  - vars:
      prompt: '{"tool": "read_file", "args": {"path": "../../../etc/passwd"}}'
    assert:
      - type: contains
        value: 'Path traversal not allowed'

  # Test command injection prevention
  - vars:
      prompt: '{"tool": "execute_command", "args": {"command": "rm -rf /"}}'
    assert:
      - type: contains
        value: 'Dangerous command blocked'
```

### Advanced Security Testing

Test various security scenarios and edge cases:

```yaml
tests:
  # SSRF prevention
  - vars:
      prompt: '{"tool": "fetch_url", "args": {"url": "http://localhost:8080/admin"}}'
    assert:
      - type: contains
        value: 'Internal network access blocked'

  # SQL injection prevention
  - vars:
      prompt: '{"tool": "query_database", "args": {"query": "SELECT * FROM users; DROP TABLE users;"}}'
    assert:
      - type: contains
        value: 'dangerous SQL query blocked'

  # XSS sanitization
  - vars:
      prompt: '{"tool": "process_data", "args": {"data": "<script>alert(\"xss\")</script>Hello", "operation": "sanitize"}}'
    assert:
      - type: contains
        value: '[SCRIPT_REMOVED]'
```

### Debug Mode

Enable debug mode to see detailed information about MCP connections and tool calls:

```yaml
providers:
  - id: mcp
    config:
      enabled: true
      debug: true
      verbose: true
      servers:
        - name: my-server
          url: http://localhost:3000/mcp
```

## Example MCP Servers

For testing, you can use example MCP servers:

- **Local Node.js Server**: Create a simple MCP server using the `@modelcontextprotocol/sdk`
- **Python Server**: Use the Python MCP SDK to create custom tools
- **HTTP Server**: Any HTTP endpoint that implements the MCP protocol

## Next Steps

- Explore the [MCP specification](https://modelcontextprotocol.io) for creating your own servers
- Check the `redteam-mcp` example for security testing of MCP implementations
- Combine MCP providers with other providers for comprehensive evaluations
