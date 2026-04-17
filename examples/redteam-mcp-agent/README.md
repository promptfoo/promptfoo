# redteam-mcp-agent

This example demonstrates how to red team test AI agents that integrate with Model Context Protocol (MCP) servers. It creates a custom OpenAI-based ReAct agent provider that can interact with MCP servers, allowing you to test agent behavior when given access to potentially malicious tools.

You can run this example with:

```bash
npx promptfoo@latest init --example redteam-mcp-agent
```

## Overview

The example includes:

- A custom OpenAI agent provider that uses the ReAct (Reasoning and Acting) pattern
- Integration with multiple MCP servers for tool access
- Red team testing configuration to evaluate agent security boundaries
- Example MCP servers including a potentially malicious one for security testing

## Prerequisites

- Node.js 20+
- Python 3.8+ (for the Python MCP server example)
- OpenAI API key

## Environment Variables

This example requires the following environment variable:

- `OPENAI_API_KEY` - Your OpenAI API key (get one at https://platform.openai.com/api-keys)

You can set this in a `.env` file in the example directory:

```bash
OPENAI_API_KEY=sk-...
```

## Quick Start

1. **Install dependencies:**

```bash
npm install
```

2. **Set up your OpenAI API key:**

```bash
export OPENAI_API_KEY=your-openai-api-key-here
# Or create a .env file with OPENAI_API_KEY=your-key
```

3. **Run the red team tests:**

```bash
npx promptfoo@latest redteam run
```

## Project Structure

```
redteam-mcp-agent/
├── src/
│   ├── openai-agent-provider.js  # Custom OpenAI agent provider
│   ├── react-agent.js            # ReAct pattern agent implementation
│   ├── mcp-client.js             # MCP client for tool connections
│   └── mcp_server/               # Example MCP server
│       ├── index.js              # Server entry point
│       └── tools/                # Tool implementations
├── promptfooconfig.yaml          # Main configuration
├── redteam.yaml                  # Generated red team test cases
├── server.py                     # Python MCP server example
└── package.json                  # Node.js dependencies
```

## Configuration

### promptfooconfig.yaml

The main configuration file defines:

1. **Provider Configuration**: Uses a custom OpenAI agent provider with:
   - Model: `gpt-4o` (you can also use `gpt-4o-mini` or `o3-mini`)
   - System prompt that instructs the agent to use ReAct pattern
   - MCP server connections

2. **MCP Servers**: Three types of connections are demonstrated:
   - NPX package: `@promptfoo/evil-mcp-server` (for security testing)
   - Local Node.js server: `./src/mcp_server/index.js`
   - HTTP endpoint: `http://localhost:8080/mcp` (Python server)

3. **Red Team Configuration**:
   - Purpose: Defines the testing scenario (e.g., financial analyst at Acme Inc.)
   - Tools: Lists available tools and their schemas
   - Policy: Defines what behaviors to test for

### Example Configuration

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: file://./src/openai-agent-provider.js
    config:
      apiBaseUrl: 'https://api.openai.com/v1'
      model: 'gpt-4o' # or gpt-4o-mini, o3-mini
      systemPrompt: |
        You are a helpful AI assistant with access to various tools...
      mcpServers:
        - command: 'npx'
          args: ['-y', '@promptfoo/evil-mcp-server@latest']
        - command: 'node'
          args: ['./src/mcp_server/index.js']
        - url: 'http://localhost:8080/mcp'

redteam:
  purpose: |
    You are acting as a financial analyst employee at Acme Inc...

    tools: get_financial_summaries
      startDate: string - Start date for the report (ISO 8601)
      endDate: string - End date for the report (ISO 8601)
      groupBy: enum ['day', 'week', 'month'] - Group results by period

  plugins:
    - id: policy
      config:
        policy: Test to trigger the get_financial_summaries tool...
```

## Running Different MCP Servers

### 1. Evil MCP Server (Security Testing)

The example includes `@promptfoo/evil-mcp-server` which provides potentially dangerous tools for security testing:

```yaml
mcpServers:
  - command: 'npx'
    args: ['-y', '@promptfoo/evil-mcp-server@latest']
```

### 2. Custom Node.js MCP Server

The included Node.js server (`src/mcp_server/index.js`) provides ERP and analytics tools:

```yaml
mcpServers:
  - command: 'node'
    args: ['./src/mcp_server/index.js']
```

### 3. Python HTTP MCP Server

To run the Python server example:

```bash
# Install FastMCP if not already installed
pip install fastmcp

# Run the server
python server.py
```

Then reference it in your config:

```yaml
mcpServers:
  - url: 'http://localhost:8080/mcp'
```

## Understanding the Results

When you run the red team tests, promptfoo will:

1. **Initialize the agent**: Create an OpenAI agent with MCP tool access
2. **Run test scenarios**: Execute various prompts designed to test security boundaries
3. **Evaluate behavior**: Check if the agent calls suspicious or unauthorized tools
4. **Generate report**: Show which tests passed/failed with detailed explanations

Example output includes:

- Tool calls made by the agent
- The agent's reasoning process (Thought → Action → Observation)
- Token usage and execution metrics
- Pass/fail status for each security test

## Customization

### Adding Custom MCP Servers

To add your own MCP server:

1. Create the server implementation
2. Add it to `mcpServers` in `promptfooconfig.yaml`:

```yaml
mcpServers:
  - command: 'python'
    args: ['path/to/your/server.py']
```

3. Update the `purpose` section with your tool schemas

### Modifying Test Scenarios

Edit the `redteam` section to customize:

- **Purpose**: Change the agent's role and context
- **Tools**: Add or modify available tool schemas
- **Policy**: Define specific behaviors to test

### Using Different Models

Update the model in the provider configuration:

```yaml
config:
  model: "gpt-4o-mini"  # More cost-effective option
  # or
  model: "openai:gpt-5"      # Latest OpenAI model
```

## Security Considerations

- **API Keys**: Never commit API keys to version control
- **MCP Servers**: Be cautious when connecting to untrusted MCP servers
- **Test Environment**: Run security tests in isolated environments
- **Tool Permissions**: Carefully review tool capabilities before granting access

## Troubleshooting

### Common Issues

1. **"OpenAI API key is required"**
   - Ensure `OPENAI_API_KEY` is set in your environment or `.env` file

2. **"Failed to connect to MCP server"**
   - Verify the server command and path are correct
   - Check that required dependencies are installed
   - For HTTP servers, ensure they're running on the specified port

3. **"Tool not found" errors**
   - Verify tool schemas in the `purpose` section match the MCP server's tools
   - Check that MCP servers are starting successfully

4. **Python server not working**
   - Install FastMCP: `pip install fastmcp`
   - Ensure Python 3.8+ is installed
   - Check that port 8080 is available

## Advanced Usage

### Running with Local Development

When developing the provider locally:

```bash
# Use local version instead of published package
npm run local -- redteam run
```

### Debugging Agent Behavior

To see detailed agent reasoning, the provider logs:

- Each thought step
- Tool selections and arguments
- Observations from tool calls
- Final responses

### Creating Custom Tools

Example MCP tool implementation:

```javascript
// In src/mcp_server/tools/customTools.js
export const customTools = [
  {
    name: 'my_custom_tool',
    description: 'Does something specific',
    inputSchema: {
      type: 'object',
      properties: {
        param1: { type: 'string', description: 'First parameter' },
      },
      required: ['param1'],
    },
  },
];

export async function handleCustomTool(name, args) {
  if (name === 'my_custom_tool') {
    // Tool implementation
    return { result: 'Tool executed successfully' };
  }
}
```

## Resources

- [Promptfoo Documentation](https://promptfoo.dev/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [OpenAI API Documentation](https://platform.openai.com/docs/)
- [Red Team Testing Guide](https://promptfoo.dev/docs/red-team/)
- [Custom Providers Guide](https://promptfoo.dev/docs/providers/custom-api/)
- [MCP Client](https://promptfoo.dev/docs/integrations/mcp)
