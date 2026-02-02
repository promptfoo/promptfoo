# Tools Configuration

Tools (also known as function calling) allow LLMs to interact with external systems by calling functions you define. This guide covers how to configure tools in a provider-agnostic way that works across all supported providers.

## Overview

Different providers use different formats for tool definitions:

- **OpenAI/Azure/Groq/Ollama**: `{ type: 'function', function: { name, parameters } }`
- **Anthropic**: `{ name, input_schema }`
- **AWS Bedrock**: `{ toolSpec: { name, inputSchema: { json } } }`
- **Google**: `[{ functionDeclarations: [{ name, parameters }] }]`

Promptfoo provides **NormalizedTool** and **NormalizedToolChoice** formats that automatically transform to each provider's native format, allowing you to write portable configurations.

## NormalizedTool Format

The NormalizedTool format is a provider-agnostic way to define tools:

```yaml
providers:
  - id: openai:gpt-4
    config:
      tools:
        - name: get_weather
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

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | The function name (used by the model to call it) |
| `description` | string | No | Description of what the function does |
| `parameters` | object | No | JSON Schema defining the function's parameters |
| `strict` | boolean | No | Enable strict schema validation (OpenAI/Anthropic only) |

### Full JSON Schema Support

The `parameters` field supports full JSON Schema draft-07, including:

```yaml
tools:
  - name: complex_function
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
  - name: get_weather
    strict: true  # Guarantees output matches schema exactly
    parameters:
      type: object
      properties:
        location:
          type: string
      required: [location]
      additionalProperties: false  # Required for strict mode
```

**Provider support:**
- **OpenAI**: Full support - guarantees output matches schema
- **Anthropic**: Enables structured outputs beta feature
- **Bedrock/Google**: Ignored (not supported)

## NormalizedToolChoice Format

Control how the model uses tools with a provider-agnostic format:

```yaml
providers:
  - id: openai:gpt-4
    config:
      tools:
        - name: get_weather
          parameters: { ... }
      tool_choice:
        mode: required  # Model must call a tool
```

### Modes

| Mode | Description |
|------|-------------|
| `auto` | Model decides whether to call a tool (default) |
| `none` | Model cannot call any tools |
| `required` | Model must call at least one tool |
| `tool` | Model must call a specific tool (requires `toolName`) |

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

### NormalizedTool Mappings

When you use NormalizedTool format, it's automatically transformed:

| NormalizedTool | OpenAI | Anthropic | Bedrock | Google |
|----------------|--------|-----------|---------|--------|
| `name` | `function.name` | `name` | `toolSpec.name` | `functionDeclarations[].name` |
| `description` | `function.description` | `description` | `toolSpec.description` | `functionDeclarations[].description` |
| `parameters` | `function.parameters` | `input_schema` | `toolSpec.inputSchema.json` | `functionDeclarations[].parameters` |
| `strict` | `function.strict` | `strict` | _(ignored)_ | _(ignored)_ |

### NormalizedToolChoice Mappings

| Mode | OpenAI | Anthropic | Bedrock | Google |
|------|--------|-----------|---------|--------|
| `auto` | `'auto'` | `{ type: 'auto' }` | `{ auto: {} }` | `{ functionCallingConfig: { mode: 'AUTO' } }` |
| `none` | `'none'` | `{ type: 'auto' }` | _(omitted)_ | `{ functionCallingConfig: { mode: 'NONE' } }` |
| `required` | `'required'` | `{ type: 'any' }` | `{ any: {} }` | `{ functionCallingConfig: { mode: 'ANY' } }` |
| `tool` | `{ type: 'function', function: { name } }` | `{ type: 'tool', name }` | `{ tool: { name } }` | `{ functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [...] } }` |

## Using Native Formats

You can still use provider-native formats - they pass through unchanged:

```yaml
# OpenAI native format (still works)
providers:
  - id: openai:gpt-4
    config:
      tools:
        - type: function
          function:
            name: get_weather
            parameters:
              type: object
              properties:
                location: { type: string }
```

Promptfoo auto-detects the format and only transforms NormalizedTool arrays.

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

For custom HTTP endpoints, use template variables to include tools:

```yaml
providers:
  - id: http://localhost:8080/v1/chat/completions
    config:
      method: POST
      headers:
        Content-Type: application/json
      body:
        model: gpt-4
        messages: '{{ prompt }}'
        tools: '{{ tools | dump }}'
        tool_choice: '{{ tool_choice | dump }}'
      tools:
        - name: get_weather
          parameters:
            type: object
            properties:
              location: { type: string }
      tool_choice:
        mode: required
```

The `{{ tools | dump }}` template renders the tools as JSON in the request body.

## Cross-Provider Example

Here's a complete example that works across multiple providers:

```yaml
prompts:
  - 'What is the weather in {{city}}?'

providers:
  - id: openai:gpt-4
    config:
      tools: &tools  # YAML anchor for reuse
        - name: get_weather
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
      tools: *tools  # Reuse same tools
      tool_choice: *tool_choice

  - id: bedrock:anthropic.claude-3-5-sonnet-20241022-v2:0
    config:
      tools: *tools
      toolChoice: auto  # Bedrock uses camelCase

tests:
  - vars:
      city: San Francisco
    assert:
      - type: is-json
      - type: javascript
        value: output.includes('get_weather')
```

## Migration from Native Formats

### From OpenAI Format

```yaml
# Before (OpenAI native)
tools:
  - type: function
    function:
      name: get_weather
      description: Get weather
      parameters:
        type: object
        properties:
          location: { type: string }

# After (NormalizedTool)
tools:
  - name: get_weather
    description: Get weather
    parameters:
      type: object
      properties:
        location: { type: string }
```

### From Anthropic Format

```yaml
# Before (Anthropic native)
tools:
  - name: get_weather
    description: Get weather
    input_schema:
      type: object
      properties:
        location: { type: string }

# After (NormalizedTool)
tools:
  - name: get_weather
    description: Get weather
    parameters:  # input_schema -> parameters
      type: object
      properties:
        location: { type: string }
```

### From Bedrock Format

```yaml
# Before (Bedrock native)
tools:
  - toolSpec:
      name: get_weather
      description: Get weather
      inputSchema:
        json:
          type: object
          properties:
            location: { type: string }

# After (NormalizedTool)
tools:
  - name: get_weather
    description: Get weather
    parameters:
      type: object
      properties:
        location: { type: string }
```

## See Also

- [OpenAI Provider](/docs/providers/openai) - OpenAI-specific tool features
- [Anthropic Provider](/docs/providers/anthropic) - Anthropic tool calling
- [AWS Bedrock Provider](/docs/providers/aws-bedrock) - Bedrock Converse API tools
- [Google Provider](/docs/providers/google) - Gemini function calling
- [Custom HTTP Provider](/docs/providers/custom-api) - Tools with custom endpoints
