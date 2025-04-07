# Promptfoo MCP Server

The Promptfoo Model Context Protocol (MCP) server enhances AI coding assistants' ability to understand and work with promptfoo projects by providing contextual information about your evaluation configurations, test cases, and results.

## What is MCP?

Model Context Protocol (MCP) is a protocol that allows AI coding assistants like those in Cursor to access contextual information from your development environment. The promptfoo MCP server provides valuable context about your LLM evaluation and testing configurations.

## Setup with Cursor

To use the promptfoo MCP server with Cursor:

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

4. Save and close the file
5. Ensure the "promptfoo" server is enabled (it should appear green)

## Features

The promptfoo MCP server provides the following capabilities:

- **Config Validation**: Validates promptfoo configuration files against the schema
- **Project Analysis**: Analyzes project structure and identifies configuration files
- **Schema Information**: Provides JSON schema documentation for promptfoo configurations

## API Endpoints

The MCP server exposes the following REST API endpoints:

- `GET /health`: Simple health check endpoint
- `POST /validate`: Validates a promptfoo configuration file
  - Request body: `{ "configPath": "/path/to/config.yaml" }`
- `GET /schema`: Returns the JSON schema for promptfoo configurations
- `GET /project/analyze`: Analyzes the project and returns information about config files

## Running Manually

You can also run the MCP server manually:

```bash
npx promptfoo mcp start
```

Options:

- `-p, --port <port>`: Specify port (default: 3991)
- `-v, --verbose`: Enable verbose logging

## Example Interactions with AI Assistants

Once the MCP server is running, you can ask your AI assistant questions like:

- "Is my promptfoo configuration valid?"
- "Please explain what providers are configured in my promptfoo project"
- "Help me structure my evaluation tests better"
- "What test cases do I have defined?"

The AI assistant will use the MCP server to retrieve contextual information and provide more accurate and helpful responses.

## Troubleshooting

If you encounter issues:

1. Check if the MCP server is running by visiting `http://localhost:3991/health`
2. Try enabling verbose mode: `npx promptfoo mcp start --verbose`
3. Ensure you're using Cursor version 0.47 or later
4. Update promptfoo to the latest version: `npm install -g promptfoo@latest`
