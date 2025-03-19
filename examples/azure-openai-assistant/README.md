# azure-openai-assistant (Azure OpenAI Assistants API with Tools)

Evaluate Azure OpenAI Assistants with file search, function tools, and multi-tool interactions.

## Features

- File search via vector stores
- Custom function tools with simple implementations
- Multi-tool examples with combined capabilities
- Progressive examples from basic to advanced use cases

## Environment Variables

This example requires the following environment variables:

- `AZURE_API_KEY` - Your Azure OpenAI API key

You can set this in a `.env` file or directly in your environment.

## Getting Started

You can run this example with:

```bash
npx promptfoo@latest init --example azure-openai-assistant
```

### Prerequisites

1. An Azure OpenAI account with access to the Assistants API
2. An assistant created in your Azure OpenAI account
3. A vector store for file search functionality (optional)

## Configuration Files

This example includes several configuration files, each demonstrating different tool capabilities:

1. **promptfooconfig.yaml** (default) - File search tool only
2. **promptfooconfig-function.yaml** - Function tool capability with external tool definition and callback
3. **promptfooconfig-multi-tool.yaml** - Combined file search and function tools

### Running Different Configurations

To run the default configuration:

```bash
npx promptfoo@latest eval
```

To run specific configurations:

```bash
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
- External callback loaded from file (`callbacks/weather.js`)
- Test cases demonstrating tool invocation

### Multi-Tool Usage

The multi-tool configuration demonstrates how to combine multiple tools.

Key components:

- External tools definition file (`tools.json`)
- Multiple function callbacks (inline implementation)
- Test cases requiring coordination between different tools

## Customization

To use this example with your own Azure OpenAI Assistant:

1. Update the assistant ID in each configuration file
2. Replace the vector store ID with your own
3. Modify the API host to match your Azure OpenAI endpoint
4. Customize the tools and function callbacks as needed

## External File Approach

This example demonstrates how to organize your configuration using external files:

1. **Tool Definitions** - Stored in JSON files

   ```yaml
   # Load tools from external file
   tools: file://tools/weather-function.json
   ```

2. **Function Callbacks** - Stored in JavaScript files with named exports
   ```yaml
   functionToolCallbacks:
     get_weather: file://callbacks/weather.js:getWeatherData
   ```

The `:getWeatherData` suffix in the function callback path indicates which exported function to use from the JavaScript file. This approach allows you to:

- Export multiple functions from a single file
- Use proper JavaScript syntax with named functions
- Organize related functions in the same file

This separation allows for better organization, code reuse, and easier maintenance of complex configurations.

## Function Callback Implementation

This example demonstrates two ways to implement function callbacks:

1. **External JavaScript file** - Used in `promptfooconfig-function.yaml`

   ```yaml
   functionToolCallbacks:
     get_weather: file://callbacks/weather.js
   ```

2. **Inline function definition** - Used in `promptfooconfig-multi-tool.yaml`
   ```yaml
   functionToolCallbacks:
     get_weather: |
       async function(args) {
         // Implementation...
       }
   ```

Choose the approach that best fits your project structure and complexity.

## Notes

- The file search capability requires a properly configured vector store
- Both tool definitions and function callbacks can be implemented inline or loaded from external files
- For production use, consider more robust error handling
- **File search tool format**: The file search tool must be defined only with `type: "file_search"` without a description field. Adding a description will cause API errors.
