# normalized-tools (Cross-Provider Tool Calling)

This example demonstrates how to define tools in OpenAI format and reuse them across multiple providers with automatic transformation.

## Overview

Define tools once in OpenAI format and use them with any provider. The `transformToolsFormat` option automatically converts tools to each provider's native format:

- **OpenAI**: `{ type: 'function', function: { name, parameters } }` (native)
- **Anthropic**: `{ name, input_schema }`
- **AWS Bedrock**: `{ toolSpec: { name, inputSchema: { json } } }`
- **Google**: `{ functionDeclarations: [{ name, parameters }] }`

## Key Features

1. **OpenAI format** - Use OpenAI's tool format as the canonical definition
2. **YAML anchors** - Define tools once with `&tools` and reuse with `*tools`
3. **`transformToolsFormat`** - Automatically convert tools to provider-specific formats
4. **Tool choice** - Control when the model uses tools (`auto`, `required`, `none`, or specific tool)

## Running the Example

```bash
npx promptfoo@latest init --example normalized-tools
cd normalized-tools

# Set your API keys
export OPENAI_API_KEY=your-openai-key
export ANTHROPIC_API_KEY=your-anthropic-key

# Run the evaluation
npx promptfoo@latest eval
```

## Configuration Highlights

```yaml
providers:
  - id: openai:gpt-4o-mini
    config:
      tools: &tools # Define once with YAML anchor
        - type: function
          function:
            name: get_weather
            description: Get the current weather for a location
            parameters:
              type: object
              properties:
                location:
                  type: string
              required:
                - location
      tool_choice: &tool_choice required # Force the model to use a tool

  - id: anthropic:claude-3-5-haiku-latest
    config:
      tools: *tools # Reuse the same tools
      tool_choice: *tool_choice

  # HTTP provider with transformToolsFormat
  - id: https://api.openai.com/v1/chat/completions
    config:
      transformToolsFormat: openai # Auto-transform to target format
      tools: *tools
      tool_choice: *tool_choice
      body:
        model: gpt-4o-mini
        messages:
          - role: user
            content: '{{prompt}}'
        tools: '{{tools}}'
        tool_choice: '{{tool_choice}}'
```

## HTTP Provider with `transformToolsFormat`

The HTTP provider supports automatic tool transformation using the `transformToolsFormat` option. This lets you call any OpenAI-compatible, Anthropic, Bedrock, or Google API endpoint:

```yaml
- id: https://api.anthropic.com/v1/messages
  config:
    transformToolsFormat: anthropic # 'openai' | 'anthropic' | 'bedrock' | 'google'
    tools: *tools # OpenAI-format tools defined elsewhere
    tool_choice: *tool_choice
    body:
      model: claude-3-5-haiku-latest
      messages:
        - role: user
          content: '{{prompt}}'
      tools: '{{tools}}' # Inject transformed tools
      tool_choice: '{{tool_choice}}' # Inject transformed tool_choice
```

The `{{tools}}` and `{{tool_choice}}` template variables are automatically serialized as JSON and populated with the transformed tool definitions in the provider's native format.

## Assertions

The example uses the `tool-call-f1` assertion to verify tool calls:

```yaml
tests:
  - vars:
      location: San Francisco
    assert:
      - type: tool-call-f1
        value: ['get_weather'] # Expected tools to be called
```

The `tool-call-f1` assertion computes an F1 score comparing actual tool calls against expected tools. A score of 1.0 means the model called exactly the expected tools.

## Learn More

- [Tool Calling Documentation](https://promptfoo.dev/docs/configuration/tools)
- [Tool Call Assertions](https://promptfoo.dev/docs/configuration/expected-outputs/deterministic#tool-call-f1)
- [OpenAI Provider](https://promptfoo.dev/docs/providers/openai)
- [Anthropic Provider](https://promptfoo.dev/docs/providers/anthropic)
- [HTTP Provider](https://promptfoo.dev/docs/providers/http)
