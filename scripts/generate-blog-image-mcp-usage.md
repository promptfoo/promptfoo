# Blog Image Generator - MCP Server Mode

The `generate-blog-image.js` script can run as an MCP server for integration with Cursor or other MCP-compatible tools.

## Running as MCP Server

```bash
node scripts/generate-blog-image.js --mcp-server
```

## Installing MCP Dependencies

If running in MCP mode for the first time:

```bash
npm install @modelcontextprotocol/sdk
```

## Cursor Configuration

Add to your Cursor MCP configuration:

```json
{
  "mcpServers": {
    "blog-image-generator": {
      "command": "node",
      "args": ["/path/to/promptfoo/scripts/generate-blog-image.js", "--mcp-server"],
      "env": {
        "OPENAI_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Available MCP Tools

1. `generate_blog_image` - Generate or edit blog images
2. `get_style_guide` - Get the Promptfoo style guide

The script runs in standard CLI mode by default, and only activates MCP server mode when the `--mcp-server` flag is provided.
