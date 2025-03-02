# Adaline Gateway Example

This example demonstrates how to use promptfoo with Adaline's API Gateway for testing multiple vision and language models. It includes several sub-examples showcasing different features and capabilities.

## Quick Start

```bash
npx promptfoo@latest init --example adaline-gateway
```

## Structure

This example contains multiple sub-examples:

- `adaline-chat-history/`: Example demonstrating chat history handling
- `adaline-embedding-similarity/`: Example showing embedding and similarity features
- `adaline-eval-factuality/`: Example for evaluating factuality
- `adaline-multi-provider/`: Example using multiple providers
- `adaline-openai-format/`: Example with OpenAI format compatibility
- `adaline-structured-output/`: Example for structured output generation
- `adaline-tool-call/`: Example demonstrating tool calling capabilities
- `adaline-vision/`: Example for vision-related tasks
- `adaline-vision-base64/`: Example using base64-encoded images

- Configuration file (`promptfooconfig.yaml`)
- Test prompts and cases
- Model-specific settings

## Configuration

1. Set up your Adaline API credentials:

```bash
export ADALINE_API_KEY=your_api_key_here
```

2. Review the configuration in each subdirectory's `promptfooconfig.yaml` to understand:
   - Model selection and parameters
   - Test case setup
   - Input/output formats

## Additional Resources

- [Adaline API Documentation](https://docs.adaline.ai)
- [Vision Testing Guide](https://promptfoo.dev/docs/configuration/image-testing)
- [Configuration Reference](https://promptfoo.dev/docs/configuration/)
