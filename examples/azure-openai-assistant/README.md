# azure-openai-assistant (Azure OpenAI Assistant with Tools)

This example demonstrates how to evaluate an Azure OpenAI Assistant with various tool capabilities, including file search, function tools, and multi-tool interactions.

## Features

- File search using vector stores
- Function tools with simple implementations
- Multi-tool usage examples
- Progressive examples from simple features to more complex ones

## Environment Variables

This example requires the following environment variables:

- `AZURE_API_KEY` - Your Azure OpenAI API key

## Getting Started

You can run this example with:

```bash
npx promptfoo@latest init --example azure-openai-assistant
```

### Prerequisites

1. An Azure OpenAI account with access to the Assistants API
2. An Assistant created in your Azure OpenAI account
3. A vector store for file search functionality (optional)

## Configuration Files

This example includes several configuration files, each demonstrating different tool capabilities:

1. **promptfooconfig.yaml** (default) - Simple file search tool
2. **promptfooconfig-file-search.yaml** - Detailed file search tool
3. **promptfooconfig-function-tool.yaml** - Weather function tool
4. **promptfooconfig-multi-tool.yaml** - Combination of file search and multiple function tools

### Running Different Configurations

To run the basic configuration (default):

```bash
npx promptfoo@latest eval
```

To run specific feature configurations:

```bash
# File search example
npx promptfoo@latest eval -c promptfooconfig-file-search.yaml

# Function tool example
npx promptfoo@latest eval -c promptfooconfig-function-tool.yaml

# Multi-tool example
npx promptfoo@latest eval -c promptfooconfig-multi-tool.yaml
```

## Tool Capabilities

### File Search

The file search configuration demonstrates how to use the vector store-backed file search tool with Azure OpenAI Assistants.

Key components:
- `tools` configuration with `file_search` type
- `tool_resources` with vector store ID
- Test cases focused on information retrieval

### Function Tool

The function tool configuration shows how to define and use a function tool with Azure OpenAI Assistants.

Key components:
- Function tool definition with parameters
- Inline function callback implementation
- Test cases demonstrating tool invocation

### Multi-Tool Usage

The multi-tool configuration demonstrates how to combine multiple tools, load tool definitions from external files, and handle complex requests that require multiple tool calls.

Key components:
- External tools definition file (`tools-simple.json`)
- Multiple function callbacks
- Test cases requiring coordination between different tools

## Customization

To use this example with your own Azure OpenAI Assistant:

1. Update the assistant ID in each configuration file
2. Replace the vector store ID with your own
3. Modify the API host to match your Azure OpenAI endpoint
4. Customize the tools and function callbacks as needed

## Notes

- The file search capability requires a properly configured vector store
- Function callbacks are implemented as simple inline functions
- For production use, consider more robust error handling
