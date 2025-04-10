# Cerebras Example

This example demonstrates how to use the Cerebras provider with promptfoo to evaluate Cerebras Inference API models.

You can run this example with:

```bash
npx promptfoo@latest init --example cerebras
```

## Setup

1. Set your Cerebras API key:

```bash
export CEREBRAS_API_KEY="your-api-key-here"
```

2. Run the evaluation:

```bash
promptfoo eval -c config.yaml
```

## Configuration

This repository contains three example configurations demonstrating different Cerebras features:

### Basic Model Evaluation

The base configuration (`config.yaml`) evaluates two Cerebras models on their ability to explain different concepts in simple terms:

- `cerebras:chat:llama3.1-8b` - Llama 3.1 8B model
- `cerebras:chat:llama-3.3-70b` - Llama 3.3 70B model

The prompt template (`prompts.txt`) asks the models to explain concepts from different domains in simple terms that a high school student could understand.

### Structured Outputs

The structured output example (`structured_output.yaml`) demonstrates Cerebras's JSON schema enforcement capabilities. This example uses a schema for recipe data, ensuring the model returns consistent, structured outputs with required fields and proper types.

```bash
promptfoo eval -c structured_output.yaml
```

### Tool Use

The tool use example (`tool_use.yaml`) demonstrates Cerebras's function calling capabilities. It defines a calculator tool that the model can use to solve math problems.

```bash
promptfoo eval -c tool_use.yaml
```

## Learn More

- [Cerebras Provider Documentation](https://promptfoo.dev/docs/providers/cerebras)
- [Cerebras API Reference](https://docs.cerebras.ai/)
- [Cerebras Structured Outputs Guide](https://docs.cerebras.ai/capabilities/structured-outputs/)
- [Cerebras Tool Use Guide](https://docs.cerebras.ai/capabilities/tool-use/) 