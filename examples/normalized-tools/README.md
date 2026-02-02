# Normalized Tools Example

This example demonstrates how to use promptfoo's normalized tool format to define tools once and reuse them across multiple providers.

## Overview

The normalized tool format provides a provider-agnostic way to define tools that automatically transforms to each provider's native format:

- **OpenAI**: `{ type: 'function', function: { name, parameters } }`
- **Anthropic**: `{ name, input_schema }`
- **AWS Bedrock**: `{ toolSpec: { name, inputSchema: { json } } }`
- **Google**: `{ functionDeclarations: [{ name, parameters }] }`

## Key Features

1. **`normalized: true`** - Required field that enables cross-provider transformation
2. **YAML anchors** - Define tools once with `&tools` and reuse with `*tools`
3. **Tool choice modes** - Control when the model uses tools (`auto`, `required`, `none`, `tool`)

## Running the Example

```bash
# Set your API keys
export OPENAI_API_KEY=your-openai-key
export ANTHROPIC_API_KEY=your-anthropic-key

# Run the evaluation
promptfoo eval
```

## Configuration Highlights

```yaml
providers:
  - id: openai:gpt-4o-mini
    config:
      tools: &tools # Define once with YAML anchor
        - normalized: true # Required for cross-provider support
          name: get_weather
          description: Get the current weather for a location
          parameters:
            type: object
            properties:
              location:
                type: string
            required:
              - location
      tool_choice:
        mode: required # Force the model to use a tool

  - id: anthropic:claude-3-5-haiku-latest
    config:
      tools: *tools # Reuse the same tools
      tool_choice:
        mode: required
```

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
