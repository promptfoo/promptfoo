# OpenAI Function Call Example

This example demonstrates how to use promptfoo to evaluate OpenAI function calls. It showcases two different methods of defining functions:

- Using an external YAML file
- Defining functions directly in the configuration file

## Quick Start

```bash
npx promptfoo@latest init --example openai-function-call
```

## Configuration

1. Set your OpenAI API key:

```bash
export OPENAI_API_KEY=your_api_key_here
```

2. Review the configuration in `promptfooconfig.yaml` to understand:
   - How functions are defined in external YAML
   - How to specify functions inline
   - How to test function call outputs

## Usage

Run the evaluation:

```bash
promptfoo eval
```

View the results in a web interface:

```bash
promptfoo view
```

## Additional Resources

- [OpenAI Function Calling Guide](https://promptfoo.dev/docs/configuration/openai-functions)
- [Function Testing Documentation](https://promptfoo.dev/docs/configuration/function-testing)
- [Configuration Reference](https://promptfoo.dev/docs/configuration/)
