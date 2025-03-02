# Tool Use Example

This example demonstrates how to evaluate AI models' tool and function calling capabilities using promptfoo. It includes examples for both OpenAI's function calling and Anthropic's tool use features.

## Quick Start

```bash
npx promptfoo@latest init --example tool-use
```

## Configuration

1. Set up your API credentials:

```bash
# For OpenAI function calling
export OPENAI_API_KEY=your_openai_key_here

# For Anthropic tool use
export ANTHROPIC_API_KEY=your_anthropic_key_here
```

2. Review the example files:
   - `promptfooconfig.yaml`: Main configuration with tool definitions
   - `functions.yaml`: External function definitions
   - Test cases demonstrating tool interactions

## Usage

Run the evaluation:

```bash
promptfoo eval
```

View detailed results:

```bash
promptfoo view
```

## What's Being Tested

This example evaluates:

- Tool calling accuracy and consistency
- Function parameter handling
- Error handling and edge cases
- Tool selection logic
- Response formatting with tools

## Example Structure

The example includes:

- `promptfooconfig.yaml`: Main configuration file
- `functions.yaml`: Function and tool definitions
- Test cases for different tool scenarios
- Provider-specific configurations:
  - OpenAI function calling setup
  - Anthropic tool use configuration

## Implementation Details

The example demonstrates:

- Defining tools and functions
- Configuring tool parameters
- Handling tool responses
- Provider-specific syntax differences
- Best practices for tool evaluation

## Tool Definitions

Example tool configuration:

```yaml
tools:
  - name: get_weather
    description: Get the current weather
    parameters:
      type: object
      properties:
        location:
          type: string
          description: City name or coordinates
        unit:
          type: string
          enum: [celsius, fahrenheit]
```

## Additional Resources

- [Function Calling Guide](https://promptfoo.dev/docs/configuration/function-calling)
- [Tool Use Documentation](https://promptfoo.dev/docs/configuration/tool-use)
- [OpenAI Functions](https://platform.openai.com/docs/guides/function-calling)
- [Claude Tool Use](https://docs.anthropic.com/claude/docs/tool-use)
- [Configuration Reference](https://promptfoo.dev/docs/configuration/)
