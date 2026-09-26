---
sidebar_position: 7
title: Tool Calling
description: Configure tool definitions that work across OpenAI, Anthropic, AWS Bedrock, Google, and other LLM providers
---

# Tool Calling

Tool calling (also known as function calling) allows LLMs to invoke functions that you define, rather than only generating text responses.

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

Tool definitions use different shapes depending on the provider and endpoint:

| Provider                        | Native Format                                          |
| ------------------------------- | ------------------------------------------------------ |
| OpenAI/Azure Responses          | `{ type: 'function', name, parameters }`               |
| OpenAI/Azure Chat, Groq, Ollama | `{ type: 'function', function: { name, parameters } }` |
| Anthropic                       | `{ name, input_schema }`                               |
| AWS Bedrock Converse            | `{ toolSpec: { name, inputSchema: { json } } }`        |
| Google                          | `{ functionDeclarations: [{ name, parameters }] }`     |

Use the flat Responses format for OpenAI Responses requests. For tools shared across providers, Promptfoo accepts the nested Chat Completions format and converts it for Responses, Anthropic, Bedrock, and Google. For the [HTTP provider](/docs/providers/http), set `transformToolsFormat` to select a supported target format.

### Reusing tools between providers

Define your tools once in the nested Chat Completions format and reuse them across supported providers using [YAML anchors and aliases](https://yaml.org/spec/1.2.2/#3222-anchors-and-aliases). An anchor (`&tools`) saves a value, and an alias (`*tools`) references it elsewhere:

```yaml
providers:
  - id: openai:responses:gpt-6-luna
    config:
      tools: &tools # Anchor: define tools once
        - type: function
          function:
            name: get_weather
            description: Get current weather for a location
            parameters:
              type: object
              properties:
                location: { type: string }
              required: [location]

  - id: anthropic:claude-sonnet-4-6
    config:
      tools: *tools # Alias: reuse the same tools

  - id: google:gemini-2.5-flash
    config:
      tools: *tools # Alias: works here too
```

## Defining Tools

Define tools in the flat Responses format:

```yaml
providers:
  - id: openai:responses:gpt-6-sol
    config:
      tools:
        - type: function
          name: get_weather
          description: Get the current weather for a location
          strict: false # Keep unit optional
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

The `strict: false` setting preserves optional fields instead of letting Responses [normalize the schema into strict mode](https://developers.openai.com/api/docs/guides/function-calling#strict-mode). See [Strict Mode](#strict-mode) for an enforced schema.

### Fields

| Field         | Type    | Required | Description                                      |
| ------------- | ------- | -------- | ------------------------------------------------ |
| `type`        | string  | Yes      | Must be `'function'`                             |
| `name`        | string  | Yes      | The function name (used by the model to call it) |
| `description` | string  | No       | Description of what the function does            |
| `parameters`  | object  | No       | JSON Schema defining the function's parameters   |
| `strict`      | boolean | No       | Enable strict schema validation                  |

### Full JSON Schema Support

The `parameters` field contains a JSON Schema. Supported keywords depend on the provider and model; this example uses a reusable object definition:

```yaml
tools:
  - type: function
    name: complex_function
    strict: false # Keep tags optional
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
    name: get_weather
    strict: true # Require function arguments to match the schema
    parameters:
      type: object
      properties:
        location:
          type: string
      required: [location]
      additionalProperties: false # Required for strict mode
```

**Native strict mode support:**

| Provider                | Support                                            |
| ----------------------- | -------------------------------------------------- |
| OpenAI                  | Full support — function arguments match the schema |
| Anthropic               | Set `strict` in Anthropic's native tool format     |
| Bedrock Converse/Google | Ignored (not supported)                            |

## Tool Choice

Tool choice controls _when_ and _how_ the model uses the tools you've defined. By default, the model decides on its own whether a tool call is appropriate (`auto`). You can override this to force tool usage, disable it, or constrain the model to a specific tool — useful for testing that the model calls the right function or for pipelines where a tool call is always expected.

```yaml
providers:
  - id: openai:responses:gpt-6-sol
    config:
      tools:
        - type: function
          name: get_weather
          parameters:
            type: object
            properties:
              location: { type: string }
            required: [location]
            additionalProperties: false
      tool_choice: required # Model must call a tool
```

### Modes

These examples use the Responses format:

| Value                                   | Description                                                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `auto`                                  | Model decides whether to call a tool based on the prompt (default)                                               |
| `none`                                  | Model cannot call any tools, even if they are defined — useful for A/B testing tool use vs. plain text responses |
| `required`                              | Model must call at least one tool — useful when you always expect a structured tool response                     |
| `{ type: function, name: get_weather }` | Model must call the specified tool — useful for testing a particular function                                    |

### Examples

```yaml
# Let the model decide
tool_choice: auto

# Force the model to use tools
tool_choice: required

# Force a specific tool
tool_choice:
  type: function
  name: get_weather

# Disable tools for this request
tool_choice: none
```

## Provider Transformations

### Tool Definition Mappings

For built-in providers, tool definitions in the nested Chat Completions format are automatically converted to the provider's native format. For the [HTTP provider](/docs/providers/http), set `transformToolsFormat` to specify the target format. Definitions in other formats pass through without transformation.

| Chat Completions Field | Anthropic      | Bedrock Converse            | Google                               |
| ---------------------- | -------------- | --------------------------- | ------------------------------------ |
| `function.name`        | `name`         | `toolSpec.name`             | `functionDeclarations[].name`        |
| `function.description` | `description`  | `toolSpec.description`      | `functionDeclarations[].description` |
| `function.parameters`  | `input_schema` | `toolSpec.inputSchema.json` | `functionDeclarations[].parameters`  |
| `function.strict`      | _(ignored)_    | _(ignored)_                 | _(ignored)_                          |

### Tool Choice Mappings

| Chat Completions                           | Anthropic                | Bedrock Converse     | Google                                                                    |
| ------------------------------------------ | ------------------------ | -------------------- | ------------------------------------------------------------------------- |
| `'auto'`                                   | `{ type: 'auto' }`       | `{ auto: {} }`       | `{ functionCallingConfig: { mode: 'AUTO' } }`                             |
| `'none'`                                   | `{ type: 'none' }`       | _(omitted)_          | `{ functionCallingConfig: { mode: 'NONE' } }`                             |
| `'required'`                               | `{ type: 'any' }`        | `{ any: {} }`        | `{ functionCallingConfig: { mode: 'ANY' } }`                              |
| `{ type: 'function', function: { name } }` | `{ type: 'tool', name }` | `{ tool: { name } }` | `{ functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [...] } }` |

## Other Provider Formats

You can also use provider-native formats directly. They pass through unchanged without transformation:

```yaml
# Anthropic native format - passes through as-is
providers:
  - id: anthropic:claude-sonnet-4-6
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

Tools can be loaded from external files. Use the format expected by your endpoint:

```yaml
providers:
  - id: openai:responses:gpt-6-sol
    config:
      tools: file://tools/my-tools.json
```

**tools/my-tools.json:**

```json
[
  {
    "type": "function",
    "name": "get_weather",
    "description": "Get current weather",
    "parameters": {
      "type": "object",
      "properties": {
        "location": { "type": "string" }
      }
    }
  }
]
```

## HTTP Provider with Tools

For custom HTTP endpoints, use the `transformToolsFormat` option to automatically convert OpenAI-format tools to the format your endpoint expects.

### OpenAI-Compatible Endpoints

This example targets Chat Completions, so it uses nested function definitions. GPT-6 Sol and Luna require `reasoning_effort: none` for Chat function calls; use Responses for tool calls with reasoning.

```yaml
providers:
  - id: http://localhost:8080/v1/chat/completions
    config:
      method: POST
      headers:
        Content-Type: application/json
      transformToolsFormat: openai # Tools already in OpenAI format, pass through
      body:
        model: gpt-6-sol
        reasoning_effort: none
        messages: '{{ prompt }}'
        tools: '{{ tools }}'
        tool_choice: '{{ tool_choice }}'
      tools:
        - type: function
          function:
            name: get_weather
            description: Get weather for a location
            parameters:
              type: object
              properties:
                location: { type: string }
      tool_choice: required
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
        model: claude-sonnet-4-6
        max_tokens: 1024
        messages: '{{ prompt }}'
        tools: '{{ tools }}'
        tool_choice: '{{ tool_choice }}'
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
      tool_choice: required
```

The `transformToolsFormat` option accepts: `openai`, `anthropic`, `bedrock`, or `google`. The `{{ tools }}` and `{{ tool_choice }}` template variables are automatically serialized as JSON when injected into the request body.

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
        model: claude-sonnet-4-6
        messages: '{{ prompt }}'
        tools: '{{ tools }}'
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

## See Also

- [OpenAI Provider](/docs/providers/openai) - OpenAI-specific tool features
- [Anthropic Provider](/docs/providers/anthropic) - Anthropic tool calling
- [AWS Bedrock Provider](/docs/providers/aws-bedrock) - Bedrock Converse API tools
- [Google Provider](/docs/providers/google) - Gemini function calling
- [Custom HTTP Provider](/docs/providers/custom-api) - Tools with custom endpoints
