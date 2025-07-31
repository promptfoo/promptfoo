# Simple MCP (Model Context Protocol) Provider Example

This example demonstrates how to use the MCP provider for security testing and red-teaming MCP servers. The MCP provider is designed for direct tool calling evaluation rather than text generation, making it ideal for testing tool behavior, security vulnerabilities, and edge cases.

## What is MCP?

Model Context Protocol (MCP) is an open protocol that standardizes how applications provide context to LLMs. With promptfoo's MCP provider, you can:

- **Security Test MCP Tools**: Test for path traversal, command injection, SSRF, and other vulnerabilities
- **Validate Tool Behavior**: Ensure tools handle invalid inputs gracefully
- **Red-team MCP Servers**: Systematically test security boundaries and restrictions
- **Evaluate Multiple Servers**: Test tools across different MCP implementations

## Quick Start

You can run this example with:

```bash
npx promptfoo@latest init --example simple-mcp
```

## Prerequisites

- Node.js (v16+)
- An MCP server running locally or accessible via HTTP
- Properly configured MCP server with tools that can handle text generation

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
      tool: 'read_file'
      args:
        path: '../../../etc/passwd'
    assert:
      - type: contains
        value: 'Path traversal not allowed'

  # Test command injection prevention
  - vars:
      tool: 'execute_command'
      args:
        command: 'rm -rf /'
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
      tool: 'fetch_url'
      args:
        url: 'http://localhost:8080/admin'
    assert:
      - type: contains
        value: 'Internal network access blocked'

  # SQL injection prevention
  - vars:
      tool: 'query_database'
      args:
        query: 'SELECT * FROM users; DROP TABLE users;'
    assert:
      - type: contains
        value: 'dangerous SQL query blocked'

  # XSS sanitization
  - vars:
      tool: 'process_data'
      args:
        data: '<script>alert("xss")</script>Hello'
        operation: 'sanitize'
    assert:
      - type: contains
        value: '[SCRIPT_REMOVED]'
```

### Multiple MCP Servers

```yaml
providers:
  - id: mcp
    config:
      enabled: true
      servers:
        - name: tools-server
          url: http://localhost:3000/mcp
        - name: data-server
          path: ./data-server.py
        - name: npm-server
          command: npx
          args: [some-mcp-package]
      tools:
        - generate_text
        - analyze_data
      exclude_tools:
        - dangerous_tool
      verbose: true
      debug: true
```

## Provider Formats

The MCP provider supports several formats:

- `mcp` - Basic MCP provider for tool calling
- `mcp:server_name` - Target specific server (when using multiple servers)

## Test Case Format

Each test case specifies the tool to call and its arguments:

```yaml
tests:
  - vars:
      tool: 'tool_name' # Required: name of the MCP tool to call
      args: # Optional: arguments to pass to the tool
        param1: 'value1'
        param2: 'value2'
      # Alternative argument formats:
      # arguments: { ... }         # Can use 'arguments' instead of 'args'
      # params: { ... }            # Can use 'params' instead of 'args'
    assert:
      - type: contains
        value: 'expected output'
```

## Security Testing Scenarios

The example includes test cases for:

1. **Path Traversal**: Test file operations with `../` patterns to ensure proper path validation
2. **Command Injection**: Test command execution tools with dangerous commands like `rm -rf /`
3. **SSRF Prevention**: Test URL fetching tools with internal network addresses
4. **SQL Injection**: Test database tools with malicious SQL patterns
5. **XSS Prevention**: Test data processing tools with script injection attempts
6. **Access Control**: Test file operations on restricted system files like `/etc/passwd`
7. **Input Validation**: Test tools with malformed JSON and edge cases

## Troubleshooting

### Common Issues

1. **"No tool specified"**: Each test case must specify which tool to call in the `vars.tool` field.

2. **"Tool Not Found"**: Verify that the tool name exists in your MCP server and is not excluded by the `exclude_tools` configuration.

3. **Connection Failed**: Check that your MCP server is running and accessible at the specified URL or path.

4. **Invalid Arguments**: Ensure the arguments match what the MCP tool expects. Check the tool's input schema.

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
