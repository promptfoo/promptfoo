---
title: Using MCP (Model Context Protocol) in Promptfoo
description: Enable Model Context Protocol (MCP) integration for enhanced tool use, persistent memory, and agentic workflows across providers
sidebar_label: Model Context Protocol (MCP)
sidebar_position: 20
---

# Using MCP (Model Context Protocol) in Promptfoo

Promptfoo supports the Model Context Protocol (MCP) for advanced tool use, and agentic workflows. MCP allows you to connect your Promptfoo providers to an external MCP server, such as the [modelcontextprotocol/server-memory](https://github.com/modelcontextprotocol/server-memory), to enable tool orchestration, and more.

## Basic Configuration

To enable MCP for a provider, add the `mcp` block to your provider's `config` in your `promptfooconfig.yaml`:

```yaml title="promptfooconfig.yaml"
description: Testing MCP memory server integration with Google AI Studio
providers:
  - id: google:gemini-2.0-flash
    config:
      mcp:
        enabled: true
        server:
          command: npx
          args: ['-y', '@modelcontextprotocol/server-memory']
          name: memory
```

### MCP Config Options

- `enabled`: Set to `true` to enable MCP for this provider.
- `timeout`: (Optional) Request timeout in milliseconds for MCP tool calls. Defaults to 60000 (60 seconds). Set higher for long-running tools.
- `resetTimeoutOnProgress`: (Optional) Reset timeout when progress notifications are received. Useful for long-running operations. Default: false.
- `maxTotalTimeout`: (Optional) Absolute maximum timeout in milliseconds regardless of progress notifications.
- `pingOnConnect`: (Optional) Ping the server after connecting to verify it's responsive. Default: false.
- `server`: (Optional) Configuration for launching or connecting to an MCP server.
  - `command`: The command to launch the MCP server (e.g., `npx`).
  - `args`: Arguments to pass to the command (e.g., `['-y', '@modelcontextprotocol/server-memory']`).
  - `name`: (Optional) A name for the server instance.
  - `url`: URL for connecting to a remote MCP server.
  - `headers`: (Optional) Custom HTTP headers to send when connecting to a remote MCP server (only applies to `url`-based connections).
  - `auth`: (Optional) Authentication configuration for the server. Can be used to automatically set auth headers for all connection types.
    - `type`: Authentication type, either `'bearer'` or `'api_key'`.
    - `token`: Token for bearer authentication.
    - `api_key`: API key for api_key authentication.
- You can also connect to a remote MCP server by specifying a `url` instead of `command`/`args`.

MCP servers can be run locally or accessed remotely. For development and testing, a local server is often simplest, while production environments may use a centralized remote server.

#### Example: Connecting to a Remote MCP Server

```yaml
providers:
  - id: openai:responses:gpt-5.1
    config:
      apiKey: <your-api-key>
      mcp:
        enabled: true
        server:
          url: http://localhost:8000
```

#### Example: Using Custom Headers with a Remote MCP Server

```yaml
providers:
  - id: openai:responses:gpt-5.1
    config:
      apiKey: <your-api-key>
      mcp:
        enabled: true
        server:
          url: http://localhost:8000
          headers:
            X-API-Key: your-custom-api-key
            Authorization: Bearer your-token
            X-Custom-Header: custom-value
```

This can be useful when:

- The MCP server requires an API key or authentication token
- You need to provide custom identifiers or session information
- The server needs specific headers for configuration or tracking

## Connecting a Single Provider to Multiple MCP Servers

Promptfoo allows a single provider to connect to multiple MCP servers by using the `servers` array in your provider's MCP config. All tools from all connected servers will be available to the provider.

### Example: One Provider, Multiple MCP Servers

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:responses:gpt-5.1
    config:
      mcp:
        enabled: true
        servers:
          - command: npx
            args: ['-y', '@modelcontextprotocol/server-memory']
            name: server_a
          - url: http://localhost:8001
            name: server_b
            headers:
              X-API-Key: your-api-key
```

- Use the `servers:` array (not just `server:`) to specify multiple MCP servers.
- Each entry can be a local launch or a remote URL (if supported).
- All tools from all servers will be available to the provider.
- You can specify different headers for each server when using URL connections.
- You can also connect to the same server multiple times if needed:

```yaml
providers:
  - id: anthropic:claude-sonnet-4-5-20250929
    config:
      mcp:
        enabled: true
        servers:
          - command: npx
            args: ['-y', '@modelcontextprotocol/server-memory']
            name: memory
          - command: npx
            args: ['-y', '@modelcontextprotocol/server-filesystem']
            name: filesystem
          - command: npx
            args: ['-y', '@modelcontextprotocol/server-github']
            name: github
```

This configuration connects a single provider to multiple MCP servers, giving it access to memory storage, filesystem operations, and GitHub integration simultaneously.

## Using Multiple MCP Servers

You can configure multiple MCP servers by assigning different MCP server configurations to different providers in your `promptfooconfig.yaml`. Each provider can have its own `mcp.server` block, allowing you to run separate memory/tool servers for different models or use cases.

```yaml title="promptfooconfig.yaml"
description: Using multiple MCP servers
providers:
  - id: google:gemini-2.0-flash
    config:
      mcp:
        enabled: true
        server:
          command: npx
          args: ['-y', '@modelcontextprotocol/server-memory']
          name: gemini-memory

  - id: openai:responses:gpt-5.1
    config:
      apiKey: <your-api-key>
      mcp:
        enabled: true
        server:
          url: http://localhost:8001
          name: openai-memory
          headers:
            X-API-Key: openai-server-api-key

  - id: anthropic:claude-sonnet-4-5-20250929
    config:
      mcp:
        enabled: true
        server:
          url: http://localhost:8002
          name: anthropic-memory
          headers:
            Authorization: Bearer anthropic-server-token
```

In this example:

- The Gemini provider launches a local MCP server using `npx`.
- The OpenAI and Anthropic providers connect to different remote MCP servers running on different ports.
- Each provider can have its own memory, tool set, and context, isolated from the others.
- Custom headers are specified for the remote servers to handle authentication or other requirements.

This setup is useful for testing, benchmarking, or running isolated agentic workflows in parallel.

## Supported Providers

MCP is supported by most major providers in Promptfoo, including:

- Google Gemini (AI Studio, Vertex)
- OpenAI (and compatible providers like Groq, Together, etc.)
- Anthropic

## OpenAI Responses API MCP Integration

In addition to the general MCP integration described above, OpenAI's Responses API has native MCP support that allows direct connection to remote MCP servers without running local MCP servers. This approach is specific to OpenAI's Responses API and offers:

- Direct connection to remote MCP servers (like DeepWiki, Stripe, etc.)
- Built-in approval workflows for data sharing
- Authentication header support for secured MCP servers
- Tool filtering capabilities

For detailed information about using MCP with OpenAI's Responses API, see the [OpenAI Provider MCP documentation](../providers/openai.md#mcp-model-context-protocol-support).

## Tool Schema Compatibility

Promptfoo automatically handles JSON Schema compatibility between MCP servers and LLM providers by removing provider-incompatible metadata fields (like `$schema`) while preserving supported features. Tools with no input parameters work without modification.

## Timeout Configuration

MCP tool calls have a default timeout of 60 seconds. For long-running tools, increase the timeout:

```yaml
providers:
  - id: openai:responses:gpt-5.1
    config:
      mcp:
        enabled: true
        timeout: 900000 # 15 minutes in milliseconds
        server:
          url: https://api.example.com/mcp
```

You can also set a global default via environment variable:

```bash
export MCP_REQUEST_TIMEOUT_MS=900000  # 15 minutes
```

Priority: `config.timeout` > `MCP_REQUEST_TIMEOUT_MS` env var > SDK default (60s).

## Troubleshooting

- Ensure your MCP server is running and accessible.
- Check your provider logs for MCP connection errors.
- Verify that your custom headers are correctly formatted if you're having authentication issues.
- If tool calls timeout, increase the `timeout` config option or set `MCP_REQUEST_TIMEOUT_MS`.

## See Also

- [Configuration Reference](../configuration/reference.md)
- [Provider Configuration](../providers/index.md)
