# anthropic/structured-outputs (Anthropic Structured Outputs)

This example demonstrates Anthropic's structured outputs feature, which ensures Claude's responses follow a specific schema. It shows both **JSON outputs** for structured data extraction and **strict tool use** for guaranteed schema validation on tool calls.

## What You'll Learn

- How to use `output_format` to constrain Claude's responses to a JSON schema
- How to use `strict: true` on tools to guarantee type-safe function parameters
- The difference between JSON outputs and strict tool use
- When to use each approach

## Setup

```bash
export ANTHROPIC_API_KEY=your_api_key_here
npx promptfoo@latest init --example anthropic/structured-outputs
cd anthropic/structured-outputs
npx promptfoo@latest eval
```

## Features Demonstrated

### JSON Outputs

The first three providers extract structured data using inline, external, and nested schema files:

```yaml
providers:
  - id: anthropic:messages:claude-sonnet-5
    config:
      output_format:
        type: json_schema
        schema:
          type: object
          properties:
            customer_name:
              type: string
            customer_email:
              type: string
            # ... more fields
          required:
            - customer_name
            - customer_email
          additionalProperties: false
```

**Use JSON outputs when:**

- Extracting data from images or text
- Generating structured reports
- Formatting API responses
- You need Claude's response in a specific format

### Strict Tool Use

The fourth provider requests a `book_demo` tool call with schema-constrained parameters:

```yaml
providers:
  - id: anthropic:messages:claude-sonnet-5
    config:
      tool_choice:
        type: tool
        name: book_demo
      tools:
        - name: book_demo
          strict: true # Enable strict mode
          input_schema:
            type: object
            properties:
              customer_email:
                type: string
              customer_name:
                type: string
              # ... more properties
            required:
              - customer_email
              - customer_name
            additionalProperties: false
```

**Use strict tool use when:**

- Building agentic workflows
- Ensuring type-safe function calls
- Complex tools with many/nested properties
- You need validated parameters and tool names

## Schema Requirements

Both modes share these JSON Schema limitations:

✅ **Supported:**

- Basic types: object, array, string, integer, number, boolean, null
- `enum` (primitives only)
- `required` and `additionalProperties: false`
- Array `minItems` (only 0 and 1)

❌ **Not supported:**

- Recursive schemas
- Numerical constraints (`minimum`, `maximum`)
- String constraints (`minLength`, `maxLength`)
- Complex `{n,m}` quantifiers in regex patterns

## Test Cases

The assertions check that both JSON responses and the requested demo contain the customer's name and email. The API enforces the configured JSON and strict tool schemas.

## Supported Models

The example uses Claude Sonnet 5. Other supported models include:

- Claude Opus 5 (`claude-opus-5`)
- Claude Fable 5 / 5.1 (`claude-fable-5`, `claude-fable-5-1`)
- Claude Opus 4.6–4.8 and Claude Sonnet 4.6
- The 4.5 generation (`claude-opus-4-5`, `claude-sonnet-4-5`, `claude-haiku-4-5`)

## Learn More

- [Anthropic Structured Outputs Documentation](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [promptfoo Anthropic Provider Documentation](/docs/providers/anthropic)
