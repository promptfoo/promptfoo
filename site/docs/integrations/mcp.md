---
title: AI Assistant Integration with MCP
sidebar_label: MCP for AI Assistants
description: Learn how to use promptfoo with AI coding assistants through the Model Context Protocol (MCP)
---

# promptfoo MCP Integration

promptfoo includes support for the Model Context Protocol (MCP), which enables AI coding assistants like those in [Cursor](https://cursor.sh) to better understand your LLM evaluation projects.

## What is MCP?

The [Model Context Protocol](https://github.com/cursor-ai/model-context-protocol) (MCP) is an open protocol that standardizes how applications provide context and tools to LLMs. By implementing MCP, promptfoo allows AI assistants to:

1. Analyze your configuration files
2. Validate your test setups
3. Run evaluations directly from your IDE
4. Understand your testing strategy

This means your AI assistant can provide more intelligent assistance when working with promptfoo projects.

## Setup with Cursor

### Option 1: Global Setup (Recommended)

1. Open Cursor and navigate to **Settings > MCP**
2. Click on **Add new global MCP server**
3. Copy and paste the following configuration:

```json
{
  "mcpServers": {
    "promptfoo": {
      "command": "npx",
      "args": ["-y", "promptfoo@latest", "mcp", "start"],
      "description": "Promptfoo MCP server for LLM evaluation and testing context"
    }
  }
}
```

4. Save and ensure the "promptfoo" server is enabled (it should appear green)

### Option 2: Project-Specific Setup

For a project-specific setup:

1. Create a `.cursor` directory in your project root
2. Add an `mcp.json` file with the same content as above
3. Restart Cursor or reload your workspace

## Available Tools

The promptfoo MCP server provides the following capabilities:

| Tool                 | Description                                                       |
| -------------------- | ----------------------------------------------------------------- |
| `health`             | Simple health check endpoint                                      |
| `schema`             | Get the JSON schema for promptfoo configuration files             |
| `validate-config`    | Validate a promptfoo configuration file                           |
| `analyze-project`    | Find and analyze all promptfoo configuration files in a directory |
| `get-config-details` | Get detailed information about a specific configuration file      |
| `list-evaluations`   | List all previous promptfoo evaluation runs                       |
| `get-evaluation`     | Get detailed results for a specific evaluation                    |
| `run-eval`           | Run an evaluation with a specified configuration file and options |

## Example Workflows

Once the MCP server is running, you can ask your AI assistant questions like:

- "Are my promptfoo configurations valid?"
- "What providers and prompts do I have defined?"
- "Analyze my test cases and suggest improvements"
- "Run an evaluation using my current config file"
- "Show me the results of my last evaluation run"

## Running the MCP Server Manually

You can also run the MCP server manually:

```bash
npx promptfoo mcp start
```

Options:

- `-p, --port <port>`: Specify port (default: 3991)
- `-v, --verbose`: Enable verbose logging
- `-t, --transport <transport>`: Transport to use (stdio or sse, default: stdio)

## Transport Options

The MCP server supports two transport types:

1. **stdio** (default) - For direct integration with Cursor and similar tools
2. **sse** (Server-Sent Events) - For more advanced setups, allows running the server over HTTP

For most users, the stdio transport is sufficient. For the SSE transport, run:

```bash
npx promptfoo mcp start --transport sse --port 3991
```

Then update your `.cursor/mcp.json` configuration to:

```json
{
  "mcpServers": {
    "promptfoo": {
      "url": "http://localhost:3991/sse"
    }
  }
}
```

## Troubleshooting

If you encounter issues:

1. Check if the MCP server is running by visiting `http://localhost:3991/health` (if using SSE transport)
2. Try enabling verbose mode: `npx promptfoo mcp start --verbose`
3. Ensure you're using a compatible version of Cursor
4. Update promptfoo to the latest version: `npm install -g promptfoo@latest`

## How It Works

Under the hood, the promptfoo MCP server uses the official MCP TypeScript SDK to provide contextual information about your promptfoo projects. It scans your workspace for configuration files, validates them, and makes this information available to AI assistants through the MCP protocol.

When you ask questions about your promptfoo project, the AI assistant can access this information to provide more accurate and helpful responses.
