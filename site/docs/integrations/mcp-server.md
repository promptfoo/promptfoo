---
title: Promptfoo MCP Server
description: Deploy promptfoo as Model Context Protocol server enabling external AI agents to access evaluation and red teaming capabilities
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

### Generation Tools

- **`generate_dataset`** - Generate test datasets using AI for comprehensive evaluation coverage
- **`generate_test_cases`** - Generate test cases with assertions for existing prompts
- **`compare_providers`** - Compare multiple AI providers side-by-side for performance and quality

### Redteam Security Tools

- **`redteam_run`** - Execute comprehensive security testing against AI applications with dynamic attack probes
- **`redteam_generate`** - Generate adversarial test cases for redteam security testing with configurable plugins and strategies

### Configuration & Testing

- **`validate_promptfoo_config`** - Validate configuration files using the same logic as the CLI
- **`test_provider`** - Test AI provider connectivity, credentials, and response quality
- **`run_assertion`** - Test individual assertion rules against outputs for debugging

## Example Workflows

### 1. Basic Evaluation Workflow

Ask your AI assistant:

> "Help me run an evaluation. First, validate my config, then list recent evaluations, and finally run a new evaluation with just the first 5 test cases."

The AI will use these tools in sequence:

1. `validate_promptfoo_config` - Check your configuration
2. `list_evaluations` - Show recent runs
3. `run_evaluation` - Execute with test case filtering

### 2. Provider Comparison

> "Compare the performance of GPT-4, Claude 3, and Gemini Pro on my customer support prompt."

The AI will:

1. `test_provider` - Verify each provider works
2. `compare_providers` - Run side-by-side comparison
3. Analyze results and provide recommendations

### 3. Security Testing

> "Run a security audit on my chatbot prompt to check for jailbreak vulnerabilities."

The AI will:

1. `redteam_generate` - Create adversarial test cases
2. `redteam_run` - Execute security tests
3. `get_evaluation_details` - Analyze vulnerabilities found

### 4. Dataset Generation

> "Generate 20 diverse test cases for my email classification prompt, including edge cases."

The AI will:

1. `generate_dataset` - Create test data with AI
2. `generate_test_cases` - Add appropriate assertions
3. `run_evaluation` - Test the generated cases

## Transport Types

Choose the appropriate transport based on your use case:

- **STDIO (`--transport stdio`)**: For desktop AI tools (Cursor, Claude Desktop) that communicate via stdin/stdout
- **HTTP (`--transport http`)**: For web applications, APIs, and remote integrations that need HTTP endpoints

## Best Practices

### 1. Start Small

Begin with simple tools like `list_evaluations` and `validate_promptfoo_config` before moving to more complex operations.

### 2. Use Filtering

When working with large datasets:

- Filter evaluations by dataset ID
- Use test case indices to run partial evaluations
- Apply prompt/provider filters for focused testing

### 3. Iterative Testing

1. Validate configuration first
2. Test providers individually before comparisons
3. Run small evaluation subsets before full runs
4. Review results with `get_evaluation_details`

### 4. Security First

When using redteam tools:

- Start with basic plugins before advanced attacks
- Review generated test cases before running
- Always analyze results thoroughly

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

## Advanced Usage

### Custom HTTP Integrations

For HTTP transport, you can integrate with any system that supports HTTP:

```javascript
// Example: Call MCP server from Node.js
const response = await fetch('http://localhost:3100/mcp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    method: 'tools/call',
    params: {
      name: 'list_evaluations',
      arguments: { datasetId: 'my-dataset' },
    },
  }),
});
```

### Environment Variables

The MCP server respects all promptfoo environment variables:

```bash
# Set provider API keys
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...

# Configure promptfoo behavior
export PROMPTFOO_CONFIG_DIR=/path/to/configs
export PROMPTFOO_OUTPUT_DIR=/path/to/outputs

# Start server with environment
npx promptfoo@latest mcp --transport stdio
```

## Resources

- [MCP Protocol Documentation](https://modelcontextprotocol.io)
- [Promptfoo Documentation](https://promptfoo.dev)
- [Example Configurations](https://github.com/promptfoo/promptfoo/tree/main/examples)
