---
title: Promptfoo MCP Server
description: Use promptfoo as an MCP server to provide AI eval tools to external AI agents and development environments
sidebar_label: MCP Server
sidebar_position: 21
---

# Promptfoo MCP Server

Expose promptfoo's eval tools to AI agents via Model Context Protocol (MCP).

## Quick Start

### 1. Start the Server

```bash
# For Cursor, Claude Desktop
npx promptfoo@latest mcp --transport stdio

# For web tools
npx promptfoo@latest mcp --transport http --port 3100
```

### 2. Configure Your AI Tool

**Cursor**: Create `.cursor/mcp.json`

```json title=".cursor/mcp.json"
{
  "mcpServers": {
    "promptfoo": {
      "command": "npx",
      "args": ["promptfoo@latest", "mcp", "--transport", "stdio"]
    }
  }
}
```

**Claude Desktop**: Add to config file

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json title="claude_desktop_config.json"
{
  "mcpServers": {
    "promptfoo": {
      "command": "npx",
      "args": ["promptfoo@latest", "mcp", "--transport", "stdio"]
    }
  }
}
```

Restart your AI tool after adding the configuration.

## Available Tools

### Core Tools

- **`list_evaluations`** - Browse your eval runs
- **`get_evaluation_details`** - Get complete results for an eval
- **`run_evaluation`** - Execute evals with custom parameters
- **`validate_promptfoo_config`** - Check config file syntax
- **`test_ai_provider`** - Test provider connectivity

### Analysis & Sharing

- **`analyze_evaluation_metrics`** - Calculate performance stats
- **`share_evaluation`** - Create shareable result URLs
- **`run_assertion`** - Test individual grading rules

### Data Access

- **`get_test_prompts`** - Get prompts for specific test cases
- **`list_test_datasets`** - Browse available datasets
- **`promptfoo_health_check`** - Check server status

## Troubleshooting

**Server won't start:**

```bash
npx promptfoo@latest --version  # Check installation
npx promptfoo@latest validate   # Check config
```

**AI tool can't connect:**

- Verify config syntax matches examples above
- Restart your AI tool after config changes
- For HTTP: check `curl http://localhost:3100/health`

**Tool errors:**

- "Eval not found": Use `list_evaluations` to get valid IDs
- "Config error": Run `validate_promptfoo_config`
- "Provider error": Use `test_ai_provider` to diagnose

## See Also

- [Command Line Reference](/docs/usage/command-line#promptfoo-mcp) - Complete command options
- [MCP Client Integration](/docs/integrations/mcp) - Using promptfoo as MCP client
