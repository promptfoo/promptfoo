# anthropic/mcp (Anthropic Messages + MCP tools)

This example wires Claude up to a [Model Context Protocol](https://modelcontextprotocol.io) server through the Anthropic Messages provider. Promptfoo exposes the MCP server's tools to Claude, executes any `tool_use` blocks the model emits, and feeds the `tool_result` back into the conversation until Claude produces a final reply.

```bash
npx promptfoo@latest init --example anthropic/mcp
cd anthropic/mcp
```

## Setup

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npx promptfoo@latest eval
```

The bundled config uses the public [deepwiki MCP server](https://mcp.deepwiki.com/) so the example works out of the box without installing anything. To swap in your own server, replace the `mcp` block:

```yaml
mcp:
  enabled: true
  # Local stdio server
  server:
    command: npx
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp/workspace']
  # …or remote SSE / streamable HTTP
  # servers:
  #   - name: my-server
  #     url: https://example.com/mcp
```

## What it demonstrates

- **Tool discovery**: Tools exposed by the MCP server are forwarded to Claude alongside any inline `tools` you define.
- **Multi-round execution**: When Claude returns a `tool_use` block matching an MCP tool, promptfoo invokes the tool with the model's arguments and appends a `tool_result` on the next user turn. The loop continues until Claude returns text — bounded by `max_tool_calls` (default `8`).
- **Error pass-through**: Tool errors come back as `tool_result` blocks with `is_error: true` so Claude can recover or report the failure.
- **Mixed tool handling**: Non-MCP tools (regular function-calling tools, or built-ins like `web_search`) fall through to the existing tool-use output without being auto-executed.

## Caching

Promptfoo's disk response cache is **skipped automatically** when `mcp.enabled` is `true`, because tool results can vary between runs. Use `max_tool_calls` to bound the per-request cost.

## See also

- [Anthropic provider docs](https://promptfoo.dev/docs/providers/anthropic/#model-context-protocol-mcp)
- [MCP integration guide](https://promptfoo.dev/docs/integrations/mcp/) — full server configuration (auth, timeouts, multi-server)
- [examples/openai-mcp](../../openai-mcp/) — the same pattern via the OpenAI Responses API
- [examples/simple-mcp](../../simple-mcp/) — testing an MCP server directly without an LLM provider
