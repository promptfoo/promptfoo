---
title: Promptfoo MCP Server
description: Use promptfoo as an MCP server to provide AI eval tools to external AI agents and development environments
sidebar_label: MCP Server
sidebar_position: 21
---

# Promptfoo MCP Server

Expose promptfoo's eval tools to AI agents via Model Context Protocol (MCP).

:::info Prerequisites

- Node.js installed on your system
- A promptfoo project with some evaluations (for testing the connection)
- Cursor IDE, Claude Desktop, or another MCP-compatible AI tool

:::

## Quick Start

### 1. Start the Server

```bash
# For Cursor, Claude Desktop (STDIO transport)
npx promptfoo@latest mcp --transport stdio

# For web tools (HTTP transport)
npx promptfoo@latest mcp --transport http --port 3100
```

### 2. Configure Your AI Tool

**Cursor**: Create `.cursor/mcp.json` in your project root

```json title=".cursor/mcp.json"
{
  "mcpServers": {
    "promptfoo": {
      "command": "npx",
      "args": ["promptfoo@latest", "mcp", "--transport", "stdio"],
      "description": "Promptfoo MCP server for LLM evaluation and testing"
    }
  }
}
```

:::warning Development vs Production Configuration

**For regular usage:** Always use `npx promptfoo@latest` as shown above.

**For promptfoo contributors:** The `.cursor/mcp.json` in the promptfoo repository uses development commands (`ts-node src/main.ts`) to run from source code. Don't copy that configuration for regular usage.

:::

**Claude Desktop**: Add to config file

Config file locations:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

```json title="claude_desktop_config.json"
{
  "mcpServers": {
    "promptfoo": {
      "command": "npx",
      "args": ["promptfoo@latest", "mcp", "--transport", "stdio"],
      "description": "Promptfoo MCP server for LLM evaluation and testing"
    }
  }
}
```

**Restart your AI tool** after adding the configuration.

### 3. Test the Connection

After restarting your AI tool, you should see promptfoo tools available. Try asking:

> "List my recent evaluations using the promptfoo tools"

## Available Tools

### Core Evaluation Tools

- **`list_evaluations`** - Browse your evaluation runs with optional dataset filtering
- **`get_evaluation_details`** - Get comprehensive results, metrics, and test cases for a specific evaluation
- **`run_evaluation`** - Execute evaluations with custom parameters, test case filtering, and concurrency control
- **`share_evaluation`** - Generate publicly shareable URLs for evaluation results

### Redteam Security Tools

- **`redteam_run`** - Execute comprehensive security testing against AI applications with dynamic attack probes
- **`redteam_generate`** - Generate adversarial test cases for redteam security testing with configurable plugins and strategies

### Configuration & Testing

- **`validate_promptfoo_config`** - Validate configuration files using the same logic as the CLI
- **`test_provider`** - Test AI provider connectivity, credentials, and response quality
- **`run_assertion`** - Test individual assertion rules against outputs for debugging

## Transport Types

Choose the appropriate transport based on your use case:

- **STDIO (`--transport stdio`)**: For desktop AI tools (Cursor, Claude Desktop) that communicate via stdin/stdout
- **HTTP (`--transport http`)**: For web applications, APIs, and remote integrations that need HTTP endpoints

## Troubleshooting

### Server Issues

**Server won't start:**

```bash
# Verify promptfoo installation
npx promptfoo@latest --version

# Check if you have a valid promptfoo project
npx promptfoo@latest validate

# Test the MCP server manually
npx promptfoo@latest mcp --transport stdio
```

**Port conflicts (HTTP mode):**

```bash
# Use a different port
npx promptfoo@latest mcp --transport http --port 8080

# Check what's using port 3100
lsof -i :3100  # macOS/Linux
netstat -ano | findstr :3100  # Windows
```

### AI Tool Connection Issues

**AI tool can't connect:**

1. **Verify config syntax:** Ensure your JSON configuration exactly matches the examples above
2. **Check file paths:** Confirm config files are in the correct locations
3. **Restart completely:** Close your AI tool entirely and reopen it
4. **Test HTTP endpoint:** For HTTP transport, verify with `curl http://localhost:3100/health`

**Tools not appearing:**

1. Look for MCP or "tools" indicators in your AI tool's interface
2. Try asking explicitly: "What promptfoo tools do you have access to?"
3. Check your AI tool's logs for MCP connection errors

### Tool-Specific Errors

**"Eval not found":**

- Use `list_evaluations` first to see available evaluation IDs
- Ensure you're in a directory with promptfoo evaluation data

**"Config error":**

- Run `validate_promptfoo_config` to check your configuration
- Verify `promptfooconfig.yaml` exists and is valid

**"Provider error":**

- Use `test_provider` to diagnose connectivity and authentication issues
- Check your API keys and provider configurations

## See Also

- [Command Line Reference](/docs/usage/command-line#promptfoo-mcp) - Complete MCP command options
- [MCP Client Integration](/docs/integrations/mcp) - Using promptfoo as an MCP client
- [Model Context Protocol Specification](https://spec.modelcontextprotocol.io/) - Official MCP documentation
