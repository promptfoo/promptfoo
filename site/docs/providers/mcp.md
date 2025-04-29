---
title: Using MCP (Model Context Protocol) in Promptfoo
sidebar_position: 50
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
- `server`: (Optional) Configuration for launching or connecting to an MCP server.
  - `command`: The command to launch the MCP server (e.g., `npx`).
  - `args`: Arguments to pass to the command (e.g., `['-y', '@modelcontextprotocol/server-memory']`).
  - `name`: (Optional) A name for the server instance.
- You can also connect to a remote MCP server by specifying a `url` instead of `command`/`args`.

#### Example: Connecting to a Remote MCP Server

```yaml
providers:
  - id: openai:chat:gpt-4.1
    config:
      apiKey: <your-api-key>
      mcp:
        enabled: true
        server:
          url: http://localhost:8000
```

## Connecting a Single Provider to Multiple MCP Servers

Promptfoo allows a single provider to connect to multiple MCP servers by using the `servers` array in your provider's MCP config. All tools from all connected servers will be available to the provider.

### Example: One Provider, Multiple MCP Servers

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:chat:gpt-4.1
    config:
      mcp:
        enabled: true
        servers:
          - command: npx
            args: ['-y', '@modelcontextprotocol/server-memory']
            name: server_a
          - url: http://localhost:8001
            name: server_b
```

- Use the `servers:` array (not just `server:`) to specify multiple MCP servers.
- Each entry can be a local launch or a remote URL (if supported).
- All tools from all servers will be available to the provider.

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

  - id: openai:chat:gpt-4.1
    config:
      apiKey: <your-api-key>
      mcp:
        enabled: true
        server:
          url: http://localhost:8001
          name: openai-memory

  - id: anthropic:messages:claude-3-5-sonnet-20241022
    config:
      mcp:
        enabled: true
        server:
          url: http://localhost:8002
          name: anthropic-memory
```

In this example:

- The Gemini provider launches a local MCP server using `npx`.
- The OpenAI and Anthropic providers connect to different remote MCP servers running on different ports.
- Each provider can have its own memory, tool set, and context, isolated from the others.

This setup is useful for testing, benchmarking, or running isolated agentic workflows in parallel.

## Supported Providers

MCP is supported by most major providers in Promptfoo, including:

- Google Gemini (AI Studio, Vertex)
- OpenAI (and compatible providers like Groq, Together, etc.)
- Anthropic

## Troubleshooting

- Ensure your MCP server is running and accessible.
- Check your provider logs for MCP connection errors.

---

For advanced use cases, see the [Promptfoo MCP source code](https://github.com/promptfoo/promptfoo) or open an issue for help.
