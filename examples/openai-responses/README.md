# openai-responses (OpenAI Responses API Examples)

This directory contains examples for testing OpenAI's Responses API with promptfoo.

You can run this example with:

```bash
npx promptfoo@latest init --example openai-responses
```

## Examples

### Basic Responses API (`promptfooconfig.yaml`)

Basic example showing how to use the Responses API with different models and configurations.

### External Response Format (`promptfooconfig.external-format.yaml`)

Example demonstrating how to load `response_format` configuration from external files. This is useful for:

- Reusing complex JSON schemas across multiple configurations
- Managing large schemas in separate files for better organization
- Version controlling schemas independently

This example compares inline vs. external file approach:

- **Inline**: JSON schema defined directly in the config
- **External**: JSON schema loaded from `response_format.json` using `file://` syntax

### Function Calling (`promptfooconfig.function-call.yaml`)

Example demonstrating function calling capabilities with the Responses API.

### Reasoning Models (`promptfooconfig.reasoning.yaml`)

Example showing how to use reasoning models (o1, o3, etc.) with specific configurations.

### Image Processing (`promptfooconfig.image.yaml`)

Example demonstrating image input capabilities with vision models.

### Web Search (`promptfooconfig.web-search.yaml`)

Example showing web search capabilities.

### Codex Models (`promptfooconfig.codex.yaml`)

Example using Codex models for code generation tasks.

### MCP (Model Context Protocol) (`promptfooconfig.mcp.yaml`)

Example demonstrating OpenAI's MCP integration with remote MCP servers. This example uses the DeepWiki MCP server to query GitHub repositories.

#### MCP Features Demonstrated:

- Remote MCP server integration
- Tool filtering with `allowed_tools`
- Approval settings configuration
- Authentication headers (when needed)

## Running the Examples

To run any of these examples:

```bash
# Basic Responses API example
npx promptfoo eval -c promptfooconfig.yaml

# External response format example
npx promptfoo eval -c promptfooconfig.external-format.yaml

# MCP example
npx promptfoo eval -c promptfooconfig.mcp.yaml

# Function calling example
npx promptfoo eval -c promptfooconfig.function-call.yaml

# Reasoning models example
npx promptfoo eval -c promptfooconfig.reasoning.yaml
```

## Prerequisites

- OpenAI API key set in `OPENAI_API_KEY` environment variable
- For MCP examples: Access to remote MCP servers (some may require authentication)

## Notes

- The MCP example uses the public DeepWiki MCP server which doesn't require authentication
- For production use with MCP, carefully review the data being shared with third-party servers
- Some MCP servers may require API keys or authentication tokens in the `headers` configuration
- External file references support both JSON and YAML formats
- External files are resolved relative to the config file location
