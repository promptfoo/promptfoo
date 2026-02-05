# structured-outputs (Anthropic Structured Outputs)

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
npx promptfoo@latest eval
```

## Features Demonstrated

### JSON Outputs

The first provider configuration shows how to extract structured data from unstructured text using a JSON schema:

```yaml
providers:
  - id: anthropic:messages:claude-sonnet-4-5-20250929
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

The second provider configuration demonstrates how to ensure tool parameters exactly match your schema:

```yaml
providers:
  - id: anthropic:messages:claude-sonnet-4-5-20250929
    config:
      tools:
        - name: book_demo
          strict: true # Enable strict mode
          input_schema:
            type: object
            properties:
              customer_email:
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

## Key Benefits

- **Always valid**: No more `JSON.parse()` errors
- **Type safe**: Guaranteed field types and required fields
- **Reliable**: No retries needed for schema violations
- **Production-ready**: Build agents that work consistently at scale

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

The example includes comprehensive tests:

1. **Schema validation**: Ensures all required fields are present
2. **Data accuracy**: Verifies extracted values match the input
3. **No extra fields**: Confirms `additionalProperties: false` is enforced
4. **Tool calling**: Validates tool names and parameters are correct
5. **Type safety**: Checks that types match schema definitions

## Supported Models

Structured outputs are available for:

- Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`)
- Claude Opus 4.1 (`claude-opus-4-1-20250805`)

## Learn More

- [Anthropic Structured Outputs Documentation](https://docs.anthropic.com/en/docs/build-with-claude/structured-outputs)
- [promptfoo Anthropic Provider Documentation](/docs/providers/anthropic)
