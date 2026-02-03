---
sidebar_position: 7
title: Tool Calling
description: Configure tool definitions that work across OpenAI, Anthropic, AWS Bedrock, Google, and other LLM providers
---

# Tool Calling

Tool calling (also known as function calling) lets LLMs request to execute functions you define instead of just generating text.

## Overview

### How It Works

1. **You define tools** - Tell the model what functions are available by providing their names, descriptions, and parameter schemas
2. **Model requests a tool call** - The model outputs a function name and arguments. This name is an identifier that maps to a function in your code—the model doesn't execute anything itself
3. **Your code executes the function** - Your application matches the function name to real code and runs it with the provided arguments
4. **Results go back to the model** - You send the function's output back to the model, which uses it to generate its final response

```
User: "What's the weather in San Francisco?"
    ↓
Model outputs: { tool: "get_weather", args: { location: "San Francisco" } }
    ↓
Your code runs: getWeather("San Francisco") → "72°F, sunny"
    ↓
You send result back to model
    ↓
Model responds: "It's currently 72°F and sunny in San Francisco."
```

### Configuration

There are two parts to configuring tool calling:

1. **Tool definitions** - Describe the functions available to the model: their names, descriptions, and parameter schemas. The model uses these to decide which tool to call and what arguments to pass.

2. **Tool choice** - Control _when_ the model uses tools: let it decide automatically, force it to use a specific tool, or disable tools entirely.

### Cross-Provider Tool Definitions

Promptfoo uses OpenAI's tool format as the standard. When you use `transformToolsFormat`, tools are automatically converted to each provider's native format:

| Provider                 | Native Format                                          |
| ------------------------ | ------------------------------------------------------ |
| OpenAI/Azure/Groq/Ollama | `{ type: 'function', function: { name, parameters } }` |
| Anthropic                | `{ name, input_schema }`                               |
| AWS Bedrock              | `{ toolSpec: { name, inputSchema: { json } } }`        |
| Google                   | `{ functionDeclarations: [{ name, parameters }] }`     |

Define your tools once in OpenAI format and reuse them across all providers:

```yaml
providers:
  - id: openai:gpt-4o
    config:
      tools: &tools # Define once with YAML anchor
        - type: function
          function:
            name: get_weather
            description: Get current weather for a location
            parameters:
              type: object
              properties:
                location: { type: string }
              required: [location]

  - id: anthropic:claude-sonnet-4-20250514
    config:
      tools: *tools # Reuse the same tools

  - id: google:gemini-2.0-flash
    config:
      tools: *tools # Works here too
```

## Defining Tools

Define tools in OpenAI format:

```yaml
providers:
  - id: openai:gpt-4
    config:
      tools:
        - type: function
          function:
            name: get_weather
            description: Get the current weather for a location
            parameters:
              type: object
              properties:
                location:
                  type: string
                  description: City name (e.g., "San Francisco, CA")
                unit:
                  type: string
                  enum: [celsius, fahrenheit]
                  description: Temperature unit
              required:
                - location
```

### Fields

| Field                  | Type    | Required | Description                                             |
| ---------------------- | ------- | -------- | ------------------------------------------------------- |
| `type`                 | string  | Yes      | Must be `'function'`                                    |
| `function.name`        | string  | Yes      | The function name (used by the model to call it)        |
| `function.description` | string  | No       | Description of what the function does                   |
| `function.parameters`  | object  | No       | JSON Schema defining the function's parameters          |
| `function.strict`      | boolean | No       | Enable strict schema validation (OpenAI/Anthropic only) |

### Full JSON Schema Support

The `parameters` field supports full JSON Schema draft-07, including:

```yaml
tools:
  - type: function
    function:
      name: complex_function
      parameters:
        type: object
        properties:
          coordinates:
            $ref: '#/$defs/coordinate'
          tags:
            type: array
            items:
              type: string
            minItems: 1
        required: [coordinates]
        $defs:
          coordinate:
            type: object
            properties:
              lat:
                type: number
                minimum: -90
                maximum: 90
              lon:
                type: number
                minimum: -180
                maximum: 180
            required: [lat, lon]
```

### Strict Mode

Enable strict schema validation for providers that support it:

```yaml
tools:
  - type: function
    function:
      name: get_weather
      strict: true # Guarantees output matches schema exactly
      parameters:
        type: object
        properties:
          location:
            type: string
        required: [location]
        additionalProperties: false # Required for strict mode
```

**Provider support:**

- **OpenAI**: Full support - guarantees output matches schema
- **Anthropic**: Enables structured outputs beta feature
- **Bedrock/Google**: Ignored (not supported)

## Tool Choice

Control how the model uses tools:

```yaml
providers:
  - id: openai:gpt-4
    config:
      tools:
        - type: function
          function:
            name: get_weather
            parameters: { ... }
      tool_choice:
        mode: required # Model must call a tool
```

### Modes

| Mode       | Description                                           |
| ---------- | ----------------------------------------------------- |
| `auto`     | Model decides whether to call a tool (default)        |
| `none`     | Model cannot call any tools                           |
| `required` | Model must call at least one tool                     |
| `tool`     | Model must call a specific tool (requires `toolName`) |

### Examples

```yaml
# Let the model decide
tool_choice:
  mode: auto

# Force the model to use tools
tool_choice:
  mode: required

# Force a specific tool
tool_choice:
  mode: tool
  toolName: get_weather

# Disable tools for this request
tool_choice:
  mode: none
```

## Provider Transformations

### Tool Definition Mappings

When using `transformToolsFormat`, tool definitions are automatically converted:

| OpenAI Field           | Anthropic      | Bedrock                     | Google                               |
| ---------------------- | -------------- | --------------------------- | ------------------------------------ |
| `function.name`        | `name`         | `toolSpec.name`             | `functionDeclarations[].name`        |
| `function.description` | `description`  | `toolSpec.description`      | `functionDeclarations[].description` |
| `function.parameters`  | `input_schema` | `toolSpec.inputSchema.json` | `functionDeclarations[].parameters`  |
| `function.strict`      | _(ignored)_    | _(ignored)_                 | _(ignored)_                          |

### Tool Choice Mappings

| Mode       | OpenAI                                     | Anthropic                | Bedrock              | Google                                                                    |
| ---------- | ------------------------------------------ | ------------------------ | -------------------- | ------------------------------------------------------------------------- |
| `auto`     | `'auto'`                                   | `{ type: 'auto' }`       | `{ auto: {} }`       | `{ functionCallingConfig: { mode: 'AUTO' } }`                             |
| `none`     | `'none'`                                   | `{ type: 'auto' }`       | _(omitted)_          | `{ functionCallingConfig: { mode: 'NONE' } }`                             |
| `required` | `'required'`                               | `{ type: 'any' }`        | `{ any: {} }`        | `{ functionCallingConfig: { mode: 'ANY' } }`                              |
| `tool`     | `{ type: 'function', function: { name } }` | `{ type: 'tool', name }` | `{ tool: { name } }` | `{ functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [...] } }` |

## Other Provider Formats

You can also use provider-native formats directly. They pass through unchanged without transformation:

```yaml
# Anthropic native format - passes through as-is
providers:
  - id: anthropic:claude-sonnet-4-20250514
    config:
      tools:
        - name: get_weather
          description: Get weather
          input_schema:
            type: object
            properties:
              location: { type: string }
```

Promptfoo auto-detects the format. If tools are in OpenAI format (`type: 'function'` with `function.name`), they can be transformed. Otherwise, they pass through unchanged.

## Loading Tools from Files

Tools can be loaded from external files:

```yaml
providers:
  - id: openai:gpt-4
    config:
      tools: file://tools/my-tools.json
```

**tools/my-tools.json:**

```json
[
  {
    "type": "function",
    "function": {
      "name": "get_weather",
      "description": "Get current weather",
      "parameters": {
        "type": "object",
        "properties": {
          "location": { "type": "string" }
        }
      }
    }
  }
]
```

## HTTP Provider with Tools

For custom HTTP endpoints, use the `transformToolsFormat` option to automatically convert OpenAI-format tools to the format your endpoint expects.

### OpenAI-Compatible Endpoints

```yaml
providers:
  - id: http://localhost:8080/v1/chat/completions
    config:
      method: POST
      headers:
        Content-Type: application/json
      transformToolsFormat: openai # Tools already in OpenAI format, pass through
      body:
        model: gpt-4
        messages: '{{ prompt }}'
        tools: '{{ tools | dump }}'
        tool_choice: '{{ tool_choice | dump }}'
      tools:
        - type: function
          function:
            name: get_weather
            description: Get weather for a location
            parameters:
              type: object
              properties:
                location: { type: string }
      tool_choice:
        mode: required
```

### Anthropic-Compatible Endpoints

```yaml
providers:
  - id: http://localhost:8080/v1/messages
    config:
      method: POST
      headers:
        Content-Type: application/json
        x-api-key: '{{ env.ANTHROPIC_API_KEY }}'
        anthropic-version: '2023-06-01'
      transformToolsFormat: anthropic # Transforms OpenAI → Anthropic format
      body:
        model: claude-sonnet-4-20250514
        max_tokens: 1024
        messages: '{{ prompt }}'
        tools: '{{ tools | dump }}'
        tool_choice: '{{ tool_choice | dump }}'
      tools:
        - type: function
          function:
            name: get_weather
            description: Get weather for a location
            parameters:
              type: object
              properties:
                location:
                  type: string
                  description: City name
              required:
                - location
      tool_choice:
        mode: required
```

The `transformToolsFormat` option accepts: `openai`, `anthropic`, `bedrock`, or `google`. The `{{ tools | dump }}` template renders the transformed tools as JSON.

### Native Format Pass-Through

If your endpoint requires a specific format, you can define tools in that format directly and omit `transformToolsFormat`. Tools pass through unchanged:

```yaml
providers:
  - id: http://localhost:8080/v1/messages
    config:
      method: POST
      headers:
        Content-Type: application/json
      # No transformToolsFormat - tools pass through as-is
      body:
        model: claude-sonnet-4-20250514
        messages: '{{ prompt }}'
        tools: '{{ tools | dump }}'
      tools:
        # Native Anthropic format with input_schema
        - name: get_weather
          description: Get weather for a location
          input_schema:
            type: object
            properties:
              location:
                type: string
            required:
              - location
```

This is useful when your endpoint expects a custom or non-standard tool format.

## Cross-Provider Example

Here's a complete example that works across multiple providers:

```yaml
prompts:
  - 'What is the weather in {{city}}?'

providers:
  - id: openai:gpt-4
    config:
      tools: &tools # YAML anchor for reuse
        - type: function
          function:
            name: get_weather
            description: Get current weather for a city
            parameters:
              type: object
              properties:
                location:
                  type: string
                  description: City name
              required: [location]
      tool_choice: &tool_choice
        mode: required

  - id: anthropic:claude-3-5-sonnet-latest
    config:
      tools: *tools # Reuse same tools
      tool_choice: *tool_choice

  - id: bedrock:anthropic.claude-3-5-sonnet-20241022-v2:0
    config:
      tools: *tools
      toolChoice: auto # Bedrock uses camelCase

tests:
  - vars:
      city: San Francisco
    assert:
      - type: is-json
      - type: javascript
        value: output.includes('get_weather')
```

## See Also

- [OpenAI Provider](/docs/providers/openai) - OpenAI-specific tool features
- [Anthropic Provider](/docs/providers/anthropic) - Anthropic tool calling
- [AWS Bedrock Provider](/docs/providers/aws-bedrock) - Bedrock Converse API tools
- [Google Provider](/docs/providers/google) - Gemini function calling
- [Custom HTTP Provider](/docs/providers/custom-api) - Tools with custom endpoints
