# Cohere Integration Example

This example demonstrates how to use promptfoo with Cohere's language models for evaluating and testing AI responses. It showcases Cohere's unique capabilities and model configurations.

## Quick Start

```bash
npx promptfoo@latest init --example cohere
```

## Configuration

1. Set up your Cohere credentials:

```bash
export COHERE_API_KEY=your_key_here
```

2. Configure your evaluation:
   - Review `promptfooconfig.yaml` for model settings
   - Adjust test cases and assertions
   - Set up custom evaluation metrics

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

- Response quality and coherence
- Model parameter optimization
- Command vs. Generate endpoints
- Custom prompt configurations

## Example Structure

The example includes:

- `promptfooconfig.yaml`: Main configuration file
- Test prompts and scenarios
- Custom evaluation metrics
- Model-specific settings

## Additional Resources

- [Cohere API Documentation](https://docs.cohere.com/)
- [Cohere Provider Guide](https://promptfoo.dev/docs/providers/cohere)
- [Configuration Reference](https://promptfoo.dev/docs/configuration/)
