---
title: Promptfoo MCP Server
description: Use promptfoo as an MCP server to provide AI eval tools to external AI agents and development environments
sidebar_label: MCP Server
sidebar_position: 25
---

# Promptfoo MCP Server

Promptfoo can run as a Model Context Protocol (MCP) server, exposing its eval and testing capabilities as tools that AI agents and development environments can use.

:::info

The MCP server feature is designed to integrate promptfoo with AI development workflows. It exposes promptfoo's eval capabilities through the standardized Model Context Protocol.

:::

## What is the Promptfoo MCP Server?

The MCP server allows external AI tools to:

- **List and analyze evals** from your promptfoo database
- **Validate configurations** before running evals
- **Test AI provider connectivity** and performance
- **Run targeted evals** with specific test cases
- **Share eval results** via public URLs
- **Execute assertions** to test grading logic

This turns promptfoo into an "eval API" that AI agents can use to understand and improve LLM applications.

## Quick Start

### 1. Start the MCP Server

Using the published npm package (recommended):

```bash
# STDIO transport (for MCP clients like Cursor, Claude Desktop)
npx promptfoo@latest mcp --transport stdio

# HTTP transport (for web-based tools and APIs)
npx promptfoo@latest mcp --transport http --port 3100
```

### 2. Configure Your AI Tool

#### Cursor IDE Setup

Create `.cursor/mcp.json` in your project root:

```json title=".cursor/mcp.json"
{
  "mcpServers": {
    "promptfoo": {
      "command": "npx",
      "args": ["promptfoo@latest", "mcp", "--transport", "stdio"],
      "description": "Promptfoo eval and testing tools"
    }
  }
}
```

:::tip

After creating this file, restart Cursor. You'll see "promptfoo" appear in the MCP section of your chat interface.

:::

#### Claude Desktop Setup

Add to your Claude Desktop MCP configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

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

:::tip

Restart Claude Desktop after updating the configuration.

:::

#### Custom AI Agent Setup

For HTTP transport integration:

```bash
# Start the server
npx promptfoo@latest mcp --transport http --port 3100

# Server will be available at:
# - MCP endpoint: http://localhost:3100/mcp
# - Health check: http://localhost:3100/health
# - SSE endpoint: http://localhost:3100/mcp/sse
```

## Available Tools

The promptfoo MCP server provides 11 specialized tools organized by category:

### System Tools

#### `promptfoo_health_check`

Verify server status and connectivity.

- **Parameters**: None
- **Returns**: Server health status, uptime, memory usage, and version information
- **Use case**: Check if the MCP server is running and responsive

### Eval Tools

#### `list_evaluations`

Browse all eval runs with optional filtering.

- **Parameters**:
  - `datasetId` (optional): Filter evals by specific dataset ID
- **Returns**: Array of eval summaries with IDs, descriptions, creation dates, and pass rates
- **Use case**: Get an overview of recent evals, find specific eval runs

#### `get_evaluation_details`

Get detailed results for a specific eval by ID.

- **Parameters**:
  - `id` (required): Unique eval ID (UUID format)
- **Returns**: Complete eval results including test cases, responses, scores, and metadata
- **Use case**: Deep dive into specific eval results, analyze individual test cases

#### `analyze_evaluation_metrics`

Calculate comprehensive statistics and performance metrics.

- **Parameters**:
  - `id` (required): Eval ID to analyze
- **Returns**: Statistical summary including pass/fail rates, performance metrics, token usage, and costs
- **Use case**: Generate eval reports, compare performance across runs

#### `run_evaluation`

Execute evals with custom parameters and filtering.

- **Parameters**:
  - `configPath` (optional): Path to promptfoo configuration file
  - `testCaseIndices` (optional): Specific test cases to run (number, array, or range object)
  - `promptFilter` (optional): Filter to specific prompts by label
  - `providerFilter` (optional): Filter to specific providers by ID
  - `maxConcurrency` (optional): Maximum concurrent evals (1-20)
  - `timeoutMs` (optional): Timeout per eval in milliseconds
- **Returns**: Complete eval results with detailed metrics and test outcomes
- **Use case**: Run targeted evals during development, test specific scenarios

#### `share_evaluation`

Create shareable URLs for eval results.

- **Parameters**:
  - `evalId` (optional): Specific eval ID to share (defaults to latest)
  - `showAuth` (optional): Include authentication info in shared URL
  - `overwrite` (optional): Overwrite existing shared URL
- **Returns**: Public URL for viewing eval results
- **Use case**: Share results with team members, create public reports

### Configuration Tools

#### `validate_promptfoo_config`

Validate configuration files using the same logic as the CLI `validate` command.

- **Parameters**:
  - `configPaths` (optional): Array of configuration file paths to validate
  - `strict` (optional): Enable strict validation mode
- **Returns**: Validation results with errors, warnings, and configuration summary
- **Use case**: Check configuration syntax before running evals, catch errors early

### Provider Tools

#### `test_ai_provider`

Test provider connectivity, response quality, and performance.

- **Parameters**:
  - `provider` (required): Provider ID string or configuration object
  - `testPrompt` (optional): Custom test prompt (defaults to reasoning test)
  - `timeoutMs` (optional): Request timeout in milliseconds (1000-300000)
- **Returns**: Test results including response time, token usage, cost, and response quality
- **Use case**: Verify provider setup, debug connectivity issues, measure performance

### Testing Tools

#### `run_assertion`

Test individual assertions against outputs to debug grading logic.

- **Parameters**:
  - `output` (required): LLM output text to test assertion against
  - `assertion` (required): Assertion configuration object with type, value, threshold, etc.
  - `prompt` (optional): Original prompt for context
  - `vars` (optional): Variables used in the prompt
  - `latencyMs` (optional): Response latency for latency assertions
- **Returns**: Assertion results with pass/fail status, score, reason, and named metrics
- **Use case**: Debug grading logic, test assertion configurations, validate scoring

#### `get_test_prompts`

Retrieve prompts associated with specific test cases.

- **Parameters**:
  - `sha256hash` (required): SHA256 hash of the test case (64 characters)
- **Returns**: Prompt templates and metadata for the specified test case
- **Use case**: Understand test case context, analyze prompt variations, debug issues

#### `list_test_datasets`

Browse all available test datasets.

- **Parameters**: None
- **Returns**: Array of available test datasets with metadata
- **Use case**: Discover available test data, plan new evals, analyze test coverage

## Transport Options

### STDIO Transport

Best for desktop AI tools like Cursor, Claude Desktop, and local AI agents:

```bash
npx promptfoo@latest mcp --transport stdio
```

**Use cases:**

- IDE integrations (Cursor, VS Code with MCP extensions)
- Desktop AI assistants (Claude Desktop, custom agents)
- Local development workflows

### HTTP Transport

Best for web applications, APIs, and remote integrations:

```bash
npx promptfoo@latest mcp --transport http --port 3100
```

**Use cases:**

- Web-based AI tools and dashboards
- Remote API integrations
- Custom web applications
- Microservice architectures

## Example Workflows

### 1. Eval Analysis Workflow

Perfect for post-eval analysis and reporting:

```
1. AI agent calls `list_evaluations` to see recent eval runs
2. AI agent calls `get_evaluation_details` for a specific eval of interest
3. AI agent uses `analyze_evaluation_metrics` to get comprehensive statistics
4. AI agent calls `share_evaluation` to create a shareable report URL
```

### 2. Development Workflow

Ideal for development-time validation and testing:

```
1. AI agent calls `validate_promptfoo_config` to check configuration syntax
2. AI agent uses `test_ai_provider` to verify all providers are accessible
3. AI agent calls `run_evaluation` with specific test cases for quick iteration
4. AI agent analyzes results and suggests configuration improvements
```

### 3. Debugging Workflow

Great for troubleshooting failing evals:

```
1. AI agent calls `run_assertion` to test specific grading logic in isolation
2. AI agent uses `get_test_prompts` to understand the context of failing test cases
3. AI agent suggests fixes based on assertion results and prompt analysis
```

### 4. Quality Assurance Workflow

Perfect for systematic quality checks:

```
1. AI agent calls `list_test_datasets` to understand available test data
2. AI agent uses `run_evaluation` with different provider/prompt combinations
3. AI agent calls `analyze_evaluation_metrics` to compare performance across runs
4. AI agent generates recommendations for the best configurations
```

## Tool Examples

### Testing Provider Connectivity

```javascript
// AI agent can test if providers are working
const result = await mcpClient.callTool('test_ai_provider', {
  provider: 'openai:gpt-4o',
  testPrompt: 'Explain quantum computing in simple terms',
  timeoutMs: 30000,
});
```

### Running Targeted Evals

```javascript
// Run eval on specific test cases
const result = await mcpClient.callTool('run_evaluation', {
  configPath: './promptfooconfig.yaml',
  testCaseIndices: [0, 1, 2], // Only run first 3 tests
  promptFilter: ['my-improved-prompt'],
  maxConcurrency: 2,
});
```

### Validating Configuration

```javascript
// Check config before running expensive evals
const result = await mcpClient.callTool('validate_promptfoo_config', {
  configPaths: ['./promptfooconfig.yaml'],
  strict: true,
});
```

## Integration Examples

### Example: Cursor IDE Workflow

1. **Setup**: Add promptfoo MCP server to `.cursor/mcp.json`
2. **Development**: AI assistant can validate configs as you edit them
3. **Testing**: Run specific test cases to verify prompt improvements
4. **Analysis**: Get detailed metrics and share results with team

### Example: CI/CD Integration

```bash
# In your CI pipeline, start MCP server and validate configs
npx promptfoo@latest mcp --transport http --port 3100 &
MCP_PID=$!

# Your CI tools can now call MCP endpoints to:
# - Validate configurations
# - Run smoke tests on providers
# - Execute key eval scenarios

kill $MCP_PID
```

### Example: Custom Dashboard Integration

```javascript
// Web dashboard calling MCP server via HTTP
const response = await fetch('http://localhost:3100/mcp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'list_evaluations',
      arguments: { datasetId: 'my-dataset' },
    },
    id: 1,
  }),
});
```

## Prerequisites

- **Node.js**: Version 16 or higher
- **Promptfoo**: Available via `npx promptfoo@latest` (automatically downloads latest version)
- **Existing promptfoo setup**: The MCP server uses your existing promptfoo configuration and database

## Authentication & Security

:::warning

The MCP server uses your existing promptfoo configuration and database. For HTTP transport, consider running on localhost only in development environments.

:::

The MCP server uses your existing promptfoo configuration and database:

- **Configuration**: Uses your `promptfooconfig.yaml` and environment variables
- **Database**: Accesses your local promptfoo eval database
- **Providers**: Uses your configured API keys and provider settings
- **Security**: For HTTP transport, consider running on localhost only in development

## Troubleshooting

### Server Won't Start

**Check promptfoo installation:**

```bash
npx promptfoo@latest --version
```

**Verify port availability (HTTP transport):**

```bash
lsof -i :3100  # Check if port is in use
```

**Check promptfoo configuration:**

```bash
npx promptfoo@latest validate
```

### AI Tool Can't Connect

**For STDIO transport:**

- Verify MCP configuration syntax in your AI tool
- Check that the command path is correct: `npx promptfoo@latest`
- Restart your AI tool after configuration changes

**For HTTP transport:**

- Confirm server is running: `curl http://localhost:3100/health`
- Check firewall/network settings
- Verify port number matches your configuration

### Tools Return Errors

**Check database access:**

```bash
npx promptfoo@latest list evals  # Verify database is accessible
```

**Verify eval IDs:**

```bash
npx promptfoo@latest list evals --ids-only  # Get valid eval IDs
```

**Test provider configurations:**

```bash
npx promptfoo@latest eval --no-cache  # Test provider connectivity
```

### Common Error Messages

- **"Eval not found"**: Use `list_evaluations` to get valid eval IDs
- **"Configuration validation error"**: Run `validate_promptfoo_config` to see specific issues
- **"Provider error"**: Use `test_ai_provider` to diagnose connectivity issues
- **"Failed to load default config"**: Ensure you're in a directory with promptfoo setup

## Advanced Usage

### Using with Development Builds

If you're working with a development version of promptfoo:

```bash
# From your promptfoo development directory
npm run build
node dist/src/main.js mcp --transport stdio
```

### Custom Port Configuration

```bash
# Use custom port for HTTP transport
npx promptfoo@latest mcp --transport http --port 8080
```

### Running in Background

```bash
# Start MCP server in background (Unix/macOS)
npx promptfoo@latest mcp --transport http > mcp.log 2>&1 &
echo $! > mcp.pid

# Stop background server
kill $(cat mcp.pid)
```

## See Also

- [Command Line Reference](/docs/usage/command-line#promptfoo-mcp) - Complete MCP command options
- [MCP Client Integration](/docs/integrations/mcp) - Using promptfoo as an MCP client
- [Configuration Reference](/docs/configuration/reference) - Promptfoo configuration options
- [Provider Configuration](/docs/providers/) - Setting up LLM providers
- [Model Context Protocol Specification](https://spec.modelcontextprotocol.io/) - Official MCP documentation
