# azure-openai-assistant (Azure OpenAI Assistants API with Tools)

Evaluate Azure OpenAI Assistants with file search, function tools, and multi-tool interactions.

You can run this example with:

```bash
npx promptfoo@latest init --example azure-openai-assistant
```

## Features

- File search via vector stores
- Custom function tools with simple implementations
- Multi-tool examples with combined capabilities
- Progressive examples from basic to advanced use cases

## Environment Variables

This example requires the following environment variables:

- `AZURE_API_KEY` - Your Azure OpenAI API key
- `AZURE_OPENAI_API_HOST` - Your Azure OpenAI API host (e.g., "your-resource-name.openai.azure.com")

You can set these in a `.env` file or directly in your environment.

## Prerequisites

1. An Azure OpenAI account with access to the Assistants API
2. An assistant created in your Azure OpenAI account
3. A vector store for file search functionality (optional)

## Configuration Files

This example includes several configuration files, each demonstrating different tool capabilities:

1. **promptfooconfig-file-search.yaml** - File search tool only
2. **promptfooconfig-function.yaml** - Function tool capability with a weather API implementation
3. **promptfooconfig-multi-tool.yaml** - Combined file search and function tools

### Running Different Configurations

To run a specific configuration:

```bash
# File search example
npx promptfoo@latest eval -c promptfooconfig-file-search.yaml

# Function tool capability example
npx promptfoo@latest eval -c promptfooconfig-function.yaml

# Multi-tool example
npx promptfoo@latest eval -c promptfooconfig-multi-tool.yaml
```

## Tool Capabilities

### File Search

The file search configuration demonstrates how to use vector store-backed file search.

Key components:

- Simple `tools` configuration with `type: "file_search"` (no description field)
- `tool_resources` with vector store ID configuration
- Test cases focused on information retrieval

**Important**: The file search tool must be defined without a description field, as Azure OpenAI API does not support it for this tool type.

### Function Tool

The function tool configuration shows how to define and use custom functions.

Key components:

- Function tool definition loaded from external file (`tools/weather-function.json`)
- External function callback implementation in `callbacks/weather.js`
- Test cases demonstrating tool invocation

### Multi-Tool Usage

The multi-tool configuration demonstrates how to combine multiple tools.

Key components:

- External tools definition file combining file search and function tools
- Multiple inline function callbacks
- Test cases requiring coordination between different tools

## Customization

To use this example with your own Azure OpenAI Assistant:

1. Update the assistant ID in each configuration file (replace `your_assistant_id` with your actual ID)
2. Replace `your_vector_store_id` with your own vector store ID
3. Set the `apiHost` to match your Azure OpenAI endpoint (e.g., "your-resource-name.openai.azure.com")
4. Customize the tools and function callbacks as needed

## Function Implementation Approaches

This example demonstrates two approaches to implementing functions:

### 1. External Tool Definition with External Callback

```yaml
# Load tools from external file
tools: file://tools/weather-function.json

# External file-based callback
functionToolCallbacks:
  get_weather: file://callbacks/weather.js:getWeather
```

### 2. Multiple Tools with Inline Callbacks

For more complex scenarios, you can combine multiple tools and inline function callbacks:

```yaml
# Multiple tools defined
tools: file://tools/multiple-tools.json

# Multiple inline function callbacks
functionToolCallbacks:
  get_weather: |
    async function(args) {
      // Weather function implementation
    }
  suggest_recipe: |
    async function(args) {
      // Recipe function implementation
    }
```

## Documentation

For more information about using Azure OpenAI with promptfoo, including authentication methods, provider types, and configuration options, see the [official Azure provider documentation](https://www.promptfoo.dev/docs/providers/azure/).

## Notes

- The file search capability requires a properly configured vector store
- Both tool definitions and function callbacks can be implemented inline or loaded from external files
- For production use, consider more robust error handling
- **File search tool format**: The file search tool must be defined only with `type: "file_search"` without a description field. Adding a description will cause API errors
- The examples use placeholder values that must be replaced with your actual IDs and endpoints
